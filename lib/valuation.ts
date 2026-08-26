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

  // growth: prefer EPS CAGR, else revenue CAGR; 25% haircut, clamped 2–14%
  const rawG = [sc.cagr.eps, sc.cagr.revenue].find(
    (v): v is number => v !== undefined && Number.isFinite(v) && v > 0
  );
  const growth = rawG !== undefined ? clamp(rawG * 0.75, 0.02, 0.14) : undefined;

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
    for (let t = 1; t <= 10; t++) {
      const gT = growth + ((gt - growth) * (t - 1)) / 9; // fade g → terminal over 10y
      f = f * (1 + gT);
      pv += f / Math.pow(1 + r, t);
    }
    pv += (f * (1 + gt)) / (r - gt) / Math.pow(1 + r, 10);
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
  const mosTarget = sc.totalScore >= 70 ? 0.2 : sc.totalScore >= 55 ? 0.3 : 0.4;

  const out: Valuation = {
    methods,
    intrinsic,
    low: intrinsic !== undefined ? intrinsic * 0.8 : undefined,
    high: intrinsic !== undefined ? intrinsic * 1.2 : undefined,
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

  if (intrinsic !== undefined && q.price !== undefined && out.buyBelow !== undefined) {
    out.status =
      q.price <= out.buyBelow ? "BUY_ZONE" : q.price <= intrinsic * 1.05 ? "FAIR" : "PRICEY";
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
