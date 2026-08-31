import type { Scorecard, StockData, Verdict } from "./types";
import { buildValuation, type ValuationStatus } from "./valuation";

/**
 * Long-term investor screeners - classic screens plus a raw-fundamentals
 * custom builder, run over any set of scored stocks (scanned universes,
 * pasted custom lists, and your own holdings), entirely client-side.
 *
 * MetricRow is deliberately flat and serializable: rows revived from the
 * on-device scan cache carry no `data`/`scorecard` (hydrated on demand for
 * prompts/watchlist), but every number a screen needs is present.
 */

export interface MetricRow {
  symbol: string;
  name: string;
  sector: string;
  owned: boolean;
  watch: boolean;
  score: number;
  verdict: Verdict;
  pe?: number;
  avgPE?: number;
  peg?: number;
  pb?: number;
  divYield?: number;
  payout?: number;
  marketCap?: number;
  roeAvg?: number;
  roceAvg?: number;
  d2e?: number;
  icr?: number;
  revCagr?: number;
  epsCagr?: number;
  fcfPosShare?: number;
  earningsYield?: number;
  fcfYield?: number;
  mos?: number;
  valStatus: ValuationStatus;
  coffeeCan?: number; // 0..1 share of qualifying years
  isFin: boolean;
  redFlags: number;
  lossYears: number;
  pillarQuality: number;
  pillarGrowth: number;
  /** full objects when freshly fetched; absent when revived from cache */
  data?: StockData;
  scorecard?: Scorecard;
  /** filled by ranking screens (e.g. Magic Formula) */
  rankNote?: string;
}

const avg = (xs: number[]): number | undefined =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;

export function toMetricRow(
  data: StockData,
  sc: Scorecard,
  opts: { owned?: boolean; watch?: boolean; fallbackName?: string; fallbackSector?: string } = {}
): MetricRow {
  const q = data.quote;
  const val = buildValuation(data, sc);
  const roeSeries = sc.ratios.map((r) => r.roe).filter((v): v is number => v !== undefined);
  const roceSeries = sc.ratios.map((r) => r.roce).filter((v): v is number => v !== undefined);
  const lastRatio = sc.ratios[sc.ratios.length - 1];
  const fcfYears = data.years.map((y) => y.fcf).filter((v): v is number => v !== undefined);
  const niSeries = data.years.map((y) => y.netIncome).filter((v): v is number => v !== undefined);
  const coffee = sc.checks.find((c) => c.id === "coffeecan");
  const pe = q.trailingPE;
  const peg =
    q.pegRatio ?? (pe && sc.cagr.eps && sc.cagr.eps > 0 ? pe / (sc.cagr.eps * 100) : undefined);
  const fcfBase = q.fcfTTM ?? data.years[data.years.length - 1]?.fcf;

  return {
    symbol: data.symbol,
    name: q.name ?? opts.fallbackName ?? data.symbol,
    sector: q.sector ?? opts.fallbackSector ?? "–",
    owned: !!opts.owned,
    watch: !!opts.watch,
    score: sc.totalScore,
    verdict: sc.verdict,
    pe,
    avgPE: sc.avgPE,
    peg,
    pb: q.priceToBook,
    divYield: q.dividendYield,
    payout: q.payoutRatio,
    marketCap: q.marketCap,
    roeAvg: avg(roeSeries) ?? q.roeTTM,
    roceAvg: avg(roceSeries),
    d2e: lastRatio?.debtToEquity ?? q.debtToEquityNow,
    icr: lastRatio?.interestCoverage,
    revCagr: sc.cagr.revenue,
    epsCagr: sc.cagr.eps,
    fcfPosShare: fcfYears.length ? fcfYears.filter((v) => v > 0).length / fcfYears.length : undefined,
    earningsYield: pe && pe > 0 ? 1 / pe : undefined,
    fcfYield:
      fcfBase !== undefined && q.marketCap && q.marketCap > 0 && fcfBase > 0
        ? fcfBase / q.marketCap
        : undefined,
    mos: val.marginOfSafety,
    valStatus: val.status,
    coffeeCan: coffee && coffee.status !== "na" ? coffee.score : undefined,
    isFin: sc.isFinancialSector,
    redFlags: sc.redFlags.length,
    lossYears: niSeries.filter((v) => v <= 0).length,
    pillarQuality: sc.pillars.find((p) => p.pillar === "quality")?.score ?? 0,
    pillarGrowth: sc.pillars.find((p) => p.pillar === "growth")?.score ?? 0,
    data,
    scorecard: sc,
  };
}

export interface ScreenDef {
  id: string;
  name: string;
  master: string;
  blurb: string;
  criteria: string;
  apply: (rows: MetricRow[]) => MetricRow[];
}

