import type { PricePoint, StockData, YearFinancials } from "./types";
import type { Candle, HistoryRange } from "./history";

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
};

/** Small deterministic PRNG so unknown symbols still get stable, plausible data. */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry(seed: number) {
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
  const price = Math.max(1, eps * p.pe);

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
    },
    years,
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
