import type { Scorecard, StockData } from "./types";
import type { Valuation } from "./valuation";

/**
 * The decision-readiness gate.
 *
 * Born from an external adversarial review whose single demanded change was:
 * "block every buy, add, trim, exit, switch and exact-price output until
 * sector-specific evidence, source provenance, data completeness, account/tax
 * context and valuation uncertainty pass explicit tests; when they do not,
 * the tool must say only 'not decision-ready', and explain why."
 *
 * That is what this module does. Every stock card and deep dive runs through
 * it, and the answer travels WITH the verdict:
 *
 *   FULL    - every gate passed; the verdict can be read as written.
 *   PARTIAL - the verdict stands but named gaps remain; read them first.
 *   BLOCKED - action words (add/trim/exit/prices) must not be shown as
 *             actionable at all; the honest output is the gap list.
 *
 * Two deliberate design points:
 *  - Financials NEVER reach FULL. Loan-book quality (bad loans, capital
 *    adequacy, deposit mix) does not exist in this app's free data, so for a
 *    bank the model is partial by construction, and says so every time.
 *  - The provenance note is permanent. Everything here is unofficial Yahoo
 *    aggregates, not audited filings - no amount of green chips changes that.
 */

export type ReadinessLevel = "full" | "partial" | "blocked";

export interface Readiness {
  level: ReadinessLevel;
  /** chip text: "Decision-ready" | "Partly ready" | "Not decision-ready" */
  label: string;
  /** what keeps it from FULL, most serious first, plain language */
  gaps: string[];
  /** always-true context (data provenance) - shown after the gaps */
  notes: string[];
  /** BLOCKED ⇒ the UI must not render buy/add/trim wording as actionable */
  suppressActions: boolean;
}

export const READINESS_META: Record<
  ReadinessLevel,
  { label: string; tone: "good" | "warning" | "critical"; icon: string }
> = {
  full: { label: "Decision-ready", tone: "good", icon: "✓" },
  partial: { label: "Partly ready", tone: "warning", icon: "◐" },
  blocked: { label: "Not decision-ready", tone: "critical", icon: "✕" },
};

const PROVENANCE_NOTE =
  "All inputs are unofficial Yahoo Finance aggregates, not audited filings. Before real money moves, re-check the facts that matter against the company's own filings - the pre-buy AI prompt is built to do exactly that.";

export function assessReadiness(args: {
  card?: Scorecard;
  data?: StockData;
  valuation?: Valuation;
  /** holding.account when known - "TFSA + RRSP" style values trigger the tax-context gap */
  account?: string;
}): Readiness {
  const { card, data, valuation, account } = args;
  const gaps: string[] = [];
  let anyBlocked = false;
  const demote = (to: "blocked" | "partial", gap: string) => {
    gaps.push(gap);
    if (to === "blocked") anyBlocked = true;
  };

  if (!card || !data) {
    return {
      level: "blocked",
      label: READINESS_META.blocked.label,
      gaps: ["No scored data for this position yet - nothing to base a decision on."],
      notes: [PROVENANCE_NOTE],
      suppressActions: true,
    };
  }

  // ---------- hard blocks ----------
  if (card.verdict === "INSUFFICIENT_DATA") {
    demote(
      "blocked",
      `Not enough fundamental history to score (${Math.round(card.coverage * 100)}% of the checklist answerable, ${card.ratios.length} fiscal year${card.ratios.length === 1 ? "" : "s"}). Common for funds and new listings - judge those by other means, not this scorecard.`,
    );
  }
  const negEq = card.ratios[card.ratios.length - 1]?.negativeEquity === true;
  if (negEq) {
    demote(
      "blocked",
      "Shareholders' equity is negative, so the balance-sheet ratios this engine leans on cannot be read normally. No buy/add call is defensible from this data.",
    );
  }
  if (data.quote.price === undefined) {
    demote(
      "blocked",
      "No live price. Every price-anchored output (buy-below, margin of safety, trim-into-strength) is uncomputable right now.",
    );
  }

  // ---------- partial gates ----------
  if (!negEq && card.criticalFlags.length > 0) {
    demote(
      "partial",
      `A solvency-level red flag is active (${card.criticalFlags.length === 1 ? "1 item" : `${card.criticalFlags.length} items`} marked critical on the scorecard) - the verdict is capped at Watch until it clears.`,
    );
  }
  if (card.verdict !== "INSUFFICIENT_DATA") {
    if (card.coverage < 0.6) {
      demote(
        "partial",
        `Only ${Math.round(card.coverage * 100)}% of the checklist could be scored from available data - the n/a rows on the scorecard are open questions, not passes.`,
      );
    }
    if (card.ratios.length < 3) {
      demote(
        "partial",
        `Only ${card.ratios.length} fiscal years of history. The 5-year lens this app is built on needs at least 3 to mean anything.`,
      );
    }
  }
  if (valuation) {
    if (valuation.intrinsic === undefined || valuation.status === "UNKNOWN") {
      demote(
        "partial",
        "No fair-value estimate could be built, so there is no buy-below price - price discipline has to come from your own homework on this one.",
      );
    } else if (valuation.confidence === "conflicting") {
      demote(
        "partial",
        `The ${valuation.methodCount ?? 0} valuation methods disagree by ${valuation.spread !== undefined ? `${valuation.spread.toFixed(1)}x` : "a wide margin"}${valuation.methodLow !== undefined && valuation.methodHigh !== undefined ? ` (${valuation.methodLow.toFixed(0)} to ${valuation.methodHigh.toFixed(0)} per share)` : ""} - treat the fair-value band as a sketch, not a target.`,
      );
    } else if (valuation.confidence === "thin") {
      demote(
        "partial",
        (valuation.methodCount ?? 0) >= 3
          ? `The ${valuation.methodCount} valuation methods agree only loosely${valuation.spread !== undefined ? ` (${valuation.spread.toFixed(1)}x apart)` : ""} - the fair-value band is drawn wider to say so.`
          : `Fair value rests on ${valuation.methodCount === 1 ? "a single method" : "only two methods"} - not a triangulation. The band is drawn wider to say so.`,
      );
    }
  }
  if (card.isFinancialSector) {
    demote(
      "partial",
      "Bank/financial: loan-book quality - bad loans (NPAs), capital adequacy, deposit mix - is invisible to this app's data. The model here is partial BY DESIGN; read the regulator filings (RBI/OSFI) before sizing this position up.",
    );
  }
  if (account && account.includes("+")) {
    demote(
      "partial",
      `This position spans accounts (${account}). Tax on any sale differs by account - registered vs taxable is a different decision - and this app cannot see which units sit where.`,
    );
  }

  const level: ReadinessLevel = anyBlocked ? "blocked" : gaps.length > 0 ? "partial" : "full";
  return {
    level,
    label: READINESS_META[level].label,
    gaps,
    notes: [PROVENANCE_NOTE],
    suppressActions: level === "blocked",
  };
}
