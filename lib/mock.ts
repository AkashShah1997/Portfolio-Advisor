import type { PricePoint, StockData, YearFinancials } from "./types";
import type { Candle, HistoryRange } from "./history";
import { SUPERINVESTORS, type InvestorMoves, type Move } from "./thirteenf";
import type { OwnershipPayload } from "./ownership";

/**
 * Deterministic mock data so the whole app can be exercised without network
 * access (e.g. in a sandboxed dev environment). NEVER enabled unless
 * MOCK_DATA=1 is set — production on Vercel uses live Yahoo Finance data.
 */
export const MOCK_ENABLED = process.env.MOCK_DATA === "1";

interface Profile {
  name: string;
  sector: string;
  industry: string;
  currency: "INR" | "CAD" | "USD";
  baseRevenue: number; // latest-year revenue, native units
  revGrowth: number; // avg annual growth
  netMargin: number;
  roe: number;
  debtToEquity: number;
  pe: number;
  growthNoise: number; // volatility of growth between years
  lossYear?: number; // index (0..4) of a loss-making year, if any
  divYield?: number;
  shares?: number; // shares outstanding, for realistic per-share numbers
  px?: number; // fixed quote price override (used for ETF units)
  etf?: boolean; // marks an exchange-traded fund (quoteType ETF)
}

