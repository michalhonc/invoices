import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";

export function DashboardPage() {
  const queryClient = useQueryClient();

  const months = useQuery({
    queryKey: ["months"],
    queryFn: api.getMonths,
  });

  const scanMutation = useMutation({
    mutationFn: api.scan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["months"] });
    },
  });

  const currentMonth = new Date().toISOString().slice(0, 7);
  const current = months.data?.find((m) => m.month === currentMonth);

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <MacButton
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          variant="secondary"
        >
          {scanMutation.isPending ? "Skenování…" : "Skenovat složky"}
        </MacButton>
      </div>

      {scanMutation.data && (
        <MacBanner variant="success">
          Nalezeno {scanMutation.data.newFiles} nových souborů v{" "}
          {scanMutation.data.months.length} měsících
        </MacBanner>
      )}

      {/* Current month overview */}
      {current && (
        <MacGroup>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] font-semibold" style={{ color: "var(--mac-text-primary)" }}>
                {formatMonth(current.month)}
              </span>
              <KhStatusBadge status={current.kh_status} />
            </div>
            <Link
              to="/months/$month"
              params={{ month: current.month }}
              className="text-[12px] font-medium"
              style={{ color: "var(--mac-accent)" }}
            >
              Zobrazit detail →
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="Přijaté"
              value={String(current.incoming_count)}
              sub={formatCzk(current.incoming_total)}
            />
            <StatTile
              label="Vydané"
              value={String(current.outgoing_count)}
              sub={formatCzk(current.outgoing_total)}
            />
            <StatTile
              label="DPH výstup"
              value={formatCzk(current.dan_na_vystupu)}
              color="var(--mac-red)"
            />
            <StatTile
              label="DPH vstup"
              value={formatCzk(current.dan_na_vstupu)}
              color="var(--mac-green)"
            />
          </div>

          <div
            className="mt-4 pt-3 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--mac-separator)" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[12px]" style={{ color: "var(--mac-text-secondary)" }}>
                K odvodu
              </span>
              <span
                className="text-[15px] font-bold tabular-nums"
                style={{
                  color: current.dph_difference > 0 ? "var(--mac-red)" : "var(--mac-green)",
                }}
              >
                {formatCzk(current.dph_difference)}
              </span>
            </div>
            <span className="text-[12px]" style={{ color: "var(--mac-text-secondary)" }}>
              Ověřeno {current.verified_count}/{current.total_count}
            </span>
          </div>
        </MacGroup>
      )}

      {/* Checklist */}
      {current && (
        <MacGroup>
          <h3 className="text-[13px] font-semibold mb-3" style={{ color: "var(--mac-text-primary)" }}>
            Měsíční checklist
          </h3>
          <div className="space-y-2">
            <CheckItem done={current.total_count > 0} label="Faktury nahrány a zpracovány" />
            <CheckItem
              done={current.verified_count === current.total_count && current.total_count > 0}
              label="Všechny OCR výsledky manuálně ověřeny"
            />
            <CheckItem
              done={current.kh_status === "generated" || current.kh_status === "submitted"}
              label="Kontrolní hlášení vygenerováno"
            />
            <CheckItem
              done={current.kh_status === "submitted"}
              label="Kontrolní hlášení odesláno"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <Link to="/months/$month" params={{ month: current.month }}>
              <MacButton variant="secondary">Spravovat faktury</MacButton>
            </Link>
            <Link to="/months/$month/kh" params={{ month: current.month }}>
              <MacButton variant="primary">Kontrolní hlášení</MacButton>
            </Link>
          </div>
        </MacGroup>
      )}

      {/* Recent months */}
      {months.data && months.data.length > 0 && (
        <MacGroup>
          <h3 className="text-[13px] font-semibold mb-3" style={{ color: "var(--mac-text-primary)" }}>
            Přehled měsíců
          </h3>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--mac-group-border)" }}>
            {months.data.slice(0, 8).map((m, i) => (
              <Link
                key={m.month}
                to="/months/$month"
                params={{ month: m.month }}
                className="flex items-center justify-between px-3 py-2.5 text-[13px] transition-colors"
                style={{
                  borderTop: i > 0 ? "1px solid var(--mac-separator)" : undefined,
                  color: "var(--mac-text-primary)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{formatMonth(m.month)}</span>
                  <span style={{ color: "var(--mac-text-tertiary)" }}>
                    {m.incoming_count + m.outgoing_count} faktur
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums" style={{ color: "var(--mac-text-secondary)" }}>
                    {formatCzk(m.dph_difference)}
                  </span>
                  <KhStatusBadge status={m.kh_status} />
                  <span style={{ color: "var(--mac-text-tertiary)" }}>›</span>
                </div>
              </Link>
            ))}
          </div>
        </MacGroup>
      )}

      {months.isLoading && (
        <div className="text-center py-12 text-[13px]" style={{ color: "var(--mac-text-secondary)" }}>
          Načítání…
        </div>
      )}

      {months.data?.length === 0 && !months.isLoading && (
        <div className="text-center py-16">
          <p className="text-[13px] mb-4" style={{ color: "var(--mac-text-secondary)" }}>
            Zatím žádné faktury. Nahrajte soubory do iCloud Drive složky nebo klikněte na „Skenovat složky".
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Shared macOS components ─── */

export function MacBanner({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) {
  const isSuccess = variant === "success";
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-[12px]"
      style={{
        background: isSuccess ? "rgba(52,199,89,0.08)" : "rgba(255,59,48,0.08)",
        color: isSuccess ? "var(--mac-green)" : "var(--mac-red)",
        border: `1px solid ${isSuccess ? "rgba(52,199,89,0.15)" : "rgba(255,59,48,0.15)"}`,
      }}
    >
      {children}
    </div>
  );
}

function MacGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--mac-group-bg)",
        border: "1px solid var(--mac-group-border)",
        boxShadow: "0 0.5px 1px rgba(0,0,0,0.04)",
      }}
    >
      {children}
    </div>
  );
}

