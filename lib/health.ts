import type { AnalyzedHolding, FxRates } from "./types";
import { toBase } from "./portfolio";
import { isEtfHolding } from "./etf";

/**
 * Portfolio health checks - construction-level tests the masters apply before
 * they ever look at an individual stock: concentration, diversification,
 * whether capital is riding the best ideas, and how much of it sits in
 * businesses the scorecard distrusts.
 */

export type HealthStatus = "pass" | "warn" | "fail" | "info";

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  principle: string;
}

export interface IncomeEstimate {
  total: number; // base currency per year, estimated from current yields
  byHolding: { label: string; value: number }[];
  yieldOnValue?: number;
  yieldOnCost?: number;
  payers: number;
}

/** Rows that represent real positions (watchlist rows carry no capital). */
export function activeRows(rows: AnalyzedHolding[]): AnalyzedHolding[] {
  return rows.filter((r) => !r.holding.watch && (r.invested > 0 || (r.currentValue ?? 0) > 0));
}

function weightsOf(rows: AnalyzedHolding[], fx: FxRates): { row: AnalyzedHolding; value: number; w: number }[] {
  const vals = rows.map((r) => ({
    row: r,
    value: toBase(r.currentValue ?? r.invested, r.holding.currency, fx),
  }));
  const total = vals.reduce((a, b) => a + b.value, 0) || 1;
  return vals.map((v) => ({ ...v, w: v.value / total }));
}

const pctS = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

