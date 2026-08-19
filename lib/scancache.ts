import type { MetricRow } from "./screens";

/**
 * On-device scan cache. Scanning a whole market universe (~100–150 names on
 * free Yahoo data) takes minutes the first time — so every scored name is
 * cached compactly in localStorage for 24h. Reopening the app (or switching
 * tabs) reuses the cache instantly, and a scan only fetches missing/stale
 * names. Cached rows carry no heavy statement data; prompts and watchlist
 * adds re-hydrate a single symbol on demand.
 */

export type MetricLite = Omit<MetricRow, "data" | "scorecard" | "rankNote"> & { t: number };

/** Shared scan progress state (owned by the dashboard, rendered by panels). */
export interface ScanState {
  status: "running" | "done";
  done: number;
  total: number;
  results: MetricRow[];
  errors: number;
  failed: string[];
  throttled: boolean;
  fromCache?: boolean;
}

export type ScanMode = "auto" | "force" | "failed";

const TTL_MS = 24 * 3600 * 1000;
const KEY = (scanKey: string) => `pa.v2.scan.${scanKey}`;

const canStore = () => typeof window !== "undefined" && !!window.localStorage;

export function toLite(r: MetricRow, now = Date.now()): MetricLite {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === "data" || k === "scorecard" || k === "rankNote" || v === undefined) continue;
    rest[k] = v;
  }
  return { ...(rest as unknown as Omit<MetricRow, "data" | "scorecard" | "rankNote">), t: now };
}

export function fromLite(l: MetricLite): MetricRow {
  const { t: _t, ...rest } = l;
  void _t;
  return { ...rest };
}

export function loadScanLites(scanKey: string, now = Date.now()): MetricLite[] {
  if (!canStore()) return [];
  try {
    const raw = window.localStorage.getItem(KEY(scanKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { v: number; rows: MetricLite[] };
    if (!Array.isArray(parsed.rows)) return [];
    return parsed.rows.filter((r) => r && typeof r.symbol === "string" && now - (r.t ?? 0) < TTL_MS);
  } catch {
    return [];
  }
}

/** Merge new rows into the cache (new wins by symbol), pruning stale entries. */
export function saveScanLites(scanKey: string, rows: MetricRow[], now = Date.now()): void {
  if (!canStore()) return;
  try {
    const existing = new Map(loadScanLites(scanKey, now).map((l) => [l.symbol.toUpperCase(), l]));
    for (const r of rows) existing.set(r.symbol.toUpperCase(), toLite(r, now));
    window.localStorage.setItem(KEY(scanKey), JSON.stringify({ v: 2, rows: [...existing.values()] }));
  } catch {
    /* storage full — the scan still works in memory */
  }
}

export function clearScanLites(scanKey: string): void {
  if (!canStore()) return;
  try {
    window.localStorage.removeItem(KEY(scanKey));
  } catch {
    /* ignore */
  }
}
