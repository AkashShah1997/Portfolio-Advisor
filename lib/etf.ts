/**
 * ETF data model + pure mapping — client-safe (no yahoo import here, so tests
 * and components can use it; the server fetch lives in lib/yahoo.ts).
 *
 * Yahoo's fund modules (fundProfile / topHoldings / fundPerformance /
 * defaultKeyStatistics) carry what actually matters for a passive holder:
 * the expense ratio (MER), AUM, category, trailing & annual returns, top-10
 * concentration and sector weights. Coverage is good for US/Canadian ETFs and
 * patchier for NSE ETFs — missing fields stay undefined and the UI says so.
 */

export interface EtfTopHolding {
  symbol?: string;
  name: string;
  weight: number; // fraction
}

export interface EtfData {
  symbol: string;
  name?: string;
  price?: number;
  currency?: string;
  quoteType?: string;
  family?: string; // fund house (Nippon, Vanguard…)
  category?: string; // Yahoo's category name, as-is
  legalType?: string;
  mer?: number; // annual report expense ratio, fraction per year
  netExpenseRatio?: number;
  aum?: number; // total net assets, fund currency
  fundYield?: number; // trailing yield, fraction
  ytd?: number;
  trailing: { y1?: number; y3?: number; y5?: number; y10?: number }; // annualized
  annual: { year: number; ret: number }[]; // calendar-year total returns
  risk?: { beta?: number; stdDev?: number; sharpe?: number }; // 3-year
  top: EtfTopHolding[];
  topWeight?: number; // sum of listed top holdings
  sectors: { label: string; weight: number }[];
  split: { stock?: number; bond?: number; cash?: number };
  holdingsPE?: number; // P/E of the underlying basket
  fetchedAt: string;
  mock?: boolean;
  errors?: string[];
}

/** Is this holding an ETF/fund? quoteType is authoritative; names/symbols as fallback. */
export function isEtfHolding(symbol: string, name?: string, quoteType?: string): boolean {
  if (quoteType === "ETF" || quoteType === "MUTUALFUND") return true;
  if (quoteType && quoteType !== "EQUITY") return false; // e.g. INDEX, CRYPTO — not fund units
  const base = symbol.split(".")[0].toUpperCase();
  if (/BEES$/.test(base) || /IETF$/.test(base) || /^MON\d/.test(base) || /ETF$/.test(base)) return true;
  return name
    ? /\betf\b|exchange.?traded|\bbees\b|index fund|fund of fund|etf portfolio/i.test(name)
    : false;
}

// ---------- tolerant mapping of Yahoo's fund modules ----------

/** Yahoo sometimes returns plain numbers, sometimes { raw, fmt }. */
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in v) {
    const r = (v as { raw?: unknown }).raw;
    if (typeof r === "number" && Number.isFinite(r)) return r;
  }
  return undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

const SECTOR_LABEL: Record<string, string> = {
  realestate: "Real Estate",
  consumer_cyclical: "Consumer Cyclical",
  basic_materials: "Basic Materials",
  consumer_defensive: "Consumer Defensive",
  technology: "Technology",
  communication_services: "Communication",
  financial_services: "Financial Services",
  utilities: "Utilities",
  industrials: "Industrials",
  energy: "Energy",
  healthcare: "Healthcare",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapFundSummary(symbol: string, qs: any): EtfData {
  const out: EtfData = {
    symbol,
    trailing: {},
    annual: [],
    top: [],
    sectors: [],
    split: {},
    fetchedAt: new Date().toISOString(),
  };

  const price = qs?.price;
  out.name = str(price?.longName) ?? str(price?.shortName);
  out.price = num(price?.regularMarketPrice);
  out.currency = str(price?.currency);
  out.quoteType = str(price?.quoteType);

  const fp = qs?.fundProfile;
  out.family = str(fp?.family) ?? str(qs?.defaultKeyStatistics?.fundFamily);
  out.category = str(fp?.categoryName) ?? str(qs?.defaultKeyStatistics?.category);
  out.legalType = str(fp?.legalType);
  const fees = fp?.feesExpensesInvestment;
  out.mer = num(fees?.annualReportExpenseRatio);
  out.netExpenseRatio = num(fees?.netExpRatio);
  out.aum =
    num(qs?.defaultKeyStatistics?.totalAssets) ??
    num(qs?.summaryDetail?.totalAssets) ??
    num(fees?.totalNetAssets);

  out.fundYield = num(qs?.defaultKeyStatistics?.yield) ?? num(qs?.summaryDetail?.yield);
  out.ytd = num(qs?.defaultKeyStatistics?.ytdReturn);

  const tr = qs?.fundPerformance?.trailingReturns;
  out.trailing = {
    y1: num(tr?.oneYear),
    y3: num(tr?.threeYear),
    y5: num(tr?.fiveYear),
    y10: num(tr?.tenYear),
  };
  if (out.trailing.y3 === undefined) out.trailing.y3 = num(qs?.defaultKeyStatistics?.threeYearAverageReturn);
  if (out.trailing.y5 === undefined) out.trailing.y5 = num(qs?.defaultKeyStatistics?.fiveYearAverageReturn);

  for (const r of qs?.fundPerformance?.annualTotalReturns?.returns ?? []) {
    const year = Number(str(r?.year) ?? num(r?.year));
    const ret = num(r?.annualValue);
    if (Number.isFinite(year) && ret !== undefined) out.annual.push({ year, ret });
  }
  out.annual.sort((a, b) => a.year - b.year);

  const riskRows = qs?.fundPerformance?.riskOverviewStatistics?.riskStatistics ?? [];
  const r3 = riskRows.find((r: any) => /3y|3 y/i.test(str(r?.year) ?? "")) ?? riskRows[0];
  if (r3) {
    out.risk = { beta: num(r3.beta), stdDev: num(r3.stdDev), sharpe: num(r3.sharpeRatio) };
  }
  if (out.risk?.beta === undefined) {
    const b3 = num(qs?.defaultKeyStatistics?.beta3Year);
    if (b3 !== undefined) out.risk = { ...(out.risk ?? {}), beta: b3 };
  }

  const th = qs?.topHoldings;
  for (const h of th?.holdings ?? []) {
    const w = num(h?.holdingPercent);
    const nm = str(h?.holdingName) ?? str(h?.symbol);
    if (nm && w !== undefined) out.top.push({ symbol: str(h?.symbol), name: nm, weight: w });
  }
  if (out.top.length) out.topWeight = out.top.reduce((a, h) => a + h.weight, 0);
  out.split = {
    stock: num(th?.stockPosition),
    bond: num(th?.bondPosition),
    cash: num(th?.cashPosition),
  };
  out.holdingsPE = num(th?.equityHoldings?.priceToEarnings);

  for (const sw of th?.sectorWeightings ?? []) {
    if (!sw || typeof sw !== "object") continue;
    for (const [k, v] of Object.entries(sw)) {
      const w = num(v);
      if (w !== undefined && w > 0.0005) out.sectors.push({ label: SECTOR_LABEL[k] ?? k, weight: w });
    }
  }
  out.sectors.sort((a, b) => b.weight - a.weight);

  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** True when Yahoo returned nothing a fund analysis can stand on. */
export function fundDataEmpty(e: EtfData): boolean {
  return (
    e.mer === undefined &&
    e.aum === undefined &&
    e.trailing.y1 === undefined &&
    e.trailing.y3 === undefined &&
    e.trailing.y5 === undefined &&
    !e.top.length &&
    !e.annual.length
  );
}
