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

/**
 * Value of the CURRENT holdings through time (monthly, base currency).
 * Honest framing: this prices today's share counts across the last ~5 years —
 * it is not your actual account history (it ignores when you bought).
 */
export function portfolioSeries(rows: AnalyzedHolding[], fx: FxRates): { date: string; value: number }[] {
  const active = rows.filter(
    (r) => !r.holding.watch && r.holding.quantity > 0 && (r.data?.prices?.length ?? 0) > 0
  );
  if (!active.length) return [];
  const monthOf = (d: string) => d.slice(0, 7);
  const perRow = active.map((r) => {
    const m = new Map<string, number>();
    for (const p of r.data!.prices) m.set(monthOf(p.date), p.close);
    return { r, m, first: monthOf(r.data!.prices[0].date), last: undefined as number | undefined };
  });
  const months = [...new Set(perRow.flatMap((x) => [...x.m.keys()]))].sort();
  const out: { date: string; value: number }[] = [];
  for (const mo of months) {
    let total = 0;
    for (const row of perRow) {
      const px = row.m.get(mo);
      if (px !== undefined) row.last = px;
      if (mo < row.first || row.last === undefined) continue;
      total += row.last * row.r.holding.quantity * (fx.rates[row.r.holding.currency] ?? 1);
    }
    if (total > 0) out.push({ date: `${mo}-01`, value: total });
  }
  return out;
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
