import type { AnalyzedHolding, Scorecard, StockData } from "./types";
import type { Valuation } from "./valuation";
import { capTierOf } from "./screens";
import { isEtfHolding } from "./etf";
import { aiBucketFor } from "./resilience";

/**
 * Conviction vs speculation.
 *
 * A conviction holding and a speculative one can carry the SAME price target
 * and the same excitement. What separates them is not the upside - it is how
 * much of the case rests on verifiable facts versus assumptions about the
 * future, and whether the evidence is complete enough to argue with.
 *
 * So this does not score "how good is this stock". It scores HOW MUCH OF THE
 * CASE IS KNOWN, across four questions:
 *
 *   1. Is the record long and complete enough to judge? (data coverage)
 *   2. Has the business already proven quality - not promised it? (proof)
 *   3. Does the return need heroic assumptions to work? (price dependence)
 *   4. Can it survive being wrong for two years? (durability)
 *
 * A stock can be a fine speculation. The failure mode this guards against is
 * buying a speculation while BELIEVING it is a conviction - which is what
 * makes people size it like a conviction and hold it like one.
 */

export type ConvictionGrade = "CONVICTION" | "REASONABLE" | "SPECULATIVE" | "UNKNOWABLE";

export interface ConvictionPillar {
  key: "evidence" | "proof" | "price" | "durability";
  label: string;
  /** 0-100 */
  score: number;
  /** the facts behind the score, in plain words */
  notes: string[];
  /** what is MISSING - the honest gaps */
  gaps: string[];
}

export interface ConvictionRead {
  grade: ConvictionGrade;
  score: number; // 0-100 overall
  headline: string;
  pillars: ConvictionPillar[];
  /** the specific things that would have to be true for this to work out */
  assumptions: string[];
  /** what would turn this from speculation into conviction */
  toConviction: string[];
  /** position-size guidance that follows from the grade, not from enthusiasm */
  sizing: string;
}

export const GRADE_META: Record<
  ConvictionGrade,
  { label: string; tone: "good" | "neutral" | "warning" | "serious" | "muted"; blurb: string }
> = {
  CONVICTION: {
    label: "Conviction",
    tone: "good",
    blurb: "Long proven record, price you can defend, survives a bad year. The kind of position you can size properly and hold through a crash.",
  },
  REASONABLE: {
    label: "Reasonable",
    tone: "neutral",
    blurb: "A decent case with real gaps. Own it if you understand the gaps - at a size that respects them.",
  },
  SPECULATIVE: {
    label: "Speculative",
    tone: "serious",
    blurb: "The return depends on assumptions rather than on what the business has already proven. That can still work - but size it as the bet it is.",
  },
  UNKNOWABLE: {
    label: "Not judgeable",
    tone: "muted",
    blurb: "Too little history or data to separate conviction from speculation. Absence of evidence is not evidence of quality.",
  },
};

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

