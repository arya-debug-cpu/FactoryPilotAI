"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  ClipboardList,
  Cpu,
  LayoutGrid,
  Menu,
  MessageSquareText,
  RefreshCw,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { StatusDot } from "@/components/ui";
import { apiGet, useApi, useClock } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/machines", label: "Machines", icon: Cpu },
  { href: "/dashboard/production", label: "Production", icon: BarChart3 },
  { href: "/dashboard/orders", label: "Orders", icon: ClipboardList },
  { href: "/dashboard/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/dashboard/energy", label: "Energy", icon: Zap },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/ai", label: "AI Assistant", icon: MessageSquareText },
];

type Health = { status: string; service?: string };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const now = useClock();

  useEffect(() => {
    setMounted(true);
  }, []);
  const { data: health } = useApi<Health>("/health");
  const [lastReload, setLastReload] = useState(Date.now());

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const active =
    NAV.find((item) => pathname === item.href) ??
    NAV.find((item) => item.href !== "/dashboard" && pathname.startsWith(item.href)) ??
    NAV[0];
  const online = health?.status === "ok";

  return (
    <div className="min-h-screen bg-ink">
      {/* ------------------------------------------------ sidebar ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col border-r border-line bg-[#0c100f] transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
              <rect x="1" y="1" width="30" height="30" fill="#0b3b2e" stroke="#12a66a" strokeWidth="1.5" />
              <path d="M6 22.5 L6 9.5 L11.5 9.5" fill="none" stroke="#e9efeb" strokeWidth="2.2" />
              <path d="M6 15.6 L10.6 15.6" fill="none" stroke="#e9efeb" strokeWidth="2.2" />
              <path d="M15 22.5 L15 9.5 L20.5 9.5 L20.5 15.2 L15 15.2" fill="none" stroke="#12a66a" strokeWidth="2.2" />
              <path d="M24.5 9.5 L24.5 22.5" fill="none" stroke="#e8a020" strokeWidth="2.2" />
              <circle cx="24.5" cy="6.4" r="1.7" fill="#34d399" />
            </svg>
            <span className="font-semibold tracking-tight text-fg text-[14px]">
              FactoryPilot
              <span className="ml-1.5 font-mono text-[11px] tracking-[0.2em] text-led">AI</span>
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="text-muted hover:text-flg lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <p className="engrave px-5 pb-3">Operations</p>
          <ul>
            {NAV.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`group flex items-center gap-3 border-l-2 px-5 py-2.5 text-[14px] transition-colors ${
                      isActive
                        ? "border-signal bg-signal/[0.08] text-fg"
                        : "border-transparent text-muted hover:border-line hover:bg-white/[0.03] hover:text-fg"
                    } focus:outline-none focus-visible:bg-white/[0.05]`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${isActive ? "text-led" : "text-dim group-hover:text-muted"}`}
                      strokeWidth={1.6}
                    />
                    {item.label}
                    {item.label === "Alerts" && (
                      <span className="ml-auto font-mono text-[10px] text-amber">•</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-line px-5 py-4">
          <p className="engrave">Plant</p>
          <p className="mt-1.5 text-[13px] text-fg">Plant 04 — Kestrel Works</p>
          <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted">
            <StatusDot size={6} tone={online ? "signal" : "red"} pulse={!online} />
            {online ? "FastAPI · PostgreSQL" : "API connecting…"}
          </p>
          <Link
            href="/"
            className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-dim transition hover:text-led"
          >
            ← Back to site
          </Link>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ------------------------------------------------ content ---------- */}
      <div className="lg:pl-[250px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line bg-ink/90 px-4 backdrop-blur-md lg:px-7">
          <button
            onClick={() => setOpen(true)}
            className="text-muted hover:text-fg lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-fg">
              {active.label}
            </h1>
            <span className="hidden font-mono text-[11px] text-dim sm:inline">
              /dashboard{active.href.replace("/dashboard", "")}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[11px] tnum text-muted sm:inline">
              {mounted ? now.toLocaleTimeString(undefined, { hour12: false }) : "--:--:--"}
            </span>
            <button
              onClick={() => setLastReload(Date.now())}
              className="hidden items-center gap-2 border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:border-signal hover:text-led focus:outline-none focus-visible:border-led sm:inline-flex"
              title="The backend computes every value on request"
            >
              <RefreshCw className="h-3 w-3" />
              Live
            </button>
            <span className="inline-flex items-center gap-2 border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              <StatusDot size={6} tone={online ? "signal" : "red"} pulse={!online} />
              {online ? "Connected" : "Offline"}
            </span>
          </div>
          <span className="sr-only">{lastReload}</span>
        </header>

        <main className="grid-etch px-4 py-6 lg:px-7 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
