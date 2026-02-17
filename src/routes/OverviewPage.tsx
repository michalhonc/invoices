import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatCzk, formatMonth } from "./DashboardPage";

export function OverviewPage() {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState(currentYear);

  const summary = useQuery({
    queryKey: ["overview", year],
    queryFn: () => api.getYearSummary(year),
  });

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => String(now - i));
  }, []);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold" style={{ color: "var(--mac-text-primary)" }}>
          Roční přehled
        </span>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="px-2.5 py-[5px] rounded-md text-[13px]"
          style={{
            background: "var(--mac-input-bg)",
            border: "1px solid var(--mac-input-border)",
            color: "var(--mac-text-primary)",
          }}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {summary.data && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Přijaté" value={String(summary.data.totals.incoming_count)} />
          <Stat label="Vydané" value={String(summary.data.totals.outgoing_count)} />
          <Stat label="K odvodu" value={formatCzk(summary.data.totals.dph_difference)} />
        </div>
      )}

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
          style={{ borderBottom: "1px solid var(--mac-separator)", color: "var(--mac-text-primary)" }}
        >
          Měsíce v roce {year}
        </div>

        {summary.data?.months.map((month, index) => (
          <Link
            key={month.month}
            to="/months/$month"
            params={{ month: month.month }}
            className="flex items-center justify-between px-4 py-2 text-[13px]"
            style={{
              borderTop: index > 0 ? "1px solid var(--mac-separator)" : undefined,
              color: "var(--mac-text-primary)",
            }}
          >
            <span>{formatMonth(month.month)}</span>
            <span className="tabular-nums" style={{ color: "var(--mac-text-secondary)" }}>
              {formatCzk(month.dph_difference)}
            </span>
          </Link>
        ))}

        {summary.data && summary.data.months.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--mac-text-tertiary)" }}>
            Žádná data pro tento rok
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--mac-surface)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--mac-text-tertiary)" }}>
        {label}
      </div>
      <div className="text-[16px] font-bold mt-0.5 tabular-nums" style={{ color: "var(--mac-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}