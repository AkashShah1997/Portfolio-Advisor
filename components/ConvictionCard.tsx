"use client";

import { useMemo } from "react";
import type { AnalyzedHolding, Scorecard, StockData } from "@/lib/types";
import type { Valuation } from "@/lib/valuation";
import { convictionOf, GRADE_META } from "@/lib/conviction";
import { Badge, Card, InfoTip, Meter, SectionTitle } from "./ui";

/**
 * Conviction vs speculation - the question that decides POSITION SIZE. It does
 * not ask "is this a good stock"; it asks how much of the case is already
 * proven versus assumed, and it names the assumptions out loud.
 */
export function ConvictionCard({
  data,
  scorecard,
  valuation,
  compact = false,
}: {
  data: StockData;
  scorecard: Scorecard;
  valuation?: Valuation;
  compact?: boolean;
}) {
  const c = useMemo(() => convictionOf({ data, scorecard, valuation }), [data, scorecard, valuation]);
  const meta = GRADE_META[c.grade];

  if (compact) {
    return (
      <div className="bg-page hairline rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
        <span className="text-muted text-[11.5px] uppercase tracking-wide">
          Conviction test <InfoTip k="conviction" />
        </span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-ink-2 tnum">{c.score}/100</span>
        <span className="text-ink-2 leading-snug">{c.headline}</span>
      </div>
    );
  }

  return (
    <Card className="p-4">
      <SectionTitle sub="Not 'is this a good stock' - how much of the case is already PROVEN versus assumed. A speculation can work out; the damage comes from owning one while believing it is a conviction, and sizing it that way.">
        Conviction or speculation? <InfoTip k="conviction" />
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[24px] font-semibold tnum leading-none">{c.score}</span>
          <span className="text-[11px] text-muted">/100 known</span>
        </div>
        <span className="text-[12.5px] text-ink leading-snug flex-1 min-w-[240px]">{c.headline}</span>
      </div>
      <p className="text-[11.5px] text-muted mt-1 leading-snug">{meta.blurb}</p>

      {/* the four pillars */}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-3.5">
        {c.pillars.map((p) => (
          <div key={p.key}>
            <div className="flex justify-between text-[12px] mb-1 gap-2">
              <span className="text-ink-2">{p.label}</span>
              <span className="font-medium tnum">{p.score}</span>
            </div>
            <Meter value={p.score} />
            <ul className="mt-1 space-y-0.5">
              {p.notes.slice(0, 2).map((n, i) => (
                <li key={`n${i}`} className="text-[11.5px] text-ink-2 leading-snug flex gap-1.5">
                  <span className="text-success-text shrink-0" aria-hidden>
                    +
                  </span>
                  <span>{n}</span>
                </li>
              ))}
              {p.gaps.slice(0, 2).map((g, i) => (
                <li key={`g${i}`} className="text-[11.5px] text-muted leading-snug flex gap-1.5">
                  <span className="text-status-critical shrink-0" aria-hidden>
                    −
                  </span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* the assumptions, named */}
      {c.assumptions.length > 0 && (
        <div className="mt-3 bg-page hairline rounded-xl px-3 py-2.5">
          <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">
            What has to be TRUE for this to work
          </div>
          <ul className="mt-1 space-y-0.5">
            {c.assumptions.map((a, i) => (
              <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                <span className="text-[#8a6100] shrink-0" aria-hidden>
                  ?
                </span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted italic mt-1.5">
            Every one of these is a forecast, not a fact. The more of them the case needs, the more this is a bet -
            however good the business sounds.
          </p>
        </div>
      )}

      {/* how to size it, and what would upgrade it */}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-3">
        <div>
          <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-0.5">
            What size this justifies
          </div>
          <p className="text-[12.5px] text-ink-2 leading-snug">{c.sizing}</p>
        </div>
        {c.toConviction.length > 0 && (
          <div>
            <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-0.5">
              What would make it a conviction
            </div>
            <ul className="space-y-0.5">
              {c.toConviction.map((t, i) => (
                <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                  <span className="text-series-1 shrink-0" aria-hidden>
                    ▸
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted italic mt-3 leading-relaxed">
        Honest limits: this grades the EVIDENCE, not the outcome. Plenty of speculations make money and plenty of
        conviction holdings disappoint - the point is that you can only size a position correctly if you know which
        one you are holding. The judgment the numbers cannot make is still yours: run the pre-buy gates prompt on
        the card below before any buy order.
      </p>
    </Card>
  );
}
