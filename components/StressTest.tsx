"use client";

import { useMemo, useState } from "react";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import { runStress, STRESS_SCENARIOS } from "@/lib/stress";
import { fmtMoney, fmtPct } from "@/lib/symbols";
import { Card, InfoTip, SectionTitle } from "./ui";
import { AnimatedNumber } from "./anim";

/**
 * The crash stress test - real historical crashes applied to the portfolio
 * you hold today. A fire drill for sizing, with the recovery story and the
 * what-DCA-did lesson attached, so the drill teaches the response.
 */
export function StressTest({
  rows,
  fx,
  base,
  onOpenChart,
}: {
  rows: AnalyzedHolding[];
  fx: FxRates;
  base: Currency;
  onOpenChart?: (symbol: string) => void;
}) {
  const [scenarioId, setScenarioId] = useState(STRESS_SCENARIOS[1].id); // default: 2008
  const scenario = STRESS_SCENARIOS.find((s) => s.id === scenarioId) ?? STRESS_SCENARIOS[0];
  const result = useMemo(() => runStress(rows, fx, scenario), [rows, fx, scenario]);

  return (
    <Card className="p-4">
      <SectionTitle sub="Real past crashes applied to what you hold TODAY - a fire drill for position sizing, not a forecast. If the after-number would make you sell at the bottom, fix the allocation now, while it's calm.">
        If history repeats - the stress test <InfoTip k="stress" />
      </SectionTitle>

      {/* scenario picker */}
      <div className="flex flex-wrap gap-1.5 text-[12.5px] font-medium">
        {STRESS_SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => setScenarioId(s.id)}
            aria-pressed={s.id === scenario.id}
            className={`px-2.5 py-1 rounded-full hairline transition-colors ${
              s.id === scenario.id ? "bg-series-1 text-white" : "bg-page text-ink-2 hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {!result ? (
        <p className="text-[13px] text-muted mt-3">
          Nothing to stress-test yet - add holdings with capital in them and analyze.
        </p>
      ) : (
        <>
          <p className="text-[12.5px] text-ink-2 mt-3 leading-snug max-w-[70ch]">
            <strong className="text-ink">{scenario.window}.</strong> {scenario.story}
          </p>

          {/* the headline number */}
          <div className="mt-3 bg-page hairline rounded-xl px-3.5 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 tnum">
              <span className="text-[13px] text-ink-2">
                Your {fmtMoney(result.totalBefore, base, true)} would have become
              </span>
              <span
                className={`text-[24px] font-semibold leading-none ${
                  result.pct < -0.005 ? "text-status-critical" : "text-success-text"
                }`}
              >
                {fmtMoney(result.totalAfter, base, true)}
              </span>
              <span
                className={`text-[15px] font-semibold ${
                  result.pct < -0.005 ? "text-status-critical" : "text-success-text"
                }`}
              >
                ({result.pct >= 0 ? "+" : ""}
                <AnimatedNumber value={Math.round(result.pct * 100)} />
                %)
              </span>
            </div>
            <div className="text-[11px] text-muted mt-1">
              at the bottom of the crash · {result.covered} holding{result.covered === 1 ? "" : "s"} mapped by
              type · approximate, from index history
            </div>
          </div>

          {/* per-bucket damage */}
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-muted border-b border-grid uppercase tracking-wide">
                  <th className="py-1.5 pr-3 font-medium">Your money by type</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Now</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Hit then</th>
                  <th className="py-1.5 font-medium text-right">After</th>
                </tr>
              </thead>
              <tbody>
                {result.buckets.map((b) => (
                  <tr key={b.bucket} className="border-b border-grid/50">
                    <td className="py-1.5 pr-3">
                      {b.label} <span className="text-muted text-[11px]">({b.n})</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tnum">{fmtMoney(b.value, base, true)}</td>
                    <td
                      className={`py-1.5 pr-3 text-right tnum font-medium ${
                        b.hit < 0 ? "text-status-critical" : b.hit > 0 ? "text-success-text" : "text-ink-2"
                      }`}
                    >
                      {b.hit >= 0 ? "+" : ""}
                      {fmtPct(b.hit)}
                    </td>
                    <td className="py-1.5 text-right tnum">{fmtMoney(b.after, base, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* hardest-hit holdings */}
          {result.worst.length > 0 && (
            <p className="text-[12px] text-ink-2 mt-2.5">
              <span className="text-muted">Hardest hit:</span>{" "}
              {result.worst.map((w, i) => (
                <span key={w.symbol}>
                  {i > 0 && " · "}
                  {onOpenChart ? (
                    <button
                      onClick={() => onOpenChart(w.symbol)}
                      className="font-semibold text-ink hover:text-series-1 hover:underline"
                      title="Open in the Chart tab"
                    >
                      {w.symbol.replace(/\.(NS|BO|TO|V|NE)$/i, "")}
                    </button>
                  ) : (
                    <strong>{w.symbol.replace(/\.(NS|BO|TO|V|NE)$/i, "")}</strong>
                  )}{" "}
                  <span className="text-status-critical tnum">{fmtPct(w.hit)}</span>
                </span>
              ))}
              {onOpenChart && <span className="text-muted text-[11px]"> · click a name for its chart</span>}
            </p>
          )}

          {/* what history did next */}
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-3">
            <div>
              <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-0.5">
                How long recovery took
              </div>
              <p className="text-[12.5px] text-ink-2 leading-snug">{scenario.recovery}</p>
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-0.5">
                What kept-buying did
              </div>
              <p className="text-[12.5px] text-ink-2 leading-snug">{scenario.dcaNote}</p>
            </div>
          </div>

          <p className="text-[11px] text-muted italic mt-3 leading-relaxed">
            Honest limits: each holding gets its TYPE&apos;s historical hit (index funds, gold funds, large caps,
            mid/small caps, expensive stocks) - your actual companies can do better or worse than their bucket.
            This is arithmetic on the past, not a prediction of the future. The one thing it reliably teaches:
            crashes punish price paid and leverage, reward patience and kept-running SIPs, and end.
          </p>
        </>
      )}
    </Card>
  );
}
