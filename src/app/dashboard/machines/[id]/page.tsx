"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  Badge,
  CountUp,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Panel,
  RiskBadge,
  SeverityBadge,
  StatusDot,
  fmt,
  fmtDate,
  fmtTime,
} from "@/components/ui";
import { Gauge } from "@/components/charts";
import { Bars, LineChart } from "@/components/charts";
import { useApi } from "@/lib/api";

type Payload = {
  machine: any;
  prediction: {
    health_score: number;
    failure_probability_pct: number;
    risk_level: string;
    trend: string;
    confidence: string;
    dominant_factor: string;
    factors: { label: string; contribution: number; value: string }[];
    recommendation: string;
    signals: Record<string, number>;
    anomalies: { signal: string; severity: string; detail: string }[];
  };
  history: {
    temperature: { t: string; v: number }[];
    vibration: { t: string; v: number }[];
    energy: { t: string; v: number }[];
    production: { label: string; output: number; target: number; defects: number; downtime_hours: number }[];
  };
  alerts: any[];
  maintenance: any[];
};

export default function MachineDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, loading, error, reload } = useApi<Payload>(id ? `/machines/${id}` : null);

  if (loading && !data) return <Loading rows={8} label="Loading machine record" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Machine not found" />;

  const m = data.machine;
  const p = data.prediction;

  const stat = (label: string, value: string, note?: string, tone?: string) => (
    <div key={label} className="bg-panel p-4">
      <p className="engrave">{label}</p>
      <p className={`mt-2 font-mono text-[22px] leading-none ${tone ?? "text-fg"}`}>{value}</p>
      {note && <p className="mt-2 truncate text-[12px] text-dim">{note}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/machines"
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-dim transition hover:text-led"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All machines
      </Link>

      {/* header */}
      <div className="relative overflow-hidden border border-line bg-panel p-5">
        <img
          src="/images/machine-detail.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover opacity-[0.22] md:block"
          style={{
            maskImage: "linear-gradient(to left, black 5%, transparent 80%)",
            WebkitMaskImage: "linear-gradient(to left, black 5%, transparent 80%)",
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="border border-line bg-ink px-3 py-3 text-center">
            <p className="font-mono text-[16px] text-fg">{m.code}</p>
          </div>
          <div>
            <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg">
              {m.name}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              {m.line} · {m.area} · installed {fmtDate(m.installed_on)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 border border-line px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                <StatusDot size={6} tone={m.status === "RUNNING" ? "signal" : m.status === "IDLE" ? "amber" : "red"} />
                {m.status}
              </span>
              <RiskBadge level={p.risk_level} solid />
              <Badge tone="neutral">{p.trend}</Badge>
              <Badge tone="neutral">confidence {p.confidence}</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-7">
          <div>
            <p className="engrave">Health score</p>
            <p className="mt-1.5 font-mono text-[40px] leading-none text-led">
              <CountUp value={p.health_score} decimals={0} />%
            </p>
          </div>
          <Gauge value={p.failure_probability_pct} label="Failure probability" size={200} />
        </div>
        </div>
      </div>

      {/* reading strip */}
      <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4 xl:grid-cols-6">
        {stat(
          "Temperature",
          `${fmt(p.signals.temperature_avg, 1)}°C`,
          `baseline ${fmt(m.normal_temperature, 0)}°C (${p.signals.temperature_delta > 0 ? "+" : ""}${fmt(p.signals.temperature_delta, 1)})`,
          p.signals.temperature_delta > 10 ? "text-crit" : p.signals.temperature_delta > 5 ? "text-amber" : "text-fg",
        )}
        {stat(
          "Vibration",
          `${fmt(p.signals.vibration_avg, 2)} mm/s`,
          `baseline ${fmt(m.normal_vibration, 1)} (${p.signals.vibration_delta > 0 ? "+" : ""}${fmt(p.signals.vibration_delta, 2)})`,
          p.signals.vibration_delta > 1.8 ? "text-crit" : p.signals.vibration_delta > 0.9 ? "text-amber" : "text-fg",
        )}
        {stat("Load", `${fmt((p.signals.load_avg ?? 0) * 100, 0)}%`, "average utilisation")}
        {stat("Energy draw", `${fmt(p.signals.energy_kw_avg, 1)} kW`, `${p.signals.energy_per_unit} kWh/unit`)}
        {stat("Operating hours", fmt(m.operating_hours), `${m.failure_count} recorded failures`)}
        {stat(
          "Downtime 7d",
          `${fmt(p.signals.downtime_7d_hours, 1)} h`,
          `last maintenance ${fmtDate(m.last_maintenance)}`,
          p.signals.downtime_7d_hours > 8 ? "text-crit" : "text-fg",
        )}
      </div>

      {/* prediction */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Predictive maintenance model"
          meta="Weighted model over temperature, vibration, load, hours, energy, downtime and failure history"
          action={<RiskBadge level={p.risk_level} solid />}
        >
          <ul className="space-y-3">
            {p.factors.map((factor) => (
              <li key={factor.label} className="grid grid-cols-[1fr_60px] items-center gap-4">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-fg">{factor.label}</span>
                    <span className="truncate font-mono text-[11px] text-dim">{factor.value}</span>
                  </div>
                  <div className="mt-1.5 h-[6px] w-full bg-white/[0.06]">
                    <div
                      className="h-full transition-[width] duration-700"
                      style={{
                        width: `${factor.contribution}%`,
                        background: factor.contribution > 20 ? "#d9422b" : "#e8a020",
                      }}
                    />
                  </div>
                </div>
                <span className="text-right font-mono text-[12px] tnum text-muted">
                  {factor.contribution}%
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 border border-signal/40 bg-signal/[0.07] p-4">
            <p className="engrave text-led">Recommended action</p>
            <p className="mt-2 text-[14px] leading-relaxed text-fg">{p.recommendation}</p>
            <Link
              href={`/dashboard/ai?q=${encodeURIComponent(`Tell me about ${m.code}`)}`}
              className="mt-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-led transition hover:gap-3"
            >
              Ask the AI assistant <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Panel>

        <Panel title="Detected conditions" meta="Compared against the rated baseline over 24 h">
          {p.anomalies.length === 0 ? (
            <EmptyState title="No abnormal conditions" hint="All readings are inside the rated envelope." />
          ) : (
            <ul className="space-y-3">
              {p.anomalies.map((anomaly, i) => (
                <li key={i} className="border border-line bg-ink p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg">
                      {anomaly.signal}
                    </span>
                    <SeverityBadge severity={anomaly.severity} />
                  </div>
                  <p className="mt-2 text-[13px] leading-snug text-muted">{anomaly.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* history */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Temperature" meta="Last 7 days · 4 h sampling">
          <LineChart
            labels={data.history.temperature.map((r) => r.t)}
            series={[{ name: "°C", values: data.history.temperature.map((r) => r.v), color: "#e8a020" }]}
            height={180}
            unit="°"
          />
        </Panel>

        <Panel title="Vibration" meta="Last 7 days · 4 h sampling">
          <LineChart
            labels={data.history.vibration.map((r) => r.t)}
            series={[{ name: "mm/s", values: data.history.vibration.map((r) => r.v), color: "#d9422b" }]}
            height={180}
          />
        </Panel>

        <Panel title="Energy draw" meta="kW sampled every 4 h">
          <LineChart
            labels={data.history.energy.map((r) => r.t)}
            series={[{ name: "kW", values: data.history.energy.map((r) => r.v), color: "#12a66a" }]}
            height={180}
            unit=" kW"
          />
        </Panel>

        <Panel title="Production" meta="Output vs target · 14 days">
          <Bars
            data={data.history.production.map((d) => ({ label: d.label, value: d.output, target: d.target }))}
            legend={{ primary: "Output", secondary: "Target", color: "#12a66a" }}
            valueUnit=" u"
            height={170}
          />
        </Panel>
      </div>

      {/* downtime + records */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Downtime" meta="Unplanned stop hours per day · 14 days">
          <Bars
            data={data.history.production.map((d) => ({ label: d.label, value: d.downtime_hours }))}
            legend={{ primary: "Downtime (h)", color: "#d9422b" }}
            valueUnit=" h"
            height={170}
          />
        </Panel>

        <Panel title="Alerts" meta={`${data.alerts.length} most recent`} bodyClassName="p-0">
          {data.alerts.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No alerts for this machine" />
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.alerts.map((alert) => (
                <li key={alert.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-fg">{alert.alert_type}</span>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{alert.description}</p>
                  <p className="mt-1 font-mono text-[11px] text-dim">
                    {fmtTime(alert.timestamp)} · {alert.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Maintenance" meta={`${data.maintenance.length} records`} bodyClassName="p-0">
          {data.maintenance.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No maintenance records" />
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.maintenance.map((record) => (
                <li key={record.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-fg">{record.issue}</span>
                    <Badge
                      tone={
                        record.status === "Overdue"
                          ? "red"
                          : record.status === "Predicted"
                            ? "amber"
                            : record.status === "Completed"
                              ? "emerald"
                              : "neutral"
                      }
                    >
                      {record.status}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-dim">
                    {fmtDate(record.date)} · {record.priority} priority · {record.source}
                  </p>
                  {record.notes && <p className="mt-1 text-[13px] text-muted">{record.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
