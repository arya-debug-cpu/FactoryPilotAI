"use client";

import { useId, type ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* shared scale helpers                                                        */
/* -------------------------------------------------------------------------- */
function scale(values: number[][], pad = 0.12) {
  const flat = values.flat().filter((v) => Number.isFinite(v));
  if (!flat.length) return { min: 0, max: 1 };
  let min = Math.min(...flat);
  let max = Math.max(...flat);
  if (min > 0) min = 0;
  if (max === min) max = min + 1;
  const span = max - min;
  return { min: min - (min < 0 ? 0 : 0), max: max + span * pad };
}

/* -------------------------------------------------------------------------- */
/* sparkline: KPI micro-chart                                                  */
/* -------------------------------------------------------------------------- */
export function Sparkline({
  values,
  color = "#12a66a",
  width = 120,
  height = 26,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1="0" y1={height - 3} x2={width} y2={height - 3} stroke="#263029" strokeWidth="1" />
      </svg>
    );
  }
  const { min, max } = scale([values]);
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / (max - min || 1)) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle
        cx={width}
        cy={
          height -
          ((values[values.length - 1] - min) / (max - min || 1)) * (height - 4) -
          2
        }
        r="2"
        fill={color}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* bars: production vs target, defects, downtime                               */
/* -------------------------------------------------------------------------- */
export function Bars({
  data,
  height = 190,
  legend,
  valueUnit = "",
  showValues = false,
}: {
  data: { label: string; value: number; target?: number; secondary?: number }[];
  height?: number;
  legend?: { primary: string; secondary?: string; color?: string };
  valueUnit?: string;
  showValues?: boolean;
}) {
  if (!data.length) return <p className="text-xs text-dim">No records for this range.</p>;
  const max = Math.max(...data.map((d) => Math.max(d.value, d.target ?? 0)), 1);

  return (
    <div>
      <div className="flex items-end gap-[3px] border-b border-line" style={{ height }}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="group relative flex h-full flex-1 items-end justify-center gap-[2px]">
            {typeof d.target === "number" && (
              <div
                className="w-1/2 bg-white/[0.07] transition-colors group-hover:bg-white/[0.12]"
                style={{ height: `${Math.max(1, (d.target / max) * 100)}%` }}
                title={`${d.label} target: ${d.target}${valueUnit}`}
              />
            )}
            <div
              className="w-1/2 transition-all duration-700"
              style={{
                height: `${Math.max(1, (d.value / max) * 100)}%`,
                background: legend?.color ?? "#12a66a",
              }}
              title={`${d.label}: ${d.value}${valueUnit}`}
            />
            <div className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap border border-line bg-ink px-1.5 py-0.5 font-mono text-[10px] text-fg group-hover:block">
              {d.label}: {d.value}
              {valueUnit}
              {typeof d.target === "number" ? ` / ${d.target}` : ""}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-dim">
        <span>{data[0]?.label}</span>
        {showValues && data.length > 2 && <span className="text-muted">{data[Math.floor(data.length / 2)]?.label}</span>}
        <span>{data[data.length - 1]?.label}</span>
      </div>
      {legend && (
        <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-4" style={{ background: legend.color ?? "#12a66a" }} />
            {legend.primary}
          </span>
          {legend.secondary && (
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-4 bg-white/[0.12]" />
              {legend.secondary}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* multi-series line chart                                                     */
/* -------------------------------------------------------------------------- */
export function LineChart({
  labels,
  series,
  height = 200,
  unit = "",
}: {
  labels: string[];
  series: { name: string; values: number[]; color: string; dashed?: boolean }[];
  height?: number;
  unit?: string;
}) {
  const id = useId().replace(/:/g, "");
  const nonEmpty = series.filter((s) => s.values.length);
  if (!labels.length || !nonEmpty.length) {
    return <p className="text-xs text-dim">No readings for this range.</p>;
  }
  const { min, max } = scale(nonEmpty.map((s) => s.values));
  const W = 600;
  const H = 200;
  const x = (i: number, count: number) => (count <= 1 ? W : (i / (count - 1)) * W);
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;

  return (
    <div>
      <div className="relative" style={{ height }}>
        <div className="absolute right-0 top-0 font-mono text-[10px] text-dim tnum">
          {max.toFixed(max > 40 ? 0 : 1)}
          {unit}
        </div>
        <div className="absolute bottom-0 right-0 font-mono text-[10px] text-dim tnum">
          {min.toFixed(min > 40 ? 0 : 1)}
          {unit}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={nonEmpty.map((s) => s.name).join(", ")}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="#1b2320"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {nonEmpty.map((s) => {
            const d = s.values
              .map((v, i) => `${i === 0 ? "M" : "L"}${x(i, s.values.length).toFixed(1)},${y(v).toFixed(1)}`)
              .join(" ");
            return (
              <g key={s.name}>
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className="draw"
                  style={{ ["--fp-len" as string]: "2400" }}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-dim">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        {nonEmpty.map((s) => (
          <span key={s.name} className="flex items-center gap-2">
            <span className="inline-block h-[2px] w-5" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <span className="sr-only">{id}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* donut: machine status breakdown                                             */
/* -------------------------------------------------------------------------- */
export function Donut({
  segments,
  size = 168,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="shrink-0" role="img" aria-label={centerLabel}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1b2320" strokeWidth={thickness} />
        {segments.map((s) => {
          const len = (s.value / total) * circumference;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 2)} ${circumference}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="fill-fg font-mono"
          style={{ fontSize: 26 }}
        >
          {centerValue ?? String(total)}
        </text>
        <text
          x="50%"
          y="60%"
          textAnchor="middle"
          className="fill-dim font-mono"
          style={{ fontSize: 9, letterSpacing: 1.6 }}
        >
          {(centerLabel ?? "TOTAL").toUpperCase()}
        </text>
      </svg>
      <ul className="space-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-xs">
            <span className="inline-block h-2.5 w-2.5" style={{ background: s.color }} />
            <span className="text-muted w-24">{s.label}</span>
            <span className="font-mono tnum text-fg">{s.value}</span>
            <span className="font-mono tnum text-dim">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* gauge: failure probability                                                  */
/* -------------------------------------------------------------------------- */
export function Gauge({
  value,
  label,
  size = 190,
}: {
  value: number; // 0..100
  label?: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 72 ? "#d9422b" : pct >= 42 ? "#e8a020" : pct >= 18 ? "#e8a020" : "#12a66a";
  const stroke = pct >= 72 ? "#d9422b" : pct >= 42 ? "#e8a020" : "#12a66a";
  const r = 74;
  const circumference = Math.PI * r; // half circle
  const arc = circumference * (pct / 100);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.58} viewBox="0 0 180 104" role="img" aria-label={label}>
        <path
          d="M 16 92 A 74 74 0 0 1 164 92"
          fill="none"
          stroke="#1b2320"
          strokeWidth="12"
          strokeLinecap="butt"
        />
        <path
          d="M 16 92 A 74 74 0 0 1 164 92"
          fill="none"
          stroke={stroke}
          strokeWidth="12"
          strokeLinecap="butt"
          strokeDasharray={`${arc} ${circumference}`}
          style={{ transition: "stroke-dasharray .8s cubic-bezier(.3,.8,.35,1)" }}
        />
        <text
          x="90"
          y="80"
          textAnchor="middle"
          className="fill-fg font-mono"
          style={{ fontSize: 34 }}
        >
          {pct.toFixed(0)}
          <tspan style={{ fontSize: 15 }} className="fill-dim">
            %
          </tspan>
        </text>
        <text
          x="90"
          y="99"
          textAnchor="middle"
          className="fill-dim font-mono"
          style={{ fontSize: 9, letterSpacing: 1.8 }}
        >
          {(label ?? "FAILURE PROBABILITY").toUpperCase()}
        </text>
      </svg>
      <span className="sr-only" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* horizontal comparison rows (machine-wise production / energy)               */
/* -------------------------------------------------------------------------- */
export function CompareRows({
  rows,
  valueOf,
  secondaryOf,
  max,
  color = "#12a66a",
  formatValue,
  formatSecondary,
}: {
  rows: Record<string, any>[];
  valueOf: (row: Record<string, any>) => number;
  secondaryOf?: (row: Record<string, any>) => number;
  max?: number;
  color?: string;
  formatValue?: (v: number) => string;
  formatSecondary?: (v: number) => string;
}): ReactNode {
  if (!rows.length) return <p className="text-xs text-dim">No data.</p>;
  const top = max ?? Math.max(...rows.map(valueOf), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row, i) => {
        const value = valueOf(row);
        const secondary = secondaryOf ? secondaryOf(row) : null;
        return (
          <li key={i} className="grid grid-cols-[104px_1fr_auto] items-center gap-3">
            <span className="truncate font-mono text-[11px] text-muted">
              {row.code ?? row.label ?? row.name}
            </span>
            <span className="h-[7px] bg-white/[0.05]">
              <span
                className="block h-full transition-[width] duration-700"
                style={{ width: `${Math.max(2, (value / top) * 100)}%`, background: color }}
              />
            </span>
            <span className="font-mono text-[11px] tnum text-fg w-24 text-right">
              {formatValue ? formatValue(value) : value}
              {secondary !== null && (
                <span className="text-dim">
                  {" / "}
                  {formatSecondary ? formatSecondary(secondary) : secondary}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
