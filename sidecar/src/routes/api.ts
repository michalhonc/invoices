import { Hono } from "hono";
import {
  getSettings,
  getDb,
  updateSettings,
  listMonths,
  listInvoices,
  getInvoice,
  getInvoiceData,
  upsertInvoiceData,
  deleteInvoice,
  getMonthlySummary,
  getAllMonthlySummaries,
  getKhSubmission,
  createKhSubmission,
  updateKhSubmissionStatus,
  createInvoice,
  type InvoiceData,
} from "../db";
import { scanAllMonths, ensureFolderStructure } from "../watcher";
import { parseIsdoc, parseCsv, type ParsedInvoiceData } from "../parsers";
import { runOcr, checkOllamaStatus } from "../ocr";
import { classifyKhSection } from "../kh/classifier";
import { generateKhXml, type KhGenerationInput } from "../kh/generator";
import { writeFile, readFile, copyFile, mkdir } from "fs/promises";
import { join, extname, basename } from "path";

const api = new Hono();

type OcrQueueStatus = "queued" | "running" | "done";

interface OcrQueueJob {
  id: string;
  status: OcrQueueStatus;
  created_at: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  current_invoice_id: string | null;
  invoice_ids: string[];
  errors: Record<string, string>;
}

const ocrQueueJobs = new Map<string, OcrQueueJob>();
const ocrQueueOrder: string[] = [];
const ocrInvoicesInFlight = new Set<string>();
let ocrWorkerRunning = false;

async function runOcrQueueWorker() {
  if (ocrWorkerRunning) return;
  ocrWorkerRunning = true;

  try {
    while (ocrQueueOrder.length > 0) {
      const jobId = ocrQueueOrder.shift();
      if (!jobId) continue;
      await processOcrQueue(jobId);
    }
  } finally {
    ocrWorkerRunning = false;
  }
}

function scheduleOcrJob(jobId: string) {
  ocrQueueOrder.push(jobId);
  void runOcrQueueWorker();
}

async function processOcrQueue(jobId: string) {
  const job = ocrQueueJobs.get(jobId);
  if (!job || job.status !== "queued") return;

  job.status = "running";
  for (const invoiceId of job.invoice_ids) {
    job.current_invoice_id = invoiceId;

    if (ocrInvoicesInFlight.has(invoiceId)) {
      job.skipped += 1;
      continue;
    }

    const invoice = getInvoice(invoiceId);
    if (!invoice) {
      job.failed += 1;
      job.errors[invoiceId] = "Invoice not found";
      continue;
    }

    const existing = getInvoiceData(invoiceId);
    if (existing?.manually_verified || existing?.ocr_confidence) {
      job.skipped += 1;
      continue;
    }

    try {
      ocrInvoicesInFlight.add(invoiceId);
      const result = await runOcr(invoice.file_path);
      await saveExtractedData(invoiceId, result.data, result.confidence, result.raw_response);
      job.done += 1;
    } catch (error) {
      job.failed += 1;
      job.errors[invoiceId] = error instanceof Error ? error.message : String(error);
    } finally {
      ocrInvoicesInFlight.delete(invoiceId);
    }
  }

  job.current_invoice_id = null;
  job.status = "done";
}

// ─── Health ──────────────────────────────────────────────

api.get("/health", async (c) => {
  const ollama = await checkOllamaStatus();
  return c.json({
    status: "ok",
    ollama,
    timestamp: new Date().toISOString(),
  });
});

// ─── Settings ────────────────────────────────────────────

api.get("/settings", (c) => {
  return c.json(getSettings());
});

api.put("/settings", async (c) => {
  const body = await c.req.json();
  const updated = updateSettings(body);
  return c.json(updated);
});

