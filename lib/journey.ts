import type { AnalyzedHolding, PricePoint, YearRatios } from "./types";

/**
 * The fundamentals journey - "how was the business when I bought it, and how
 * is it now?" Since broker holdings CSVs carry no purchase dates, the buy
 * month is ESTIMATED from your average cost against the 5-year price history
 * (the month whose close is nearest your avg cost), and you can override it.
 *
 * The point: separate the three very different reasons a stock "did nothing"
 * for 2–5 years -
 *   improving business + lagging price  → coiled spring (usually keep/add)
 *   flat business + flat price          → dead money (recycle)
 *   worsening business                  → the fall is deserved (exit review)
 */

export interface JourneyRow {
  key: string;
  label: string;
  then?: number;
  now?: number;
  kind: "money" | "pct" | "x" | "num";
  /** today's trailing-twelve-month figure, where Yahoo publishes one */
  ttm?: number;
  /** true = improved, false = worsened, undefined = flat/no-data/neutral metric */
  better?: boolean;
  neutral?: boolean; // valuation-context rows (P/E) don't count toward the verdict
}

export interface Journey {
  sinceYM: string; // YYYY-MM
  estimated: boolean;
  atWindowEdge: boolean; // avg cost predates the 5y price window
  thenYear?: number;
  nowYear?: number;
  priceThen?: number;
  priceNow?: number;
  priceCagrSince?: number;
  yearsSince?: number;
  rows: JourneyRow[];
  improved: number;
  worsened: number;
  /**
   * True when the newest ANNUAL report on file is already a year behind the
   * calendar - normal between fiscal-year end and the annual filing. The UI
   * says so instead of silently looking stale.
   */
  awaitingLatestFy: boolean;
  /** true when the buy month could not select a "then" year and we used the oldest on file */
  thenFellBack: boolean;
  /** the fiscal year the market is currently living in, if it isn't filed yet */
  pendingFy?: number;
  verdict: { tone: "good" | "neutral" | "warning" | "critical"; line: string };
}

/** Nearest-close estimate of when the position was built (prefer the earliest close within 3%). */
export function estimateBuyMonth(
  prices: PricePoint[],
  avgCost: number
): { ym: string; atWindowEdge: boolean } | undefined {
  if (!prices.length || !Number.isFinite(avgCost) || avgCost <= 0) return undefined;
  const minClose = Math.min(...prices.map((p) => p.close));
  const maxClose = Math.max(...prices.map((p) => p.close));
  if (avgCost < minClose * 0.9) {
    // cheaper than anything in the window → bought before it
    return { ym: prices[0].date.slice(0, 7), atWindowEdge: true };
  }
  if (avgCost > maxClose * 1.1) {
    // dearer than anything in the window → also bought before it, and underwater
    // since. Without this mirror guard the estimate snapped to the window's
    // HIGHEST month and reported it as a confident buy date.
    return { ym: prices[0].date.slice(0, 7), atWindowEdge: true };
  }
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < prices.length; i++) {
    const d = Math.abs(prices[i].close - avgCost) / avgCost;
    if (d < 0.03) return { ym: prices[i].date.slice(0, 7), atWindowEdge: false }; // earliest close match
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { ym: prices[bestIdx].date.slice(0, 7), atWindowEdge: false };
}

/**
 * Relative change that survives a negative starting point. `now/then - 1`
 * inverts whenever `then < 0`, so a loss of 200 turning into a profit of 400
 * was scored as DETERIORATION and could trigger an exit review.
 */
const rel = (then: number, now: number) =>
  Math.abs(then) > 1e-12 ? (now - then) / Math.abs(then) : undefined;

function judge(then?: number, now?: number, higherIsBetter = true, threshold = 0.05): boolean | undefined {
  if (then === undefined || now === undefined) return undefined;
  const r = rel(then, now);
  if (r === undefined || Math.abs(r) < threshold) return undefined; // flat
  return higherIsBetter ? r > 0 : r < 0;
}

