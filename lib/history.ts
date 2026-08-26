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
 * (The old behavior — 200 weekly bars = a 4-YEAR average — is why golden/death
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
