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
  fmt,
  fmtDate,
} from "@/components/ui";
import { useApi } from "@/lib/api";

type Order = {
  id: number;
  order_code: string;
  customer: string;
  product: string;
  quantity: number;
  completed_quantity: number;
  remaining_quantity: number;
  deadline: string;
  days_left: number;
  priority: string;
  status: string;
  progress_pct: number;
};

type Payload = {
  count: number;
  summary: {
    total: number;
    active: number;
    pending: number;
    delayed: number;
    completed: number;
    due_within_5_days: number;
    completion_pct: number;
  };
  orders: Order[];
};

const STATUSES = ["ALL", "Pending", "In Production", "Delayed", "Completed"];
const PRIORITIES = ["ALL", "Critical", "High", "Medium", "Low"];

const STATUS_TONE: Record<string, string> = {
  Pending: "neutral",
  "In Production": "emerald",
  Delayed: "red",
  Completed: "emerald",
};

export default function OrdersPage() {
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");

  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (priority !== "ALL") params.set("priority", priority);
  const query = params.toString() ? `?${params.toString()}` : "";

  const { data, loading, error, reload } = useApi<Payload>(`/orders${query}`);
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Customer commitments</Eyebrow>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
          Orders
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Quantity, completion, remaining balance, deadline, priority and status for every open
          sales order.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Active orders", value: summary?.active ?? 0, tone: "text-fg" },
          { label: "Delayed orders", value: summary?.delayed ?? 0, tone: "text-crit" },
          { label: "Completed", value: summary?.completed ?? 0, tone: "text-led" },
          { label: "Pending", value: summary?.pending ?? 0, tone: "text-amber" },
          { label: "Due within 5 days", value: summary?.due_within_5_days ?? 0, tone: "text-amber" },
          { label: "Fulfilment", value: summary?.completion_pct ?? 0, tone: "text-led", suffix: "%", decimals: 1 },
        ].map((cell) => (
          <div key={cell.label} className="bg-panel p-4">
            <p className="engrave">{cell.label}</p>
            <p className={`mt-2 font-mono text-[25px] leading-none ${cell.tone}`}>
              <CountUp value={cell.value} decimals={cell.decimals ?? 0} />
              {cell.suffix ?? ""}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border border-line bg-panel p-3">
        <span className="engrave text-dim">Status</span>
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
        <span className="engrave ml-2 text-dim">Priority</span>
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          className="border border-line bg-ink px-3 py-2 font-mono text-[12px] text-fg focus:border-signal focus:outline-none"
        >
          {PRIORITIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-[11px] text-dim">
          {loading ? "…" : `${data?.count ?? 0} orders`}
        </span>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Loading rows={6} label="Loading orders" />}

      {data && data.orders.length === 0 && (
        <EmptyState title="No orders match this filter" hint="Try another status or priority." />
      )}

      {data && data.orders.length > 0 && (
        <div className="overflow-x-auto border border-line bg-panel">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {["Order", "Product", "Quantity", "Completed", "Remaining", "Deadline", "Priority", "Status"].map(
                  (head) => (
                    <th key={head} className="engrave px-4 py-3 text-left font-normal text-dim whitespace-nowrap">
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {data.orders.map((order) => {
                const late = order.days_left < 0 && order.status !== "Completed";
                return (
                  <tr key={order.id} className="transition-colors hover:bg-raised">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] text-fg">{order.order_code}</span>
                      <span className="block text-[12px] text-dim">{order.customer}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted">{order.product}</td>
                    <td className="px-4 py-3 font-mono text-[13px] tnum text-muted">{fmt(order.quantity)}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] tnum text-fg">{fmt(order.completed_quantity)}</span>
                      <div className="mt-1.5 h-[5px] w-28 bg-white/[0.06]">
                        <div className="h-full bg-signal" style={{ width: `${order.progress_pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] tnum text-amber">
                      {fmt(order.remaining_quantity)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono text-[13px] tnum ${late ? "text-crit" : "text-muted"}`}>
                        {fmtDate(order.deadline)}
                      </span>
                      <span
                        className={`block text-[11px] ${late ? "text-crit" : order.days_left <= 3 ? "text-amber" : "text-dim"}`}
                      >
                        {order.status === "Completed"
                          ? "delivered"
                          : late
                            ? `${Math.abs(order.days_left)} days overdue`
                            : `in ${order.days_left} days`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          order.priority === "Critical" || order.priority === "High"
                            ? order.priority === "Critical"
                              ? "red"
                              : "amber"
                            : "neutral"
                        }
                      >
                        {order.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[order.status] ?? "neutral"}>{order.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Panel title="Status distribution" meta="All orders in the database">
        <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
          {[
            ["Pending", summary?.pending ?? 0, "#6c7873"],
            ["In Production", summary?.active ?? 0, "#12a66a"],
            ["Delayed", summary?.delayed ?? 0, "#d9422b"],
            ["Completed", summary?.completed ?? 0, "#34d399"],
          ].map(([label, value, color]) => (
            <div key={label as string} className="bg-panel px-4 py-4">
              <p className="engrave">{label as string}</p>
              <p className="mt-2 font-mono text-[26px] leading-none" style={{ color: color as string }}>
                {value as number}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
