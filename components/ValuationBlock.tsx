"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import type { Scorecard, StockData, Currency } from "@/lib/types";
import { buildValuation, VALUATION_STATUS_META } from "@/lib/valuation";
import { fmtMoney, fmtPct } from "@/lib/symbols";
import { Badge } from "./ui";
import { EASE } from "./anim";

/**
 * Intrinsic-value strip: a price-vs-value band with buy zone, fair band,
 * your average cost, and the current price - plus the methods behind it.
 */
export function ValuationBlock({
  data,
  scorecard,
  avgCost,
}: {
  data: StockData;
  scorecard: Scorecard;
  avgCost?: number;
}) {
  const val = useMemo(() => buildValuation(data, scorecard), [data, scorecard]);
  const cur = (data.quote.currency ?? "USD") as Currency;
  const price = data.quote.price;

  if (val.status === "UNKNOWN" || val.intrinsic === undefined || price === undefined) {
    return (
      <div className="rounded-lg bg-page hairline p-3">
        <div className="text-[12px] font-semibold text-ink-2 mb-1">Intrinsic value (rough)</div>
        <p className="text-[12px] text-muted">
          Not enough fundamental data for a mechanical estimate - common for ETFs, very new
          listings, or sparse coverage. Judge this one qualitatively.
        </p>
      </div>
    );
  }

  const { low, high, buyBelow, intrinsic } = val;
  const candidates = [low!, high!, buyBelow!, intrinsic, price];
  if (avgCost && avgCost > 0) candidates.push(avgCost);
  const lo = Math.min(...candidates) * 0.9;
  const hi = Math.max(...candidates) * 1.06;
  const pos = (v: number) => `${Math.min(98, Math.max(2, ((v - lo) / (hi - lo)) * 100)).toFixed(1)}%`;
  const sm = VALUATION_STATUS_META[val.status];

  return (
    <div className="rounded-lg bg-page hairline p-3">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-[12px] font-semibold text-ink-2">Intrinsic value (rough)</span>
        <Badge tone={sm.tone}>{sm.label}</Badge>
        {val.marginOfSafety !== undefined && (
          <Badge tone={val.marginOfSafety >= val.mosTarget ? "good" : val.marginOfSafety >= 0 ? "neutral" : "warning"}>
            {val.marginOfSafety >= 0
              ? `${fmtPct(val.marginOfSafety, 0)} margin of safety`
              : `${fmtPct(-val.marginOfSafety, 0)} above estimate`}
          </Badge>
        )}
        <span className="text-[11px] text-muted ml-auto">
          needs {fmtPct(val.mosTarget, 0)} MoS at this quality
        </span>
      </div>

      {/* value band */}
      <div className="relative mt-5 mb-6 mx-1">
        <div className="h-[10px] rounded-full bg-surface hairline overflow-hidden relative">
          {/* buy zone */}
          <motion.div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{ background: "rgba(12,163,12,0.18)" }}
            initial={{ width: 0 }}
            whileInView={{ width: pos(buyBelow!) }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE }}
          />
          {/* fair band */}
          <div
            className="absolute inset-y-0"
            style={{
              left: pos(low!),
              width: `calc(${pos(high!)} - ${pos(low!)})`,
              background: "rgba(42,120,214,0.14)",
            }}
          />
          {/* intrinsic tick */}
          <div className="absolute inset-y-[-2px] w-[2px] bg-ink" style={{ left: pos(intrinsic) }} />
        </div>

        {/* price marker */}
        <motion.div
          className="absolute -top-4 -translate-x-1/2 flex flex-col items-center"
          initial={{ left: "2%", opacity: 0 }}
          whileInView={{ left: pos(price), opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ left: pos(price) }}
        >
          <span className="text-[10px] font-semibold text-series-2 leading-none mb-[2px] whitespace-nowrap">
            price {fmtMoney(price, cur, true)}
          </span>
          <span className="w-[9px] h-[9px] rounded-full border-2 border-surface shadow-sm" style={{ background: "#eb6834" }} />
        </motion.div>

        {/* avg cost marker */}
        {avgCost !== undefined && avgCost > 0 && (
          <div className="absolute top-[12px] -translate-x-1/2 flex flex-col items-center" style={{ left: pos(avgCost) }}>
            <span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-muted" />
            <span className="text-[10px] text-muted leading-none mt-[2px] whitespace-nowrap">
              your avg {fmtMoney(avgCost, cur, true)}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-2 tnum">
        <span>
          Buy below <strong className="text-success-text">{fmtMoney(buyBelow, cur, true)}</strong>
        </span>
        <span>
          Fair ≈ <strong className="text-ink">{fmtMoney(intrinsic, cur, true)}</strong>
        </span>
        <span>
          Band {fmtMoney(low, cur, true)}–{fmtMoney(high, cur, true)}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
        {val.methods.map((m) => (
          <div key={m.id} className="text-[11.5px] leading-snug">
            <span className="text-ink">{m.label}</span>{" "}
            <strong className="tnum">{fmtMoney(m.value, cur, true)}</strong>
            <span className="block text-[10.5px] text-muted">{m.note}</span>
          </div>
        ))}
      </div>

      <p className="text-[10.5px] text-muted italic mt-2">
        Median of the methods above, computed mechanically from the same free data as the scorecard
        {val.assumptions.growth !== undefined
          ? ` (growth ${fmtPct(val.assumptions.growth)}, discount ${fmtPct(val.assumptions.discount, 0)})`
          : ""}
        . A sanity anchor, not a target - Buffett: “It is better to be approximately right than precisely wrong.”
      </p>
    </div>
  );
}
