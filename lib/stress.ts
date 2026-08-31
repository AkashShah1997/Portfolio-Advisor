import type { AnalyzedHolding, Currency, FxRates } from "./types";
import { toBase } from "./portfolio";
import { isBullionFund, isEtfHolding } from "./etf";
import { capTierOf } from "./screens";

/**
 * The crash stress test - a fire drill, not a forecast.
 *
 * It takes real historical crashes and applies the damage each TYPE of
 * investment took THEN to the portfolio TODAY, so "the market could fall"
 * stops being a scary headline and becomes a concrete number with your name
 * on it. The point is sizing: if the after-number would make you sell at the
 * bottom, the allocation is wrong NOW, while it's calm and cheap to fix.
 *
 * Honesty rules baked in:
 * - Factors are approximate, drawn from index history, and labelled so.
 *   Your actual stocks can do better or worse than their bucket.
 * - The hedge bucket gets stress-tested too: the 1980 gold winter (gold
 *   -65%, 28 years to recover) is included precisely because gold-pitch
 *   videos never mention it. Every asset class has its 2000.
 * - Recovery times and what-DCA-did lines come from the same history, so
 *   the drill teaches the response (keep buying, hold quality), not panic.
 */

export type StressBucket =
  | "hedge"
  | "equityEtf"
  | "largeStock"
  | "midSmallStock"
  | "expensiveStock";

export const BUCKET_META: Record<StressBucket, { label: string; plain: string }> = {
  hedge: { label: "Gold & silver funds", plain: "your insurance sleeve" },
  equityEtf: { label: "Index / equity funds", plain: "broad-market funds" },
  largeStock: { label: "Large-cap stocks", plain: "big established companies" },
  midSmallStock: { label: "Mid & small-cap stocks", plain: "smaller companies - they fall harder" },
  expensiveStock: { label: "Expensive stocks (P/E ≥ 40)", plain: "priced for perfection - furthest to fall" },
};

/** Which crash-bucket a holding belongs to (watchlist rows are skipped upstream). */
export function stressBucketOf(r: AnalyzedHolding): StressBucket {
  const q = r.data?.quote;
  const name = q?.name ?? r.holding.name ?? "";
  const isEtf = isEtfHolding(r.holding.yahooSymbol, name, q?.quoteType, r.holding.securityType);
  if (isEtf) {
    // Miners are equities that happen to dig up metal (see isBullionFund).
    return isBullionFund(r.holding.yahooSymbol, name) ? "hedge" : "equityEtf";
  }
  const pe = q?.trailingPE;
  if (pe !== undefined && pe >= 40) return "expensiveStock";
  const tier = capTierOf(q?.marketCap, r.holding.yahooSymbol);
  // An UNKNOWN size must take the harsher bucket, not the mildest one. Treating
  // "no market cap" as large-cap hid roughly a fifth of the modelled loss.
  if (tier === undefined) return "midSmallStock";
  return tier === "mid" || tier === "small" ? "midSmallStock" : "largeStock";
}

export interface StressScenario {
  id: string;
  label: string;
  window: string;
  story: string; // plain words: what happened
  hits: Record<StressBucket, number>; // approximate peak-to-trough total return
  recovery: string;
  dcaNote: string;
}

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "dotcom2000",
    label: "2000 dot-com bust",
    window: "Mar 2000 – Oct 2002",
    story:
      "The internet was real, and the Nasdaq still fell 78% (5,048 on 10 Mar 2000 to 1,114 on 9 Oct 2002). The crash sorted stocks by PRICE PAID, not by how exciting the technology was: the expensive fell furthest, boring profitable businesses fell least, and gold quietly rose.",
    // Verified: S&P 500 -49% peak-to-trough, Nasdaq -77.9%; gold ROSE ~15% over
    // the same span; value and small-cap value held up far better than the index.
    hits: { hedge: 0.15, equityEtf: -0.45, largeStock: -0.35, midSmallStock: -0.3, expensiveStock: -0.78 },
    recovery:
      "The S&P 500 took 7 years to reclaim its high (30 May 2007); the Nasdaq took 15 (23 Apr 2015). Cheap quality names were whole years earlier - many value portfolios actually GAINED through 2000-02.",
    dcaNote:
      "A fixed monthly buy kept running through the bust was back in profit by ~2004-06, years before buy-and-forget money at the top.",
  },
  {
    id: "gfc2008",
    label: "2008 financial crisis",
    window: "Oct 2007 – Mar 2009",
    story:
      "The everything-crash: banks froze, and for a few months ALL assets fell together because everyone needed cash - even gold fell about 30% before setting a new record 11 months after its low. Diversification helps less during the crash and more in the recovery.",
    // Verified peak-to-trough: S&P 500 -56.8% (9 Oct 2007 - 9 Mar 2009),
    // Russell 2000 -59.9%, Sensex ~-60%, BSE Smallcap ~-80%, gold -30%
    // (Mar 2008 $1,011 fix - Nov 2008 $692).
    hits: { hedge: -0.3, equityEtf: -0.57, largeStock: -0.52, midSmallStock: -0.7, expensiveStock: -0.65 },
    recovery:
      "The S&P 500 took about 5.5 years (new high 28 Mar 2013). On a closing basis the Sensex needed about 20 months from the March 2009 bottom (record close 5 Nov 2010) - though its January 2008 INTRADAY peak was not exceeded until 2013. Gold set a new record in October 2009.",
    dcaNote:
      "A SIP that kept running through 2008-09 bought the entire bottom - in India it was strongly profitable by 2010 while lump-sum-at-the-top money was still underwater.",
  },
  {
    id: "covid2020",
    label: "2020 COVID crash",
    window: "Feb – Mar 2020 (5 weeks)",
    story:
      "The fastest 30% fall from a record in S&P 500 history - 22 trading days - and the fastest recovery. Quality businesses and index funds round-tripped within months. The only investors who lost permanently were the ones who sold in March and waited for 'clarity' to get back in.",
    hits: { hedge: -0.12, equityEtf: -0.35, largeStock: -0.3, midSmallStock: -0.4, expensiveStock: -0.3 },
    recovery:
      "The S&P 500 regained its high in six months (18 Aug 2020) - the Nasdaq in under four, the Dow in nine. The fastest major recovery on record.",
    dcaNote:
      "The March-2020 instalment became one of the best single buys of the decade. Nobody who paused their SIP knew when to restart it.",
  },
  {
    id: "rates2022",
    label: "2022 rate shock",
    window: "Jan – Oct 2022",
    story:
      "Interest rates jumped and the market repriced everything expensive: indexes fell ~25%, but profitless 'story' stocks fell 60-90% and many never came back. Gold was flat in dollars - and UP in rupees and loonies as the dollar strengthened.",
    hits: { hedge: 0, equityEtf: -0.25, largeStock: -0.2, midSmallStock: -0.3, expensiveStock: -0.65 },
    recovery:
      "The S&P 500 took just over 2 years (record close 4,839.81 on 19 Jan 2024, from the 3 Jan 2022 peak). Many 2021 favourites bought at any price never recovered at all.",
    dcaNote:
      "Boring index SIPs recovered fully and quickly. The permanent damage was concentrated in expensive stocks bought without a price discipline.",
  },
  {
    id: "gold1980",
    label: "1980 gold winter",
    window: "Jan 1980 – 2008",
    story:
      "The crash gold-pitch videos never mention: after the January 1980 peak of $850, gold fell 65% by 1982 and ultimately about 70% by 1999, and took 28 YEARS to regain $850 in nominal dollars (January 2008) - while boring stocks compounded through the 80s and 90s. Insurance is not an engine.",
    hits: { hedge: -0.65, equityEtf: 0, largeStock: 0, midSmallStock: 0, expensiveStock: 0 },
    recovery:
      "28 years (Jan 1980 → Jan 2008) just to break even in NOMINAL dollars; adjusted for inflation the 1980 peak was not regained until 2011. That is what buying insurance at a panic top costs.",
    dcaNote:
      "This is why the plan caps the hedge sleeve at ~5-10%: enough that it insures, small enough that a two-decade gold winter can't strand your savings.",
  },
];