export function computeHealth(rows: AnalyzedHolding[], fx: FxRates): HealthCheck[] {
  const act = activeRows(rows);
  const ws = weightsOf(act, fx);
  const checks: HealthCheck[] = [];
  if (!act.length) return checks;

  // 1. Number of holdings
  const n = act.length;
  checks.push({
    id: "count",
    label: "Focused but not fragile (8–25 holdings)",
    status: n >= 8 && n <= 25 ? "pass" : "warn",
    detail: `${n} holding${n === 1 ? "" : "s"} carrying capital`,
    principle:
      n > 25
        ? "Lynch: beware 'diworsification' - conviction dilutes fast past ~25 names"
        : "Munger: wide diversification is protection against ignorance; a focused list you understand beats a long one you don't",
  });

  // 2. Top holding (with history's receipts when the threshold is crossed)
  const sorted = [...ws].sort((a, b) => b.w - a.w);
  const top1 = sorted[0];
  const top1Status: HealthStatus = top1.w <= 0.25 ? "pass" : top1.w <= 0.4 ? "warn" : "fail";
  checks.push({
    id: "top1",
    label: "Top holding ≤ 25% of portfolio",
    status: top1Status,
    detail: `${top1.row.holding.yahooSymbol} is ${pctS(top1.w, 1)} of current value`,
    principle:
      top1Status === "pass"
        ? "Buffett tolerates concentration only in your single best-understood idea"
        : "History's single-name lessons: Enron, Nokia (2000), Yes Bank - each a 'safe' giant that fell 90%+ and never came back for holders. Buffett-level concentration needs Buffett-level understanding",
  });

  // 3. Top-3 concentration
  const top3 = sorted.slice(0, 3).reduce((a, b) => a + b.w, 0);
  checks.push({
    id: "top3",
    label: "Top 3 holdings ≤ 60%",
    status: top3 <= 0.6 ? "pass" : top3 <= 0.75 ? "warn" : "fail",
    detail: `Top 3 = ${pctS(top3, 1)} (${sorted.slice(0, 3).map((s) => s.row.holding.yahooSymbol).join(", ")})`,
    principle: "Graham: even the confident diversify against the unknowable",
  });

  // 4. HHI / effective number of holdings
  const hhi = ws.reduce((a, b) => a + b.w * b.w, 0);
  const effN = hhi > 0 ? 1 / hhi : 0;
  checks.push({
    id: "hhi",
    label: "Concentration index (HHI)",
    // Pass at ≤ 0.13 (~8 effective names) so a clean 10-equal-position book
    // passes; the old strict `< 0.1` failed exactly the portfolio the
    // "8–25 holdings" check calls ideal.
    status: hhi <= 0.13 ? "pass" : hhi < 0.18 ? "warn" : "fail",
    detail: `HHI ${hhi.toFixed(3)} ≈ ${effN.toFixed(1)} equally-weighted positions`,
    principle: "A portfolio of 15 names that behaves like 4 is a 4-stock portfolio",
  });

  // 5. Sector concentration
  /**
   * Funds get their own bucket and are EXEMPT from the single-sector cap - a
   * broad index fund is the most diversified thing you can own, and lumping it
   * into "Unknown" gave an all-ETF portfolio the app's worst diversification
   * grade. `summarize` already did this; the health check did not.
   */
  const bySector = new Map<string, number>();
  let fundW = 0;
  for (const v of ws) {
    const q = v.row.data?.quote;
    if (isEtfHolding(v.row.holding.yahooSymbol, q?.name ?? v.row.holding.name, q?.quoteType, v.row.holding.securityType)) {
      fundW += v.w;
      continue;
    }
    const s = q?.sector ?? "Unknown";
    bySector.set(s, (bySector.get(s) ?? 0) + v.w);
  }
  const sectorEntries = [...bySector.entries()].sort((a, b) => b[1] - a[1]);
  const [maxSector, maxSectorW] = sectorEntries.length ? sectorEntries[0] : ["ETFs / funds", 0];
  const sectorStatus: HealthStatus = maxSectorW <= 0.35 ? "pass" : maxSectorW <= 0.5 ? "warn" : "fail";
  checks.push({
    id: "sector",
    label: "Largest sector ≤ 35%",
    status: sectorStatus,
    detail: sectorEntries.length
      ? `${maxSector} is ${pctS(maxSectorW, 1)} of the portfolio${fundW > 0 ? ` (funds, ${pctS(fundW, 0)}, are diversified by construction and excluded)` : ""}`
      : `Everything is in diversified funds (${pctS(fundW, 0)}) - no single-sector concentration to flag`,
    principle:
      sectorStatus === "pass"
        ? "Fisher: industries share fates - don't let one theme own your future"
        : "When one theme owned portfolios before, it ended badly: the Nasdaq fell 78% in 2000 and took 15 years to recover; Tokyo 1989 took 34. The sector was real both times - the price and the concentration were the problem",
  });

  // 6. Geography tilt (informational)
  const byCountry = new Map<string, number>();
  for (const v of ws) {
    const c = v.row.holding.currency === "INR" ? "India" : v.row.holding.currency === "CAD" ? "Canada" : "United States";
    byCountry.set(c, (byCountry.get(c) ?? 0) + v.w);
  }
  const [maxGeo, maxGeoW] = [...byCountry.entries()].sort((a, b) => b[1] - a[1])[0];
  if (maxGeoW >= 0.85) {
    checks.push({
      id: "geo",
      label: "Home-market tilt",
      status: "info",
      detail: `${maxGeo} is ${pctS(maxGeoW, 0)} of the portfolio - fine if intentional; currency and policy risk travel together`,
      principle: "Damani invests where he understands; just know that's the bet you're making",
    });
  }

  // 7. Is capital riding the best ideas?
  const scored = ws.filter((v) => v.row.scorecard && v.row.scorecard.verdict !== "INSUFFICIENT_DATA");
  if (scored.length) {
    const scoredTotal = scored.reduce((a, b) => a + b.w, 0) || 1;
    const qualityW = scored.filter((v) => (v.row.scorecard?.totalScore ?? 0) >= 65).reduce((a, b) => a + b.w, 0) / scoredTotal;
    checks.push({
      id: "quality-capital",
      label: "Capital in high-quality businesses (score ≥ 65)",
      status: qualityW >= 0.6 ? "pass" : qualityW >= 0.4 ? "warn" : "fail",
      detail: `${pctS(qualityW, 0)} of scored capital sits in holdings scoring 65+`,
      principle: "Akre: the compounding machine only works if most of your money is in it",
    });

    // 8. Capital stuck in laggards
    const laggardW =
      scored
        .filter((v) => v.row.scorecard!.verdict === "WATCH" || v.row.scorecard!.verdict === "REVIEW_EXIT")
        .reduce((a, b) => a + b.w, 0) / scoredTotal;
    checks.push({
      id: "laggard-capital",
      label: "Capital in Watch / Review-for-Exit names ≤ 15%",
      status: laggardW <= 0.15 ? "pass" : laggardW <= 0.3 ? "warn" : "fail",
      detail: `${pctS(laggardW, 0)} of scored capital is in holdings the screener distrusts`,
      principle: "Buffett: patch the leaking boat or change vessels - don't finance the leak",
    });

    // 9. Red-flag exposure
    const flaggedW =
      scored.filter((v) => (v.row.scorecard?.redFlags.length ?? 0) > 0).reduce((a, b) => a + b.w, 0) / scoredTotal;
    checks.push({
      id: "flags",
      label: "Capital exposed to red flags ≤ 10%",
      status: flaggedW <= 0.1 ? "pass" : flaggedW <= 0.25 ? "warn" : "fail",
      detail: `${pctS(flaggedW, 0)} of scored capital carries at least one red flag`,
      principle: "Jhunjhunwala: respect leverage and losses - they compound too",
    });
  }

  return checks;
}

export function computeIncome(rows: AnalyzedHolding[], fx: FxRates): IncomeEstimate {
  const act = activeRows(rows);
  let total = 0;
  let curTotal = 0;
  let investedTotal = 0;
  let payers = 0;
  const byHolding: { label: string; value: number }[] = [];
  for (const r of act) {
    const value = toBase(r.currentValue ?? r.invested, r.holding.currency, fx);
    curTotal += value;
    investedTotal += toBase(r.invested, r.holding.currency, fx);
    // Normalised at the source in lib/yahoo.ts; this stays as a second line of
    // defence for rows restored from an older on-device cache.
    const rawY = r.data?.quote.dividendYield;
    const y = rawY !== undefined && rawY > 1 ? rawY / 100 : rawY;
    if (y && y > 0 && value > 0) {
      const inc = value * y;
      total += inc;
      payers++;
      byHolding.push({ label: r.holding.yahooSymbol, value: inc });
    }
  }
  byHolding.sort((a, b) => b.value - a.value);
  return {
    total,
    byHolding,
    yieldOnValue: curTotal > 0 ? total / curTotal : undefined,
    yieldOnCost: investedTotal > 0 ? total / investedTotal : undefined,
    payers,
  };
}
