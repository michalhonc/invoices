import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { homeDir } from "@tauri-apps/api/path";
import { api, type Invoice } from "../lib/api";
import { KhStatusBadge, MacBanner, MacButton, formatMonth, formatCzk } from "./DashboardPage";

export function MonthDetailPage() {
  const { month } = useParams({ from: "/months/$month" });
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDir, setUploadDir] = useState<"incoming" | "outgoing">("incoming");
  const [dragOver, setDragOver] = useState(false);
  const [ocrJobId, setOcrJobId] = useState<string | null>(null);
  const [folderOpenError, setFolderOpenError] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: ["months", month],
    queryFn: () => api.getMonth(month),
  });

  const invoices = useQuery({
    queryKey: ["months", month, "invoices"],
    queryFn: () => api.getMonthInvoices(month),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadInvoice(month, uploadDir, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["months", month] });
    },
  });

  const ocrMutation = useMutation({
    mutationFn: (id: string) => api.runOcr(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["months", month] });
    },
  });

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const incoming = invoices.data?.filter((i) => i.direction === "incoming") ?? [];
  const outgoing = invoices.data?.filter((i) => i.direction === "outgoing") ?? [];

  const ocrQueue = useQuery({
    queryKey: ["ocr-queue", ocrJobId],
    queryFn: () => api.getOcrQueueStatus(ocrJobId!),
    enabled: !!ocrJobId,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 1000;
      return data.status === "done" ? false : 1000;
    },
  });

  const openMonthFolder = async () => {
    setFolderOpenError(null);
    const base = settings.data?.icloud_base_path?.trim();
    if (!base) return;

    try {
      const userHome = await homeDir();
      const resolvedBase = base.startsWith("~/")
        ? `${userHome}${base.slice(2)}`
        : base === "~"
          ? userHome
          : base;
      const folderPath = `${resolvedBase}/${month}`;
      await openPath(folderPath);
    } catch (error) {
      let msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
        msg += '\n\nOtevření složky bylo zablokováno oprávněními systému macOS.\nPovolte aplikaci přístup k souborům ve "Nastavení systému > Ochrana soukromí a zabezpečení > Soubory a složky".';
      }
      setFolderOpenError(msg);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      uploadMutation.mutate(file);
    }
    e.target.value = "";
  };

  const handleDroppedFiles = (files: FileList) => {
    for (const file of Array.from(files)) {
      uploadMutation.mutate(file);
    }
  };

  const runOcrAll = async () => {
    const unverified = invoices.data?.filter(
      (i) => !i.data?.manually_verified && !i.data?.ocr_confidence &&
        ["pdf", "jpg", "jpeg", "png"].includes(i.file_type)
    ) ?? [];

    if (unverified.length === 0) {
      return;
    }

    const queued = await api.enqueueOcr(unverified.map((inv) => inv.id));
    setOcrJobId(queued.job_id);
  };

  const queueLabel = (() => {
    if (!ocrQueue.data) return "OCR všech";
    if (ocrQueue.data.status === "done") return "OCR hotovo";
    const finished = ocrQueue.data.done + ocrQueue.data.failed + ocrQueue.data.skipped;
    return `OCR ${finished}/${ocrQueue.data.total}`;
  })();

  const queueRunning = ocrQueue.data != null && ocrQueue.data.status !== "done";

  useEffect(() => {
    if (ocrQueue.data?.status === "done") {
      queryClient.invalidateQueries({ queryKey: ["months", month] });
      queryClient.invalidateQueries({ queryKey: ["months", month, "invoices"] });
    }
  }, [ocrQueue.data?.status, queryClient, month]);

  const onDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files?.length) {
      handleDroppedFiles(event.dataTransfer.files);
    }
  };

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/months"
            className="text-[13px] font-medium"
            style={{ color: "var(--mac-accent)" }}
          >
            ← Měsíce
          </Link>
          <span className="text-[15px] font-semibold" style={{ color: "var(--mac-text-primary)" }}>
            {formatMonth(month)}
          </span>
          {summary.data && <KhStatusBadge status={summary.data.kh_status} />}
        </div>

        <div className="flex items-center gap-2">
          <MacButton onClick={openMonthFolder}>
            Otevřít složku
          </MacButton>
          <MacButton onClick={() => void runOcrAll()} disabled={queueRunning}>
            {queueLabel}
          </MacButton>
          <Link to="/months/$month/kh" params={{ month }}>
            <MacButton variant="primary">Kontrolní hlášení</MacButton>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      {summary.data && (
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: "Přijaté", value: String(summary.data.incoming_count) },
            { label: "Vydané", value: String(summary.data.outgoing_count) },
            { label: "DPH výstup", value: formatCzk(summary.data.dan_na_vystupu), color: "var(--mac-red)" },
            { label: "DPH vstup", value: formatCzk(summary.data.dan_na_vstupu), color: "var(--mac-green)" },
            {
              label: "K odvodu",
              value: formatCzk(summary.data.dph_difference),
              color: summary.data.dph_difference > 0 ? "var(--mac-red)" : "var(--mac-green)",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-lg px-3 py-2" style={{ background: "var(--mac-surface)" }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--mac-text-tertiary)" }}>
                {s.label}
              </div>
              <div className="text-[16px] font-bold mt-0.5 tabular-nums" style={{ color: s.color ?? "var(--mac-text-primary)" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.data && (
        <div className="text-[12px]" style={{ color: "var(--mac-text-secondary)" }}>
          OCR stav: {summary.data.ocr_ok_count}/{summary.data.ocr_eligible_count} OK
        </div>
      )}

      {folderOpenError && (
        <MacBanner variant="error">Otevření složky selhalo: {folderOpenError}</MacBanner>
      )}

      {/* Upload bar */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          background: "var(--mac-group-bg)",
          border: dragOver ? "1px solid var(--mac-accent)" : "1px solid var(--mac-group-border)",
          boxShadow: "0 0.5px 1px rgba(0,0,0,0.04)",
        }}
      >
        <MacSelect
          value={uploadDir}
          onChange={(v) => setUploadDir(v as "incoming" | "outgoing")}
          options={[
            { value: "incoming", label: "Přijaté" },
            { value: "outgoing", label: "Vydané" },
          ]}
        />
        <MacButton onClick={() => fileInputRef.current?.click()}>Nahrát fakturu</MacButton>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.isdoc,.xml,.csv"
          onChange={handleFileUpload}
          className="hidden"
        />
        {uploadMutation.isPending && (
          <span className="text-[12px]" style={{ color: "var(--mac-text-secondary)" }}>
            Nahrávání…
          </span>
        )}
        {!uploadMutation.isPending && (
          <span className="text-[12px]" style={{ color: "var(--mac-text-tertiary)" }}>
            Přetáhněte soubory sem
          </span>
        )}
      </div>

      {/* Invoice lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InvoiceList title="Přijaté" invoices={incoming} month={month} onOcr={(id) => ocrMutation.mutate(id)} ocrPending={ocrMutation.isPending} />
        <InvoiceList title="Vydané" invoices={outgoing} month={month} onOcr={(id) => ocrMutation.mutate(id)} ocrPending={ocrMutation.isPending} />
      </div>
    </div>
  );
}

function InvoiceList({
  title,
  invoices,
  month,
  onOcr,
  ocrPending,
}: {
  title: string;
  invoices: Invoice[];
  month: string;
  onOcr: (id: string) => void;
  ocrPending: boolean;
}) {
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
        {title}
        <span className="ml-1.5 font-normal" style={{ color: "var(--mac-text-tertiary)" }}>
          {invoices.length}
        </span>
      </div>

      {invoices.length === 0 && (
        <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--mac-text-tertiary)" }}>
          Žádné faktury
        </div>
      )}

      {invoices.map((inv, i) => (
        <div
          key={inv.id}
          className="flex items-center justify-between px-4 py-2 transition-colors"
          style={{
            borderTop: i > 0 ? "1px solid var(--mac-separator)" : undefined,
          }}
        >
          <Link
            to="/months/$month/invoices/$id"
            params={{ month, id: inv.id }}
            className="flex-1 min-w-0 flex items-center gap-2.5"
          >
            <FileIcon type={inv.file_type} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate" style={{ color: "var(--mac-text-primary)" }}>
                {inv.data?.cislo_faktury ?? inv.file_name}
              </div>
              <div className="text-[11px] flex items-center gap-2" style={{ color: "var(--mac-text-tertiary)" }}>
                {inv.data?.dodavatel_nazev && <span>{inv.data.dodavatel_nazev}</span>}
                {inv.data?.celkem ? (
                  <span className="tabular-nums font-medium">{formatCzk(inv.data.celkem)}</span>
                ) : null}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2 ml-2 shrink-0">
            {["pdf", "jpg", "jpeg", "png"].includes(inv.file_type) && (
              <span
                className="px-1.5 py-[1px] rounded text-[10px] font-semibold"
                style={{
                  background: inv.data?.ocr_confidence != null ? "rgba(52,199,89,0.12)" : "rgba(255,59,48,0.12)",
                  color: inv.data?.ocr_confidence != null ? "var(--mac-green)" : "var(--mac-red)",
                }}
              >
                {inv.data?.ocr_confidence != null ? "OCR OK" : "OCR NOT OK"}
              </span>
            )}
            {inv.data?.kh_section && (
              <span
                className="px-1.5 py-[1px] rounded text-[10px] font-semibold"
                style={{ background: "rgba(0,122,255,0.1)", color: "var(--mac-accent)" }}
              >
                {inv.data.kh_section}
              </span>
            )}
            {inv.data?.manually_verified ? (
              <span className="text-[11px]" style={{ color: "var(--mac-green)" }}>✓</span>
            ) : (
              <button
                onClick={(e) => { e.preventDefault(); onOcr(inv.id); }}
                disabled={ocrPending}
                className="px-2 py-[2px] rounded text-[11px] font-medium transition-colors disabled:opacity-40 cursor-default"
                style={{ background: "rgba(175,82,222,0.1)", color: "#af52de" }}
              >
                OCR
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    pdf: "📄", jpg: "🖼️", jpeg: "🖼️", png: "🖼️",
    isdoc: "📋", xml: "📋", csv: "📊",
  };
  return <span className="text-sm shrink-0">{icons[type] ?? "📎"}</span>;
}

function MacSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-[5px] rounded-md text-[13px] border-none outline-none cursor-default appearance-none pr-6"
      style={{
        background: "var(--mac-surface)",
        color: "var(--mac-text-primary)",
        boxShadow: "0 0.5px 1px rgba(0,0,0,0.06),inset 0 0.5px 0 rgba(255,255,255,0.5)",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='%2386868b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
