import { Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

export function RootLayout() {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [searchMonth, setSearchMonth] = useState("");
  const [searchDirection, setSearchDirection] = useState<"" | "incoming" | "outgoing">("");

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 30_000,
  });

  const ollamaRunning = health.data?.ollama?.running ?? false;

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const onboardingMissing = useMemo(() => {
    const data = settings.data;
    if (!data) return false;
    return !data.dic?.trim() || !data.c_ufo?.trim() || !data.icloud_base_path?.trim();
  }, [settings.data]);

  const searchResults = useQuery({
    queryKey: ["search", search, searchMonth, searchDirection],
    queryFn: () => api.search({ q: search, month: searchMonth || undefined, direction: searchDirection || undefined }),
    enabled: search.trim().length >= 2 || !!searchMonth || !!searchDirection,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey) return;

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("app:save"));
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        const currentMonth = new Date().toISOString().slice(0, 7);
        void navigate({ to: "/months/$month", params: { month: currentMonth } });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ─── macOS Tahoe Sidebar ─── */}
      <aside
        className="flex flex-col w-[220px] shrink-0 select-none"
        style={{
          background: "var(--mac-sidebar)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          borderRight: "1px solid var(--mac-sidebar-border)",
        }}
      >
        {/* Titlebar drag region */}
        <div
          data-tauri-drag-region
          className="h-[var(--mac-titlebar-height)] shrink-0 flex items-end px-4 pb-2"
        >
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--mac-text-tertiary)" }}
          >
            Invoices
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-1 space-y-0.5">
          <SidebarSection label="Obecné">
            <SidebarLink to="/" icon="house" label="Přehled" exact />
            <SidebarLink to="/months" icon="calendar" label="Měsíce" />
            <SidebarLink to="/overview" icon="chart" label="Roční přehled" />
          </SidebarSection>

          <SidebarSection label="Systém">
            <SidebarLink to="/settings" icon="gearshape" label="Nastavení" />
          </SidebarSection>

          <SidebarSection label="Hledat">
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Číslo, dodavatel, částka…"
              className="w-full px-2.5 py-[6px] rounded-md text-[12px] outline-none"
              style={{
                background: "var(--mac-input-bg)",
                border: "1px solid var(--mac-input-border)",
                color: "var(--mac-text-primary)",
              }}
            />
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <input
                value={searchMonth}
                onChange={(e) => setSearchMonth(e.target.value)}
                placeholder="YYYY-MM"
                className="w-full px-2 py-[5px] rounded-md text-[11px] outline-none"
                style={{ background: "var(--mac-input-bg)", border: "1px solid var(--mac-input-border)", color: "var(--mac-text-primary)" }}
              />
              <select
                value={searchDirection}
                onChange={(e) => setSearchDirection(e.target.value as "" | "incoming" | "outgoing")}
                className="w-full px-2 py-[5px] rounded-md text-[11px] outline-none"
                style={{ background: "var(--mac-input-bg)", border: "1px solid var(--mac-input-border)", color: "var(--mac-text-primary)" }}
              >
                <option value="">Směr: vše</option>
                <option value="incoming">Přijaté</option>
                <option value="outgoing">Vydané</option>
              </select>
            </div>
            {(search.trim().length >= 2 || !!searchMonth || !!searchDirection) && (
              <div className="mt-1.5 rounded-md overflow-hidden" style={{ border: "1px solid var(--mac-separator)" }}>
                {searchResults.data?.length ? (
                  searchResults.data.slice(0, 8).map((row) => (
                    <Link
                      key={row.id}
                      to="/months/$month/invoices/$id"
                      params={{ month: row.month, id: row.id }}
                      className="block px-2.5 py-1.5 text-[11px]"
                      style={{ color: "var(--mac-text-primary)", borderTop: "1px solid var(--mac-separator)" }}
                    >
                      <div className="font-medium truncate">{row.cislo_faktury ?? row.file_name}</div>
                      <div style={{ color: "var(--mac-text-tertiary)" }} className="truncate">
                        {row.month} · {row.dodavatel_nazev ?? row.odberatel_nazev ?? "Bez názvu"}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="px-2.5 py-2 text-[11px]" style={{ color: "var(--mac-text-tertiary)" }}>
                    Bez výsledků
                  </div>
                )}
              </div>
            )}
          </SidebarSection>
        </nav>

        {/* Status bar */}
        <div
          className="px-4 py-3 flex items-center gap-2 text-[11px] shrink-0"
          style={{
            borderTop: "1px solid var(--mac-separator)",
            color: "var(--mac-text-secondary)",
          }}
        >
          <span
            className="w-[6px] h-[6px] rounded-full shrink-0"
            style={{
              background: ollamaRunning ? "var(--mac-green)" : "var(--mac-red)",
              boxShadow: ollamaRunning
                ? "0 0 4px var(--mac-green)"
                : "0 0 4px var(--mac-red)",
            }}
          />
          Ollama {ollamaRunning ? "připojeno" : "nedostupné"}
        </div>
      </aside>

      {/* ─── Content Area ─── */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ background: "var(--mac-content-bg)" }}
      >
        {/* Inset titlebar drag area */}
        <div
          data-tauri-drag-region
          className="h-[var(--mac-titlebar-height)] shrink-0"
          style={{ borderBottom: "1px solid var(--mac-separator)" }}
        >
          <div className="h-full flex items-center px-6">
            <PageTitle />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-8 py-6">
            {onboardingMissing && (
              <div
                className="mb-4 rounded-lg px-3 py-2.5 text-[12px] flex items-center justify-between"
                style={{
                  background: "rgba(255,159,10,0.1)",
                  border: "1px solid rgba(255,159,10,0.2)",
                  color: "var(--mac-yellow)",
                }}
              >
                <span>Doplňte DIČ, číslo FÚ a iCloud cestu v Nastavení.</span>
                <Link to="/settings" className="font-semibold" style={{ color: "var(--mac-accent)" }}>
                  Otevřít Nastavení
                </Link>
              </div>
            )}
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─── Sidebar Components ─── */

function SidebarSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-3 first:pt-0">
      <span
        className="block px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--mac-text-tertiary)" }}
      >
        {label}
      </span>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  label,
  exact,
}: {
  to: string;
  icon: string;
  label: string;
  exact?: boolean;
}) {
  const iconMap: Record<string, string> = {
    house: "🏠",
    calendar: "📅",
    chart: "📈",
    gearshape: "⚙️",
  };

  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      activeProps={{
        className:
          "flex items-center gap-2.5 px-2.5 py-[5px] rounded-md text-[13px] font-medium",
        style: {
          background: "var(--mac-nav-active)",
          color: "var(--mac-nav-active-text)",
        },
      }}
      inactiveProps={{
        className:
          "flex items-center gap-2.5 px-2.5 py-[5px] rounded-md text-[13px] transition-colors duration-100",
        style: { color: "var(--mac-text-primary)" },
      }}
    >
      <span className="text-sm w-5 text-center">{iconMap[icon] ?? "•"}</span>
      {label}
    </Link>
  );
}

function PageTitle() {
  const matches = useMatches();
  const last = matches[matches.length - 1];
  const path = last?.pathname ?? "/";

  const titles: Record<string, string> = {
    "/": "Přehled",
    "/months": "Měsíce",
    "/overview": "Roční přehled",
    "/settings": "Nastavení",
  };

  let title = titles[path];
  if (!title) {
    if (path.includes("/kh")) title = "Kontrolní hlášení";
    else if (path.includes("/invoices/")) title = "Detail faktury";
    else if (path.match(/\/months\/\d{4}-\d{2}$/)) title = "Detail měsíce";
    else title = "Invoices";
  }

  return (
    <h1
      className="text-[15px] font-semibold"
      style={{ color: "var(--mac-text-primary)" }}
    >
      {title}
    </h1>
  );
}
