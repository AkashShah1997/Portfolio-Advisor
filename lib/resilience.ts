import type { AnalyzedHolding, Currency, FxRates } from "./types";
import { toBase } from "./portfolio";
import { isEtfHolding } from "./etf";
import { capTierOf } from "./screens";

/**
 * Weatherproofing - can this portfolio take an AI-driven shock AND a normal
 * recession without forcing you to sell at the bottom?
 *
 * Two separate questions, deliberately kept apart:
 *
 *  1. RECESSION RESILIENCE is measurable from the filings we already have:
 *     debt, interest cover, cash generation, margin stability, loss years,
 *     dividend support, size. A business that survives a bad year without
 *     dilution is one you can hold through the drawdown - which is the only
 *     way the compounding actually happens.
 *
 *  2. AI DISRUPTION EXPOSURE is NOT measurable from filings. It is a judgment
 *     about the business MODEL, so this file states it as a hypothesis by
 *     industry, with the reasoning printed, and demands you argue with it.
 *     For an Indian portfolio in particular this is not theoretical: IT
 *     services is the single most AI-exposed large sector on the NSE, and it
 *     is also the sector most Indian portfolios are overweight.
 *
 * The output is a grade per holding and one portfolio number - always with the
 * counter-argument attached, because "AI will eat X" is a thesis, not a fact.
 */

export type AiExposure = "high" | "medium" | "low" | "beneficiary" | "unknown";

export interface AiBucket {
  exposure: AiExposure;
  thesis: string;
  counter: string;
}

/**
 * Industry → AI-disruption hypothesis. Matched against Yahoo's sector and
 * industry strings (lowercased). Order matters: narrower patterns first.
 */
