import type { Scorecard, StockData } from "./types";
import type { Valuation } from "./valuation";
import type { CapTier } from "./screens";
import { priceCagrOf } from "./decisions";

/**
 * SWOT for a stock - moneycontrol-style, but honest about its source: every
 * item is DERIVED from this app's own checks, valuation anchors and price
 * history. Rule-based like the widgets on the big portals, with the evidence
 * printed next to each line, and no pretending it's analyst research.
 *
 * Strengths / Weaknesses = the business (what the checks proved or failed).
 * Opportunities / Threats = the situation (price vs value, trend, size, macro).
 */

export interface SwotItem {
  text: string;
  evidence?: string;
}

export interface Swot {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
}

export interface SwotInput {
  scorecard: Scorecard;
  data: StockData;
  valuation?: Valuation;
  momentum?: { pctFromHigh?: number; vs200d?: number; ret3m?: number };
  capTier?: CapTier;
  regime?: "FEAR" | "CORRECTION" | "EXPENSIVE_CALM" | "NORMAL";
  /** share of portfolio if held (fraction) - big weights become a threat to watch */
  weightPct?: number;
}

const CAP = 5;
const pct = (v: number, d = 0) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

export function buildSwot(inp: SwotInput): Swot {
  const sc = inp.scorecard;
  const q = inp.data.quote;
  const val = inp.valuation;
  const m = inp.momentum ?? {};
  const s: SwotItem[] = [];
  const w: SwotItem[] = [];
  const o: SwotItem[] = [];
  const t: SwotItem[] = [];

  const check = (id: string) => sc.checks.find((c) => c.id === id);
  const passed = (id: string) => check(id)?.status === "pass";
  const failed = (id: string) => check(id)?.status === "fail";
  const ev = (id: string) => check(id)?.detail;

  // ---------- Strengths: what the business PROVED ----------
  if (sc.totalScore >= 75) s.push({ text: "Compounder profile - strong across quality, fortress and growth at once.", evidence: `score ${sc.totalScore}/100` });
  if (passed("roe") || passed("roa")) s.push({ text: "Earns high returns on the money it employs - the signature of a moat.", evidence: ev("roe") ?? ev("roa") });
  if (passed("netmargin")) s.push({ text: "Fat, defensible margins - pricing power shows up here first.", evidence: ev("netmargin") });
  if (passed("marginstability")) s.push({ text: "Profitability is steady year to year, not a cyclical rollercoaster.", evidence: ev("marginstability") });
  if (passed("coffeecan")) s.push({ text: "Coffee-can consistency: growth AND high returns, year after year.", evidence: ev("coffeecan") });
  if (passed("d2e") || passed("finlev")) s.push({ text: "A conservative balance sheet - it doesn't owe its future to lenders.", evidence: ev("d2e") ?? ev("finlev") });
  if (passed("fcfpos")) s.push({ text: "Real cash profits, not just accounting profits.", evidence: ev("fcfpos") });
  if (passed("fcfgrowth")) s.push({ text: "Owner earnings are compounding - the engine behind long-term returns.", evidence: ev("fcfgrowth") });
  if (passed("revcagr") || passed("epscagr")) s.push({ text: "A real growth record over the last five years.", evidence: ev("revcagr") ?? ev("epscagr") });
  if (sc.fscore && sc.fscore.score >= 7) s.push({ text: "Fundamentals IMPROVED across the board last year (Piotroski).", evidence: `F-Score ${sc.fscore.score}/${sc.fscore.of}` });
  if ((q.dividendYield ?? 0) > 0.01 && (q.payoutRatio === undefined || q.payoutRatio <= 0.7)) s.push({ text: "Pays a covered dividend while still reinvesting.", evidence: `yield ${pct(q.dividendYield!, 1)}` });

  // ---------- Weaknesses: what the checks FAILED ----------
  for (const c of sc.checks) {
    if (c.status !== "fail") continue;
    w.push({ text: c.label, evidence: c.detail });
    if (w.length >= CAP) break;
  }

  // ---------- Opportunities: the situation working FOR a buyer ----------
  if (val?.status === "BUY_ZONE") o.push({ text: "Trading below the engine's fair-value band - a margin of safety is on offer.", evidence: val.marginOfSafety !== undefined ? `${pct(val.marginOfSafety)} below fair estimate` : undefined });
  if (val?.buyBelow !== undefined && q.price !== undefined && q.price <= val.buyBelow) o.push({ text: "Under the buy-below price the engine demands - the discipline says this is the zone.", evidence: `price vs buy-below` });
  if (m.pctFromHigh !== undefined && m.pctFromHigh <= -0.12 && sc.totalScore >= 65 && val?.status !== "PRICEY") o.push({ text: "Quality on sale: a real business marked down, which is what long-term buyers wait for.", evidence: `${pct(m.pctFromHigh, 1)} from its 52-week high` });
  if ((inp.capTier === "small" || inp.capTier === "mid") && (sc.cagr.revenue ?? 0) >= 0.12) o.push({ text: "Smaller company with a real growth engine - a longer runway than the giants, if it survives.", evidence: `revenue CAGR ${pct(sc.cagr.revenue!, 0)}` });
  if (q.targetMeanPrice !== undefined && q.price !== undefined && (q.numberOfAnalystOpinions ?? 0) >= 5 && q.targetMeanPrice / q.price - 1 >= 0.15) o.push({ text: "Analysts see meaningful upside - context only; their horizon is 1 year, yours is 5.", evidence: `${q.numberOfAnalystOpinions} analysts, ${pct(q.targetMeanPrice / q.price - 1)} to target` });
  if (inp.regime === "FEAR" && sc.totalScore >= 65) o.push({ text: "Market-wide fear regime: exactly when quality gets mispriced by forced sellers.", evidence: "see Market weather" });
  // long-run reversal (De Bondt & Thaler 1985): a multi-year laggard whose
  // earnings kept growing is the overreaction the research found reverses
  const pc = priceCagrOf(inp.data.prices);
  const longRun = pc.cagr !== undefined && pc.years !== undefined && pc.years >= 2.5;
  if (longRun && pc.cagr! <= 0 && (sc.cagr.eps ?? 0) >= 0.08 && sc.totalScore >= 60)
    o.push({
      text: "Multi-year price laggard with growing earnings - the market's overreaction, not the business, is what is on sale (long-run reversal, De Bondt & Thaler).",
      evidence: `price ${pct(pc.cagr!)}/yr vs EPS ${pct(sc.cagr.eps!)}/yr over ~${pc.years!.toFixed(0)}y`,
    });

  // ---------- Threats: the situation working AGAINST you ----------
  for (const f of sc.redFlags) {
    t.push({ text: f, evidence: "red flag from the checks" });
    if (t.length >= 3) break;
  }
  if (longRun && pc.cagr! >= 0.2 && sc.cagr.eps !== undefined && pc.cagr! - sc.cagr.eps >= 0.1)
    t.push({
      text: "The price has compounded far faster than earnings - most of the gain is a rising multiple, and multi-year winners have historically given part of it back (long-run reversal, De Bondt & Thaler).",
      evidence: `price ${pct(pc.cagr!)}/yr vs EPS ${pct(sc.cagr.eps)}/yr over ~${pc.years!.toFixed(0)}y`,
    });
  if (val?.status === "PRICEY") t.push({ text: "Priced for perfection - even a good business is a bad stock at the wrong price.", evidence: val.marginOfSafety !== undefined ? `${pct(-val.marginOfSafety)} above fair estimate` : undefined });
  if (failed("icr")) t.push({ text: "Thin interest cover - a bad year meets the lenders first.", evidence: ev("icr") });
  if (m.vs200d !== undefined && m.vs200d < -0.05 && m.ret3m !== undefined && m.ret3m < 0) t.push({ text: "In a downtrend - not a sell signal for quality, but average in tranches, don't catch knives in one buy.", evidence: `${pct(m.vs200d, 1)} vs 200-day average` });
  if (inp.capTier === "small") t.push({ text: "Small caps fall hardest in crashes and can stay illiquid - size positions so a 2008 doesn't shake you out.", evidence: "see the stress test" });
  if (inp.regime === "EXPENSIVE_CALM") t.push({ text: "Calm market at record highs - the easy money is behind; demand a bigger margin of safety.", evidence: "see Market weather" });
  if ((inp.weightPct ?? 0) >= 0.15) t.push({ text: "Already a heavyweight in YOUR portfolio - the next rupee of risk here is concentration, not opportunity.", evidence: `${pct(inp.weightPct!, 1)} of portfolio` });

  const fill = (arr: SwotItem[], empty: string) =>
    arr.length ? arr.slice(0, CAP) : [{ text: empty }];
  return {
    strengths: fill(s, "Nothing stands out - the checks found no durable edge to lean on."),
    weaknesses: fill(w, "No failed checks - rare, and worth a skeptical second look."),
    opportunities: fill(o, "No obvious mispricing right now - patience IS the position."),
    threats: fill(t, "Nothing flagged by the engine - stay skeptical anyway; the biggest risks are the unmodelled ones."),
  };
}