const CURATED: Record<string, Profile> = {
  "RELIANCE.NS": { name: "Reliance Industries Ltd", sector: "Energy", industry: "Oil & Gas Refining", currency: "INR", baseRevenue: 9.7e12, revGrowth: 0.09, netMargin: 0.075, roe: 0.095, debtToEquity: 0.44, pe: 24, growthNoise: 0.05, divYield: 0.004, shares: 6.77e9 },
  "TCS.NS": { name: "Tata Consultancy Services", sector: "Technology", industry: "IT Services", currency: "INR", baseRevenue: 2.55e12, revGrowth: 0.1, netMargin: 0.19, roe: 0.46, debtToEquity: 0.08, pe: 27, growthNoise: 0.03, divYield: 0.017, shares: 3.62e9 },
  "HDFCBANK.NS": { name: "HDFC Bank Ltd", sector: "Financial Services", industry: "Banks — Regional", currency: "INR", baseRevenue: 2.8e12, revGrowth: 0.16, netMargin: 0.22, roe: 0.155, debtToEquity: 6.8, pe: 19, growthNoise: 0.04, divYield: 0.011, shares: 7.6e9 },
  "INFY.NS": { name: "Infosys Ltd", sector: "Technology", industry: "IT Services", currency: "INR", baseRevenue: 1.6e12, revGrowth: 0.09, netMargin: 0.165, roe: 0.31, debtToEquity: 0.09, pe: 24, growthNoise: 0.04, divYield: 0.026, shares: 4.15e9 },
  "TATAMOTORS.NS": { name: "Tata Motors Ltd", sector: "Consumer Cyclical", industry: "Auto Manufacturers", currency: "INR", baseRevenue: 4.4e12, revGrowth: 0.11, netMargin: 0.05, roe: 0.28, debtToEquity: 1.1, pe: 9, growthNoise: 0.12, lossYear: 1, divYield: 0.006, shares: 3.68e9 },
  "ITC.NS": { name: "ITC Ltd", sector: "Consumer Defensive", industry: "Tobacco / FMCG", currency: "INR", baseRevenue: 0.72e12, revGrowth: 0.08, netMargin: 0.27, roe: 0.28, debtToEquity: 0.02, pe: 25, growthNoise: 0.04, divYield: 0.033, shares: 12.5e9 },
  "SHOP.TO": { name: "Shopify Inc", sector: "Technology", industry: "Software — Application", currency: "CAD", baseRevenue: 12.3e9, revGrowth: 0.24, netMargin: 0.13, roe: 0.12, debtToEquity: 0.1, pe: 58, growthNoise: 0.08, lossYear: 1, shares: 1.29e9 },
  "RY.TO": { name: "Royal Bank of Canada", sector: "Financial Services", industry: "Banks — Diversified", currency: "CAD", baseRevenue: 62e9, revGrowth: 0.07, netMargin: 0.26, roe: 0.145, debtToEquity: 9.5, pe: 13.5, growthNoise: 0.04, divYield: 0.034, shares: 1.41e9 },
  "ENB.TO": { name: "Enbridge Inc", sector: "Energy", industry: "Oil & Gas Midstream", currency: "CAD", baseRevenue: 55e9, revGrowth: 0.05, netMargin: 0.11, roe: 0.095, debtToEquity: 1.35, pe: 19, growthNoise: 0.06, divYield: 0.061, shares: 2.18e9 },
  "CNR.TO": { name: "Canadian National Railway", sector: "Industrials", industry: "Railroads", currency: "CAD", baseRevenue: 17.5e9, revGrowth: 0.05, netMargin: 0.31, roe: 0.27, debtToEquity: 0.95, pe: 19, growthNoise: 0.04, divYield: 0.022, shares: 0.63e9 },
  AAPL: { name: "Apple Inc", sector: "Technology", industry: "Consumer Electronics", currency: "USD", baseRevenue: 405e9, revGrowth: 0.05, netMargin: 0.25, roe: 1.4, debtToEquity: 1.6, pe: 32, growthNoise: 0.04, divYield: 0.005, shares: 15.0e9 },
  MSFT: { name: "Microsoft Corp", sector: "Technology", industry: "Software — Infrastructure", currency: "USD", baseRevenue: 280e9, revGrowth: 0.14, netMargin: 0.35, roe: 0.36, debtToEquity: 0.3, pe: 35, growthNoise: 0.03, divYield: 0.007, shares: 7.43e9 },
  // ETF units — the stock pipeline only needs a name/price (the scorecard says
  // "insufficient data" by design); real fund analysis lives in mocketf.ts.
  "NIFTYBEES.NS": { name: "Nippon India ETF Nifty 50 BeES", sector: "ETF", industry: "Index ETF — Nifty 50", currency: "INR", baseRevenue: 1e9, revGrowth: 0.1, netMargin: 0.1, roe: 0.1, debtToEquity: 0, pe: 20, growthNoise: 0.02, divYield: 0.01, px: 285, etf: true },
  "GOLDBEES.NS": { name: "Nippon India ETF Gold BeES", sector: "ETF", industry: "Commodity ETF — Gold", currency: "INR", baseRevenue: 1e9, revGrowth: 0.08, netMargin: 0.1, roe: 0.1, debtToEquity: 0, pe: 20, growthNoise: 0.02, px: 66, etf: true },
  "XEQT.TO": { name: "iShares Core Equity ETF Portfolio", sector: "ETF", industry: "All-Equity Portfolio ETF", currency: "CAD", baseRevenue: 1e9, revGrowth: 0.09, netMargin: 0.1, roe: 0.1, debtToEquity: 0, pe: 18, growthNoise: 0.02, divYield: 0.017, px: 29, etf: true },
  "VFV.TO": { name: "Vanguard S&P 500 Index ETF", sector: "ETF", industry: "Index ETF — S&P 500", currency: "CAD", baseRevenue: 1e9, revGrowth: 0.11, netMargin: 0.1, roe: 0.1, debtToEquity: 0, pe: 22, growthNoise: 0.02, divYield: 0.011, px: 148, etf: true },
};

