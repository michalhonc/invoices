import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, type MonthlySummary } from "../lib/api";
import { KhStatusBadge, formatMonth, formatCzk } from "./DashboardPage";

export function MonthsPage() {
  const months = useQuery({
    queryKey: ["months"],
    queryFn: api.getMonths,
  });

  return (
    <div className="max-w-4xl space-y-5">
      {months.isLoading && (
        <div className="text-center py-12 text-[13px]" style={{ color: "var(--mac-text-secondary)" }}>
          Načítání…
        </div>
      )}

      {months.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {months.data.map((m) => (
            <MonthCard key={m.month} summary={m} />
          ))}
        </div>
      )}

      {months.data?.length === 0 && (
        <div className="text-center py-16 text-[13px]" style={{ color: "var(--mac-text-secondary)" }}>
          Žádné měsíce. Nahrajte faktury do iCloud Drive složky.
        </div>
      )}
    </div>
  );
}

function MonthCard({ summary }: { summary: MonthlySummary }) {
  const totalInvoices = summary.incoming_count + summary.outgoing_count;
  const allVerified = summary.verified_count === totalInvoices && totalInvoices > 0;

  return (
    <Link
      to="/months/$month"
      params={{ month: summary.month }}
      className="block rounded-xl p-4 transition-all duration-100"
      style={{
        background: "var(--mac-group-bg)",
        border: "1px solid var(--mac-group-border)",
        boxShadow: "0 0.5px 1px rgba(0,0,0,0.04)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[14px] font-semibold" style={{ color: "var(--mac-text-primary)" }}>
          {formatMonth(summary.month)}
        </span>
        <KhStatusBadge status={summary.kh_status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <span style={{ color: "var(--mac-text-tertiary)" }}>Přijaté </span>
          <span className="font-medium tabular-nums" style={{ color: "var(--mac-text-primary)" }}>
            {summary.incoming_count}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--mac-text-tertiary)" }}>Vydané </span>
          <span className="font-medium tabular-nums" style={{ color: "var(--mac-text-primary)" }}>
            {summary.outgoing_count}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--mac-text-tertiary)" }}>DPH↑ </span>
          <span className="font-medium tabular-nums" style={{ color: "var(--mac-red)" }}>
            {formatCzk(summary.dan_na_vystupu)}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--mac-text-tertiary)" }}>DPH↓ </span>
          <span className="font-medium tabular-nums" style={{ color: "var(--mac-green)" }}>
            {formatCzk(summary.dan_na_vstupu)}
          </span>
        </div>
      </div>

      <div
        className="mt-3 pt-2.5 flex items-center justify-between text-[12px]"
        style={{ borderTop: "1px solid var(--mac-separator)" }}
      >
        <span
          className="font-semibold tabular-nums"
          style={{
            color: summary.dph_difference > 0 ? "var(--mac-red)" : "var(--mac-green)",
          }}
        >
          K odvodu: {formatCzk(summary.dph_difference)}
        </span>
        <span style={{ color: "var(--mac-text-tertiary)" }}>
          {allVerified ? "✓ Ověřeno" : `${summary.verified_count}/${totalInvoices}`}
        </span>
      </div>

      <div className="mt-1 text-[11px]" style={{ color: "var(--mac-text-secondary)" }}>
        OCR: {summary.ocr_ok_count}/{summary.ocr_eligible_count} OK
      </div>
    </Link>
  );
}