const AI_RULES: { match: RegExp; bucket: AiBucket }[] = [
  {
    match: /information technology services|it services|consulting|outsourcing|staffing|employment services|business process/,
    bucket: {
      exposure: "high",
      thesis:
        "Sells human hours by the head. If AI does 30% of the work of a junior engineer, the pyramid billing model (many juniors, few seniors) compresses from the bottom - revenue per employee has to rise faster than pricing falls.",
      counter:
        "These firms survived offshoring, cloud and automation before, own deep client relationships and compliance moats, and are deploying AI to their own delivery. The market has also known this story for two years - some of it is already in the price.",
    },
  },
  {
    match: /advertising|marketing|media|publishing|broadcasting|entertainment/,
    bucket: {
      exposure: "high",
      thesis:
        "Content and creative production costs are collapsing, and AI search changes how audiences arrive. Both the making and the distribution of media are being repriced at once.",
      counter: "Owned IP, live rights and trusted brands are exactly what gets scarcer when content becomes infinite.",
    },
  },
  {
    match: /education|training|test prep/,
    bucket: {
      exposure: "high",
      thesis: "Tutoring, test prep and course content are among the first things a capable model does well and nearly free.",
      counter: "Credentials, accreditation and physical campuses are regulatory moats a model cannot issue.",
    },
  },
  {
    match: /software|internet|application|saas/,
    bucket: {
      exposure: "medium",
      thesis:
        "Software is both the biggest beneficiary and the most exposed: AI slashes the cost of building competing products, so per-seat pricing and switching costs get tested.",
      counter: "Distribution, data and workflow lock-in still decide winners - and the best of these ship AI features fastest.",
    },
  },
  {
    match: /semiconductor|electronic components|computer hardware|data center|electrical equipment/,
    bucket: {
      exposure: "beneficiary",
      thesis: "Sells the picks and shovels of the build-out: chips, boards, power and cooling.",
      counter:
        "Beneficiary is not the same as safe. This is the most cyclical corner of the market, and today's prices already assume years of capex - the 2000 telecom-equipment names were 'beneficiaries' too.",
    },
  },
  {
    match: /utilities|power|electric|renewable/,
    bucket: {
      exposure: "beneficiary",
      thesis: "Data centres need enormous, reliable electricity, and regulated utilities earn a return on the capital they add to serve it.",
      counter: "Regulated returns cap the upside, and rate cycles hit these harder than most.",
    },
  },
  {
    match: /bank|financial|insurance|capital markets|asset management|credit/,
    bucket: {
      exposure: "medium",
      thesis: "Back-office, underwriting and support roles are automatable, which is a cost tailwind - but distribution and trust are hard to disrupt.",
      counter: "The real risk to a lender in a downturn is credit losses, not chatbots. Judge these on the recession score, not the AI score.",
    },
  },
  {
    match: /pharmaceutical|biotech|healthcare|medical|hospital|diagnostics/,
    bucket: {
      exposure: "low",
      thesis: "Discovery gets faster and cheaper, which helps, but trials, regulators, manufacturing and physical care are unchanged.",
      counter: "Faster discovery also lowers the barrier for competitors and generics.",
    },
  },
  {
    match: /auto manufacturer|auto parts|automobile|\bauto\b|tyre|tire/,
    bucket: {
      exposure: "low",
      thesis:
        "Building vehicles is an atoms business: plants, supply chains and dealer networks. AI shows up inside the product (driver aids, software) rather than replacing the maker.",
      counter:
        "Deeply cyclical and usually leveraged - a recession hits car demand before almost anything else, and the EV transition is its own capital-hungry disruption.",
    },
  },
  {
    match: /industrial|machinery|aerospace|defense|transport|railroad|logistics|construction|infrastructure/,
    bucket: {
      exposure: "low",
      thesis: "Physical assets, long order books and regulatory barriers. Automation is an efficiency story here, not an existential one.",
      counter: "Capital-goods demand is cyclical and often leveraged - resilience depends on the balance sheet more than the technology.",
    },
  },
  {
    match: /consumer|food|beverage|tobacco|household|personal products|retail|apparel/,
    bucket: {
      exposure: "low",
      thesis: "People still eat, wash and dress. Brand, shelf space and distribution are physical moats a model does not touch.",
      counter: "Retail channels shift: AI shopping agents could commoditise brands that only win on search placement.",
    },
  },
  {
    match: /energy|oil|gas|mining|metals|materials|chemical|cement|steel/,
    bucket: {
      exposure: "low",
      thesis: "Atoms, not bits. AI cannot substitute for a barrel, a tonne or a plant.",
      counter: "These are the most cyclical businesses on the board - a recession hits them first and hardest, whatever AI does.",
    },
  },
  {
    match: /real estate|reit|telecom|communication services/,
    bucket: {
      exposure: "low",
      thesis: "Rent and connectivity are collected regardless of who or what is using the space or the pipe.",
      counter: "Office real estate is the exception - remote and AI-thinned headcounts hit occupancy directly.",
    },
  },
];

const UNKNOWN_BUCKET: AiBucket = {
  exposure: "unknown",
  thesis: "No sector on file, so no hypothesis - judge this one yourself.",
  counter: "An unknown is not a low score; it is a gap in the data.",
};

export function aiBucketFor(sector?: string, industry?: string): AiBucket {
  const hay = `${industry ?? ""} ${sector ?? ""}`.toLowerCase();
  if (!hay.trim()) return UNKNOWN_BUCKET;
  for (const r of AI_RULES) if (r.match.test(hay)) return r.bucket;
  return UNKNOWN_BUCKET;
}

export interface HoldingResilience {
  symbol: string;
  name?: string;
  isEtf: boolean;
  weight: number; // fraction of portfolio
  /** 0-100: can the business survive a bad year without dilution or distress */
  recession?: number;
  recessionNotes: string[];
  ai: AiBucket;
  /** the combined read shown as a grade */
  grade: "fortress" | "solid" | "fragile" | "unknown";
}

export interface PortfolioResilience {
  rows: HoldingResilience[];
  /** value-weighted recession score across scored holdings, 0-100 */
  score?: number;
  /** share of portfolio value the score actually covers (funds/failures excluded) */
  coverage: number;
  aiHighShare: number; // fraction of value in high AI-exposure businesses
  fragileShare: number; // fraction of value in fragile balance sheets
  cashflowShare: number; // fraction of value scoring 70+ on recession resilience
  headline: string;
  fixFirst: { symbol: string; why: string }[];
}

