/**
 * Kontrolní hlášení DPH — XML Generator
 *
 * Generates the official DPHKH1 XML file according to the XSD schema:
 * https://adisspr.mfcr.cz/adis/jepo/schema/dphkh1_epo2.xsd
 *
 * Schema version: 03.01.13
 */

import { getDb, getSettings, type InvoiceData, type Settings } from "../db";

// ─── Types ───────────────────────────────────────────────

export interface KhGenerationInput {
  rok: number;
  mesic: number;
  typ: "B" | "O" | "N" | "E"; // B=řádné, O=opravné, N=následné, E=následné/opravné
  d_zjist?: string; // Date reasons discovered (for N/E types), DD.MM.YYYY
  c_jed_vyzvy?: string; // Challenge reference number
}

interface InvoiceWithData {
  invoice_id: string;
  direction: string;
  cislo_faktury: string;
  duzp: string | null;
  dppd: string | null;
  dodavatel_dic: string | null;
  odberatel_dic: string | null;
  zaklad_dane_1: number;
  dan_1: number;
  zaklad_dane_2: number;
  dan_2: number;
  zaklad_dane_3: number;
  dan_3: number;
  celkem: number;
  kod_pred_pl: string | null;
  kod_rezim_pl: string;
  zdph_44: string;
  pomer: string;
  kh_section: string;
}

// ─── Generator ───────────────────────────────────────────

