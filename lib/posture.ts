import type { AnalyzedHolding, Currency, FxRates } from "./types";
import type { MetricRow } from "./screens";
import type { MacroRegime } from "./macro";
import { toBase } from "./portfolio";
import { buildValuation } from "./valuation";
import { decideAll } from "./decisions";

/**
 * Posture - the answer to "should I be buying at all right now, or holding
 * cash and waiting?"
 *
 * The honest version of that question is NOT a crash forecast. Nobody times
 * markets reliably, and the app refuses to pretend otherwise. But there IS a
 * disciplined reason to hold cash, and every one of the masters used it:
 *
 *   Cash is what accumulates when nothing clears your buy-below price.
 *
 * Buffett sat on record cash in 1969-70, 1998-99 and 2004-07 - never because
 * he predicted the crash, always because the prices on offer failed his test.
 * So this engine measures the OPPORTUNITY SET, not the future: how much of the
 * market you actually scanned is in a buy zone, how much of what you already
 * own is priced for perfection, and what the weather adds to that. From those
 * it derives a target cash BAND, the names that would fund it, and the
 * concrete conditions that would put the cash back to work.
 *
 * Guardrails, both deliberate:
 *   - cash never targets 0% (you always want dry powder), and
 *   - cash never targets more than 40% (Graham's 25% equity floor). Going to
 *     all-cash has cost long-term investors more than every crash combined,
 *     because the re-entry decision is the one nobody gets right.
 */

export type Stance = "DEPLOY" | "BALANCED" | "PATIENT" | "DEFENSIVE";

export interface OpportunitySet {
  scanned: number;
  inBuyZone: number;
  qualityInBuyZone: number; // buy zone AND score ≥ 65
  buyZoneShare?: number; // fraction of scanned names
  heldPricey: number;
  heldTotal: number;
  heldPriceyShare?: number; // share of YOUR value in PRICEY names
}

export interface PostureRead {
  stance: Stance;
  tone: "good" | "neutral" | "warning" | "serious";
  headline: string;
  /** every driver, in plain words, with its number */
  why: string[];
  cashLow: number; // fraction of portfolio
  cashHigh: number;
  /** what to do with new money, in one line */
  newMoney: string;
  /** conditions that would flip this back to buying - checkable, not vibes */
  deployTriggers: string[];
}

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

export function opportunitySet(
  rows: AnalyzedHolding[],
  universe: MetricRow[],
  fx: FxRates
): OpportunitySet {
  const scanned = universe.filter((u) => u.valStatus !== "UNKNOWN");
  const inBuyZone = scanned.filter((u) => u.valStatus === "BUY_ZONE");
  const qualityInBuyZone = inBuyZone.filter((u) => u.score >= 65);

  let heldTotal = 0;
  let heldPricey = 0;
  let priceyCount = 0;
  for (const r of rows) {
    if (r.holding.watch || !r.data || !r.scorecard) continue;
    const v = toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx);
    if (!(v > 0)) continue;
    heldTotal += v;
    const val = buildValuation(r.data, r.scorecard);
    if (val.status === "PRICEY") {
      heldPricey += v;
      priceyCount++;
    }
  }
  return {
    scanned: scanned.length,
    inBuyZone: inBuyZone.length,
    qualityInBuyZone: qualityInBuyZone.length,
    buyZoneShare: scanned.length >= 10 ? inBuyZone.length / scanned.length : undefined,
    heldPricey: priceyCount,
    heldTotal: rows.filter((r) => !r.holding.watch).length,
    heldPriceyShare: heldTotal > 0 ? heldPricey / heldTotal : undefined,
  };
}

