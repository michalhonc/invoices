import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useState as useReactState } from "react";
import { api, type InvoiceData } from "../lib/api";
import { MacButton, MacBanner } from "./DashboardPage";

export function InvoiceDetailPage() {
  const [deleteSuccess, setDeleteSuccess] = useReactState(false);
  const { month, id } = useParams({ from: "/months/$month/invoices/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invoice = useQuery({
    queryKey: ["invoices", id],
    queryFn: () => api.getInvoice(id),
  });

  const ocrMutation = useMutation({
    mutationFn: () => api.runOcr(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<InvoiceData>) => api.updateInvoice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["months", month] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteInvoice(id),
    onSuccess: () => {
      setDeleteSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["months", month] });
      setTimeout(() => {
        void navigate({ to: "/months/$month", params: { month } });
      }, 1200);
    },
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error("Delete failed", err);
    },
  });

  if (invoice.isLoading) {
    return (
      <div className="text-center py-12 text-[13px]" style={{ color: "var(--mac-text-secondary)" }}>
        Načítání…
      </div>
    );
  }

  if (!invoice.data) {
    return (
      <div className="text-center py-12 text-[13px]" style={{ color: "var(--mac-text-secondary)" }}>
        Faktura nenalezena
      </div>
    );
  }

  const inv = invoice.data;
  const isImage = ["jpg", "jpeg", "png"].includes(inv.file_type);
  const isPdf = inv.file_type === "pdf";

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/months/$month"
            params={{ month }}
            className="text-[13px] font-medium"
            style={{ color: "var(--mac-accent)" }}
          >
            ← Zpět
          </Link>
          <span className="text-[15px] font-semibold" style={{ color: "var(--mac-text-primary)" }}>
            {inv.data?.cislo_faktury ?? inv.file_name}
          </span>
          {inv.data?.manually_verified ? (
            <span
              className="px-2 py-[2px] rounded-md text-[11px] font-medium"
              style={{ background: "rgba(52,199,89,0.12)", color: "var(--mac-green)" }}
            >
              Ověřeno
            </span>
          ) : (
            <span
              className="px-2 py-[2px] rounded-md text-[11px] font-medium"
              style={{ background: "rgba(255,159,10,0.12)", color: "var(--mac-yellow)" }}
            >
              Neověřeno
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <MacButton onClick={() => ocrMutation.mutate()} disabled={ocrMutation.isPending}>
            {ocrMutation.isPending ? "OCR…" : "Spustit OCR"}
          </MacButton>
          <MacButton
            variant="danger"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (confirm("Opravdu smazat tuto fakturu?")) deleteMutation.mutate();
            }}
          >
            {deleteMutation.isPending ? "Mazání…" : "Smazat"}
          </MacButton>
        </div>
      </div>

      {ocrMutation.error && (
        <MacBanner variant="error">OCR chyba: {ocrMutation.error.message}</MacBanner>
      )}
      {deleteMutation.error && (
        <MacBanner variant="error">
          Mazání selhalo: {deleteMutation.error.message}
          <br />
          Zkontrolujte, zda faktura existuje a není již smazána. Pokud problém přetrvává, restartujte aplikaci.
        </MacBanner>
      )}
      {deleteSuccess && (
        <MacBanner variant="success">Faktura byla úspěšně odstraněna z databáze.</MacBanner>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* File preview */}
        <MacPanel header={`Náhled: ${inv.file_name}`}>
          <div className="p-4">
            {isImage && (
              <img src={api.fileUrl(id)} alt={inv.file_name} className="max-w-full rounded-lg" />
            )}
            {isPdf && (
              <iframe
                src={api.fileUrl(id)}
                className="w-full h-[600px] rounded-lg"
                style={{ border: "1px solid var(--mac-separator)" }}
                title="PDF Preview"
              />
            )}
            {!isImage && !isPdf && (
              <div className="text-center py-12 text-[12px]" style={{ color: "var(--mac-text-tertiary)" }}>
                Náhled není k dispozici pro .{inv.file_type}
              </div>
            )}
          </div>
        </MacPanel>

        {/* Data form */}
        <InvoiceDataForm
          data={inv.data ?? undefined}
          direction={inv.direction}
          onSave={(data) => saveMutation.mutate(data)}
          saving={saveMutation.isPending}
        />
      </div>
    </div>
  );
}

function MacPanel({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--mac-group-bg)",
        border: "1px solid var(--mac-group-border)",
        boxShadow: "0 0.5px 1px rgba(0,0,0,0.04)",
      }}
    >
      <div
        className="px-4 py-2.5 text-[12px] font-semibold"
        style={{
          borderBottom: "1px solid var(--mac-separator)",
          color: "var(--mac-text-primary)",
        }}
      >
        {header}
      </div>
      {children}
    </div>
  );
}

