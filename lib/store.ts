import type { Currency, Holding } from "./types";
import type { UniverseCountry } from "./universe";

/**
 * Local-only persistence. Everything lives in THIS browser's localStorage -
 * no server, no database, no account, nothing ever leaves the device.
 * Clearing the browser's site data (or the in-app "erase" button) removes it all.
 */

export type Market = "india" | "canada";

export const MARKETS: Market[] = ["india", "canada"];

export const MARKET_META: Record<
  Market,
  {
    label: string;
    flag: string;
    broker: "zerodha" | "wealthsimple";
    brokerName: string;
    base: Currency;
    countries: UniverseCountry[];
    exchanges: string;
    csvHint: string;
    /** market index used for the hero-chart benchmark comparison */
    benchmark: { symbol: string; label: string };
  }
> = {
  india: {
    label: "India",
    flag: "🇮🇳",
    broker: "zerodha",
    brokerName: "Zerodha",
    base: "INR",
    countries: ["India"],
    exchanges: "NSE · BSE",
    csvHint: "Console → Portfolio → Holdings → Download CSV",
    benchmark: { symbol: "^NSEI", label: "NIFTY 50" },
  },
  canada: {
    label: "Canada",
    flag: "🇨🇦",
    broker: "wealthsimple",
    brokerName: "Wealthsimple",
    base: "CAD",
    countries: ["Canada", "United States"],
    exchanges: "TSX · US listings",
    csvHint: "Export holdings as CSV (Symbol, Quantity, Avg cost / Book cost, Currency)",
    benchmark: { symbol: "^GSPTSE", label: "TSX Composite" },
  },
};

/** Which market a holding belongs to (broker first, currency as fallback for manual rows). */
export function marketOfHolding(h: Holding): Market {
  if (h.broker === "zerodha") return "india";
  if (h.broker === "wealthsimple") return "canada";
  return h.currency === "INR" ? "india" : "canada";
}

const HOLDINGS_KEY = (m: Market) => `pa.v2.holdings.${m}`;
const MARKET_KEY = "pa.v2.market";
const UIMODE_KEY = "pa.v2.uimode";

const THEME_KEY = "pa.v2.theme";

export type Theme = "light" | "dark";

export function loadTheme(): Theme {
  if (!canStore()) return "light";
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Persist + apply the theme (data-theme on <html>) + notify listeners (charts). */
export function applyTheme(t: Theme): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
  if (t === "dark") document.documentElement.dataset.theme = "dark";
  else document.documentElement.removeAttribute("data-theme");
  window.dispatchEvent(new CustomEvent("pa-theme", { detail: t }));
}

/** Simple (3 tabs, plain words) vs the full toolbench. Saved on-device. */
export type UiMode = "simple" | "all";

export function loadUiMode(): UiMode {
  if (!canStore()) return "simple";
  try {
    return window.localStorage.getItem(UIMODE_KEY) === "all" ? "all" : "simple";
  } catch {
    return "simple";
  }
}

export function saveUiMode(m: UiMode): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(UIMODE_KEY, m);
  } catch {
    /* ignore */
  }
}

const canStore = () => typeof window !== "undefined" && !!window.localStorage;

export function loadHoldings(m: Market): Holding[] | null {
  if (!canStore()) return null;
  try {
    const raw = window.localStorage.getItem(HOLDINGS_KEY(m));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: number; holdings: Holding[] };
    if (!Array.isArray(parsed.holdings)) return null;
    return parsed.holdings.filter((h) => h && typeof h.yahooSymbol === "string");
  } catch {
    return null;
  }
}

export function saveHoldings(m: Market, holdings: Holding[]): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(HOLDINGS_KEY(m), JSON.stringify({ v: 2, holdings }));
  } catch {
    /* storage full/blocked - stay silent, the app still works in-memory */
  }
}

export function clearHoldings(m: Market): void {
  if (!canStore()) return;
  try {
    window.localStorage.removeItem(HOLDINGS_KEY(m));
  } catch {
    /* ignore */
  }
}

export function loadMarket(): Market | null {
  if (!canStore()) return null;
  try {
    const m = window.localStorage.getItem(MARKET_KEY);
    return m === "india" || m === "canada" ? m : null;
  } catch {
    return null;
  }
}

export function saveMarket(m: Market | null): void {
  if (!canStore()) return;
  try {
    if (m) window.localStorage.setItem(MARKET_KEY, m);
    else window.localStorage.removeItem(MARKET_KEY);
  } catch {
    /* ignore */
  }
}

/** Wipe everything this app stored on the device. */
export function eraseAll(): void {
  if (!canStore()) return;
  try {
    for (const m of MARKETS) window.localStorage.removeItem(HOLDINGS_KEY(m));
    window.localStorage.removeItem(MARKET_KEY);
    window.localStorage.removeItem(UIMODE_KEY);
  } catch {
    /* ignore */
  }
}
