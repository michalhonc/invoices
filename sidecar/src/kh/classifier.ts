/**
 * KH Section Classifier
 * Automatically assigns kontrolní hlášení section based on invoice data.
 *
 * OUTGOING (vydané) invoices:
 *   A.1 — Uskutečněná plnění v režimu přenesení daňové povinnosti (§92a)
 *   A.2 — (unused for outgoing — this is for received EU supplies)
 *   A.3 — Investiční zlato
 *   A.4 — Uskutečněná zdanitelná plnění s hodnotou nad 10 000 Kč (per line)
 *   A.5 — Uskutečněná zdanitelná plnění s hodnotou do 10 000 Kč (aggregated)
 *
 * INCOMING (přijaté) invoices:
 *   B.1 — Přijatá plnění v režimu přenesení daňové povinnosti (§92a)
 *   B.2 — Přijatá zdanitelná plnění s hodnotou nad 10 000 Kč (per line)
 *   B.3 — Přijatá zdanitelná plnění s hodnotou do 10 000 Kč (aggregated)
 */

import type { InvoiceData, Invoice } from "../db";

const THRESHOLD = 10000; // Kč — invoices above this go to A4/B2 (individual), below to A5/B3 (aggregate)

export function classifyKhSection(
  invoice: Invoice,
  data: InvoiceData
): string {
  const totalWithVat = Math.abs(data.celkem);
  const hasReverseCharge = !!data.kod_pred_pl;

  if (invoice.direction === "outgoing") {
    // Outgoing (vydané) invoices
    if (hasReverseCharge) {
      return "A1"; // Reverse charge (§92a)
    }
    if (totalWithVat > THRESHOLD) {
      return "A4"; // Individual line — over 10k
    }
    return "A5"; // Aggregated — under 10k
  } else {
    // Incoming (přijaté) invoices
    if (hasReverseCharge) {
      return "B1"; // Reverse charge received
    }
    if (totalWithVat > THRESHOLD) {
      return "B2"; // Individual line — over 10k
    }
    return "B3"; // Aggregated — under 10k
  }
}
