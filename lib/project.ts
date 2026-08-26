import type { AnalyzedHolding } from "./types";
import type { FxRates } from "./types";
import { toBase } from "./portfolio";
import { activeRows } from "./health";

/**
 * The sit-tight projector - what "buy right, sit tight" could mean in numbers.
 *
 * Growth guesses are value-weighted from each holding's own EPS (fallback
 * revenue) CAGR, clamped hard, with a conservative scenario band. This is a
 * compounding illustration, NOT a forecast: five years of real life will not
 * follow a smooth curve, and the whole point of the philosophy is surviving
 * the wobble without selling.
 */

export interface GrowthGuess {
  conservative: number;
  base: number;
  optimistic: number;
  divYield: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function portfolioGrowthGuess(rows: AnalyzedHolding[], fx: FxRates): GrowthGuess {
  const act = activeRows(rows).filter((r) => r.scorecard && r.scorecard.verdict !== "INSUFFICIENT_DATA");
  let wSum = 0;
  let gSum = 0;
  let dSum = 0;
  for (const r of act) {
    const w = toBase(r.currentValue ?? r.invested, r.holding.currency, fx);
    if (w <= 0) continue;
    const gRaw = r.scorecard!.cagr.eps ?? r.scorecard!.cagr.revenue;
    const g = clamp(gRaw !== undefined && Number.isFinite(gRaw) ? gRaw : 0.08, 0, 0.18);
    gSum += g * w;
    dSum += (r.data?.quote.dividendYield ?? 0) * w;
    wSum += w;
  }
  const base = wSum > 0 ? gSum / wSum : 0.08;
  const divYield = wSum > 0 ? dSum / wSum : 0;
  return {
    conservative: clamp(base * 0.6, 0.02, 0.12),
    base,
    optimistic: clamp(base * 1.25, base, 0.2),
    divYield,
  };
}

export interface ProjectionPoint {
  year: number;
  value: number;
  invested: number;
}

/**
 * Yearly compounding with optional monthly contributions (contributions earn
 * roughly half a year of return in the year they arrive).
 */
export function project(
  start: number,
  years: number,
  monthly: number,
  annualReturn: number
): ProjectionPoint[] {
  const pts: ProjectionPoint[] = [{ year: 0, value: start, invested: start }];
  let value = start;
  let invested = start;
  for (let y = 1; y <= years; y++) {
    const contrib = monthly * 12;
    value = value * (1 + annualReturn) + contrib * (1 + annualReturn / 2);
    invested += contrib;
    pts.push({ year: y, value, invested });
  }
  return pts;
}

/** Years to reach a multiple of the starting value at a given return (rule-of-72 refined). */
export function yearsToMultiple(multiple: number, annualReturn: number): number | undefined {
  if (annualReturn <= 0 || multiple <= 1) return undefined;
  return Math.log(multiple) / Math.log(1 + annualReturn);
}