/** Recession resilience from the filings we already have. */
function recessionScore(r: AnalyzedHolding): { score?: number; notes: string[] } {
  const sc = r.scorecard;
  const data = r.data;
  if (!sc || !data || sc.verdict === "INSUFFICIENT_DATA") return { score: undefined, notes: [] };
  const notes: string[] = [];
  let pts = 0;
  let of = 0;
  const ratios = sc.ratios ?? [];
  const last = ratios[ratios.length - 1];
  const isFin = sc.isFinancialSector;

  // 1. leverage
  if (last?.debtToEquity !== undefined && !isFin) {
    of += 25;
    if (last.debtToEquity <= 0.5) {
      pts += 25;
      notes.push(`low debt (D/E ${last.debtToEquity.toFixed(2)}) - it does not need lenders to say yes next year`);
    } else if (last.debtToEquity <= 1.5) {
      pts += 15;
    } else {
      notes.push(`carries real leverage (D/E ${last.debtToEquity.toFixed(2)}) - the first thing a credit squeeze tests`);
    }
  }
  // 2. interest cover
  if (last?.interestCoverage !== undefined && !isFin) {
    of += 20;
    if (last.interestCoverage >= 6) {
      pts += 20;
      notes.push(`interest cover ${last.interestCoverage.toFixed(1)}x - profits could halve and the debt is still serviced`);
    } else if (last.interestCoverage >= 3) pts += 12;
    else notes.push(`thin interest cover (${last.interestCoverage.toFixed(1)}x) - a bad year meets the lenders first`);
  }
  // 3. cash generation
  const fcfYears = data.years.map((y) => y.fcf).filter((v): v is number => v !== undefined);
  if (fcfYears.length >= 3) {
    of += 20;
    const posShare = fcfYears.filter((v) => v > 0).length / fcfYears.length;
    pts += Math.round(posShare * 20);
    if (posShare >= 0.8) notes.push("generates real cash in most years - self-funding through a downturn");
    else if (posShare <= 0.4) notes.push("rarely free-cash-flow positive - it needs outside money to keep going");
  }
  // 4. no loss years
  const ni = data.years.map((y) => y.netIncome).filter((v): v is number => v !== undefined);
  if (ni.length >= 3) {
    of += 15;
    const losses = ni.filter((v) => v <= 0).length;
    if (losses === 0) {
      pts += 15;
      notes.push("profitable every year on record, including the last slowdown");
    } else notes.push(`${losses} loss year${losses === 1 ? "" : "s"} in the last ${ni.length} - it has broken before`);
  }
  // 5. margin stability
  const stab = sc.checks.find((c) => c.id === "marginstability");
  if (stab && stab.status !== "na") {
    of += 10;
    if (stab.status === "pass") pts += 10;
    else if (stab.status === "warn") pts += 5;
  }
  // 6. size / liquidity
  const tier = capTierOf(data.quote.marketCap, r.holding.yahooSymbol);
  if (tier) {
    of += 10;
    pts += tier === "large" ? 10 : tier === "mid" ? 6 : 2;
    if (tier === "small") notes.push("small cap - falls hardest and can go illiquid exactly when you need out");
  }
  if (of < 40) return { score: undefined, notes };
  // warnings first: a fragile grade must never lead with a compliment
  const bad = /thin|carries real leverage|rarely free-cash|loss year|small cap|has broken/;
  notes.sort((a, b) => Number(bad.test(b)) - Number(bad.test(a)));
  return { score: Math.round((pts / of) * 100), notes };
}

