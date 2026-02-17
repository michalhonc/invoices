/**
 * Ollama OCR Pipeline
 * Sends invoice images to a local Ollama vision model for data extraction.
 */

import { readFile } from "fs/promises";
import { getSettings } from "../db";
import type { ParsedInvoiceData } from "../parsers/isdoc";

const OCR_PROMPT = `Analyze this Czech invoice image and extract the following fields. Return ONLY valid JSON with these exact keys:

{
  "cislo_faktury": "invoice number (číslo faktury/dokladu)",
  "datum_vystaveni": "issue date in DD.MM.YYYY format",
  "duzp": "date of taxable supply (DUZP/datum uskutečnění zdanitelného plnění) in DD.MM.YYYY format",
  "dodavatel_nazev": "supplier name",
  "dodavatel_ico": "supplier IČO (8 digits)",
  "dodavatel_dic": "supplier DIČ (e.g. CZ12345678)",
  "odberatel_nazev": "buyer name",
  "odberatel_ico": "buyer IČO (8 digits)",
  "odberatel_dic": "buyer DIČ (e.g. CZ12345678)",
  "zaklad_dane_1": 0.00,
  "dan_1": 0.00,
  "zaklad_dane_2": 0.00,
  "dan_2": 0.00,
  "celkem": 0.00,
  "mena": "CZK"
}

Rules:
- zaklad_dane_1 and dan_1 are for 21% VAT rate (základní sazba)
- zaklad_dane_2 and dan_2 are for 12% VAT rate (snížená sazba) 
- All amounts as numbers (not strings), use dots for decimals
- If a field is not found, use null for strings or 0 for numbers
- dodavatel_dic should include country prefix (CZ for Czech)
- Return ONLY the JSON, no markdown, no explanation`;

export interface OcrResult {
  data: ParsedInvoiceData;
  confidence: number;
  raw_response: string;
}

/**
 * Check if Ollama is running and accessible
 */
export async function checkOllamaStatus(): Promise<{
  running: boolean;
  models: string[];
}> {
  const settings = getSettings();
  try {
    const res = await fetch(`${settings.ollama_url}/api/tags`);
    if (!res.ok) return { running: false, models: [] };
    const data = (await res.json()) as { models: { name: string }[] };
    return {
      running: true,
      models: data.models?.map((m) => m.name) ?? [],
    };
  } catch {
    return { running: false, models: [] };
  }
}

/**
 * Run OCR on an invoice image/PDF using Ollama vision model
 */
export async function runOcr(filePath: string): Promise<OcrResult> {

  const settings = getSettings();

  // Allow PDF or image
  const allowedExts = [".jpg", ".jpeg", ".png", ".pdf"];
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (!allowedExts.includes(ext)) {
    throw new Error(`OCR podporuje pouze obrázky JPG/PNG nebo PDF. Soubor má příponu '${ext}'.`);
  }

  let imageBuffer: Buffer;
  let tempPngPath: string | null = null;
  if (ext === ".pdf") {
    // Convert first page of PDF to PNG using pdftoppm
    const { mkdtempSync } = await import("fs");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { execSync } = await import("child_process");
    const tmpDir = mkdtempSync(join(tmpdir(), "ocr-pdf-"));
    const outPrefix = join(tmpDir, "page");
    try {
      // -png: output PNG, -singlefile: only first page, -f 1 -l 1: first page only
      execSync(`pdftoppm -png -f 1 -l 1 -singlefile "${filePath}" "${outPrefix}"`);
      tempPngPath = `${outPrefix}.png`;
      imageBuffer = await readFile(tempPngPath);
    } catch (err) {
      let msg = "PDF konverze selhala. ";
      if (err instanceof Error) {
        msg += err.message;
      } else {
        msg += String(err);
      }
      msg += "\nZkontrolujte, že je nainstalován 'pdftoppm' (součást balíku poppler) a je v PATH.";
      throw new Error(msg);
    }
  } else {
    imageBuffer = await readFile(filePath);
  }
  const base64 = imageBuffer.toString("base64");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

  let response: Response;
  try {
    response = await fetch(`${settings.ollama_url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.ollama_model,
        prompt: OCR_PROMPT,
        images: [base64],
        stream: false,
        format: "json",
        options: {
          temperature: 0.1, // Low temp for factual extraction
          num_predict: 1024,
        },
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("OCR timeout: Ollama neodpověděla do 5 minut");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as {
    response: string;
    done: boolean;
    total_duration?: number;
    eval_count?: number;
  };

  const rawResponse = result.response;

  // Parse the JSON response from the model
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error(`Failed to parse OCR response as JSON: ${rawResponse}`);
    }
  }

  // Calculate a rough confidence score based on how many fields were extracted
  const fields = [
    "cislo_faktury",
    "datum_vystaveni",
    "duzp",
    "dodavatel_ico",
    "dodavatel_dic",
    "celkem",
  ];
  const filledFields = fields.filter(
    (f) => parsed[f] != null && parsed[f] !== "" && parsed[f] !== 0
  );
  const confidence = filledFields.length / fields.length;

  // Extract DIČ numeric part for DB storage
  const dicDod = extractDicNumeric(parsed.dodavatel_dic as string | null);
  const dicOdb = extractDicNumeric(parsed.odberatel_dic as string | null);

  const data: ParsedInvoiceData = {
    cislo_faktury: safeStr(parsed.cislo_faktury),
    datum_vystaveni: safeStr(parsed.datum_vystaveni),
    duzp: safeStr(parsed.duzp),
    dppd: safeStr(parsed.datum_vystaveni), // Default to issue date
    dodavatel_nazev: safeStr(parsed.dodavatel_nazev),
    dodavatel_ico: safeStr(parsed.dodavatel_ico),
    dodavatel_dic: dicDod,
    odberatel_nazev: safeStr(parsed.odberatel_nazev),
    odberatel_ico: safeStr(parsed.odberatel_ico),
    odberatel_dic: dicOdb,
    zaklad_dane_1: safeNum(parsed.zaklad_dane_1),
    dan_1: safeNum(parsed.dan_1),
    zaklad_dane_2: safeNum(parsed.zaklad_dane_2),
    dan_2: safeNum(parsed.dan_2),
    zaklad_dane_3: 0,
    dan_3: 0,
    celkem: safeNum(parsed.celkem),
    mena: safeStr(parsed.mena) || "CZK",
  };

  return { data, confidence, raw_response: rawResponse };
}

function safeStr(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s || null;
}

function safeNum(val: unknown): number {
  if (val == null) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/**
 * Extract numeric part from DIČ (e.g., "CZ12345678" → "12345678")
 * For KH XML, only the numeric part is used.
 */
function extractDicNumeric(dic: string | null): string | null {
  if (!dic) return null;
  const match = dic.match(/\d+/);
  return match ? match[0] : null;
}
