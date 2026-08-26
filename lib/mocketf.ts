import type { EtfData } from "./etf";
import { hashSeed, mulberry } from "./mock";

/**
 * Deterministic mock fund payloads for MOCK_DATA=1 runs (offline dev, e2e).
 * Curated profiles mirror real funds closely enough to exercise every verdict
 * path: a rock-bottom core (NIFTYBEES), an expensive commodity (GOLDBEES),
 * all-in-one core (XEQT), S&P 500 core (VFV). Unknown symbols get a stable
 * generic equity-index profile.
 */

interface FundProfile {
  name: string;
  currency: string;
  family: string;
  category: string;
  mer: number;
  aum: number;
  fundYield?: number;
  y1: number;
  y3: number;
  y5: number;
  top?: { name: string; symbol?: string; weight: number }[];
  sectors?: { label: string; weight: number }[];
  split?: { stock?: number; bond?: number; cash?: number };
  price: number;
}

const FUNDS: Record<string, FundProfile> = {
  "NIFTYBEES.NS": {
    name: "Nippon India ETF Nifty 50 BeES",
    currency: "INR",
    family: "Nippon India Mutual Fund",
    category: "Large-Cap Index (Nifty 50)",
    mer: 0.0004,
    aum: 6.68e11, // ~₹66,800 Cr
    fundYield: 0.011,
    y1: 0.11,
    y3: 0.135,
    y5: 0.128,
    top: [
      { name: "HDFC Bank Ltd", symbol: "HDFCBANK.NS", weight: 0.121 },
      { name: "Reliance Industries", symbol: "RELIANCE.NS", weight: 0.093 },
      { name: "ICICI Bank Ltd", symbol: "ICICIBANK.NS", weight: 0.086 },
      { name: "Infosys Ltd", symbol: "INFY.NS", weight: 0.056 },
      { name: "Bharti Airtel", symbol: "BHARTIARTL.NS", weight: 0.043 },
      { name: "TCS Ltd", symbol: "TCS.NS", weight: 0.039 },
      { name: "Larsen & Toubro", symbol: "LT.NS", weight: 0.037 },
      { name: "ITC Ltd", symbol: "ITC.NS", weight: 0.034 },
      { name: "Axis Bank", symbol: "AXISBANK.NS", weight: 0.03 },
      { name: "Kotak Mahindra Bank", symbol: "KOTAKBANK.NS", weight: 0.028 },
    ],
    sectors: [
      { label: "Financial Services", weight: 0.34 },
      { label: "Technology", weight: 0.13 },
      { label: "Energy", weight: 0.11 },
      { label: "Consumer Defensive", weight: 0.08 },
      { label: "Industrials", weight: 0.07 },
    ],
    split: { stock: 0.998, cash: 0.002 },
    price: 285,
  },
  "GOLDBEES.NS": {
    name: "Nippon India ETF Gold BeES",
    currency: "INR",
    family: "Nippon India Mutual Fund",
    category: "Commodities - Gold",
    mer: 0.0082,
    aum: 2.3e11,
    y1: 0.27,
    y3: 0.185,
    y5: 0.155,
    top: [],
    sectors: [],
    split: { stock: 0, cash: 0.01 },
    price: 66,
  },
  "JUNIORBEES.NS": {
    name: "Nippon India ETF Nifty Next 50 Junior BeES",
    currency: "INR",
    family: "Nippon India Mutual Fund",
    category: "Large-Cap Index (Nifty Next 50)",
    mer: 0.0017,
    aum: 4.2e10,
    fundYield: 0.008,
    y1: 0.07,
    y3: 0.15,
    y5: 0.13,
    split: { stock: 0.997, cash: 0.003 },
    price: 720,
  },
  "XEQT.TO": {
    name: "iShares Core Equity ETF Portfolio",
    currency: "CAD",
    family: "iShares (BlackRock)",
    category: "Global Equity Balanced",
    mer: 0.002,
    aum: 8.2e9,
    fundYield: 0.017,
    y1: 0.14,
    y3: 0.12,
    y5: 0.11,
    top: [
      { name: "iShares Core S&P Total US Stock (ITOT)", weight: 0.44 },
      { name: "iShares S&P/TSX Capped Composite (XIC)", weight: 0.24 },
      { name: "iShares MSCI EAFE (XEF)", weight: 0.24 },
      { name: "iShares Core MSCI Emerging (XEC)", weight: 0.05 },
    ],
    sectors: [
      { label: "Technology", weight: 0.24 },
      { label: "Financial Services", weight: 0.2 },
      { label: "Industrials", weight: 0.11 },
      { label: "Healthcare", weight: 0.09 },
    ],
    split: { stock: 0.995, cash: 0.005 },
    price: 29,
  },
  "VFV.TO": {
    name: "Vanguard S&P 500 Index ETF",
    currency: "CAD",
    family: "Vanguard Investments Canada",
    category: "US Equity Index (S&P 500)",
    mer: 0.0009,
    aum: 2.1e10,
    fundYield: 0.011,
    y1: 0.18,
    y3: 0.14,
    y5: 0.135,
    sectors: [
      { label: "Technology", weight: 0.32 },
      { label: "Financial Services", weight: 0.13 },
      { label: "Healthcare", weight: 0.11 },
    ],
    split: { stock: 0.998, cash: 0.002 },
    price: 148,
  },
};

export function mockEtfData(symbol: string): EtfData {
  const up = symbol.toUpperCase();
  const p = FUNDS[up] ?? genericFund(up);
  const rnd = mulberry(hashSeed(up + "etf"));
  const nowYear = new Date().getUTCFullYear();
  const annual: { year: number; ret: number }[] = [];
  for (let i = 5; i >= 1; i--) {
    annual.push({ year: nowYear - i, ret: p.y5 + (rnd() - 0.45) * 0.18 });
  }
  return {
    symbol,
    name: p.name,
    price: p.price,
    currency: p.currency,
    quoteType: "ETF",
    family: p.family,
    category: p.category,
    legalType: "Exchange Traded Fund",
    mer: p.mer,
    aum: p.aum,
    fundYield: p.fundYield,
    ytd: p.y1 * 0.6,
    trailing: { y1: p.y1, y3: p.y3, y5: p.y5 },
    annual,
    risk: { beta: 0.95 + rnd() * 0.15, stdDev: 0.12 + rnd() * 0.06, sharpe: 0.7 + rnd() * 0.5 },
    top: p.top ?? [],
    topWeight: p.top?.length ? p.top.reduce((a, h) => a + h.weight, 0) : undefined,
    sectors: p.sectors ?? [],
    split: p.split ?? { stock: 1 },
    fetchedAt: new Date().toISOString(),
    mock: true,
  };
}

function genericFund(symbol: string): FundProfile {
  const rnd = mulberry(hashSeed(symbol));
  const inr = symbol.endsWith(".NS") || symbol.endsWith(".BO");
  return {
    name: `${symbol.split(".")[0]} Index ETF (Demo)`,
    currency: inr ? "INR" : symbol.endsWith(".TO") ? "CAD" : "USD",
    family: "Demo AMC",
    category: "Equity Index",
    mer: 0.0005 + rnd() * 0.006,
    aum: (inr ? 1e9 : 5e7) * (1 + rnd() * 400),
    fundYield: rnd() * 0.02,
    y1: 0.02 + rnd() * 0.2,
    y3: 0.06 + rnd() * 0.12,
    y5: 0.07 + rnd() * 0.1,
    split: { stock: 0.99, cash: 0.01 },
    price: 50 + rnd() * 400,
  };
}
