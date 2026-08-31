import type { Scorecard, StockData } from "./types";

/**
 * Rough, mechanical intrinsic-value estimates - a sanity anchor, never a target.
 *
 * Methods (only those the data supports are used; the blend is the MEDIAN):
 *  - Graham Number            √(22.5 × EPS × BVPS)               - Graham's conservative ceiling
 *  - Graham growth formula    EPS × (8.5 + 2g)                   - value of growth, capped
 *  - FCF discount (10y fade)  FCF/share grown g→terminal, PV'd   - Buffett's owner-earnings lens
 *  - P/E history anchor       EPS × own 5-yr average P/E         - Damani: price vs its own history
 *  - Justified P/B            BVPS × (ROE−g)/(r−g)               - financials only
 *
 * Every number is derived from the same free Yahoo data the scorecard uses.
 * Growth is haircut 25% and clamped to 2–14%; discount rates are deliberately
 * demanding (13% INR / 10% CAD-USD). The margin-of-safety target scales with
 * quality: better businesses need less discount (Munger), weak ones need more.
 */

export type ValuationStatus = "BUY_ZONE" | "FAIR" | "PRICEY" | "UNKNOWN";

export interface ValuationMethod {
  id: string;
  label: string;
  value: number; // per share, stock currency
  note: string;
}

