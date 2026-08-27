"use client";

import type { Holding } from "@/lib/types";
import { MARKET_META, type Market } from "@/lib/store";
import { ImportPanel } from "./ImportPanel";
import { HoldingsTable } from "./HoldingsTable";
import { MastersCard } from "./MastersCard";
import { Badge, Card, SectionTitle } from "./ui";
import { FadeUp } from "./anim";
import { motion } from "motion/react";

/** Per-market import & review step. Holdings persist to this device only. */
export function ImportScreen({
  market,
  holdings,
  warnings,
  restored,
  fatal,
  aiKey,
  aiModel,
  showAi,
  onShowAi,
  onAiKey,
  onAiModel,
  onFile,
  onHoldingsChange,
  onLoadSample,
  onAnalyze,
  onErase,
  onDeepDive,
}: {
  market: Market;
  holdings: Holding[];
  warnings: string[];
  restored: boolean;
  fatal: string | null;
  aiKey: string;
  aiModel: string;
  showAi: boolean;
  onShowAi: (v: boolean) => void;
  onAiKey: (v: string) => void;
  onAiModel: (v: string) => void;
  onFile: (f: File) => void;
  onHoldingsChange: (h: Holding[]) => void;
  onLoadSample: () => void;
  onAnalyze: () => void;
  onErase: () => void;
  onDeepDive?: () => void;
}) {
  const meta = MARKET_META[market];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">
          {meta.flag} Your {meta.label} portfolio
        </h1>
        <p className="text-[13.5px] text-ink-2 mt-1 max-w-2xl">
          Import your {meta.brokerName} CSV (or add rows by hand). Every holding gets 5 years of
          statements, a value-investing scorecard, a fair-value band, and a clear{" "}
          <strong className="text-ink">sell / hold / accumulate</strong> decision.
        </p>
      </div>

      {onDeepDive && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-page hairline rounded-xl px-3.5 py-2.5">
          <span className="text-[12.5px] text-ink-2">
            <strong className="text-ink">Just want to research one stock?</strong> Skip the import - deep-dive any{" "}
            {meta.label} name for its scorecard, SWOT, valuation band and advanced chart.
          </span>
          <button
            onClick={onDeepDive}
            className="ml-auto bg-series-1 text-white rounded-lg px-3 py-1.5 text-[12.5px] font-semibold hover:opacity-90 no-print shrink-0"
          >
            🔬 Deep-dive any stock
          </button>
        </div>
      )}

      {restored && holdings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] bg-status-good/8 border border-status-good/30 rounded-xl px-3.5 py-2.5">
          <span className="text-success-text font-medium">
            ✓ Restored {holdings.length} holding{holdings.length === 1 ? "" : "s"} saved on this device
          </span>
          <span className="text-ink-2">- re-import a fresh CSV anytime to replace them.</span>
          <button onClick={onErase} className="text-status-critical hover:underline ml-auto">
            erase saved data
          </button>
        </div>
      )}

      <FadeUp mode="mount">
        <section>
          <SectionTitle sub="Parsed and stored locally. Symbols auto-resolve to Yahoo format - fix any guess inline below.">
            1 · Import holdings
          </SectionTitle>
          <ImportPanel market={market} onFile={onFile} />
          <button onClick={onLoadSample} className="mt-2 text-[12.5px] text-series-1 hover:underline no-print">
            …or load a sample {meta.label} portfolio to see how it works
          </button>
          {warnings.map((w, i) => (
            <p key={i} className="text-[12.5px] text-[#8a6100] mt-2">
              ⚠ {w}
            </p>
          ))}
        </section>
      </FadeUp>

      {holdings.length > 0 && (
        <section>
          <SectionTitle
            sub={`Fix any symbol the auto-guess got wrong (edit the Yahoo symbol, or hit “check”). ${
              market === "india" ? "NSE adds .NS." : "TSX adds .TO; US listings stay plain."
            } Edits save to this device automatically.`}
          >
            2 · Review &amp; edit ({holdings.length} holdings)
          </SectionTitle>
          <Card className="p-4">
            <HoldingsTable holdings={holdings} onChange={onHoldingsChange} defaultBroker={meta.broker} />
          </Card>
        </section>
      )}

      <FadeUp mode="mount" delay={0.05}>
        <section>
          <SectionTitle sub="Optional: paste your own Anthropic API key for Claude-written commentary on top of the deterministic scorecard. The key stays in this tab's memory only - never saved, never logged.">
            {holdings.length > 0 ? "3" : "2"} · AI commentary (optional)
          </SectionTitle>
          <Card className="p-4">
            {!showAi ? (
              <button onClick={() => onShowAi(true)} className="text-[13px] text-series-1 hover:underline">
                + Add an Anthropic API key
              </button>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => onAiKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="bg-page hairline rounded-lg px-2.5 py-1.5 text-[13px] w-[260px]"
                  autoComplete="off"
                />
                <select
                  value={aiModel}
                  onChange={(e) => onAiModel(e.target.value)}
                  className="bg-page hairline rounded-lg px-2 py-1.5 text-[13px]"
                >
                  <option value="claude-sonnet-4-5">Claude Sonnet 4.5 (balanced)</option>
                  <option value="claude-haiku-4-5">Claude Haiku 4.5 (fastest)</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6 (deepest)</option>
                </select>
                {aiKey.startsWith("sk-ant-") && (
                  <Badge tone="good" icon="✓">
                    key set
                  </Badge>
                )}
              </div>
            )}
          </Card>
        </section>
      </FadeUp>

      {fatal && <p className="text-[13px] text-status-critical">{fatal}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <motion.button
          onClick={onAnalyze}
          disabled={holdings.length === 0}
          className="bg-series-1 text-white rounded-xl px-6 py-2.5 text-[14px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed elev-1"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Analyze {meta.label} portfolio →
        </motion.button>
        <span className="text-[12px] text-muted">
          ~5s per stock on free live data · instant on demo data
        </span>
      </div>

      <FadeUp mode="mount" delay={0.05}>
        <MastersCard />
      </FadeUp>
    </div>
  );
}
