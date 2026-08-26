"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Currency, PricePoint, YearFinancials } from "@/lib/types";
import { CURRENCY_SYMBOL } from "@/lib/symbols";

const C = {
  s1: "#2a78d6",
  s2: "#eb6834",
  s3: "#1baf7a",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  muted: "#898781",
  ink: "#0b0b0b",
  ink2: "#52514e",
  surface: "#fcfcfb",
};

/** Compact money for axis ticks / labels, currency-aware (INR uses L/Cr). */
export function compactMoney(v: number, currency: Currency | string): string {
  const sym = CURRENCY_SYMBOL[(currency as Currency) in CURRENCY_SYMBOL ? (currency as Currency) : "USD"] ?? "";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (currency === "INR") {
    if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(1)}T`;
    if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(1)} Cr`;
    if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(1)} L`;
  } else {
    if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(0)}K`;
  }
  return `${sign}${sym}${abs.toFixed(0)}`;
}

/* Shared tooltip: value leads (strong), series name secondary, line-key in series color. */
interface TipPayload {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}
function ChartTip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface hairline rounded-lg px-3 py-2 shadow-sm text-[12px]">
      <div className="text-ink-2 mb-1">{String(label ?? "")}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block w-3 h-[2.5px] rounded" style={{ background: p.color ?? C.s1 }} aria-hidden />
          <span className="font-semibold text-ink tnum">{typeof p.value === "number" ? format(p.value) : p.value}</span>
          {p.name !== undefined && <span className="text-ink-2">{String(p.name)}</span>}
        </div>
      ))}
    </div>
  );
}

/** 5-year monthly price line - single series, crosshair tooltip, no legend. */
export function PriceLine({ prices, currency }: { prices: PricePoint[]; currency: Currency | string }) {
  if (prices.length < 2) return <div className="text-muted text-[12px]">No price history available.</div>;
  const data = prices.map((p) => ({ x: p.date.slice(0, 7), close: p.close }));
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="x"
          tickLine={false}
          axisLine={{ stroke: C.baseline, strokeWidth: 1 }}
          interval="preserveStartEnd"
          minTickGap={48}
        />
        <YAxis
          width={62}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => compactMoney(v, currency)}
        />
        <Tooltip
          cursor={{ stroke: C.baseline, strokeWidth: 1 }}
          content={<ChartTip format={(v) => compactMoney(v, currency)} />}
        />
        <Line
          type="monotone"
          dataKey="close"
          name="Close"
          stroke={C.s1}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          dot={false}
          activeDot={{ r: 4, fill: C.s1, stroke: C.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Revenue vs Net income - two series, grouped columns, legend required. */
export function RevenueEarnings({ years, currency }: { years: YearFinancials[]; currency: Currency | string }) {
  const rows = years
    .filter((y) => y.revenue !== undefined || y.netIncome !== undefined)
    .map((y) => ({ year: `FY${String(y.year).slice(2)}`, Revenue: y.revenue, "Net income": y.netIncome }));
  if (!rows.length) return <div className="text-muted text-[12px]">No statement history available.</div>;
  return (
    <div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: C.baseline, strokeWidth: 1 }} />
          <YAxis
            width={66}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => compactMoney(v, currency)}
          />
          <Tooltip
            cursor={{ fill: "rgba(11,11,11,0.04)" }}
            content={<ChartTip format={(v) => compactMoney(v, currency)} />}
          />
          <Bar dataKey="Revenue" fill={C.s1} maxBarSize={22} radius={[4, 4, 0, 0]} />
          <Bar dataKey="Net income" fill={C.s2} maxBarSize={22} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 justify-center mt-1 text-[11.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: C.s1 }} aria-hidden /> Revenue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: C.s2 }} aria-hidden /> Net income
        </span>
      </div>
    </div>
  );
}

/** Horizontal magnitude bars, single hue (allocation, sector split). */
export function HBars({
  items,
  format,
  maxBars = 12,
}: {
  items: { label: string; value: number }[];
  format: (v: number) => string;
  maxBars?: number;
}) {
  let rows = items;
  if (items.length > maxBars) {
    const head = items.slice(0, maxBars - 1);
    const other = items.slice(maxBars - 1).reduce((a, b) => a + b.value, 0);
    rows = [...head, { label: "Other", value: other }];
  }
  const total = rows.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const pct = (r.value / total) * 100;
        return (
          <div key={r.label} className="grid grid-cols-[110px_1fr_86px] items-center gap-2" title={`${r.label}: ${format(r.value)}`}>
            <div className="text-[12px] text-ink-2 truncate">{r.label}</div>
            <div className="h-[14px] bg-page rounded-r-[4px] overflow-hidden">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${Math.max(pct, 0.5)}%`, background: C.s1 }}
              />
            </div>
            <div className="text-[12px] text-ink tnum text-right">
              {pct.toFixed(1)}% <span className="text-muted">·</span> <span className="text-ink-2">{format(r.value)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One horizontal stacked bar for ≤3 categories (country split), slots 1–3 + legend.
 *  Color follows the ENTITY (stable per label), never its current rank. */
const GEO_COLOR: Record<string, string> = {
  India: C.s1,
  Canada: C.s2,
  "United States": C.s3,
};
export function StackedSplit({ items, format }: { items: { label: string; value: number }[]; format: (v: number) => string }) {
  const fallback = [C.s1, C.s2, C.s3];
  const rows = items.slice(0, 3);
  const colorOf = (label: string, i: number) => GEO_COLOR[label] ?? fallback[i];
  const total = rows.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div>
      <div className="flex h-[18px] rounded-[4px] overflow-hidden" role="img" aria-label={rows.map((r) => `${r.label} ${((r.value / total) * 100).toFixed(0)}%`).join(", ")}>
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              width: `${(r.value / total) * 100}%`,
              background: colorOf(r.label, i),
              borderRight: i < rows.length - 1 ? `2px solid ${C.surface}` : undefined,
            }}
            title={`${r.label}: ${format(r.value)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11.5px] text-ink-2">
        {rows.map((r, i) => (
          <span key={r.label} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: colorOf(r.label, i) }} aria-hidden />
            {r.label} <span className="text-ink font-medium tnum">{((r.value / total) * 100).toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** EPS trend mini columns (single hue). */
export function EpsBars({ years }: { years: YearFinancials[] }) {
  const rows = years
    .map((y) => ({ year: `FY${String(y.year).slice(2)}`, EPS: y.dilutedEPS ?? y.basicEPS }))
    .filter((r) => r.EPS !== undefined);
  if (rows.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 2, left: 4 }}>
        <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
        <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: C.baseline, strokeWidth: 1 }} />
        <YAxis width={42} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toFixed(0)} />
        <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTip format={(v) => v.toFixed(2)} />} />
        <Bar dataKey="EPS" maxBarSize={20} radius={[4, 4, 0, 0]}>
          {rows.map((r, i) => (
            <Cell key={i} fill={(r.EPS ?? 0) < 0 ? "#d03b3b" : C.s1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