function InvoiceDataForm({
  data,
  direction,
  onSave,
  saving,
}: {
  data?: InvoiceData;
  direction: string;
  onSave: (data: Partial<InvoiceData>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<InvoiceData>>(data ?? {});

  useEffect(() => {
    setForm(data ?? {});
  }, [data]);

  const update = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave({ ...form, manually_verified: 1 });
  };

  useEffect(() => {
    const handler = () => handleSave();
    window.addEventListener("app:save", handler);
    return () => window.removeEventListener("app:save", handler);
  }, [form]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--mac-group-bg)",
        border: "1px solid var(--mac-group-border)",
        boxShadow: "0 0.5px 1px rgba(0,0,0,0.04)",
      }}
    >
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--mac-separator)" }}
      >
        <span className="text-[12px] font-semibold" style={{ color: "var(--mac-text-primary)" }}>
          Údaje faktury
        </span>
        {data?.ocr_confidence != null && (
          <span className="text-[11px]" style={{ color: "var(--mac-text-tertiary)" }}>
            OCR: {Math.round(data.ocr_confidence * 100)}%
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <MacField label="Číslo faktury" value={form.cislo_faktury ?? ""} onChange={(v) => update("cislo_faktury", v)} />
          <MacField label="Datum vystavení" value={form.datum_vystaveni ?? ""} onChange={(v) => update("datum_vystaveni", v)} placeholder="DD.MM.YYYY" />
          <MacField label="DUZP" value={form.duzp ?? ""} onChange={(v) => update("duzp", v)} placeholder="DD.MM.YYYY" />
          <MacField label="DPPD" value={form.dppd ?? ""} onChange={(v) => update("dppd", v)} placeholder="DD.MM.YYYY" />
        </div>

        <MacSectionLabel>Dodavatel</MacSectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <MacField label="Název" value={form.dodavatel_nazev ?? ""} onChange={(v) => update("dodavatel_nazev", v)} />
          <MacField label="IČO" value={form.dodavatel_ico ?? ""} onChange={(v) => update("dodavatel_ico", v)} />
          <MacField label="DIČ" value={form.dodavatel_dic ?? ""} onChange={(v) => update("dodavatel_dic", v)} />
        </div>

        <MacSectionLabel>Odběratel</MacSectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <MacField label="Název" value={form.odberatel_nazev ?? ""} onChange={(v) => update("odberatel_nazev", v)} />
          <MacField label="IČO" value={form.odberatel_ico ?? ""} onChange={(v) => update("odberatel_ico", v)} />
          <MacField label="DIČ" value={form.odberatel_dic ?? ""} onChange={(v) => update("odberatel_dic", v)} />
        </div>

        <MacSectionLabel>DPH</MacSectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <MacNumField label="Základ 21%" value={form.zaklad_dane_1 ?? 0} onChange={(v) => update("zaklad_dane_1", v)} />
          <MacNumField label="DPH 21%" value={form.dan_1 ?? 0} onChange={(v) => update("dan_1", v)} />
          <MacNumField label="Základ 12%" value={form.zaklad_dane_2 ?? 0} onChange={(v) => update("zaklad_dane_2", v)} />
          <MacNumField label="DPH 12%" value={form.dan_2 ?? 0} onChange={(v) => update("dan_2", v)} />
          <MacNumField label="Celkem" value={form.celkem ?? 0} onChange={(v) => update("celkem", v)} />
          <MacField label="Měna" value={form.mena ?? "CZK"} onChange={(v) => update("mena", v)} />
        </div>

        <MacSectionLabel>Kontrolní hlášení</MacSectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--mac-text-secondary)" }}>
              Sekce KH
            </label>
            <select
              value={form.kh_section ?? ""}
              onChange={(e) => update("kh_section", e.target.value)}
              className="w-full px-2.5 py-[5px] rounded-md text-[13px] outline-none"
              style={{
                background: "var(--mac-input-bg)",
                color: "var(--mac-text-primary)",
                border: "1px solid var(--mac-input-border)",
              }}
            >
              <option value="">Automaticky</option>
              {direction === "outgoing" ? (
                <>
                  <option value="A1">A.1 – Přenesení</option>
                  <option value="A4">A.4 – Nad 10 000 Kč</option>
                  <option value="A5">A.5 – Do 10 000 Kč</option>
                </>
              ) : (
                <>
                  <option value="B1">B.1 – Přenesení</option>
                  <option value="B2">B.2 – Nad 10 000 Kč</option>
                  <option value="B3">B.3 – Do 10 000 Kč</option>
                </>
              )}
            </select>
          </div>
          <MacField label="Kód předmětu plnění" value={form.kod_pred_pl ?? ""} onChange={(v) => update("kod_pred_pl", v)} placeholder="Pro §92a" />
        </div>

        <div className="pt-3">
          <MacButton variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Ukládání…" : "Uložit a ověřit"}
          </MacButton>
        </div>
      </div>
    </div>
  );
}

function MacSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase tracking-wider pt-1"
      style={{ color: "var(--mac-text-tertiary)" }}
    >
      {children}
    </div>
  );
}

function MacField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--mac-text-secondary)" }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-[5px] rounded-md text-[13px] outline-none transition-shadow"
        style={{
          background: "var(--mac-input-bg)",
          color: "var(--mac-text-primary)",
          border: "1px solid var(--mac-input-border)",
        }}
      />
    </div>
  );
}

function MacNumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--mac-text-secondary)" }}>
        {label}
      </label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-2.5 py-[5px] rounded-md text-[13px] outline-none tabular-nums transition-shadow"
        style={{
          background: "var(--mac-input-bg)",
          color: "var(--mac-text-primary)",
          border: "1px solid var(--mac-input-border)",
        }}
      />
    </div>
  );
}
