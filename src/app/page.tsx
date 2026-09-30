"use client";

import Link from "next/link";
import { ArrowRight, Activity, Gauge, Boxes, ClipboardList, Zap, MessageSquare } from "lucide-react";
import { Badge, CountUp, Eyebrow, Loading, StatusDot } from "@/components/ui";
import { useApi } from "@/lib/api";

type DashboardPayload = {
  plant: { machines_total: number; shift: string; name: string };
  machines: { health_average: number; risk_counts: Record<string, number> };
  production: { achievement_pct: number; today_output: number; today_target: number };
  alerts: { critical: number; warning: number; open: number };
  orders: { delayed: number; total: number };
};

const WORKFLOW = [
  { step: "01", name: "FACTORY DATA", note: "Sensors, shifts, orders, energy — written to PostgreSQL" },
  { step: "02", name: "DETECT", note: "Abnormal temperature, vibration, downtime or output" },
  { step: "03", name: "ANALYZE", note: "Signals compared with each machine's rated baseline" },
  { step: "04", name: "PREDICT", note: "Health score, failure probability, risk level" },
  { step: "05", name: "RECOMMEND", note: "A concrete, prioritised maintenance action" },
  { step: "06", name: "ACTION", note: "Work order raised, alert resolved, line protected" },
];

const FEATURES = [
  {
    n: "01",
    icon: Activity,
    title: "Live machine monitoring",
    body: "Temperature, vibration, load, energy, operating hours and downtime for every asset — sampled continuously and compared against its own rated envelope.",
  },
  {
    n: "02",
    icon: Gauge,
    title: "Predictive maintenance",
    body: "A weighted model converts real sensor history into a health score, a failure probability and a LOW / MEDIUM / HIGH / CRITICAL risk level.",
  },
  {
    n: "03",
    icon: Boxes,
    title: "Production control",
    body: "Output against target per shift, per machine and per day, with defect rate and downtime attached to the same record.",
  },
  {
    n: "04",
    icon: ClipboardList,
    title: "Orders & maintenance",
    body: "Pending, in-production, delayed and completed orders alongside upcoming, overdue, completed and AI-predicted work orders.",
  },
  {
    n: "05",
    icon: Zap,
    title: "Energy intensity",
    body: "kWh per production unit by machine and by day, so waste is visible before it reaches the invoice.",
  },
  {
    n: "06",
    icon: MessageSquare,
    title: "AI operations assistant",
    body: "Ask a plain-language question; the assistant retrieves the relevant plant data and answers with evidence, cause, risk and next action.",
  },
];

const PROMPTS = [
  "Which machines are currently at risk?",
  "Why is production below target?",
  "Which machine should be inspected first?",
  "Which machines are consuming excessive energy?",
  "What maintenance should be prioritized?",
  "What is causing the current production bottleneck?",
];

