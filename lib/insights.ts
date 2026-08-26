import type { Scorecard } from "./types";
import type { Valuation } from "./valuation";
import type { Journey } from "./journey";

/**
 * Strengths & risks - the Simply-Wall-St-style bullet summary, generated from
 * checks the engine has ALREADY evaluated (never new claims). Each bullet
 * rephrases a passing/failing check with its evidence, so the bullets and the
 * detailed checklist can never disagree. Capped at 4 + 4, strongest first.
 */

export interface Insights {
  strengths: string[];
  risks: string[];
}

/** Curated plain-English phrasings per check id (pass → strength, fail → risk). */
const PHRASING: Record<string, { pass?: string; fail?: string }> = {
  roe: { pass: "Earns high returns on shareholders' money", fail: "Weak returns on shareholders' money" },
  roce: { pass: "Earns high returns on all capital employed - the quality signature", fail: "Low returns on the capital tied up in the business" },
  roa: { pass: "Superior returns on assets for a lender", fail: "Thin returns on assets for a lender" },
  netmargin: { pass: "Fat profit margins - pricing power at work", fail: "Thin profit margins leave little room for error" },
  marginstability: { pass: "Margins hold steady year to year - a predictable business", fail: "Margins swing widely year to year" },
  roetrend: { fail: "Returns on equity have been sliding for years - possible moat erosion" },
  coffeecan: { pass: "Passes the Coffee-Can test - growth and returns, year after year" },
  d2e: { pass: "Barely any debt on the balance sheet", fail: "Carries heavy debt for a business of this kind" },
  icr: { pass: "Interest is covered many times over", fail: "Profit only just covers the interest bill" },
  finlev: { pass: "Leverage stays inside prudent banking norms", fail: "Leverage runs beyond prudent banking norms" },
  currentratio: { fail: "Short-term liabilities crowd short-term assets" },
  fcfpos: { pass: "Generates real free cash flow, year in year out", fail: "Free cash flow is negative in too many years" },
  revcagr: { pass: "Revenue compounding at a double-digit clip", fail: "Revenue growth has stalled" },
  epscagr: { pass: "Earnings per share compounding fast", fail: "Earnings per share are barely growing" },
  consistency: { pass: "No loss years and few down years - steady hands", fail: "Earnings have been erratic, with losses or repeated down years" },
  fcfgrowth: { pass: "Free cash flow is growing, not just profits" },
  reinvest: { pass: "High returns AND room to reinvest them - the compounding engine" },
  pevshistory: { pass: "Priced below its own historical multiple", fail: "Priced well above its own historical multiple" },
  peg: { pass: "Growth comes at a reasonable price (PEG)", fail: "Paying a lot for each unit of growth (PEG)" },
  earnyield: { pass: "Earnings yield beats bond returns", fail: "Earnings yield is thinner than a bond's" },
  fcfyield: { pass: "Strong cash yield at today's price" },
  pb: { pass: "Trades near book value with decent returns", fail: "Expensive versus book for a financial" },
}

export function strengthsAndRisks(sc: Scorecard, val?: Valuation, journey?: Journey): Insights {
  const strengths: { w: number; text: string }[] = [];
  const risks: { w: number; text: string }[] = [];

  // 1) valuation state first - it's the decision most people skip
  if (val?.status === "BUY_ZONE" && val.marginOfSafety !== undefined) {
    strengths.push({
      w: 100,
      text: `Trading ${(val.marginOfSafety * 100).toFixed(0)}% below the rough fair-value estimate - margin of safety on your side`,
    });
  }
  if (val?.status === "PRICEY" && val.marginOfSafety !== undefined && val.marginOfSafety < -0.05) {
    risks.push({
      w: 95,
      text: `Priced ${(-val.marginOfSafety * 100).toFixed(0)}% above the rough fair-value estimate - future returns lean on growth alone`,
    });
  }

  // 2) journey tone (only meaningful for held positions)
  if (journey) {
    const priceLagged = journey.priceCagrSince !== undefined && journey.priceCagrSince < 0.05;
    if (journey.verdict.tone === "good" && priceLagged) {
      strengths.push({
        w: 90,
        text: "The business has kept improving while the price stood still - a coiled spring, not dead money",
      });
    }
    if (journey.verdict.tone === "critical") {
      risks.push({ w: 90, text: "Fundamentals have worsened since you bought - the weak price is earned, not unfair" });
    }
    if (journey.verdict.tone === "warning") {
      risks.push({ w: 88, text: "The price has run ahead while the fundamentals slipped - risk is quietly rising" });
    }
  }

  // 3) red flags are risks verbatim (already evidence-phrased)
  for (const f of sc.redFlags) risks.push({ w: 85, text: f.replace(/\.$/, "") });

  // 4) checks → curated bullets, weighted by check weight × conviction
  for (const c of sc.checks) {
    const p = PHRASING[c.id];
    if (!p) continue;
    if (c.status === "pass" && p.pass) {
      strengths.push({ w: c.weight * c.score, text: `${p.pass} (${lcFirst(c.detail)})` });
    } else if (c.status === "fail" && p.fail) {
      risks.push({ w: c.weight, text: `${p.fail} (${lcFirst(c.detail)})` });
    }
  }

  const seen = new Set<string>();
  const take = (xs: { w: number; text: string }[]) =>
    xs
      .sort((a, b) => b.w - a.w)
      .filter((x) => {
        const k = x.text.slice(0, 40);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 4)
      .map((x) => x.text);

  return { strengths: take(strengths), risks: take(risks) };
}

function lcFirst(s: string): string {
  if (!s.length) return s;
  // leave acronyms alone (ROE fell…, EPS is…, FCF positive…)
  if (s.length > 1 && /[A-Z]/.test(s[1])) return s;
  return s[0].toLowerCase() + s.slice(1);
}