/** Small deterministic PRNG so unknown symbols still get stable, plausible data. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genericProfile(symbol: string): Profile {
  const rnd = mulberry(hashSeed(symbol));
  const currency = symbol.endsWith(".NS") || symbol.endsWith(".BO") ? "INR" : symbol.endsWith(".TO") || symbol.endsWith(".V") ? "CAD" : "USD";
  const scale = currency === "INR" ? 1e11 + rnd() * 2e12 : 2e9 + rnd() * 60e9;
  const sectors = ["Technology", "Industrials", "Consumer Defensive", "Healthcare", "Consumer Cyclical", "Basic Materials", "Energy", "Communication Services"];
  return {
    name: `${symbol.split(".")[0]} (Demo Co)`,
    sector: sectors[Math.floor(rnd() * sectors.length)],
    industry: "Diversified",
    currency,
    baseRevenue: scale,
    revGrowth: 0.03 + rnd() * 0.15,
    netMargin: 0.05 + rnd() * 0.2,
    roe: 0.08 + rnd() * 0.25,
    debtToEquity: rnd() * 1.4,
    pe: 12 + rnd() * 30,
    growthNoise: 0.02 + rnd() * 0.08,
    lossYear: rnd() < 0.15 ? Math.floor(rnd() * 3) : undefined,
    divYield: rnd() < 0.6 ? rnd() * 0.04 : undefined,
  };
}

export function mockStockData(symbol: string): StockData {
  const p = CURATED[symbol.toUpperCase()] ?? genericProfile(symbol);
  const rnd = mulberry(hashSeed(symbol + "x"));
  const nowYear = new Date().getUTCFullYear();
  const isIndian = p.currency === "INR";
  const fiscalMonth = isIndian ? "03-31" : "12-31";
  const NYEARS = 5;

  // Build revenue path backwards from latest.
  const years: YearFinancials[] = [];
  let rev = p.baseRevenue;
  const revs: number[] = [];
  for (let i = 0; i < NYEARS; i++) {
    revs.unshift(rev);
    const g = p.revGrowth + (rnd() - 0.5) * 2 * p.growthNoise;
    rev = rev / (1 + g);
  }

  const isFin = p.sector === "Financial Services";
  const sharesBase = p.shares ?? (isIndian ? 3.5e9 : 1.2e9);

  for (let i = 0; i < NYEARS; i++) {
    const y = nowYear - (NYEARS - 1 - i) - (isIndian ? 0 : 1);
    const revenue = revs[i];
    const marginDrift = 1 + (rnd() - 0.5) * 0.15;
    let netIncome = revenue * p.netMargin * marginDrift;
    if (p.lossYear === i) netIncome = -Math.abs(netIncome) * 0.35;
    const equity = p.roe > 0 ? netIncome / (p.roe * marginDrift) : revenue * 0.4;
    const eqAbs = Math.abs(equity);
    const totalDebt = eqAbs * p.debtToEquity;
    const ebit = netIncome * 1.35 + totalDebt * 0.05;
    const interestExpense = totalDebt * 0.065 || undefined;
    const ocf = netIncome * (1.1 + rnd() * 0.3);
    const capex = -revenue * (isFin ? 0.01 : 0.05 + rnd() * 0.04);
    const shares = sharesBase * (1 - i * 0.003);
    years.push({
      year: y,
      endDate: `${y}-${fiscalMonth}`,
      revenue,
      grossProfit: revenue * (isFin ? 0.8 : 0.35 + rnd() * 0.2),
      operatingIncome: ebit * 0.95,
      ebit,
      pretaxIncome: netIncome * 1.32,
      netIncome,
      interestExpense,
      equity: eqAbs,
      totalDebt,
      totalAssets: eqAbs * (isFin ? 11 : 1 + p.debtToEquity + 0.6),
      currentAssets: isFin ? undefined : revenue * 0.35,
      currentLiabilities: isFin ? undefined : revenue * 0.24,
      cash: eqAbs * 0.2,
      fcf: ocf + capex,
      ocf,
      capex,
      dilutedEPS: netIncome / shares,
      basicEPS: netIncome / shares,
      shares,
    });
  }

  const latest = years[years.length - 1];
  const eps = latest.dilutedEPS ?? 1;
  const price = p.px ?? Math.max(1, eps * p.pe);

  // 5y monthly price path ending at `price`.
  const prices: PricePoint[] = [];
  const months = 61;
  const totalGrowth = Math.pow(1 + p.revGrowth, 5) * (p.pe > 30 ? 1.25 : 1);
  let pv = price / totalGrowth;
  const prnd = mulberry(hashSeed(symbol + "px"));
  const now = new Date();
  for (let m = months - 1; m >= 0; m--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    prices.push({ date: d.toISOString().slice(0, 10), close: Math.max(0.5, pv) });
    const drift = Math.pow(totalGrowth, 1 / months);
    pv = pv * drift * (1 + (prnd() - 0.5) * 0.12);
  }
  prices[prices.length - 1].close = price;

  const epsCagr =
    years[0].dilutedEPS && latest.dilutedEPS && years[0].dilutedEPS > 0
      ? Math.pow(latest.dilutedEPS / years[0].dilutedEPS, 1 / (NYEARS - 1)) - 1
      : p.revGrowth;

  return {
    symbol,
    quote: {
      symbol,
      name: p.name,
      price,
      currency: p.currency,
      quoteType: p.etf ? "ETF" : "EQUITY",
      exchange: symbol.endsWith(".NS") ? "NSE" : symbol.endsWith(".TO") ? "Toronto" : "NasdaqGS",
      marketCap: price * (latest.shares ?? 1e9),
      trailingPE: p.pe,
      forwardPE: p.pe * 0.9,
      priceToBook: latest.equity && latest.shares ? price / (latest.equity / latest.shares) : undefined,
      epsTrailing: eps,
      fiftyTwoWeekHigh: price * 1.18,
      fiftyTwoWeekLow: price * 0.74,
      dividendYield: p.divYield,
      pegRatio: epsCagr > 0 ? p.pe / (epsCagr * 100) : undefined,
      sector: p.sector,
      industry: p.industry,
      country: p.currency === "INR" ? "India" : p.currency === "CAD" ? "Canada" : "United States",
      fcfTTM: latest.fcf,
      totalDebtNow: latest.totalDebt,
      totalCashNow: latest.cash,
      roeTTM: p.roe,
      profitMarginTTM: p.netMargin,
      revenueGrowthTTM: p.revGrowth,
      earningsGrowthTTM: epsCagr,
      currentRatioNow: latest.currentAssets && latest.currentLiabilities ? latest.currentAssets / latest.currentLiabilities : undefined,
      debtToEquityNow: p.debtToEquity,
      // payout ≈ DPS/EPS = dividendYield × P/E, capped at a plausible level
      payoutRatio: p.divYield ? Math.min(0.85, p.divYield * p.pe) : 0,
      // deterministic sell-side context: target tracks quality, count tracks size
      targetMeanPrice: p.etf ? undefined : price * (p.roe >= 0.15 ? 1.12 : 0.97),
      recommendationKey: p.etf ? undefined : p.roe >= 0.15 ? "buy" : "hold",
      numberOfAnalystOpinions: p.etf ? undefined : 8 + (hashSeed(symbol) % 25),
    },
    // fund units carry no company statements — the ETFs tab judges them instead
    years: p.etf ? [] : years,
    prices,
    fetchedAt: new Date().toISOString(),
    mock: true,
  };
}

/** Deterministic OHLCV history for the interactive chart in mock mode. */
export function mockHistory(symbol: string, range: HistoryRange): Candle[] {
  const cfg: Record<HistoryRange, { points: number; stepDays: number; vol: number }> = {
    "6m": { points: 128, stepDays: 1, vol: 0.016 },
    "1y": { points: 252, stepDays: 1, vol: 0.016 },
    "3y": { points: 156, stepDays: 7, vol: 0.032 },
    "5y": { points: 260, stepDays: 7, vol: 0.032 },
    max: { points: 180, stepDays: 30, vol: 0.06 },
  };
  const { points, stepDays, vol } = cfg[range];
  const base = mockStockData(symbol);
  const endPrice = base.quote.price ?? 100;
  const p = CURATED[symbol.toUpperCase()] ?? genericProfile(symbol);
  const rnd = mulberry(hashSeed(symbol + "|hist|" + range));

  const spanYears = (points * stepDays) / 365.25;
  const totalGrowth = Math.pow(1 + p.revGrowth, spanYears);
  const stepDrift = Math.pow(totalGrowth, 1 / points);

  // build closes backwards from endPrice
  const closes: number[] = new Array(points);
  let px = endPrice;
  for (let i = points - 1; i >= 0; i--) {
    closes[i] = px;
    px = (px / stepDrift) * (1 + (rnd() - 0.5) * vol);
    px = Math.max(0.5, px);
  }

  // build the date axis: true business days for daily data, arithmetic steps otherwise
  const now = new Date();
  const dates: string[] = [];
  if (stepDays === 1) {
    const d = new Date(now);
    while (dates.length < points) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() - 1);
    }
    dates.reverse();
  } else {
    for (let i = points - 1; i >= 0; i--) {
      dates.push(new Date(now.getTime() - i * stepDays * 24 * 3600 * 1000).toISOString().slice(0, 10));
    }
  }

  const candles: Candle[] = [];
  const volBase = (p.shares ?? 1e9) / 500;
  for (let i = 0; i < points; i++) {
    const close = closes[i];
    const open = i === 0 ? close * (1 + (rnd() - 0.5) * vol * 0.5) : closes[i - 1];
    const hi = Math.max(open, close) * (1 + rnd() * vol * 0.6);
    const lo = Math.min(open, close) * (1 - rnd() * vol * 0.6);
    candles.push({
      time: dates[i],
      open,
      high: hi,
      low: lo,
      close,
      volume: Math.round(volBase * (0.6 + rnd() * 0.9)),
    });
  }
  const seen = new Set<string>();
  return candles.filter((c) => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  });
}

