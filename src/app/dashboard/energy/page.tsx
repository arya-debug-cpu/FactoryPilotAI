"use client";

import {
  CountUp,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Panel,
  fmt,
} from "@/components/ui";
import { Bars, CompareRows, LineChart } from "@/components/charts";
import { useApi } from "@/lib/api";

type Payload = {
  summary: {
    total_kwh: number;
    total_units: number;
    total_cost: number;
    kwh_per_unit: number;
    prev_kwh_per_unit: number;
    intensity_delta_pct: number;
    efficiency_pct: number;
    daily_average_kwh: number;
    price_per_kwh: number;
  };
  trend: { day: string; label: string; kwh: number; units: number; cost: number; kwh_per_unit: number }[];
  by_machine: any[];
  machines: { id: number; code: string; name: string }[];
};

export default function EnergyPage() {
  const { data, loading, error, reload } = useApi<Payload>("/energy?days=14");

  const s = data?.summary;
  const worse = (s?.intensity_delta_pct ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Consumption · intensity · efficiency</Eyebrow>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
          Energy
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          kWh per production unit is the number that matters — it exposes machines that consume
          more to make the same part.
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={6} label="Loading energy records" />}

      {data && s && (
        <>
          <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Total consumption", value: s.total_kwh, unit: "kWh · 14 days", decimals: 0, tone: "text-fg" },
              { label: "Energy per unit", value: s.kwh_per_unit, unit: "kWh / unit", decimals: 2, tone: "text-fg" },
              { label: "Previous period", value: s.prev_kwh_per_unit, unit: "kWh / unit", decimals: 2, tone: "text-muted" },
              {
                label: "Intensity change",
                value: s.intensity_delta_pct,
                unit: "% vs previous",
                decimals: 1,
                tone: worse ? "text-crit" : "text-led",
                suffix: "%",
              },
              {
                label: "Efficiency score",
                value: s.efficiency_pct,
                unit: "index",
                decimals: 0,
                tone: s.efficiency_pct >= 90 ? "text-led" : "text-amber",
                suffix: "%",
              },
              { label: "Estimated cost", value: s.total_cost, unit: `at ${s.price_per_kwh}/kWh`, decimals: 0, tone: "text-amber", prefix: "" },
            ].map((cell) => (
              <div key={cell.label} className="bg-panel p-4">
                <p className="engrave">{cell.label}</p>
                <p className={`mt-2 font-mono text-[24px] leading-none ${cell.tone}`}>
                  <CountUp value={cell.value} decimals={cell.decimals} />
                  {cell.suffix ?? ""}
                </p>
                <p className="mt-2 truncate font-mono text-[11px] text-dim">{cell.unit}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="Energy trend"
              meta={`${data.trend.length} days · kWh and intensity`}
            >
              <LineChart
                labels={data.trend.map((row) => row.label)}
                series={[
                  { name: "kWh", values: data.trend.map((row) => row.kwh), color: "#12a66a" },
                  { name: "kWh per unit ×50", values: data.trend.map((row) => row.kwh_per_unit * 50), color: "#e8a020" },
                ]}
                height={220}
                unit=""
              />
            </Panel>

            <Panel title="Daily consumption" meta="kWh per day">
              <Bars
                data={data.trend.map((row) => ({ label: row.label, value: row.kwh }))}
                legend={{ primary: "kWh", color: "#12a66a" }}
                height={200}
              />
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="Machine-wise consumption"
              meta={`${fmt(s.total_kwh, 0)} kWh across ${data.by_machine.length} machines`}
            >
              <CompareRows
                rows={data.by_machine.slice(0, 10)}
                valueOf={(row) => Number(row.kwh)}
                secondaryOf={(row) => Number(row.share_pct)}
                color="#12a66a"
                formatValue={(value) => `${fmt(value, 0)} kWh`}
                formatSecondary={(value) => `${value}% share`}
              />
            </Panel>

            <Panel title="Energy intensity" meta="kWh per unit — higher means more waste">
              <CompareRows
                rows={[...data.by_machine].sort((a, b) => b.kwh_per_unit - a.kwh_per_unit).slice(0, 10)}
                valueOf={(row) => Number(row.kwh_per_unit)}
                secondaryOf={(row) => Number(row.intensity_index)}
                color="#e8a020"
                formatValue={(value) => `${value.toFixed(2)} kWh/u`}
                formatSecondary={(value) => `index ${value}`}
              />
              <p className="mt-4 border-l-2 border-amber/60 pl-3 text-[13px] leading-relaxed text-muted">
                Intensity above 1.0 means the machine uses more energy per unit than the plant
                average — usually the first sign of mechanical drag.
              </p>
            </Panel>
          </div>

          <Panel title="Energy detail" meta="Machine, consumption, output, intensity and share" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    {["Machine", "Consumption", "Units produced", "kWh / unit", "Intensity index", "Share", "Cost"].map(
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
                      <td className="px-4 py-3 font-mono text-[13px] tnum text-fg">{fmt(row.kwh, 0)} kWh</td>
                      <td className="px-4 py-3 font-mono text-[13px] tnum text-muted">{fmt(row.units)}</td>
                      <td className="px-4 py-3 font-mono text-[13px] tnum text-muted">{row.kwh_per_unit}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-mono text-[13px] tnum ${
                            row.intensity_index > 1.15 ? "text-crit" : row.intensity_index > 1 ? "text-amber" : "text-led"
                          }`}
                        >
                          {row.intensity_index}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-[6px] w-20 bg-white/[0.06]">
                            <span
                              className="block h-full bg-signal"
                              style={{ width: `${Math.min(100, row.share_pct * 3)}%` }}
                            />
                          </span>
                          <span className="font-mono text-[12px] tnum text-muted">{row.share_pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] tnum text-amber">{fmt(row.cost, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {data && data.by_machine.length === 0 && (
        <EmptyState title="No energy records" hint="The selected range has no metering data." />
      )}
    </div>
  );
}
