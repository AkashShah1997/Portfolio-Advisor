import type { MetricRow } from "./screens";

/**
 * Sector comparison built from YOUR OWN market scan - the honest version of
 * the "industry P/E" row on the big portals. Instead of a black-box industry
 * average, every number here comes from the same universe the screeners
 * scored, cached on this device, so you can see exactly who the "industry"
 * is. Needs a market scan first (Decisions or Ideas tab).
 */

export interface PeerMetric {
  key: keyof MetricRow;
  label: string;
  /** true when a HIGHER value is better (ROE); false when lower is (P/E) */
  higherBetter: boolean;
  /** formatting hint for the UI */
  kind: "pct" | "x" | "score";
}

export const PEER_METRICS: PeerMetric[] = [
  { key: "score", label: "Quality score", higherBetter: true, kind: "score" },
  { key: "roeAvg", label: "ROE (5y avg)", higherBetter: true, kind: "pct" },
  { key: "roceAvg", label: "ROCE (5y avg)", higherBetter: true, kind: "pct" },
  { key: "revCagr", label: "Revenue growth", higherBetter: true, kind: "pct" },
  { key: "pe", label: "P/E", higherBetter: false, kind: "x" },
  { key: "pb", label: "P/B", higherBetter: false, kind: "x" },
  { key: "divYield", label: "Dividend yield", higherBetter: true, kind: "pct" },
];

export interface PeerRank {
  key: string;
  label: string;
  kind: PeerMetric["kind"];
  you?: number;
  median?: number;
  rank?: number; // 1 = best on this metric among peers with data
  of?: number;
  better: boolean; // you vs median, in the metric's own direction
}

export interface PeerStats {
  sector: string;
  n: number; // peers with data in this sector (including this stock if scanned)
  peers: MetricRow[]; // top peers by score (this stock included when present)
  ranks: PeerRank[];
  read: string; // one plain-words line
}

function median(vals: number[]): number | undefined {
  if (!vals.length) return undefined;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Compare one stock against its scanned sector. `self` supplies the stock's
 * own metrics (it may or may not be inside `universe`). Returns null when the
 * scan knows fewer than 4 sector peers - a median of two is a coin flip.
 */
export function sectorPeers(self: MetricRow, universe: MetricRow[], top = 6): PeerStats | null {
  const sector = self.sector;
  if (!sector || sector === "–" || sector === "Unknown") return null;
  const seen = new Set<string>();
  const peers: MetricRow[] = [];
  for (const r of [...universe, self]) {
    if (r.sector !== sector) continue;
    const k = r.symbol.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    peers.push(k === self.symbol.toUpperCase() ? self : r);
  }
  if (peers.length < 4) return null;

  const ranks: PeerRank[] = PEER_METRICS.map((met) => {
    const withData = peers
      .map((p) => ({ sym: p.symbol.toUpperCase(), v: p[met.key] as number | undefined }))
      .filter((x): x is { sym: string; v: number } => typeof x.v === "number" && Number.isFinite(x.v));
    const med = median(withData.map((x) => x.v));
    const you = self[met.key] as number | undefined;
    let rank: number | undefined;
    if (you !== undefined && withData.length) {
      const sorted = [...withData].sort((a, b) => (met.higherBetter ? b.v - a.v : a.v - b.v));
      const idx = sorted.findIndex((x) => x.sym === self.symbol.toUpperCase());
      rank = idx >= 0 ? idx + 1 : undefined;
    }
    const better =
      you !== undefined && med !== undefined
        ? met.higherBetter
          ? you >= med
          : you <= med
        : false;
    return { key: String(met.key), label: met.label, kind: met.kind, you, median: med, rank, of: withData.length, better };
  });

  const beats = ranks.filter((r) => r.you !== undefined && r.median !== undefined);
  const won = beats.filter((r) => r.better).length;
  const read = beats.length
    ? `Beats its sector median on ${won} of ${beats.length} yardsticks${won >= Math.ceil(beats.length * 0.7) ? " - a sector leader by the numbers" : won <= Math.floor(beats.length * 0.3) ? " - the sector has stronger names; check the peers below" : ""}.`
    : "Not enough overlapping data to compare fairly.";

  return {
    sector,
    n: peers.length,
    peers: [...peers].sort((a, b) => b.score - a.score).slice(0, top),
    ranks,
    read,
  };
}