/** Deterministic superinvestor moves for offline/demo mode. */
export function mockSmartMoves(): InvestorMoves[] {
  const mv = (issuer: string, ticker: string, weightPct: number, sharesChangePct?: number, prevWeightPct?: number): Move => ({
    issuer,
    cusip: ticker.padEnd(9, "0"),
    ticker,
    valueUsd: weightPct * 1e9,
    weightPct,
    sharesChangePct,
    prevWeightPct,
  });
  return [
    {
      cik: "0001067983",
      name: "Berkshire Hathaway",
      manager: "Warren Buffett",
      blurb: "The reference compounder — durable moats held for decades.",
      record: "~20%/yr over ~60 years",
      quarter: "2026-06-30",
      prevQuarter: "2026-03-31",
      filedAt: "2026-08-14",
      aumUsd: 285e9,
      positionsCount: 41,
      top: [mv("APPLE INC", "AAPL", 0.242, 0, 0.251), mv("AMERICAN EXPRESS CO", "AXP", 0.121, 0, 0.118), mv("COCA COLA CO", "KO", 0.093, 0, 0.095), mv("UNION PAC CORP", "UNP", 0.041, 0.6, 0.026)],
      newBuys: [mv("UNITEDHEALTH GROUP INC", "UNH", 0.018), mv("DEERE & CO", "DE", 0.009)],
      adds: [mv("UNION PAC CORP", "UNP", 0.041, 0.62, 0.026), mv("CHUBB LIMITED", "CB", 0.031, 0.28, 0.025)],
      trims: [mv("BANK AMER CORP", "BAC", 0.062, -0.31, 0.089)],
      exits: [mv("CITIGROUP INC", "C", 0.012)],
    },
    {
      cik: "0001569205",
      name: "Fundsmith LLP",
      manager: "Terry Smith",
      blurb: "Buy good companies, don't overpay, do nothing.",
      record: "top-decile global quality since 2010",
      quarter: "2026-06-30",
      prevQuarter: "2026-03-31",
      filedAt: "2026-08-12",
      aumUsd: 24e9,
      positionsCount: 26,
      top: [mv("MICROSOFT CORP", "MSFT", 0.09, 0, 0.088), mv("STRYKER CORP", "SYK", 0.075, 0, 0.074), mv("AUTOMATIC DATA PROCESSING", "ADP", 0.071, 0.05, 0.069)],
      newBuys: [mv("UNION PAC CORP", "UNP", 0.024), mv("IDEXX LABS INC", "IDXX", 0.021)],
      adds: [mv("TEXAS INSTRS INC", "TXN", 0.048, 0.33, 0.036)],
      trims: [mv("PEPSICO INC", "PEP", 0.03, -0.25, 0.041)],
      exits: [mv("BROWN FORMAN CORP", "BF.B", 0.014)],
    },
    {
      cik: "0001112520",
      name: "Akre Capital Management",
      manager: "Chuck Akre (legacy team)",
      blurb: "Compounding machines: high ROE + reinvestment runway.",
      record: "multi-decade compounding record",
      quarter: "2026-06-30",
      prevQuarter: "2026-03-31",
      filedAt: "2026-08-11",
      aumUsd: 11e9,
      positionsCount: 18,
      top: [mv("MASTERCARD INC", "MA", 0.16, 0, 0.158), mv("MOODYS CORP", "MCO", 0.14, 0, 0.139), mv("O REILLY AUTOMOTIVE INC", "ORLY", 0.11, 0.02, 0.108)],
      newBuys: [mv("UNITEDHEALTH GROUP INC", "UNH", 0.012)],
      adds: [mv("KKR & CO INC", "KKR", 0.065, 0.21, 0.052)],
      trims: [],
      exits: [],
    },
  ];
}

