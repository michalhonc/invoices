import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { api, type Invoice } from "../lib/api";
import { MacButton, formatMonth, formatCzk } from "./DashboardPage";

export function KhPage() {
  const { month } = useParams({ from: "/months/$month/kh" });
  const queryClient = useQueryClient();

  const kh = useQuery({
    queryKey: ["months", month, "kh"],
    queryFn: () => api.getKh(month),
  });

  const generateMutation = useMutation({
    mutationFn: (typ: string) => api.generateKh(month, typ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["months", month] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => api.markKhSubmitted(month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["months", month] });
    },
  });

  if (kh.isLoading) {
    return (
      <div className="text-center py-12 text-[13px]" style={{ color: "var(--mac-text-secondary)" }}>
        Načítání…
      </div>
    );
  }

  const data = kh.data;
  if (!data) return null;

  const sectionOrder = ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3"];

  return (
    <div className="max-w-4xl space-y-5">
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
            KH DPH – {formatMonth(month)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {data.submission?.status !== "submitted" && (
            <MacButton
              variant="primary"
              onClick={() => generateMutation.mutate("B")}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? "Generování…" : "Generovat XML"}
            </MacButton>
          )}
          {data.submission?.status === "generated" && (
            <MacButton onClick={() => submitMutation.mutate()}>
              Označit jako odesláno
            </MacButton>
          )}
        </div>
      </div>

      {generateMutation.data && (
        <div
          className="rounded-lg px-3 py-2.5 text-[12px]"
          style={{
            background: "rgba(52,199,89,0.08)",
            color: "var(--mac-green)",
            border: "1px solid rgba(52,199,89,0.15)",
          }}
        >
          XML vygenerováno: {generateMutation.data.xml_path}
        </div>
      )}

      {/* Submission status */}
      {data.submission && (
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{
            background: "var(--mac-group-bg)",
            border: "1px solid var(--mac-group-border)",
            boxShadow: "0 0.5px 1px rgba(0,0,0,0.04)",
          }}
        >
          <div className="flex items-center gap-2 text-[13px]">
            <span style={{ color: "var(--mac-text-secondary)" }}>Stav:</span>
            <StatusBadge status={data.submission.status} />
          </div>
          {data.submission.generated_at && (
            <span className="text-[11px]" style={{ color: "var(--mac-text-tertiary)" }}>
              {new Date(data.submission.generated_at).toLocaleString("cs-CZ")}
            </span>
          )}
        </div>
      )}

      {/* Unclassified warning */}
      {data.unclassified.length > 0 && (
        <div
          className="rounded-lg px-4 py-3"
          style={{
            background: "rgba(255,159,10,0.08)",
            border: "1px solid rgba(255,159,10,0.15)",
          }}
        >
          <p className="text-[12px] font-medium" style={{ color: "var(--mac-yellow)" }}>
            {data.unclassified.length} faktur bez přiřazené sekce KH
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.unclassified.map((inv) => (
              <Link
                key={inv.id}
                to="/months/$month/invoices/$id"
                params={{ month, id: inv.id }}
                className="px-2 py-[2px] rounded text-[11px] font-medium transition-colors"
                style={{
                  background: "rgba(255,159,10,0.12)",
                  color: "var(--mac-orange)",
                }}
              >
                {inv.data?.cislo_faktury ?? inv.file_name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {sectionOrder.map((section) => {
          const items = data.sections[section] ?? [];
          if (items.length === 0 && !["A5", "B3"].includes(section)) return null;

          return (
            <SectionCard key={section} section={section} items={items} month={month} />
          );
        })}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  items,
  month,
}: {
  section: string;
  items: Invoice[];
  month: string;
}) {
  const titles: Record<string, string> = {
    A1: "A.1 – Přenesení daňové povinnosti (§92a)",
    A2: "A.2 – Přijatá plnění s povinností přiznat daň",
    A3: "A.3 – Investiční zlato",
    A4: "A.4 – Uskutečněná plnění nad 10 000 Kč",
    A5: "A.5 – Uskutečněná plnění do 10 000 Kč",
    B1: "B.1 – Přijatá plnění přenesení (§92a)",
    B2: "B.2 – Přijatá plnění nad 10 000 Kč",
    B3: "B.3 – Přijatá plnění do 10 000 Kč",
  };

  const isAggregate = section === "A5" || section === "B3";
  const totalBase1 = items.reduce((s, i) => s + (i.data?.zaklad_dane_1 ?? 0), 0);
  const totalDan1 = items.reduce((s, i) => s + (i.data?.dan_1 ?? 0), 0);
  const totalBase2 = items.reduce((s, i) => s + (i.data?.zaklad_dane_2 ?? 0), 0);
  const totalDan2 = items.reduce((s, i) => s + (i.data?.dan_2 ?? 0), 0);

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
        <div className="text-[12px]">
          <span className="font-semibold" style={{ color: "var(--mac-text-primary)" }}>
            {titles[section] ?? section}
          </span>
          <span className="ml-2 font-normal" style={{ color: "var(--mac-text-tertiary)" }}>
            {items.length}
          </span>
        </div>
        <div className="text-[11px] flex gap-3 tabular-nums" style={{ color: "var(--mac-text-secondary)" }}>
          {totalBase1 > 0 && <span>21%: {formatCzk(totalBase1)} + {formatCzk(totalDan1)}</span>}
          {totalBase2 > 0 && <span>12%: {formatCzk(totalBase2)} + {formatCzk(totalDan2)}</span>}
        </div>
      </div>

      {!isAggregate && items.length > 0 && (
        <div>
          {items.map((inv, i) => (
            <Link
              key={inv.id}
              to="/months/$month/invoices/$id"
              params={{ month, id: inv.id }}
              className="flex items-center justify-between px-4 py-2 text-[13px] transition-colors"
              style={{
                borderTop: i > 0 ? "1px solid var(--mac-separator)" : undefined,
                color: "var(--mac-text-primary)",
              }}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">{inv.data?.cislo_faktury ?? inv.file_name}</span>
                <span style={{ color: "var(--mac-text-tertiary)" }}>
                  DIČ: {inv.data?.dodavatel_dic ?? inv.data?.odberatel_dic ?? "–"}
                </span>
              </div>
              <span className="font-medium tabular-nums">{formatCzk(inv.data?.celkem ?? 0)}</span>
            </Link>
          ))}
        </div>
      )}

      {isAggregate && items.length > 0 && (
        <div className="px-4 py-3 text-[12px]" style={{ color: "var(--mac-text-secondary)" }}>
          Agregovaný řádek ({items.length} faktur) — základ 21%: {formatCzk(totalBase1)}, DPH 21%: {formatCzk(totalDan1)}
          {totalBase2 > 0 && `, základ 12%: ${formatCzk(totalBase2)}, DPH 12%: ${formatCzk(totalDan2)}`}
        </div>
      )}

      {items.length === 0 && (
        <div className="px-4 py-4 text-center text-[12px]" style={{ color: "var(--mac-text-tertiary)" }}>
          Žádné faktury
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: "var(--mac-badge-gray-bg)", color: "var(--mac-badge-gray-text)", label: "Koncept" },
    generated: { bg: "rgba(255,159,10,0.12)", color: "var(--mac-yellow)", label: "Vygenerováno" },
    submitted: { bg: "rgba(52,199,89,0.12)", color: "var(--mac-green)", label: "Odesláno" },
  };
  const c = config[status] ?? config.draft;
  return (
    <span
      className="px-2 py-[2px] rounded-md text-[11px] font-medium"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}
