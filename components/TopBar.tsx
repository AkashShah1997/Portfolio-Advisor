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

        {/* market switch — always on top, one market at a time */}
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
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-page hairline text-[14px] text-ink-2 hover:text-ink transition-colors"
        >
          <span aria-hidden>{theme === "dark" ? "☀" : "☾"}</span>
        </button>

        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2 bg-page hairline rounded-full px-2.5 py-[4px]"
          title="Holdings and watchlists are saved only in this browser's local storage. No server, no account — clearing site data erases everything."
        >
          <span aria-hidden>🔒</span> Local-only
        </span>
      </div>
    </div>
  );
}
