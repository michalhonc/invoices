/**
 * CSV Invoice Parser
 * Parses CSV files with configurable column mapping.
 */

import { readFile } from "fs/promises";
import type { ParsedInvoiceData } from "./isdoc";

interface CsvColumnMapping {
  cislo_faktury?: number;
  datum_vystaveni?: number;
  duzp?: number;
  dodavatel_nazev?: number;
  dodavatel_ico?: number;
  dodavatel_dic?: number;
  odberatel_nazev?: number;
  odberatel_ico?: number;
  odberatel_dic?: number;
  zaklad_dane_1?: number;
  dan_1?: number;
  zaklad_dane_2?: number;
  dan_2?: number;
  celkem?: number;
  mena?: number;
}

// Default mapping assumes common Czech accounting CSV export format
const DEFAULT_MAPPING: CsvColumnMapping = {
  cislo_faktury: 0,
  datum_vystaveni: 1,
  duzp: 2,
  dodavatel_nazev: 3,
  dodavatel_ico: 4,
  dodavatel_dic: 5,
  zaklad_dane_1: 6,
  dan_1: 7,
  celkem: 8,
};

/**
 * Parse a CSV row into invoice data using column mapping
 */
export async function parseCsv(
  filePath: string,
  mapping: CsvColumnMapping = DEFAULT_MAPPING
): Promise<ParsedInvoiceData[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return []; // Need at least header + 1 row

  // Skip header
  const dataLines = lines.slice(1);

  return dataLines.map((line) => {
    const cols = parseCSVLine(line);

    return {
      cislo_faktury: getCol(cols, mapping.cislo_faktury),
      datum_vystaveni: getCol(cols, mapping.datum_vystaveni),
      duzp: getCol(cols, mapping.duzp),
      dppd: null,
      dodavatel_nazev: getCol(cols, mapping.dodavatel_nazev),
      dodavatel_ico: getCol(cols, mapping.dodavatel_ico),
      dodavatel_dic: getCol(cols, mapping.dodavatel_dic),
      odberatel_nazev: getCol(cols, mapping.odberatel_nazev),
      odberatel_ico: getCol(cols, mapping.odberatel_ico),
      odberatel_dic: getCol(cols, mapping.odberatel_dic),
      zaklad_dane_1: getNumCol(cols, mapping.zaklad_dane_1),
      dan_1: getNumCol(cols, mapping.dan_1),
      zaklad_dane_2: getNumCol(cols, mapping.zaklad_dane_2),
      dan_2: getNumCol(cols, mapping.dan_2),
      zaklad_dane_3: 0,
      dan_3: 0,
      celkem: getNumCol(cols, mapping.celkem),
      mena: getCol(cols, mapping.mena) || "CZK",
    };
  });
}

function getCol(cols: string[], idx?: number): string | null {
  if (idx == null || idx >= cols.length) return null;
  const val = cols[idx].trim();
  return val || null;
}

function getNumCol(cols: string[], idx?: number): number {
  const val = getCol(cols, idx);
  if (!val) return 0;
  // Handle Czech number format: 1 234,56 → 1234.56
  const cleaned = val
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  const delimiter = line.includes(";") ? ";" : ","; // Detect delimiter

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}
