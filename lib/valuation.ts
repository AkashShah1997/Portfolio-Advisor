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
  /** max/min across the methods - above ~2.25x they are not really agreeing */
  spread?: number;
  /** triangulated = 3+ methods within 1.75x; thin = few; conflicting = wide spread */
  confidence?: "triangulated" | "thin" | "conflicting";
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
  const vals = methods.map((m) => m.value).filter((v) => Number.isFinite(v) && v > 0);
  const spread = vals.length >= 2 ? Math.max(...vals) / Math.min(...vals) : undefined;
  // Tightened after external review: the methods share inputs (the same EPS
  // feeds Graham, the P/E anchor and the growth formula), so their agreement
  // overstates independence. "Triangulated" now demands they sit within 1.75x
  // of each other, and anything past 2.25x is called what it is - conflicting.
  const confidence: "triangulated" | "thin" | "conflicting" =
    vals.length >= 3 && (spread ?? 1) <= 1.75 ? "triangulated" : (spread ?? 99) > 2.25 ? "conflicting" : "thin";
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