export function readPosture(
  opp: OpportunitySet,
  regime?: MacroRegime["key"],
  benchLabel = "the index"
): PostureRead {
  const why: string[] = [];
  // start from a neutral 12% dry-powder band and move it with the evidence
  let low = 0.08;
  let high = 0.15;
  let score = 0; // negative = deploy, positive = defensive

  if (opp.buyZoneShare !== undefined) {
    const s = opp.buyZoneShare;
    if (s >= 0.25) {
      score -= 2;
      why.push(
        `${pct(s)} of the ${opp.scanned} businesses you scanned are inside their buy zone (${opp.qualityInBuyZone} of them also score 65+) - bargains are genuinely available, which is when cash should be working.`
      );
    } else if (s >= 0.12) {
      why.push(
        `${pct(s)} of the ${opp.scanned} scanned businesses are in a buy zone - a normal, workable opportunity set.`
      );
    } else if (s >= 0.05) {
      score += 1;
      why.push(
        `Only ${pct(s)} of the ${opp.scanned} scanned businesses clear their buy-below price - the market is picked over, so new money should be patient and selective.`
      );
    } else {
      score += 2;
      why.push(
        `Just ${pct(s)} of the ${opp.scanned} scanned businesses are in a buy zone. When almost nothing is cheap, cash is not a market call - it is what is left after the discipline says no.`
      );
    }
  } else {
    why.push(
      "No market scan cached yet, so the opportunity set is unknown - run a scan (Ideas › Screeners) and this read gets much sharper."
    );
  }

  if (opp.heldPriceyShare !== undefined && opp.heldTotal > 0) {
    const s = opp.heldPriceyShare;
    if (s >= 0.5) {
      score += 2;
      why.push(
        `${pct(s)} of what you already own is priced above its fair-value band (${opp.heldPricey} of ${opp.heldTotal} positions) - future returns there lean entirely on growth being delivered.`
      );
    } else if (s >= 0.3) {
      score += 1;
      why.push(`${pct(s)} of your portfolio value sits in names the engine calls pricey.`);
    } else {
      why.push(`Only ${pct(s)} of your portfolio value is in pricey names - the book itself is not stretched.`);
    }
  }

  if (regime === "FEAR") {
    score -= 2;
    why.push("The weather is fearful: drawdowns and high volatility are exactly when quality gets mispriced by forced sellers.");
  } else if (regime === "CORRECTION") {
    score -= 1;
    why.push("The market is cooling - watchlist names drift toward their buy-below prices in exactly this kind of tape.");
  } else if (regime === "EXPENSIVE_CALM") {
    score += 1;
    why.push(`Calm at record highs: ${benchLabel} near its peak with low volatility is the classic setting for demanding a bigger margin of safety.`);
  }

  let stance: Stance;
  let tone: PostureRead["tone"];
  let headline: string;
  let newMoney: string;
  if (score <= -2) {
    stance = "DEPLOY";
    tone = "good";
    low = 0.03;
    high = 0.08;
    headline = "Buying weather - put cash to work in tranches.";
    newMoney =
      "Send new money to the buy-zone names on your lists, in 2-3 tranches rather than one buy. Keep a small reserve so a deeper fall is an opportunity, not a regret.";
  } else if (score <= 0) {
    stance = "BALANCED";
    tone = "neutral";
    low = 0.08;
    high = 0.15;
    headline = "Normal conditions - keep the plan running, keep some dry powder.";
    newMoney =
      "Keep SIPs running into index funds and the names that clear your price. There is no edge in changing pace here.";
  } else if (score <= 2) {
    stance = "PATIENT";
    tone = "warning";
    low = 0.15;
    high = 0.25;
    headline = "Few things are cheap - let cash build instead of forcing trades.";
    newMoney =
      "Pause discretionary buying of stocks above their buy-below price. Keep index SIPs going (stopping them has cost far more than it saved), and let the rest accumulate as cash while your watchlist prices come to you.";
  } else {
    stance = "DEFENSIVE";
    tone = "serious";
    low = 0.25;
    high = 0.4;
    headline = "The opportunity set is thin and your book is expensive - this is a raise-cash stretch.";
    newMoney =
      "Trim the most stretched, most oversized positions into strength, hold the proceeds as cash, and keep only the automatic index SIP running. You are not predicting a crash - you are declining to pay prices your own rules reject.";
  }

  const deployTriggers = [
    "Any watchlist name trades at or below the buy-below price on its card - that is the trigger, not a headline.",
    `${benchLabel} falls 15%+ from its high, or the volatility index goes above 28 (the Market weather card flags both).`,
    "The share of scanned businesses in a buy zone climbs back above ~20% - rerun the scan monthly, not daily.",
    "A business you already understand reports a bad quarter for a fixable reason and the price overreacts.",
  ];

  return { stance, tone, headline, why, cashLow: low, cashHigh: high, newMoney, deployTriggers };
}

export interface FundingCandidate {
  symbol: string;
  reason: string;
  value: number;
}

/** Which positions would fund a cash raise - the engine's existing verdicts, ranked. */
export function fundingCandidates(
  rows: AnalyzedHolding[],
  fx: FxRates,
  limit = 5
): FundingCandidate[] {
  const groups = decideAll(rows.filter((r) => !r.holding.watch));
  const out: FundingCandidate[] = [];
  const valueOf = (r: AnalyzedHolding) => toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx);
  for (const r of groups.byAction.EXIT ?? []) {
    out.push({ symbol: r.holding.yahooSymbol, reason: "fails the long-term tests - sell candidate before any trim", value: valueOf(r) });
  }
  for (const r of groups.byAction.TRIM ?? []) {
    out.push({ symbol: r.holding.yahooSymbol, reason: "quality but stretched - trimming a slice funds cash without leaving the business", value: valueOf(r) });
  }
  const total = rows.filter((r) => !r.holding.watch).reduce((a, r) => a + valueOf(r), 0);
  if (total > 0) {
    for (const r of rows) {
      if (r.holding.watch || !r.data || !r.scorecard) continue;
      const w = valueOf(r) / total;
      if (w < 0.15) continue;
      if (out.some((o) => o.symbol === r.holding.yahooSymbol)) continue;
      const val = buildValuation(r.data, r.scorecard);
      if (val.status !== "PRICEY") continue;
      out.push({
        symbol: r.holding.yahooSymbol,
        reason: `${pct(w, 1)} of the portfolio and priced above fair value - the concentration, not the company, is the reason to trim`,
        value: valueOf(r),
      });
    }
  }
  return out.sort((a, b) => b.value - a.value).slice(0, limit);
}
