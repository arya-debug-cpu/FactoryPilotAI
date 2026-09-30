"use client";

import { useState } from "react";
import {
  Badge,
  CountUp,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Panel,
  RiskBadge,
  fmtDate,
} from "@/components/ui";
import { useApi } from "@/lib/api";

type WorkOrder = {
  id: number;
  machine_code: string;
  machine_name: string;
  issue: string;
  priority: string;
  date: string;
  completed_date: string | null;
  status: string;
  source: string;
  notes: string;
  days_from_today: number;
  health_score?: number;
  failure_probability_pct?: number;
  risk_level?: string;
};

type Payload = {
  summary: { upcoming: number; overdue: number; completed: number; predicted: number; total: number };
  counts: Record<string, number>;
  count: number;
  records: WorkOrder[];
};

const TABS = [
  { key: "", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
  { key: "predicted", label: "Predicted" },
];

const STATUS_TONE: Record<string, string> = {
  Scheduled: "neutral",
  Overdue: "red",
  Completed: "emerald",
  Predicted: "amber",
};

export default function MaintenancePage() {
  const [filter, setFilter] = useState("");
  const query = filter ? `?filter=${filter}` : "";
  const { data, loading, error, reload } = useApi<Payload>(`/maintenance${query}`);
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Planned and predicted work</Eyebrow>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
          Maintenance
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Predicted records are created by the backend when the calculated failure probability
          crosses the configured threshold.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
        {[
          { label: "Upcoming", value: summary?.upcoming ?? 0, tone: "text-fg" },
          { label: "Overdue", value: summary?.overdue ?? 0, tone: "text-crit" },
          { label: "Completed", value: summary?.completed ?? 0, tone: "text-led" },
          { label: "AI-predicted", value: summary?.predicted ?? 0, tone: "text-amber" },
        ].map((cell) => (
          <div key={cell.label} className="bg-panel p-4">
            <p className="engrave">{cell.label}</p>
            <p className={`mt-2 font-mono text-[27px] leading-none ${cell.tone}`}>
              <CountUp value={cell.value} />
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-px border border-line bg-line">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition focus:outline-none ${
              filter === tab.key ? "bg-signal text-ink" : "bg-panel text-muted hover:text-fg"
            }`}
          >
            {tab.label}
            {data && (
              <span className="ml-2 opacity-70">
                {tab.key ? data.counts[tab.key] ?? 0 : data.summary.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={6} label="Loading maintenance records" />}

      {data && data.records.length === 0 && (
        <EmptyState title="No records in this view" hint="Choose another category." />
      )}

      {data && data.records.length > 0 && (
        <div className="overflow-x-auto border border-line bg-panel">
          <table className="w-full min-w-[960px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {["Machine", "Issue", "Priority", "Date", "Status", "Source", "Prediction"].map((head) => (
                  <th key={head} className="engrave px-4 py-3 text-left font-normal text-dim whitespace-nowrap">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {data.records.map((record) => (
                <tr key={record.id} className="transition-colors hover:bg-raised">
                  <td className="px-4 py-3">
                    <span className="font-mono text-[13px] text-fg">{record.machine_code}</span>
                    <span className="block text-[13px] text-muted">{record.machine_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[13px] text-fg">{record.issue}</span>
                    {record.notes && <span className="mt-1 block max-w-lg text-[12px] text-dim">{record.notes}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        record.priority === "High" ? "red" : record.priority === "Medium" ? "amber" : "neutral"
                      }
                    >
                      {record.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[13px] text-muted">{fmtDate(record.date)}</span>
                    <span
                      className={`block text-[11px] ${
                        record.status === "Overdue" ? "text-crit" : "text-dim"
                      }`}
                    >
                      {record.status === "Completed"
                        ? `done ${fmtDate(record.completed_date ?? record.date)}`
                        : record.days_from_today < 0
                          ? `${Math.abs(record.days_from_today)} days ago`
                          : record.days_from_today === 0
                            ? "today"
                            : `in ${record.days_from_today} days`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[record.status] ?? "neutral"}>{record.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-dim">{record.source}</td>
                  <td className="px-4 py-3">
                    {record.risk_level ? (
                      <div className="flex items-center gap-3">
                        <RiskBadge level={record.risk_level} />
                        <span className="font-mono text-[12px] tnum text-muted">
                          {record.failure_probability_pct}% risk · {record.health_score}% health
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-[12px] text-dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Panel title="How predicted work orders are raised" meta="Detect → Predict → Recommend">
        <ol className="grid gap-px bg-line md:grid-cols-3">
          {[
            {
              t: "Signals cross the envelope",
              d: "Temperature, vibration, load, energy per unit and downtime are normalised against the machine's rated baseline.",
            },
            {
              t: "Failure probability rises",
              d: "The weighted model returns a probability; at MEDIUM or above the backend writes a Predicted work order.",
            },
            {
              t: "A recommendation is attached",
              d: "The order carries the written action derived from the dominant contributing factor, ready for the planner.",
            },
          ].map((step, i) => (
            <li key={step.t} className="bg-panel p-4">
              <span className="font-mono text-[11px] text-signal">0{i + 1}</span>
              <h3 className="mt-3 text-[15px] font-semibold text-fg">{step.t}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{step.d}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