export default function LandingPage() {
  const { data, loading, error, reload } = useApi<DashboardPayload>("/dashboard");

  const stats = [
    { label: "Assets monitored", value: data?.plant.machines_total ?? 0, suffix: "", tone: "text-fg" },
    { label: "Plant health", value: data?.machines.health_average ?? 0, suffix: "%", tone: "text-led" },
    {
      label: "Target achievement",
      value: data?.production.achievement_pct ?? 0,
      suffix: "%",
      tone: (data?.production.achievement_pct ?? 0) >= 90 ? "text-led" : "text-amber",
    },
    {
      label: "Critical alerts",
      value: data?.alerts.critical ?? 0,
      suffix: "",
      tone: (data?.alerts.critical ?? 0) > 0 ? "text-crit" : "text-led",
    },
  ];

  return (
    <div className="min-h-screen bg-ink">
      {/* ---------------------------------------------------------------- */}
      {/* header                                                            */}
      {/* ---------------------------------------------------------------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-10">
          <Link href="/" className="flex items-center gap-3 group">
            <Logo />
            <span className="font-semibold tracking-tight text-fg text-[15px]">
              FactoryPilot
              <span className="font-mono text-led ml-1.5 text-[12px] tracking-[0.2em]">AI</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {[
              ["Platform", "#features"],
              ["How it works", "#how"],
              ["Predictive", "#predictive"],
              ["AI", "#ai"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="engrave text-muted transition-colors hover:text-fg focus:outline-none focus-visible:text-fg"
              >
                {label}
              </a>
            ))}
          </nav>
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 bg-signal px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink transition hover:bg-led focus:outline-none focus-visible:ring-2 focus-visible:ring-led focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Go to Dashboard
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative isolate min-h-[92vh] overflow-hidden pt-16">
        <img
          src="images/hero-floor.jpg"
          alt="Factory floor at night shift with machine status beacons"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-[70%_50%]"
          loading="eager"
        />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(96deg, #0a0d0c 0%, #0a0d0ce6 38%, #0a0d0cb3 58%, #0a0d0c66 100%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-ink to-transparent" />

        <div className="mx-auto flex min-h-[calc(92vh-4rem)] max-w-[1440px] flex-col justify-center px-5 py-16 lg:px-10">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={error ? "red" : "emerald"}>
                <StatusDot size={6} pulse={!error} tone={error ? "red" : "signal"} />
                {error ? "API offline" : loading ? "Connecting…" : "Backend online"}
              </Badge>
              <Eyebrow>Predictive factory operations platform</Eyebrow>
            </div>

            <h1 className="mt-7 font-semibold leading-[0.94] tracking-[-0.03em] text-white text-[clamp(2.5rem,6.2vw,5rem)]">
              Detect the problem.
              <br />
              Predict the risk.
              <br />
              <span className="text-led">Act before the line stops.</span>
            </h1>

            <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-muted">
              FactoryPilot AI reads live machine, production, order and energy data from your plant,
              flags abnormal conditions, calculates failure risk from real sensor history and tells
              your team exactly what to do next — before a problem becomes a major disruption.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-3 bg-signal px-7 py-4 font-mono text-[12px] font-medium uppercase tracking-[0.18em] text-ink transition hover:bg-led focus:outline-none focus-visible:ring-2 focus-visible:ring-led focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-3 border border-line px-7 py-4 font-mono text-[12px] uppercase tracking-[0.18em] text-fg transition hover:border-signal hover:text-led focus:outline-none focus-visible:ring-2 focus-visible:ring-led"
              >
                See how it works
              </a>
            </div>

            {/* live stat strip */}
            <div className="mt-14 grid max-w-2xl grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
              {loading && !data ? (
                <div className="col-span-2 bg-ink p-4 sm:col-span-4">
                  <Loading rows={1} label="Reading plant data" />
                </div>
              ) : error ? (
                <div className="col-span-2 bg-ink p-4 sm:col-span-4">
                  <p className="engrave text-crit">API unavailable</p>
                  <button
                    onClick={reload}
                    className="mt-2 font-mono text-[11px] text-muted underline underline-offset-4 hover:text-fg"
                  >
                    Retry connection
                  </button>
                </div>
              ) : (
                stats.map((stat) => (
                  <div key={stat.label} className="bg-ink px-4 py-4">
                    <p className="engrave">{stat.label}</p>
                    <p className={`mt-2 font-mono text-[26px] leading-none ${stat.tone}`}>
                      <CountUp value={stat.value} decimals={stat.label === "Plant health" || stat.label === "Target achievement" ? 1 : 0} />
                      {stat.suffix}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* workflow rail                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-line bg-panel">
        <div className="mx-auto max-w-[1440px] px-5 py-14 lg:px-10">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <Eyebrow>The operating loop</Eyebrow>
            <p className="font-mono text-[11px] text-dim">
              data → detection → prediction → recommendation → action
            </p>
          </div>

          <ol className="mt-8 grid gap-px bg-line lg:grid-cols-6">
            {WORKFLOW.map((item, index) => (
              <li key={item.step} className="group relative bg-panel p-5 transition-colors hover:bg-raised">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-signal">{item.step}</span>
                  <span className="font-mono text-[14px] text-dim transition-colors group-hover:text-amber lg:hidden">
                    ↓
                  </span>
                  <span className="hidden font-mono text-[14px] text-dim transition-colors group-hover:text-amber lg:inline">
                    {index < WORKFLOW.length - 1 ? "→" : "■"}
                  </span>
                </div>
                <h3 className="mt-4 font-mono text-[13px] font-medium tracking-[0.08em] text-fg">
                  {item.name}
                </h3>
                <p className="mt-2 text-[13px] leading-snug text-muted">{item.note}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* features                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section id="features" className="mx-auto max-w-[1440px] scroll-mt-20 px-5 py-24 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Eyebrow>Platform</Eyebrow>
            <h2 className="mt-5 text-[clamp(1.9rem,3vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">
              One system for the whole floor
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-muted">
              Machines, production, orders, maintenance, energy and alerts live in one PostgreSQL
              database. The dashboard, the prediction engine and the AI assistant all read the same
              records — so what you see is what the plant is doing.
            </p>
            <Link
              href="/dashboard"
              className="mt-8 inline-flex items-center gap-2 border-b border-signal pb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-led transition hover:gap-3"
            >
              Open the dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-px bg-line sm:grid-cols-2 lg:col-span-8">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              const wide = i === 0;
              return (
                <article
                  key={feature.n}
                  className={`group relative overflow-hidden bg-panel p-6 transition-colors hover:bg-raised ${
                    wide ? "sm:col-span-2" : ""
                  }`}
                >
                  {wide && (
                    <img
                      src="images/machine-detail.jpg"
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 object-cover opacity-[0.16] transition-opacity duration-500 group-hover:opacity-25"
                      style={{ maskImage: "linear-gradient(to left, black 10%, transparent 85%)", WebkitMaskImage: "linear-gradient(to left, black 10%, transparent 85%)" }}
                    />
                  )}
                  <div className="relative flex items-start gap-4">
                    <span className="font-mono text-[11px] text-dim pt-1">{feature.n}</span>
                    <div className="min-w-0">
                      <Icon className="h-5 w-5 text-signal" strokeWidth={1.5} />
                      <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-fg">
                        {feature.title}
                      </h3>
                      <p className={`mt-2 text-[14px] leading-relaxed text-muted ${wide ? "max-w-lg" : ""}`}>
                        {feature.body}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* how it works                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section id="how" className="border-y border-line bg-panel scroll-mt-16">
        <div className="mx-auto grid max-w-[1440px] gap-0 lg:grid-cols-2">
          <div className="relative min-h-[320px] overflow-hidden lg:min-h-[560px]">
            <img
              src="images/control-room.jpg"
              alt="Plant control room console with machine data displays"
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/20 to-panel/90" />
            <div className="absolute bottom-6 left-6 border border-line bg-ink/85 px-4 py-3 backdrop-blur">
              <p className="engrave">Shift log</p>
              <p className="mt-1 font-mono text-[13px] text-fg">
                3 alerts raised · 1 work order predicted
              </p>
            </div>
          </div>

          <div className="px-5 py-16 lg:px-14 lg:py-20">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-5 text-[clamp(1.9rem,3vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">
              From raw signal to a decision on the floor
            </h2>

            <ol className="mt-10 space-y-8">
              {[
                {
                  k: "Connect",
                  t: "Plant data lands in PostgreSQL",
                  d: "Machine readings, shift production, orders, energy and maintenance records are stored in one relational schema with real foreign keys.",
                },
                {
                  k: "Model",
                  t: "Every machine gets a rated baseline",
                  d: "Temperature, vibration, load and energy draw are normalised per asset, then compared against the previous seven days to spot deterioration.",
                },
                {
                  k: "Operate",
                  t: "The dashboard and the AI act on it",
                  d: "KPIs, charts and risk scores are computed on request by the FastAPI backend; the assistant retrieves the same data before it answers.",
                },
              ].map((item, i) => (
                <li key={item.k} className="grid grid-cols-[auto_1fr] gap-5">
                  <span className="mt-1 flex h-8 w-8 items-center justify-center border border-line font-mono text-[12px] text-signal">
                    {i + 1}
                  </span>
                  <div>
                    <p className="engrave text-signal">{item.k}</p>
                    <h3 className="mt-2 text-[17px] font-semibold text-fg">{item.t}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* predictive maintenance                                            */}
      {/* ---------------------------------------------------------------- */}
      <section id="predictive" className="mx-auto max-w-[1440px] scroll-mt-20 px-5 py-24 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Eyebrow>Predictive maintenance</Eyebrow>
            <h2 className="mt-5 text-[clamp(1.9rem,3vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">
              The failure probability is calculated, not typed in
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-muted">
              Health and risk are produced by a weighted model over live readings — temperature,
              vibration, load, operating hours, energy per unit, downtime and previous failures —
              evaluated in the backend on every request.
            </p>

            <div className="mt-8 space-y-px bg-line">
              {[
                { level: "LOW", desc: "Inside the rated envelope", color: "bg-signal" },
                { level: "MEDIUM", desc: "Drift against baseline detected", color: "bg-amber/70" },
                { level: "HIGH", desc: "Degradation confirmed over 7 days", color: "bg-amber" },
                { level: "CRITICAL", desc: "Failure likely within the operating window", color: "bg-crit" },
              ].map((row) => (
                <div key={row.level} className="flex items-center gap-4 bg-panel px-4 py-3">
                  <span className={`h-3 w-3 shrink-0 ${row.color}`} />
                  <span className="w-24 font-mono text-[12px] tracking-[0.1em] text-fg">{row.level}</span>
                  <span className="text-[13px] text-muted">{row.desc}</span>
                  <span className="ml-auto font-mono text-[13px] tnum text-fg">
                    {data ? data.machines.risk_counts[row.level] ?? 0 : "—"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] text-dim">
              live distribution across {data?.plant.machines_total ?? "—"} assets
            </p>
          </div>

          <div className="lg:col-span-7">
            <div className="relative overflow-hidden border border-line bg-panel">
              <img
                src="images/inspection.jpg"
                alt="Technician inspecting a machine sensor with a tablet"
                className="absolute inset-x-0 top-0 h-40 w-full object-cover opacity-30"
                loading="lazy"
              />
              <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-transparent to-panel" />

              <div className="relative p-6">
                <div className="flex items-center justify-between">
                  <Eyebrow>Highest failure risk right now</Eyebrow>
                  <Badge tone="red">Live from backend</Badge>
                </div>

                {loading ? (
                  <div className="mt-6">
                    <Loading rows={4} label="Scoring machines" />
                  </div>
                ) : error ? (
                  <div className="mt-6">
                    <p className="text-sm text-muted">Backend unavailable — retry from the dashboard.</p>
                  </div>
                ) : data ? (
                  <RiskCard data={data} />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* AI capabilities                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section id="ai" className="border-y border-line bg-panel scroll-mt-16">
        <div className="mx-auto max-w-[1440px] px-5 py-24 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Eyebrow>AI assistant</Eyebrow>
              <h2 className="mt-5 text-[clamp(1.9rem,3vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">
                Ask the plant a question in plain language
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">
                The assistant classifies what your question needs, retrieves that data from the
                database, attaches the current prediction results and generates an answer with
                evidence, likely cause, risk and a recommended action.
              </p>
              <ul className="mt-7 space-y-3 text-[14px] text-muted">
                {[
                  "Answers are grounded in live PostgreSQL records",
                  "Machine codes and figures are quoted from the data",
                  "States clearly when the data is not sufficient",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-signal" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-7">
              <p className="engrave mb-4">Try one of these</p>
              <div className="flex flex-wrap gap-3">
                {PROMPTS.map((prompt) => (
                  <Link
                    key={prompt}
                    href={`/dashboard/ai?q=${encodeURIComponent(prompt)}`}
                    className="group border border-line bg-ink px-4 py-3 text-[14px] text-muted transition hover:border-signal hover:text-fg focus:outline-none focus-visible:border-led"
                  >
                    <span className="mr-2 font-mono text-[12px] text-signal">›</span>
                    {prompt}
                  </Link>
                ))}
              </div>

              <div className="mt-8 border border-line bg-ink p-5">
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <StatusDot size={7} />
                  <span className="engrave">FactoryPilot AI · operations analyst</span>
                </div>
                <div className="mt-4 space-y-3 text-[14px] leading-relaxed">
                  <p className="text-muted">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
                      You&nbsp;·
                    </span>{" "}
                    Why is production below target?
                  </p>
                  <div className="border-l-2 border-signal pl-4 text-fg">
                    <p className="engrave text-signal">Situation</p>
                    <p className="mt-1">
                      Production is at {data ? data.production.today_output.toLocaleString() : "—"} units
                      against {data ? data.production.today_target.toLocaleString() : "—"} today
                      ({data?.production.achievement_pct ?? "—"}% of target).
                    </p>
                    <p className="engrave mt-3 text-signal">Evidence</p>
                    <ul className="mt-1 space-y-1 text-muted">
                      <li>— M-012 records the largest shortfall with elevated downtime</li>
                      <li>— Machine health averaging {data?.machines.health_average ?? "—"}% plant-wide</li>
                      <li>— {data?.alerts.critical ?? 0} critical alerts open</li>
                    </ul>
                    <p className="engrave mt-3 text-signal">Recommended action</p>
                    <p className="mt-1">
                      Inspect M-012 and review its recent temperature and vibration readings.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* CTA                                                               */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-line">
        <img
          src="images/steel-plate.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-forest/80 mix-blend-multiply" />
        <div className="relative mx-auto flex max-w-[1440px] flex-col items-start gap-8 px-5 py-20 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div>
            <Eyebrow className="text-led/70">Ready when the shift is</Eyebrow>
            <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,3vw,2.6rem)] font-semibold leading-[1.06] tracking-[-0.02em] text-white">
              Open the live floor — data, predictions and recommendations in one view.
            </h2>
          </div>
          <Link
            href="/dashboard"
            className="group inline-flex shrink-0 items-center gap-3 bg-fg px-8 py-4 font-mono text-[12px] font-medium uppercase tracking-[0.18em] text-ink transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-led"
          >
            Go to Dashboard
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* footer                                                            */}
      {/* ---------------------------------------------------------------- */}
      <footer className="relative overflow-hidden bg-ink">
        <img
          src="images/steel-plate.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.10]"
          loading="lazy"
        />
        <div className="relative mx-auto max-w-[1440px] px-5 py-16 lg:px-10">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-3">
                <Logo />
                <span className="font-semibold tracking-tight text-fg">
                  FactoryPilot
                  <span className="font-mono text-led ml-1.5 text-[12px] tracking-[0.2em]">AI</span>
                </span>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                Predictive operations intelligence for discrete manufacturing plants.
              </p>
            </div>

            {[
              { h: "Platform", items: ["Overview", "Machines", "Production", "Orders"] },
              { h: "Operations", items: ["Maintenance", "Energy", "Alerts", "AI Assistant"] },
              { h: "Stack", items: ["React", "FastAPI", "PostgreSQL", "Predictive model"] },
            ].map((col) => (
              <div key={col.h}>
                <p className="engrave">{col.h}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.items.map((item) => (
                    <li key={item}>
                      <Link
                        href="/dashboard"
                        className="text-[14px] text-muted transition-colors hover:text-fg"
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] text-dim">
              © {new Date().getFullYear()} FactoryPilot AI · Plant 04 — Kestrel Works
            </p>
            <p className="font-mono text-[11px] text-dim flex items-center gap-2">
              <StatusDot size={6} tone={error ? "red" : "signal"} />
              {error ? "API offline" : loading ? "connecting" : "API connected · PostgreSQL"}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* live risk card                                                              */
/* -------------------------------------------------------------------------- */
function RiskCard({ data }: { data: DashboardPayload }) {
  const worst = (data as any);
  const workflow = worst.workflow;
  if (!workflow) return null;
  const p = workflow.predict;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border border-line bg-ink p-4">
        <div>
          <p className="font-mono text-[22px] text-fg">{workflow.machine_code}</p>
          <p className="text-[13px] text-muted">{workflow.machine_name}</p>
        </div>
        <div className="text-right">
          <p className="engrave">Failure probability</p>
          <p className="font-mono text-[32px] leading-none text-crit">
            <CountUp value={p.failure_probability_pct} decimals={0} />%
          </p>
        </div>
        <div className="text-right">
          <p className="engrave">Health score</p>
          <p className="font-mono text-[32px] leading-none text-amber">
            <CountUp value={p.health_score} decimals={0} />%
          </p>
        </div>
        <Badge tone="red" className="text-[11px]">
          {p.risk_level}
        </Badge>
      </div>

      <ul className="mt-4 space-y-px bg-line">
        {workflow.detect.slice(0, 3).map((a: any, i: number) => (
          <li key={i} className="flex items-start gap-3 bg-ink px-4 py-3">
            <StatusDot tone={a.severity === "Critical" ? "red" : "amber"} size={7} pulse={a.severity === "Critical"} />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg">{a.signal}</p>
              <p className="mt-1 text-[13px] text-muted">{a.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 border border-signal/40 bg-signal/[0.07] p-4">
        <p className="engrave text-led">Recommendation</p>
        <p className="mt-2 text-[14px] leading-relaxed text-fg">{workflow.recommend}</p>
        <Link
          href={`/dashboard/ai?q=${encodeURIComponent(`Which machine should be inspected first?`)}`}
          className="mt-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-led hover:gap-3 transition-all"
        >
          Ask the assistant <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* logo mark — drawn, not generated                                            */
/* -------------------------------------------------------------------------- */
function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="30" height="30" fill="#0b3b2e" stroke="#12a66a" strokeWidth="1.5" />
      <path d="M6 22.5 L6 9.5 L11.5 9.5" fill="none" stroke="#e9efeb" strokeWidth="2.2" />
      <path d="M6 15.6 L10.6 15.6" fill="none" stroke="#e9efeb" strokeWidth="2.2" />
      <path d="M15 22.5 L15 9.5 L20.5 9.5 L20.5 15.2 L15 15.2" fill="none" stroke="#12a66a" strokeWidth="2.2" />
      <path d="M24.5 9.5 L24.5 22.5" fill="none" stroke="#e8a020" strokeWidth="2.2" />
      <circle cx="24.5" cy="6.4" r="1.7" fill="#34d399" />
    </svg>
  );
}
