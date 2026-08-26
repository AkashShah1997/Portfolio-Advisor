import type { Market } from "./store";
import type { Candle } from "./history";

/**
 * Market weather - the macro situation from free, crumb-free Yahoo history:
 * index trend (vs 200-DMA), drawdown from the 52-week high, volatility (VIX /
 * India VIX) with fear bands, the home currency vs USD, gold, oil and the US
 * 10-year yield. Condensed into ONE plain-words regime read.
 *
 * The philosophy is stated, not hidden: for a 5-year+ value investor macro is
 * CONTEXT, never a timing signal - the buy-below prices already encode the
 * discipline. What macro changes is posture: how greedy to be when others are
 * fearful (Buffett), and how much margin of safety to demand when the sun is
 * out. All pure math here; fetching lives in lib/yahoo.ts.
 */

export type MacroTone = "good" | "neutral" | "warning" | "serious";

export interface MacroItem {
  key: string;
  label: string;
  value: string; // formatted, e.g. "24,812" or "14.2"
  sub: string; // one-liner, e.g. "+11.2% 1y · 4% below high"
  tone: MacroTone;
}

export interface MacroRegime {
  key: "FEAR" | "CORRECTION" | "EXPENSIVE_CALM" | "NORMAL";
  tone: MacroTone;
  headline: string;
  advice: string;
}

export interface MacroPayload {
  market: Market;
  asOf: string;
  items: MacroItem[];
  regime: MacroRegime;
  mock?: boolean;
  errors?: string[];
}

/** Symbols per market - all served by Yahoo's crumb-free chart endpoint. */
export const MACRO_SYMBOLS: Record<
  Market,
  { key: string; symbol: string; label: string }[]
> = {
  india: [
    { key: "index", symbol: "^NSEI", label: "NIFTY 50" },
    { key: "vix", symbol: "^INDIAVIX", label: "India VIX" },
    { key: "fx", symbol: "INR=X", label: "USD/INR" },
    { key: "gold", symbol: "GC=F", label: "Gold" },
    { key: "oil", symbol: "BZ=F", label: "Brent oil" },
    { key: "us10y", symbol: "^TNX", label: "US 10-yr yield" },
    { key: "silver", symbol: "SI=F", label: "Silver" },
  ],
  canada: [
    { key: "index", symbol: "^GSPTSE", label: "TSX Composite" },
    { key: "vix", symbol: "^VIX", label: "VIX" },
    { key: "fx", symbol: "CAD=X", label: "USD/CAD" },
    { key: "gold", symbol: "GC=F", label: "Gold" },
    { key: "oil", symbol: "CL=F", label: "WTI oil" },
    { key: "us10y", symbol: "^TNX", label: "US 10-yr yield" },
    { key: "silver", symbol: "SI=F", label: "Silver" },
  ],
};

/** Label lookup by key (chip order is decided in buildMacroItems, not here). */
const labelOf = (market: Market, key: string) =>
  MACRO_SYMBOLS[market].find((s) => s.key === key)?.label ?? key;

// ---------- pure series math ----------

export interface SeriesStats {
  last?: number;
  ret1y?: number; // vs first close of the window
  fromHigh?: number; // ≤0, distance from 52w high
  above200dma?: boolean;
}

/** Stats from ~1y of daily candles (tolerates shorter windows honestly). */
export function seriesStats(candles: Candle[]): SeriesStats {
  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 30) return {};
  const last = closes[closes.length - 1];
  const first = closes[0];
  const high = Math.max(...closes);
  const dmaWindow = closes.slice(-200);
  const dma = dmaWindow.reduce((a, b) => a + b, 0) / dmaWindow.length;
  return {
    last,
    ret1y: first > 0 ? last / first - 1 : undefined,
    fromHigh: high > 0 ? last / high - 1 : undefined,
    above200dma: last >= dma,
  };
}

const pct = (v: number | undefined, d = 1) =>
  v === undefined ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const num = (v: number | undefined, d = 0) =>
  v === undefined ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

// ---------- item builders ----------

export function vixBand(level: number | undefined): { label: string; tone: MacroTone } {
  if (level === undefined) return { label: "unknown", tone: "neutral" };
  if (level < 14) return { label: "calm", tone: "good" };
  if (level < 20) return { label: "normal", tone: "neutral" };
  if (level < 28) return { label: "nervous", tone: "warning" };
  return { label: "fear", tone: "serious" };
}

