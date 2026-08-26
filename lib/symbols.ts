import type { Currency } from "./types";

/** Trading currency implied by a Yahoo symbol suffix. */
export function currencyForSymbol(yahooSymbol: string): Currency {
  const s = yahooSymbol.toUpperCase().trim();
  if (s.endsWith(".NS") || s.endsWith(".BO")) return "INR";
  if (s.endsWith(".TO") || s.endsWith(".V") || s.endsWith(".NE") || s.endsWith(".CN")) return "CAD";
  return "USD";
}

export function exchangeLabel(yahooSymbol: string): string {
  const s = yahooSymbol.toUpperCase().trim();
  if (s.endsWith(".NS")) return "NSE";
  if (s.endsWith(".BO")) return "BSE";
  if (s.endsWith(".TO")) return "TSX";
  if (s.endsWith(".V")) return "TSX-V";
  if (s.endsWith(".NE")) return "NEO";
  if (s.endsWith(".CN")) return "CSE";
  return "US";
}

export function countryForSymbol(yahooSymbol: string): string {
  const c = currencyForSymbol(yahooSymbol);
  return c === "INR" ? "India" : c === "CAD" ? "Canada" : "United States";
}

/** Build a default Yahoo symbol guess from a raw broker symbol. */
export function guessYahooSymbol(
  rawSymbol: string,
  broker: "zerodha" | "wealthsimple" | "manual",
  currencyHint?: string
): string {
  let s = rawSymbol.toUpperCase().trim();
  if (!s) return s;
  // Already has a Yahoo-style suffix - trust it.
  if (/\.(NS|BO|TO|V|NE|CN)$/.test(s)) return s;

  if (broker === "zerodha") {
    // Zerodha symbols are NSE trading symbols; strip series suffixes like "-BE", "-BZ".
    s = s.replace(/-(BE|BZ|BL|EQ|SM|ST)$/, "");
    return `${s}.NS`;
  }
  if (broker === "wealthsimple") {
    // Wealthsimple mixes CAD and USD listings. Use currency hint when present.
    if (currencyHint?.toUpperCase().includes("CAD")) {
      return `${s.replace(/\.(TO)$/, "")}.TO`;
    }
    return s; // assume US listing; user can override to .TO
  }
  return s;
}

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  INR: "₹",
  CAD: "C$",
  USD: "US$",
};

export function fmtMoney(v: number | undefined | null, currency: Currency, compact = false): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "–";
  const sym = CURRENCY_SYMBOL[currency];
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (compact) {
    if (currency === "INR") {
      // Indian conventions: lakh / crore / lakh crore
      if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)} L Cr`;
      if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(2)} Cr`;
      if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(2)} L`;
    } else {
      if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
    }
  }
  return `${sign}${sym}${abs.toLocaleString(currency === "INR" ? "en-IN" : "en-CA", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}`;
}

export function fmtPct(v: number | undefined | null, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "–";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "–";
  return v.toFixed(digits);
}