export function MacButton({
  children,
  onClick,
  disabled,
  variant = "secondary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center px-3.5 py-[5px] rounded-md text-[13px] font-medium transition-all duration-100 disabled:opacity-40 cursor-default";

  const variants = {
    primary: {
      background: "var(--mac-accent)",
      color: "#ffffff",
      boxShadow: "0 0.5px 1px rgba(0,0,0,0.15),inset 0 0.5px 0 rgba(255,255,255,0.15)",
    },
    secondary: {
      background: "var(--mac-surface)",
      color: "var(--mac-text-primary)",
      boxShadow: "0 0.5px 1px rgba(0,0,0,0.06),inset 0 0.5px 0 rgba(255,255,255,0.5)",
    },
    danger: {
      background: "var(--mac-red)",
      color: "#ffffff",
      boxShadow: "0 0.5px 1px rgba(0,0,0,0.15),inset 0 0.5px 0 rgba(255,255,255,0.15)",
    },
  };

  return (
    <button className={base} style={variants[variant]} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: "var(--mac-surface)" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--mac-text-tertiary)" }}>
        {label}
      </div>
      <div className="text-[18px] font-bold mt-0.5 tabular-nums" style={{ color: color ?? "var(--mac-text-primary)" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: "var(--mac-text-secondary)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
        style={{
          background: done ? "var(--mac-green)" : "var(--mac-surface)",
          color: done ? "#fff" : "var(--mac-text-tertiary)",
          boxShadow: done ? undefined : "inset 0 0 0 1px var(--mac-input-border)",
        }}
      >
        {done ? "✓" : ""}
      </span>
      <span
        className="text-[13px]"
        style={{ color: done ? "var(--mac-text-secondary)" : "var(--mac-text-primary)" }}
      >
        {label}
      </span>
    </div>
  );
}

export function KhStatusBadge({ status }: { status: string | null }) {
  const config = {
    generated: { bg: "rgba(255,159,10,0.12)", color: "var(--mac-yellow)", label: "Vygenerováno" },
    submitted: { bg: "rgba(52,199,89,0.12)", color: "var(--mac-green)", label: "Odesláno" },
  } as Record<string, { bg: string; color: string; label: string }>;

  const c = config[status ?? ""] ?? {
    bg: "var(--mac-badge-gray-bg)",
    color: "var(--mac-badge-gray-text)",
    label: "Koncept",
  };

  return (
    <span
      className="inline-flex px-2 py-[2px] rounded-md text-[11px] font-medium"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

export function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const names = [
    "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
  ];
  return `${names[parseInt(m) - 1]} ${year}`;
}

export function formatCzk(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