/** Per-investor mock: curated trio above, deterministic generics for the rest of the bench. */
export function mockInvestorMoves(cik: string): InvestorMoves {
  const curated = mockSmartMoves().find((i) => i.cik === cik);
  if (curated) return { ...curated, mock: true };
  const inv = SUPERINVESTORS.find((s) => s.cik === cik) ?? {
    cik,
    name: `Filer ${cik}`,
    manager: "",
    blurb: "",
    record: "",
  };
  const rnd = mulberry(hashSeed(cik));
  const POOL: [string, string][] = [
    ["MASTERCARD INC", "MA"],
    ["VISA INC", "V"],
    ["ALPHABET INC", "GOOGL"],
    ["AMAZON COM INC", "AMZN"],
    ["MOODYS CORP", "MCO"],
    ["HEICO CORP", "HEI"],
    ["ORACLE CORP", "ORCL"],
    ["UNITEDHEALTH GROUP INC", "UNH"],
    ["INTERCONTINENTAL EXCH INC", "ICE"],
    ["DANAHER CORP", "DHR"],
  ];
  const pick = (n: number, offset: number): Move[] => {
    const start = Math.floor(rnd() * POOL.length);
    return Array.from({ length: n }, (_, i) => {
      const [issuer, ticker] = POOL[(start + offset + i * 3) % POOL.length];
      const weightPct = 0.03 + rnd() * 0.12;
      return {
        issuer,
        ticker,
        cusip: (ticker + cik.slice(-3)).padEnd(9, "0"),
        valueUsd: weightPct * 5e9,
        weightPct,
        sharesChangePct: rnd() * 0.5,
        prevWeightPct: weightPct * (0.7 + rnd() * 0.3),
      };
    });
  };
  return {
    ...inv,
    quarter: "2026-06-30",
    prevQuarter: "2026-03-31",
    filedAt: "2026-08-13",
    aumUsd: 3e9 + rnd() * 30e9,
    positionsCount: 12 + Math.floor(rnd() * 30),
    top: pick(4, 0).map((m) => ({ ...m, sharesChangePct: 0 })),
    newBuys: pick(1 + Math.floor(rnd() * 2), 1),
    adds: pick(1, 5),
    trims: pick(1, 7).map((m) => ({ ...m, sharesChangePct: -0.3 })),
    exits: [],
    mock: true,
  };
}

