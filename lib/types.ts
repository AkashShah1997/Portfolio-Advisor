// ---------- Holdings ----------

export type Broker = "zerodha" | "wealthsimple" | "manual";

/** Broker-declared instrument type, normalized (EXCHANGE_TRADED_FUND → "ETF" etc.). */
export type SecurityType = "EQUITY" | "ETF" | "FUND" | "CURRENCY" | "OTHER";

export interface Holding {
  id: string;
  broker: Broker;
  rawSymbol: string; // as it appeared in the CSV
  yahooSymbol: string; // resolved symbol, e.g. RELIANCE.NS, SHOP.TO, AAPL
  name?: string;
  quantity: number;
  avgCost: number; // in the stock's trading currency
  currency: Currency; // trading currency of the stock
  validated?: boolean;
  watch?: boolean; // watchlist row — analyzed and scored, but carries no capital
  buyDate?: string; // YYYY-MM — when the position was (roughly) built; user-set, else estimated
  /** from the CSV's "Security Type" column when present — the authoritative ETF/stock flag */
  securityType?: SecurityType;
  /** account(s) the position sits in, e.g. "TFSA + RRSP" after a multi-account merge */
  account?: string;
}

export type Currency = "INR" | "CAD" | "USD";

// ---------- Per-year financials (from fundamentalsTimeSeries) ----------

export interface YearFinancials {
  year: number; // fiscal year label
  endDate: string; // ISO date
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  ebit?: number;
  pretaxIncome?: number;
  netIncome?: number;
  interestExpense?: number;
  equity?: number;
  totalDebt?: number;
  totalAssets?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  cash?: number;
  fcf?: number;
  ocf?: number;
  capex?: number;
  dilutedEPS?: number;
  basicEPS?: number;
  shares?: number;
}

export interface YearRatios {
  year: number;
  roe?: number; // netIncome / equity
  roce?: number; // ebit / (equity + totalDebt)
  roa?: number; // netIncome / totalAssets
  netMargin?: number;
  opMargin?: number;
  grossMargin?: number;
  debtToEquity?: number;
  interestCoverage?: number; // ebit / interestExpense
  currentRatio?: number;
  eps?: number;
  revenue?: number;
  netIncome?: number;
  fcf?: number;
  approxPE?: number; // fiscal-year-end price / diluted EPS
}

// ---------- Live quote & profile ----------

export interface QuoteInfo {
  symbol: string;
  name?: string;
  price?: number;
  currency?: Currency | string;
  quoteType?: string; // "EQUITY" | "ETF" | "MUTUALFUND" | …
  exchange?: string;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  epsTrailing?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  dividendYield?: number; // fraction, e.g. 0.012
  pegRatio?: number;
  sector?: string;
  industry?: string;
  country?: string;
  fcfTTM?: number;
  totalDebtNow?: number;
  totalCashNow?: number;
  roeTTM?: number; // fraction
  profitMarginTTM?: number; // fraction
  revenueGrowthTTM?: number; // fraction
  earningsGrowthTTM?: number; // fraction
  currentRatioNow?: number;
  debtToEquityNow?: number; // ratio (x), NOT percent
  payoutRatio?: number;
  // sell-side context (12-month view — shown as context only, never the thesis)
  targetMeanPrice?: number; // analyst consensus 12-mo price target
  recommendationKey?: string; // e.g. "strong_buy" | "buy" | "hold" | "underperform" | "sell"
  numberOfAnalystOpinions?: number;
}

export interface PricePoint {
  date: string; // ISO
  close: number;
}

export interface StockData {
  symbol: string;
  quote: QuoteInfo;
  years: YearFinancials[]; // ascending by year
  prices: PricePoint[]; // ~5y monthly closes
  fetchedAt: string;
  mock?: boolean;
  errors?: string[]; // non-fatal issues (e.g. fundamentals missing)
}

// ---------- Scorecard ----------

export type Pillar = "quality" | "fortress" | "growth" | "valuation";

export type CheckStatus = "pass" | "warn" | "fail" | "na";

export interface Check {
  id: string;
  pillar: Pillar;
  label: string;
  philosophy: string; // which investor principle this encodes
  status: CheckStatus;
  score: number; // 0..1 (na => excluded)
  weight: number;
  detail: string; // human-readable evidence
}

export interface PillarScore {
  pillar: Pillar;
  label: string;
  score: number; // 0..100 over applicable checks
  weight: number; // sum of applicable weights
  applicable: boolean;
}

export type Verdict =
  | "ADD_MORE"
  | "HOLD_QUALITY_PRICEY"
  | "HOLD"
  | "WATCH"
  | "REVIEW_EXIT"
  | "INSUFFICIENT_DATA";

export interface Scorecard {
  symbol: string;
  totalScore: number; // 0..100
  pillars: PillarScore[];
  checks: Check[];
  redFlags: string[];
  verdict: Verdict;
  verdictText: string;
  philosophyNote: string;
  isFinancialSector: boolean;
  ratios: YearRatios[];
  cagr: {
    revenue?: number;
    eps?: number;
    fcf?: number;
    years: number;
  };
  avgPE?: number; // historical average P/E over available years
  currentPE?: number;
}

export interface AnalyzedHolding {
  holding: Holding;
  data?: StockData;
  scorecard?: Scorecard;
  error?: string;
  // derived, in stock currency
  invested: number;
  currentValue?: number;
  pnl?: number;
  pnlPct?: number;
}

// ---------- FX ----------

export interface FxRates {
  // rate = 1 unit of currency in base currency
  base: Currency;
  rates: Record<Currency, number>;
  asOf: string;
  source: string;
}

// ---------- Portfolio-level ----------

export interface PortfolioSummary {
  baseCurrency: Currency;
  totalInvested: number;
  totalCurrent: number;
  totalPnl: number;
  totalPnlPct: number;
  byCountry: { label: string; value: number }[];
  bySector: { label: string; value: number }[];
  byVerdict: Record<Verdict, number>;
  topHoldingPct: number;
  weightedScore: number;
}
