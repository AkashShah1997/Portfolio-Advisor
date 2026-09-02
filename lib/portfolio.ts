import type { AnalyzedHolding, Currency, FxRates, PortfolioSummary, Verdict } from "./types";
import { countryForSymbol } from "./symbols";
import { isEtfHolding } from "./etf";

export function toBase(value: number, from: Currency, fx: FxRates): number {
  const rate = fx.rates[from];
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    // A missing rate must never masquerade as 1:1 - that would count $100 as ₹100.
    // Base currency is always 1; anything else unknown is dropped from the total.
    return from === fx.base ? value : 0;
  }
  return value * rate;
}

/**
 * NOTE on failed fetches: a row whose quote could not be fetched has no market
 * value, so `currentValue ?? invested` values it at COST. That is the least-bad
 * default, but it must be visible - `atCostValue`/`atCostCount` report how much
 * of the total is a cost basis wearing a market-value label, and such rows are
 * excluded from the top-holding weight so concentration is not overstated.
 */
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
  let atCostValue = 0;
  let atCostCount = 0;

  for (const r of rows) {
    if (r.holding.watch) continue; // watchlist rows carry no capital
    const inv = toBase(r.invested, r.holding.currency, fx);
    invested += inv;
    const priced = r.currentValue !== undefined;
    const cur = priced ? toBase(r.currentValue!, r.holding.currency, fx) : inv;
    current += cur;
    if (!priced) {
      // no market price came back - this is a cost basis, not a valuation
      atCostValue += cur;
      atCostCount++;
    } else {
      top = Math.max(top, cur);
    }

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
    atCostValue,
    atCostCount,
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
  /**
   * CRITICAL: the basket must be CONSTANT across the window. A holding whose
   * price history starts later (recent listing, or a short free-data series)
   * used to join the total part-way through, which made the line step UP for a
   * reason that has nothing to do with returns - and the benchmark badge then
   * reported that step as alpha. So the series starts at the first month EVERY
   * holding has data for; anything earlier is simply not comparable.
   */
  const start = perRow.reduce((a, x) => (x.first > a ? x.first : a), perRow[0].first);
  const out: { date: string; value: number }[] = [];
  for (const mo of months) {
    if (mo < start) continue;
    let total = 0;
    let covered = 0;
    for (const row of perRow) {
      const px = row.m.get(mo);
      if (px !== undefined) row.last = px;
      if (row.last === undefined) continue;
      covered++;
      total += row.last * row.r.holding.quantity * (fx.rates[row.r.holding.currency] ?? 1);
    }
    if (total > 0 && covered === perRow.length) out.push({ date: `${mo}-01`, value: total });
  }
  return out;
}

/** The window the value series actually covers, for honest labelling. */
export function seriesWindow(rows: AnalyzedHolding[]): { start?: string; truncatedBy?: string } {
  const active = rows.filter(
    (r) => !r.holding.watch && r.holding.quantity > 0 && (r.data?.prices?.length ?? 0) > 0
  );
  if (!active.length) return {};
  let start = "";
  let by: string | undefined;
  for (const r of active) {
    const f = r.data!.prices[0].date.slice(0, 7);
    if (f > start) {
      start = f;
      by = r.holding.yahooSymbol;
    }
  }
  const earliest = active.reduce((a, r) => {
    const f = r.data!.prices[0].date.slice(0, 7);
    return f < a ? f : a;
  }, start);
  return { start, truncatedBy: start > earliest ? by : undefined };
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

// ---------- Jensen's alpha: did the picks beat the index AFTER the risk taken? ----------

/**
 * Jensen (1968, Journal of Finance) asked the only fair version of "did you
 * beat the market": after adjusting for how much market risk you carried.
 * His 115 mutual funds could not, on average, even before fees. The measure:
 * regress the basket's monthly excess return on the index's monthly excess
 * return; the slope is BETA (how hard you move with the market) and the
 * intercept is ALPHA (what the picks added on their own), annualized.
 *
 * Honest limits, printed with the number: the basket is your CURRENT holdings
 * priced over the window (survivors only - what you sold is not here), prices
 * exclude dividends on both sides, and the risk-free rate is an assumption.
 */
export interface AlphaRead {
  beta: number;
  /** annualized (monthly intercept × 12), fraction */
  alpha: number;
  /** share of the basket's month-to-month variance that the index explains */
  r2: number;
  months: number;
  rf: number; // annual risk-free assumption used
}

/** Assumed annual risk-free rates by base currency (short government paper, rounded; stated on the card). */
export const RISK_FREE_ASSUMED: Record<Currency, number> = { INR: 0.06, CAD: 0.03, USD: 0.04 };

export function jensenAlpha(points: BenchPoint[], rfAnnual: number): AlphaRead | undefined {
  const rets: { p: number; m: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.you === undefined || b.you === undefined || a.bench === undefined || b.bench === undefined) continue;
    if (!(a.you > 0 && a.bench > 0)) continue;
    rets.push({ p: b.you / a.you - 1, m: b.bench / a.bench - 1 });
  }
  const n = rets.length;
  if (n < 24) return undefined; // two years of months is the floor for a slope worth printing
  const rfm = Math.pow(1 + rfAnnual, 1 / 12) - 1;
  const xs = rets.map((r) => r.m - rfm);
  const ys = rets.map((r) => r.p - rfm);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx <= 0) return undefined;
  const beta = sxy / sxx;
  const alphaMonthly = my - beta * mx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { beta, alpha: alphaMonthly * 12, r2, months: n, rf: rfAnnual };
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
