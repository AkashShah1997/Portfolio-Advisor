"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzedHolding, Currency } from "@/lib/types";
import { MARKET_META, type Market } from "@/lib/store";
import { runBacktest } from "@/lib/backtest";
import type { Candle } from "@/lib/history";
import { VERDICT_META } from "@/lib/portfolio";
import { fmtMoney, fmtPct } from "@/lib/symbols";
import { Badge, Card, SectionTitle, Spinner } from "./ui";

/**
 * Backtest - re-run the scorecard as of 1/2/3 years ago using ONLY data that
 * existed then, and show what each verdict bucket actually returned since,
 * against the index. A proof-of-discipline sanity check with its limits
 * printed on it, not a performance claim.
 */
export function BacktestPanel({ rows, market }: { rows: AnalyzedHolding[]; market: Market }) {
  const meta = MARKET_META[market];
  const [yearsBack, setYearsBack] = useState<1 | 2 | 3>(3);

  // benchmark candles for the same window
  const [bench, setBench] = useState<Record<string, Candle[] | "loading" | "error">>({});
  const inFlight = useRef<Set<string>>(new Set());
  const benchSym = meta.benchmark.symbol;
  useEffect(() => {
    if (bench[benchSym] !== undefined || inFlight.current.has(benchSym)) return;
    inFlight.current.add(benchSym);
    void (async () => {
      await Promise.resolve();
      setBench((prev) => (prev[benchSym] === undefined ? { ...prev, [benchSym]: "loading" } : prev));
      try {
        const res = await fetch(`/api/history/${encodeURIComponent(benchSym)}?range=5y`);
        const j = (await res.json()) as { candles?: Candle[] };
        setBench((prev) => ({
          ...prev,
          [benchSym]: Array.isArray(j.candles) && j.candles.length ? j.candles : "error",
        }));
      } catch {
        setBench((prev) => ({ ...prev, [benchSym]: "error" }));
      } finally {
        inFlight.current.delete(benchSym);
      }
    })();
  }, [benchSym, bench]);

  const analyzed = useMemo(() => rows.filter((r) => r.data && r.scorecard), [rows]);
  const benchCandles = typeof bench[benchSym] === "object" ? (bench[benchSym] as Candle[]) : undefined;

  const result = useMemo(
    () => runBacktest(analyzed, yearsBack, benchCandles),
    [analyzed, yearsBack, benchCandles]
  );

  const cur = meta.base as Currency;
  const drift = (r: { verdictNow?: string; verdictThen: string; scoreNow?: number; scoreThen: number }) => {
    if (r.verdictNow === undefined || r.scoreNow === undefined) return "";
    if (r.scoreNow > r.scoreThen + 4) return " ↑";
    if (r.scoreNow < r.scoreThen - 4) return " ↓";
    return "";
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle sub="The same scorecard, re-run with ONLY the statements and the price that existed at the cutoff - anything unknowable then (dividend yield, TTM figures, 52-week range) honestly goes n/a. Then: what each verdict bucket returned since, vs the index. Two honest limits: your current list is survivors (whatever you already sold isn't graded), and the engine is judged on the same history it was built from - so read this as a limited diagnostic, never as proof of returns.">
          Backtest - would the engine have helped?
        </SectionTitle>

        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-ink-2">Score everything as of</span>
          <div className="inline-flex bg-page hairline rounded-lg p-0.5 font-medium">
            {([1, 2, 3] as const).map((y) => (
              <button
                key={y}
                onClick={() => setYearsBack(y)}
                className={`px-2.5 py-0.5 rounded-md transition-colors ${yearsBack === y ? "bg-series-1 text-white" : "text-ink-2 hover:text-ink"}`}
                aria-pressed={yearsBack === y}
              >
                {y}y ago
              </button>
            ))}
          </div>
          <span className="text-muted">cutoff {result.cutoffISO}</span>
          {bench[benchSym] === "loading" && (
            <span className="text-muted">
              <Spinner /> fetching {meta.benchmark.label}…
            </span>
          )}
        </div>

        {result.rows.length === 0 ? (
          <p className="text-[13px] text-muted mt-3">{result.readout}</p>
        ) : (
          <>
            {/* verdict buckets */}
            <div className="flex flex-wrap gap-2.5 mt-4">
              {result.buckets.map((b) => {
                const vm = VERDICT_META[b.verdict];
                return (
                  <div key={b.verdict} className="bg-page hairline rounded-xl px-3 py-2 min-w-[150px]">
                    <Badge tone={vm.tone} icon={vm.icon}>
                      {vm.label} then
                    </Badge>
                    <div className="text-[17px] font-semibold tnum mt-1.5 leading-none">
                      {b.avgCagr !== undefined ? `${b.avgCagr >= 0 ? "+" : ""}${fmtPct(b.avgCagr)}` : "–"}
                      <span className="text-[11px] font-normal text-muted">/yr avg</span>
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      {b.n} name{b.n === 1 ? "" : "s"}
                      {b.beatBench !== undefined &&
                        ` · ${Math.round(b.beatBench * b.n)}/${b.n} beat the index`}
                    </div>
                  </div>
                );
              })}
              {result.benchCagr !== undefined && (
                <div className="bg-page hairline rounded-xl px-3 py-2 min-w-[150px]">
                  <Badge tone="muted">{meta.benchmark.label}</Badge>
                  <div className="text-[17px] font-semibold tnum mt-1.5 leading-none">
                    {result.benchCagr >= 0 ? "+" : ""}
                    {fmtPct(result.benchCagr)}
                    <span className="text-[11px] font-normal text-muted">/yr</span>
                  </div>
                  <div className="text-[11px] text-muted mt-1">same window</div>
                </div>
              )}
            </div>

            <p className="text-[13px] text-ink mt-3 leading-snug">{result.readout}</p>

            {/* per-name table */}
            <div className="overflow-x-auto mt-3 -mx-1 px-1">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] text-muted border-b border-grid uppercase tracking-wide">
                    <th className="py-1.5 pr-3 font-medium">Company</th>
                    <th className="py-1.5 pr-3 font-medium">Verdict then</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Score then</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Price then → now</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Since (/yr)</th>
                    <th className="py-1.5 pr-3 font-medium text-right">vs index</th>
                    <th className="py-1.5 font-medium">Verdict now</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => {
                    const vt = VERDICT_META[r.verdictThen];
                    const vn = r.verdictNow ? VERDICT_META[r.verdictNow] : undefined;
                    return (
                      <tr key={r.symbol} className="border-b border-grid/50 hover:bg-page/60">
                        <td className="py-2 pr-3">
                          <span className="font-semibold">{r.symbol.replace(/\.(NS|BO|TO|V)$/i, "")}</span>{" "}
                          {r.watch && <Badge tone="muted">☆</Badge>}
                          <div className="text-[11px] text-muted truncate max-w-[180px]">{r.name}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={vt.tone} icon={vt.icon}>
                            {vt.label}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right tnum">{r.scoreThen}</td>
                        <td className="py-2 pr-3 text-right tnum whitespace-nowrap">
                          {r.priceThen !== undefined ? fmtMoney(r.priceThen, cur, true) : "–"} →{" "}
                          {r.priceNow !== undefined ? fmtMoney(r.priceNow, cur, true) : "–"}
                        </td>
                        <td className={`py-2 pr-3 text-right tnum font-medium ${(r.cagrSince ?? 0) >= 0 ? "text-success-text" : "text-status-critical"}`}>
                          {r.cagrSince !== undefined ? `${r.cagrSince >= 0 ? "+" : ""}${fmtPct(r.cagrSince)}` : "–"}
                        </td>
                        <td className={`py-2 pr-3 text-right tnum ${(r.vsBench ?? 0) >= 0 ? "text-success-text" : "text-ink-2"}`}>
                          {r.vsBench !== undefined ? `${r.vsBench >= 0 ? "+" : ""}${fmtPct(r.vsBench)}` : "–"}
                        </td>
                        <td className="py-2">
                          {vn ? (
                            <span className="whitespace-nowrap">
                              <Badge tone={vn.tone} icon={vn.icon}>
                                {vn.label}
                              </Badge>
                              <span className="text-muted text-[11px]">{drift(r)}</span>
                            </span>
                          ) : (
                            "–"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {result.skipped.length > 0 && (
              <p className="text-[11.5px] text-muted mt-2">
                Skipped: {result.skipped.map((s) => s.symbol.replace(/\.(NS|BO|TO|V)$/i, "")).join(", ")} - {result.skipped[0].reason}.
              </p>
            )}
          </>
        )}

        <p className="text-[11px] text-muted italic mt-3 leading-relaxed">
          Honest limits: this is a sanity check on a handful of names, not statistics. Returns are price-only
          (dividends excluded on both sides), the sample contains only names that still exist and that you track
          (survivors), and 5–6 fiscal years of free data cap the cutoff at ~3 years. It answers “did the
          discipline point the right way here?” - nothing more. Add watchlist names and rescan to widen the
          sample.
        </p>
      </Card>
    </div>
  );
}
