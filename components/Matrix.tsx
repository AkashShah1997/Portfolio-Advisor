"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import { toBase, VERDICT_META } from "@/lib/portfolio";
import { fmtMoney } from "@/lib/symbols";

/**
 * The Buffett Matrix — every holding placed by "how good is the business?"
 * (quality + growth pillars) vs "how sensible is the price?" (valuation
 * pillar). Bubble area = current weight. The sweet spot is top-right:
 * wonderful companies at fair prices.
 */

const TONE_COLOR: Record<string, string> = {
  good: "#1baf7a",
  neutral: "#2a78d6",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  muted: "#898781",
};

interface Pt {
  symbol: string;
  x: number; // valuation score
  y: number; // quality+growth blend
  z: number; // value in base ccy
  color: string;
  verdict: string;
  watch: boolean;
}

function MatrixTip({ active, payload, base }: { active?: boolean; payload?: Array<{ payload?: Pt }>; base: Currency }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-surface hairline rounded-lg px-3 py-2 shadow-sm text-[12px]">
      <div className="font-semibold text-ink">
        {p.symbol}
        {p.watch ? " (watchlist)" : ""}
      </div>
      <div className="text-ink-2">Quality+growth {Math.round(p.y)} · Valuation {Math.round(p.x)}</div>
      <div className="text-ink-2">
        {p.watch ? p.verdict : `${fmtMoney(p.z, base, true)} · ${p.verdict}`}
      </div>
    </div>
  );
}

export function Matrix({
  rows,
  fx,
  base,
}: {
  rows: AnalyzedHolding[];
  fx: FxRates;
  base: Currency;
}) {
  const pts = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    for (const r of rows) {
      const sc = r.scorecard;
      if (!sc || sc.verdict === "INSUFFICIENT_DATA") continue;
      const q = sc.pillars.find((p) => p.pillar === "quality")?.score ?? 0;
      const g = sc.pillars.find((p) => p.pillar === "growth")?.score ?? 0;
      const v = sc.pillars.find((p) => p.pillar === "valuation");
      if (!v?.applicable) continue;
      out.push({
        symbol: r.holding.yahooSymbol,
        x: v.score,
        y: Math.round(0.6 * q + 0.4 * g),
        z: r.holding.watch ? 1 : Math.max(1, toBase(r.currentValue ?? r.invested, r.holding.currency, fx)),
        color: TONE_COLOR[VERDICT_META[sc.verdict].tone] ?? "#2a78d6",
        verdict: VERDICT_META[sc.verdict].label,
        watch: !!r.holding.watch,
      });
    }
    return out;
  }, [rows, fx]);

  if (pts.length < 2) return null;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 18, right: 18, bottom: 10, left: 2 }}>
          <CartesianGrid stroke="#e1e0d9" strokeWidth={1} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[-5, 105]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={{ stroke: "#c3c2b7", strokeWidth: 1 }}
            label={{
              value: "Valuation score → higher = more margin of safety",
              position: "insideBottom",
              offset: -4,
              style: { fill: "#898781", fontSize: 11 },
            }}
            height={40}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-5, 105]}
            ticks={[0, 25, 50, 75, 100]}
            width={34}
            tickLine={false}
            axisLine={false}
            label={{
              value: "Business quality + growth",
              angle: -90,
              position: "insideLeft",
              offset: 8,
              style: { fill: "#898781", fontSize: 11 },
            }}
          />
          <ZAxis type="number" dataKey="z" range={[70, 420]} />
          <ReferenceLine x={50} stroke="#c3c2b7" strokeDasharray="4 4" />
          <ReferenceLine y={50} stroke="#c3c2b7" strokeDasharray="4 4" />
          <Tooltip cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }} content={<MatrixTip base={base} />} />
          <Scatter data={pts} isAnimationActive>
            {pts.map((p) => (
              <Cell key={p.symbol} fill={p.color} fillOpacity={p.watch ? 0.35 : 0.75} stroke={p.color} />
            ))}
            <LabelList
              dataKey="symbol"
              position="top"
              style={{ fill: "#52514e", fontSize: 10, fontWeight: 600 }}
            />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      {/* quadrant captions */}
      <div className="pointer-events-none absolute inset-0 text-[10.5px] text-muted">
        <span className="absolute right-6 top-4">wonderful &amp; fairly priced — the sweet spot</span>
        <span className="absolute left-12 top-4">wonderful but pricey — patience</span>
        <span className="absolute right-6 bottom-12">cheap… for a reason?</span>
        <span className="absolute left-12 bottom-12">weak &amp; expensive — why own it?</span>
      </div>
    </div>
  );
}