api.get("/ares/:ico", async (c) => {
  const ico = c.req.param("ico").replace(/\s/g, "");
  if (!/^\d{7,8}$/.test(ico)) {
    return c.json({ error: "Neplatné IČO" }, 400);
  }

  try {
    const response = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      return c.json({ error: `ARES lookup failed (${response.status})` }, 502);
    }

    const payload = (await response.json()) as {
      ico?: string;
      dic?: string;
      obchodniJmeno?: string;
      sidlo?: {
        nazevUlice?: string;
        cisloDomovni?: string;
        cisloOrientacni?: string;
        nazevObce?: string;
        psc?: string;
      };
    };

    const sidlo = payload.sidlo;
    const ulice = sidlo
      ? `${sidlo.nazevUlice ?? ""} ${sidlo.cisloDomovni ?? ""}${sidlo.cisloOrientacni ? `/${sidlo.cisloOrientacni}` : ""}`.trim()
      : null;

    return c.json({
      ico: payload.ico ?? ico,
      dic: payload.dic ?? null,
      nazev: payload.obchodniJmeno ?? null,
      ulice,
      obec: sidlo?.nazevObce ?? null,
      psc: sidlo?.psc ?? null,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

api.get("/vies/:vat", async (c) => {
  const vat = c.req.param("vat").replace(/\s/g, "").toUpperCase();
  const match = vat.match(/^([A-Z]{2})([A-Z0-9]{2,14})$/);
  if (!match) {
    return c.json({ valid: false, error: "Neplatný formát VAT" }, 400);
  }

  try {
    const response = await fetch(`https://api.vatcomply.com/vat?vat_number=${encodeURIComponent(vat)}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return c.json({ valid: false, error: `VIES lookup failed (${response.status})` }, 502);
    }

    const payload = (await response.json()) as {
      valid?: boolean;
      company_name?: string;
      company_address?: string;
    };

    return c.json({
      vat,
      valid: payload.valid ?? false,
      company_name: payload.company_name ?? null,
      company_address: payload.company_address ?? null,
    });
  } catch (error) {
    return c.json({ valid: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// ─── Months ──────────────────────────────────────────────

api.get("/months", (c) => {
  const summaries = getAllMonthlySummaries();
  return c.json(summaries);
});

api.get("/months/:month", (c) => {
  const month = c.req.param("month");
  const summary = getMonthlySummary(month);
  return c.json(summary);
});

api.get("/months/:month/invoices", (c) => {
  const month = c.req.param("month");
  const invoices = listInvoices(month);

  // Attach invoice_data to each invoice
  const result = invoices.map((inv) => ({
    ...inv,
    data: getInvoiceData(inv.id),
  }));

  return c.json(result);
});

api.get("/years/:year", (c) => {
  const year = c.req.param("year");
  if (!/^\d{4}$/.test(year)) {
    return c.json({ error: "Neplatný rok" }, 400);
  }

  const summaries = getAllMonthlySummaries().filter((m) => m.month.startsWith(`${year}-`));
  const totals = summaries.reduce(
    (acc, m) => {
      acc.incoming_count += m.incoming_count;
      acc.outgoing_count += m.outgoing_count;
      acc.incoming_total += m.incoming_total;
      acc.outgoing_total += m.outgoing_total;
      acc.dan_na_vystupu += m.dan_na_vystupu;
      acc.dan_na_vstupu += m.dan_na_vstupu;
      acc.dph_difference += m.dph_difference;
      acc.verified_count += m.verified_count;
      acc.total_count += m.total_count;
      acc.ocr_eligible_count += m.ocr_eligible_count;
      acc.ocr_ok_count += m.ocr_ok_count;
      return acc;
    },
    {
      incoming_count: 0,
      outgoing_count: 0,
      incoming_total: 0,
      outgoing_total: 0,
      dan_na_vystupu: 0,
      dan_na_vstupu: 0,
      dph_difference: 0,
      verified_count: 0,
      total_count: 0,
      ocr_eligible_count: 0,
      ocr_ok_count: 0,
    }
  );

  return c.json({ year, months: summaries, totals });
});

api.get("/search", (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const month = (c.req.query("month") ?? "").trim();
  const direction = (c.req.query("direction") ?? "").trim();

  if (!q && !month && !direction) {
    return c.json([]);
  }

  const pattern = `%${q}%`;
  const rows = getDb()
    .query(
      `SELECT i.*, d.cislo_faktury, d.dodavatel_nazev, d.odberatel_nazev, d.celkem, d.mena
       FROM invoices i
       LEFT JOIN invoice_data d ON d.invoice_id = i.id
       WHERE
         (? = '' OR i.month = ?)
         AND (? = '' OR i.direction = ?)
         AND (
           ? = '' OR
           i.file_name LIKE ? OR
           COALESCE(d.cislo_faktury, '') LIKE ? OR
           COALESCE(d.dodavatel_nazev, '') LIKE ? OR
           COALESCE(d.odberatel_nazev, '') LIKE ? OR
           CAST(COALESCE(d.celkem, 0) AS TEXT) LIKE ?
         )
       ORDER BY i.month DESC, i.file_name ASC
       LIMIT 50`
    )
    .all(month, month, direction, direction, q, pattern, pattern, pattern, pattern, pattern);

  return c.json(rows);
});

// ─── Scan ────────────────────────────────────────────────

api.post("/scan", async (c) => {
  await ensureFolderStructure();
  const result = await scanAllMonths();
  return c.json(result);
});

// ─── Upload ──────────────────────────────────────────────

api.post("/months/:month/upload", async (c) => {
  const month = c.req.param("month");
  const direction = c.req.query("direction") ?? "incoming";
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  const settings = getSettings();
  const destDir = join(settings.icloud_base_path, month, direction);
  await mkdir(destDir, { recursive: true });

  const destPath = join(destDir, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(destPath, buffer);

  const ext = extname(file.name).toLowerCase().replace(".", "");
  const id = crypto.randomUUID();

  const invoice = createInvoice({
    id,
    file_path: destPath,
    file_name: file.name,
    file_type: ext,
    month,
    direction: direction as "incoming" | "outgoing",
  });

  // Auto-parse structured formats
  if (ext === "isdoc" || ext === "xml") {
    try {
      const parsed = await parseIsdoc(destPath);
      await saveExtractedData(id, parsed, 1.0);
    } catch (e) {
      console.error(`Failed to parse ISDOC/XML: ${e}`);
    }
  }

  return c.json(invoice, 201);
});

// ─── Invoices ────────────────────────────────────────────

api.get("/invoices/:id", (c) => {
  const id = c.req.param("id");
  const invoice = getInvoice(id);
  if (!invoice) return c.json({ error: "Not found" }, 404);

  const data = getInvoiceData(id);
  return c.json({ ...invoice, data });
});

api.put("/invoices/:id", async (c) => {
  const id = c.req.param("id");
  const invoice = getInvoice(id);
  if (!invoice) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json();
  const existingData = getInvoiceData(id);

  const data: Omit<InvoiceData, "created_at" | "updated_at"> = {
    id: existingData?.id ?? crypto.randomUUID(),
    invoice_id: id,
    cislo_faktury: body.cislo_faktury ?? existingData?.cislo_faktury ?? null,
    datum_vystaveni: body.datum_vystaveni ?? existingData?.datum_vystaveni ?? null,
    duzp: body.duzp ?? existingData?.duzp ?? null,
    dppd: body.dppd ?? existingData?.dppd ?? null,
    dodavatel_nazev: body.dodavatel_nazev ?? existingData?.dodavatel_nazev ?? null,
    dodavatel_ico: body.dodavatel_ico ?? existingData?.dodavatel_ico ?? null,
    dodavatel_dic: body.dodavatel_dic ?? existingData?.dodavatel_dic ?? null,
    odberatel_nazev: body.odberatel_nazev ?? existingData?.odberatel_nazev ?? null,
    odberatel_ico: body.odberatel_ico ?? existingData?.odberatel_ico ?? null,
    odberatel_dic: body.odberatel_dic ?? existingData?.odberatel_dic ?? null,
    zaklad_dane_1: body.zaklad_dane_1 ?? existingData?.zaklad_dane_1 ?? 0,
    dan_1: body.dan_1 ?? existingData?.dan_1 ?? 0,
    zaklad_dane_2: body.zaklad_dane_2 ?? existingData?.zaklad_dane_2 ?? 0,
    dan_2: body.dan_2 ?? existingData?.dan_2 ?? 0,
    zaklad_dane_3: body.zaklad_dane_3 ?? existingData?.zaklad_dane_3 ?? 0,
    dan_3: body.dan_3 ?? existingData?.dan_3 ?? 0,
    celkem: body.celkem ?? existingData?.celkem ?? 0,
    mena: body.mena ?? existingData?.mena ?? "CZK",
    kod_pred_pl: body.kod_pred_pl ?? existingData?.kod_pred_pl ?? null,
    kod_rezim_pl: body.kod_rezim_pl ?? existingData?.kod_rezim_pl ?? "0",
    zdph_44: body.zdph_44 ?? existingData?.zdph_44 ?? "N",
    pomer: body.pomer ?? existingData?.pomer ?? "N",
    kh_section: body.kh_section ?? existingData?.kh_section ?? null,
    ocr_confidence: body.ocr_confidence ?? existingData?.ocr_confidence ?? null,
    manually_verified: body.manually_verified ?? existingData?.manually_verified ?? 0,
    raw_ocr_json: body.raw_ocr_json ?? existingData?.raw_ocr_json ?? null,
  };

  // Auto-classify KH section if not manually set
  if (!data.kh_section && data.celkem) {
    data.kh_section = classifyKhSection(invoice, data as InvoiceData);
  }

  const result = upsertInvoiceData(data);
  return c.json(result);
});

api.delete("/invoices/:id", (c) => {
  const id = c.req.param("id");
  const deleted = deleteInvoice(id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ─── OCR ─────────────────────────────────────────────────

api.post("/invoices/:id/ocr", async (c) => {
  const id = c.req.param("id");
  const invoice = getInvoice(id);
  if (!invoice) return c.json({ error: "Not found" }, 404);

  try {
    const ocrResult = await runOcr(invoice.file_path);
    const saved = await saveExtractedData(id, ocrResult.data, ocrResult.confidence, ocrResult.raw_response);
    return c.json({ data: saved, confidence: ocrResult.confidence });
  } catch (error) {
    return c.json(
      { error: `OCR failed: ${error instanceof Error ? error.message : error}` },
      500
    );
  }
});

api.post("/ocr/queue", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { invoice_ids?: string[] };
  const invoiceIds = (body.invoice_ids ?? []).filter((id) => typeof id === "string");

  if (invoiceIds.length === 0) {
    return c.json({ error: "invoice_ids is required" }, 400);
  }

  const jobId = crypto.randomUUID();
  const job: OcrQueueJob = {
    id: jobId,
    status: "queued",
    created_at: new Date().toISOString(),
    total: invoiceIds.length,
    done: 0,
    failed: 0,
    skipped: 0,
    current_invoice_id: null,
    invoice_ids: invoiceIds,
    errors: {},
  };

  ocrQueueJobs.set(jobId, job);
  scheduleOcrJob(jobId);

  return c.json({ job_id: jobId, total: job.total });
});

api.post("/ocr/queue/invoice/:id", (c) => {
  const invoiceId = c.req.param("id");
  const invoice = getInvoice(invoiceId);
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);

  if (!["pdf", "jpg", "jpeg", "png"].includes(invoice.file_type)) {
    return c.json({ queued: false, reason: "unsupported_type" });
  }

  const existing = getInvoiceData(invoiceId);
  if (existing?.ocr_confidence != null || existing?.manually_verified) {
    return c.json({ queued: false, reason: "already_processed" });
  }

  const jobId = crypto.randomUUID();
  const job: OcrQueueJob = {
    id: jobId,
    status: "queued",
    created_at: new Date().toISOString(),
    total: 1,
    done: 0,
    failed: 0,
    skipped: 0,
    current_invoice_id: null,
    invoice_ids: [invoiceId],
    errors: {},
  };

  ocrQueueJobs.set(jobId, job);
  scheduleOcrJob(jobId);

  return c.json({ queued: true, job_id: jobId });
});

api.get("/ocr/queue/:jobId", (c) => {
  const jobId = c.req.param("jobId");
  const job = ocrQueueJobs.get(jobId);
  if (!job) return c.json({ error: "Job not found" }, 404);

  return c.json({
    id: job.id,
    status: job.status,
    created_at: job.created_at,
    total: job.total,
    done: job.done,
    failed: job.failed,
    skipped: job.skipped,
    current_invoice_id: job.current_invoice_id,
    errors: job.errors,
  });
});

// ─── KH (Kontrolní hlášení) ─────────────────────────────

api.get("/months/:month/kh", (c) => {
  const month = c.req.param("month");
  const [rokStr, mesicStr] = month.split("-");
  const rok = parseInt(rokStr);
  const mesic = parseInt(mesicStr);

  const invoices = listInvoices(month);
  const invoicesWithData = invoices.map((inv) => ({
    ...inv,
    data: getInvoiceData(inv.id),
  }));

  const submission = getKhSubmission(rok, mesic);

  // Group invoices by KH section
  const sections: Record<string, typeof invoicesWithData> = {};
  for (const inv of invoicesWithData) {
    const section = inv.data?.kh_section;
    if (section) {
      if (!sections[section]) sections[section] = [];
      sections[section].push(inv);
    }
  }

  return c.json({
    rok,
    mesic,
    sections,
    submission,
    unclassified: invoicesWithData.filter((i) => !i.data?.kh_section),
  });
});

api.post("/months/:month/kh/generate", async (c) => {
  const month = c.req.param("month");
  const [rokStr, mesicStr] = month.split("-");
  const rok = parseInt(rokStr);
  const mesic = parseInt(mesicStr);
  const body = await c.req.json().catch(() => ({}));

  const input: KhGenerationInput = {
    rok,
    mesic,
    typ: body.typ ?? "B",
    d_zjist: body.d_zjist,
    c_jed_vyzvy: body.c_jed_vyzvy,
  };

  const xml = generateKhXml(input);

  // Save XML to iCloud folder
  const settings = getSettings();
  const xmlFileName = `kh_${rok}_${String(mesic).padStart(2, "0")}.xml`;
  const xmlPath = join(settings.icloud_base_path, month, xmlFileName);
  await writeFile(xmlPath, xml, "utf-8");

  // Save submission record
  const submissionId = crypto.randomUUID();
  const submission = createKhSubmission({
    id: submissionId,
    rok,
    mesic,
    typ: input.typ,
    xml_content: xml,
    xml_path: xmlPath,
    status: "generated",
    generated_at: new Date().toISOString(),
    submitted_at: null,
  });

  return c.json({ submission, xml_path: xmlPath });
});

api.post("/months/:month/kh/mark-submitted", async (c) => {
  const month = c.req.param("month");
  const [rokStr, mesicStr] = month.split("-");
  const rok = parseInt(rokStr);
  const mesic = parseInt(mesicStr);

  const submission = getKhSubmission(rok, mesic);
  if (!submission) return c.json({ error: "No submission found" }, 404);

  updateKhSubmissionStatus(submission.id, "submitted");
  return c.json({ ok: true });
});

// ─── File serving (for invoice preview) ──────────────────

api.get("/files/:id", async (c) => {
  const id = c.req.param("id");
  const invoice = getInvoice(id);
  if (!invoice) return c.json({ error: "Not found" }, 404);

  try {
    const buffer = await readFile(invoice.file_path);
    const ext = extname(invoice.file_path).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".xml": "application/xml",
      ".isdoc": "application/xml",
      ".csv": "text/csv",
    };
    const contentType = mimeTypes[ext] ?? "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${invoice.file_name}"`,
      },
    });
  } catch {
    return c.json({ error: "File not readable" }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────

async function saveExtractedData(
  invoiceId: string,
  parsed: ParsedInvoiceData,
  confidence: number,
  rawJson?: string
): Promise<InvoiceData> {
  const invoice = getInvoice(invoiceId)!;
  const existingData = getInvoiceData(invoiceId);

  const data: Omit<InvoiceData, "created_at" | "updated_at"> = {
    id: existingData?.id ?? crypto.randomUUID(),
    invoice_id: invoiceId,
    cislo_faktury: parsed.cislo_faktury,
    datum_vystaveni: parsed.datum_vystaveni,
    duzp: parsed.duzp,
    dppd: parsed.dppd,
    dodavatel_nazev: parsed.dodavatel_nazev,
    dodavatel_ico: parsed.dodavatel_ico,
    dodavatel_dic: parsed.dodavatel_dic,
    odberatel_nazev: parsed.odberatel_nazev,
    odberatel_ico: parsed.odberatel_ico,
    odberatel_dic: parsed.odberatel_dic,
    zaklad_dane_1: parsed.zaklad_dane_1,
    dan_1: parsed.dan_1,
    zaklad_dane_2: parsed.zaklad_dane_2,
    dan_2: parsed.dan_2,
    zaklad_dane_3: parsed.zaklad_dane_3,
    dan_3: parsed.dan_3,
    celkem: parsed.celkem,
    mena: parsed.mena,
    kod_pred_pl: null,
    kod_rezim_pl: "0",
    zdph_44: "N",
    pomer: "N",
    kh_section: null,
    ocr_confidence: confidence,
    manually_verified: confidence >= 1.0 ? 1 : 0,
    raw_ocr_json: rawJson ?? null,
  };

  // Auto-classify KH section
  data.kh_section = classifyKhSection(invoice, data as InvoiceData);

  return upsertInvoiceData(data);
}

export { api };
