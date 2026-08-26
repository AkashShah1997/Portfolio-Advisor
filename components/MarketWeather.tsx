"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Market } from "@/lib/store";
import type { MacroPayload, MacroTone } from "@/lib/macro";
import type { AnalyzedHolding, FxRates } from "@/lib/types";
import { hedgeShare } from "@/lib/stress";
import { Badge, Card, InfoTip, SectionTitle, Spinner } from "./ui";

/**
 * Market weather - the macro situation as chips + ONE plain-words regime read.
 * Context for posture (how greedy, how much margin of safety), never a timing
 * signal - and the card says so.
 */

const DOT: Record<MacroTone, string> = {
  good: "bg-status-good",
  neutral: "bg-grid",
  warning: "bg-status-warning",
  serious: "bg-status-serious",
};

const REGIME_TONE: Record<MacroTone, "good" | "neutral" | "warning" | "serious"> = {
  good: "good",
  neutral: "neutral",
  warning: "warning",
  serious: "serious",
};

export function MarketWeather({
  market,
  rows,
  fx,
}: {
  market: Market;
  rows?: AnalyzedHolding[];
  fx?: FxRates;
}) {
  const [state, setState] = useState<Record<string, MacroPayload | "loading" | "error">>({});
  const inFlight = useRef<Set<string>>(new Set());

  // the hedge sleeve - independent of the macro fetch, computed from holdings
  const hedge = useMemo(() => (rows && fx ? hedgeShare(rows, fx) : null), [rows, fx]);
  const hedgeRead = useMemo(() => {
    if (!hedge) return null;
    const p = hedge.share;
    if (p === 0)
      return {
        tone: "neutral" as MacroTone,
        text: "you hold no gold/silver funds. That's a valid choice - it's optional insurance, not a must.",
      };
    if (p < 0.05)
      return {
        tone: "good" as MacroTone,
        text: `a light ${(p * 100).toFixed(1)}% slice (${hedge.symbols.join(", ")}) - below the classic 5-10% band, which is fine.`,
      };
    if (p <= 0.1)
      return {
        tone: "good" as MacroTone,
        text: `${(p * 100).toFixed(1)}% (${hedge.symbols.join(", ")}) - inside the classic 5-10% insurance band.`,
      };
    if (p <= 0.15)
      return {
        tone: "warning" as MacroTone,
        text: `${(p * 100).toFixed(1)}% (${hedge.symbols.join(", ")}) - a bit above the classic 5-10% band. Let new money, not selling, bring it back.`,
      };
    return {
      tone: "warning" as MacroTone,
      text: `${(p * 100).toFixed(1)}% (${hedge.symbols.join(", ")}) - well above the 5-10% cap. Remember 1980: gold fell 65% and took 28 years to recover. Insurance, not an engine.`,
    };
  }, [hedge]);

  useEffect(() => {
    if (state[market] !== undefined || inFlight.current.has(market)) return;
    inFlight.current.add(market);
    void (async () => {
      await Promise.resolve();
      setState((prev) => (prev[market] === undefined ? { ...prev, [market]: "loading" } : prev));
      try {
        const res = await fetch(`/api/macro/${market}`);
        const j = (await res.json()) as MacroPayload & { error?: string };
        setState((prev) => ({ ...prev, [market]: res.ok && !j.error && j.items ? j : "error" }));
      } catch {
        setState((prev) => ({ ...prev, [market]: "error" }));
      } finally {
        inFlight.current.delete(market);
      }
    })();
  }, [market, state]);

  const m = state[market];

  return (
    <Card className="p-4">
      <SectionTitle sub="Free public data, refreshed ~30 min - context for posture, never a timing signal.">
        Market weather
      </SectionTitle>
      {(m === undefined || m === "loading") && (
        <p className="text-[13px] text-ink-2">
          <Spinner /> Reading the market&hellip;
        </p>
      )}
      {m === "error" && (
        <p className="text-[12.5px] text-muted">
          Couldn&apos;t fetch macro data right now (often Yahoo throttling) - the analysis tabs work fine without
          it; check back in a minute.
        </p>
      )}
      {m !== undefined && typeof m !== "string" && (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {m.items.map((it) => (
              <div key={it.key} className="min-w-[128px]">
                <div className="text-[11px] text-muted flex items-center gap-1.5">
                  <span className={`inline-block w-[7px] h-[7px] rounded-full ${DOT[it.tone]}`} aria-hidden />
                  {it.label}
                </div>
                <div className="text-[15px] font-semibold text-ink tnum leading-tight">{it.value}</div>
                <div className="text-[10.5px] text-muted leading-tight mt-0.5 max-w-[180px]">{it.sub}</div>
              </div>
            ))}
            {m.mock && <Badge tone="muted">demo data</Badge>}
          </div>
          <div className="mt-3 bg-page hairline rounded-xl px-3 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Badge tone={REGIME_TONE[m.regime.tone]}>{m.regime.headline}</Badge>
            </div>
            <p className="text-[12.5px] text-ink-2 mt-1.5 leading-snug">{m.regime.advice}</p>
            <p className="text-[10.5px] text-muted italic mt-1">
              Macro is context, not a signal - your buy-below prices already encode the discipline.
            </p>
          </div>
        </>
      )}
      {hedgeRead && (
        <p className="text-[12px] text-ink-2 mt-3 leading-snug">
          <span className={`inline-block w-[7px] h-[7px] rounded-full mr-1.5 ${DOT[hedgeRead.tone]}`} aria-hidden />
          <strong className="text-ink">Your hedge sleeve</strong> <InfoTip k="hedge" />: {hedgeRead.text}
        </p>
      )}
    </Card>
  );
}
