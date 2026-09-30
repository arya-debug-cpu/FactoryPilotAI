"use client";

import Link from "next/link";
import { ArrowRight, RefreshCw, TriangleAlert } from "lucide-react";
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
  fmtTime,
} from "@/components/ui";
import { Bars, CompareRows, Donut, LineChart, Sparkline } from "@/components/charts";
import { useApi } from "@/lib/api";

const TONE_COLOR: Record<string, string> = {
  emerald: "#12a66a",
  signal: "#12a66a",
  amber: "#e8a020",
  red: "#d9422b",
  neutral: "#6c7873",
};

type Kpi = {
  key: string;
  label: string;
  value: number;
  unit: string;
  sub: string;
  tone: string;
  spark: number[];
};

type Payload = {
  generated_at: string;
  plant: { name: string; shift: string; machines_total: number };
  kpis: Kpi[];
  production: {
    today_output: number;
    today_target: number;
    achievement_pct: number;
    defect_rate: number;
    downtime_hours_today: number;
    daily: { label: string; output: number; target: number; defects: number; downtime_hours: number }[];
    vs_target: { code: string; name: string; output: number; target: number; pct: number; defects: number }[];
  };
  machines: {
    healthy: number;
    warning: number;
    critical: number;
    offline: number;
    health_average: number;
    risk_counts: Record<string, number>;
    items: any[];
  };
  alerts: {
    critical: number;
    warning: number;
    open: number;
    recent: any[];
  };
  orders: { active: number; delayed: number; completed: number; pending: number; total: number; completion_pct: number };
  energy: { today_kwh: number; week_kwh: number; kwh_per_unit: number };
  maintenance: { overdue: number; predicted: number; upcoming: number };
  insights: { category: string; severity: string; title: string; body: string; action: string }[];
  workflow: {
    machine_code: string;
    machine_name: string;
    detect: { signal: string; severity: string; detail: string }[];
    predict: {
      health_score: number;
      failure_probability_pct: number;
      risk_level: string;
      trend: string;
      dominant_factor: string;
      factors: { label: string; contribution: number; value: string }[];
    };
    recommend: string;
  } | null;
};

function decimalsFor(value: number): number {
  if (Number.isInteger(value)) return 0;
  return Math.abs(value) < 10 ? 2 : 1;
}