/** Deterministic fund/institution ownership for offline/demo mode. */
export function mockOwnership(symbol: string): OwnershipPayload {
  const rnd = mulberry(hashSeed(symbol + "|own"));
  const isIndia = symbol.toUpperCase().endsWith(".NS") || symbol.toUpperCase().endsWith(".BO");
  const fundNames = isIndia
    ? ["SBI Bluechip Fund", "ICICI Pru Bluechip Fund", "HDFC Flexi Cap Fund", "Axis Long Term Equity", "Mirae Asset Large Cap", "UTI Nifty Index Fund"]
    : ["Vanguard Total Stock Market Index", "Vanguard 500 Index Fund", "Fidelity 500 Index Fund", "iShares Core S&P 500 ETF", "T. Rowe Price Blue Chip Growth", "American Funds Growth Fund"];
  const instNames = isIndia
    ? ["Life Insurance Corp of India", "SBI Funds Management", "ICICI Prudential AMC", "HDFC AMC", "Government Pension Fund Global", "Vanguard Group"]
    : ["Vanguard Group Inc", "BlackRock Inc", "State Street Corp", "FMR LLC (Fidelity)", "Geode Capital Management", "Norges Bank Investment Mgmt"];
  const mkList = (names: string[], base: number) =>
    names.map((organization, i) => ({
      organization,
      pctHeld: Math.max(0.002, base - i * 0.004 + rnd() * 0.002),
      position: Math.round(1e7 * (1 + rnd())),
      value: Math.round(1e9 * (1 + rnd() * 4)),
      reportDate: "2026-06-30",
    }));
  return {
    symbol,
    breakdown: {
      insidersPct: isIndia ? 0.45 + rnd() * 0.1 : 0.01 + rnd() * 0.05,
      institutionsPct: isIndia ? 0.2 + rnd() * 0.15 : 0.6 + rnd() * 0.25,
      institutionsFloatPct: isIndia ? undefined : 0.65 + rnd() * 0.25,
      institutionsCount: Math.round(800 + rnd() * 3000),
    },
    funds: mkList(fundNames, isIndia ? 0.022 : 0.035),
    institutions: mkList(instNames, isIndia ? 0.03 : 0.08),
    mock: true,
  };
}
