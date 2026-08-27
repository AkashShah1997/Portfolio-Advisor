/** Shared OHLC history types (safe to import from client and server). */

export type HistoryRange = "6m" | "1y" | "3y" | "5y" | "max";

export const HISTORY_RANGES: { id: HistoryRange; label: string }[] = [
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "3y", label: "3Y" },
  { id: "5y", label: "5Y" },
  { id: "max", label: "Max" },
];

export interface Candle {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface HistoryPayload {
  symbol: string;
  range: HistoryRange;
  interval: "1d" | "1wk" | "1mo";
  candles: Candle[];
  mock?: boolean;
}

/** Simple moving average over closes; emits a point once `len` closes exist. */
export function sma(candles: Candle[], len: number): { time: string; value: number }[] {
  const out: { time: string; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= len) sum -= candles[i - len].close;
    if (i >= len - 1) out.push({ time: candles[i].time, value: sum / len });
  }
  return out;
}

/**
 * Day-equivalent MA length for the chart's interval, so "the 200-day MA" is
 * ALWAYS the 200-day MA: 200 bars on daily, 40 bars on weekly, 10 on monthly.
 * (The old behavior - 200 weekly bars = a 4-YEAR average - is why golden/death
 * crosses never appeared on long-range views.)
 */
export function maLenForInterval(days: number, interval: "1d" | "1wk" | "1mo"): number {
  const perBar = interval === "1d" ? 1 : interval === "1wk" ? 5 : 21;
  return Math.max(2, Math.round(days / perBar));
}

export interface MaCross {
  time: string;
  kind: "golden" | "death"; // short MA crossing above (golden) / below (death) the long MA
}

/** Golden/death crosses of two MA series over the same candles. */
export function maCrossings(candles: Candle[], shortLen: number, longLen: number): MaCross[] {
  const s = new Map(sma(candles, shortLen).map((p) => [p.time, p.value]));
  const l = sma(candles, longLen);
  const out: MaCross[] = [];
  let prev: number | undefined;
  for (const p of l) {
    const sv = s.get(p.time);
    if (sv === undefined) continue;
    const diff = sv - p.value;
    if (prev !== undefined) {
      if (prev <= 0 && diff > 0) out.push({ time: p.time, kind: "golden" });
      else if (prev >= 0 && diff < 0) out.push({ time: p.time, kind: "death" });
    }
    prev = diff;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pre-built long-term trendlines - drawn FOR you, from the same price series.
// ---------------------------------------------------------------------------

export interface ChannelPoint {
  time: string;
  value: number;
}

export interface RegressionChannel {
  mid: [ChannelPoint, ChannelPoint];
  upper: [ChannelPoint, ChannelPoint];
  lower: [ChannelPoint, ChannelPoint];
  /** compound growth implied by the fitted line, per year (e.g. 0.18 = +18%/yr) */
  cagr?: number;
  /** how far the LAST close sits inside the band: 0 = on the lower line, 1 = upper */
  position?: number;
}

/**
 * Least-squares trend channel on LOG closes (a straight line in log space is
 * constant compounding - the right ruler for a long-term chart). The band is
 * ±2 standard deviations of the residuals: price near the lower rail is cheap
 * vs its own trend, near the upper rail stretched. Needs ≥30 bars.
 */
export function regressionChannel(candles: Candle[]): RegressionChannel | null {
  const pts = candles.filter((c) => c.close > 0);
  const n = pts.length;
  if (n < 30) return null;
  const ys = pts.map((c) => Math.log(c.close));
  const xm = (n - 1) / 2;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - xm) * (ys[i] - ym);
    sxx += (i - xm) * (i - xm);
  }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  const icpt = ym - slope * xm;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (icpt + slope * i);
    sse += r * r;
  }
  const sd = Math.sqrt(sse / Math.max(1, n - 2));
  const at = (i: number, off: number) => Math.exp(icpt + slope * i + off);
  const t0 = pts[0].time;
  const t1 = pts[n - 1].time;
  const years =
    (new Date(t1).getTime() - new Date(t0).getTime()) / (365.25 * 24 * 3600 * 1000);
  const cagr = years > 0.2 ? Math.exp((slope * (n - 1)) / years) - 1 : undefined;
  const lastLog = ys[n - 1];
  const lowLog = icpt + slope * (n - 1) - 2 * sd;
  const position = sd > 0 ? (lastLog - lowLog) / (4 * sd) : undefined;
  return {
    mid: [
      { time: t0, value: at(0, 0) },
      { time: t1, value: at(n - 1, 0) },
    ],
    upper: [
      { time: t0, value: at(0, 2 * sd) },
      { time: t1, value: at(n - 1, 2 * sd) },
    ],
    lower: [
      { time: t0, value: at(0, -2 * sd) },
      { time: t1, value: at(n - 1, -2 * sd) },
    ],
    cagr,
    position: position !== undefined ? Math.max(0, Math.min(1, position)) : undefined,
  };
}

export interface SwingLevel {
  price: number;
  touches: number; // how many separate swing points cluster at this price
  kind: "support" | "resistance" | "both";
}

/**
 * Automatic support/resistance from swing points: local highs/lows that stood
 * out for `k` bars on each side, clustered when within `tolerance` of each
 * other. More touches = a level the market has actually respected. Long-term
 * levels only - the strongest few, not a pivot-point ladder.
 */
export function swingLevels(
  candles: Candle[],
  opts: { maxLevels?: number; tolerance?: number } = {}
): SwingLevel[] {
  const maxLevels = opts.maxLevels ?? 4;
  const tolerance = opts.tolerance ?? 0.02;
  const n = candles.length;
  if (n < 20) return [];
  const k = Math.max(3, Math.round(n / 40));
  const pivots: { price: number; high: boolean }[] = [];
  for (let i = k; i < n - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ price: candles[i].high, high: true });
    if (isLow) pivots.push({ price: candles[i].low, high: false });
  }
  if (!pivots.length) return [];
  // cluster pivots within tolerance (relative)
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; highs: number; lows: number }[] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && p.price <= last.prices[0] * (1 + tolerance)) {
      last.prices.push(p.price);
      if (p.high) last.highs++;
      else last.lows++;
    } else {
      clusters.push({ prices: [p.price], highs: p.high ? 1 : 0, lows: p.high ? 0 : 1 });
    }
  }
  const levels: SwingLevel[] = clusters.map((c) => ({
    price: c.prices.reduce((a, b) => a + b, 0) / c.prices.length,
    touches: c.prices.length,
    kind: c.highs && c.lows ? "both" : c.highs ? "resistance" : "support",
  }));
  return levels
    .sort((a, b) => b.touches - a.touches || b.price - a.price)
    .slice(0, maxLevels)
    .sort((a, b) => a.price - b.price);
}