export default function OverviewPage() {
  const { data, loading, error, reload } = useApi<Payload>("/dashboard");

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Loading rows={6} label="Loading plant overview" />
      </div>
    );
  }
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="No data returned" hint="The backend returned an empty payload." />;

  const wf = data.workflow;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ header ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{data.plant.name} · {data.plant.shift}</Eyebrow>
          <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
            Plant overview
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Every value below is computed by the FastAPI backend from PostgreSQL ·{" "}
            <span className="font-mono text-dim">updated {fmtTime(data.generated_at)}</span>
          </p>
        </div>
        <button
          onClick={reload}
          className="inline-flex items-center gap-2 border border-line bg-panel px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:border-signal hover:text-led focus:outline-none focus-visible:border-led"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}

      {/* ------------------------------------- instrument cluster ---------- */}
      <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
        {data.kpis.map((kpi) => (
          <div key={kpi.key} className="group bg-panel p-4 transition-colors hover:bg-raised">
            <div className="flex items-start justify-between gap-2">
              <p className="engrave">{kpi.label}</p>
              <span
                className="mt-[3px] h-2 w-2 shrink-0"
                style={{ background: TONE_COLOR[kpi.tone] ?? TONE_COLOR.neutral }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span
                className="font-mono text-[27px] leading-none"
                style={{ color: kpi.tone === "red" ? "#d9422b" : kpi.tone === "amber" ? "#e8a020" : "#e9efeb" }}
              >
                <CountUp value={kpi.value} decimals={decimalsFor(kpi.value)} />
              </span>
              <span className="font-mono text-[11px] text-dim">{kpi.unit}</span>
            </p>
            <p className="mt-2 truncate text-[12px] text-muted">{kpi.sub}</p>
            {kpi.spark.length > 2 && (
              <div className="mt-3 opacity-80">
                <Sparkline
                  values={kpi.spark}
                  color={TONE_COLOR[kpi.tone] ?? TONE_COLOR.neutral}
                  width={160}
                  height={24}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ------------------------------- DETECT > PREDICT > RECOMMEND ----- */}
      {wf && (
        <section className="border border-line bg-panel">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-3">
              <TriangleAlert className="h-4 w-4 text-amber" strokeWidth={1.6} />
              <h2 className="engrave text-muted">Detect → Predict → Recommend</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] text-fg">{wf.machine_code}</span>
              <span className="text-[12px] text-muted">{wf.machine_name}</span>
              <RiskBadge level={wf.predict.risk_level} solid />
            </div>
          </header>

          <div className="grid gap-px bg-line lg:grid-cols-3">
            {/* detect */}
            <div className="bg-panel p-5">
              <div className="flex items-center justify-between">
                <Eyebrow className="text-amber">01 · Detect</Eyebrow>
                <span className="font-mono text-[11px] text-dim">last 24 h</span>
              </div>
              <ul className="mt-4 space-y-3">
                {wf.detect.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-[6px]">
                      <StatusDot size={7} tone={a.severity === "Critical" ? "red" : a.severity === "Warning" ? "amber" : "signal"} pulse={a.severity === "Critical"} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg">{a.signal}</p>
                      <p className="mt-1 text-[13px] leading-snug text-muted">{a.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* predict */}
            <div className="bg-panel p-5">
              <div className="flex items-center justify-between">
                <Eyebrow className="text-amber">02 · Predict</Eyebrow>
                <span className="font-mono text-[11px] text-dim">{wf.predict.trend}</span>
              </div>
              <div className="mt-4 flex items-end gap-6">
                <div>
                  <p className="engrave">Health</p>
                  <p className="mt-1 font-mono text-[34px] leading-none text-amber">
                    <CountUp value={wf.predict.health_score} decimals={0} />%
                  </p>
                </div>
                <div>
                  <p className="engrave">Failure risk</p>
                  <p className="mt-1 font-mono text-[34px] leading-none text-crit">
                    <CountUp value={wf.predict.failure_probability_pct} decimals={0} />%
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-2">
                {wf.predict.factors.slice(0, 4).map((f) => (
                  <li key={f.label} className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] text-fg">{f.label}</p>
                      <div className="mt-1 h-[4px] w-full bg-white/[0.06]">
                        <div className="h-full bg-amber" style={{ width: `${f.contribution}%` }} />
                      </div>
                    </div>
                    <span className="font-mono text-[11px] tnum text-dim">{f.contribution}%</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* recommend */}
            <div className="bg-panel p-5">
              <Eyebrow className="text-led">03 · Recommend</Eyebrow>
              <p className="mt-4 text-[14px] leading-relaxed text-fg">{wf.recommend}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/dashboard/machines?q=${wf.machine_code}`}
                  className="inline-flex items-center gap-2 border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:border-signal hover:text-led"
                >
                  Machine detail <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href={`/dashboard/ai?q=${encodeURIComponent(`Why is production below target?`)}`}
                  className="inline-flex items-center gap-2 border border-signal/50 bg-signal/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-led transition hover:bg-signal/20"
                >
                  Ask AI <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* --------------------------------------------- production --------- */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Production vs target — today by machine"
          meta={`${data.production.today_output.toLocaleString()} / ${data.production.today_target.toLocaleString()} units · ${data.production.achievement_pct}%`}
          action={<Badge tone={data.production.achievement_pct >= 90 ? "emerald" : "amber"}>{data.production.achievement_pct >= 90 ? "on plan" : "below plan"}</Badge>}
        >
          {data.production.vs_target.length ? (
            <Bars
              data={data.production.vs_target.map((row) => ({
                label: row.code,
                value: row.output,
                target: row.target,
              }))}
              legend={{ primary: "Output", secondary: "Target", color: "#12a66a" }}
              valueUnit=" u"
              height={210}
            />
          ) : (
            <EmptyState title="No production records for today" />
          )}
        </Panel>

        <Panel title="Machine status" meta={`${data.plant.machines_total} assets · health ${data.machines.health_average}%`}>
          <Donut
            centerLabel="Assets"
            centerValue={String(data.plant.machines_total)}
            segments={[
              { label: "Healthy", value: data.machines.healthy, color: "#12a66a" },
              { label: "Warning", value: data.machines.warning, color: "#e8a020" },
              { label: "Critical", value: data.machines.critical, color: "#d9422b" },
              { label: "Offline", value: data.machines.offline, color: "#6c7873" },
            ]}
          />
          <div className="mt-5 grid grid-cols-4 gap-px border border-line bg-line">
            {[
              ["LOW", data.machines.risk_counts.LOW ?? 0, "#12a66a"],
              ["MED", data.machines.risk_counts.MEDIUM ?? 0, "#e8a020"],
              ["HIGH", data.machines.risk_counts.HIGH ?? 0, "#e8a020"],
              ["CRIT", data.machines.risk_counts.CRITICAL ?? 0, "#d9422b"],
            ].map(([label, value, color]) => (
              <div key={label as string} className="bg-panel px-2 py-2 text-center">
                <p className="font-mono text-[15px] tnum" style={{ color: color as string }}>
                  {value as number}
                </p>
                <p className="engrave mt-1">{label as string}</p>
              </div>
            ))}
          </div>
          <Link
            href="/dashboard/machines"
            className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-led transition hover:gap-3"
          >
            All machines <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Panel>
      </div>

      {/* ------------------------------------------ daily / defects ------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Daily production" meta="Output vs target · last 14 days">
          <Bars
            data={data.production.daily.map((d) => ({ label: d.label, value: d.output, target: d.target }))}
            legend={{ primary: "Output", secondary: "Target", color: "#12a66a" }}
            valueUnit=" u"
            height={170}
          />
        </Panel>

        <Panel title="Defects" meta="Defective units per day">
          <Bars
            data={data.production.daily.map((d) => ({ label: d.label, value: d.defects }))}
            legend={{ primary: "Defective units", color: "#e8a020" }}
            height={170}
          />
        </Panel>

        <Panel title="Downtime" meta="Unplanned stop hours per day">
          <LineChart
            labels={data.production.daily.map((d) => d.label)}
            series={[
              { name: "Downtime (h)", values: data.production.daily.map((d) => d.downtime_hours), color: "#d9422b" },
            ]}
            height={170}
            unit=" h"
          />
        </Panel>
      </div>

      {/* ------------------------------------------ alerts + orders ------- */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Alerts"
          meta={`${data.alerts.critical} critical · ${data.alerts.warning} warning open`}
          action={
            <Link
              href="/dashboard/alerts"
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-led hover:underline underline-offset-4"
            >
              Open
            </Link>
          }
          bodyClassName="p-0"
        >
          {data.alerts.recent.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No open alerts" hint="All conditions are inside the rated envelope." />
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.alerts.recent.slice(0, 6).map((alert) => (
                <li key={alert.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-raised">
                  <span className="mt-1.5">
                    <StatusDot
                      size={7}
                      tone={alert.severity === "Critical" ? "red" : alert.severity === "Warning" ? "amber" : "signal"}
                      pulse={alert.severity === "Critical"}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-fg">{alert.machine_code}</span>
                      <span className="text-[13px] text-fg">{alert.alert_type}</span>
                      <SeverityBadge severity={alert.severity} />
                    </div>
                    <p className="mt-1 truncate text-[13px] text-muted">{alert.description}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-dim">{fmtTime(alert.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Orders" meta={`${data.orders.total} total · ${data.orders.completion_pct}% fulfilled`}>
          <div className="grid grid-cols-2 gap-px bg-line">
            {[
              ["Active", data.orders.active, "text-fg"],
              ["Delayed", data.orders.delayed, "text-crit"],
              ["Pending", data.orders.pending, "text-amber"],
              ["Completed", data.orders.completed, "text-led"],
            ].map(([label, value, color]) => (
              <div key={label as string} className="bg-panel px-4 py-3">
                <p className="engrave">{label as string}</p>
                <p className={`mt-1.5 font-mono text-[24px] leading-none ${color as string}`}>
                  {value as number}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between font-mono text-[11px] text-muted">
              <span>fulfilment</span>
              <span className="tnum">{data.orders.completion_pct}%</span>
            </div>
            <div className="mt-2 h-[6px] w-full bg-white/[0.06]">
              <div className="h-full bg-signal" style={{ width: `${data.orders.completion_pct}%` }} />
            </div>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <p className="engrave">Energy · 7 days</p>
            <p className="mt-1.5 font-mono text-[20px] text-fg">
              {fmt(data.energy.week_kwh, 0)} <span className="text-[12px] text-dim">kWh</span>
              <span className="ml-3 text-[13px] text-muted">{data.energy.kwh_per_unit} kWh/unit</span>
            </p>
          </div>
          <Link
            href="/dashboard/orders"
            className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-led transition hover:gap-3"
          >
            All orders <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Panel>
      </div>

      {/* ------------------------------------------ AI insights ----------- */}
      <Panel
        title="AI insights"
        meta="Generated by the backend from live plant data"
        action={
          <Link
            href="/dashboard/ai"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-led hover:underline underline-offset-4"
          >
            Open assistant <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
        bodyClassName="p-0"
      >
        {data.insights.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No insights" hint="The plant is inside every configured threshold." />
          </div>
        ) : (
          <div className="grid gap-px bg-line md:grid-cols-2">
            {data.insights.map((insight) => (
              <article key={insight.title} className="bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="engrave text-dim">{insight.category}</span>
                  <SeverityBadge severity={insight.severity} />
                </div>
                <h3 className="mt-3 text-[15px] font-semibold leading-snug text-fg">{insight.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{insight.body}</p>
                <p className="mt-3 border-l-2 border-signal/60 pl-3 text-[13px] leading-relaxed text-fg">
                  {insight.action}
                </p>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {/* ------------------------------------------ machine watchlist ----- */}
      <Panel title="Machine watchlist" meta="Ranked by calculated failure probability" bodyClassName="p-4">
        <CompareRows
          rows={data.machines.items.slice(0, 8)}
          valueOf={(row) => Number(row.failure_probability) * 100}
          max={100}
          color="#e8a020"
          formatValue={(v) => `${v.toFixed(0)}% risk`}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {data.machines.items.slice(0, 8).map((m) => (
            <Link key={m.id} href={`/dashboard/machines/${m.id}`}>
              <Badge tone="neutral" className="transition hover:border-signal hover:text-led">
                {m.code} · {m.risk_level}
              </Badge>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
