import "server-only";
import YahooFinance from "yahoo-finance2";
import type { PricePoint, QuoteInfo, StockData, YearFinancials } from "./types";
import { mockHistory, mockStockData, MOCK_ENABLED } from "./mock";
import type { Candle, HistoryRange } from "./history";
export { HISTORY_RANGES } from "./history";
export type { Candle, HistoryRange } from "./history";

// One shared instance per lambda/server process.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type AnyRow = Record<string, unknown>;

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as AnyRow)) {
    const raw = (v as AnyRow).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return undefined;
}

function mapYearRow(row: AnyRow): YearFinancials {
  const date = row.date instanceof Date ? row.date : new Date(String(row.date));
  const ocf = num(row.annualOperatingCashFlow);
  const capexRaw = num(row.annualCapitalExpenditure);
  let fcf = num(row.annualFreeCashFlow);
  if (fcf === undefined && ocf !== undefined && capexRaw !== undefined) {
    // Yahoo reports capex as a negative outflow; be tolerant of either sign.
    fcf = capexRaw <= 0 ? ocf + capexRaw : ocf - capexRaw;
  }
  const pretax = num(row.annualPretaxIncome);
  const interest = num(row.annualInterestExpense) ?? num(row.annualInterestExpenseNonOperating);
  let ebit = num(row.annualEBIT);
  if (ebit === undefined && pretax !== undefined && interest !== undefined) ebit = pretax + interest;
  if (ebit === undefined) ebit = num(row.annualOperatingIncome);

  return {
    year: date.getUTCFullYear(),
    endDate: date.toISOString().slice(0, 10),
    revenue: num(row.annualTotalRevenue),
    grossProfit: num(row.annualGrossProfit),
    operatingIncome: num(row.annualOperatingIncome),
    ebit,
    pretaxIncome: pretax,
    netIncome: num(row.annualNetIncome) ?? num(row.annualNetIncomeCommonStockholders),
    interestExpense: interest,
    equity: num(row.annualStockholdersEquity) ?? num(row.annualTotalEquityGrossMinorityInterest),
    totalDebt: num(row.annualTotalDebt),
    totalAssets: num(row.annualTotalAssets),
    currentAssets: num(row.annualCurrentAssets),
    currentLiabilities: num(row.annualCurrentLiabilities),
    cash: num(row.annualCashAndCashEquivalents),
    fcf,
    ocf,
    capex: capexRaw,
    dilutedEPS: num(row.annualDilutedEPS),
    basicEPS: num(row.annualBasicEPS),
    shares: num(row.annualOrdinarySharesNumber) ?? num(row.annualDilutedAverageShares),
  };
}

/** Merge fundamentals rows that share a fiscal year (module:"all" can emit partial rows). */
function mergeYears(rows: YearFinancials[]): YearFinancials[] {
  const byKey = new Map<string, YearFinancials>();
  for (const r of rows) {
    const key = r.endDate;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...r });
    else {
      const merged: AnyRow = { ...prev };
      for (const [k, v] of Object.entries(r)) {
        if (v !== undefined && (merged[k] === undefined || merged[k] === null)) merged[k] = v;
      }
      byKey.set(key, merged as unknown as YearFinancials);
    }
  }
  return [...byKey.values()].sort((a, b) => a.endDate.localeCompare(b.endDate));
}

