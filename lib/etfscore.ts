import type { Market } from "./store";
import { catalogMer, categoryOf, type CatalogOption, type EtfCategory, type EtfKind } from "./etfcatalog";
import { fundDataEmpty, type EtfData } from "./etf";

/**
 * ETF assessment — "which to increase, which to reduce, and what's the
 * cheaper twin". Passive funds are judged on the things that actually decide
 * long-run outcomes: cost (MER), what they track, duplication, concentration,
 * and size — NOT last quarter's return.
 *
 * Verdicts:
 *   INCREASE — low-cost broad-market core: the "buy more, forever" bucket
 *   HOLD     — fine as it is
 *   SWITCH   — same exposure exists meaningfully cheaper (the MER play)
 *   REDUCE   — overweight niche/commodity, chronically expensive, or tiny fund
 *   UNKNOWN  — no fee/return data anywhere to judge with
 */

export type EtfVerdict = "INCREASE" | "HOLD" | "SWITCH" | "REDUCE" | "UNKNOWN";

export type MerBand = "excellent" | "fair" | "high" | "expensive" | "unknown";

export interface EtfAlternative extends CatalogOption {
  savesPerYear: number; // value × ΔMER, stock currency
  saves10y: number; // compounded fee-drag difference over 10y
}

export interface EtfAssessment {
  symbol: string;
  verdict: EtfVerdict;
  headline: string; // one-line verdict reasoning
  reasons: string[]; // evidence bullets (drive the verdict)
  cautions: string[]; // softer notes
  category?: EtfCategory;
  effMer?: number; // the MER used (live Yahoo, else catalog approx)
  merSource?: "live" | "catalog";
  merBand: MerBand;
  annualFee?: number; // value × effMer
  drag10y?: number; // what fees compound to over 10y vs a free fund
  weightPct?: number; // share of portfolio value
  alternatives: EtfAlternative[]; // cheaper same-category options, best first
  overlapWith: string[]; // other HELD symbols in the same category
}

/**
 * What fees quietly cost over time: end-value gap between growing at g and
 * growing at (g − mer). The honest way to show a "tiny" 0.8% fee.
 */
export function feeDrag(value: number, mer: number, years: number, growth = 0.1): number {
  if (!(value > 0) || !(mer > 0) || !(years > 0)) return 0;
  return value * (Math.pow(1 + growth, years) - Math.pow(1 + growth - mer, years));
}

/** MER banding by fund kind (fractions per year). */
const BANDS: Record<EtfKind, { excellent: number; fair: number; high: number }> = {
  core: { excellent: 0.001, fair: 0.003, high: 0.006 },
  satellite: { excellent: 0.0025, fair: 0.0045, high: 0.0075 },
  commodity: { excellent: 0.0035, fair: 0.006, high: 0.009 },
  bond: { excellent: 0.001, fair: 0.0025, high: 0.005 },
};

export function merBandOf(mer: number | undefined, kind: EtfKind): MerBand {
  if (mer === undefined) return "unknown";
  const b = BANDS[kind];
  if (mer <= b.excellent) return "excellent";
  if (mer <= b.fair) return "fair";
  if (mer <= b.high) return "high";
  return "expensive";
}

export const MER_BAND_META: Record<MerBand, { label: string; tone: "good" | "neutral" | "warning" | "serious" | "muted" }> = {
  excellent: { label: "rock-bottom cost", tone: "good" },
  fair: { label: "reasonable cost", tone: "neutral" },
  high: { label: "costly", tone: "warning" },
  expensive: { label: "expensive", tone: "serious" },
  unknown: { label: "cost unknown", tone: "muted" },
};

export const ETF_VERDICT_META: Record<
  EtfVerdict,
  { label: string; icon: string; tone: "good" | "neutral" | "warning" | "serious" | "critical" | "muted" }