const ok = (v: number | undefined, f: (x: number) => boolean) => v !== undefined && f(v);

// ---------------- market-cap tiers ----------------

export type CapTier = "large" | "mid" | "small";

/**
 * Size band from LIVE market cap, currency-aware:
 *   India (SEBI-style):  large ≥ ₹1,00,000 Cr · mid ≥ ₹25,000 Cr · small below
 *   Canada/US:           large ≥ $10B · mid ≥ $2B · small below
 */
export function capTierOf(marketCap: number | undefined, symbol: string): CapTier | undefined {
  if (marketCap === undefined || !(marketCap > 0)) return undefined;
  if (/\.(NS|BO)$/i.test(symbol)) {
    return marketCap >= 1e12 ? "large" : marketCap >= 2.5e11 ? "mid" : "small";
  }
  return marketCap >= 1e10 ? "large" : marketCap >= 2e9 ? "mid" : "small";
}

export const CAP_TIER_META: Record<CapTier, { label: string; short: string }> = {
  large: { label: "Large cap", short: "L" },
  mid: { label: "Mid cap", short: "Mid" },
  small: { label: "Small cap", short: "Small" },
};

const BASE_SCREENS: ScreenDef[] = [
  {
    id: "two-year",
    name: "Two-year keepers",
    master: "the sit-tight school",
    blurb: "Businesses you could reasonably commit to for a 2-year minimum hold: quality, growth, no red flags, sane price.",
    criteria: "Score ≥ 60, zero red flags, EPS growth ≥ 8%, interest cover ≥ 4× (non-financials), not above fair value",
    apply: (rows) =>
      rows
        .filter(
          (r) =>
            r.score >= 60 &&
            r.redFlags === 0 &&
            ok(r.epsCagr, (v) => v >= 0.08) &&
            (r.isFin || r.icr === undefined || r.icr >= 4) &&
            r.valStatus !== "PRICEY"
        )
        .sort((a, b) => b.score - a.score),
  },
  {
    id: "coffee-can",
    name: "Coffee Can compounders",
    master: "Saurabh Mukherjea",
    blurb: "Businesses consistent enough to lock away untouched for a decade.",
    criteria: "Revenue growth ≥10% AND ROCE ≥15% (ROE for financials) in most years; scorecard ≥ 60",
    apply: (rows) =>
      rows
        .filter((r) => ok(r.coffeeCan, (v) => v >= 0.5) && r.score >= 60)
        .sort((a, b) => b.score - a.score || (b.coffeeCan ?? 0) - (a.coffeeCan ?? 0)),
  },
  {
    id: "magic-formula",
    name: "Magic Formula",
    master: "Joel Greenblatt",
    blurb: "Good businesses (high return on capital) at cheap prices (high earnings yield) - ranked jointly.",
    criteria: "Combined rank of earnings yield + avg ROCE (non-financials with both metrics)",
    apply: (rows) => {
      const usable = rows.filter((r) => !r.isFin && r.earningsYield !== undefined && r.roceAvg !== undefined);
      const byYield = [...usable].sort((a, b) => (b.earningsYield ?? 0) - (a.earningsYield ?? 0));
      const byRoc = [...usable].sort((a, b) => (b.roceAvg ?? 0) - (a.roceAvg ?? 0));
      const rank = new Map<string, number>();
      usable.forEach((r) => rank.set(r.symbol, 0));
      byYield.forEach((r, i) => rank.set(r.symbol, (rank.get(r.symbol) ?? 0) + i));
      byRoc.forEach((r, i) => rank.set(r.symbol, (rank.get(r.symbol) ?? 0) + i));
      return usable
        .sort((a, b) => (rank.get(a.symbol) ?? 0) - (rank.get(b.symbol) ?? 0))
        .map((r, i) => ({ ...r, rankNote: `MF rank #${i + 1}` }));
    },
  },
  {
    id: "qglp",
    name: "QGLP quality-growth",
    master: "Raamdeo Agrawal",
    blurb: "Quality of business, Growth in earnings, Longevity of moat - at a reasonable Price.",
    criteria: "Quality pillar ≥ 65, growth pillar ≥ 55, PEG ≤ 1.5 (or price ≤ fair estimate)",
    apply: (rows) =>
      rows
        .filter((r) => {
          const priceOk = ok(r.peg, (v) => v > 0 && v <= 1.5) || (r.mos ?? -1) >= 0;
          return r.pillarQuality >= 65 && r.pillarGrowth >= 55 && priceOk;
        })
        .sort((a, b) => b.score - a.score),
  },
  {
    id: "dividend",
    name: "Dividend compounders",
    master: "the income school",
    blurb: "Growing businesses that also pay you to wait.",
    criteria: "Yield ≥ 1.2%, payout ≤ 65%, EPS growth ≥ 6%, scorecard ≥ 55",
    apply: (rows) =>
      rows
        .filter(
          (r) =>
            ok(r.divYield, (v) => v >= 0.012) &&
            (r.payout === undefined || r.payout <= 0.65) &&
            ok(r.epsCagr, (v) => v >= 0.06) &&
            r.score >= 55
        )
        .sort((a, b) => (b.divYield ?? 0) - (a.divYield ?? 0)),
  },
  {
    id: "fortress",
    name: "Fortress balance sheets",
    master: "Buffett / Jhunjhunwala",
    blurb: "Businesses that cannot be killed by a bad year, a rate spike, or a banker.",
    criteria: "Non-financials: D/E ≤ 0.35, interest cover ≥ 8×, FCF positive in ≥ 80% of years",
    apply: (rows) =>
      rows
        .filter(
          (r) =>
            !r.isFin &&
            ok(r.d2e, (v) => v >= 0 && v <= 0.35) &&
            (r.icr === undefined || r.icr >= 8) &&
            ok(r.fcfPosShare, (v) => v >= 0.8)
        )
        .sort((a, b) => ((a.d2e ?? 99) < 0 ? 99 : (a.d2e ?? 99)) - ((b.d2e ?? 99) < 0 ? 99 : (b.d2e ?? 99))),
  },
  {
    id: "garp",
    name: "GARP - growth at a reasonable price",
    master: "Peter Lynch",
    blurb: "Pay for growth, never overpay: the PEG discipline.",
    criteria: "PEG ≤ 1.0 with EPS growth ≥ 10%",
    apply: (rows) =>
      rows
        .filter((r) => ok(r.peg, (v) => v > 0 && v <= 1.0) && ok(r.epsCagr, (v) => v >= 0.1))
        .sort((a, b) => (a.peg ?? 99) - (b.peg ?? 99)),
  },
  {
    id: "buy-zone",
    name: "Quality in the buy zone",
    master: "Damani / Graham",
    blurb: "Wonderful businesses currently priced with a margin of safety - the rarest list.",
    criteria: "Scorecard ≥ 65 and price at/below the rough fair-value estimate",
    apply: (rows) =>
      rows
        .filter((r) => r.score >= 65 && (r.valStatus === "BUY_ZONE" || ((r.mos ?? -1) >= 0 && r.valStatus === "FAIR")))
        .sort((a, b) => (b.mos ?? 0) - (a.mos ?? 0)),
  },
];

