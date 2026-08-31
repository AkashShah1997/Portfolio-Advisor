"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import type { MetricRow } from "@/lib/screens";
import type { MacroPayload } from "@/lib/macro";
import { loadCash, MARKET_META, saveCash, type Market } from "@/lib/store";
import { fundingCandidates, opportunitySet, readPosture } from "@/lib/posture";
import { toBase } from "@/lib/portfolio";
import { fmtMoney, fmtPct } from "@/lib/symbols";
import { Badge, Card, InfoTip, SectionTitle } from "./ui";

/**
 * Posture - the card that is allowed to say "don't buy anything right now".
 * It never forecasts a crash; it measures the opportunity set and lets cash be
 * the residual of price discipline, the way the masters actually used it.
 */
export function PostureCard({
  rows,
  universe,
  market,
  fx,
  base,
  onGo,
}: {
  rows: AnalyzedHolding[];
  universe: MetricRow[];
  market: Market;
  fx: FxRates;
  base: Currency;
  onGo?: (tab: string, sub?: string) => void;
}) {
  const [regime, setRegime] = useState<MacroPayload["regime"] | undefined>(undefined);
  const inFlight = useRef(false);
  useEffect(() => {
    if (regime !== undefined || inFlight.current) return;
    inFlight.current = true;
    void (async () => {
      await Promise.resolve();
      try {
        const res = await fetch(`/api/macro/${market}`);
        const j = (await res.json()) as MacroPayload;
        setRegime(j?.regime);
      } catch {
        /* posture still works without the weather */
      } finally {
        inFlight.current = false;
      }
    })();
  }, [market, regime]);

  // user-entered idle cash (per market, this device only) - lets the band talk
  // about YOUR actual cash instead of a percentage of money it cannot see
  const [cash, setCashState] = useState<number | null>(null);
  const cashMarket = useRef<Market | null>(null);
  useEffect(() => {
    if (cashMarket.current === market) return;
    cashMarket.current = market;
    void (async () => {
      await Promise.resolve();
      setCashState(loadCash(market));
    })();
  }, [market]);
  const setCash = (v: number | null) => {
    setCashState(v);
    saveCash(market, v);
  };

  const opp = useMemo(() => opportunitySet(rows, universe, fx), [rows, universe, fx]);
  const read = useMemo(
    () => readPosture(opp, regime?.key, MARKET_META[market].benchmark.label),
    [opp, regime, market]
  );
  const funders = useMemo(() => fundingCandidates(rows, fx), [rows, fx]);

  const invested = useMemo(
    () =>
      rows
        .filter((r) => !r.holding.watch)
        .reduce((a, r) => a + toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx), 0),
    [rows, fx]
  );
  // the cash band expressed against the CURRENT book, so the number is concrete
  const targetLow = (invested * read.cashLow) / (1 - read.cashLow);
  const targetHigh = (invested * read.cashHigh) / (1 - read.cashHigh);

  return (
    <Card className="p-4">
      <SectionTitle sub="The one screen allowed to tell you NOT to buy. It is not a crash forecast - nobody times markets. It measures how much is actually cheap right now, and lets cash be what is left when your own rules say no.">
        Posture - buy, wait, or raise cash? <InfoTip k="posture" />
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={read.tone}>{read.headline}</Badge>
        <span className="text-[12px] text-muted tnum">
          target cash {fmtPct(read.cashLow, 0)}-{fmtPct(read.cashHigh, 0)} of the portfolio
        </span>
      </div>

      {/* your ACTUAL cash vs the band - optional, stored on this device only */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
        <label htmlFor="posture-cash" className="text-ink-2">
          Idle cash you hold ({base}) <InfoTip k="idleCash" />
        </label>
        <input
          id="posture-cash"
          type="number"
          min={0}
          inputMode="numeric"
          value={cash ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            const v = raw === "" ? null : Number(raw);
            setCash(v === null || !Number.isFinite(v) || v < 0 ? null : v);
          }}
          placeholder="optional"
          className="bg-surface hairline rounded-lg px-2.5 py-1 text-[12.5px] w-[130px] tnum"
        />
        {cash !== null &&
          invested + cash > 0 &&
          (() => {
            const share = cash / (invested + cash);
            const inBand = share >= read.cashLow && share <= read.cashHigh;
            const below = share < read.cashLow;
            return (
              <span className={`tnum ${inBand ? "text-success-text" : "text-[#8a6100]"}`}>
                = {fmtPct(share, 1)} of your investable money -{" "}
                {inBand
                  ? "inside the suggested band"
                  : below
                    ? "below the band: build the buffer before chasing new buys"
                    : "above the band: you have dry powder ready for the deploy triggers below"}
              </span>
            );
          })()}
      </div>

      <ul className="mt-2.5 space-y-1">
        {read.why.map((w, i) => (
          <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
            <span className="text-muted shrink-0" aria-hidden>
              ·
            </span>
            <span>{w}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-3">
        <div className="bg-page hairline rounded-xl px-3 py-2.5">
          <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">New money goes here</div>
          <p className="text-[12.5px] text-ink-2 mt-1 leading-snug">{read.newMoney}</p>
          {invested > 0 && (
            <p className="text-[11.5px] text-muted mt-1.5 tnum">
              On today&apos;s {fmtMoney(invested, base, true)} book that band is about{" "}
              <strong className="text-ink-2">
                {fmtMoney(targetLow, base, true)} - {fmtMoney(targetHigh, base, true)}
              </strong>{" "}
              held in cash or liquid funds.
            </p>
          )}
        </div>
        <div className="bg-page hairline rounded-xl px-3 py-2.5">
          <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">
            What would put the cash back to work
          </div>
          <ul className="mt-1 space-y-1">
            {read.deployTriggers.map((t, i) => (
              <li key={i} className="text-[12px] text-ink-2 leading-snug flex gap-1.5">
                <span className="text-series-1 shrink-0" aria-hidden>
                  ▸
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(read.stance === "PATIENT" || read.stance === "DEFENSIVE") && funders.length > 0 && (
        <div className="mt-3">
          <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1">
            If you raise cash, it comes from here first
          </div>
          <ul className="space-y-1">
            {funders.map((f) => (
              <li key={f.symbol} className="text-[12.5px] text-ink-2 leading-snug flex flex-wrap gap-x-2">
                <strong className="text-ink">{f.symbol.replace(/\.(NS|BO|TO|V|NE)$/i, "")}</strong>
                <span>- {f.reason}</span>
              </li>
            ))}
          </ul>
          {onGo && (
            <button
              onClick={() => onGo("decisions")}
              className="mt-1.5 text-[12px] text-series-1 hover:underline no-print"
            >
              → open the decision board for the full reasoning
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted italic mt-3 leading-relaxed">
        Why the band never hits 0% or 100%: some dry powder means a fall is an opportunity instead of a regret, and
        going fully to cash has cost long-term investors more than the crashes did - because the re-entry decision
        is the one nobody gets right. Buffett held record cash in 1969, 1999 and 2005 - never as a forecast, always
        because prices failed his test. Keep automatic index SIPs running regardless: stopping them is the single
        most expensive habit in this whole app.
      </p>
    </Card>
  );
}
