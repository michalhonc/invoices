import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api, type Settings } from "../lib/api";
import { MacButton } from "./DashboardPage";

export function SettingsPage() {
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Settings>) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const aresMutation = useMutation({
    mutationFn: (ico: string) => api.lookupAres(ico),
    onSuccess: (data) => {
      setForm((prev) => ({
        ...prev,
        ico: data.ico ?? prev.ico,
        dic: data.dic ?? prev.dic,
        nazev: data.nazev ?? prev.nazev,
        ulice: data.ulice ?? prev.ulice,
        obec: data.obec ?? prev.obec,
        psc: data.psc ?? prev.psc,
      }));
    },
  });

  const viesMutation = useMutation({
    mutationFn: (vat: string) => api.lookupVies(vat),
  });

  const [form, setForm] = useState<Partial<Settings>>({});

  useEffect(() => {
    if (settings.data) {
      setForm(settings.data);
    }
  }, [settings.data]);

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  useEffect(() => {
    if (!saveMutation.isSuccess) return;
    const id = setTimeout(() => saveMutation.reset(), 2500);
    return () => clearTimeout(id);
  }, [saveMutation]);

  useEffect(() => {
    const handler = () => handleSave();
    window.addEventListener("app:save", handler);
    return () => window.removeEventListener("app:save", handler);
  }, [form]);

  if (settings.isLoading) {
    return (
      <div className="text-center py-12 text-[13px]" style={{ color: "var(--mac-text-secondary)" }}>
        Načítání…
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      {saveMutation.isSuccess && (
        <div
          className="rounded-lg px-3 py-2.5 text-[12px]"
          style={{
            background: "rgba(52,199,89,0.08)",
            color: "var(--mac-green)",
            border: "1px solid rgba(52,199,89,0.15)",
          }}
        >
          Nastavení uloženo
        </div>
      )}

      {/* Taxpayer info */}
      <MacSection title="Údaje plátce DPH">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <MacField
            label="DIČ"
            value={form.dic ?? ""}
            onChange={(v) => update("dic", v)}
            placeholder="CZ12345678"
          />
          <MacField
            label="IČO"
            value={form.ico ?? ""}
            onChange={(v) => update("ico", v)}
            placeholder="12345678"
          />
          <MacField
            label="Název / Jméno"
            value={form.nazev ?? ""}
            onChange={(v) => update("nazev", v)}
          />
          <div>
            <label
              className="block text-[11px] font-medium mb-1"
              style={{ color: "var(--mac-text-secondary)" }}
            >
              Typ subjektu
            </label>
            <div className="relative">
              <select
                value={form.typ_ds ?? "F"}
                onChange={(e) => update("typ_ds", e.target.value)}
                className="w-full appearance-none px-2.5 py-[5px] rounded-md text-[13px]"
                style={{
                  background: "var(--mac-input-bg)",
                  border: "1px solid var(--mac-input-border)",
                  color: "var(--mac-text-primary)",
                }}
              >
                <option value="F">Fyzická osoba (FO)</option>
                <option value="P">Právnická osoba (PO)</option>
              </select>
              <svg
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                width="8"
                height="6"
                viewBox="0 0 8 6"
                fill="none"
              >
                <path
                  d="M1 1.5L4 4.5L7 1.5"
                  stroke="var(--mac-text-tertiary)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <MacField
            label="Číslo finančního úřadu"
            value={form.c_ufo ?? ""}
            onChange={(v) => update("c_ufo", v)}
            placeholder="3-místné číslo"
          />
          <MacField
            label="Email"
            value={form.email ?? ""}
            onChange={(v) => update("email", v)}
            placeholder="pro komunikaci KH"
          />
        </div>

        <p
          className="text-[11px] font-semibold uppercase tracking-wider pt-4 pb-1"
          style={{ color: "var(--mac-text-tertiary)" }}
        >
          Adresa
        </p>
        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          <MacField
            label="Ulice"
            value={form.ulice ?? ""}
            onChange={(v) => update("ulice", v)}
          />
          <MacField
            label="Obec"
            value={form.obec ?? ""}
            onChange={(v) => update("obec", v)}
          />
          <MacField
            label="PSČ"
            value={form.psc ?? ""}
            onChange={(v) => update("psc", v)}
          />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <MacButton
            onClick={() => {
              if (form.ico?.trim()) aresMutation.mutate(form.ico.trim());
            }}
            disabled={aresMutation.isPending || !form.ico?.trim()}
          >
            {aresMutation.isPending ? "ARES…" : "Doplnit z ARES"}
          </MacButton>
          <MacButton
            onClick={() => {
              if (form.dic?.trim()) viesMutation.mutate(form.dic.trim());
            }}
            disabled={viesMutation.isPending || !form.dic?.trim()}
          >
            {viesMutation.isPending ? "VIES…" : "Ověřit DIČ (VIES)"}
          </MacButton>
          {viesMutation.data && (
            <span className="text-[12px]" style={{ color: viesMutation.data.valid ? "var(--mac-green)" : "var(--mac-red)" }}>
              {viesMutation.data.valid ? "DIČ je platné" : "DIČ není ověřeno"}
            </span>
          )}
        </div>
      </MacSection>

      {/* Paths */}
      <MacSection title="Cesty a připojení">
        <MacField
          label="iCloud Drive cesta k fakturám"
          value={form.icloud_base_path ?? ""}
          onChange={(v) => update("icloud_base_path", v)}
          placeholder="~/Library/Mobile Documents/com~apple~CloudDocs/Invoices"
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
          <MacField
            label="Ollama URL"
            value={form.ollama_url ?? ""}
            onChange={(v) => update("ollama_url", v)}
            placeholder="http://localhost:11434"
          />
          <MacField
            label="Ollama model"
            value={form.ollama_model ?? ""}
            onChange={(v) => update("ollama_model", v)}
            placeholder="gemma3:12b"
          />
        </div>
      </MacSection>

      <MacButton variant="primary" onClick={handleSave} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Ukládání…" : "Uložit nastavení"}
      </MacButton>
    </div>
  );
}

function MacSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--mac-group-bg)",
        border: "1px solid var(--mac-group-border)",
        boxShadow: "0 0.5px 1px rgba(0,0,0,0.04)",
      }}
    >
      <h2
        className="text-[13px] font-semibold mb-3"
        style={{ color: "var(--mac-text-primary)" }}
      >
        {title}
      </h2>
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
      <label
        className="block text-[11px] font-medium mb-1"
        style={{ color: "var(--mac-text-secondary)" }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-[5px] rounded-md text-[13px] outline-none"
        style={{
          background: "var(--mac-input-bg)",
          border: "1px solid var(--mac-input-border)",
          color: "var(--mac-text-primary)",
        }}
      />
    </div>
  );
}
