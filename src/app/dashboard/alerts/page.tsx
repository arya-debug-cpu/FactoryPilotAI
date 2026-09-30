"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import {
  Badge,
  CountUp,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  SeverityBadge,
  StatusDot,
  fmtTime,
} from "@/components/ui";
import { apiPost, useApi } from "@/lib/api";

type Alert = {
  id: number;
  machine_code: string;
  machine_name: string;
  machine_line: string;
  alert_type: string;
  severity: string;
  description: string;
  timestamp: string;
  status: string;
  source: string;
};

type Payload = {
  count: number;
  summary: {
    critical: number;
    warning: number;
    information: number;
    open: number;
    acknowledged: number;
    resolved: number;
    total: number;
  };
  alerts: Alert[];
};

const SEVERITIES = ["all", "Critical", "Warning", "Information"];
const STATUSES = ["all", "Open", "Acknowledged", "Resolved"];

export default function AlertsPage() {
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (severity !== "all") params.set("severity", severity);
  if (status !== "all") params.set("status", status);
  const query = params.toString() ? `?${params.toString()}` : "";

  const { data, loading, error, reload } = useApi<Payload>(`/alerts${query}`);

  async function resolve(alert: Alert) {
    setBusy(alert.id);
    setLocalError(null);
    try {
      await apiPost(`/alerts/${alert.id}/resolve`);
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not resolve the alert");
    } finally {
      setBusy(null);
    }
  }

  async function acknowledge(alert: Alert) {
    setBusy(alert.id);
    setLocalError(null);
    try {
      await apiPost(`/alerts/${alert.id}/acknowledge`);
      reload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not acknowledge the alert");
    } finally {
      setBusy(null);
    }
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Condition monitoring</Eyebrow>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
          Alerts
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Rule-based alerts raised from live sensor thresholds. Resolve them and the change is
          written straight to PostgreSQL.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Critical open", value: summary?.critical ?? 0, tone: "text-crit" },
          { label: "Warning open", value: summary?.warning ?? 0, tone: "text-amber" },
          { label: "Information", value: summary?.information ?? 0, tone: "text-muted" },
          { label: "Awaiting action", value: summary?.open ?? 0, tone: "text-fg" },
          { label: "Acknowledged", value: summary?.acknowledged ?? 0, tone: "text-muted" },
          { label: "Resolved", value: summary?.resolved ?? 0, tone: "text-led" },
        ].map((cell) => (
          <div key={cell.label} className="bg-panel p-4">
            <p className="engrave">{cell.label}</p>
            <p className={`mt-2 font-mono text-[27px] leading-none ${cell.tone}`}>
              <CountUp value={cell.value} />
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border border-line bg-panel p-3">
        <span className="engrave text-dim">Severity</span>
        <div className="flex flex-wrap gap-px bg-line">
          {SEVERITIES.map((item) => (
            <button
              key={item}
              onClick={() => setSeverity(item)}
              className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition focus:outline-none ${
                severity === item ? "bg-signal text-ink" : "bg-panel text-muted hover:text-fg"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="engrave ml-2 text-dim">Status</span>
        <div className="flex flex-wrap gap-px bg-line">
          {STATUSES.map((item) => (
            <button
              key={item}
              onClick={() => setStatus(item)}
              className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition focus:outline-none ${
                status === item ? "bg-signal text-ink" : "bg-panel text-muted hover:text-fg"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[11px] text-dim">
          {loading ? "…" : `${data?.count ?? 0} alerts`}
        </span>
      </div>

      {localError && <ErrorState message={localError} onRetry={() => setLocalError(null)} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={6} label="Loading alerts" />}

      {data && data.alerts.length === 0 && (
        <EmptyState title="No alerts match this filter" hint="Try a different severity or status." />
      )}

      {data && data.alerts.length > 0 && (
        <ul className="space-y-px border border-line bg-line">
          {data.alerts.map((alert) => {
            const resolved = alert.status === "Resolved";
            const edge =
              alert.severity === "Critical" ? "#d9422b" : alert.severity === "Warning" ? "#e8a020" : "#6c7873";
            return (
              <li
                key={alert.id}
                className={`flex flex-wrap items-start gap-4 bg-panel p-4 transition-colors hover:bg-raised ${
                  resolved ? "opacity-60" : ""
                }`}
              >
                <span className="mt-1.5 w-1 shrink-0 self-stretch" style={{ background: edge }} aria-hidden="true" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusDot
                      size={7}
                      tone={alert.severity === "Critical" ? "red" : alert.severity === "Warning" ? "amber" : "signal"}
                      pulse={!resolved && alert.severity === "Critical"}
                    />
                    <span className="font-mono text-[13px] text-fg">{alert.machine_code}</span>
                    <span className="text-[14px] text-fg">{alert.alert_type}</span>
                    <SeverityBadge severity={alert.severity} />
                    <Badge tone={resolved ? "emerald" : alert.status === "Acknowledged" ? "amber" : "neutral"}>
                      {alert.status}
                    </Badge>
                    <Badge tone="neutral">{alert.source}</Badge>
                  </div>
                  <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">{alert.description}</p>
                  <p className="mt-1.5 font-mono text-[11px] text-dim">
                    {alert.machine_name} · {alert.machine_line} · {fmtTime(alert.timestamp)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!resolved && (
                    <>
                      {alert.status === "Open" && (
                        <button
                          onClick={() => acknowledge(alert)}
                          disabled={busy === alert.id}
                          className="inline-flex items-center gap-2 border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:border-amber hover:text-amber disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => resolve(alert)}
                        disabled={busy === alert.id}
                        className="inline-flex items-center gap-2 border border-signal/50 bg-signal/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-led transition hover:bg-signal/20 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {busy === alert.id ? "Saving…" : "Resolve"}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
