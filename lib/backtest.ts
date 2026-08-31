import type { AnalyzedHolding, QuoteInfo, StockData, Verdict } from "./types";
import { buildScorecard } from "./scorecard";
import type { Candle } from "./history";

/**
 * Backtest - "would this engine have helped?" done honestly:
 *
 * We re-run the SAME scorecard as of a past cutoff using ONLY information that
 * existed then - fiscal years ending before the cutoff, the price on that day,
 * and valuation ratios rebuilt from those two (P/E-then, P/B-then, market
 * cap-then). Anything unknowable then (dividend yield, TTM fields, 52-week
 * range) is deliberately left blank, so those checks honestly go "n/a" instead
 * of leaking the future. Then we measure what each verdict bucket actually
 * returned since, against the market index over the same window.
 *
 * Stated limits (shown in the UI, not hidden): a handful of names is a sanity
 * check, not statistics; returns are price-only (dividends excluded on both
 * sides); and the sample only contains names that still exist and that you
 * track - survivors. Free Yahoo data carries ~5-6 fiscal years, so cutoffs up
 * to ~3 years back keep enough history (≥2 years) to score with.
 */

export interface BacktestRow {
  symbol: string;
  name?: string;
  watch: boolean;
  verdictThen: Verdict;
  scoreThen: number;
  priceThen?: number;
  priceNow?: number;
  cagrSince?: number; // annualized, price-only
  vsBench?: number; // cagrSince − benchCagr
  verdictNow?: Verdict;
  scoreNow?: number;
}

export interface BacktestBucket {
  verdict: Verdict;
  n: number;
  avgCagr?: number;
  beatBench?: number; // share of names beating the index (0..1), when bench known
}

export interface BacktestResult {
  cutoffISO: string;
  yearsBack: number;
  benchCagr?: number;
  rows: BacktestRow[];
  skipped: { symbol: string; reason: string }[];
  buckets: BacktestBucket[];
  readout: string;
}

export function cutoffISO(yearsBack: number, now: Date = new Date()): string {
  const d = new Date(now.getTime());
  d.setFullYear(d.getFullYear() - yearsBack);
  return d.toISOString().slice(0, 10);
}

/**
 * Truncate a stock's data to what was knowable at the cutoff. Returns null
 * when there isn't enough pre-cutoff history to score honestly.
 */
/**
 * Annual results are published weeks to months AFTER the fiscal year closes, so
 * admitting a year the moment it ends is reading the future - the backtest was
 * scoring on numbers the market had not seen. 90 days is the conservative floor.
 */
const REPORTING_LAG_DAYS = 90;
function filedBy(cutoffISO: string): string {
  const d = new Date(cutoffISO);
  d.setDate(d.getDate() - REPORTING_LAG_DAYS);
  return d.toISOString().slice(0, 10);
}

export function buildAsOf(data: StockData, cutoff: string): StockData | null {
  const years = data.years.filter((y) => y.endDate && y.endDate.slice(0, 10) <= filedBy(cutoff));
  const prices = data.prices.filter((p) => p.date <= cutoff);
  if (years.length < 2 || prices.length < 6) return null;

  const last = years[years.length - 1];
  const priceThen = prices[prices.length - 1].close;
  const epsRaw = last.dilutedEPS ?? last.basicEPS;
  const eps = epsRaw !== undefined && epsRaw > 0 ? epsRaw : undefined;
  const shares = last.shares;

  const quote: QuoteInfo = {
    symbol: data.symbol,
    name: data.quote.name,
    sector: data.quote.sector,
    industry: data.quote.industry,
    country: data.quote.country,
    currency: data.quote.currency,
    quoteType: data.quote.quoteType,
    price: priceThen,
    epsTrailing: eps,
    trailingPE: eps !== undefined ? priceThen / eps : undefined,
    marketCap: shares && shares > 0 ? priceThen * shares : undefined,
    priceToBook:
      last.equity && last.equity > 0 && shares && shares > 0 ? priceThen / (last.equity / shares) : undefined,
    fcfTTM: last.fcf,
    totalDebtNow: last.totalDebt,
    // unknowable then - left blank ON PURPOSE so those checks go n/a:
    // dividendYield, payoutRatio, pegRatio, roeTTM, profitMarginTTM,
    // revenue/earningsGrowthTTM, currentRatioNow, 52-week range, analyst fields
  };

  return { ...data, quote, years, prices };
}

const yearsBetween = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / (365.25 * 24 * 3600 * 1000);

/** Index return over the same window, from its candles (any cadence). */
export function benchCagrSince(candles: Candle[], cutoff: string): number | undefined {
  const before = candles.filter((c) => c.time <= cutoff);
  const at = before[before.length - 1];
  const last = candles[candles.length - 1];
  if (!at || !last || at.close <= 0 || last.close <= 0) return undefined;
  const yrs = yearsBetween(at.time, last.time);
  if (yrs < 0.5) return undefined;
  return Math.pow(last.close / at.close, 1 / yrs) - 1;
}

