import type { Scorecard, StockData, Verdict } from "./types";
import { buildValuation, type ValuationStatus } from "./valuation";

/**
 * Long-term investor screeners — the classic screens, run over any set of
 * scored stocks (your scanned market universe + your own holdings), entirely
 * client-side. Each screen names the master whose public method it encodes
 * and states its criteria in plain words.
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
  divYield?: number;
  payout?: number;
  roeAvg?: number;
  roceAvg?: number;
  d2e?: number;
  icr?: number;
  revCagr?: number;
  epsCagr?: number;
  fcfPosShare?: number;
  earningsYield?: number;
  mos?: number;
  valStatus: ValuationStatus;
  coffeeCan?: number; // 0..1 share of qualifying years
  isFin: boolean;
  data: StockData;
  scorecard: Scorecard;
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
  const coffee = sc.checks.find((c) => c.id === "coffeecan");
  const pe = q.trailingPE;
  const peg =
    q.pegRatio ??
    (pe && sc.cagr.eps && sc.cagr.eps > 0 ? pe / (sc.cagr.eps * 100) : undefined);

  return {
    symbol: data.symbol,
    name: q.name ?? opts.fallbackName ?? data.symbol,
    sector: q.sector ?? opts.fallbackSector ?? "—",
    owned: !!opts.owned,
    watch: !!opts.watch,
    score: sc.totalScore,
    verdict: sc.verdict,
    pe,
    avgPE: sc.avgPE,
    peg,
    divYield: q.dividendYield,
    payout: q.payoutRatio,
    roeAvg: avg(roeSeries) ?? q.roeTTM,
    roceAvg: avg(roceSeries),
    d2e: lastRatio?.debtToEquity ?? q.debtToEquityNow,
    icr: lastRatio?.interestCoverage,
    revCagr: sc.cagr.revenue,
    epsCagr: sc.cagr.eps,
    fcfPosShare: fcfYears.length ? fcfYears.filter((v) => v > 0).length / fcfYears.length : undefined,
    earningsYield: pe && pe > 0 ? 1 / pe : undefined,
    mos: val.marginOfSafety,
    valStatus: val.status,
    coffeeCan: coffee && coffee.status !== "na" ? coffee.score : undefined,
    isFin: sc.isFinancialSector,
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

export const SCREENS: ScreenDef[] = [
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
    blurb: "Good businesses (high return on capital) at cheap prices (high earnings yield) — ranked jointly.",
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
    blurb: "Quality of business, Growth in earnings, Longevity of moat — at a reasonable Price.",
    criteria: "Quality pillar ≥ 65, growth pillar ≥ 55, PEG ≤ 1.5 (or price ≤ fair estimate)",
    apply: (rows) =>
      rows
        .filter((r) => {
          const q = r.scorecard.pillars.find((p) => p.pillar === "quality")?.score ?? 0;
          const g = r.scorecard.pillars.find((p) => p.pillar === "growth")?.score ?? 0;
          const priceOk = ok(r.peg, (v) => v <= 1.5) || (r.mos ?? -1) >= 0;
          return q >= 65 && g >= 55 && priceOk;
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
            ok(r.d2e, (v) => v <= 0.35) &&
            (r.icr === undefined || r.icr >= 8) &&
            ok(r.fcfPosShare, (v) => v >= 0.8)
        )
        .sort((a, b) => (a.d2e ?? 99) - (b.d2e ?? 99)),
  },
  {
    id: "garp",
    name: "GARP — growth at a reasonable price",
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
    blurb: "Wonderful businesses currently priced with a margin of safety — the rarest list.",
    criteria: "Scorecard ≥ 65 and price at/below the rough fair-value estimate",
    apply: (rows) =>
      rows
        .filter((r) => r.score >= 65 && (r.valStatus === "BUY_ZONE" || ((r.mos ?? -1) >= 0 && r.valStatus === "FAIR")))
        .sort((a, b) => (b.mos ?? 0) - (a.mos ?? 0)),
  },
];

export interface CustomFilter {
  minScore?: number;
  minRoce?: number; // applies avg ROCE (ROE for financials)
  maxD2E?: number; // skipped for financials
  minRevCagr?: number;
  minEpsCagr?: number;
  maxPE?: number;
  maxPEG?: number;
  minDivYield?: number;
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
      if (f.maxPE !== undefined && !ok(r.pe, (v) => v > 0 && v <= f.maxPE!)) return false;
      if (f.maxPEG !== undefined && !ok(r.peg, (v) => v > 0 && v <= f.maxPEG!)) return false;
      if (f.minDivYield !== undefined && !ok(r.divYield, (v) => v >= f.minDivYield!)) return false;
      if (f.onlyBuyZone && r.valStatus !== "BUY_ZONE") return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);
}