export function buildJourney(row: AnalyzedHolding): Journey | undefined {
  const { holding, data, scorecard: sc } = row;
  if (!data || !sc || holding.watch || holding.quantity <= 0) return undefined;
  if (!data.prices.length || sc.ratios.length < 2) return undefined;

  const est = holding.buyDate
    ? { ym: holding.buyDate, atWindowEdge: false }
    : estimateBuyMonth(data.prices, holding.avgCost);
  if (!est) return undefined;
  const sinceYM = est.ym;

  // fiscal years: "then" = last fiscal year ending at/before the buy month (else earliest)
  const ratios = sc.ratios;
  /**
   * "Then" must be the last fiscal year that had actually CLOSED when you
   * bought. Comparing the integer FY label against a fractional calendar year
   * selected a year that had barely started - a look-ahead that quietly
   * compressed every measured improvement.
   */
  const endOf = (r: YearRatios, i: number) => data.years[i]?.endDate?.slice(0, 7) ?? `${r.year}-03`;
  let thenIdx = 0;
  for (let i = 0; i < ratios.length; i++) {
    if (endOf(ratios[i], i) <= sinceYM) thenIdx = i;
    else break;
  }
  let thenR: YearRatios = ratios[thenIdx];
  const nowR = ratios[ratios.length - 1];
  let thenFellBack = false;
  if (thenR.year >= nowR.year) {
    thenR = ratios[0];
    thenFellBack = true;
  }
  if (thenR.year >= nowR.year) return undefined;

  const isFin = sc.isFinancialSector;
  const q = data.quote;
  const mk = (
    key: string,
    label: string,
    then: number | undefined,
    now: number | undefined,
    kind: JourneyRow["kind"],
    higherIsBetter = true,
    neutral = false,
    ttm?: number
  ): JourneyRow => ({
    key,
    label,
    then,
    now,
    kind,
    neutral,
    ttm,
    better: neutral ? undefined : judge(then, now, higherIsBetter),
  });

  const rows: JourneyRow[] = [
    mk("revenue", "Revenue", thenR.revenue, nowR.revenue, "money"),
    mk("netIncome", "Net income", thenR.netIncome, nowR.netIncome, "money"),
    mk("eps", "EPS", thenR.eps, nowR.eps, "num", true, false, q.epsTrailing),
    mk("roe", "ROE", thenR.roe, nowR.roe, "pct", true, false, q.roeTTM),
    isFin
      ? mk("roa", "ROA", thenR.roa, nowR.roa, "pct")
      : mk("roce", "ROCE", thenR.roce, nowR.roce, "pct"),
    mk("netMargin", "Net margin", thenR.netMargin, nowR.netMargin, "pct", true, false, q.profitMarginTTM),
    ...(isFin ? [] : [mk("d2e", "Debt / Equity", thenR.debtToEquity, nowR.debtToEquity, "x", false)]),
    ...(isFin ? [] : [mk("icr", "Interest cover", thenR.interestCoverage, nowR.interestCoverage, "x")]),
    mk("fcf", "Free cash flow", thenR.fcf, nowR.fcf, "money", true, false, q.fcfTTM),
    mk("pe", "P/E (yr-end)", thenR.approxPE, nowR.approxPE, "x", false, true),
  ];

  const improved = rows.filter((r) => r.better === true).length;
  const worsened = rows.filter((r) => r.better === false).length;

  // Annual reports land months after the fiscal year ends, so the newest FY on
  // file is routinely one behind the calendar. Say so rather than looking stale.
  const calendarYear = new Date().getFullYear();
  const awaitingLatestFy = nowR.year < calendarYear;
  const pendingFy = awaitingLatestFy ? calendarYear : undefined;

  // price since the buy month
  const monthOf = (d: string) => d.slice(0, 7);
  // If the buy month is NEWER than every price bar we have, there is no honest
  // "since you bought" return - the old fallback to prices[0] reported a
  // five-year CAGR under a one-month heading.
  const buyPoint = data.prices.find((p) => monthOf(p.date) >= sinceYM);
  const lastPoint = data.prices[data.prices.length - 1];
  const priceThen = buyPoint?.close;
  const priceNow = data.quote.price ?? lastPoint?.close;
  let yearsSince: number | undefined;
  let priceCagrSince: number | undefined;
  if (buyPoint && priceThen && priceNow && priceThen > 0) {
    yearsSince =
      (new Date(lastPoint.date).getTime() - new Date(buyPoint.date).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (yearsSince > 0.75) priceCagrSince = Math.pow(priceNow / priceThen, 1 / yearsSince) - 1;
  }

  const businessBetter = improved - worsened >= 2;
  const businessWorse = worsened - improved >= 2;
  const priceLagged = priceCagrSince !== undefined && priceCagrSince < 0.05;

  let verdict: Journey["verdict"];
  if (businessBetter && priceLagged) {
    verdict = {
      tone: "good",
      line: "The business improved while the price went nowhere - a coiled spring, not dead money. This is exactly the kind of position a 2-year-minimum holder keeps (and often adds to).",
    };
  } else if (businessBetter) {
    verdict = {
      tone: "good",
      line: "Business and price have both compounded since you bought - the thesis is working. Keep sitting tight.",
    };
  } else if (businessWorse && (priceCagrSince ?? 0) >= 0.05) {
    verdict = {
      tone: "warning",
      line: "The price ran ahead while the fundamentals slipped - risk is quietly rising. Re-check the thesis before adding another rupee/dollar.",
    };
  } else if (businessWorse) {
    verdict = {
      tone: "critical",
      line: "The fundamentals have deteriorated since you bought - the weak price is deserved, not a bargain. This is what an exit review is for.",
    };
  } else {
    verdict = {
      tone: "neutral",
      line: "Fundamentals are roughly where they were when you bought. The next 2–4 quarters of results matter more than the price wiggles.",
    };
  }

  return {
    sinceYM,
    estimated: !holding.buyDate,
    atWindowEdge: est.atWindowEdge,
    thenYear: thenR.year,
    nowYear: nowR.year,
    priceThen,
    priceNow,
    priceCagrSince,
    yearsSince,
    rows,
    improved,
    worsened,
    thenFellBack,
    awaitingLatestFy,
    pendingFy,
    verdict,
  };
}
