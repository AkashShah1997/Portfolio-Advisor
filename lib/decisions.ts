import type { AnalyzedHolding } from "./types";
import { buildValuation, type Valuation } from "./valuation";

/**
 * The decision engine — turns each holding's evidence into ONE clear action
 * for a 5-year+ owner, with every reason shown. This is where "I've held this
 * for years and it's done nothing" gets a straight answer.
 *
 * Dead money test (the 2–5 year underperformer): the PRICE went nowhere AND
 * the BUSINESS went nowhere. A flat price on growing earnings is a coiled
 * spring (often a buy); a flat price on flat earnings is a parked car.
 */

export type Action = "EXIT" | "TRIM" | "HOLD" | "ACCUMULATE" | "REVIEW";

export interface Decision {
  action: Action;
  headline: string;
  reasons: string[];
  deadMoney: boolean;
  priceCagr?: number; // long-run price compounding from available history
  spanYears?: number;
  valuation: Valuation;
}

export const ACTION_META: Record<
  Action,
  { label: string; tone: "critical" | "warning" | "neutral" | "good" | "muted"; icon: string; sub: string }
> = {
  EXIT: {
    label: "Consider exiting",
    tone: "critical",
    icon: "✕",
    sub: "Fails the long-term tests — capital likely compounds faster elsewhere",
  },
  TRIM: {
    label: "Trim / stop adding",
    tone: "warning",
    icon: "▼",
    sub: "Thesis weakening or price rich for the quality — no new money",
  },
  HOLD: {
    label: "Hold",
    tone: "neutral",
    icon: "●",
    sub: "Quality intact — sit tight and review on results",
  },
  ACCUMULATE: {
    label: "Accumulate",
    tone: "good",
    icon: "▲",
    sub: "Quality business at a defensible price — where new money belongs",
  },
  REVIEW: {
    label: "Judge separately",
    tone: "muted",
    icon: "?",
    sub: "Not enough fundamental history to score (ETFs, new listings)",
  },
};

const pct = (v: number | undefined, d = 1) => (v === undefined ? "n/a" : `${(v * 100).toFixed(d)}%`);

/** Annualized price return from the available monthly history (needs ≥ 2.5 years). */
export function priceCagrOf(prices: { date: string; close: number }[]): { cagr?: number; years?: number } {
  if (!prices || prices.length < 2) return {};
  const first = prices[0];
  const last = prices[prices.length - 1];
  const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 2.5 || first.close <= 0 || last.close <= 0) return { years };
  return { cagr: Math.pow(last.close / first.close, 1 / years) - 1, years };
}

