"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import {
  Badge,
  CountUp,
  EmptyState,
  ErrorState,
  Eyebrow,
  HealthBar,
  Loading,
  Panel,
  fmt,
} from "@/components/ui";
import { Bars, CompareRows, LineChart } from "@/components/charts";
import { useApi } from "@/lib/api";

type Payload = {
  filters: { from: string; to: string; machine_id: number | null; available_days: string[] };
  summary: {
    target: number;
    output: number;
    achievement_pct: number;
    defects: number;
    defect_rate: number;
    downtime_hours: number;
    gap: number;
    shifts: number;
  };
  by_machine: any[];
  series: { day: string; label: string; output: number; target: number; achievement: number; defects: number; downtime_hours: number }[];
  by_shift: { shift: string; output: number; target: number }[];
  machines: { id: number; code: string; name: string; line: string }[];
};

export default function ProductionPage() {
  const [day, setDay] = useState<string>("");
  const [machineId, setMachineId] = useState<string>("");

  const params = new URLSearchParams();
  if (day) params.set("day", day);
  if (machineId) params.set("machine_id", machineId);
  const query = params.toString() ? `?${params.toString()}` : "";

  const { data, loading, error, reload } = useApi<Payload>(`/production${query}`);

  const summary = data?.summary;
  const cells = [
    { label: "Production today", value: summary?.output ?? 0, unit: "units", tone: "text-fg", decimals: 0 },
    {
      label: "Production target",
      value: summary?.target ?? 0,
      unit: "units",
      tone: "text-muted",
      decimals: 0,
    },
    {
      label: "Target achievement",
      value: summary?.achievement_pct ?? 0,
      unit: "%",
      tone: (summary?.achievement_pct ?? 0) >= 90 ? "text-led" : "text-amber",
      decimals: 1,
    },
    {
      label: "Defect rate",
      value: summary?.defect_rate ?? 0,
      unit: "%",
      tone: (summary?.defect_rate ?? 0) <= 1.5 ? "text-led" : "text-amber",
      decimals: 2,
    },
    {
      label: "Downtime",
      value: summary?.downtime_hours ?? 0,
      unit: "hours",
      tone: (summary?.downtime_hours ?? 0) > 20 ? "text-crit" : "text-amber",
      decimals: 1,
    },
    {
      label: "Gap to target",
      value: summary?.gap ?? 0,
      unit: "units",
      tone: (summary?.gap ?? 0) >= 0 ? "text-led" : "text-crit",
      decimals: 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Output · target · quality · stoppages</Eyebrow>
          <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
            Production
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Filter by date and machine — the backend recalculates every figure.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border border-line bg-panel p-3">
          <span className="inline-flex items-center gap-2 engrave text-dim">
            <Filter className="h-3.5 w-3.5" /> Filters
          </span>
          <select
            value={day}
            onChange={(event) => setDay(event.target.value)}
            className="border border-line bg-ink px-3 py-2 font-mono text-[12px] text-fg focus:border-signal focus:outline-none"
          >
            <option value="">Last 14 days</option>
            {(data?.filters.available_days ?? []).map((date) => (
              <option key={date} value={date}>
                {new Date(date).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                })}
              </option>
            ))}
          </select>
          <select
            value={machineId}
            onChange={(event) => setMachineId(event.target.value)}
            className="border border-line bg-ink px-3 py-2 font-mono text-[12px] text-fg focus:border-signal focus:outline-none"
          >
            <option value="">All machines</option>
            {(data?.machines ?? []).map((machine) => (
              <option key={machine.id} value={String(machine.id)}>
                {machine.code} — {machine.name}
              </option>
            ))}
          </select>
          {(day || machineId) && (
            <button
              onClick={() => {
                setDay("");
                setMachineId("");
              }}
              className="border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:border-signal hover:text-led"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={6} label="Loading production records" />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
            {cells.map((cell) => (
              <div key={cell.label} className="bg-panel p-4">
                <p className="engrave">{cell.label}</p>
                <p className={`mt-2 font-mono text-[25px] leading-none ${cell.tone}`}>
                  <CountUp value={cell.value} decimals={cell.decimals} />
                </p>
                <p className="mt-2 font-mono text-[11px] text-dim">{cell.unit}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="Daily output vs target"
              meta={`${data.filters.from} → ${data.filters.to}`}
            >
              <LineChart
                labels={data.series.map((row) => row.label)}
                series={[
                  { name: "Output", values: data.series.map((row) => row.output), color: "#12a66a" },
                  { name: "Target", values: data.series.map((row) => row.target), color: "#6c7873" },
                ]}
                height={210}
                unit=" u"
              />
            </Panel>

            <Panel title="Shift performance" meta="Output against planned volume">
              <div className="space-y-5">
                {data.by_shift.map((shift) => {
                  const pct = shift.target ? (shift.output / shift.target) * 100 : 0;
                  return (
                    <div key={shift.shift}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[14px] text-fg">{shift.shift} shift</span>
                        <span className="font-mono text-[13px] tnum text-muted">
                          {fmt(shift.output)} / {fmt(shift.target)}
                        </span>
                      </div>
                      <div className="mt-2 h-[8px] w-full bg-white/[0.06]">
                        <div
                          className="h-full transition-[width] duration-700"
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            background: pct >= 90 ? "#12a66a" : pct >= 75 ? "#e8a020" : "#d9422b",
                          }}
                        />
                      </div>
                      <p className="mt-1.5 font-mono text-[11px] text-dim tnum">{pct.toFixed(1)}% of plan</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-line pt-4">
                <p className="engrave">Defects</p>
                <p className="mt-2 font-mono text-[24px] text-fg">
                  {fmt(summary?.defects ?? 0)}
                  <span className="ml-2 text-[12px] text-dim">units</span>
                </p>
                <div className="mt-4">
                  <Bars
                    data={data.series.map((row) => ({ label: row.label, value: row.defects }))}
                    legend={{ primary: "Defective units", color: "#e8a020" }}
                    height={110}
                  />
                </div>
              </div>
            </Panel>
          </div>

          <Panel
            title="Machine-wise production"
            meta={`${data.by_machine.length} machines in range · sorted by achievement`}
            bodyClassName="p-0"
          >
            {data.by_machine.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No production records" hint="Choose a different date or machine." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      {["Machine", "Line", "Target", "Output", "Achievement", "Defect rate", "Downtime", "Shifts"].map(
                        (head) => (
                          <th key={head} className="engrave px-4 py-3 text-left font-normal text-dim whitespace-nowrap">
                            {head}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {data.by_machine.map((row) => (
                      <tr key={row.machine_id} className="transition-colors hover:bg-raised">
                        <td className="px-4 py-3">
                          <span className="font-mono text-[13px] text-fg">{row.code}</span>
                          <span className="block text-[13px] text-muted">{row.name}</span>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted">{row.line}</td>
                        <td className="px-4 py-3 font-mono text-[13px] tnum text-muted">{fmt(row.target)}</td>
                        <td className="px-4 py-3 font-mono text-[13px] tnum text-fg">{fmt(row.output)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <HealthBar value={Math.min(100, row.achievement_pct)} width={80} />
                            <Badge tone={row.achievement_pct >= 90 ? "emerald" : row.achievement_pct >= 75 ? "amber" : "red"}>
                              {row.achievement_pct}%
                            </Badge>
                          </div>
                        </td>
                        <td
                          className={`px-4 py-3 font-mono text-[13px] tnum ${
                            row.defect_rate > 2 ? "text-crit" : row.defect_rate > 1.5 ? "text-amber" : "text-muted"
                          }`}
                        >
                          {row.defect_rate}%
                        </td>
                        <td className="px-4 py-3 font-mono text-[13px] tnum text-muted">
                          {row.downtime_hours} h
                        </td>
                        <td className="px-4 py-3 font-mono text-[13px] tnum text-dim">{row.shifts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Output ranking" meta="Lowest achievement first — where the loss sits">
            <CompareRows
              rows={[...data.by_machine].reverse()}
              valueOf={(row) => Number(row.achievement_pct)}
              max={100}
              color="#e8a020"
              formatValue={(value) => `${value.toFixed(0)}%`}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