export interface StressBucketRow {
  bucket: StressBucket;
  label: string;
  n: number;
  value: number; // base currency, before
  hit: number; // factor applied
  after: number;
}

export interface StressResult {
  scenario: StressScenario;
  totalBefore: number;
  totalAfter: number;
  pct: number; // totalAfter/totalBefore - 1 (≤ 0 usually)
  buckets: StressBucketRow[]; // only non-empty, worst hit first
  worst: { symbol: string; bucket: StressBucket; value: number; after: number; hit: number }[];
  covered: number; // holdings included
}

/** Apply one historical scenario to the current portfolio. Null if nothing to test. */
export function runStress(
  rows: AnalyzedHolding[],
  fx: FxRates,
  scenario: StressScenario
): StressResult | null {
  const act = rows.filter((r) => !r.holding.watch && ((r.currentValue ?? r.invested) > 0));
  if (!act.length) return null;
  const byBucket = new Map<StressBucket, StressBucketRow>();
  const perHolding: StressResult["worst"] = [];
  let totalBefore = 0;
  let totalAfter = 0;
  for (const r of act) {
    const bucket = stressBucketOf(r);
    const value = toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx);
    if (!(value > 0)) continue;
    const hit = scenario.hits[bucket];
    const after = value * (1 + hit);
    totalBefore += value;
    totalAfter += after;
    perHolding.push({ symbol: r.holding.yahooSymbol, bucket, value, after, hit });
    const row = byBucket.get(bucket) ?? {
      bucket,
      label: BUCKET_META[bucket].label,
      n: 0,
      value: 0,
      hit,
      after: 0,
    };
    row.n++;
    row.value += value;
    row.after += after;
    byBucket.set(bucket, row);
  }
  if (!(totalBefore > 0)) return null;
  const buckets = [...byBucket.values()].sort((a, b) => a.hit - b.hit);
  const worst = perHolding
    .filter((h) => h.hit < 0)
    .sort((a, b) => a.after - a.value - (b.after - b.value))
    .slice(0, 3);
  return {
    scenario,
    totalBefore,
    totalAfter,
    pct: totalAfter / totalBefore - 1,
    buckets,
    worst,
    covered: perHolding.length,
  };
}

/**
 * The hedge sleeve: share of portfolio value sitting in gold/silver funds.
 * Used by Market weather to show the sleeve against the classic 5-10% band.
 */
export function hedgeShare(
  rows: AnalyzedHolding[],
  fx: FxRates
): { share: number; total: number; symbols: string[] } | null {
  const act = rows.filter((r) => !r.holding.watch && ((r.currentValue ?? r.invested) > 0));
  if (!act.length) return null;
  let total = 0;
  let hedge = 0;
  const symbols: string[] = [];
  for (const r of act) {
    const value = toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx);
    if (!(value > 0)) continue;
    total += value;
    if (stressBucketOf(r) === "hedge") {
      hedge += value;
      symbols.push(r.holding.yahooSymbol);
    }
  }
  if (!(total > 0)) return null;
  return { share: hedge / total, total, symbols };
}