// ---------------- consensus across the classic screens ----------------

const SHORT_SCREEN_NAME: Record<string, string> = {
  "two-year": "2-yr keepers",
  "coffee-can": "Coffee Can",
  "magic-formula": "Magic Formula",
  qglp: "QGLP",
  dividend: "Dividend",
  fortress: "Fortress",
  garp: "GARP",
  "buy-zone": "Buy zone",
};

/**
 * How many of the classic screens each name passes right now - the "almost
 * every buy list agrees" view. The Magic Formula is a pure ranking (it always
 * returns every usable name), so only its TOP 10 counts as a "pass".
 */
export function consensusOf(rows: MetricRow[]): Map<string, { count: number; screens: string[] }> {
  const out = new Map<string, { count: number; screens: string[] }>();
  for (const s of BASE_SCREENS) {
    const passed = s.id === "magic-formula" ? s.apply(rows).slice(0, 10) : s.apply(rows);
    for (const r of passed) {
      const k = r.symbol.toUpperCase();
      const e = out.get(k) ?? { count: 0, screens: [] };
      e.count++;
      e.screens.push(SHORT_SCREEN_NAME[s.id] ?? s.name);
      out.set(k, e);
    }
  }
  return out;
}

export const CONSENSUS_MIN = 3;

const CONSENSUS_SCREEN: ScreenDef = {
  id: "consensus",
  name: "Consensus picks",
  master: "all 8 screens, one shortlist",
  blurb: "The names most of the classic buy-lists agree on at today's numbers - quality AND price AND balance sheet at once.",
  criteria: `Passes ≥${CONSENSUS_MIN} of the 8 screens (Magic Formula counts its top 10) - ranked by how many agree`,
  apply: (rows) => {
    const c = consensusOf(rows);
    return rows
      .filter((r) => (c.get(r.symbol.toUpperCase())?.count ?? 0) >= CONSENSUS_MIN)
      .sort((a, b) => {
        const ca = c.get(a.symbol.toUpperCase())!.count;
        const cb = c.get(b.symbol.toUpperCase())!.count;
        return cb - ca || b.score - a.score;
      })
      .map((r) => {
        const e = c.get(r.symbol.toUpperCase())!;
        const listed = e.screens.slice(0, 3).join(", ");
        return {
          ...r,
          rankNote: `${e.count}/8 screens agree: ${listed}${e.screens.length > 3 ? ` +${e.screens.length - 3}` : ""}`,
        };
      });
  },
};

