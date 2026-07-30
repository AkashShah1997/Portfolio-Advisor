import type { AnalyzedHolding, Currency, FxRates, PortfolioSummary, Verdict } from "./types";
import { countryForSymbol } from "./symbols";

export function toBase(value: number, from: Currency, fx: FxRates): number {
  return value * (fx.rates[from] ?? 1);
}

export function summarize(rows: AnalyzedHolding[], fx: FxRates): PortfolioSummary {
  const base = fx.base;
  let invested = 0;
  let current = 0;
  const byCountry = new Map<string, number>();
  const bySector = new Map<string, number>();
  const byVerdict: Record<Verdict, number> = {
    ADD_MORE: 0,
    HOLD_QUALITY_PRICEY: 0,
    HOLD: 0,
    WATCH: 0,
    REVIEW_EXIT: 0,
    INSUFFICIENT_DATA: 0,
  };
  let scoreWeighted = 0;
  let scoreDen = 0;
  let top = 0;

  for (const r of rows) {
    const inv = toBase(r.invested, r.holding.currency, fx);
    invested += inv;
    const cur = r.currentValue !== undefined ? toBase(r.currentValue, r.holding.currency, fx) : inv;
    current += cur;
    top = Math.max(top, cur);

    const country = countryForSymbol(r.holding.yahooSymbol);
    byCountry.set(country, (byCountry.get(country) ?? 0) + cur);
    const sector = r.data?.quote.sector ?? "Unknown";
    bySector.set(sector, (bySector.get(sector) ?? 0) + cur);

    if (r.scorecard) {
      byVerdict[r.scorecard.verdict] += 1;
      if (r.scorecard.verdict !== "INSUFFICIENT_DATA") {
        scoreWeighted += r.scorecard.totalScore * cur;
        scoreDen += cur;
      }
    }
  }

  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return {
    baseCurrency: base,
    totalInvested: invested,
    totalCurrent: current,
    totalPnl: current - invested,
    totalPnlPct: invested > 0 ? (current - invested) / invested : 0,
    byCountry: sortDesc(byCountry),
    bySector: sortDesc(bySector),
    byVerdict,
    topHoldingPct: current > 0 ? top / current : 0,
    weightedScore: scoreDen > 0 ? Math.round(scoreWeighted / scoreDen) : 0,
  };
}

export const VERDICT_META: Record<
  Verdict,
  { label: string; icon: string; tone: "good" | "neutral" | "warning" | "serious" | "critical" | "muted" }
> = {
  ADD_MORE: { label: "Add More", icon: "▲", tone: "good" },
  HOLD_QUALITY_PRICEY: { label: "Hold — pricey", icon: "◆", tone: "neutral" },
  HOLD: { label: "Hold", icon: "●", tone: "neutral" },
  WATCH: { label: "Watch", icon: "!", tone: "warning" },
  REVIEW_EXIT: { label: "Review for Exit", icon: "✕", tone: "critical" },
  INSUFFICIENT_DATA: { label: "Insufficient Data", icon: "?", tone: "muted" },
};