export interface Valuation {
  methods: ValuationMethod[];
  intrinsic?: number; // median of methods
  low?: number; // intrinsic × 0.8
  high?: number; // intrinsic × 1.2
  buyBelow?: number; // intrinsic × (1 − mosTarget)
  /** how many independent methods produced a number */
  methodCount?: number;
  /** max/min across ALL methods - the raw, unedited disagreement */
  spread?: number;
  /**
   * triangulated = 3+ methods within 1.75x, OR 4+ where all but one agree
   * within 1.75x (the set-aside one is reported in `outlier`, never hidden);
   * thin = too few points or loose agreement; conflicting = scattered even
   * after setting the most extreme method aside
   */
  confidence?: "triangulated" | "thin" | "conflicting";
  /** max/min after setting aside the single farthest-from-median method (3+ methods, loose overall) */
  clusterSpread?: number;
  /** the method the cluster read set aside - reported with its value and side */
  outlier?: { id: string; label: string; value: number; side: "below" | "above" };
  /** lowest and highest single-method value - the raw disagreement, shown honestly */
  methodLow?: number;
  methodHigh?: number;
  mosTarget: number; // required margin of safety, by quality
  marginOfSafety?: number; // 1 − price/intrinsic (negative ⇒ overpriced)
  status: ValuationStatus;
  assumptions: {
    growth?: number;
    discount: number;
    terminal: number;
    eps?: number;
    fcfPerShare?: number;
    bookPerShare?: number;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * How well do the methods agree? The naive answer (max/min) is brittle: one
 * structurally conservative method poisons it even when the rest cluster
 * tightly. The Graham Number is the usual culprit - it is anchored to BOOK
 * value, so for asset-light compounders (most of the Indian quality universe)
 * it sits far below every earnings-based method BY CONSTRUCTION. That is a
 * floor answering a different question, not a disagreement about fair value.
 *
 * So the read is two-stage, and nothing is hidden:
 *  - 3+ methods all within 1.75x            → triangulated
 *  - 4+ methods where all but ONE fit in
 *    1.75x                                  → triangulated, outlier REPORTED
 *    (which method, its value, which side) - it stays in the median and in
 *    the displayed range; it is only set aside when judging agreement
 *  - otherwise: thin, or conflicting when even the cluster spans > 2.25x
 *
 * With 3 methods a cluster of 2 plus an outlier is NOT a triangulation - two
 * points and a stray never are - so that stays thin, with the outlier named.
 */
export interface AgreementRead {
  spread?: number;
  clusterSpread?: number;
  outlierIdx?: number;
  side?: "below" | "above";
  confidence: "triangulated" | "thin" | "conflicting";
}

export function judgeAgreement(values: number[]): AgreementRead {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  const n = v.length;
  if (n < 2) return { confidence: "thin" };
  const spread = Math.max(...v) / Math.min(...v);
  if (n >= 3 && spread <= 1.75) return { spread, confidence: "triangulated" };
  if (n < 3) return { spread, confidence: spread > 2.25 ? "conflicting" : "thin" };
  // 3+ methods, loose overall: set aside the single farthest from the median
  // (log distance, so 0.5x and 2x count as equally far)
  const sorted = [...v].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  let outlierIdx = 0;
  let worst = -1;
  v.forEach((x, i) => {
    const d = Math.abs(Math.log(x) - Math.log(median));
    if (d > worst) {
      worst = d;
      outlierIdx = i;
    }
  });
  const rest = v.filter((_, i) => i !== outlierIdx);
  const clusterSpread = Math.max(...rest) / Math.min(...rest);
  const side: "below" | "above" = v[outlierIdx] < median ? "below" : "above";
  if (n >= 4 && clusterSpread <= 1.75) return { spread, clusterSpread, outlierIdx, side, confidence: "triangulated" };
  if (clusterSpread > 2.25) return { spread, clusterSpread, outlierIdx, side, confidence: "conflicting" };
  return { spread, clusterSpread, outlierIdx, side, confidence: "thin" };
}

function median(xs: number[]): number | undefined {
  const s = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const n = s.length;
  if (!n) return undefined;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function mean(xs: number[]): number | undefined {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

export function buildValuation(data: StockData, sc: Scorecard): Valuation {
  const q = data.quote;
  const years = data.years;
  const last = years[years.length - 1];
  const isINR = (q.currency ?? "USD") === "INR";
  const r = isINR ? 0.13 : 0.1; // demanding discount rate
  const gt = isINR ? 0.05 : 0.03; // terminal growth ≈ long-run nominal GDP, conservative

  const empty: Valuation = {
    methods: [],
    mosTarget: 0.3,
    status: "UNKNOWN",
    assumptions: { discount: r, terminal: gt },
  };
  if (sc.verdict === "INSUFFICIENT_DATA") return empty;

  // --- per-share inputs ---
  const epsQ = q.epsTrailing !== undefined && q.epsTrailing > 0 ? q.epsTrailing : undefined;
  const epsY = (() => {
    const e = last?.dilutedEPS ?? last?.basicEPS;
    return e !== undefined && e > 0 ? e : undefined;
  })();
  const eps = epsQ ?? epsY;

  const shares = last?.shares;
  let bvps: number | undefined;
  if (last?.equity && last.equity > 0 && shares && shares > 0) bvps = last.equity / shares;
  else if (q.price && q.priceToBook && q.priceToBook > 0) bvps = q.price / q.priceToBook;

  let fcfPs: number | undefined;
  const fcfBase = q.fcfTTM ?? last?.fcf;
  if (fcfBase !== undefined && fcfBase > 0 && shares && shares > 0) fcfPs = fcfBase / shares;

  /**
   * Growth for the forward methods: EPS CAGR if it exists AT ALL (even if
   * negative), else revenue CAGR. Skipping a negative EPS CAGR to reach a
   * positive revenue CAGR was picking the flattering number on exactly the
   * businesses whose earnings are shrinking.
   */
  const epsG = Number.isFinite(sc.cagr.eps as number) ? (sc.cagr.eps as number) : undefined;
  const revG = Number.isFinite(sc.cagr.revenue as number) ? (sc.cagr.revenue as number) : undefined;
  const rawG = epsG ?? revG;
  // shrinking earnings get no growth-based valuation at all - a DCF on a
  // declining business is false precision, so those methods are skipped
  const growth = rawG !== undefined && rawG > 0 ? clamp(rawG * 0.75, 0.02, 0.14) : undefined;
  const shrinking = rawG !== undefined && rawG <= 0;

  const methods: ValuationMethod[] = [];

  if (eps && bvps) {
    methods.push({
      id: "graham",
      label: "Graham Number",
      value: Math.sqrt(22.5 * eps * bvps),
      note: `√(22.5 × EPS × book/share) - Graham's ceiling for a defensive buyer`,
    });
  }

  if (eps && growth !== undefined && !sc.isFinancialSector) {
    const mult = Math.min(8.5 + 200 * growth, 30);
    methods.push({
      id: "grahamgrowth",
      label: "Graham growth formula",
      value: eps * mult,
      note: `EPS × (8.5 + 2g) at g=${(growth * 100).toFixed(1)}% (multiplier capped at 30×)`,
    });
  }

  if (fcfPs !== undefined && growth !== undefined && !sc.isFinancialSector) {
    let pv = 0;
    let f = fcfPs;
    // Fade DOWN to the terminal rate, never up: with growth clamped at ≥2% and
    // an INR terminal of 5%, the old fade modelled slow businesses as
    // ACCELERATING, overstating their value by ~25%.
    const gEnd = Math.min(gt, growth);
    for (let t = 1; t <= 10; t++) {
      const gT = growth + ((gEnd - growth) * (t - 1)) / 9;
      f = f * (1 + gT);
      pv += f / Math.pow(1 + r, t);
    }
    pv += (f * (1 + gEnd)) / (r - gEnd) / Math.pow(1 + r, 10);
    methods.push({
      id: "dcf",
      label: "Owner-earnings DCF (10y fade)",
      value: pv,
      note: `FCF/share ${fcfPs.toFixed(2)} fading ${(growth * 100).toFixed(1)}%→${(gt * 100).toFixed(0)}%, discounted at ${(r * 100).toFixed(0)}%`,
    });
  }

  if (eps && sc.avgPE && sc.avgPE > 0) {
    const anchor = Math.min(sc.avgPE, 30);
    methods.push({
      id: "peanchor",
      label: "Own-history P/E anchor",
      value: eps * anchor,
      note: `EPS × own 5-yr avg P/E ${sc.avgPE.toFixed(1)}${sc.avgPE > 30 ? " (capped at 30)" : ""}`,
    });
  }

  if (sc.isFinancialSector && bvps) {
    const roe =
      mean(sc.ratios.map((x) => x.roe).filter((v): v is number => v !== undefined)) ?? q.roeTTM;
    if (roe !== undefined && roe > 0) {
      const retention =
        q.payoutRatio !== undefined && q.payoutRatio >= 0 && q.payoutRatio <= 1
          ? 1 - q.payoutRatio
          : 0.5;
      const g = Math.min(roe * retention, r - 0.02);
      const mult = clamp((roe - g) / (r - g), 0.5, 4);
      methods.push({
        id: "justpb",
        label: "Justified P/B (financials)",
        value: bvps * mult,
        note: `Book/share × (ROE−g)/(r−g) = ${mult.toFixed(2)}× book at ROE ${(roe * 100).toFixed(1)}%`,
      });
    }
  }

  const intrinsic = median(methods.map((m) => m.value));
  /**
   * Confidence in the estimate. One method is a single opinion, not a
   * triangulation, and two methods that disagree by more than 2x are not a
   * range - the band widens to say so instead of drawing a tidy ±20%.
   */
  // Tightened after external review (the methods share inputs, so agreement
  // overstates independence: 1.75x / 2.25x bars) and then made outlier-aware,
  // because max/min alone let the Graham book-value floor mislabel every
  // asset-light compounder as "conflicting". See judgeAgreement above.
  const pairs = methods.filter((m) => Number.isFinite(m.value) && m.value > 0);
  const vals = pairs.map((m) => m.value);
  const agreement = judgeAgreement(vals);
  const spread = agreement.spread;
  const confidence = agreement.confidence;
  const outlierMethod = agreement.outlierIdx !== undefined ? pairs[agreement.outlierIdx] : undefined;
  const halfBand = confidence === "triangulated" ? 0.2 : confidence === "thin" ? 0.3 : 0.4;
  const mosTarget = sc.totalScore >= 70 ? 0.2 : sc.totalScore >= 55 ? 0.3 : 0.4;

  const out: Valuation = {
    methods,
    intrinsic,
    low: intrinsic !== undefined ? intrinsic * (1 - halfBand) : undefined,
    high: intrinsic !== undefined ? intrinsic * (1 + halfBand) : undefined,
    methodCount: methods.length,
    spread,
    confidence,
    clusterSpread: agreement.clusterSpread,
    outlier:
      outlierMethod && agreement.side
        ? { id: outlierMethod.id, label: outlierMethod.label, value: outlierMethod.value, side: agreement.side }
        : undefined,
    methodLow: vals.length ? Math.min(...vals) : undefined,
    methodHigh: vals.length ? Math.max(...vals) : undefined,
    buyBelow: intrinsic !== undefined ? intrinsic * (1 - mosTarget) : undefined,
    mosTarget,
    marginOfSafety:
      intrinsic !== undefined && q.price ? 1 - q.price / intrinsic : undefined,
    status: "UNKNOWN",
    assumptions: {
      growth,
      discount: r,
      terminal: gt,
      eps,
      fcfPerShare: fcfPs,
      bookPerShare: bvps,
    },
  };

  if (intrinsic !== undefined && q.price !== undefined && out.buyBelow !== undefined && out.high !== undefined) {
    // FAIR now means "inside the band the UI actually draws". The old 1.05x cut
    // labelled prices inside the drawn band as PRICEY and vice versa.
    out.status = q.price <= out.buyBelow ? "BUY_ZONE" : q.price <= out.high ? "FAIR" : "PRICEY";
  }
  return out;
}

export const VALUATION_STATUS_META: Record<
  ValuationStatus,
  { label: string; tone: "good" | "neutral" | "warning" | "muted" }
> = {
  BUY_ZONE: { label: "In the buy zone", tone: "good" },
  FAIR: { label: "Around fair value", tone: "neutral" },
  PRICEY: { label: "Above fair value", tone: "warning" },
  UNKNOWN: { label: "Not estimable", tone: "muted" },
};
