"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { applyTheme, loadTheme, MARKET_META, MARKETS, type Market, type Theme } from "@/lib/store";

/** Sticky app chrome: brand, the India | Canada switch, and the local-only promise. */
export function TopBar({
  market,
  onMarket,
  onHome,
}: {
  market: Market | null;
  onMarket: (m: Market) => void;
  onHome: () => void;
}) {
  // theme state syncs with the saved value after mount (SSR always renders light)
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) setTheme(loadTheme());
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="sticky top-0 z-40 glass border-b border-grid no-print">
      <div className="max-w-6xl mx-auto px-4 h-[58px] flex items-center gap-3">
        <button onClick={onHome} className="flex items-center gap-2.5 group" title="Home">
          <span
            className="w-8 h-8 rounded-xl grid place-items-center text-[16px] elev-1"
            style={{ background: "linear-gradient(135deg, #2a78d6 0%, #1baf7a 120%)" }}
            aria-hidden
          >
            🧭
          </span>
          <span className="font-semibold tracking-tight text-[15.5px] group-hover:opacity-80">
            Portfolio Advisor
          </span>
        </button>

        {/* market switch - always on top, one market at a time */}
        <div className="mx-auto flex items-center bg-page hairline rounded-full p-[3px]">
          {MARKETS.map((m) => {
            const meta = MARKET_META[m];
            const active = market === m;
            return (
              <button
                key={m}
                onClick={() => onMarket(m)}
                className={`relative rounded-full px-3.5 sm:px-5 py-[7px] text-[13px] font-semibold transition-colors ${
                  active ? "text-white" : "text-ink-2 hover:text-ink"
                }`}
                aria-pressed={active}
              >
                {active && (
                  <motion.span
                    layoutId="market-pill"
                    className="absolute inset-0 rounded-full bg-series-1"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative z-10">
                  {meta.flag} {meta.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-page hairline text-ink-2 hover:text-ink hover:rotate-12 transition-all"
        >
          {theme === "dark" ? (
            /* sun */
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none" />
              <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" />
            </svg>
          ) : (
            /* crescent moon with a star */
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.6 14.8A8.8 8.8 0 0 1 9.2 3.4a.6.6 0 0 0-.8-.74A9.9 9.9 0 1 0 21.34 15.6a.6.6 0 0 0-.74-.8Z" />
              <path d="M17.2 4.2l.62 1.58 1.58.62-1.58.62-.62 1.58-.62-1.58-1.58-.62 1.58-.62Z" opacity="0.85" />
            </svg>
          )}
        </button>

        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2 bg-page hairline rounded-full px-2.5 py-[4px]"
          title="Holdings and watchlists are saved only in this browser's local storage. No server, no account - clearing site data erases everything."
        >
          <span aria-hidden>🔒</span> Local-only
        </span>
      </div>
    </div>
  );
}
