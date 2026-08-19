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
