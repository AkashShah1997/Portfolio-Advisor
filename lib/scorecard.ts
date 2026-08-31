import type {
  Check,
  CheckStatus,
  Pillar,
  PillarScore,
  Scorecard,
  StockData,
  Verdict,
  YearFinancials,
  YearRatios,
} from "./types";

/**
 * Value-investing scorecard.
 *
 * Encodes the shared playbook of the long-horizon quality-value school -
 * anchored in Warren Buffett, Radhakishan Damani and Rakesh Jhunjhunwala, and
 * drawing on Munger, Graham, Fisher, Lynch, Akre, Greenblatt, Terry Smith,
 * Pabrai, Raamdeo Agrawal (QGLP) and Saurabh Mukherjea (Coffee Can) - as
 * explicit, data-backed checks over ~5 fiscal years:
 *
 *  - Buffett/Munger: durable moats (high, stable ROE & margins), low debt,
 *    owner earnings (FCF), "wonderful company at a fair price".
 *  - Damani/Smith: quality at a reasonable price, simple predictable
 *    businesses, ruthless price discipline, then do nothing.
 *  - Jhunjhunwala/Agrawal: growth at a reasonable price, ROCE focus,
 *    earnings consistency, "buy right, sit tight".
 *  - Mukherjea: Coffee Can consistency - rev growth ≥10% AND ROCE ≥15%,
 *    year after year. Akre: reinvestment engine (ROE × retention).
 *  - Graham/Pabrai: margin of safety; Greenblatt: earnings yield × ROC.
 *
 * Every check carries its evidence so the user can see WHY, not just a score.
 */

const PILLAR_LABEL: Record<Pillar, string> = {
  quality: "Business Quality (Moat)",
  fortress: "Financial Fortress",
  growth: "Growth & Consistency",
  valuation: "Valuation & Margin of Safety",
};

// ---------- helpers ----------

function avg(xs: number[]): number | undefined {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}
function stdev(xs: number[]): number | undefined {
  const v = xs.filter((x) => Number.isFinite(x));
  if (v.length < 2) return undefined;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}
function cagr(first?: number, last?: number, years?: number): number | undefined {
  if (!first || !last || !years || years < 1) return undefined;
  if (first <= 0 || last <= 0) return undefined;
  return Math.pow(last / first, 1 / years) - 1;
}
const pct = (v?: number, d = 1) => (v === undefined ? "n/a" : `${(v * 100).toFixed(d)}%`);
const x2 = (v?: number, d = 2) => (v === undefined ? "n/a" : `${v.toFixed(d)}x`);

// ---------- ratios ----------

