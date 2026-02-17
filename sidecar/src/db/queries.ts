import { getDb } from "./database";

// ─── Types ───────────────────────────────────────────────

export interface Invoice {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  month: string;
  direction: "incoming" | "outgoing";
  created_at: string;
  updated_at: string;
}

export interface InvoiceData {
  id: string;
  invoice_id: string;
  cislo_faktury: string | null;
  datum_vystaveni: string | null;
  duzp: string | null;
  dppd: string | null;
  dodavatel_nazev: string | null;
  dodavatel_ico: string | null;
  dodavatel_dic: string | null;
  odberatel_nazev: string | null;
  odberatel_ico: string | null;
  odberatel_dic: string | null;
  zaklad_dane_1: number;
  dan_1: number;
  zaklad_dane_2: number;
  dan_2: number;
  zaklad_dane_3: number;
  dan_3: number;
  celkem: number;
  mena: string;
  kod_pred_pl: string | null;
  kod_rezim_pl: string;
  zdph_44: string;
  pomer: string;
  kh_section: string | null;
  ocr_confidence: number | null;
  manually_verified: number;
  raw_ocr_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface KhSubmission {
  id: string;
  rok: number;
  mesic: number;
  typ: string;
  xml_content: string | null;
  xml_path: string | null;
  status: string;
  generated_at: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface Settings {
  dic: string;
  ico: string;
  typ_ds: "F" | "P";
  c_ufo: string;
  nazev: string;
  ulice: string;
  obec: string;
  psc: string;
  email: string;
  icloud_base_path: string;
  ollama_model: string;
  ollama_url: string;
}

// ─── Settings ────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  dic: "",
  ico: "",
  typ_ds: "F",
  c_ufo: "",
  nazev: "",
  ulice: "",
  obec: "",
  psc: "",
  email: "",
  icloud_base_path: `${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs/Invoices`,
  ollama_model: "gemma3:12b",
  ollama_url: "http://localhost:11434",
};

export function getSettings(): Settings {
  const db = getDb();
  const rows = db.query("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];

  const stored: Record<string, string> = {};
  for (const row of rows) {
    stored[row.key] = row.value;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...Object.fromEntries(
      Object.entries(stored).filter(([key]) => key in DEFAULT_SETTINGS)
    ),
  } as Settings;
}

export function updateSettings(updates: Partial<Settings>): Settings {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
  );

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      stmt.run(key, String(value));
    }
  }

  return getSettings();
}

// ─── Invoices ────────────────────────────────────────────

export function listMonths(): string[] {
  const db = getDb();
  const rows = db
    .query("SELECT DISTINCT month FROM invoices ORDER BY month DESC")
    .all() as { month: string }[];
  return rows.map((r) => r.month);
}

export function listInvoices(month: string): Invoice[] {
  const db = getDb();
  return db
    .query(
      "SELECT * FROM invoices WHERE month = ? ORDER BY direction, file_name"
    )
    .all(month) as Invoice[];
}

export function getInvoice(id: string): Invoice | null {
  const db = getDb();
  return (
    (db.query("SELECT * FROM invoices WHERE id = ?").get(id) as Invoice) ?? null
  );
}

