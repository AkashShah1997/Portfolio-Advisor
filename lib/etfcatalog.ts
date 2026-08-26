import type { Market } from "./store";

/**
 * Curated ETF alternatives catalog - the domain knowledge Yahoo can't provide:
 * which funds track the SAME exposure, and what they charge.
 *
 * MER figures are hand-checked against public fund pages/aggregators as of
 * MER_ASOF and deliberately treated as APPROXIMATE everywhere they're shown -
 * fee schedules change; the UI always says "confirm on the fund page".
 * Where Yahoo returns a live expense ratio for a fund, the live number wins.
 *
 * kind drives both the MER banding and the verdict rules:
 *   core       - broad-market building blocks (Bogle's default)
 *   satellite  - narrower bets (sector/theme/factor/dividend)
 *   commodity  - gold/silver: insurance, not an engine
 *   bond       - fixed income
 */

export const MER_ASOF = "mid-2026";

export interface CatalogOption {
  symbol: string; // Yahoo symbol, tradable on the market's exchange
  name: string;
  mer: number; // fraction per year, approximate
  note?: string;
}

export type EtfKind = "core" | "satellite" | "commodity" | "bond";

export interface EtfCategory {
  key: string;
  market: Market;
  label: string; // "Nifty 50 trackers"
  kind: EtfKind;
  match: RegExp; // tested against `${symbol} ${name} ${yahooCategory}`
  options: CatalogOption[];
  note?: string; // honest context for the category
}

/**
 * Order matters: narrower categories must come BEFORE broad ones
 * (e.g. "Nifty Next 50" and "Nifty Bank" before "Nifty 50").
 */
