import type { Candle } from "./history";

/**
 * A stock's actual crash record - not a model, the price history.
 *
 * For each real market shock the price series covers: how far this stock fell
 * peak-to-trough inside that window, how long it took to get back to the old
 * high, and how that compares with the index. This is the single most useful
 * thing to know before buying a business you intend to hold for a decade,
 * because the question is never "will it fall?" - it is "will I still be
 * holding it at the bottom?"
 *
 * Honest limits, printed in the UI: survivors only (a stock that never
 * recovered has no chart to show), price-only, and the next crash will have a
 * different cause. What repeats is the SHAPE - leverage falls hardest,
 * cash-generative franchises recover first.
 */

export interface CrashWindow {
  id: string;
  label: string;
  from: string; // YYYY-MM-DD
  to: string; // end of the falling phase
  blurb: string;
}

export const CRASH_WINDOWS: CrashWindow[] = [
  {
    id: "gfc2008",
    label: "2008 financial crisis",
    from: "2007-10-01",
    to: "2009-03-31",
    blurb: "The everything-crash: credit froze and leverage decided who survived.",
  },
  {
    id: "taper2013",
    label: "2013 taper tantrum",
    from: "2013-05-01",
    to: "2013-09-30",
    blurb: "Rates jumped and emerging-market currencies broke - an India-specific stress test.",
  },
  {
    id: "china2015",
    label: "2015-16 growth scare",
    from: "2015-04-01",
    to: "2016-02-29",
    blurb: "China slowdown plus an oil collapse; cyclicals and commodities took the damage.",
  },
  {
    id: "covid2020",
    label: "2020 COVID crash",
    from: "2020-02-01",
    to: "2020-03-31",
    blurb: "The fastest 30%+ fall in history, and the fastest recovery.",
  },
  {
    id: "rates2022",
    label: "2022 rate shock",
    from: "2022-01-01",
    to: "2022-10-31",
    blurb: "Money stopped being free and everything expensive was repriced.",
  },
];

export interface CrashResult {
  id: string;
  label: string;
  blurb: string;
  /** peak-to-trough inside the window, as a negative fraction */
  drawdown: number;
  peakDate: string;
  troughDate: string;
  /** months from the trough back to the pre-crash peak; undefined = never regained within the data */
  recoveryMonths?: number;
  recovered: boolean;
  /** same-window index drawdown when a benchmark series was supplied */
  benchDrawdown?: number;
  /** positive = this stock held up better than the index */
  vsBench?: number;
  partial: boolean; // the window is only partly covered by the data
}

function monthsBetween(a: string, b: string): number {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.max(0, (d2 - d1) / (30.44 * 24 * 3600 * 1000));
}

/** Worst peak-to-trough fall inside a window, plus the time to regain that peak. */
function windowStats(candles: Candle[], from: string, to: string) {
  const inWin = candles.filter((c) => c.time >= from && c.time <= to && c.close > 0);
  if (inWin.length < 5) return null;
  let peak = inWin[0].close;
  let peakDate = inWin[0].time;
  let bestPeak = peak;
  let bestPeakDate = peakDate;
  let trough = peak;
  let troughDate = peakDate;
  let worst = 0;
  for (const c of inWin) {
    if (c.close > peak) {
      peak = c.close;
      peakDate = c.time;
    }
    const dd = c.close / peak - 1;
    if (dd < worst) {
      worst = dd;
      trough = c.close;
      troughDate = c.time;
      bestPeak = peak;
      bestPeakDate = peakDate;
    }
  }
  if (worst === 0) return null;
  // recovery: first close at/above the pre-crash peak, after the trough
  let recoveryMonths: number | undefined;
  for (const c of candles) {
    if (c.time <= troughDate) continue;
    if (c.close >= bestPeak) {
      recoveryMonths = monthsBetween(troughDate, c.time);
      break;
    }
  }
  return { worst, bestPeakDate, troughDate, trough, recoveryMonths };
}

