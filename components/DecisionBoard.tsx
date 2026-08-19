"use client";

import { useMemo, useState } from "react";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import { ACTION_META, decideAll, type Action } from "@/lib/decisions";
import { toBase, VERDICT_META } from "@/lib/portfolio";
import { fmtMoney, fmtPct } from "@/lib/symbols";
import { buildPrompt } from "@/lib/promptgen";
import { Badge, Card, SectionTitle } from "./ui";
import { Stagger, StaggerItem } from "./anim";

/**
 * The decision board — the straight answer to "I've held this for years and
 * it's done nothing": every holding sorted into Exit / Trim / Accumulate /
 * Hold with the full evidence trail, and the capital involved in each pile.
 */
export function DecisionBoard({
  rows,
  fx,
  base,
}: {
  rows: AnalyzedHolding[];
  fx: FxRates;
  base: Currency;
}) {
  const groups = useMemo(() => decideAll(rows), [rows]);
  const [copied, setCopied] = useState<string | null>(null);

  const valueOf = (r: AnalyzedHolding) => toBase(r.currentValue ?? r.invested, r.holding.currency, fx);
  const totalValue = rows.filter((r) => !r.holding.watch).reduce((a, r) => a + valueOf(r), 0) || 1;
  const pileValue = (a: Action) => groups.byAction[a].reduce((s, r) => s + valueOf(r), 0);

  const exitVal = pileValue("EXIT");
  const trimVal = pileValue("TRIM");
  const accVal = pileValue("ACCUMULATE");
  const deadCount = [...groups.decisions.values()].filter((d) => d.deadMoney).length;

  const copyDecisionPrompt = async (r: AnalyzedHolding) => {
    const cur = (r.data?.quote.currency ?? r.holding.currency) as Currency;
    try {
      await navigator.clipboard.writeText(
        buildPrompt([r], { focus: "action", includeHistory: true, baseCurrency: cur })
      );
      setCopied(r.holding.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      {/* summary strip */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="px-4 py-3">
          <div className="text-[12px] text-ink-2">Capital in exit / trim candidates</div>
          <div className="text-[22px] font-semibold tnum text-status-critical leading-tight">
            {fmtMoney(exitVal + trimVal, base, true)}
          </div>
          <div className="text-[11.5px] text-muted">
            {fmtPct((exitVal + trimVal) / totalValue, 0)} of the portfolio ·{" "}
            {groups.byAction.EXIT.length + groups.byAction.TRIM.length} holding(s)
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[12px] text-ink-2">Dead-money positions detected</div>
          <div className="text-[22px] font-semibold tnum leading-tight">{deadCount}</div>
          <div className="text-[11.5px] text-muted">flat price AND flat business for years</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[12px] text-ink-2">Already in your best ideas</div>
          <div className="text-[22px] font-semibold tnum text-success-text leading-tight">
            {fmtMoney(accVal, base, true)}
          </div>
          <div className="text-[11.5px] text-muted">
            worth accumulating — recycle exits here or via the screeners
          </div>
        </Card>
      </div>

      {groups.order
        .filter((a) => groups.byAction[a].length > 0)
        .map((a) => {
          const meta = ACTION_META[a];
          const items = groups.byAction[a];
          return (
            <Card key={a} className="p-4">
              <SectionTitle sub={meta.sub}>
                <span className="inline-flex items-center gap-2">
                  <Badge tone={meta.tone} icon={meta.icon}>
                    {meta.label}
                  </Badge>
                  <span className="text-[13px] text-ink-2 font-normal">
                    {items.length} holding{items.length === 1 ? "" : "s"} ·{" "}
                    {fmtMoney(pileValue(a), base, true)} ({fmtPct(pileValue(a) / totalValue, 0)})
                  </span>
                </span>
              </SectionTitle>

              <Stagger mode="mount">
                <div className="space-y-2.5">
                  {items.map((r) => {
                    const d = groups.decisions.get(r.holding.id)!;
                    const sc = r.scorecard;
                    const vm = sc ? VERDICT_META[sc.verdict] : undefined;
                    return (
                      <StaggerItem key={r.holding.id}>
                        <div className="rounded-xl bg-page hairline p-3.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <div className="min-w-[160px]">
                              <span className="font-semibold text-[14px]">{r.holding.yahooSymbol}</span>
                              <span className="text-[12px] text-ink-2 ml-2">
                                {r.data?.quote.name ?? r.holding.name ?? ""}
                              </span>
                            </div>
                            <span className="text-[12px] text-ink-2 tnum">
                              {fmtMoney(valueOf(r), base, true)} · {fmtPct(valueOf(r) / totalValue, 1)} of
                              portfolio
                            </span>
                            {r.pnlPct !== undefined && (
                              <span
                                className={`text-[12px] font-semibold tnum ${
                                  (r.pnl ?? 0) >= 0 ? "text-success-text" : "text-status-critical"
                                }`}
                              >
                                {(r.pnl ?? 0) >= 0 ? "+" : ""}
                                {fmtPct(r.pnlPct)}
                              </span>
                            )}
                            {d.deadMoney && (
                              <Badge tone="critical" icon="🪦">
                                dead money
                              </Badge>
                            )}
                            <span className="ml-auto flex items-center gap-2">
                              {sc && (
                                <span className="text-[15px] font-semibold tnum" title="Scorecard">
                                  {sc.totalScore}
                                </span>
                              )}
                              {vm && (
                                <Badge tone={vm.tone} icon={vm.icon}>
                                  {vm.label}
                                </Badge>
                              )}
                            </span>
                          </div>

                          <p className="text-[13px] text-ink mt-2">{d.headline}</p>

                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {d.reasons.map((reason, i) => (
                              <span
                                key={i}
                                className="text-[11px] text-ink-2 bg-surface hairline rounded-full px-2 py-[2.5px]"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>

                          <button
                            onClick={() => void copyDecisionPrompt(r)}
                            className="text-[12px] text-series-1 hover:underline mt-2 no-print"
                            title="Copies a buy/hold/sell decision prompt with all the data — paste into any AI for a second opinion"
                          >
                            {copied === r.holding.id
                              ? "✓ copied — paste into any AI"
                              : "⚖ Second opinion: copy decision prompt"}
                          </button>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </div>
              </Stagger>

              {a === "EXIT" && items.length > 0 && (
                <p className="text-[12px] text-ink-2 mt-3 italic">
                  Selling is half a decision. The other half — where the money goes — lives in the{" "}
                  <strong>upgrade candidates below</strong> and the <strong>Screeners</strong> tab. Mind
                  taxes and friction; a great business having a bad year is a buy, not a sell.
                </p>
              )}
            </Card>
          );
        })}

      <p className="text-[11.5px] text-muted italic">
        Decisions are mechanical readings of public numbers on a 5-year horizon — a disciplined starting
        point, not advice. You know your taxes, cash needs and conviction; the board doesn&apos;t.
      </p>
    </div>
  );
}