export async function getStockData(symbol: string): Promise<StockData> {
  if (MOCK_ENABLED) return mockStockData(symbol);

  const errors: string[] = [];

  // --- live quote + profile ---
  const quote: QuoteInfo = { symbol };
  try {
    const q = await yf.quote(symbol);
    quote.name = q.longName ?? q.shortName;
    quote.price = q.regularMarketPrice;
    quote.currency = q.currency;
    quote.exchange = q.fullExchangeName;
    quote.marketCap = q.marketCap;
    quote.trailingPE = q.trailingPE;
    quote.forwardPE = q.forwardPE;
    quote.priceToBook = q.priceToBook;
    quote.epsTrailing = q.epsTrailingTwelveMonths;
    quote.fiftyTwoWeekHigh = q.fiftyTwoWeekHigh;
    quote.fiftyTwoWeekLow = q.fiftyTwoWeekLow;
  } catch (e) {
    throw new Error(`Quote fetch failed for ${symbol}: ${(e as Error).message}`);
  }

  try {
    const qs = await yf.quoteSummary(symbol, {
      modules: ["assetProfile", "financialData", "defaultKeyStatistics", "summaryDetail"],
    });
    quote.sector = qs.assetProfile?.sector;
    quote.industry = qs.assetProfile?.industry;
    quote.country = qs.assetProfile?.country;
    quote.roeTTM = qs.financialData?.returnOnEquity ?? undefined;
    quote.profitMarginTTM = qs.financialData?.profitMargins ?? undefined;
    quote.revenueGrowthTTM = qs.financialData?.revenueGrowth ?? undefined;
    quote.earningsGrowthTTM = qs.financialData?.earningsGrowth ?? undefined;
    quote.fcfTTM = qs.financialData?.freeCashflow ?? undefined;
    quote.totalDebtNow = qs.financialData?.totalDebt ?? undefined;
    quote.totalCashNow = qs.financialData?.totalCash ?? undefined;
    quote.currentRatioNow = qs.financialData?.currentRatio ?? undefined;
    const d2ePct = qs.financialData?.debtToEquity;
    quote.debtToEquityNow = typeof d2ePct === "number" ? d2ePct / 100 : undefined;
    quote.pegRatio = qs.defaultKeyStatistics?.pegRatio ?? undefined;
    quote.dividendYield = qs.summaryDetail?.dividendYield ?? undefined;
    quote.payoutRatio = qs.summaryDetail?.payoutRatio ?? undefined;
    if (quote.trailingPE === undefined) quote.trailingPE = qs.summaryDetail?.trailingPE ?? undefined;
  } catch (e) {
    errors.push(`Profile/key-stats unavailable: ${(e as Error).message}`);
  }

  // --- ~6 fiscal years of annual statements ---
  let years: YearFinancials[] = [];
  try {
    const period1 = new Date();
    period1.setUTCFullYear(period1.getUTCFullYear() - 6);
    const rows = (await yf.fundamentalsTimeSeries(symbol, {
      period1: period1.toISOString().slice(0, 10),
      period2: new Date().toISOString().slice(0, 10),
      type: "annual",
      module: "all",
    })) as unknown as AnyRow[];
    years = mergeYears(rows.map(mapYearRow)).filter(
      (y) => y.revenue !== undefined || y.netIncome !== undefined || y.totalAssets !== undefined
    );
  } catch (e) {
    errors.push(`Annual fundamentals unavailable: ${(e as Error).message}`);
  }

  // --- ~5y of monthly closes ---
  let prices: PricePoint[] = [];
  try {
    const period1 = new Date(Date.now() - Math.round(5.1 * 365.25 * 24 * 3600 * 1000));
    const chart = await yf.chart(symbol, { period1, interval: "1mo" });
    prices = (chart.quotes ?? [])
      .filter((q) => typeof q.close === "number")
      .map((q) => ({ date: new Date(q.date).toISOString().slice(0, 10), close: q.close as number }));
  } catch (e) {
    errors.push(`Price history unavailable: ${(e as Error).message}`);
  }

  return {
    symbol,
    quote,
    years,
    prices,
    fetchedAt: new Date().toISOString(),
    errors: errors.length ? errors : undefined,
  };
}

export interface ResolveMatch {
  symbol: string;
  name?: string;
  exchange?: string;
  type?: string;
}

export async function resolveSymbol(query: string): Promise<ResolveMatch[]> {
  if (MOCK_ENABLED) {
    return [{ symbol: query.toUpperCase(), name: `${query.toUpperCase()} (mock match)`, exchange: "MOCK" }];
  }
  const res = await yf.search(query, { quotesCount: 6, newsCount: 0 });
  const out: ResolveMatch[] = [];
  for (const q of (res.quotes ?? []) as Array<Record<string, unknown>>) {
    if (typeof q.symbol !== "string") continue;
    out.push({
      symbol: q.symbol,
      name:
        typeof q.longname === "string" ? q.longname : typeof q.shortname === "string" ? q.shortname : undefined,
      exchange: typeof q.exchDisp === "string" ? q.exchDisp : undefined,
      type: typeof q.quoteType === "string" ? q.quoteType : undefined,
    });
  }
  return out;
}

const RANGE_CONFIG: Record<HistoryRange, { days: number; interval: "1d" | "1wk" | "1mo" }> = {
  "6m": { days: 185, interval: "1d" },
  "1y": { days: 370, interval: "1d" },
  "3y": { days: 3 * 366, interval: "1wk" },
  "5y": { days: 5 * 366, interval: "1wk" },
  max: { days: 25 * 366, interval: "1mo" },
};

/** OHLCV history for the interactive chart (daily/weekly/monthly by range). */
export async function getHistory(symbol: string, range: HistoryRange): Promise<{ symbol: string; range: HistoryRange; interval: "1d" | "1wk" | "1mo"; candles: Candle[]; mock?: boolean }> {
  const cfg = RANGE_CONFIG[range];
  if (MOCK_ENABLED) {
    return { symbol, range, interval: cfg.interval, candles: mockHistory(symbol, range), mock: true };
  }
  const period1 = new Date(Date.now() - cfg.days * 24 * 3600 * 1000);
  const chart = await yf.chart(symbol, { period1, interval: cfg.interval });
  const candles: Candle[] = (chart.quotes ?? [])
    .filter(
      (q) =>
        typeof q.open === "number" &&
        typeof q.high === "number" &&
        typeof q.low === "number" &&
        typeof q.close === "number"
    )
    .map((q) => ({
      time: new Date(q.date).toISOString().slice(0, 10),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: typeof q.volume === "number" ? q.volume : undefined,
    }));
  return { symbol, range, interval: cfg.interval, candles };
}

/** USD-based FX via Yahoo as a fallback when frankfurter is unreachable. */
export async function yahooUsdRates(): Promise<{ INR?: number; CAD?: number }> {
  if (MOCK_ENABLED) return { INR: 87.2, CAD: 1.36 };
  const out: { INR?: number; CAD?: number } = {};
  try {
    const [inr, cad] = await Promise.all([yf.quote("USDINR=X"), yf.quote("USDCAD=X")]);
    out.INR = inr.regularMarketPrice;
    out.CAD = cad.regularMarketPrice;
  } catch {
    // leave undefined; caller decides
  }
  return out;
}
