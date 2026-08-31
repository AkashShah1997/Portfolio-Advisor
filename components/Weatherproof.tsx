"use client";

import { useMemo } from "react";
import type { AnalyzedHolding, FxRates } from "@/lib/types";
import { portfolioResilience, type AiExposure } from "@/lib/resilience";
import { fmtPct } from "@/lib/symbols";
import { Badge, Card, InfoTip, Meter, SectionTitle } from "./ui";

/**
 * Weatherproofing - "would this portfolio survive an AI shock AND a recession
 * without forcing me to sell at the bottom?" Two honest halves: a measurable
 * balance-sheet score, and an explicitly-labelled hypothesis about AI exposure
 * with the counter-argument printed next to it.
 */

const AI_UI: Record<AiExposure, { label: string; tone: "good" | "neutral" | "warning" | "serious" | "muted"; cls: string }> = {
  high: { label: "high AI exposure", tone: "serious", cls: "text-status-critical" },
  medium: { label: "some AI exposure", tone: "warning", cls: "text-[#8a6100]" },
  low: { label: "low AI exposure", tone: "good", cls: "text-success-text" },
  beneficiary: { label: "AI beneficiary", tone: "neutral", cls: "text-series-1" },
  unknown: { label: "unknown", tone: "muted", cls: "text-muted" },
};

const GRADE_UI: Record<string, { label: string; tone: "good" | "neutral" | "warning" | "serious" | "muted" }> = {
  fortress: { label: "fortress", tone: "good" },
  solid: { label: "solid", tone: "neutral" },
  fragile: { label: "fragile", tone: "serious" },
  unknown: { label: "no data", tone: "muted" },
};

export function Weatherproof({ rows, fx }: { rows: AnalyzedHolding[]; fx: FxRates }) {
  const res = useMemo(() => portfolioResilience(rows, fx), [rows, fx]);

  return (
    <Card className="p-4">
      <SectionTitle sub="Two different questions, deliberately kept apart: can these businesses fund themselves through a bad year (measurable from the filings), and how exposed is each business MODEL to AI disruption (a hypothesis, with the counter-argument attached).">
        Weatherproof - recession & AI resilience <InfoTip k="weatherproof" />
      </SectionTitle>

      {res.score === undefined ? (
        <p className="text-[12.5px] text-ink-2">Not enough scored holdings yet to grade resilience.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div>
              <div className="text-[11px] text-muted">Recession resilience</div>
              <div className="text-[26px] font-semibold tnum leading-none">
                {res.score}
                <span className="text-[12px] font-normal text-muted">/100</span>
              </div>
            </div>
            <div className="min-w-[180px] flex-1 max-w-[280px]">
              <Meter value={res.score} />
              <div className="text-[10.5px] text-muted mt-0.5">value-weighted across your scored holdings</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={res.aiHighShare >= 0.4 ? "serious" : res.aiHighShare >= 0.2 ? "warning" : "good"}>
                {fmtPct(res.aiHighShare, 0)} in high AI-exposure models
              </Badge>
              <Badge tone={res.fragileShare >= 0.25 ? "serious" : res.fragileShare >= 0.1 ? "warning" : "good"}>
                {fmtPct(res.fragileShare, 0)} fragile balance sheets
              </Badge>
            </div>
          </div>

          <p className="text-[13px] text-ink mt-2.5 leading-snug">{res.headline}</p>

          {res.fixFirst.length > 0 && (
            <div className="mt-2.5 bg-page hairline rounded-xl px-3 py-2">
              <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">Fix these first</div>
              <ul className="mt-1 space-y-0.5">
                {res.fixFirst.map((f) => (
                  <li key={f.symbol} className="text-[12.5px] text-ink-2">
                    <strong className="text-ink">{f.symbol.replace(/\.(NS|BO|TO|V|NE)$/i, "")}</strong> - {f.why}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* per-holding table */}
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-muted border-b border-grid uppercase tracking-wide">
                  <th className="py-1.5 pr-3 font-medium">Holding</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Weight</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Survives a bad year?</th>
                  <th className="py-1.5 font-medium">AI disruption hypothesis</th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((h) => {
                  const g = GRADE_UI[h.grade];
                  const a = AI_UI[h.ai.exposure];
                  return (
                    <tr key={h.symbol} className="border-b border-grid/50 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-semibold">{h.symbol.replace(/\.(NS|BO|TO|V|NE)$/i, "")}</div>
                        {h.recessionNotes[0] && (
                          <div className="text-[11px] text-muted leading-snug max-w-[220px]">{h.recessionNotes[0]}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tnum text-ink-2">{fmtPct(h.weight, 1)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        <Badge tone={g.tone}>{g.label}</Badge>
                        {h.recession !== undefined && (
                          <span className="text-muted tnum text-[11px] ml-1.5">{h.recession}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <span className={`text-[11.5px] font-medium ${a.cls}`}>{a.label}</span>
                        <div className="text-[11.5px] text-ink-2 leading-snug">{h.ai.thesis}</div>
                        <div className="text-[11px] text-muted leading-snug italic">But: {h.ai.counter}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-[11px] text-muted italic mt-3 leading-relaxed">
        Honest limits: the resilience score is arithmetic on filings and is genuinely predictive of who gets forced
        into dilution - the AI column is NOT. It is a starting hypothesis about business models, printed with its
        counter-argument so you argue with it rather than obey it. Two things worth holding onto: the last three
        crashes were not caused by the thing everyone was watching, and &ldquo;this industry is doomed&rdquo; has
        been wrong about retail, banks and IT services at least twice each. Use this to size positions, never to
        dump a business you understand.
      </p>
    </Card>
  );
}
