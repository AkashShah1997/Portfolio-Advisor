"use client";

import { motion } from "motion/react";
import { MARKET_META, MARKETS, type Market } from "@/lib/store";
import { EASE } from "./anim";

const FEATURES = [
  "4-pillar value scorecard",
  "Sell / accumulate decisions",
  "Dead-money detector",
  "Long-term screeners",
  "TradingView-style charts",
  "Intrinsic-value bands",
  "AI prompts for any chatbot",
];

/** First screen: pick a market, everything after is scoped to it. */
export function MarketLanding({
  onPick,
  savedCounts,
}: {
  onPick: (m: Market) => void;
  savedCounts: Record<Market, number>;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 pt-14 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="text-center"
      >
        <div className="text-[42px] leading-none mb-4" aria-hidden>
          🧭
        </div>
        <h1 className="text-[34px] sm:text-[40px] font-semibold tracking-tight leading-[1.1]">
          One market at a time.
          <br />
          Analyzed the way the masters would.
        </h1>
        <p className="text-[14.5px] text-ink-2 mt-4 max-w-xl mx-auto leading-relaxed">
          Pick a market, import that broker&apos;s CSV, and get Buffett · Damani · Jhunjhunwala-school
          analysis: what to <strong className="text-ink">sell</strong>, what to{" "}
          <strong className="text-ink">accumulate</strong>, what to buy instead - on a 5-year horizon.
        </p>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-4 mt-10">
        {MARKETS.map((m, i) => {
          const meta = MARKET_META[m];
          const saved = savedCounts[m];
          return (
            <motion.button
              key={m}
              onClick={() => onPick(m)}
              className="text-left bg-surface hairline rounded-2xl elev-2 p-6 group hover:-translate-y-[2px] transition-transform"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.12 + i * 0.08 }}
              whileTap={{ scale: 0.985 }}
            >
              <div className="flex items-start justify-between">
                <span className="text-[40px] leading-none" aria-hidden>
                  {meta.flag}
                </span>
                {saved > 0 && (
                  <span className="text-[11.5px] font-medium text-success-text bg-status-good/10 border border-status-good/30 rounded-full px-2.5 py-[3px]">
                    {saved} holding{saved === 1 ? "" : "s"} saved on this device
                  </span>
                )}
              </div>
              <div className="text-[22px] font-semibold tracking-tight mt-3">{meta.label}</div>
              <div className="text-[13px] text-ink-2 mt-1">
                {meta.brokerName} CSV · {meta.exchanges}
              </div>
              <div className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-series-1 mt-4">
                {saved > 0 ? "Continue" : "Enter"} {meta.label}
                <span className="group-hover:translate-x-0.5 transition-transform" aria-hidden>
                  →
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <motion.div
        className="flex flex-wrap justify-center gap-1.5 mt-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        {FEATURES.map((f) => (
          <span key={f} className="text-[11.5px] text-ink-2 bg-surface hairline rounded-full px-2.5 py-[4px]">
            {f}
          </span>
        ))}
      </motion.div>

      <motion.p
        className="text-center text-[11.5px] text-muted mt-8 max-w-lg mx-auto leading-relaxed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55, duration: 0.5 }}
      >
        🔒 Everything is saved <strong>only in this browser</strong> - no accounts, no database, no
        cloud. Free Yahoo Finance data, no API keys. Analysis to support your judgment,{" "}
        <strong>not financial advice</strong>.
      </motion.p>
    </div>
  );
}
