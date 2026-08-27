"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Market } from "@/lib/store";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import type { GoldPayload, GoldState } from "@/lib/gold";
import { GOLD_CONTEXT, GOLD_CONTEXT_ASOF, GOLD_HOWTO, readGold } from "@/lib/gold";
import { hedgeShare } from "@/lib/stress";
import { fmtMoney, fmtPct } from "@/lib/symbols";
import { Badge, Card, InfoTip, SectionTitle, Spinner } from "./ui";

/**
 * The gold desk - one screen that answers "is this a sensible moment to add
 * to the gold sleeve, and how do I actually buy it here?" Macro drivers on
 * the left, your own sleeve on the right, and the practical India/Canada
 * mechanics below. Insurance framing throughout: the answer is never "all in".
 */

const STATE_UI: Record<GoldState, { dot: string; label: string; cls: string }> = {
  tailwind: { dot: "bg-status-good", label: "helping gold", cls: "text-success-text" },
  headwind: { dot: "bg-status-serious", label: "against gold", cls: "text-status-critical" },
  neutral: { dot: "bg-grid", label: "neutral", cls: "text-ink-2" },
  unknown: { dot: "bg-grid", label: "unknown", cls: "text-muted" },
};

const READ_TONE: Record<string, "good" | "neutral" | "warning" | "serious"> = {
  good: "good",
  neutral: "neutral",
  warning: "warning",
  serious: "serious",
};