/**
 * Mid & small caps get their own hunting-ground screen: the SAME quality bars,
 * applied only to names below the large-cap line - where the next decade's
 * large caps live. Deliberately NOT part of the consensus count (it's a size
 * subset of the quality screens, and would double-count them).
 */
const SMALLMID_SCREEN: ScreenDef = {
  id: "small-mid",
  name: "Mid & small-cap compounders",
  master: "Jhunjhunwala's hunting ground",
  blurb: "Tomorrow's large caps are today's quality mid & small caps - same discipline, smaller names, stricter bars.",
  criteria: "Mid/small by market cap · score ≥ 60 · zero red flags · ROCE ≥ 18% (ROE ≥ 15% for financials) · EPS growth ≥ 12% · not above fair value",
  apply: (rows) =>
    rows
      .filter((r) => {
        const tier = capTierOf(r.marketCap, r.symbol);
        if (tier !== "mid" && tier !== "small") return false;
        const roc = r.isFin ? r.roeAvg : r.roceAvg;
        return (
          r.score >= 60 &&
          r.redFlags === 0 &&
          ok(roc, (v) => v >= (r.isFin ? 0.15 : 0.18)) &&
          ok(r.epsCagr, (v) => v >= 0.12) &&
          r.valStatus !== "PRICEY"
        );
      })
      .sort((a, b) => b.score - a.score)
      .map((r) => ({ ...r, rankNote: `${CAP_TIER_META[capTierOf(r.marketCap, r.symbol)!].label}` })),
};

export const SCREENS: ScreenDef[] = [...BASE_SCREENS, SMALLMID_SCREEN, CONSENSUS_SCREEN];

export interface CustomFilter {
  minScore?: number;
  minRoce?: number; // avg ROCE (ROE for financials)
  maxD2E?: number; // skipped for financials
  minRevCagr?: number;
  minEpsCagr?: number;
  minPE?: number; // "P/E at least" - filters out too-cheap-to-be-true value traps
  maxPE?: number;
  maxPEG?: number;
  maxPB?: number;
  minDivYield?: number;
  minMarketCapB?: number; // billions, native currency
  minIcr?: number; // skipped for financials
  minFcfYield?: number;
  maxPayout?: number;
  maxRedFlags?: number;
  noLossYears?: boolean;
  onlyBuyZone?: boolean;
  excludeOwned?: boolean;
}

export function runCustom(rows: MetricRow[], f: CustomFilter): MetricRow[] {
  return rows
    .filter((r) => {
      if (f.excludeOwned && r.owned) return false;
      if (f.minScore !== undefined && r.score < f.minScore) return false;
      const roc = r.isFin ? r.roeAvg : (r.roceAvg ?? r.roeAvg);
      if (f.minRoce !== undefined && !ok(roc, (v) => v >= f.minRoce!)) return false;
      if (f.maxD2E !== undefined && !r.isFin && !ok(r.d2e, (v) => v <= f.maxD2E!)) return false;
      if (f.minRevCagr !== undefined && !ok(r.revCagr, (v) => v >= f.minRevCagr!)) return false;
      if (f.minEpsCagr !== undefined && !ok(r.epsCagr, (v) => v >= f.minEpsCagr!)) return false;
      if (f.minPE !== undefined && !ok(r.pe, (v) => v >= f.minPE!)) return false;
      if (f.maxPE !== undefined && !ok(r.pe, (v) => v > 0 && v <= f.maxPE!)) return false;
      if (f.maxPEG !== undefined && !ok(r.peg, (v) => v > 0 && v <= f.maxPEG!)) return false;
      if (f.maxPB !== undefined && !ok(r.pb, (v) => v > 0 && v <= f.maxPB!)) return false;
      if (f.minDivYield !== undefined && !ok(r.divYield, (v) => v >= f.minDivYield!)) return false;
      if (f.minMarketCapB !== undefined && !ok(r.marketCap, (v) => v >= f.minMarketCapB! * 1e9)) return false;
      if (f.minIcr !== undefined && !r.isFin && !ok(r.icr, (v) => v >= f.minIcr!)) return false;
      if (f.minFcfYield !== undefined && !ok(r.fcfYield, (v) => v >= f.minFcfYield!)) return false;
      if (f.maxPayout !== undefined && r.payout !== undefined && r.payout > f.maxPayout) return false;
      if (f.maxRedFlags !== undefined && r.redFlags > f.maxRedFlags) return false;
      if (f.noLossYears && r.lossYears > 0) return false;
      if (f.onlyBuyZone && r.valStatus !== "BUY_ZONE") return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);
}
