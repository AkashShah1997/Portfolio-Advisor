"use client";

import { useMemo } from "react";
import type { AnalyzedHolding, FxRates } from "@/lib/types";
import type { Market } from "@/lib/store";
import { buildPlan } from "@/lib/plan";
import { Card, SectionTitle } from "./ui";

const TONE_CLS: Record<string, string> = {
  critical: "text-status-critical",
  warning: "text-[#8a6100]",
  good: "text-success-text",
  neutral: "text-ink-2",
  muted: "text-muted",
};

/**
 * "Your action plan" - the whole analysis in a few plain sentences.
 * Every line restates a decision the engines already made; the linked tabs
 * carry the full evidence.
 */
export function PlanCard({
  rows,
  market,
  fx,
  onGo,
}: {
  rows: AnalyzedHolding[];
  market: Market;
  fx: FxRates;
  onGo: (tab: "decisions" | "etfs") => void;
}) {
  const plan = useMemo(() => buildPlan(rows, market, fx), [rows, market, fx]);
  if (!plan.items.length) return null;

  return (
    <Card className="p-4 border-l-[3px] border-l-series-1">
      <SectionTitle sub={plan.summary}>Your action plan</SectionTitle>
      <ul className="space-y-2">
        {plan.items.map((it) => (
          <li key={it.id} className="flex gap-2.5 text-[13px] leading-snug">
            <span className={`font-bold shrink-0 w-4 text-center ${TONE_CLS[it.tone]}`} aria-hidden>
              {it.icon}
            </span>
            <span className="text-ink">
              {it.text}
              {it.goTo && (
                <button
                  onClick={() => onGo(it.goTo!)}
                  className="text-series-1 hover:underline ml-1.5 no-print text-[12px]"
                >
                  why →
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted italic mt-3">
        Plain words, same engine - each line is the Decisions / ETFs analysis compressed, not a new opinion.
        Not financial advice.
      </p>
    </Card>
  );
}
