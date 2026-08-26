import type { AnalyzedHolding, Currency, FxRates, PortfolioSummary, Verdict } from "./types";
import { countryForSymbol } from "./symbols";
import { isEtfHolding } from "./etf";

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
    // funds get their own bucket instead of polluting "Unknown"
    const sector = isEtfHolding(
      r.holding.yahooSymbol,
      r.data?.quote.name ?? r.holding.name,
      r.data?.quote.quoteType,
      r.holding.securityType
    )
      ? "ETFs / funds"
      : (r.data?.quote.sector ?? "Unknown");
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
 * Honest framing: this prices today's share counts across the last ~5 years -
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

// ---------- benchmark comparison (indexed to 100) ----------

export interface BenchPoint {
  date: string; // YYYY-MM-01
  you?: number; // indexed, 100 at the common start
  bench?: number;
}

export interface BenchComparison {
  points: BenchPoint[];
  youCagr?: number; // annualized over the common window
  benchCagr?: number;
  years?: number;
}

/** Collapse candles/points of any cadence to last-close-per-month. */
export function monthlyCloses(points: { date?: string; time?: string; close?: number; value?: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of points) {
    const d = p.date ?? p.time;
    const v = p.close ?? p.value;
    if (!d || v === undefined || !Number.isFinite(v) || v <= 0) continue;
    m.set(d.slice(0, 7), v); // ascending input → last write per month wins
  }
  return m;
}

/**
 * Index the portfolio series and a benchmark price series to 100 at their
 * first common month, so "did my picks beat the index?" is answerable at a
 * glance. Pure and unit-free: FX and absolute levels cancel out.
 */
export function benchmarkCompare(
  series: { date: string; value: number }[],
  benchCandles: { time: string; close: number }[]
): BenchComparison {
  const you = monthlyCloses(series);
  const bench = monthlyCloses(benchCandles);
  const months = [...you.keys()].filter((m) => bench.has(m)).sort();
  if (months.length < 2) return { points: [] };
  const m0 = months[0];
  const y0 = you.get(m0)!;
  const b0 = bench.get(m0)!;
  const points: BenchPoint[] = months.map((mo) => ({
    date: `${mo}-01`,
    you: (you.get(mo)! / y0) * 100,
    bench: (bench.get(mo)! / b0) * 100,
  }));
  const last = points[points.length - 1];
  const years =
    (new Date(last.date).getTime() - new Date(points[0].date).getTime()) / (365.25 * 24 * 3600 * 1000);
  const cagr = (endIdx?: number) =>
    endIdx !== undefined && years > 0.75 ? Math.pow(endIdx / 100, 1 / years) - 1 : undefined;
  return { points, youCagr: cagr(last.you), benchCagr: cagr(last.bench), years };
}

export const VERDICT_META: Record<
  Verdict,
  { label: string; icon: string; tone: "good" | "neutral" | "warning" | "serious" | "critical" | "muted" }
> = {
  ADD_MORE: { label: "Add More", icon: "▲", tone: "good" },
  HOLD_QUALITY_PRICEY: { label: "Hold - pricey", icon: "◆", tone: "neutral" },
  HOLD: { label: "Hold", icon: "●", tone: "neutral" },
  WATCH: { label: "Watch", icon: "!", tone: "warning" },
  REVIEW_EXIT: { label: "Review for Exit", icon: "✕", tone: "critical" },
  INSUFFICIENT_DATA: { label: "Insufficient Data", icon: "?", tone: "muted" },
};