> = {
  INCREASE: { label: "Core — add-worthy", icon: "▲", tone: "good" },
  HOLD: { label: "Hold", icon: "●", tone: "neutral" },
  SWITCH: { label: "Cheaper twin exists", icon: "⇄", tone: "warning" },
  REDUCE: { label: "Reduce", icon: "▼", tone: "critical" },
  UNKNOWN: { label: "No fund data", icon: "?", tone: "muted" },
};

const MIN_SWITCH_DELTA = 0.0015; // ≥0.15%/yr saved before we call it a switch
const SMALL_AUM: Record<Market, { min: number; label: string }> = {
  india: { min: 1e9, label: "₹100 Cr" }, // 100 crore
  canada: { min: 1e8, label: "$100M" },
};

export interface HeldEtfInput {
  etf: EtfData;
  value: number; // current value, stock currency (per-market app ⇒ base ≈ stock ccy)
}

const pctS = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;

export function assessEtf(
  input: HeldEtfInput,
  ctx: {
    market: Market;
    portfolioTotal: number; // same currency as value
    heldByCategory: Map<string, HeldEtfInput[]>;
  }
): EtfAssessment {
  const { etf, value } = input;
  const cat = categoryOf(ctx.market, etf.symbol, etf.name, etf.category);
  const kind: EtfKind = cat?.kind ?? "satellite";

  // effective MER: live Yahoo → catalog approximation
  let effMer = etf.mer ?? etf.netExpenseRatio;
  let merSource: "live" | "catalog" | undefined = effMer !== undefined ? "live" : undefined;
  if (effMer === undefined) {
    const c = catalogMer(etf.symbol);
    if (c) {
      effMer = c.mer;
      merSource = "catalog";
    }
  }

  const weightPct = ctx.portfolioTotal > 0 ? value / ctx.portfolioTotal : undefined;
  const band = merBandOf(effMer, kind);
  const annualFee = effMer !== undefined && value > 0 ? value * effMer : undefined;
  const drag10y = effMer !== undefined && value > 0 ? feeDrag(value, effMer, 10) : undefined;

  const reasons: string[] = [];
  const cautions: string[] = [];

  // ---- alternatives: same category, meaningfully cheaper ----
  const alternatives: EtfAlternative[] = [];
  if (cat && effMer !== undefined) {
    for (const o of cat.options) {
      if (o.symbol.toUpperCase() === etf.symbol.toUpperCase()) continue;
      const delta = effMer - o.mer;
      if (delta < MIN_SWITCH_DELTA) continue;
      alternatives.push({
        ...o,
        savesPerYear: value * delta,
        saves10y: value * (Math.pow(1.1 - o.mer, 10) - Math.pow(1.1 - effMer, 10)),
      });
    }
    alternatives.sort((a, b) => a.mer - b.mer);
  }

  // ---- duplication with other held funds ----
  const overlapWith = (cat ? (ctx.heldByCategory.get(cat.key) ?? []) : [])
    .filter((h) => h.etf.symbol !== etf.symbol)
    .map((h) => h.etf.symbol);

  // ---- verdict flags ----
  let reduce = false;
  let sw = false;
  let increase = false;

  if (overlapWith.length) {
    const peers = ctx.heldByCategory.get(cat!.key)!;
    const cheapest = [...peers].sort(
      (a, b) => (a.etf.mer ?? catalogMer(a.etf.symbol)?.mer ?? 1) - (b.etf.mer ?? catalogMer(b.etf.symbol)?.mer ?? 1)
    )[0];
    if (cheapest.etf.symbol !== etf.symbol) {
      sw = true;
      reasons.push(
        `Duplicates ${overlapWith.join(", ")} — same ${cat!.label.toLowerCase()} exposure; consolidating into the cheapest keeps it simple.`
      );
    } else {
      cautions.push(`Overlaps ${overlapWith.join(", ")} (same category) — you effectively own this index twice.`);
    }
  }

  if (alternatives.length && effMer !== undefined) {
    const best = alternatives[0];
    sw = true;
    reasons.push(
      `Same exposure for less: ${best.symbol.replace(/\.(NS|TO)$/, "")} charges ~${pctS(best.mer)} vs ~${pctS(effMer)} here — keeps ≈${pctS(effMer - best.mer)}/yr of YOUR return.`
    );
  }

  if (band === "expensive") {
    reduce = true;
    reasons.push(`MER ~${pctS(effMer!)} is expensive for a ${kind} fund — fees are the one certainty in investing.`);
  } else if (band === "high") {
    cautions.push(`MER ~${pctS(effMer!)} sits on the high side for a ${kind} fund.`);
  }

  if (etf.aum !== undefined && etf.aum > 0 && etf.aum < SMALL_AUM[ctx.market].min) {
    cautions.push(
      `Small fund (AUM below ${SMALL_AUM[ctx.market].label}) — wider spreads and a real chance of closure/merger.`
    );
  }

  if ((kind === "commodity" || kind === "satellite") && weightPct !== undefined) {
    const cap = kind === "commodity" ? 0.1 : 0.15;
    if (weightPct > cap) {
      reduce = true;
      reasons.push(
        `${pctS(weightPct, 1)} of the portfolio in a ${kind === "commodity" ? "commodity" : "narrow/sector"} fund — ${
          kind === "commodity" ? "gold/silver is insurance, not the engine; the classic cap is ~5–10%" : "satellite bets earn ~10–15% at most"
        }.`
      );
    }
  }

  if (
    kind === "core" &&
    (band === "excellent" || band === "fair") &&
    !reduce &&
    !sw &&
    effMer !== undefined
  ) {
    increase = true;
    reasons.push(
      `Low-cost broad-market compounding machine (~${pctS(effMer)}/yr) — Bogle's default for money you'll not touch for years.`
    );
  }

  if (effMer === undefined && fundDataEmpty(etf)) {
    return {
      symbol: etf.symbol,
      verdict: "UNKNOWN",
      headline: "Yahoo carries no fee or performance data for this fund — judge it from the AMC factsheet.",
      reasons: [],
      cautions,
      category: cat,
      merBand: "unknown",
      weightPct,
      alternatives: [],
      overlapWith,
    };
  }

  const verdict: EtfVerdict = reduce ? "REDUCE" : sw ? "SWITCH" : increase ? "INCREASE" : "HOLD";
  const headline =
    verdict === "REDUCE"
      ? "Trim this one — the evidence below says the money works harder elsewhere."
      : verdict === "SWITCH"
        ? "Keep the exposure, lose the fee — a near-identical fund charges less."
        : verdict === "INCREASE"
          ? "This is the kind of fund you add to on autopilot and judge once a decade."
          : "Nothing here demands action — costs and sizing look sane.";

  if (verdict === "HOLD" && !reasons.length) {
    reasons.push(
      effMer !== undefined
        ? `MER ~${pctS(effMer)} (${MER_BAND_META[band].label}) with no cheaper same-index twin worth the churn.`
        : "No fee data, but nothing else raises a flag."
    );
  }

  return {
    symbol: etf.symbol,
    verdict,
    headline,
    reasons,
    cautions,
    category: cat,
    effMer,
    merSource,
    merBand: band,
    annualFee,
    drag10y,
    weightPct,
    alternatives,
    overlapWith,
  };
}

/** Assess every held ETF together (so duplication is visible). */
export function assessAll(
  held: HeldEtfInput[],
  ctx: { market: Market; portfolioTotal: number }
): EtfAssessment[] {
  const heldByCategory = new Map<string, HeldEtfInput[]>();
  for (const h of held) {
    const cat = categoryOf(ctx.market, h.etf.symbol, h.etf.name, h.etf.category);
    if (!cat) continue;
    const arr = heldByCategory.get(cat.key) ?? [];
    arr.push(h);
    heldByCategory.set(cat.key, arr);
  }
  return held
    .map((h) => assessEtf(h, { ...ctx, heldByCategory }))
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0));
}
