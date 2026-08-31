import "server-only";
import YahooFinance from "yahoo-finance2";
import type { PricePoint, QuoteInfo, StockData, YearFinancials } from "./types";
import { mockHistory, mockOwnership, mockStockData, MOCK_ENABLED } from "./mock";
import { mockEtfData } from "./mocketf";
import { mapFundSummary, type EtfData } from "./etf";
import { mapOwnership, type OwnershipPayload } from "./ownership";
import {
  buildMacroPayload,
  MACRO_SYMBOLS,
  mockMacro,
  seriesStats,
  type MacroPayload,
  type SeriesStats,
} from "./macro";
import type { Market } from "./store";
import {
  buildGoldPayload,
  GOLD_SYMBOLS,
  mockGold,
  type GoldPayload,
  type RealYield,
} from "./gold";
import {
  hasSubstance,
  mapStatementHistory,
  mapYearRow,
  mergeYears,
  parseTimeseries,
  TS_KEYS,
  type AnyRow,
} from "./fundamentals";
import type { Candle, HistoryRange } from "./history";
export { HISTORY_RANGES } from "./history";
export type { Candle, HistoryRange } from "./history";

/**
 * Yahoo data layer - hardened for the real world.
 *
 * Free Yahoo endpoints fail in three characteristic ways: rate limiting
 * (429/999/"Too Many Requests"), the cookie/crumb handshake breaking
 * ("No set-cookie header…"), and the library's giant `module:"all"`
 * fundamentals URL getting rejected or returning odd shapes that fail schema
 * validation. Every one of those used to surface as "insufficient data".
 *
 * Defenses, in order:
 *  1. A polite global queue: max 3 in-flight, ≥250ms between launches, and
 *     automatic retries with backoff + jitter on retryable errors.
 *  2. Fundamentals come from a MINIMAL direct timeseries request (23 fields,
 *     no crumb needed, tiny URL) → library fundamentalsTimeSeries → 4-year
 *     quoteSummary statement history, first one that yields rows wins.
 *  3. Quotes fall back to the chart endpoint's metadata (also crumb-free)
 *     when the quote/crumb handshake fails.
 *  4. Schema validation is disabled on library calls - a new Yahoo field must
 *     never turn a valid response into an error.
 */

const yf = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false, logOptionsErrors: false },
});

const NO_VALIDATE = { validateResult: false } as const;

// With validateResult:false the library returns `unknown`; these are the
// minimal shapes we actually read (tolerant by construction).
interface YFQuote {
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  currency?: string;
  quoteType?: string;
  fullExchangeName?: string;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  epsTrailingTwelveMonths?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}
interface YFChartQuoteRow {
  date: string | number | Date;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}
interface YFChart {
  meta?: ChartMeta;
  quotes?: YFChartQuoteRow[];
}
interface YFQuoteSummary {
  assetProfile?: { sector?: string; industry?: string; country?: string };
  financialData?: {
    returnOnEquity?: number;
    profitMargins?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
    freeCashflow?: number;
    totalDebt?: number;
    totalCash?: number;
    currentRatio?: number;
    debtToEquity?: number;
    targetMeanPrice?: number;
    recommendationKey?: string;
    numberOfAnalystOpinions?: number;
  };
  defaultKeyStatistics?: { pegRatio?: number; priceToBook?: number };
  summaryDetail?: {
    dividendYield?: number;
    payoutRatio?: number;
    trailingPE?: number;
    marketCap?: number;
  };
  incomeStatementHistory?: { incomeStatementHistory?: AnyRow[] };
  balanceSheetHistory?: { balanceSheetStatements?: AnyRow[] };
  cashflowStatementHistory?: { cashflowStatements?: AnyRow[] };
}
interface YFSearch {
  quotes?: Array<Record<string, unknown>>;
}

// ---------------- polite queue + retry ----------------

const MAX_CONCURRENT = 3;
const MIN_GAP_MS = 250;
let inFlight = 0;
let lastLaunch = 0;
const waiters: Array<() => void> = [];

function isRetryable(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e ?? "").toLowerCase();
  return (
    m.includes("429") ||
    m.includes("999") ||
    m.includes("too many request") ||
    m.includes("set-cookie") ||
    m.includes("crumb") ||
    m.includes("econnreset") ||
    m.includes("socket hang up") ||
    m.includes("fetch failed") ||
    m.includes("timeout") ||
    m.includes("unauthorized")
  );
}

