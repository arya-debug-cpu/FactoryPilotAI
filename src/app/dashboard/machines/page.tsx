"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import {
  Badge,
  EmptyState,
  ErrorState,
  Eyebrow,
  HealthBar,
  Loading,
  RiskBadge,
  StatusDot,
  fmt,
} from "@/components/ui";
import { useApi } from "@/lib/api";
import { useQueryParam } from "@/lib/useQuery";

type Machine = {
  id: number;
  code: string;
  name: string;
  line: string;
  area: string;
  status: string;
  health_score: number;
  failure_probability_pct: number;
  risk_level: string;
  trend: string;
  operating_hours: number;
  downtime_hours: number;
  last_maintenance: string;
  failure_count: number;
  signals: {
    temperature_avg: number;
    temperature_delta: number;
    vibration_avg: number;
    vibration_delta: number;
    energy_kw_avg: number;
    energy_per_unit: number;
  };
};

type Payload = {
  count: number;
  risk_counts: Record<string, number>;
  lines: string[];
  machines: Machine[];
};

const RISKS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export default function MachinesPage() {
  const initialQuery = useQueryParam("q");
  const [risk, setRisk] = useState<string>("ALL");
  const [line, setLine] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("risk");

  useEffect(() => {
    if (initialQuery) setSearch(initialQuery);
  }, [initialQuery]);

  const params = useMemo(() => {
    const p = new URLSearchParams({ sort });
    if (risk !== "ALL") p.set("risk", risk);
    if (line !== "ALL") p.set("line", line);
    if (search.trim()) p.set("q", search.trim());
    return `?${p.toString()}`;
  }, [risk, line, search, sort]);

  const { data, loading, error, reload } = useApi<Payload>(`/machines${params}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Asset register · calculated risk</Eyebrow>
          <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
            Machines
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Health, failure probability and risk level are computed from each machine&apos;s sensor
            history in the backend.
          </p>
        </div>
        {data && (
          <div className="grid grid-cols-4 gap-px border border-line bg-line">
            {RISKS.slice(1).map((level) => (
              <div key={level} className="bg-panel px-4 py-2.5 text-center">
                <p
                  className="font-mono text-[18px] tnum"
                  style={{
                    color:
                      level === "CRITICAL"
                        ? "#d9422b"
                        : level === "HIGH" || level === "MEDIUM"
                          ? "#e8a020"
                          : "#12a66a",
                  }}
                >
                  {data.risk_counts[level] ?? 0}
                </p>
                <p className="engrave mt-1">{level}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3 border border-line bg-panel p-3">
        <div className="flex flex-wrap gap-px bg-line">
          {RISKS.map((level) => (
            <button
              key={level}
              onClick={() => setRisk(level)}
              className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-led ${
                risk === level ? "bg-signal text-ink" : "bg-panel text-muted hover:text-fg"
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code, name, area"
            className="w-56 border border-line bg-ink py-2 pl-9 pr-3 font-mono text-[12px] text-fg placeholder:text-dim focus:border-signal focus:outline-none"
          />
        </div>

        <select
          value={line}
          onChange={(event) => setLine(event.target.value)}
          className="border border-line bg-ink px-3 py-2 font-mono text-[12px] text-fg focus:border-signal focus:outline-none"
        >
          <option value="ALL">All lines</option>
          {(data?.lines ?? []).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="border border-line bg-ink px-3 py-2 font-mono text-[12px] text-fg focus:border-signal focus:outline-none"
        >
          <option value="risk">Sort: risk</option>
          <option value="health">Sort: health</option>
          <option value="code">Sort: code</option>
          <option value="name">Sort: name</option>
        </select>

        <span className="ml-auto font-mono text-[11px] text-dim">
          {loading ? "…" : `${data?.count ?? 0} machines`}
        </span>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={6} label="Loading machines" />}

      {data && !loading && data.machines.length === 0 && (
        <EmptyState title="No machines match these filters" hint="Clear the search or choose another risk level." />
      )}

      {data && data.machines.length > 0 && (
        <div className="overflow-x-auto border border-line bg-panel">
          <table className="w-full min-w-[1040px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {[
                  "Machine",
                  "Line / area",
                  "Status",
                  "Health",
                  "Temp °C",
                  "Vib mm/s",
                  "Run hours",
                  "Downtime 7d",
                  "Failure risk",
                  "Risk",
                  "",
                ].map((head) => (
                  <th
                    key={head}
                    className="engrave px-4 py-3 text-left font-normal text-dim whitespace-nowrap"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {data.machines.map((machine) => (
                <tr
                  key={machine.id}
                  className="group transition-colors hover:bg-raised"
                >
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/machines/${machine.id}`} className="block">
                      <span className="font-mono text-[13px] text-fg group-hover:text-led">
                        {machine.code}
                      </span>
                      <span className="block text-[13px] text-muted">{machine.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted">
                    {machine.line}
                    <span className="block text-[12px] text-dim">{machine.area}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-mono text-[12px] text-muted">
                      <StatusDot
                        size={7}
                        tone={machine.status === "RUNNING" ? "signal" : machine.status === "IDLE" ? "amber" : "red"}
                      />
                      {machine.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <HealthBar value={machine.health_score} />
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] tnum">
                    <span className={machine.signals.temperature_delta > 10 ? "text-crit" : machine.signals.temperature_delta > 5 ? "text-amber" : "text-fg"}>
                      {fmt(machine.signals.temperature_avg, 1)}
                    </span>
                    <span className="block text-[11px] text-dim">
                      {machine.signals.temperature_delta > 0 ? "+" : ""}
                      {fmt(machine.signals.temperature_delta, 1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] tnum">
                    <span className={machine.signals.vibration_delta > 1.8 ? "text-crit" : machine.signals.vibration_delta > 0.9 ? "text-amber" : "text-fg"}>
                      {fmt(machine.signals.vibration_avg, 2)}
                    </span>
                    <span className="block text-[11px] text-dim">
                      {machine.signals.vibration_delta > 0 ? "+" : ""}
                      {fmt(machine.signals.vibration_delta, 2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] tnum text-muted">
                    {fmt(machine.operating_hours)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] tnum text-muted">
                    {fmt(machine.downtime_hours, 1)} h
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="font-mono text-[15px] tnum"
                      style={{
                        color:
                          machine.failure_probability_pct >= 72
                            ? "#d9422b"
                            : machine.failure_probability_pct >= 42
                              ? "#e8a020"
                              : "#e9efeb",
                      }}
                    >
                      {fmt(machine.failure_probability_pct, 0)}%
                    </span>
                    <span className="block text-[11px] text-dim">{machine.trend}</span>
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge level={machine.risk_level} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/machines/${machine.id}`}
                      className="inline-flex text-dim transition hover:text-led"
                      aria-label={`Open ${machine.code}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