export function crashRecord(candles: Candle[], bench?: Candle[]): CrashResult[] {
  const sorted = [...candles].filter((c) => c.close > 0).sort((a, b) => a.time.localeCompare(b.time));
  if (sorted.length < 30) return [];
  const first = sorted[0].time;
  const last = sorted[sorted.length - 1].time;
  const out: CrashResult[] = [];
  for (const w of CRASH_WINDOWS) {
    if (w.to < first || w.from > last) continue; // no overlap at all
    const s = windowStats(sorted, w.from, w.to);
    if (!s) continue;
    const b = bench ? windowStats(bench, w.from, w.to) : null;
    out.push({
      id: w.id,
      label: w.label,
      blurb: w.blurb,
      drawdown: s.worst,
      peakDate: s.bestPeakDate,
      troughDate: s.troughDate,
      recoveryMonths: s.recoveryMonths,
      recovered: s.recoveryMonths !== undefined,
      benchDrawdown: b?.worst,
      vsBench: b ? s.worst - b.worst : undefined,
      partial: first > w.from,
    });
  }
  return out;
}

/** The deepest fall on record, whenever it happened - the number that matters most. */
export function worstEver(candles: Candle[]): { drawdown: number; peakDate: string; troughDate: string; recoveryMonths?: number } | null {
  const sorted = [...candles].filter((c) => c.close > 0).sort((a, b) => a.time.localeCompare(b.time));
  if (sorted.length < 30) return null;
  let peak = sorted[0].close;
  let peakDate = sorted[0].time;
  let worst = 0;
  let bestPeak = peak;
  let bestPeakDate = peakDate;
  let troughDate = peakDate;
  for (const c of sorted) {
    if (c.close > peak) {
      peak = c.close;
      peakDate = c.time;
    }
    const dd = c.close / peak - 1;
    if (dd < worst) {
      worst = dd;
      bestPeak = peak;
      bestPeakDate = peakDate;
      troughDate = c.time;
    }
  }
  if (worst === 0) return null;
  let recoveryMonths: number | undefined;
  for (const c of sorted) {
    if (c.time <= troughDate) continue;
    if (c.close >= bestPeak) {
      recoveryMonths = monthsBetween(troughDate, c.time);
      break;
    }
  }
  return { drawdown: worst, peakDate: bestPeakDate, troughDate, recoveryMonths };
}

/** One plain-words read of the whole record. */
export function describeCrashRecord(rows: CrashResult[], worst: { drawdown: number; recoveryMonths?: number } | null): string {
  if (!rows.length && !worst) return "Not enough price history to show how this behaved in past crashes.";
  const deepest = rows.reduce<CrashResult | null>((a, b) => (!a || b.drawdown < a.drawdown ? b : a), null);
  const beat = rows.filter((r) => (r.vsBench ?? 0) > 0).length;
  const withBench = rows.filter((r) => r.vsBench !== undefined).length;
  const parts: string[] = [];
  if (deepest) {
    parts.push(
      `Worst of the named shocks was ${deepest.label}: ${(deepest.drawdown * 100).toFixed(0)}%${deepest.recovered && deepest.recoveryMonths !== undefined ? `, back to the old high in ${Math.round(deepest.recoveryMonths)} months` : ", and it had not regained that high within the data"}.`
    );
  }
  if (withBench) parts.push(`Held up better than the index in ${beat} of ${withBench} of them.`);
  if (worst) {
    parts.push(
      `Deepest fall on record: ${(worst.drawdown * 100).toFixed(0)}%${worst.recoveryMonths !== undefined ? ` (${Math.round(worst.recoveryMonths)} months to recover)` : " (not yet recovered in this data)"}.`
    );
  }
  parts.push("Ask yourself the only question that matters: would you have kept holding, or added, at that price?");
  return parts.join(" ");
}
