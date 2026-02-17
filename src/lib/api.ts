/**
 * API client for the sidecar backend
 */

let _port: number = 3001;

export function setApiPort(port: number) {
  _port = port;
}

function baseUrl() {
  return `http://localhost:${_port}/api`;
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as { error: string }).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────

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

export interface Invoice {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  month: string;
  direction: "incoming" | "outgoing";
  created_at: string;
  updated_at: string;
  data?: InvoiceData | null;
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
}

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

export interface HealthStatus {
  status: string;
  ollama: {
    running: boolean;
    models: string[];
  };
  timestamp: string;
}

export interface KhData {
  rok: number;
  mesic: number;
  sections: Record<string, Invoice[]>;
  submission: {
    id: string;
    status: string;
    xml_path: string | null;
    generated_at: string | null;
  } | null;
  unclassified: Invoice[];
}

export interface YearSummary {
  year: string;
  months: MonthlySummary[];
  totals: Omit<MonthlySummary, "month" | "kh_status">;
}

export interface SearchResult {
  id: string;
  month: string;
  direction: "incoming" | "outgoing";
  file_name: string;
  file_type: string;
  cislo_faktury: string | null;
  dodavatel_nazev: string | null;
  odberatel_nazev: string | null;
  celkem: number | null;
  mena: string | null;
}

export interface OcrQueueJobStatus {
  id: string;
  status: "queued" | "running" | "done";
  created_at: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  current_invoice_id: string | null;
  errors: Record<string, string>;
}

export interface AresLookup {
  ico: string;
  dic: string | null;
  nazev: string | null;
  ulice: string | null;
  obec: string | null;
  psc: string | null;
}

export interface ViesLookup {
  vat: string;
  valid: boolean;
  company_name: string | null;
  company_address: string | null;
  error?: string;
}

// ─── API Methods ─────────────────────────────────────

export const api = {
  health: () => request<HealthStatus>("/health"),

  // Settings
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (data: Partial<Settings>) =>
    request<Settings>("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Months
  getMonths: () => request<MonthlySummary[]>("/months"),
  getMonth: (month: string) => request<MonthlySummary>(`/months/${month}`),
  getMonthInvoices: (month: string) =>
    request<Invoice[]>(`/months/${month}/invoices`),
  getYearSummary: (year: string) => request<YearSummary>(`/years/${year}`),

  // Scan
  scan: () =>
    request<{ months: string[]; newFiles: number }>("/scan", {
      method: "POST",
    }),

  // Upload
  uploadInvoice: async (
    month: string,
    direction: string,
    file: File
  ): Promise<Invoice> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(
      `${baseUrl()}/months/${month}/upload?direction=${direction}`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  // Invoices
  getInvoice: (id: string) => request<Invoice>(`/invoices/${id}`),
  updateInvoice: (id: string, data: Partial<InvoiceData>) =>
    request<InvoiceData>(`/invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteInvoice: (id: string) =>
    request<{ ok: boolean }>(`/invoices/${id}`, { method: "DELETE" }),

  // OCR
  runOcr: (id: string) =>
    request<{ data: InvoiceData; confidence: number }>(`/invoices/${id}/ocr`, {
      method: "POST",
    }),
  enqueueOcr: (invoiceIds: string[]) =>
    request<{ job_id: string; total: number }>("/ocr/queue", {
      method: "POST",
      body: JSON.stringify({ invoice_ids: invoiceIds }),
    }),
  getOcrQueueStatus: (jobId: string) =>
    request<OcrQueueJobStatus>(`/ocr/queue/${jobId}`),

  // Search
  search: (params: { q?: string; month?: string; direction?: "incoming" | "outgoing" }) => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set("q", params.q);
    if (params.month) searchParams.set("month", params.month);
    if (params.direction) searchParams.set("direction", params.direction);
    return request<SearchResult[]>(`/search?${searchParams.toString()}`);
  },

  // Registry lookups
  lookupAres: (ico: string) => request<AresLookup>(`/ares/${encodeURIComponent(ico)}`),
  lookupVies: (vat: string) => request<ViesLookup>(`/vies/${encodeURIComponent(vat)}`),

  // KH
  getKh: (month: string) => request<KhData>(`/months/${month}/kh`),
  generateKh: (month: string, typ?: string) =>
    request<{ submission: any; xml_path: string }>(
      `/months/${month}/kh/generate`,
      { method: "POST", body: JSON.stringify({ typ: typ ?? "B" }) }
    ),
  markKhSubmitted: (month: string) =>
    request<{ ok: boolean }>(`/months/${month}/kh/mark-submitted`, {
      method: "POST",
    }),

  // File preview URL
  fileUrl: (id: string) => `http://localhost:${_port}/api/files/${id}`,
};