export function portfolioResilience(rows: AnalyzedHolding[], fx: FxRates): PortfolioResilience {
  const active = rows.filter((r) => !r.holding.watch && (r.currentValue ?? r.invested) > 0);
  const total = active.reduce((a, r) => a + toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx), 0);
  const out: HoldingResilience[] = [];
  let wsum = 0;
  let scoreSum = 0;
  let aiHigh = 0;
  let fragile = 0;
  let cashflow = 0;

  for (const r of active) {
    const value = toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx);
    const weight = total > 0 ? value / total : 0;
    const q = r.data?.quote;
    const etf = isEtfHolding(r.holding.yahooSymbol, q?.name ?? r.holding.name, q?.quoteType, r.holding.securityType);
    const ai = etf
      ? {
          exposure: "low" as AiExposure,
          thesis: "A fund spreads the question across every holding - index funds own the disruptors and the disrupted together.",
          counter: "Index funds are not immune: a cap-weighted index concentrates in whatever just won, which is where the crowding risk lives.",
        }
      : aiBucketFor(q?.sector, q?.industry);
    const { score, notes } = etf ? { score: undefined, notes: [] as string[] } : recessionScore(r);
    const grade: HoldingResilience["grade"] = etf
      ? "solid"
      : score === undefined
        ? "unknown"
        : score >= 75
          ? "fortress"
          : score >= 50
            ? "solid"
            : "fragile";
    if (score !== undefined) {
      wsum += weight;
      scoreSum += score * weight;
      if (score < 50) fragile += weight;
      if (score >= 70) cashflow += weight;
    }
    if (ai.exposure === "high") aiHigh += weight;
    out.push({
      symbol: r.holding.yahooSymbol,
      name: q?.name ?? r.holding.name,
      isEtf: etf,
      weight,
      recession: score,
      recessionNotes: notes,
      ai,
      grade,
    });
  }

  /**
   * A headline score needs to describe most of the book. With 94% in an
   * unscored index fund, one small fragile stock was defining the number - and
   * contradicting the headline sentence next to it.
   */
  const coverage = wsum;
  const score = wsum >= 0.5 ? Math.round(scoreSum / wsum) : undefined;
  const fixFirst = out
    .filter((h) => !h.isEtf && (h.grade === "fragile" || (h.ai.exposure === "high" && h.weight >= 0.1)))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((h) => ({
      symbol: h.symbol,
      why:
        h.grade === "fragile" && h.ai.exposure === "high"
          ? `${(h.weight * 100).toFixed(1)}% of the book in a leveraged business whose model is AI-exposed - the two risks stack`
          : h.grade === "fragile"
            ? `${(h.weight * 100).toFixed(1)}% in a balance sheet that a bad year would strain`
            : `${(h.weight * 100).toFixed(1)}% in one AI-exposed business - fine as a position, heavy as a bet`,
    }));

  let headline: string;
  if (score === undefined) {
    headline =
      coverage > 0
        ? `Only ${(coverage * 100).toFixed(0)}% of the book is individually scoreable (the rest is funds or unpriced rows) - too little to grade the whole portfolio honestly.`
        : "Not enough scored holdings yet to grade the portfolio's resilience.";
  } else if (aiHigh >= 0.4 && fragile >= 0.25) {
    headline = `${(fragile * 100).toFixed(0)}% of the book has a balance sheet a recession would strain AND ${(aiHigh * 100).toFixed(0)}% sits in high AI-exposure models - those two risks stack.`;
  } else if (aiHigh >= 0.4) {
    headline = `${(aiHigh * 100).toFixed(0)}% of your money sits in business models with high AI-disruption exposure - that is a concentrated bet on one thesis being wrong.`;
  } else if (score >= 75 && fragile < 0.1) {
    headline = "Built to take a hit: most of your capital is in businesses that fund themselves through a bad year.";
  } else if (fragile >= 0.25) {
    headline = `${(fragile * 100).toFixed(0)}% of the book is in balance sheets a recession would strain - that is where forced selling starts.`;
  } else {
    headline = "Reasonably weatherproof, with a few positions worth firming up.";
  }

  return { rows: out.sort((a, b) => b.weight - a.weight), score, coverage, aiHighShare: aiHigh, fragileShare: fragile, cashflowShare: cashflow, headline, fixFirst };
}
