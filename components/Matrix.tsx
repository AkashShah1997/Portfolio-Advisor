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

  // Collision-aware labels: suffix stripped, pushed BELOW dots near the top
  // edge, anchored inward near the sides, parity-staggered so clusters
  // (several 100-score names in a corner) fan out instead of overprinting.
  const renderLabel = (props: { x?: number | string; y?: number | string; index?: number }) => {
    const i = props.index ?? -1;
    const p = pts[i];
    const px = Number(props.x);
    const py = Number(props.y);
    if (!p || !Number.isFinite(px) || !Number.isFinite(py)) return null;
    const short = p.symbol.replace(/\.(NS|BO|TO|V|NE)$/i, "");
    const nearTop = p.y > 90;
    const nearRight = p.x > 86;
    const nearLeft = p.x < 10;
    const stagger = (i % 3) * 9; // fan clustered labels apart
    const dy = nearTop ? 18 + stagger : -(9 + stagger);
    return (
      <text
        x={px}
        y={py}
        dx={nearRight ? -10 : nearLeft ? 10 : 0}
        dy={dy}
        textAnchor={nearRight ? "end" : nearLeft ? "start" : "middle"}
        style={{ fill: "var(--color-ink-2)", fontSize: 10, fontWeight: 600 }}
      >
        {short}
      </text>
    );
  };

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 24, right: 28, bottom: 10, left: 2 }}>
          <CartesianGrid stroke="#e1e0d9" strokeWidth={1} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[-8, 108]}
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
            domain={[-8, 108]}
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
            <LabelList dataKey="symbol" content={renderLabel} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      {/* quadrant captions — corner chips that stay legible under labels */}
      <div className="pointer-events-none absolute inset-0 text-[10px] text-muted">
        <span className="absolute right-7 top-1 bg-surface/85 hairline rounded-full px-2 py-[2px]">
          wonderful &amp; fairly priced — the sweet spot
        </span>
        <span className="absolute left-10 top-1 bg-surface/85 hairline rounded-full px-2 py-[2px]">
          wonderful but pricey — patience
        </span>
        <span className="absolute right-7 bottom-12 bg-surface/85 hairline rounded-full px-2 py-[2px]">
          cheap… for a reason?
        </span>
        <span className="absolute left-10 bottom-12 bg-surface/85 hairline rounded-full px-2 py-[2px]">
          weak &amp; expensive — why own it?
        </span>
      </div>
    </div>
  );
}