export function createInvoice(
  invoice: Omit<Invoice, "created_at" | "updated_at">
): Invoice {
  const db = getDb();
  db.query(
    `INSERT INTO invoices (id, file_path, file_name, file_type, month, direction)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    invoice.id,
    invoice.file_path,
    invoice.file_name,
    invoice.file_type,
    invoice.month,
    invoice.direction
  );
  return getInvoice(invoice.id)!;
}

export function deleteInvoice(id: string): boolean {
  const db = getDb();
  const result = db.query("DELETE FROM invoices WHERE id = ?").run(id);
  return result.changes > 0;
}

// ─── Invoice Data ────────────────────────────────────────

export function getInvoiceData(invoiceId: string): InvoiceData | null {
  const db = getDb();
  return (
    (db
      .query("SELECT * FROM invoice_data WHERE invoice_id = ?")
      .get(invoiceId) as InvoiceData) ?? null
  );
}

export function upsertInvoiceData(
  data: Omit<InvoiceData, "created_at" | "updated_at">
): InvoiceData {
  const db = getDb();
  db.query(
    `INSERT OR REPLACE INTO invoice_data
     (id, invoice_id, cislo_faktury, datum_vystaveni, duzp, dppd,
      dodavatel_nazev, dodavatel_ico, dodavatel_dic,
      odberatel_nazev, odberatel_ico, odberatel_dic,
      zaklad_dane_1, dan_1, zaklad_dane_2, dan_2, zaklad_dane_3, dan_3,
      celkem, mena, kod_pred_pl, kod_rezim_pl, zdph_44, pomer,
      kh_section, ocr_confidence, manually_verified, raw_ocr_json,
      updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    data.id,
    data.invoice_id,
    data.cislo_faktury,
    data.datum_vystaveni,
    data.duzp,
    data.dppd,
    data.dodavatel_nazev,
    data.dodavatel_ico,
    data.dodavatel_dic,
    data.odberatel_nazev,
    data.odberatel_ico,
    data.odberatel_dic,
    data.zaklad_dane_1,
    data.dan_1,
    data.zaklad_dane_2,
    data.dan_2,
    data.zaklad_dane_3,
    data.dan_3,
    data.celkem,
    data.mena,
    data.kod_pred_pl,
    data.kod_rezim_pl,
    data.zdph_44,
    data.pomer,
    data.kh_section,
    data.ocr_confidence,
    data.manually_verified,
    data.raw_ocr_json
  );
  return getInvoiceData(data.invoice_id)!;
}

// ─── KH Submissions ─────────────────────────────────────

export function getKhSubmission(
  rok: number,
  mesic: number
): KhSubmission | null {
  const db = getDb();
  return (
    (db
      .query(
        "SELECT * FROM kh_submissions WHERE rok = ? AND mesic = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(rok, mesic) as KhSubmission) ?? null
  );
}

export function createKhSubmission(
  submission: Omit<KhSubmission, "created_at">
): KhSubmission {
  const db = getDb();
  db.query(
    `INSERT INTO kh_submissions (id, rok, mesic, typ, xml_content, xml_path, status, generated_at, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    submission.id,
    submission.rok,
    submission.mesic,
    submission.typ,
    submission.xml_content,
    submission.xml_path,
    submission.status,
    submission.generated_at,
    submission.submitted_at
  );
  return getKhSubmission(submission.rok, submission.mesic)!;
}

export function updateKhSubmissionStatus(
  id: string,
  status: string
): boolean {
  const db = getDb();
  const result = db
    .query("UPDATE kh_submissions SET status = ?, submitted_at = datetime('now') WHERE id = ?")
    .run(status, id);
  return result.changes > 0;
}

// ─── Monthly Summary ─────────────────────────────────────

export interface MonthlySummary {
  month: string;
  incoming_count: number;
  outgoing_count: number;
  incoming_total: number;
  outgoing_total: number;
  dan_na_vystupu: number;
  dan_na_vstupu: number;
  dph_difference: number;
  verified_count: number;
  total_count: number;
  ocr_eligible_count: number;
  ocr_ok_count: number;
  kh_status: string | null;
}

export function getMonthlySummary(month: string): MonthlySummary {
  const db = getDb();

  const counts = db
    .query(
      `SELECT
        direction,
        COUNT(*) as cnt,
        COALESCE(SUM(d.celkem), 0) as total,
        COALESCE(SUM(d.dan_1 + d.dan_2 + d.dan_3), 0) as total_dan,
        SUM(CASE WHEN d.manually_verified = 1 THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN i.file_type IN ('pdf','jpg','jpeg','png') THEN 1 ELSE 0 END) as ocr_eligible,
        SUM(CASE WHEN i.file_type IN ('pdf','jpg','jpeg','png') AND d.ocr_confidence IS NOT NULL THEN 1 ELSE 0 END) as ocr_ok
       FROM invoices i
       LEFT JOIN invoice_data d ON d.invoice_id = i.id
       WHERE i.month = ?
       GROUP BY direction`
    )
    .all(month) as {
    direction: string;
    cnt: number;
    total: number;
    total_dan: number;
    verified: number;
    ocr_eligible: number;
    ocr_ok: number;
  }[];

  const incoming = counts.find((c) => c.direction === "incoming");
  const outgoing = counts.find((c) => c.direction === "outgoing");

  // Parse month to get rok/mesic for KH lookup
  const [rokStr, mesicStr] = month.split("-");
  const rok = parseInt(rokStr);
  const mesic = parseInt(mesicStr);
  const kh = getKhSubmission(rok, mesic);

  return {
    month,
    incoming_count: incoming?.cnt ?? 0,
    outgoing_count: outgoing?.cnt ?? 0,
    incoming_total: incoming?.total ?? 0,
    outgoing_total: outgoing?.total ?? 0,
    dan_na_vystupu: outgoing?.total_dan ?? 0,
    dan_na_vstupu: incoming?.total_dan ?? 0,
    dph_difference: (outgoing?.total_dan ?? 0) - (incoming?.total_dan ?? 0),
    verified_count: (incoming?.verified ?? 0) + (outgoing?.verified ?? 0),
    total_count: (incoming?.cnt ?? 0) + (outgoing?.cnt ?? 0),
    ocr_eligible_count: (incoming?.ocr_eligible ?? 0) + (outgoing?.ocr_eligible ?? 0),
    ocr_ok_count: (incoming?.ocr_ok ?? 0) + (outgoing?.ocr_ok ?? 0),
    kh_status: kh?.status ?? null,
  };
}

export function getAllMonthlySummaries(): MonthlySummary[] {
  const months = listMonths();
  return months.map(getMonthlySummary);
}