export function generateKhXml(input: KhGenerationInput): string {
  const settings = getSettings();
  const month = `${input.rok}-${String(input.mesic).padStart(2, "0")}`;

  // Fetch all invoices with data for this month that have a kh_section assigned
  const db = getDb();
  const invoices = db
    .query(
      `SELECT
        i.id as invoice_id,
        i.direction,
        d.cislo_faktury,
        d.duzp,
        d.dppd,
        d.dodavatel_dic,
        d.odberatel_dic,
        d.zaklad_dane_1,
        d.dan_1,
        d.zaklad_dane_2,
        d.dan_2,
        d.zaklad_dane_3,
        d.dan_3,
        d.celkem,
        d.kod_pred_pl,
        d.kod_rezim_pl,
        d.zdph_44,
        d.pomer,
        d.kh_section
       FROM invoices i
       JOIN invoice_data d ON d.invoice_id = i.id
       WHERE i.month = ? AND d.kh_section IS NOT NULL
       ORDER BY d.kh_section, d.cislo_faktury`
    )
    .all(month) as InvoiceWithData[];

  // Group by section
  const sections: Record<string, InvoiceWithData[]> = {};
  for (const inv of invoices) {
    if (!sections[inv.kh_section]) sections[inv.kh_section] = [];
    sections[inv.kh_section].push(inv);
  }

  // Build XML
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<Pisemnost nazevSW="InvoicesApp" verzeSW="0.1.0">`);
  lines.push(`<DPHKH1 verzePis="03.01.13">`);

  // VetaD — Header
  lines.push(buildVetaD(input));

  // VetaP — Taxpayer
  lines.push(buildVetaP(settings));

  // Section A.1 — Outgoing reverse charge
  for (const inv of sections["A1"] ?? []) {
    lines.push(buildVetaA1(inv));
  }

  // Section A.2 — Received EU supply with tax (rare, not common for standard use)
  for (const inv of sections["A2"] ?? []) {
    lines.push(buildVetaA2(inv));
  }

  // Section A.4 — Outgoing > 10k (individual rows)
  for (const inv of sections["A4"] ?? []) {
    lines.push(buildVetaA4(inv));
  }

  // Section A.5 — Outgoing ≤ 10k (aggregated)
  const a5Items = sections["A5"] ?? [];
  if (a5Items.length > 0) {
    lines.push(buildVetaA5(a5Items));
  }

  // Section B.1 — Incoming reverse charge
  for (const inv of sections["B1"] ?? []) {
    lines.push(buildVetaB1(inv));
  }

  // Section B.2 — Incoming > 10k (individual rows)
  for (const inv of sections["B2"] ?? []) {
    lines.push(buildVetaB2(inv));
  }

  // Section B.3 — Incoming ≤ 10k (aggregated)
  const b3Items = sections["B3"] ?? [];
  if (b3Items.length > 0) {
    lines.push(buildVetaB3(b3Items));
  }

  // VetaC — Control sums
  lines.push(buildVetaC(sections));

  lines.push(`</DPHKH1>`);
  lines.push(`</Pisemnost>`);

  return lines.join("\n");
}

// ─── Element Builders ────────────────────────────────────

function buildVetaD(input: KhGenerationInput): string {
  const today = new Date();
  const d_poddp = formatDateCz(today);

  let attrs = `k_uladis="DPH" dokession="KH1"`;
  attrs += ` mesic="${input.mesic}" rok="${input.rok}"`;
  attrs += ` khdph_forma="${input.typ}"`;
  attrs += ` d_poddp="${d_poddp}"`;

  if (input.d_zjist) {
    attrs += ` d_zjist="${input.d_zjist}"`;
  }
  if (input.c_jed_vyzvy) {
    attrs += ` c_jed_vyzvy="${input.c_jed_vyzvy}"`;
  }

  return `<VetaD ${attrs} />`;
}

function buildVetaP(settings: Settings): string {
  let attrs = `c_ufo="${esc(settings.c_ufo)}"`;
  attrs += ` dic="${esc(extractNumericDic(settings.dic))}"`;
  attrs += ` typ_ds="${settings.typ_ds}"`;

  if (settings.typ_ds === "F") {
    attrs += ` prijmeni="${esc(settings.nazev)}"`;
  } else {
    attrs += ` obch_jmeno="${esc(settings.nazev)}"`;
  }

  if (settings.ulice) attrs += ` ulice="${esc(settings.ulice)}"`;
  if (settings.obec) attrs += ` obec="${esc(settings.obec)}"`;
  if (settings.psc) attrs += ` psc="${esc(settings.psc)}"`;
  attrs += ` stat="CZ"`;
  if (settings.email) attrs += ` email="${esc(settings.email)}"`;

  return `<VetaP ${attrs} />`;
}

function buildVetaA1(inv: InvoiceWithData): string {
  let attrs = `dic_odb="${esc(inv.odberatel_dic || "")}"`;
  attrs += ` c_evid_dd="${esc(inv.cislo_faktury)}"`;
  if (inv.duzp) attrs += ` duzp="${inv.duzp}"`;
  attrs += ` zakl_dane1="${fmtNum(inv.zaklad_dane_1)}"`;
  if (inv.kod_pred_pl) attrs += ` kod_pred_pl="${inv.kod_pred_pl}"`;
  return `<VetaA1 ${attrs} />`;
}

function buildVetaA2(inv: InvoiceWithData): string {
  let attrs = `k_stat=""`;
  attrs += ` vatid_dod="${esc(inv.dodavatel_dic || "")}"`;
  attrs += ` c_evid_dd="${esc(inv.cislo_faktury)}"`;
  if (inv.dppd) attrs += ` dppd="${inv.dppd}"`;
  attrs += buildTaxAttrs(inv);
  return `<VetaA2 ${attrs} />`;
}

function buildVetaA4(inv: InvoiceWithData): string {
  let attrs = `dic_odb="${esc(inv.odberatel_dic || "")}"`;
  attrs += ` c_evid_dd="${esc(inv.cislo_faktury)}"`;
  if (inv.dppd) attrs += ` dppd="${inv.dppd}"`;
  attrs += buildTaxAttrs(inv);
  attrs += ` kod_rezim_pl="${inv.kod_rezim_pl || "0"}"`;
  attrs += ` zdph_44="${inv.zdph_44 || "N"}"`;
  return `<VetaA4 ${attrs} />`;
}

function buildVetaA5(items: InvoiceWithData[]): string {
  const agg = aggregateTax(items);
  let attrs = "";
  attrs += ` zakl_dane1="${fmtNum(agg.zaklad_dane_1)}" dan1="${fmtNum(agg.dan_1)}"`;
  attrs += ` zakl_dane2="${fmtNum(agg.zaklad_dane_2)}" dan2="${fmtNum(agg.dan_2)}"`;
  if (agg.zaklad_dane_3 || agg.dan_3) {
    attrs += ` zakl_dane3="${fmtNum(agg.zaklad_dane_3)}" dan3="${fmtNum(agg.dan_3)}"`;
  }
  return `<VetaA5${attrs} />`;
}

function buildVetaB1(inv: InvoiceWithData): string {
  let attrs = `dic_dod="${esc(inv.dodavatel_dic || "")}"`;
  attrs += ` c_evid_dd="${esc(inv.cislo_faktury)}"`;
  if (inv.duzp) attrs += ` duzp="${inv.duzp}"`;
  attrs += buildTaxAttrs(inv);
  if (inv.kod_pred_pl) attrs += ` kod_pred_pl="${inv.kod_pred_pl}"`;
  return `<VetaB1 ${attrs} />`;
}

function buildVetaB2(inv: InvoiceWithData): string {
  let attrs = `dic_dod="${esc(inv.dodavatel_dic || "")}"`;
  attrs += ` c_evid_dd="${esc(inv.cislo_faktury)}"`;
  if (inv.dppd) attrs += ` dppd="${inv.dppd}"`;
  attrs += buildTaxAttrs(inv);
  attrs += ` pomer="${inv.pomer || "N"}"`;
  attrs += ` zdph_44="${inv.zdph_44 || "N"}"`;
  return `<VetaB2 ${attrs} />`;
}

function buildVetaB3(items: InvoiceWithData[]): string {
  const agg = aggregateTax(items);
  let attrs = "";
  attrs += ` zakl_dane1="${fmtNum(agg.zaklad_dane_1)}" dan1="${fmtNum(agg.dan_1)}"`;
  attrs += ` zakl_dane2="${fmtNum(agg.zaklad_dane_2)}" dan2="${fmtNum(agg.dan_2)}"`;
  if (agg.zaklad_dane_3 || agg.dan_3) {
    attrs += ` zakl_dane3="${fmtNum(agg.zaklad_dane_3)}" dan3="${fmtNum(agg.dan_3)}"`;
  }
  return `<VetaB3${attrs} />`;
}

function buildVetaC(sections: Record<string, InvoiceWithData[]>): string {
  // Control sums — cross-check with the DPH přiznání
  const allOutgoing = [
    ...(sections["A1"] ?? []),
    ...(sections["A4"] ?? []),
    ...(sections["A5"] ?? []),
  ];
  const allIncoming = [
    ...(sections["B1"] ?? []),
    ...(sections["B2"] ?? []),
    ...(sections["B3"] ?? []),
  ];

  const outSum1 = sum(allOutgoing, "zaklad_dane_1");
  const outSum2 = sum(allOutgoing, "zaklad_dane_2");
  const inSum1 = sum(allIncoming, "dan_1");
  const inSum2 = sum(allIncoming, "dan_2");
  const reverseChargeBase = sum(sections["A1"] ?? [], "zaklad_dane_1");
  const reverseChargeIn1 = sum(sections["B1"] ?? [], "dan_1");
  const reverseChargeIn2 = sum(sections["B1"] ?? [], "dan_2");

  let attrs = `obrat23="${fmtNum(outSum1)}" obrat5="${fmtNum(outSum2)}"`;
  attrs += ` pln23="${fmtNum(inSum1)}" pln5="${fmtNum(inSum2)}"`;
  attrs += ` pln_rez_pren="${fmtNum(reverseChargeBase)}"`;
  attrs += ` rez_pren23="${fmtNum(reverseChargeIn1)}" rez_pren5="${fmtNum(reverseChargeIn2)}"`;

  const celkZdA2 = sum(sections["A2"] ?? [], "zaklad_dane_1") +
    sum(sections["A2"] ?? [], "zaklad_dane_2");
  attrs += ` celk_zd_a2="${fmtNum(celkZdA2)}"`;

  return `<VetaC ${attrs} />`;
}

// ─── Helpers ─────────────────────────────────────────────

function buildTaxAttrs(inv: InvoiceWithData): string {
  let attrs = "";
  attrs += ` zakl_dane1="${fmtNum(inv.zaklad_dane_1)}" dan1="${fmtNum(inv.dan_1)}"`;
  attrs += ` zakl_dane2="${fmtNum(inv.zaklad_dane_2)}" dan2="${fmtNum(inv.dan_2)}"`;
  if (inv.zaklad_dane_3 || inv.dan_3) {
    attrs += ` zakl_dane3="${fmtNum(inv.zaklad_dane_3)}" dan3="${fmtNum(inv.dan_3)}"`;
  }
  return attrs;
}

function aggregateTax(items: InvoiceWithData[]) {
  return {
    zaklad_dane_1: items.reduce((s, i) => s + i.zaklad_dane_1, 0),
    dan_1: items.reduce((s, i) => s + i.dan_1, 0),
    zaklad_dane_2: items.reduce((s, i) => s + i.zaklad_dane_2, 0),
    dan_2: items.reduce((s, i) => s + i.dan_2, 0),
    zaklad_dane_3: items.reduce((s, i) => s + i.zaklad_dane_3, 0),
    dan_3: items.reduce((s, i) => s + i.dan_3, 0),
  };
}

function sum(
  items: InvoiceWithData[],
  field: keyof InvoiceWithData
): number {
  return items.reduce((s, i) => s + (Number(i[field]) || 0), 0);
}

function fmtNum(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractNumericDic(dic: string): string {
  if (!dic) return "";
  const match = dic.match(/\d+/);
  return match ? match[0] : dic;
}

function formatDateCz(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}
