"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* primitives                                                                  */
/* -------------------------------------------------------------------------- */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`engrave ${className}`}>{children}</p>;
}

export function Panel({
  title,
  meta,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`border border-line bg-panel relative ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="engrave text-muted truncate">{title}</h2>
            {meta && <div className="mt-1 text-xs text-dim truncate">{meta}</div>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName || "p-4"}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  emerald: "text-led border-signal/40 bg-signal/10",
  signal: "text-led border-signal/40 bg-signal/10",
  amber: "text-amber border-amber/40 bg-amber/10",
  red: "text-crit border-crit/50 bg-crit/10",
  neutral: "text-muted border-line bg-white/[0.03]",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: keyof typeof TONES | string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em] ${
        TONES[tone] ?? TONES.neutral
      } ${className}`}
    >
      {children}
    </span>
  );
}

const RISK_TONE: Record<string, string> = {
  LOW: "emerald",
  MEDIUM: "amber",
  HIGH: "amber",
  CRITICAL: "red",
};

export function RiskBadge({ level, solid = false }: { level: string; solid?: boolean }) {
  const base = RISK_TONE[level] ?? "neutral";
  const solidClass =
    solid && level === "CRITICAL" ? "bg-crit text-white border-crit" : "";
  const highSolid =
    solid && level === "HIGH" ? "bg-amber text-ink border-amber" : "";
  return (
    <Badge
      tone={solid ? "neutral" : base}
      className={`${solidClass} ${highSolid} ${
        solid && level === "LOW" ? "border-signal/50 text-led" : ""
      }`}
    >
      {level}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone =
    severity === "Critical" ? "red" : severity === "Warning" ? "amber" : "neutral";
  return <Badge tone={tone}>{severity}</Badge>;
}

export function StatusDot({
  tone = "signal",
  pulse = false,
  size = 8,
}: {
  tone?: "signal" | "amber" | "red" | "dim";
  pulse?: boolean;
  size?: number;
}) {
  const color =
    tone === "signal"
      ? "#12a66a"
      : tone === "amber"
        ? "#e8a020"
        : tone === "red"
          ? "#d9422b"
          : "#6c7873";
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${pulse ? "led-pulse" : ""}`}
      style={{ width: size, height: size, background: color, boxShadow: `0 0 8px ${color}66` }}
    />
  );
}

export function healthTone(value: number): "signal" | "amber" | "red" {
  return value >= 75 ? "signal" : value >= 55 ? "amber" : "red";
}

export function HealthBar({ value, width = 92 }: { value: number; width?: number }) {
  const tone = healthTone(value);
  const color = tone === "signal" ? "#12a66a" : tone === "amber" ? "#e8a020" : "#d9422b";
  return (
    <div className="flex items-center gap-2">
      <div className="h-[5px] bg-white/[0.06]" style={{ width }}>
        <div className="h-full transition-[width] duration-500" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="font-mono text-[11px] tnum text-muted w-9 text-right">{Math.round(value)}</span>
    </div>
  );
}

export function Bar({ pct, tone = "signal" }: { pct: number; tone?: string }) {
  const color =
    tone === "red" ? "#d9422b" : tone === "amber" ? "#e8a020" : tone === "forest" ? "#0b3b2e" : "#12a66a";
  return (
    <div className="h-[6px] w-full bg-white/[0.06]">
      <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* state: loading / error / empty                                              */
/* -------------------------------------------------------------------------- */
export function Loading({ rows = 4, label = "Loading factory data" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="engrave text-dim">{label}…</p>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-9 w-full" style={{ opacity: 1 - i * 0.13 }} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border border-crit/40 bg-crit/[0.06] p-5">
      <p className="engrave text-crit">API error</p>
      <p className="mt-2 text-sm text-fg">{message}</p>
      <p className="mt-1 text-xs text-muted">
        The FastAPI service could not be reached. Data shown here always comes from the backend.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 border border-line bg-raised px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition hover:border-signal hover:text-led focus:outline-none focus-visible:ring-1 focus-visible:ring-led"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-line p-6 text-center">
      <p className="engrave text-dim">{title}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* numbers                                                                     */
/* -------------------------------------------------------------------------- */
export function CountUp({
  value,
  decimals = 0,
  duration = 700,
  suffix = "",
  prefix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
}) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = previous.current;
    const to = value;
    previous.current = value;
    if (reduce || from === to) {
      setShown(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  const text = shown.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span className="tnum">
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

export function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