export function runBacktest(
  rows: AnalyzedHolding[],
  yearsBack: number,
  benchCandles?: Candle[],
  now: Date = new Date()
): BacktestResult {
  const cutoff = cutoffISO(yearsBack, now);
  const benchCagr = benchCandles?.length ? benchCagrSince(benchCandles, cutoff) : undefined;

  const out: BacktestRow[] = [];
  const skipped: { symbol: string; reason: string }[] = [];

  for (const r of rows) {
    const sym = r.holding.yahooSymbol;
    if (!r.data || !r.scorecard) {
      skipped.push({ symbol: sym, reason: "no data" });
      continue;
    }
    const asOf = buildAsOf(r.data, cutoff);
    if (!asOf) {
      skipped.push({ symbol: sym, reason: `fewer than 2 fiscal years on record before ${cutoff.slice(0, 7)}` });
      continue;
    }
    const scThen = buildScorecard(asOf);
    const priceThen = asOf.prices[asOf.prices.length - 1].close;
    const lastPrice = r.data.prices[r.data.prices.length - 1];
    const priceNow = r.data.quote.price ?? lastPrice?.close;
    let cagrSince: number | undefined;
    if (priceThen > 0 && priceNow && lastPrice) {
      const yrs = yearsBetween(asOf.prices[asOf.prices.length - 1].date, lastPrice.date);
      if (yrs >= 0.5) cagrSince = Math.pow(priceNow / priceThen, 1 / yrs) - 1;
    }
    out.push({
      symbol: sym,
      name: r.data.quote.name,
      watch: !!r.holding.watch,
      verdictThen: scThen.verdict,
      scoreThen: scThen.totalScore,
      priceThen,
      priceNow,
      cagrSince,
      vsBench: cagrSince !== undefined && benchCagr !== undefined ? cagrSince - benchCagr : undefined,
      verdictNow: r.scorecard.verdict,
      scoreNow: r.scorecard.totalScore,
    });
  }

  const order: Verdict[] = ["ADD_MORE", "HOLD_QUALITY_PRICEY", "HOLD", "WATCH", "REVIEW_EXIT"];
  const buckets: BacktestBucket[] = [];
  for (const v of order) {
    const members = out.filter((r) => r.verdictThen === v && r.cagrSince !== undefined);
    if (!members.length) continue;
    const avg = members.reduce((a, r) => a + (r.cagrSince ?? 0), 0) / members.length;
    buckets.push({
      verdict: v,
      n: members.length,
      avgCagr: avg,
      beatBench:
        benchCagr !== undefined
          ? members.filter((r) => (r.cagrSince ?? 0) > benchCagr).length / members.length
          : undefined,
    });
  }

  out.sort((a, b) => (b.cagrSince ?? -9) - (a.cagrSince ?? -9));
  return { cutoffISO: cutoff, yearsBack, benchCagr, rows: out, skipped, buckets, readout: readout(buckets, benchCagr, yearsBack) };
}

const pctS = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

function readout(buckets: BacktestBucket[], benchCagr: number | undefined, yearsBack: number): string {
  const q = buckets.filter((b) => b.verdict === "ADD_MORE" || b.verdict === "HOLD_QUALITY_PRICEY");
  const w = buckets.filter((b) => b.verdict === "WATCH" || b.verdict === "REVIEW_EXIT");
  const avgOf = (bs: BacktestBucket[]) => {
    const n = bs.reduce((a, b) => a + b.n, 0);
    if (!n) return undefined;
    return bs.reduce((a, b) => a + (b.avgCagr ?? 0) * b.n, 0) / n;
  };
  const qa = avgOf(q);
  const wa = avgOf(w);
  const bench = benchCagr !== undefined ? ` The index did ${pctS(benchCagr)}/yr over the same window.` : "";

  if (qa !== undefined && wa !== undefined) {
    return qa > wa
      ? `${yearsBack} year${yearsBack > 1 ? "s" : ""} ago, the engine's quality names went on to compound ${pctS(qa)}/yr while its warning list did ${pctS(wa)}/yr - the discipline pointed the right way on this sample.${bench}`
      : `On this (small) sample the warning list (${pctS(wa)}/yr) actually beat the quality names (${pctS(qa)}/yr) since the cutoff - a useful humility check: a handful of names over ${yearsBack} year${yearsBack > 1 ? "s" : ""} proves little either way.${bench}`;
  }
  if (qa !== undefined) {
    return `The names the engine rated quality ${yearsBack} year${yearsBack > 1 ? "s" : ""} ago compounded ${pctS(qa)}/yr since.${bench}`;
  }
  if (wa !== undefined) {
    return `Only warning-list names had enough history to score at this cutoff - they returned ${pctS(wa)}/yr since.${bench}`;
  }
  return "Not enough pre-cutoff history to score anything - try a nearer cutoff, or analyze more names first.";
}