export function computeRatios(years: YearFinancials[], prices: { date: string; close: number }[]): YearRatios[] {
  return years.map((y) => {
    const r: YearRatios = { year: y.year, revenue: y.revenue, netIncome: y.netIncome, fcf: y.fcf, eps: y.dilutedEPS ?? y.basicEPS };
    if (y.netIncome !== undefined && y.equity) r.roe = y.netIncome / y.equity;
    if (y.ebit !== undefined && (y.equity || y.totalDebt)) {
      const cap = (y.equity ?? 0) + (y.totalDebt ?? 0);
      if (cap > 0) r.roce = y.ebit / cap;
    }
    if (y.netIncome !== undefined && y.totalAssets) r.roa = y.netIncome / y.totalAssets;
    if (y.netIncome !== undefined && y.revenue) r.netMargin = y.netIncome / y.revenue;
    if (y.operatingIncome !== undefined && y.revenue) r.opMargin = y.operatingIncome / y.revenue;
    if (y.grossProfit !== undefined && y.revenue) r.grossMargin = y.grossProfit / y.revenue;
    // Negative shareholders' equity makes D/E come out NEGATIVE, which every
    // "lower is better" test then read as the safest possible balance sheet.
    // Negative equity is a red flag, not a pass, so the ratio stays undefined
    // and `negativeEquity` carries the fact instead.
    if (y.totalDebt !== undefined && y.equity && y.equity > 0) r.debtToEquity = y.totalDebt / y.equity;
    if (y.equity !== undefined && y.equity <= 0) r.negativeEquity = true;
    if (y.ebit !== undefined && y.interestExpense) r.interestCoverage = y.ebit / Math.abs(y.interestExpense);
    if (y.currentAssets !== undefined && y.currentLiabilities) r.currentRatio = y.currentAssets / y.currentLiabilities;

    // approximate P/E at fiscal year end
    const epsY = r.eps;
    if (epsY && epsY > 0 && prices.length) {
      const end = y.endDate;
      let best: { close: number } | undefined;
      let bestDist = Infinity;
      for (const p of prices) {
        const dist = Math.abs(new Date(p.date).getTime() - new Date(end).getTime());
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
      if (best && bestDist < 1000 * 3600 * 24 * 70) r.approxPE = best.close / epsY;
    }
    return r;
  });
}

// ---------- Piotroski F-Score ----------

/**
 * Piotroski's 9-point F-Score over the last two fiscal years - the classic
 * academic test of whether the fundamentals are IMPROVING (profitable, cash-
 * generative, deleveraging, more efficient, no dilution). 8–9 strong, 0–3
 * weak. Tests whose inputs are missing go n/a and shrink the denominator.
 */
export function computeFScore(years: YearFinancials[]): Scorecard["fscore"] | undefined {
  if (years.length < 2) return undefined;
  const cur = years[years.length - 1];
  const prev = years[years.length - 2];

  const roa = (y: YearFinancials) =>
    y.netIncome !== undefined && y.totalAssets ? y.netIncome / y.totalAssets : undefined;
  const lev = (y: YearFinancials) =>
    y.totalDebt !== undefined && y.totalAssets ? y.totalDebt / y.totalAssets : undefined;
  const cr = (y: YearFinancials) =>
    y.currentAssets !== undefined && y.currentLiabilities ? y.currentAssets / y.currentLiabilities : undefined;
  const gm = (y: YearFinancials) =>
    y.grossProfit !== undefined && y.revenue ? y.grossProfit / y.revenue : undefined;
  const at = (y: YearFinancials) => (y.revenue !== undefined && y.totalAssets ? y.revenue / y.totalAssets : undefined);

  const t = (label: string, v: boolean | undefined): { label: string; status: "pass" | "fail" | "na" } => ({
    label,
    status: v === undefined ? "na" : v ? "pass" : "fail",
  });
  const cmp = (a?: number, b?: number, f?: (x: number, y: number) => boolean) =>
    a === undefined || b === undefined ? undefined : (f ?? ((x, y) => x > y))(a, b);

  const tests = [
    t("Profitable (ROA > 0)", roa(cur) === undefined ? undefined : roa(cur)! > 0),
    t("Operating cash flow > 0", cur.ocf === undefined ? undefined : cur.ocf > 0),
    t("ROA improving", cmp(roa(cur), roa(prev))),
    t("Cash beats accounting profit (OCF > net income)", cmp(cur.ocf, cur.netIncome)),
    // Piotroski's signals 5, 6, 8 and 9 require STRICT improvement - "unchanged"
    // scores zero. Awarding a point for flat turned two identical years into 7/9.
    t("Deleveraging (debt/assets down)", cmp(lev(cur), lev(prev), (a, b) => a < b)),
    t("Liquidity improving (current ratio up)", cmp(cr(cur), cr(prev), (a, b) => a > b)),
    t("No dilution (share count flat/down)", cmp(cur.shares, prev.shares, (a, b) => a <= b * 1.02)),
    t("Gross margin improving", cmp(gm(cur), gm(prev), (a, b) => a > b)),
    t("Asset turnover improving", cmp(at(cur), at(prev), (a, b) => a > b)),
  ];
  const applicable = tests.filter((x) => x.status !== "na");
  if (applicable.length < 5) return undefined; // too little to call it an F-Score
  return {
    score: applicable.filter((x) => x.status === "pass").length,
    of: applicable.length,
    tests,
  };
}

// ---------- scorecard ----------

interface CheckInput {
  id: string;
  pillar: Pillar;
  label: string;
  philosophy: string;
  weight: number;
  /** returns [score 0..1 | undefined for NA, evidence string] */
  fn: () => [number | undefined, string];
}

/**
 * Band a metric into pass / borderline / fail.
 *
 * For lower-is-better metrics (P/E, P/B, D/E, PEG) a NEGATIVE value is not
 * "wonderfully cheap" - it is a distress signal or an undefined ratio (negative
 * earnings, negative equity). Scoring it 1.0 was inverting the signal on
 * exactly the companies that deserve the harshest reading, so negatives score 0
 * and the caller is expected to explain why.
 */
function band(v: number | undefined, full: number, half: number, higherIsBetter = true): number | undefined {
  if (v === undefined || !Number.isFinite(v)) return undefined;
  if (higherIsBetter) {
    if (v >= full) return 1;
    if (v >= half) return 0.5;
    return 0;
  }
  if (v < 0) return 0;
  if (v <= full) return 1;
  if (v <= half) return 0.5;
  return 0;
}

function statusOf(score: number | undefined): CheckStatus {
  if (score === undefined) return "na";
  if (score >= 0.75) return "pass";
  if (score >= 0.4) return "warn";
  return "fail";
}

export function buildScorecard(data: StockData): Scorecard {
  const { quote, years, prices } = data;
  const ratios = computeRatios(years, prices);
  const n = years.length;
  const isFin =
    quote.sector === "Financial Services" ||
    /bank|insurance|capital markets|credit/i.test(quote.industry ?? "");
  // Detect funds by Yahoo's own type first; the old name regex flagged real
  // operating companies ("Fundtech Ltd") as funds and voided their scorecard.
  const qt = (quote.quoteType ?? "").toUpperCase();
  const isEtfOrFund =
    qt === "ETF" ||
    qt === "MUTUALFUND" ||
    quote.sector === "ETF" ||
    /\b(etf|index fund|trust units|bees)\b/i.test(quote.name ?? "");

  const roeSeries = ratios.map((r) => r.roe).filter((v): v is number => v !== undefined);
  const roceSeries = ratios.map((r) => r.roce).filter((v): v is number => v !== undefined);
  const nmSeries = ratios.map((r) => r.netMargin).filter((v): v is number => v !== undefined);
  const first = years[0];
  const last = years[n - 1];
  /**
   * Span from the actual fiscal-year END DATES, not the row count. Yahoo drops
   * years, and counting rows turned a 5-year 14.9% CAGR into a 4-year 18.9% one
   * - which then fed the DCF and the growth checks.
   */
  const spanFromDates =
    first?.endDate && last?.endDate
      ? (new Date(last.endDate).getTime() - new Date(first.endDate).getTime()) / (365.25 * 24 * 3600 * 1000)
      : undefined;
  const spanYears = spanFromDates !== undefined && spanFromDates >= 1 ? spanFromDates : n >= 2 ? n - 1 : 0;

  /**
   * CAGR endpoints must be the first and last rows that actually CARRY the
   * metric - a blank oldest row used to void the whole series, and the span has
   * to shrink with the endpoints or the rate is understated.
   */
  const spanBetween = (a?: YearFinancials, b?: YearFinancials): number => {
    if (a?.endDate && b?.endDate) {
      const y = (new Date(b.endDate).getTime() - new Date(a.endDate).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (y >= 1) return y;
    }
    return spanYears;
  };
  const edge = (pick: (y: YearFinancials) => number | undefined) => {
    const withVal = years.filter((y) => {
      const v = pick(y);
      return v !== undefined && Number.isFinite(v);
    });
    if (withVal.length < 2) return undefined;
    const a = withVal[0];
    const b = withVal[withVal.length - 1];
    return { a, b, years: spanBetween(a, b) };
  };
  const cagrOf = (pick: (y: YearFinancials) => number | undefined) => {
    const e = edge(pick);
    return e ? cagr(pick(e.a), pick(e.b), e.years) : undefined;
  };
  const epsOf = (y?: YearFinancials) => y?.dilutedEPS ?? y?.basicEPS;

  const revCagr = cagrOf((y) => y.revenue);
  const epsFirst = epsOf(first);
  const epsLast = epsOf(last);
  const epsCagr = cagrOf(epsOf);
  const fcfCagr = cagrOf((y) => y.fcf);

  const peSeries = ratios.map((r) => r.approxPE).filter((v): v is number => v !== undefined && v > 0 && v < 200);
  // One observation is not a history: with a single year the "own average" is
  // just today's multiple, which scored a 40x stock full marks against itself.
  const avgPE = peSeries.length >= 3 ? avg(peSeries) : undefined;
  const currentPE = quote.trailingPE;

  const fcfYears = years.map((y) => y.fcf).filter((v): v is number => v !== undefined);
  const fcfPositiveShare = fcfYears.length ? fcfYears.filter((v) => v > 0).length / fcfYears.length : undefined;

  const niSeries = years.map((y) => y.netIncome).filter((v): v is number => v !== undefined);
  const lossYears = niSeries.filter((v) => v <= 0).length;
  let declineYears = 0;
  for (let i = 1; i < niSeries.length; i++) if (niSeries[i] < niSeries[i - 1] * 0.98) declineYears++;

  const latestD2E = ratios[ratios.length - 1]?.debtToEquity ?? quote.debtToEquityNow;
  const negativeEquity = ratios[ratios.length - 1]?.negativeEquity === true;
  const latestICR = ratios[ratios.length - 1]?.interestCoverage;
  const latestCR = ratios[ratios.length - 1]?.currentRatio ?? quote.currentRatioNow;
  const latestROE = roeSeries[roeSeries.length - 1] ?? quote.roeTTM;
  const latestNM = nmSeries[nmSeries.length - 1] ?? quote.profitMarginTTM;
  const roaSeries = ratios.map((r) => r.roa).filter((v): v is number => v !== undefined);

  // ROE declining 3 consecutive years?
  let roeFalling3 = false;
  if (roeSeries.length >= 4) {
    roeFalling3 = true;
    for (let i = roeSeries.length - 3; i < roeSeries.length; i++) {
      if (roeSeries[i] >= roeSeries[i - 1]) roeFalling3 = false;
    }
  }

  const earningsYield = currentPE && currentPE > 0 ? 1 / currentPE : undefined;
  const fcfYield =
    quote.fcfTTM && quote.marketCap && quote.marketCap > 0 ? quote.fcfTTM / quote.marketCap : undefined;
  const pegRatio =
    quote.pegRatio ??
    (currentPE && epsCagr && epsCagr > 0 ? currentPE / (epsCagr * 100) : undefined);

  const checks: CheckInput[] = [];

  // ===== Pillar A: Business Quality =====
  checks.push({
    id: "roe",
    pillar: "quality",
    label: `Return on Equity ≥ 15% (avg of last ${roeSeries.length || "?"}y)`,
    philosophy: "Buffett: consistently high ROE signals a durable moat",
    weight: 8,
    fn: () => {
      const a = avg(roeSeries) ?? quote.roeTTM;
      return [band(a, 0.15, 0.1), `Avg ROE ${pct(avg(roeSeries))}, latest ${pct(latestROE)}`];
    },
  });
  if (!isFin) {
    checks.push({
      id: "roce",
      pillar: "quality",
      label: "Return on Capital Employed ≥ 15%",
      philosophy: "Jhunjhunwala/Damani/Terry Smith: sustained ROCE is the truest test of quality (Greenblatt's Magic Formula, side one)",
      weight: 8,
      fn: () => {
        const a = avg(roceSeries);
        return [band(a, 0.15, 0.1), `Avg ROCE ${pct(a)} across ${roceSeries.length} years`];
      },
    });
  } else {
    checks.push({
      id: "roa",
      pillar: "quality",
      label: "Return on Assets ≥ 1.3% (bank/financial)",
      philosophy: "Buffett on banks: superior ROA marks a well-run lender",
      weight: 8,
      fn: () => {
        const a = avg(roaSeries);
        return [band(a, 0.013, 0.009), `Avg ROA ${pct(a, 2)} across ${roaSeries.length} years`];
      },
    });
  }
  checks.push({
    id: "netmargin",
    pillar: "quality",
    label: isFin ? "Net margin ≥ 15%" : "Net margin ≥ 10%",
    philosophy: "Buffett: pricing power shows up as fat, defensible margins",
    weight: 6,
    fn: () => {
      const a = avg(nmSeries) ?? quote.profitMarginTTM;
      return [band(a, isFin ? 0.15 : 0.1, isFin ? 0.1 : 0.06), `Avg net margin ${pct(a)}, latest ${pct(latestNM)}`];
    },
  });
  checks.push({
    id: "marginstability",
    pillar: "quality",
    label: "Margin stability (low year-to-year swings)",
    philosophy: "Damani/Fisher: predictable, simple businesses beat exciting ones",
    weight: 4,
    fn: () => {
      const m = avg(nmSeries);
      const sd = stdev(nmSeries);
      if (m === undefined || sd === undefined || m <= 0) return [undefined, "Not enough margin history"];
      // Coefficient of variation is meaningless around a near-zero mean: a
      // grocer earning 1.5% ± 0.5pp is a steady business, but sd/mean reads it
      // as 33% "variability" and failed it. Below a 2% mean the check abstains.
      if (m < 0.02)
        return [undefined, `Avg margin ${pct(m)} is too thin for a stability ratio - swings around a near-zero mean read as noise`];
      const cv = sd / m;
      return [band(cv, 0.25, 0.5, false), `Margin variability (CV) ${(cv * 100).toFixed(0)}% - lower is steadier`];
    },
  });
  checks.push({
    id: "roetrend",
    pillar: "quality",
    label: "ROE not in multi-year decline",
    philosophy: "Buffett/Agrawal: longevity of the moat - watch for it being breached",
    weight: 4,
    fn: () => {
      if (roeSeries.length < 4) return [undefined, "Fewer than 4 years of ROE history"];
      return [roeFalling3 ? 0 : 1, roeFalling3 ? "ROE fell 3 years in a row" : "No sustained ROE decline"];
    },
  });
  checks.push({
    id: "coffeecan",
    pillar: "quality",
    label: isFin
      ? "Coffee Can test: revenue growth ≥ 10% AND ROE ≥ 15%, year after year"
      : "Coffee Can test: revenue growth ≥ 10% AND ROCE ≥ 15%, year after year",
    philosophy: "Saurabh Mukherjea: consistent compounders earn the right to be left untouched for a decade",
    weight: 4,
    fn: () => {
      let qualifying = 0;
      let testable = 0;
      for (let i = 1; i < years.length; i++) {
        const prevRev = years[i - 1].revenue;
        const rev = years[i].revenue;
        const metric = isFin ? ratios[i]?.roe : ratios[i]?.roce;
        if (!prevRev || rev === undefined || metric === undefined) continue;
        testable++;
        const growth = rev / prevRev - 1;
        if (growth >= 0.10 && metric >= 0.15) qualifying++;
      }
      if (testable < 2) return [undefined, "Not enough year-pairs to test"];
      const share = qualifying / testable;
      return [
        band(share, 0.75, 0.5),
        `${qualifying} of ${testable} years met both bars (${isFin ? "ROE" : "ROCE"} ≥15% + growth ≥10%)`,
      ];
    },
  });

  // ===== Pillar B: Financial Fortress =====
  if (!isFin) {
    checks.push({
      id: "d2e",
      pillar: "fortress",
      label: "Debt-to-Equity ≤ 0.5",
      philosophy: "Buffett: great businesses don't need much debt",
      weight: 8,
      fn: () => [band(latestD2E, 0.5, 1.0, false), `Latest D/E ${x2(latestD2E)}`],
    });
    checks.push({
      id: "icr",
      pillar: "fortress",
      label: "Interest coverage ≥ 6x",
      philosophy: "Jhunjhunwala: leverage kills more portfolios than bad picks",
      weight: 6,
      fn: () => [band(latestICR, 6, 3), `EBIT covers interest ${x2(latestICR, 1)}`],
    });
    checks.push({
      id: "currentratio",
      pillar: "fortress",
      label: "Current ratio ≥ 1.25",
      philosophy: "Graham/Buffett: liquidity buys you time in bad years",
      weight: 4,
      fn: () => [band(latestCR, 1.25, 1.0), `Current ratio ${x2(latestCR)}`],
    });
  } else {
    checks.push({
      id: "finlev",
      pillar: "fortress",
      label: "Leverage within banking norms (assets/equity ≤ 12x)",
      philosophy: "Buffett: with banks, management prudence is everything",
      weight: 10,
      fn: () => {
        const l = last;
        if (!l?.totalAssets || !l?.equity) return [undefined, "Leverage data unavailable"];
        const lev = l.totalAssets / l.equity;
        return [band(lev, 12, 16, false), `Assets/Equity ${x2(lev, 1)}`];
      },
    });
  }
  checks.push({
    id: "fcfpos",
    pillar: "fortress",
    label: "Free cash flow positive in ≥ 80% of years",
    philosophy: "Buffett: owner earnings are the real earnings",
    weight: isFin ? 4 : 7,
    fn: () => {
      if (fcfPositiveShare === undefined) return [undefined, "FCF history unavailable"];
      return [
        band(fcfPositiveShare, 0.8, 0.6),
        `FCF positive in ${Math.round(fcfPositiveShare * (fcfYears.length))} of ${fcfYears.length} years`,
      ];
    },
  });

  // ===== Pillar C: Growth & Consistency =====
  checks.push({
    id: "revcagr",
    pillar: "growth",
    label: "Revenue CAGR ≥ 10%",
    philosophy: "Jhunjhunwala: earnings follow revenue; growth compounds wealth",
    weight: 7,
    fn: () => [band(revCagr, 0.1, 0.05), `Revenue CAGR ${pct(revCagr)} over ${spanYears.toFixed(1)}y`],
  });
  checks.push({
    id: "epscagr",
    pillar: "growth",
    label: "EPS CAGR ≥ 12%",
    philosophy: "Buffett/Lynch: per-share earnings growth is what ultimately moves the price",
    weight: 8,
    fn: () => {
      // A collapse to a LOSS is a real, scoreable answer. Letting it fall to n/a
      // shrank the denominator and RAISED the score of a company that just
      // started losing money.
      if (epsCagr === undefined && epsFirst !== undefined && epsLast !== undefined && epsLast <= 0 && epsFirst > 0)
        return [0, `EPS fell from ${x2(epsFirst, 2)} to a loss of ${x2(epsLast, 2)} over ${spanYears.toFixed(1)}y`];
      return [band(epsCagr, 0.12, 0.06), `EPS CAGR ${pct(epsCagr)} over ${spanYears.toFixed(1)}y`];
    },
  });
  checks.push({
    id: "consistency",
    pillar: "growth",
    label: "Earnings consistency (no losses, few down years)",
    philosophy: "Damani: consistency over drama - hold for decades",
    weight: 6,
    fn: () => {
      if (!niSeries.length) return [undefined, "Earnings history unavailable"];
      let s = 1;
      if (lossYears >= 1) s -= 0.5;
      if (lossYears >= 2) s = 0;
      if (declineYears >= 2) s = Math.min(s, 0.5);
      if (declineYears >= 3) s = 0;
      return [Math.max(0, s), `${lossYears} loss year(s), ${declineYears} down year(s) in ${niSeries.length}y`];
    },
  });
  checks.push({
    id: "fcfgrowth",
    pillar: "growth",
    label: "Free cash flow growing",
    philosophy: "Buffett: growing owner earnings = compounding machine",
    weight: 4,
    fn: () => {
      const fFirst = years.find((y) => y.fcf !== undefined)?.fcf;
      const fLast = [...years].reverse().find((y) => y.fcf !== undefined)?.fcf;
      if (fcfCagr === undefined && fFirst !== undefined && fLast !== undefined && fLast <= 0 && fFirst > 0)
        return [0, `Free cash flow went from positive to negative over ${spanYears.toFixed(1)}y`];
      return [band(fcfCagr, 0.08, 0.0), `FCF CAGR ${pct(fcfCagr)} over ${spanYears.toFixed(1)}y`];
    },
  });
  checks.push({
    id: "reinvest",
    pillar: "growth",
    label: "Reinvestment engine: ROE × retained earnings ≥ 12%",
    philosophy: "Chuck Akre: a compounding machine needs high returns AND a runway to reinvest them",
    weight: 4,
    fn: () => {
      const roeAvg = avg(roeSeries) ?? quote.roeTTM;
      if (roeAvg === undefined) return [undefined, "ROE unavailable"];
      let retention: number | undefined;
      if (quote.payoutRatio !== undefined && quote.payoutRatio >= 0 && quote.payoutRatio <= 1.5) {
        retention = Math.max(0, 1 - quote.payoutRatio);
      } else if (quote.dividendYield !== undefined && quote.dividendYield < 0.002) {
        // A KNOWN near-zero yield means everything is retained. An UNKNOWN yield
        // must stay unknown - treating it as full retention was the single most
        // optimistic possible reading, and it fired inside the backtest too.
        retention = 1;
      }
      if (retention === undefined) return [undefined, "Payout ratio unavailable"];
      const sgr = roeAvg * retention;
      return [
        band(sgr, 0.12, 0.07),
        `ROE ${pct(roeAvg)} × retention ${pct(retention, 0)} ≈ ${pct(sgr)} self-funded growth`,
      ];
    },
  });

  // ===== Pillar D: Valuation =====
  checks.push({
    id: "pevshistory",
    pillar: "valuation",
    label: "P/E at or below its own 5-year average",
    philosophy: "Damani/Graham: even a great business must be bought with a margin of safety",
    weight: 6,
    fn: () => {
      if (!currentPE || !avgPE) return [undefined, `Current P/E ${x2(currentPE, 1)}, history unavailable`];
      const ratio = currentPE / avgPE;
      return [band(ratio, 1.0, 1.25, false), `P/E ${currentPE.toFixed(1)} vs own avg ${avgPE.toFixed(1)} (${x2(ratio)})`];
    },
  });
  checks.push({
    id: "peg",
    pillar: "valuation",
    label: "PEG ratio ≤ 1.5",
    philosophy: "Lynch/Jhunjhunwala: growth at a reasonable price - pay for growth, never overpay",
    weight: 5,
    fn: () => [band(pegRatio, 1.0, 1.5, false), `PEG ${x2(pegRatio)}`],
  });
  checks.push({
    id: "earnyield",
    pillar: "valuation",
    label: "Earnings yield ≥ 6%",
    philosophy: "Buffett/Greenblatt: the earnings coupon vs a bond's (Magic Formula, side two)",
    weight: 5,
    fn: () => [band(earningsYield, 0.06, 0.04), `Earnings yield ${pct(earningsYield)} (P/E ${currentPE?.toFixed(1) ?? "n/a"})`],
  });
  if (isFin) {
    checks.push({
      id: "pb",
      pillar: "valuation",
      label: "Price-to-Book ≤ 2 (financials)",
      philosophy: "Graham/Buffett: book value anchors bank valuations",
      weight: 4,
      fn: () => [band(quote.priceToBook, 2, 3.5, false), `P/B ${x2(quote.priceToBook)}`],
    });
  } else {
    checks.push({
      id: "fcfyield",
      pillar: "valuation",
      label: "FCF yield ≥ 4%",
      philosophy: "Buffett/Pabrai: cash flow is the margin of safety - heads I win, tails I don't lose much",
      weight: 4,
      fn: () => [band(fcfYield, 0.04, 0.025), `FCF yield ${pct(fcfYield)}`],
    });
  }

  // ---------- evaluate ----------
  const evaluated: Check[] = checks.map((c) => {
    let score: number | undefined;
    let detail = "";
    try {
      [score, detail] = c.fn();
    } catch {
      score = undefined;
      detail = "Could not evaluate";
    }
    return {
      id: c.id,
      pillar: c.pillar,
      label: c.label,
      philosophy: c.philosophy,
      status: statusOf(score),
      score: score ?? 0,
      weight: c.weight,
      detail,
    };
  });

  const pillars: PillarScore[] = (Object.keys(PILLAR_LABEL) as Pillar[]).map((p) => {
    const cs = evaluated.filter((c) => c.pillar === p && c.status !== "na");
    const wsum = cs.reduce((a, c) => a + c.weight, 0);
    const s = wsum ? (cs.reduce((a, c) => a + c.score * c.weight, 0) / wsum) * 100 : 0;
    return { pillar: p, label: PILLAR_LABEL[p], score: Math.round(s), weight: wsum, applicable: wsum > 0 };
  });

  const applicable = evaluated.filter((c) => c.status !== "na");
  const totalW = applicable.reduce((a, c) => a + c.weight, 0);
  const totalScore = totalW
    ? Math.round((applicable.reduce((a, c) => a + c.score * c.weight, 0) / totalW) * 100)
    : 0;
  const dataCoverage = totalW / evaluated.reduce((a, c) => a + c.weight, 0);

  // ---------- red flags ----------
  // Two tiers. CRITICAL flags are solvency/viability facts - negative equity,
  // interest the profits cannot cover, a latest-year loss - and any ONE of
  // them makes "keep holding comfortably" indefensible, so it caps the verdict
  // at WATCH below. Cautions still block ADD_MORE (which demands a clean
  // sheet), but a strong business can carry one and remain a HOLD.
  const redFlags: string[] = [];
  const criticalFlags: string[] = [];
  const critical = (msg: string) => {
    redFlags.push(msg);
    criticalFlags.push(msg);
  };
  if (!isFin && latestICR !== undefined && latestICR < 2) critical(`Interest coverage is only ${latestICR.toFixed(1)}x - debt service is eating profits.`);
  if (!isFin && latestD2E !== undefined && latestD2E > 2) redFlags.push(`Debt-to-equity of ${latestD2E.toFixed(1)}x is far beyond value-investing comfort.`);
  if (negativeEquity)
    critical("Shareholders' equity is negative - the balance sheet owes more than it owns, and debt ratios cannot be read normally.");
  if (niSeries.length && (last?.netIncome ?? 1) <= 0) critical("Latest fiscal year was loss-making.");
  if (fcfPositiveShare !== undefined && fcfPositiveShare < 0.5) redFlags.push("Free cash flow negative in most years - the business consumes cash.");
  if (roeFalling3 && latestROE !== undefined && latestROE < 0.1) redFlags.push("ROE has declined three straight years and is now below 10% - possible moat erosion.");
  if (epsFirst && epsLast && spanYears >= 2 && epsLast < epsFirst * 0.6)
    redFlags.push(`EPS is down more than 40% versus ${spanYears.toFixed(0)} years ago.`);
  if (currentPE !== undefined && currentPE > 60 && (epsCagr ?? 0) < 0.15) redFlags.push(`P/E of ${currentPE.toFixed(0)} with modest growth leaves no margin of safety.`);
  // Commodity earnings look best right before they turn: a miner or refiner at
  // peak margins prints its fattest ROE and its cheapest P/E at the exact top
  // of the cycle, and every "higher is better" check above rewards it for it.
  // When a cyclical's latest margin runs 1.5x its own multi-year average, say so.
  const isCyclical =
    quote.sector === "Energy" ||
    quote.sector === "Basic Materials" ||
    /\b(oil|gas|coal|mining|metals?|steel|aluminum|copper|cement|chemicals?|paper|shipping)\b/i.test(quote.industry ?? "");
  const latestNMOwn = nmSeries[nmSeries.length - 1];
  const nmAvgOwn = avg(nmSeries);
  if (
    !isEtfOrFund &&
    isCyclical &&
    nmSeries.length >= 3 &&
    nmAvgOwn !== undefined &&
    nmAvgOwn > 0 &&
    latestNMOwn !== undefined &&
    latestNMOwn > nmAvgOwn * 1.5
  )
    redFlags.push(
      `Cyclical sector at peak margins: latest net margin ${pct(latestNMOwn)} vs own ${nmSeries.length}-year average ${pct(nmAvgOwn)}. In commodities the P/E looks cheapest at the cycle top - score the trough, not the peak.`,
    );

  // ---------- verdict ----------
  const valuationPillar = pillars.find((p) => p.pillar === "valuation");
  const qualityOk = totalScore >= 70;
  /**
   * ADD_MORE claims "at a sensible price", so it now REQUIRES price evidence.
   * The old `|| !applicable` clause let a stock with no P/E, no P/B and no
   * market cap - i.e. nothing whatsoever about price - be recommended for fresh
   * capital at any valuation.
   */
  const valuationKnown = !!valuationPillar?.applicable;
  const valuationOk = valuationKnown && (valuationPillar?.score ?? 0) >= 50;

  let verdict: Verdict;
  let verdictNote: string | undefined;
  if (isEtfOrFund || dataCoverage < 0.35 || n < 2) {
    verdict = "INSUFFICIENT_DATA";
  } else if (redFlags.length >= 2) {
    verdict = "REVIEW_EXIT";
  } else if (qualityOk && valuationOk && redFlags.length === 0 && dataCoverage >= 0.6) {
    verdict = "ADD_MORE";
  } else if (qualityOk && valuationOk && redFlags.length === 0) {
    // Quality and price both pass - but so much of the checklist went unscored
    // that "put fresh capital in" would rest on blind spots, not evidence.
    verdict = "HOLD";
    verdictNote = `Quality and price both pass, but only ${Math.round(
      dataCoverage * 100,
    )}% of the checklist could be scored from available data. Too many blind spots to recommend fresh capital - hold what you have and revisit when fuller financials arrive.`;
  } else if (qualityOk && redFlags.length === 0) {
    // high score, but the price is either rich or unknown
    verdict = "HOLD_QUALITY_PRICEY";
  } else if (qualityOk) {
    // a high score carrying a red flag is not a "rich price" story - say so
    verdict = "HOLD";
  } else if (totalScore >= 55) {
    verdict = "HOLD";
  } else if (totalScore >= 40 || redFlags.length === 1) {
    verdict = "WATCH";
  } else {
    verdict = "REVIEW_EXIT";
  }

  // Any single CRITICAL flag caps the verdict at WATCH. A business with
  // negative equity, un-covered interest or a latest-year loss can be worth
  // watching, but a comfortable "hold" overstates what the data supports.
  if (criticalFlags.length > 0 && (verdict === "ADD_MORE" || verdict === "HOLD_QUALITY_PRICEY" || verdict === "HOLD")) {
    verdict = "WATCH";
    verdictNote = undefined;
  }

  const verdictTexts: Record<Verdict, string> = {
    ADD_MORE:
      "Quality business at a sensible price. On a 5-year+ horizon this is the kind of position the masters would quietly accumulate.",
    HOLD_QUALITY_PRICEY:
      "Wonderful business, rich price. Keep holding - but add only on meaningful dips. Patience is a position too.",
    HOLD: "Solid but not exceptional, or strong with a flag against it. Hold and review annually; read the red flags below before adding.",
    WATCH:
      "The long-term thesis is weakening on the numbers. Watch the next 2–4 quarters closely before committing new money.",
    REVIEW_EXIT:
      "Fails core long-term quality tests. Re-examine why you own it - capital compounds faster in stronger businesses.",
    INSUFFICIENT_DATA:
      "Not enough fundamental history to score confidently (common for ETFs, new listings, or sparse coverage). Judge this one separately.",
  };

  const philosophyNotes: Record<Verdict, string> = {
    ADD_MORE: "“It's far better to buy a wonderful company at a fair price than a fair company at a wonderful price.” - Warren Buffett",
    HOLD_QUALITY_PRICEY: "“The big money is not in the buying and selling, but in the waiting.” - Charlie Munger (Buffett's partner)",
    HOLD: "“Buy right, sit tight.” - Rakesh Jhunjhunwala",
    WATCH: "“Know what you own, and know why you own it.” - Peter Lynch (a test Damani applies ruthlessly)",
    REVIEW_EXIT: "“Should you find yourself in a chronically leaking boat, energy devoted to changing vessels is likely more productive than energy devoted to patching leaks.” - Warren Buffett",
    INSUFFICIENT_DATA: "“Risk comes from not knowing what you're doing.” - Warren Buffett",
  };

  return {
    symbol: data.symbol,
    totalScore,
    pillars,
    checks: evaluated,
    redFlags,
    criticalFlags,
    coverage: dataCoverage,
    verdict,
    verdictText: verdictNote ?? verdictTexts[verdict],
    philosophyNote: philosophyNotes[verdict],
    isFinancialSector: isFin,
    ratios,
    cagr: { revenue: revCagr, eps: epsCagr, fcf: fcfCagr, years: spanYears },
    avgPE,
    currentPE,
    fscore: computeFScore(years),
  };
}