export function buildMacroItems(market: Market, stats: Record<string, SeriesStats>): MacroItem[] {
  const items: MacroItem[] = [];
  const ix = stats.index ?? {};
  const ixLabel = labelOf(market, "index");
  if (ix.last !== undefined) {
    items.push({
      key: "index",
      label: ixLabel,
      value: num(ix.last),
      sub: `${pct(ix.ret1y)} 1y · ${ix.fromHigh !== undefined ? `${Math.abs(ix.fromHigh * 100).toFixed(1)}% below high` : "–"} · ${ix.above200dma ? "above" : "below"} 200-day avg`,
      tone: (ix.fromHigh ?? 0) <= -0.15 ? "serious" : (ix.fromHigh ?? 0) <= -0.08 || ix.above200dma === false ? "warning" : "good",
    });
  }
  const vx = stats.vix ?? {};
  if (vx.last !== undefined) {
    const band = vixBand(vx.last);
    items.push({
      key: "vix",
      label: labelOf(market, "vix"),
      value: vx.last.toFixed(1),
      sub: `${band.label} (calm <14 · fear >28)`,
      tone: band.tone,
    });
  }
  const fx = stats.fx ?? {};
  if (fx.last !== undefined) {
    const weaker = (fx.ret1y ?? 0) > 0; // USD/xxx up ⇒ home currency weaker
    items.push({
      key: "fx",
      label: labelOf(market, "fx"),
      value: fx.last.toFixed(2),
      sub: `${pct(fx.ret1y)} 1y - ${market === "india" ? "rupee" : "loonie"} ${weaker ? "weaker" : "stronger"}`,
      tone: (fx.ret1y ?? 0) > 0.05 ? "warning" : "neutral",
    });
  }
  const gold = stats.gold ?? {};
  if (gold.last !== undefined) {
    items.push({
      key: "gold",
      label: "Gold",
      value: `$${num(gold.last)}`,
      sub: `${pct(gold.ret1y)} 1y - the fear asset`,
      tone: (gold.ret1y ?? 0) > 0.2 ? "warning" : "neutral",
    });
  }
  const silver = stats.silver ?? {};
  if (silver.last !== undefined) {
    items.push({
      key: "silver",
      label: "Silver",
      value: `$${silver.last.toFixed(1)}`,
      sub: `${pct(silver.ret1y)} 1y - gold's volatile sibling`,
      tone: (silver.ret1y ?? 0) > 0.35 ? "warning" : "neutral",
    });
  }
  // gold ÷ silver - how many ounces of silver one ounce of gold buys
  if (gold.last !== undefined && silver.last !== undefined && silver.last > 0) {
    const ratio = gold.last / silver.last;
    const band =
      ratio >= 85 ? "silver historically cheap vs gold" : ratio <= 50 ? "silver rich vs gold" : "near the long-run band";
    items.push({
      key: "gsRatio",
      label: "Gold/silver ratio",
      value: ratio.toFixed(0),
      sub: `${band} (long-run ~60-70) - context, never a signal`,
      tone: "neutral",
    });
  }
  // gold in YOUR currency - the number local gold funds actually track
  const fxs = stats.fx ?? {};
  if (gold.last !== undefined && fxs.last !== undefined) {
    const localRet =
      gold.ret1y !== undefined && fxs.ret1y !== undefined
        ? (1 + gold.ret1y) * (1 + fxs.ret1y) - 1
        : undefined;
    if (market === "india") {
      const per10g = (gold.last * fxs.last * 10) / 31.1035;
      items.push({
        key: "goldLocal",
        label: "Gold in ₹ (10g)",
        value: `₹${num(per10g)}`,
        sub: `${pct(localRet)} 1y in rupees - what GOLDBEES-style funds track`,
        tone: "neutral",
      });
    } else {
      const perOz = gold.last * fxs.last;
      items.push({
        key: "goldLocal",
        label: "Gold in C$ (oz)",
        value: `C$${num(perOz)}`,
        sub: `${pct(localRet)} 1y in loonies - what local gold funds track`,
        tone: "neutral",
      });
    }
  }
  const oil = stats.oil ?? {};
  if (oil.last !== undefined) {
    items.push({
      key: "oil",
      label: labelOf(market, "oil"),
      value: `$${oil.last.toFixed(0)}`,
      sub: `${pct(oil.ret1y)} 1y${market === "india" ? " - India's biggest import" : ""}`,
      tone: market === "india" && (oil.ret1y ?? 0) > 0.25 ? "warning" : "neutral",
    });
  }
  const y = stats.us10y ?? {};
  if (y.last !== undefined) {
    const level = y.last / 10; // ^TNX quotes 42.5 for 4.25%
    items.push({
      key: "us10y",
      label: "US 10-yr yield",
      value: `${level.toFixed(2)}%`,
      sub: `${pct(y.ret1y)} 1y - the world's discount rate`,
      tone: level >= 5 ? "warning" : "neutral",
    });
  }
  return items;
}

