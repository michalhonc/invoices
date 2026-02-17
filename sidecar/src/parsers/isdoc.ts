/**
 * ISDOC Parser — Czech electronic invoice standard
 * Parses ISDOC XML files and extracts structured invoice data.
 */

import { XMLParser } from "fast-xml-parser";
import { readFile } from "fs/promises";

export interface ParsedInvoiceData {
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
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
});

/**
 * Parse an ISDOC file and extract invoice data
 */
export async function parseIsdoc(filePath: string): Promise<ParsedInvoiceData> {
  const xml = await readFile(filePath, "utf-8");
  const parsed = parser.parse(xml);

  // ISDOC root element can be "Invoice" or wrapped in namespace
  const invoice =
    parsed.Invoice ?? parsed["isds:Invoice"] ?? parsed["inv:Invoice"] ?? parsed;

  const result: ParsedInvoiceData = {
    cislo_faktury: safeStr(invoice.ID),
    datum_vystaveni: formatDate(invoice.IssueDate),
    duzp: formatDate(invoice.TaxPointDate),
    dppd: formatDate(invoice.IssueDate),
    dodavatel_nazev: null,
    dodavatel_ico: null,
    dodavatel_dic: null,
    odberatel_nazev: null,
    odberatel_ico: null,
    odberatel_dic: null,
    zaklad_dane_1: 0,
    dan_1: 0,
    zaklad_dane_2: 0,
    dan_2: 0,
    zaklad_dane_3: 0,
    dan_3: 0,
    celkem: safeNum(
      invoice.LegalMonetaryTotal?.TaxInclusiveAmount ??
        invoice.LegalMonetaryTotal?.PayableAmount
    ),
    mena: safeStr(invoice.ForeignCurrencyCode) || "CZK",
  };

  // Parse supplier (AccountingSupplierParty)
  const supplier =
    invoice.AccountingSupplierParty?.Party ?? invoice.SellerSupplierParty?.Party;
  if (supplier) {
    result.dodavatel_nazev = safeStr(
      supplier.PartyName?.Name ?? supplier.PartyIdentification?.ID
    );
    result.dodavatel_ico = safeStr(
      supplier.PartyIdentification?.ID ??
        supplier.PartyIdentification?.find?.((p: any) => p["@_schemeID"] === "ICO")?.ID
    );
    result.dodavatel_dic = safeStr(
      supplier.PartyTaxScheme?.CompanyID ??
        supplier.PartyIdentification?.find?.((p: any) => p["@_schemeID"] === "DIC")?.ID
    );
  }

  // Parse buyer (AccountingCustomerParty)
  const buyer =
    invoice.AccountingCustomerParty?.Party ??
    invoice.BuyerCustomerParty?.Party;
  if (buyer) {
    result.odberatel_nazev = safeStr(
      buyer.PartyName?.Name ?? buyer.PartyIdentification?.ID
    );
    result.odberatel_ico = safeStr(
      buyer.PartyIdentification?.ID ??
        buyer.PartyIdentification?.find?.((p: any) => p["@_schemeID"] === "ICO")?.ID
    );
    result.odberatel_dic = safeStr(
      buyer.PartyTaxScheme?.CompanyID ??
        buyer.PartyIdentification?.find?.((p: any) => p["@_schemeID"] === "DIC")?.ID
    );
  }

  // Parse tax breakdown (TaxTotal/TaxSubtotal)
  const taxTotal = invoice.TaxTotal;
  if (taxTotal) {
    const subtotals = Array.isArray(taxTotal.TaxSubtotal)
      ? taxTotal.TaxSubtotal
      : taxTotal.TaxSubtotal
        ? [taxTotal.TaxSubtotal]
        : [];

    for (const sub of subtotals) {
      const rate = safeNum(sub.TaxCategory?.Percent ?? sub.Percent);
      const base = safeNum(sub.TaxableAmount);
      const tax = safeNum(sub.TaxAmount);

      if (rate >= 20 && rate <= 21) {
        result.zaklad_dane_1 += base;
        result.dan_1 += tax;
      } else if (rate >= 12 && rate <= 15) {
        // 12% is current reduced rate, 15% was pre-2024
        result.zaklad_dane_2 += base;
        result.dan_2 += tax;
      } else if (rate > 0) {
        result.zaklad_dane_3 += base;
        result.dan_3 += tax;
      }
    }
  }

  return result;
}

function safeStr(val: unknown): string | null {
  if (val == null) return null;
  return String(val).trim() || null;
}

function safeNum(val: unknown): number {
  if (val == null) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function formatDate(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  // Try to parse ISO date and convert to DD.MM.YYYY
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }
  return s || null;
}