export const ETF_CATALOG: EtfCategory[] = [
  // ---------------- India ----------------
  {
    key: "in-gold",
    market: "india",
    label: "Gold ETFs",
    kind: "commodity",
    match: /gold/i,
    options: [
      { symbol: "GOLDBEES.NS", name: "Nippon India ETF Gold BeES", mer: 0.0082 },
      { symbol: "GOLDIETF.NS", name: "ICICI Prudential Gold ETF", mer: 0.005 },
      { symbol: "HDFCGOLD.NS", name: "HDFC Gold ETF", mer: 0.0059 },
    ],
    note:
      "Gold is portfolio insurance, not an engine - the masters cap it around 5–10%. For multi-year gold, also compare Sovereign Gold Bonds on the secondary market: zero annual fee plus 2.5%/yr interest (new issues are paused; liquidity varies).",
  },
  {
    key: "in-silver",
    market: "india",
    label: "Silver ETFs",
    kind: "commodity",
    match: /silver/i,
    options: [
      { symbol: "SILVERBEES.NS", name: "Nippon India Silver ETF", mer: 0.0056 },
      { symbol: "SILVERIETF.NS", name: "ICICI Prudential Silver ETF", mer: 0.004 },
    ],
    note: "Industrial-cycle commodity - more volatile than gold, same rule: a small slice at most.",
  },
  {
    key: "in-bank",
    market: "india",
    label: "Bank Nifty trackers",
    kind: "satellite",
    match: /bank/i,
    options: [
      { symbol: "BANKBEES.NS", name: "Nippon India ETF Nifty Bank BeES", mer: 0.0019 },
      { symbol: "BANKIETF.NS", name: "ICICI Prudential Nifty Bank ETF", mer: 0.0015 },
      { symbol: "SETFNIFBK.NS", name: "SBI Nifty Bank ETF", mer: 0.002 },
    ],
    note: "A single-sector bet that already overlaps the ~1/3 financials weight inside Nifty 50 funds.",
  },
  {
    key: "in-it",
    market: "india",
    label: "Nifty IT trackers",
    kind: "satellite",
    match: /\bit\b.*(etf|bees|index)|itbees|nifty it/i,
    options: [
      { symbol: "ITBEES.NS", name: "Nippon India ETF Nifty IT", mer: 0.0022 },
      { symbol: "ITIETF.NS", name: "ICICI Prudential Nifty IT ETF", mer: 0.002 },
    ],
  },
  {
    key: "in-next50",
    market: "india",
    label: "Nifty Next 50 trackers",
    kind: "core",
    match: /next\s*50|junior/i,
    options: [
      { symbol: "JUNIORBEES.NS", name: "Nippon India ETF Nifty Next 50 Junior BeES", mer: 0.0017 },
      { symbol: "UTINEXT50.NS", name: "UTI Nifty Next 50 ETF", mer: 0.0007 },
      { symbol: "SETFNN50.NS", name: "SBI Nifty Next 50 ETF", mer: 0.0015 },
    ],
  },
  {
    key: "in-midcap",
    market: "india",
    label: "Midcap 150 trackers",
    kind: "core",
    match: /midcap|mid\s*150/i,
    options: [
      { symbol: "MID150BEES.NS", name: "Nippon India ETF Nifty Midcap 150", mer: 0.0021 },
      { symbol: "MIDCAPIETF.NS", name: "ICICI Prudential Nifty Midcap 150 ETF", mer: 0.0015 },
    ],
  },
  {
    key: "in-intl-us",
    market: "india",
    label: "US / NASDAQ exposure from India",
    kind: "satellite",
    match: /nasdaq|n100|fang|s&p\s*500.*(fof|india)|mon100/i,
    options: [
      { symbol: "MON100.NS", name: "Motilal Oswal NASDAQ 100 ETF", mer: 0.0058 },
      { symbol: "MAFANG.NS", name: "Mirae Asset NYSE FANG+ ETF", mer: 0.0066 },
    ],
    note: "Overseas ETFs from India can trade at a premium/discount to NAV when RBI overseas-investment limits bind - check iNAV before buying.",
  },
  {
    key: "in-nifty50",
    market: "india",
    label: "Nifty 50 trackers",
    kind: "core",
    match: /nifty\s*50|nifty50|niftybees|\bnifty\b(?!.*(next|bank|it|midcap|small))/i,
    options: [
      { symbol: "NIFTYIETF.NS", name: "ICICI Prudential Nifty 50 ETF", mer: 0.0003 },
      { symbol: "NIFTYBEES.NS", name: "Nippon India ETF Nifty 50 BeES", mer: 0.0004 },
      { symbol: "SETFNIF50.NS", name: "SBI Nifty 50 ETF", mer: 0.0004 },
      { symbol: "HDFCNIFTY.NS", name: "HDFC Nifty 50 ETF", mer: 0.0005 },
    ],
    note: "The costs here are already tiny - liquidity (tight bid-ask spreads) matters as much as a basis point of MER. Nifty BeES is by far the most traded.",
  },

  // ---------------- Canada ----------------
  {
    key: "ca-gold",
    market: "canada",
    label: "Gold ETFs (CAD)",
    kind: "commodity",
    match: /gold/i,
    options: [
      { symbol: "KILO.TO", name: "Purpose Gold Bullion Fund", mer: 0.0028 },
      { symbol: "CGL.TO", name: "iShares Gold Bullion ETF", mer: 0.0055 },
    ],
    note: "Gold is insurance, not an engine - a 5–10% cap is the classic rule.",
  },
  {
    key: "ca-bond",
    market: "canada",
    label: "Canadian aggregate bonds",
    kind: "bond",
    match: /bond|aggregate|universe|fixed income/i,
    options: [
      { symbol: "ZAG.TO", name: "BMO Aggregate Bond Index ETF", mer: 0.0009 },
      { symbol: "VAB.TO", name: "Vanguard Canadian Aggregate Bond ETF", mer: 0.0009 },
      { symbol: "XBB.TO", name: "iShares Core Canadian Universe Bond ETF", mer: 0.001 },
    ],
  },
  {
    key: "ca-nasdaq",
    market: "canada",
    label: "NASDAQ-100 trackers (CAD)",
    kind: "satellite",
    match: /nasdaq/i,
    options: [
      { symbol: "ZNQ.TO", name: "BMO NASDAQ 100 Equity Index ETF", mer: 0.0035 },
      { symbol: "XQQ.TO", name: "iShares NASDAQ 100 Index ETF (CAD-Hedged)", mer: 0.0039 },
      { symbol: "ZQQ.TO", name: "BMO NASDAQ 100 Equity Hedged to CAD Index ETF", mer: 0.0039 },
    ],
    note: "Hedged (XQQ/ZQQ) vs unhedged (ZNQ) is a currency call, not a cost call - long holders often prefer unhedged.",
  },
  {
    key: "ca-dividend",
    market: "canada",
    label: "Canadian dividend ETFs",
    kind: "satellite",
    match: /dividend/i,
    options: [
      { symbol: "VDY.TO", name: "Vanguard FTSE Canadian High Dividend Yield ETF", mer: 0.0022 },
      { symbol: "XEI.TO", name: "iShares S&P/TSX Composite High Dividend ETF", mer: 0.0022 },
      { symbol: "ZDV.TO", name: "BMO Canadian Dividend ETF", mer: 0.0039 },
    ],
  },
  {
    key: "ca-sp500",
    market: "canada",
    label: "S&P 500 trackers (CAD)",
    kind: "core",
    match: /s&p\s*500|sp\s*500|500 index/i,
    options: [
      { symbol: "VFV.TO", name: "Vanguard S&P 500 Index ETF", mer: 0.0009 },
      { symbol: "ZSP.TO", name: "BMO S&P 500 Index ETF", mer: 0.0009 },
      { symbol: "XUS.TO", name: "iShares Core S&P 500 Index ETF", mer: 0.001 },
    ],
    note: "US-listed VOO is cheaper still (~0.03%) but adds USD conversion costs and US estate-tax paperwork - usually only worth it for large accounts.",
  },
  {
    key: "ca-allequity",
    market: "canada",
    label: "All-in-one equity portfolios",
    kind: "core",
    match: /all.?equity|equity etf portfolio|xeqt|veqt|zeqt/i,
    options: [
      { symbol: "XEQT.TO", name: "iShares Core Equity ETF Portfolio", mer: 0.002 },
      { symbol: "ZEQT.TO", name: "BMO All-Equity ETF", mer: 0.002 },
      { symbol: "VEQT.TO", name: "Vanguard All-Equity ETF Portfolio", mer: 0.0024 },
    ],
    note: "One fund, the whole world, auto-rebalanced - the strongest 'own it for decades and do nothing' instrument on the TSX.",
  },
  {
    key: "ca-intl",
    market: "canada",
    label: "Global ex-Canada equity",
    kind: "core",
    match: /all country|ex.?canada|global|world/i,
    options: [
      { symbol: "XAW.TO", name: "iShares Core MSCI All Country World ex Canada", mer: 0.0022 },
      { symbol: "VXC.TO", name: "Vanguard FTSE Global All Cap ex Canada", mer: 0.0021 },
    ],
  },
  {
    key: "ca-tsx",
    market: "canada",
    label: "Canadian broad-market trackers",
    kind: "core",
    match: /tsx|capped composite|canadian? (index|equity|all cap)|ftse canada/i,
    options: [
      { symbol: "VCN.TO", name: "Vanguard FTSE Canada All Cap Index ETF", mer: 0.0005 },
      { symbol: "XIC.TO", name: "iShares Core S&P/TSX Capped Composite", mer: 0.0006 },
      { symbol: "ZCN.TO", name: "BMO S&P/TSX Capped Composite Index ETF", mer: 0.0006 },
      { symbol: "XIU.TO", name: "iShares S&P/TSX 60 Index ETF", mer: 0.0018, note: "most liquid, but 3× the fee of XIC/VCN" },
    ],
  },
];

/** Match a held fund to its catalog category (symbol + name + Yahoo category). */
export function categoryOf(
  market: Market,
  symbol: string,
  name?: string,
  yahooCategory?: string
): EtfCategory | undefined {
  const hay = `${symbol} ${name ?? ""} ${yahooCategory ?? ""}`;
  return ETF_CATALOG.find((c) => c.market === market && c.match.test(hay));
}

/** Approximate MER from the catalog for a held symbol (used when Yahoo has none). */
export function catalogMer(symbol: string): { mer: number; name: string } | undefined {
  const up = symbol.toUpperCase();
  for (const c of ETF_CATALOG) {
    const hit = c.options.find((o) => o.symbol.toUpperCase() === up);
    if (hit) return { mer: hit.mer, name: hit.name };
  }
  return undefined;
}