export function decideRow(r: AnalyzedHolding): Decision {
  const sc = r.scorecard;
  const data = r.data;

  if (!sc || !data || sc.verdict === "INSUFFICIENT_DATA") {
    return {
      action: "REVIEW",
      headline: "Not enough history to score mechanically — judge this one on its own terms.",
      reasons: [r.error ? `Data fetch failed: ${r.error}` : "Insufficient fundamental history (common for ETFs and new listings)."],
      deadMoney: false,
      valuation: sc && data ? buildValuation(data, sc) : ({ methods: [], mosTarget: 0.3, status: "UNKNOWN", assumptions: { discount: 0.1, terminal: 0.03 } } as Valuation),
    };
  }

  const val = buildValuation(data, sc);
  const { cagr: priceCagr, years: spanYears } = priceCagrOf(data.prices);
  const epsCagr = sc.cagr.eps;
  const revCagr = sc.cagr.revenue;
  const score = sc.totalScore;
  const flags = sc.redFlags.length;

  const businessFlat = (epsCagr ?? revCagr ?? 0) < 0.05;
  const deadMoney = priceCagr !== undefined && priceCagr < 0.04 && businessFlat;

  const reasons: string[] = [];
  if (priceCagr !== undefined && spanYears)
    reasons.push(`Price has compounded ${pct(priceCagr)}/yr over the last ~${spanYears.toFixed(0)} years`);
  reasons.push(`Business growth: EPS ${pct(epsCagr)}/yr, revenue ${pct(revCagr)}/yr over ${sc.cagr.years}y`);
  reasons.push(`Scorecard ${score}/100 across ${sc.pillars.filter((p) => p.applicable).length} pillars`);
  if (r.pnlPct !== undefined) reasons.push(`Your position: ${r.pnlPct >= 0 ? "+" : ""}${pct(r.pnlPct)} unrealized`);
  if (val.marginOfSafety !== undefined)
    reasons.push(
      val.marginOfSafety >= 0
        ? `Price sits ${pct(val.marginOfSafety, 0)} below the rough fair-value estimate`
        : `Price sits ${pct(-val.marginOfSafety, 0)} ABOVE the rough fair-value estimate`
    );
  if (flags) reasons.push(`${flags} red flag${flags > 1 ? "s" : ""}: ${sc.redFlags[0]}${flags > 1 ? " …" : ""}`);
  if (deadMoney)
    reasons.push("Dead-money pattern: flat price AND flat earnings — the market isn't wrong to yawn here.");

  let action: Action;
  let headline: string;

  if (sc.verdict === "REVIEW_EXIT") {
    action = "EXIT";
    headline = "Fails core quality tests. Re-examine why you own it — a leaking boat patches slowly.";
  } else if (deadMoney && score < 60) {
    action = "EXIT";
    headline = "Years of flat price on a flat business with a weak scorecard — classic dead money. Recycle into a compounder.";
  } else if (sc.verdict === "WATCH") {
    action = "TRIM";
    headline = "Thesis is weakening on the numbers. Stop adding; give it 2–4 quarters to prove itself, then decide.";
  } else if (score >= 70 && (val.status === "BUY_ZONE" || (val.status === "FAIR" && (val.marginOfSafety ?? -1) >= 0))) {
    action = "ACCUMULATE";
    headline =
      val.status === "BUY_ZONE"
        ? "Wonderful business inside the buy zone — this is what the masters wait years for."
        : "Wonderful business at a fair price — steady accumulation beats waiting for perfect.";
  } else if (score >= 70) {
    action = "HOLD";
    headline = "Wonderful business, rich price. Hold what you own; add only on meaningful dips.";
  } else if (score >= 55) {
    action = "HOLD";
    headline = "Solid but not exceptional. Hold and review annually — don't add until quality or price improves.";
  } else {
    action = "TRIM";
    headline = "Below the quality bar without an outright failure. No new money; look for a stronger home for the next rupee/dollar.";
  }

  // A flat-price + GROWING business is a coiled spring — never call it an exit on price alone.
  if (action === "EXIT" && !businessFlat && (epsCagr ?? 0) >= 0.1 && score >= 55) {
    action = "HOLD";
    headline = "Price has lagged but the business keeps compounding — that's a valuation reset, not decay. Re-check the thesis, don't panic-sell.";
  }

  return { action, headline, reasons, deadMoney, priceCagr, spanYears, valuation: val };
}

export interface DecisionGroups {
  order: Action[];
  byAction: Record<Action, AnalyzedHolding[]>;
  decisions: Map<string, Decision>;
}

export function decideAll(rows: AnalyzedHolding[]): DecisionGroups {
  const decisions = new Map<string, Decision>();
  const byAction: Record<Action, AnalyzedHolding[]> = {
    EXIT: [],
    TRIM: [],
    HOLD: [],
    ACCUMULATE: [],
    REVIEW: [],
  };
  for (const r of rows) {
    if (r.holding.watch) continue; // watchlist carries no capital → no action needed
    const d = decideRow(r);
    decisions.set(r.holding.id, d);
    byAction[d.action].push(r);
  }
  for (const a of Object.keys(byAction) as Action[]) {
    byAction[a].sort((x, y) => (x.scorecard?.totalScore ?? 0) - (y.scorecard?.totalScore ?? 0));
    if (a === "ACCUMULATE" || a === "HOLD") byAction[a].reverse();
  }
  return { order: ["EXIT", "TRIM", "ACCUMULATE", "HOLD", "REVIEW"], byAction, decisions };
}
