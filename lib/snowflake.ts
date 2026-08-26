import type { AnalyzedHolding, Currency, FxRates, Scorecard, StockData } from "./types";

/**
 * The snowflake - a Simply-Wall-St-style 5-axis shape, built entirely from
 * this app's own scorecard so the picture and the checks can never disagree.
 *
 * Four axes are the scorecard pillars (0–100). The fifth, Income, is derived
 * from the dividend facts the quote already carries:
 *   - how much it pays        (yield vs a 4% "full marks" bar)  → up to 60
 *   - whether it's sustainable (payout ratio ≤ 70%)             → up to 25
 *   - whether cash funds it    (share of FCF-positive years)    → up to 15
 * A non-payer honestly scores near zero on Income - that's a fact, not a flaw.
 *
 * The portfolio snowflake is the value-weighted average of the holdings'
 * snowflakes, so concentration shows up in the shape.
 */

export interface SnowflakeAxes {
  quality: number;
  fortress: number;
  growth: number;
  value: number;
  income: number;
}

export const SNOWFLAKE_AXES: { key: keyof SnowflakeAxes; label: string; blurb: string }[] = [
  { key: "quality", label: "Quality", blurb: "moat: returns on capital, margins, consistency" },
  { key: "growth", label: "Growth", blurb: "revenue & EPS compounding, no losses" },
  { key: "fortress", label: "Fortress", blurb: "debt, interest cover, cash generation" },
  { key: "value", label: "Value", blurb: "price vs own history and cash yields" },
  { key: "income", label: "Income", blurb: "dividend paid, covered, cash-funded" },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const round = (v: number) => Math.round(Math.max(0, Math.min(100, v)));

/** Income axis 0–100 from yield, payout sustainability and FCF cover. */
export function incomeAxis(q: {
  dividendYield?: number;
  payoutRatio?: number;
  fcfPosShare?: number;
}): number {
  const y = q.dividendYield;
  if (y === undefined || y <= 0) return 0;
  // how much it pays: full marks (60) at a 4% yield
  const pay = clamp01(y / 0.04) * 60;
  // sustainability: payout ≤70% full (25), fading to 0 at 110%; unknown payout → half credit
  let sust: number;
  if (q.payoutRatio === undefined) sust = 12.5;
  else if (q.payoutRatio <= 0.7) sust = 25;
  else if (q.payoutRatio >= 1.1) sust = 0;
  else sust = 25 * (1 - (q.payoutRatio - 0.7) / 0.4);
  // cash funding: share of FCF-positive years (15); unknown → half credit
  const cash = q.fcfPosShare === undefined ? 7.5 : q.fcfPosShare * 15;
  return round(pay + sust + cash);
}

/** Per-stock snowflake. Null when the scorecard couldn't judge the stock. */
export function snowflakeOf(sc: Scorecard, data?: StockData): SnowflakeAxes | null {
  if (sc.verdict === "INSUFFICIENT_DATA") return null;
  const pillar = (p: string) => sc.pillars.find((x) => x.pillar === p);
  const score = (p: string) => {
    const s = pillar(p);
    return s && s.applicable ? s.score : sc.totalScore; // fall back to overall, never to 0
  };
  const fcfYears = (data?.years ?? [])
    .map((yr) => yr.fcf)
    .filter((v): v is number => v !== undefined);
  return {
    quality: round(score("quality")),
    fortress: round(score("fortress")),
    growth: round(score("growth")),
    value: round(score("valuation")),
    income: incomeAxis({
      dividendYield: data?.quote.dividendYield,
      payoutRatio: data?.quote.payoutRatio,
      fcfPosShare: fcfYears.length ? fcfYears.filter((v) => v > 0).length / fcfYears.length : undefined,
    }),
  };
}

/** Value-weighted portfolio snowflake over the scored, non-watch holdings. */
export function portfolioSnowflake(
  rows: AnalyzedHolding[],
  fx: FxRates
): { axes: SnowflakeAxes; covered: number; total: number } | null {
  let wsum = 0;
  let covered = 0;
  let total = 0;
  const acc: SnowflakeAxes = { quality: 0, fortress: 0, growth: 0, value: 0, income: 0 };
  for (const r of rows) {
    if (r.holding.watch) continue;
    total++;
    if (!r.scorecard || !r.data) continue;
    const flake = snowflakeOf(r.scorecard, r.data);
    if (!flake) continue;
    const value = r.currentValue ?? r.invested;
    const w = value * (fx.rates[r.holding.currency as Currency] ?? 1);
    if (!(w > 0)) continue;
    covered++;
    wsum += w;
    for (const a of SNOWFLAKE_AXES) acc[a.key] += flake[a.key] * w;
  }
  if (!wsum || !covered) return null;
  for (const a of SNOWFLAKE_AXES) acc[a.key] = round(acc[a.key] / wsum);
  return { axes: acc, covered, total };
}

/** Per-axis leaders: which holdings actually carry each arm of the snowflake. */
export interface AxisLeaders {
  key: keyof SnowflakeAxes;
  label: string;
  leaders: { symbol: string; score: number }[];
}

export function snowflakeLeaders(rows: AnalyzedHolding[], top = 3): AxisLeaders[] {
  const flakes: { symbol: string; flake: SnowflakeAxes }[] = [];
  for (const r of rows) {
    if (r.holding.watch || !r.scorecard || !r.data) continue;
    const f = snowflakeOf(r.scorecard, r.data);
    if (!f) continue;
    flakes.push({ symbol: r.holding.yahooSymbol.replace(/\.(NS|BO|TO|V|NE)$/i, ""), flake: f });
  }
  return SNOWFLAKE_AXES.map((a) => ({
    key: a.key,
    label: a.label,
    leaders: [...flakes]
      .sort((x, y) => y.flake[a.key] - x.flake[a.key])
      .slice(0, top)
      .map((x) => ({ symbol: x.symbol, score: x.flake[a.key] })),
  }));
}

/** One-line read of the shape, SWS-style ("past performer with growth ahead"). */
export function describeSnowflake(a: SnowflakeAxes): string {
  const parts: string[] = [];
  const strong = SNOWFLAKE_AXES.filter((x) => a[x.key] >= 65).map((x) => x.label.toLowerCase());
  const weak = SNOWFLAKE_AXES.filter((x) => a[x.key] < 40).map((x) => x.label.toLowerCase());
  if (strong.length >= 4 && !weak.length) return "A rounded compounder profile - strong on nearly every axis.";
  if (strong.length) parts.push(`strong on ${strong.join(", ")}`);
  if (weak.length) parts.push(`thin on ${weak.join(", ")}`);
  if (!parts.length) return "Middling on every axis - nothing broken, nothing exceptional.";
  return parts.join("; ") + ".";
}
