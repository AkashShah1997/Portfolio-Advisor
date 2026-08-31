"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/history";
import { crashRecord, describeCrashRecord, worstEver } from "@/lib/crashrecord";
import { MARKET_META, type Market } from "@/lib/store";
import { fmtPct } from "@/lib/symbols";
import { Badge, Card, InfoTip, SectionTitle, Spinner } from "./ui";

/**
 * How this stock actually behaved when the market broke - from its own price
 * history, against the index, for every real shock the data covers. The point
 * is not prediction; it is knowing the number BEFORE you are living through it.
 */
export function CrashRecord({ symbol, market }: { symbol: string; market: Market }) {
  const benchSym = MARKET_META[market].benchmark.symbol;
  const benchLabel = MARKET_META[market].benchmark.label;
  const [state, setState] = useState<Record<string, Candle[] | "loading" | "error">>({});
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const s of [symbol, benchSym]) {
      if (state[s] !== undefined || inFlight.current.has(s)) continue;
      inFlight.current.add(s);
      void (async () => {
        await Promise.resolve();
        setState((p) => (p[s] === undefined ? { ...p, [s]: "loading" } : p));
        try {
          const res = await fetch(`/api/history/${encodeURIComponent(s)}?range=max`);
          const j = (await res.json()) as { candles?: Candle[] };
          setState((p) => ({ ...p, [s]: Array.isArray(j.candles) && j.candles.length ? j.candles : "error" }));
        } catch {
          setState((p) => ({ ...p, [s]: "error" }));
        } finally {
          inFlight.current.delete(s);
        }
      })();
    }
  }, [symbol, benchSym, state]);

  const candles = typeof state[symbol] === "object" ? (state[symbol] as Candle[]) : undefined;
  const bench = typeof state[benchSym] === "object" ? (state[benchSym] as Candle[]) : undefined;
  const rows = useMemo(() => (candles ? crashRecord(candles, bench) : []), [candles, bench]);
  const worst = useMemo(() => (candles ? worstEver(candles) : null), [candles]);
  const read = useMemo(() => describeCrashRecord(rows, worst), [rows, worst]);

  const loading = state[symbol] === "loading" || state[symbol] === undefined;

  return (
    <Card className="p-4">
      <SectionTitle sub="Not a model - the actual price history through every real shock the data covers, against the index over the same window. The question a long-term holder must answer in advance: would you still have been holding at the bottom?">
        How it behaved when the market broke <InfoTip k="crashRecord" />
      </SectionTitle>

      {loading && (
        <p className="text-[13px] text-ink-2">
          <Spinner /> Loading the full price history…
        </p>
      )}
      {state[symbol] === "error" && (
        <p className="text-[12.5px] text-muted">Couldn&apos;t load the long history for this symbol right now.</p>
      )}

      {candles && (
        <>
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] text-muted border-b border-grid uppercase tracking-wide">
                    <th className="py-1.5 pr-3 font-medium">Shock</th>
                    <th className="py-1.5 pr-3 font-medium text-right">This stock</th>
                    <th className="py-1.5 pr-3 font-medium text-right">{benchLabel}</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Held up</th>
                    <th className="py-1.5 font-medium text-right">Back to the old high</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-grid/50 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.label}</div>
                        <div className="text-[11px] text-muted leading-snug max-w-[240px]">{r.blurb}</div>
                        {r.partial && <div className="text-[10.5px] text-muted italic">partial window - data starts mid-shock</div>}
                      </td>
                      <td className="py-2 pr-3 text-right tnum font-medium text-status-critical">
                        {fmtPct(r.drawdown)}
                      </td>
                      <td className="py-2 pr-3 text-right tnum text-ink-2">
                        {r.benchDrawdown !== undefined ? fmtPct(r.benchDrawdown) : "–"}
                      </td>
                      <td
                        className={`py-2 pr-3 text-right tnum ${(r.vsBench ?? 0) > 0 ? "text-success-text" : "text-ink-2"}`}
                      >
                        {r.vsBench !== undefined ? `${r.vsBench > 0 ? "+" : ""}${(r.vsBench * 100).toFixed(0)} pts` : "–"}
                      </td>
                      <td className="py-2 text-right tnum text-ink-2 whitespace-nowrap">
                        {r.recoveryMonths !== undefined ? `${Math.round(r.recoveryMonths)} months` : "not yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-2">
              The price history here does not reach any of the named market shocks - too young a listing, or a short
              series from the free feed.
            </p>
          )}

          {worst && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={worst.drawdown <= -0.5 ? "serious" : worst.drawdown <= -0.3 ? "warning" : "neutral"}>
                deepest fall on record {fmtPct(worst.drawdown)}
              </Badge>
              <span className="text-[11.5px] text-muted tnum">
                {worst.peakDate} → {worst.troughDate}
                {worst.recoveryMonths !== undefined
                  ? ` · ${Math.round(worst.recoveryMonths)} months to recover`
                  : " · not recovered within this data"}
              </span>
            </div>
          )}

          <p className="text-[12.5px] text-ink mt-2.5 leading-snug">{read}</p>
          <p className="text-[11px] text-muted italic mt-2 leading-relaxed">
            Honest limits: survivor bias is total here - a company that never came back has no chart to show you.
            Returns are price-only, and the next crash will have a different cause. What repeats is the shape:
            leverage falls hardest, cash-generative franchises recover first, and the investors who did worst were
            the ones who sold at the trough.
          </p>
        </>
      )}
    </Card>
  );
}