// ---------- the regime read ----------

export function readRegime(inp: {
  fromHigh?: number;
  above200dma?: boolean;
  vix?: number;
}): MacroRegime {
  const dd = inp.fromHigh ?? 0;
  const vix = inp.vix;
  const fear = (vix !== undefined && vix >= 28) || dd <= -0.15;
  const cooling = dd <= -0.08 || inp.above200dma === false;
  const calmHighs = dd >= -0.03 && vix !== undefined && vix < 14;

  if (fear) {
    return {
      key: "FEAR",
      tone: "good",
      headline: "Fear is on sale - this is what long-term buyers wait years for.",
      advice:
        "“Be greedy when others are fearful” (Buffett). Deploy gradually into quality names from your buy-zone and consensus lists - in tranches, not all at once, and only businesses you'd hold through worse.",
    };
  }
  if (cooling) {
    return {
      key: "CORRECTION",
      tone: "warning",
      headline: "The market is cooling - watchlist season, not panic season.",
      advice:
        "Corrections are when watchlists earn their keep: quality names drift toward your buy-below prices. Re-check the Decisions tab, keep cash ready, ignore forecasts.",
    };
  }
  if (calmHighs) {
    return {
      key: "EXPENSIVE_CALM",
      tone: "warning",
      headline: "Sunny and near the highs - the easy money is behind, not ahead.",
      advice:
        "Calm markets at record prices reward patience over activity: demand a bigger margin of safety, don't chase what already ran, and let SIPs/averaging do the buying.",
    };
  }
  return {
    key: "NORMAL",
    tone: "neutral",
    headline: "Nothing extreme in the weather - stick to the plan.",
    advice:
      "No macro edge to exploit either way. Price discipline beats prediction: your buy-below levels and the action plan already encode everything this dashboard knows.",
  };
}

export function buildMacroPayload(
  market: Market,
  stats: Record<string, SeriesStats>,
  errors?: string[]
): MacroPayload {
  return {
    market,
    asOf: new Date().toISOString(),
    items: buildMacroItems(market, stats),
    regime: readRegime({
      fromHigh: stats.index?.fromHigh,
      above200dma: stats.index?.above200dma,
      vix: stats.vix?.last,
    }),
    errors: errors?.length ? errors : undefined,
  };
}

/** Deterministic demo payload for MOCK_DATA=1 runs. */
export function mockMacro(market: Market): MacroPayload {
  const stats: Record<string, SeriesStats> =
    market === "india"
      ? {
          index: { last: 26480, ret1y: 0.112, fromHigh: -0.041, above200dma: true },
          vix: { last: 15.2, ret1y: 0.04 },
          fx: { last: 87.6, ret1y: 0.031 },
          gold: { last: 3390, ret1y: 0.27 },
          silver: { last: 52.4, ret1y: 0.31 },
          oil: { last: 78, ret1y: -0.12 },
          us10y: { last: 41.2, ret1y: -0.06 },
        }
      : {
          index: { last: 27140, ret1y: 0.148, fromHigh: -0.022, above200dma: true },
          vix: { last: 13.1, ret1y: -0.1 },
          fx: { last: 1.35, ret1y: -0.012 },
          gold: { last: 3390, ret1y: 0.27 },
          silver: { last: 52.4, ret1y: 0.31 },
          oil: { last: 74, ret1y: -0.1 },
          us10y: { last: 41.2, ret1y: -0.06 },
        };
  return { ...buildMacroPayload(market, stats), mock: true };
}