async function politely<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  // acquire a slot
  while (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((res) => waiters.push(res));
  }
  inFlight++;
  try {
    for (let attempt = 1; ; attempt++) {
      // pace launches
      const wait = lastLaunch + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastLaunch = Date.now();
      try {
        return await fn();
      } catch (e) {
        if (attempt >= tries || !isRetryable(e)) throw e;
        const backoff = 1200 * Math.pow(2.5, attempt - 1) * (0.7 + Math.random() * 0.6);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  } finally {
    inFlight--;
    waiters.shift()?.();
  }
}

async function fetchTimeseriesDirect(symbol: string): Promise<YearFinancials[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - Math.floor(6.2 * 365.25 * 24 * 3600);
  const url =
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?symbol=${encodeURIComponent(symbol)}&type=${TS_KEYS.join(",")}` +
    `&period1=${period1}&period2=${period2}&merge=false&padTimeSeries=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`timeseries HTTP ${res.status}`);
  return parseTimeseries(await res.json());
}

// ---------------- quote with chart-meta fallback ----------------

interface ChartMeta {
  regularMarketPrice?: number;
  currency?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  longName?: string;
  shortName?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

async function quoteViaChart(symbol: string): Promise<Partial<QuoteInfo>> {
  const period1 = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const chart = (await yf.chart(symbol, { period1, interval: "1d" }, NO_VALIDATE)) as YFChart;
  const meta = chart.meta ?? {};
  const closes = (chart.quotes ?? []).filter((q) => typeof q.close === "number");
  const last = closes[closes.length - 1];
  return {
    name: meta.longName ?? meta.shortName,
    price: meta.regularMarketPrice ?? (last?.close as number | undefined),
    currency: meta.currency,
    exchange: meta.fullExchangeName ?? meta.exchangeName,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
  };
}

// ---------------- main entry ----------------

export async function getStockData(symbol: string): Promise<StockData> {
  if (MOCK_ENABLED) return mockStockData(symbol);

  const errors: string[] = [];
  const quote: QuoteInfo = { symbol };

  // --- live quote (library → chart-meta fallback) ---
  try {
    const q = (await politely(() => yf.quote(symbol, {}, NO_VALIDATE))) as YFQuote;
    quote.name = q.longName ?? q.shortName;
    quote.price = q.regularMarketPrice;
    quote.currency = q.currency;
    quote.quoteType = q.quoteType;
    quote.exchange = q.fullExchangeName;
    quote.marketCap = q.marketCap;
    quote.trailingPE = q.trailingPE;
    quote.forwardPE = q.forwardPE;
    quote.priceToBook = q.priceToBook;
    quote.epsTrailing = q.epsTrailingTwelveMonths;
    quote.fiftyTwoWeekHigh = q.fiftyTwoWeekHigh;
    quote.fiftyTwoWeekLow = q.fiftyTwoWeekLow;
  } catch (e) {
    errors.push(`Quote endpoint failed (${(e as Error).message.slice(0, 80)}) - used chart fallback.`);
    try {
      Object.assign(quote, await politely(() => quoteViaChart(symbol)));
    } catch (e2) {
      throw new Error(`Quote fetch failed for ${symbol}: ${(e2 as Error).message}`);
    }
  }

  // --- profile & key stats (best-effort) ---
  try {
    const qs = (await politely(() =>
      yf.quoteSummary(
        symbol,
        { modules: ["assetProfile", "financialData", "defaultKeyStatistics", "summaryDetail"] },
        NO_VALIDATE
      )
    )) as YFQuoteSummary;
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
    quote.targetMeanPrice = qs.financialData?.targetMeanPrice ?? undefined;
    quote.recommendationKey = qs.financialData?.recommendationKey ?? undefined;
    quote.numberOfAnalystOpinions = qs.financialData?.numberOfAnalystOpinions ?? undefined;
    const d2ePct = qs.financialData?.debtToEquity;
    quote.debtToEquityNow = typeof d2ePct === "number" ? d2ePct / 100 : undefined;
    quote.pegRatio = qs.defaultKeyStatistics?.pegRatio ?? undefined;
    /**
     * Yahoo has shipped these as a fraction (0.0135) on some endpoints and as a
     * percent (1.35) on others. Normalising ONCE here - the same way
     * debtToEquity is divided by 100 above - stops a 100x overstatement leaking
     * into income projections, screeners and the sector medians. A real yield
     * above 100% does not exist, so anything > 1 is certainly a percent.
     */
    const asFraction = (v: number | undefined) => (v !== undefined && v > 1 ? v / 100 : v);
    quote.dividendYield = asFraction(qs.summaryDetail?.dividendYield ?? undefined);
    quote.payoutRatio = asFraction(qs.summaryDetail?.payoutRatio ?? undefined);
    if (quote.trailingPE === undefined) quote.trailingPE = qs.summaryDetail?.trailingPE ?? undefined;
    if (quote.marketCap === undefined) quote.marketCap = qs.summaryDetail?.marketCap ?? undefined;
    if (quote.priceToBook === undefined) quote.priceToBook = qs.defaultKeyStatistics?.priceToBook ?? undefined;
  } catch (e) {
    errors.push(`Profile/key-stats unavailable: ${(e as Error).message.slice(0, 80)}`);
  }

  // --- annual statements: direct minimal → library → statement history ---
  let years: YearFinancials[] = [];
  try {
    years = await politely(() => fetchTimeseriesDirect(symbol));
  } catch (e) {
    errors.push(`Direct fundamentals fetch failed: ${(e as Error).message.slice(0, 80)}`);
  }
  if (years.length < 2) {
    try {
      const period1 = new Date();
      period1.setUTCFullYear(period1.getUTCFullYear() - 6);
      const rows = (await politely(() =>
        yf.fundamentalsTimeSeries(
          symbol,
          {
            period1: period1.toISOString().slice(0, 10),
            period2: new Date().toISOString().slice(0, 10),
            type: "annual",
            module: "all",
          },
          NO_VALIDATE
        )
      )) as unknown as AnyRow[];
      const mapped = mergeYears(rows.map(mapYearRow)).filter(hasSubstance);
      if (mapped.length > years.length) years = mapped;
    } catch (e) {
      errors.push(`Library fundamentals unavailable: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  if (years.length < 2) {
    try {
      const qs = (await politely(() =>
        yf.quoteSummary(
          symbol,
          { modules: ["incomeStatementHistory", "balanceSheetHistory", "cashflowStatementHistory"] },
          NO_VALIDATE
        )
      )) as YFQuoteSummary;
      const mapped = mapStatementHistory(qs);
      if (mapped.length > years.length) years = mapped;
    } catch (e) {
      errors.push(`Statement history unavailable: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // --- ~5y of monthly closes ---
  let prices: PricePoint[] = [];
  try {
    const period1 = new Date(Date.now() - Math.round(5.1 * 365.25 * 24 * 3600 * 1000));
    const chart = (await politely(() => yf.chart(symbol, { period1, interval: "1mo" }, NO_VALIDATE))) as YFChart;
    prices = (chart.quotes ?? [])
      .filter((q) => typeof q.close === "number")
      .map((q) => ({ date: new Date(q.date).toISOString().slice(0, 10), close: q.close as number }));
  } catch (e) {
    errors.push(`Price history unavailable: ${(e as Error).message.slice(0, 80)}`);
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
  const res = (await politely(() => yf.search(query, { quotesCount: 6, newsCount: 0 }, NO_VALIDATE))) as YFSearch;
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
  const chart = (await politely(() => yf.chart(symbol, { period1, interval: cfg.interval }, NO_VALIDATE))) as YFChart;
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

/** Which mutual funds & institutions hold a stock (best for US/CA; partial for NSE). */
export async function getOwnership(symbol: string): Promise<OwnershipPayload> {
  if (MOCK_ENABLED) return mockOwnership(symbol);
  const qs = (await politely(() =>
    yf.quoteSummary(
      symbol,
      { modules: ["majorHoldersBreakdown", "fundOwnership", "institutionOwnership"] },
      NO_VALIDATE
    )
  )) as Parameters<typeof mapOwnership>[1];
  return mapOwnership(symbol, qs ?? {});
}

/**
 * Fund-level data for an ETF: expense ratio (MER), AUM, category, trailing &
 * annual returns, risk stats, top holdings and sector weights. Coverage is
 * strong for US/Canadian ETFs, partial for NSE ETFs - absent fields stay
 * undefined and the caller says so honestly.
 */
export async function getEtfData(symbol: string): Promise<EtfData> {
  if (MOCK_ENABLED) return mockEtfData(symbol);
  const FULL = ["price", "fundProfile", "topHoldings", "fundPerformance", "defaultKeyStatistics", "summaryDetail"];
  let qs: unknown;
  let note: string | undefined;
  try {
    qs = await politely(() => yf.quoteSummary(symbol, { modules: FULL as never }, NO_VALIDATE));
  } catch (e) {
    // Many NSE listings reject the fund modules wholesale - fall back to basics
    // so the client can still merge in the curated fee table + price history.
    note = `Fund modules unavailable (${(e as Error).message.slice(0, 60)}) - basic data only.`;
    qs = await politely(() =>
      yf.quoteSummary(symbol, { modules: ["price", "defaultKeyStatistics", "summaryDetail"] as never }, NO_VALIDATE)
    );
  }
  const out = mapFundSummary(symbol, qs ?? {});
  if (note) out.errors = [...(out.errors ?? []), note];
  // quoteType sanity: if Yahoo says it's not a fund, still return what we have
  // (the caller decides) but note it.
  if (out.quoteType && out.quoteType !== "ETF" && out.quoteType !== "MUTUALFUND") {
    out.errors = [...(out.errors ?? []), `Yahoo classifies ${symbol} as ${out.quoteType}, not an ETF.`];
  }
  return out;
}

/**
 * Market weather: ~1y of daily closes for the market's macro symbols (index,
 * VIX, FX, gold, oil, US 10y), reduced to stats + one regime read. Uses only
 * the crumb-free chart endpoint; failures degrade to fewer chips, never an
 * empty card. Cached in-process for 30 minutes.
 */
const macroCache = new Map<string, { at: number; payload: MacroPayload }>();

export async function gatherMacro(market: Market, fresh = false): Promise<MacroPayload> {
  if (MOCK_ENABLED) return mockMacro(market);
  const hit = macroCache.get(market);
  if (!fresh && hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.payload;

  const stats: Record<string, SeriesStats> = {};
  const errors: string[] = [];
  await Promise.all(
    MACRO_SYMBOLS[market].map(async ({ key, symbol }) => {
      try {
        const h = await getHistory(symbol, "1y");
        stats[key] = seriesStats(h.candles);
      } catch (e) {
        errors.push(`${symbol}: ${(e as Error).message.slice(0, 60)}`);
      }
    })
  );
  const payload = buildMacroPayload(market, stats, errors);
  if (payload.items.length) macroCache.set(market, { at: Date.now(), payload });
  return payload;
}

// ---------------------------------------------------------------------------
// The gold desk
// ---------------------------------------------------------------------------

const goldCache = new Map<Market, { at: number; payload: GoldPayload }>();
let realCache: { at: number; value: RealYield } | null = null;

/**
 * 10-year TIPS yield from FRED's keyless CSV endpoint (no API key, no signup).
 * Gold's single most important input, so it gets its own fetch - and its own
 * honest failure: if FRED is unreachable the signal reports UNKNOWN rather
 * than being faked from the nominal yield.
 */
async function fetchRealYield(): Promise<RealYield> {
  if (realCache && Date.now() - realCache.at < 6 * 3600 * 1000) return realCache.value;
  try {
    const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10", {
      headers: { "User-Agent": "PortfolioAdvisor/2.6 (personal research tool)" },
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
    const rows = (await res.text())
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(","))
      .map(([date, v]) => ({ date, v: Number(v) }))
      .filter((r) => r.date && Number.isFinite(r.v));
    if (!rows.length) throw new Error("FRED returned no usable rows");
    const last = rows[rows.length - 1];
    // ~126 business days back = 6 months
    const prior = rows[Math.max(0, rows.length - 1 - 126)];
    const value: RealYield = {
      latest: last.v,
      chg6m: prior ? last.v - prior.v : undefined,
      asOf: last.date,
    };
    realCache = { at: Date.now(), value };
    return value;
  } catch {
    return {};
  }
}

export async function gatherGold(market: Market, fresh = false): Promise<GoldPayload> {
  if (MOCK_ENABLED) return mockGold(market);
  const hit = goldCache.get(market);
  if (!fresh && hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.payload;

  const stats: Record<string, SeriesStats> = {};
  const errors: string[] = [];
  let goldCandles: Candle[] | undefined;

  const [, real] = await Promise.all([
    Promise.all(
      GOLD_SYMBOLS[market].map(async ({ key, symbol }) => {
        try {
          const h = await getHistory(symbol, "1y");
          stats[key] = seriesStats(h.candles);
        } catch (e) {
          errors.push(`${symbol}: ${(e as Error).message.slice(0, 60)}`);
        }
      })
    ),
    fetchRealYield(),
  ]);
  if (!real.latest) errors.push("FRED real-yield series unavailable");

  // 5 years of gold for the long-term regression channel
  try {
    const long = await getHistory("GC=F", "5y");
    goldCandles = long.candles;
  } catch (e) {
    errors.push(`GC=F 5y: ${(e as Error).message.slice(0, 60)}`);
  }

  const payload = buildGoldPayload(market, stats, real, goldCandles, errors);
  if (payload.items.length) goldCache.set(market, { at: Date.now(), payload });
  return payload;
}

/** USD-based FX via Yahoo as a fallback when frankfurter is unreachable. */
export async function yahooUsdRates(): Promise<{ INR?: number; CAD?: number }> {
  if (MOCK_ENABLED) return { INR: 87.2, CAD: 1.36 };
  const out: { INR?: number; CAD?: number } = {};
  try {
    const [inr, cad] = (await Promise.all([
      politely(() => yf.quote("USDINR=X", {}, NO_VALIDATE)),
      politely(() => yf.quote("USDCAD=X", {}, NO_VALIDATE)),
    ])) as [YFQuote, YFQuote];
    out.INR = inr.regularMarketPrice;
    out.CAD = cad.regularMarketPrice;
  } catch {
    // leave undefined; caller decides
  }
  return out;
}

/** True when an error message smells like Yahoo throttling (used by API routes). */
export function isThrottleError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("429") || m.includes("999") || m.includes("too many request");
}