export function GoldPanel({
  market,
  rows,
  fx,
  base,
}: {
  market: Market;
  rows: AnalyzedHolding[];
  fx: FxRates;
  base: Currency;
}) {
  const [state, setState] = useState<Record<string, GoldPayload | "loading" | "error">>({});
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  const load = (fresh = false) => {
    if (inFlight.current.has(market)) return;
    inFlight.current.add(market);
    void (async () => {
      await Promise.resolve();
      setState((p) => (p[market] === undefined ? { ...p, [market]: "loading" } : p));
      try {
        const res = await fetch(`/api/gold/${market}${fresh ? "?fresh=1" : ""}`);
        const j = (await res.json()) as GoldPayload & { error?: string };
        setState((p) => ({ ...p, [market]: res.ok && !j.error && j.items ? j : "error" }));
        if (fresh) setRefreshedAt(new Date().toLocaleTimeString());
      } catch {
        setState((p) => ({ ...p, [market]: "error" }));
      } finally {
        inFlight.current.delete(market);
      }
    })();
  };

  useEffect(() => {
    if (state[market] !== undefined || inFlight.current.has(market)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, state]);

  const sleeve = useMemo(() => hedgeShare(rows, fx), [rows, fx]);
  const g = state[market];
  const payload = typeof g === "object" ? g : undefined;

  // the sleeve can override the macro read: a full hedge is a full hedge
  const finalRead = useMemo(() => {
    if (!payload) return undefined;
    return readGold(payload.items, payload.channel?.position, sleeve?.share).read;
  }, [payload, sleeve]);

  const howto = GOLD_HOWTO[market];
  const sleeveValue = sleeve ? sleeve.share * sleeve.total : 0;
  const bandLow = sleeve ? sleeve.total * 0.05 : 0;
  const bandHigh = sleeve ? sleeve.total * 0.1 : 0;
  const gap = sleeve ? bandLow - sleeveValue : 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle sub="Gold has no earnings, so none of the stock machinery applies. What moves it is a short list of macro forces - real interest rates, the dollar, its own trend, your currency - all readable from free public data. Context for pacing an insurance sleeve, never a trading signal.">
            The gold desk - is this a sensible time to add? <InfoTip k="goldDesk" />
          </SectionTitle>
          <button
            onClick={() => load(true)}
            className="bg-surface hairline rounded-lg px-3 py-1.5 text-[12.5px] font-medium hover:bg-page no-print shrink-0"
          >
            ↻ Refresh
          </button>
        </div>
        {refreshedAt && <p className="text-[11px] text-muted">refreshed {refreshedAt}</p>}

        {(g === undefined || g === "loading") && (
          <p className="text-[13px] text-ink-2 mt-2">
            <Spinner /> Reading real yields, the dollar and the metal&hellip;
          </p>
        )}
        {g === "error" && (
          <p className="text-[12.5px] text-muted mt-2">
            Couldn&apos;t fetch the gold data right now (usually Yahoo throttling). Try Refresh in a minute - the
            rest of the app works fine without it.
          </p>
        )}

        {payload && finalRead && (
          <>
            {/* price header */}
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-1 tnum">
              {payload.priceUsd !== undefined && (
                <span className="text-[13px] text-ink-2">
                  Gold <strong className="text-[19px] text-ink">${Math.round(payload.priceUsd).toLocaleString()}</strong>
                  <span className="text-muted text-[11.5px]">/oz</span>
                </span>
              )}
              {payload.local && (
                <span className="text-[13px] text-ink-2">
                  {payload.local.label}{" "}
                  <strong className="text-[16px] text-ink">{payload.local.value}</strong>
                  {payload.local.ret1y !== undefined && (
                    <span className={payload.local.ret1y >= 0 ? "text-success-text" : "text-status-critical"}>
                      {" "}
                      {payload.local.ret1y >= 0 ? "+" : ""}
                      {fmtPct(payload.local.ret1y)} 1y
                    </span>
                  )}
                </span>
              )}
              {payload.channel?.cagr !== undefined && (
                <span className="text-[11.5px] text-muted">
                  5-yr trend {payload.channel.cagr >= 0 ? "+" : ""}
                  {fmtPct(payload.channel.cagr)}/yr
                </span>
              )}
              {payload.mock && <Badge tone="muted">demo data</Badge>}
            </div>

            {/* the verdict */}
            <div className="mt-3 bg-page hairline rounded-xl px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={READ_TONE[finalRead.tone]}>{finalRead.headline}</Badge>
                <span className="text-[11.5px] text-muted tnum">
                  {payload.tally.tailwinds} helping · {payload.tally.headwinds} against ·{" "}
                  {payload.tally.scored - payload.tally.tailwinds - payload.tally.headwinds} neutral
                </span>
              </div>
              <p className="text-[12.5px] text-ink-2 mt-1.5 leading-snug">{finalRead.advice}</p>
              <p className="text-[10.5px] text-muted italic mt-1">
                Gold is insurance, not an engine: the masters cap it near 5-10%. It pays no dividend, compounds
                nothing, and in 1980 fell 65% and took 28 years to recover.
              </p>
            </div>

            {/* the signals */}
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-3.5">
              {payload.items.map((it) => {
                const ui = STATE_UI[it.state];
                return (
                  <div key={it.key} className="flex gap-2">
                    <span className={`inline-block w-[7px] h-[7px] rounded-full mt-1.5 shrink-0 ${ui.dot}`} aria-hidden />
                    <div className="min-w-0">
                      <div className="text-[12.5px]">
                        <span className="text-ink-2">{it.label}</span>{" "}
                        <strong className="text-ink tnum">{it.value}</strong>{" "}
                        {it.scored && <span className={`text-[10.5px] ${ui.cls}`}>· {ui.label}</span>}
                      </div>
                      <div className="text-[11px] text-muted leading-snug">{it.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {payload.errors?.length ? (
              <p className="text-[11px] text-muted mt-3">Data notes: {payload.errors.join(" · ")}</p>
            ) : null}
          </>
        )}
      </Card>

      {/* your sleeve */}
      <Card className="p-4">
        <SectionTitle sub="The only number that decides how much gold you should buy next: how much you already own.">
          Your gold sleeve <InfoTip k="hedge" />
        </SectionTitle>
        {!sleeve ? (
          <p className="text-[12.5px] text-ink-2">Analyze a portfolio and this fills in.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 tnum text-[13px]">
              <span className="text-ink-2">
                Held{" "}
                <strong className="text-[18px] text-ink">{fmtPct(sleeve.share, 1)}</strong>
                {sleeve.symbols.length > 0 && (
                  <span className="text-muted text-[11.5px]"> ({sleeve.symbols.join(", ")})</span>
                )}
              </span>
              <span className="text-muted">
                target band {fmtMoney(bandLow, base, true)} - {fmtMoney(bandHigh, base, true)} (5-10%)
              </span>
            </div>
            {/* band meter */}
            <div className="relative h-2.5 rounded-full bg-page hairline mt-2.5 overflow-hidden">
              {/* the 5-10% target band on a 0-20% scale */}
              <div className="absolute inset-y-0 bg-status-good/25" style={{ left: "25%", right: "50%" }} />
              <div
                className="absolute inset-y-0 left-0 bg-series-1"
                style={{ width: `${Math.min(100, (sleeve.share / 0.2) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted mt-0.5 tnum">
              <span>0%</span>
              <span>5%</span>
              <span>10%</span>
              <span>15%</span>
              <span>20%+</span>
            </div>
            <p className="text-[12.5px] text-ink-2 mt-2 leading-snug">
              {sleeve.share < 0.05 ? (
                <>
                  You are <strong className="text-ink">under</strong> the insurance band. Filling the gap needs about{" "}
                  <strong className="text-ink">{fmtMoney(gap, base, true)}</strong> - which is exactly the kind of
                  thing to do in 2-3 monthly tranches rather than one buy, whatever the signals above say.
                </>
              ) : sleeve.share <= 0.1 ? (
                <>
                  You are <strong className="text-success-text">inside</strong> the classic 5-10% band. The job is
                  done: keep contributing to the compounders and let the sleeve ride.
                </>
              ) : (
                <>
                  You are <strong className="text-status-critical">above</strong> the 10% cap. More gold here buys
                  concentration, not protection - direct new money elsewhere and let the sleeve drift back inside the
                  band rather than selling into a rally.
                </>
              )}
            </p>
          </>
        )}
      </Card>

      {/* practical mechanics for this market */}
      <Card className="p-4">
        <SectionTitle sub="Fees, vehicles and tax traps differ enormously by route - this is where most of a gold investor's return is quietly won or lost.">
          {howto.title}
        </SectionTitle>
        <ul className="space-y-1.5">
          {howto.lines.map((l, i) => (
            <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-2">
              <span className="text-series-1 shrink-0" aria-hidden>
                ▸
              </span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-ink mt-2.5 bg-page hairline rounded-xl px-3 py-2 leading-snug">{howto.caution}</p>
      </Card>

      {/* the slow structural story */}
      <Card className="p-4">
        <SectionTitle sub={`Slow-moving facts that shape the multi-year backdrop, dated so you can tell context from news. As of ${GOLD_CONTEXT_ASOF}.`}>
          What governments are doing
        </SectionTitle>
        <div className="space-y-2.5">
          {GOLD_CONTEXT.map((f) => (
            <div key={f.label}>
              <div className="text-[12.5px] font-semibold text-ink">{f.label}</div>
              <p className="text-[12.5px] text-ink-2 leading-snug">{f.text}</p>
              <p className="text-[10.5px] text-muted italic">{f.source}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted italic mt-3 leading-relaxed">
          Honest limits: these are structural facts with a date on them, not a live feed - central-bank data is
          published with a lag of weeks to months. They explain the backdrop; they never time a purchase. If a video
          or a newsletter tells you central-bank buying means gold must rise this quarter, that is a sales pitch, not
          an argument.
        </p>
      </Card>
    </div>
  );
}