export function convictionOf(input: {
  data: StockData;
  scorecard: Scorecard;
  valuation?: Valuation;
  holding?: AnalyzedHolding["holding"];
}): ConvictionRead {
  const { data, scorecard: sc, valuation: val } = input;
  const q = data.quote;
  const years = data.years ?? [];
  const pillars: ConvictionPillar[] = [];
  const assumptions: string[] = [];
  const toConviction: string[] = [];

  // ---------- 1. Evidence: is there enough record to judge at all? ----------
  {
    const notes: string[] = [];
    const gaps: string[] = [];
    let s = 0;
    const n = years.length;
    if (n >= 5) {
      s += 40;
      notes.push(`${n} fiscal years of statements on file - enough to see a cycle, not just a moment`);
    } else if (n >= 3) {
      s += 22;
      gaps.push(`only ${n} years of statements - too short to have been tested by a downturn`);
    } else {
      gaps.push(`${n} year${n === 1 ? "" : "s"} of statements - effectively no record to judge`);
    }
    const applicable = sc.checks.filter((c) => c.status !== "na").length;
    const coverage = sc.checks.length ? applicable / sc.checks.length : 0;
    s += Math.round(coverage * 35);
    if (coverage >= 0.8) notes.push(`${pct(coverage)} of the engine's checks could actually be computed`);
    else gaps.push(`only ${pct(coverage)} of the checks had the data to run - the rest are blanks, not passes`);
    if (val?.methodCount !== undefined) {
      if (val.confidence === "triangulated") {
        s += 25;
        notes.push(`${val.methodCount} independent valuation methods agree within a normal range`);
      } else if (val.confidence === "conflicting") {
        gaps.push(`the valuation methods disagree by ${val.spread?.toFixed(1)}x - there is no single defensible fair value here`);
      } else {
        s += 10;
        gaps.push(`only ${val.methodCount} valuation method${val.methodCount === 1 ? "" : "s"} could be built - a thin anchor`);
      }
    } else {
      gaps.push("no fair-value estimate could be built at all");
    }
    pillars.push({ key: "evidence", label: "Evidence you can check", score: Math.min(100, s), notes, gaps });
  }

  // ---------- 2. Proof: has quality already happened? ----------
  {
    const notes: string[] = [];
    const gaps: string[] = [];
    let s = 0;
    const passed = (id: string) => sc.checks.find((c) => c.id === id)?.status === "pass";
    const roeAvg = sc.ratios.map((r) => r.roe).filter((v): v is number => v !== undefined);
    const profitable = years.map((y) => y.netIncome).filter((v): v is number => v !== undefined);
    const lossYears = profitable.filter((v) => v <= 0).length;

    if (passed("roce") || passed("roe") || passed("roa")) {
      s += 30;
      notes.push("already earns high returns on capital - the moat is in the numbers, not the story");
    } else {
      gaps.push("returns on capital have not cleared the quality bar - the moat is still a claim");
      assumptions.push("that returns on capital improve from here");
    }
    if (profitable.length >= 3 && lossYears === 0) {
      s += 25;
      notes.push(`profitable in every one of the last ${profitable.length} years`);
    } else if (lossYears > 0) {
      gaps.push(`${lossYears} loss-making year${lossYears === 1 ? "" : "s"} on record`);
      assumptions.push("that profitability is now durable rather than cyclical");
    }
    if (passed("coffeecan")) {
      s += 20;
      notes.push("clears the Coffee Can bar: growth AND high returns, year after year");
    }
    if (passed("fcfpos")) {
      s += 15;
      notes.push("converts profit into actual cash in most years");
    } else {
      gaps.push("free cash flow has not been reliably positive - accounting profit is not cash");
      assumptions.push("that reported profits eventually turn into cash");
    }
    if (sc.fscore && sc.fscore.score / sc.fscore.of >= 0.66) {
      s += 10;
      notes.push(`fundamentals improving (Piotroski ${sc.fscore.score}/${sc.fscore.of})`);
    }
    if (roeAvg.length < 3) gaps.push("too few years of returns data to call the record consistent");
    pillars.push({ key: "proof", label: "Proof already delivered", score: Math.min(100, s), notes, gaps });
  }

  // ---------- 3. Price: how much of the return needs the future to cooperate? ----------
  {
    const notes: string[] = [];
    const gaps: string[] = [];
    let s = 50; // neutral until we know the price
    const pe = q.trailingPE;
    const growth = sc.cagr.eps ?? sc.cagr.revenue;
    if (val?.status === "BUY_ZONE") {
      s = 95;
      notes.push("trading inside the buy zone - the margin of safety is doing the work, not the forecast");
    } else if (val?.status === "FAIR") {
      s = 70;
      notes.push("priced inside the fair-value band - returns should track the business");
    } else if (val?.status === "PRICEY") {
      s = 25;
      gaps.push(
        `priced above the fair-value band${val.marginOfSafety !== undefined ? ` by ${pct(-val.marginOfSafety)}` : ""} - today's price already assumes the good outcome`
      );
      assumptions.push("that growth arrives fast enough to justify a price the engine already calls rich");
    } else {
      s = 35;
      gaps.push("no defensible fair value, so there is no way to know what you are paying for");
    }
    if (pe !== undefined && pe > 0 && growth !== undefined) {
      const peg = pe / Math.max(growth * 100, 0.1);
      if (growth <= 0) {
        s = Math.min(s, 20);
        gaps.push("paying a positive multiple for earnings that are shrinking");
        assumptions.push("that the earnings decline reverses");
      } else if (peg > 2.5) {
        s = Math.min(s, 30);
        gaps.push(`P/E ${pe.toFixed(0)} against ${pct(growth)} growth (PEG ${peg.toFixed(1)}) - years of the future are prepaid`);
        assumptions.push(`that growth sustains near ${pct(growth)} for many years`);
      } else if (peg <= 1.2) {
        notes.push(`P/E ${pe.toFixed(0)} against ${pct(growth)} growth - you are not prepaying the future`);
      }
    }
    if (pe !== undefined && pe > 60) {
      s = Math.min(s, 20);
      gaps.push(`a P/E of ${pe.toFixed(0)} leaves no room for a single disappointment`);
    }
    pillars.push({ key: "price", label: "Price does not need heroics", score: Math.max(0, Math.min(100, s)), notes, gaps });
  }

  // ---------- 4. Durability: can it survive being wrong for two years? ----------
  {
    const notes: string[] = [];
    const gaps: string[] = [];
    let s = 0;
    const last = sc.ratios[sc.ratios.length - 1];
    const tier = capTierOf(q.marketCap, data.symbol);
    if (last?.negativeEquity) {
      gaps.push("shareholders' equity is negative - the balance sheet itself is the risk");
    } else if (last?.debtToEquity !== undefined) {
      if (last.debtToEquity <= 0.5) {
        s += 35;
        notes.push(`low debt (D/E ${last.debtToEquity.toFixed(2)}) - a bad year does not hand control to lenders`);
      } else if (last.debtToEquity <= 1.5) s += 18;
      else {
        gaps.push(`leveraged (D/E ${last.debtToEquity.toFixed(2)}) - a downturn tests the lenders before the business`);
        assumptions.push("that credit stays available on today's terms");
      }
    } else {
      gaps.push("no usable debt figure - leverage is unknown, which is not the same as low");
    }
    if (last?.interestCoverage !== undefined) {
      if (last.interestCoverage >= 6) {
        s += 20;
        notes.push(`interest cover ${last.interestCoverage.toFixed(1)}x - profits could halve and the debt is still serviced`);
      } else if (last.interestCoverage >= 3) s += 10;
      else gaps.push(`thin interest cover (${last.interestCoverage.toFixed(1)}x)`);
    }
    if (tier === "large") {
      s += 20;
      notes.push("large cap - liquid enough to exit, and rarely the first domino");
    } else if (tier === "mid") s += 12;
    else if (tier === "small") {
      s += 4;
      gaps.push("small cap - falls hardest in a crash and can go illiquid exactly when you want out");
    }
    if (sc.redFlags.length === 0) {
      s += 25;
      notes.push("no red flags raised by the checks");
    } else {
      gaps.push(`${sc.redFlags.length} red flag${sc.redFlags.length === 1 ? "" : "s"}: ${sc.redFlags[0].replace(/\.$/, "")}`);
    }
    const ai = aiBucketFor(q.sector, q.industry);
    if (ai.exposure === "high") {
      assumptions.push("that this business model adapts to AI faster than it is disrupted by it");
      gaps.push("business model carries high AI-disruption exposure (see Weatherproof for both sides)");
    }
    pillars.push({ key: "durability", label: "Survives being wrong", score: Math.min(100, s), notes, gaps });
  }

  // ---------- combine ----------
  const evidence = pillars[0].score;
  const proof = pillars[1].score;
  const price = pillars[2].score;
  const durability = pillars[3].score;
  const score = Math.round(evidence * 0.2 + proof * 0.3 + price * 0.25 + durability * 0.25);

  let grade: ConvictionGrade;
  if (evidence < 45) grade = "UNKNOWABLE";
  else if (score >= 72 && price >= 50 && durability >= 55 && proof >= 60) grade = "CONVICTION";
  else if (score >= 52) grade = "REASONABLE";
  else grade = "SPECULATIVE";

  // what would move it up
  if (grade !== "CONVICTION") {
    if (evidence < 70) toConviction.push("a longer, more complete filing record - some of this is simply unknowable today");
    if (proof < 60) toConviction.push("returns on capital and cash generation that clear the bar on the RECORD, not in the forecast");
    if (price < 50)
      toConviction.push(
        val?.buyBelow !== undefined
          ? `a price at or below the buy-below level (${val.buyBelow.toFixed(0)}) - the same business gets safer as it gets cheaper`
          : "a defensible fair value, then a price inside it"
      );
    if (durability < 55) toConviction.push("a stronger balance sheet, or a smaller position that survives being wrong");
  }

  const sizing =
    grade === "CONVICTION"
      ? "This can carry a full position - the kind you top up on dips. The usual concentration caps still apply (single name under ~25%, and only your best-understood idea near that)."
      : grade === "REASONABLE"
        ? "A half-size position is the honest answer: real case, real gaps. Add only as the gaps close, not as the price rises."
        : grade === "SPECULATIVE"
          ? "If you want it, size it so a total loss changes nothing about your plan - a few percent at most, and never on borrowed conviction. The mistake is not owning a speculation; it is owning one at conviction size."
          : "Do not size this from the app's numbers at all. Either do the primary research yourself, or pass - 'not enough data' is a reason to skip, never a reason to hope.";

  const headline =
    grade === "CONVICTION"
      ? "The case rests on what this business has already done, at a price that does not need heroics."
      : grade === "REASONABLE"
        ? "A real case with named gaps - own it deliberately, at a size that respects them."
        : grade === "SPECULATIVE"
          ? `The return here leans on ${assumptions.length || "several"} assumption${assumptions.length === 1 ? "" : "s"} rather than on proof. That is a bet, and it should be sized like one.`
          : "There is not enough evidence to tell conviction from speculation on this one.";

  return { grade, score, headline, pillars, assumptions, toConviction, sizing };
}

/** Convenience wrapper for a portfolio row. */
export function convictionOfRow(row: AnalyzedHolding, valuation?: Valuation): ConvictionRead | null {
  if (!row.data || !row.scorecard) return null;
  const q = row.data.quote;
  if (isEtfHolding(row.holding.yahooSymbol, q.name ?? row.holding.name, q.quoteType, row.holding.securityType)) return null;
  return convictionOf({ data: row.data, scorecard: row.scorecard, valuation, holding: row.holding });
}
