"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzedHolding, Currency, FxRates } from "@/lib/types";
import type { Market } from "@/lib/store";
import { coachPosition, momentumFromCandles, STANCE_META, type CoachCall, type MomentumStats } from "@/lib/coach";
import { decideAll } from "@/lib/decisions";
import { isEtfHolding, fallbackEtfData } from "@/lib/etf";
import { assessAll } from "@/lib/etfscore";
import { toBase } from "@/lib/portfolio";
import type { MacroPayload } from "@/lib/macro";
import type { Candle } from "@/lib/history";
import { fmtPct } from "@/lib/symbols";
import { Badge, Card, InfoTip, SectionTitle, Spinner } from "./ui";
import { Stagger, StaggerItem } from "./anim";

/**
 * The Coach - "I'm up 50% on this: trim, hold, buy the dip, or keep DCA-ing?"
 * One stance per position from the app's own verdicts + live momentum + the
 * market regime, with concrete DCA plans (SIP for ETFs, tranche ladders for
 * stock dips). The ↻ button re-pulls momentum and the regime fresh.
 */

type Mom = { stats: MomentumStats } | "loading" | "error";

const pf = (v: number | undefined, d = 1) =>
  v === undefined ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

export function CoachPanel({
  rows,
  market,
  fx,
}: {
  rows: AnalyzedHolding[];
  market: Market;
  fx: FxRates;
}) {
  const held = useMemo(
    () => rows.filter((r) => !r.holding.watch && r.holding.quantity > 0 && r.data),
    [rows]
  );
  const symbols = useMemo(() => held.map((r) => r.holding.yahooSymbol.toUpperCase()), [held]);

  const [mom, setMom] = useState<Record<string, Mom>>({});
  const [macro, setMacro] = useState<MacroPayload | "loading" | "error" | undefined>(undefined);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());

  // momentum: ~1y daily history per held name, 2 at a time
  useEffect(() => {
    const missing = symbols.filter((s) => mom[s] === undefined && !inFlight.current.has(s)).slice(0, 2);
    if (!missing.length) return;
    for (const s of missing) inFlight.current.add(s);
    void (async () => {
      await Promise.resolve();
      setMom((prev) => {
        const next = { ...prev };
        for (const s of missing) if (next[s] === undefined) next[s] = "loading";
        return next;
      });
      await Promise.all(
        missing.map(async (s) => {
          try {
            const res = await fetch(`/api/history/${encodeURIComponent(s)}?range=1y`);
            const j = (await res.json()) as { candles?: Candle[] };
            setMom((prev) => ({
              ...prev,
              [s]: Array.isArray(j.candles) && j.candles.length ? { stats: momentumFromCandles(j.candles) } : "error",
            }));
          } catch {
            setMom((prev) => ({ ...prev, [s]: "error" }));
          } finally {
            inFlight.current.delete(s);
          }
        })
      );
    })();
  }, [symbols, mom]);

  // market regime (shared cache with Market weather)
  useEffect(() => {
    if (macro !== undefined) return;
    void (async () => {
      await Promise.resolve();
      setMacro("loading");
      try {
        const res = await fetch(`/api/macro/${market}`);
        const j = (await res.json()) as MacroPayload & { error?: string };
        setMacro(res.ok && !j.error ? j : "error");
      } catch {
        setMacro("error");
      }
    })();
  }, [market, macro]);

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void (async () => {
      try {
        // fresh regime + fresh momentum for every held name (2 at a time)
        const res = await fetch(`/api/macro/${market}?fresh=1`);
        const j = (await res.json()) as MacroPayload & { error?: string };
        setMacro(res.ok && !j.error ? j : "error");
        for (let i = 0; i < symbols.length; i += 2) {
          await Promise.all(
            symbols.slice(i, i + 2).map(async (s) => {
              try {
                const r = await fetch(`/api/history/${encodeURIComponent(s)}?range=1y&fresh=1`);
                const jj = (await r.json()) as { candles?: Candle[] };
                setMom((prev) => ({
                  ...prev,
                  [s]: Array.isArray(jj.candles) && jj.candles.length ? { stats: momentumFromCandles(jj.candles) } : "error",
                }));
              } catch {
                setMom((prev) => ({ ...prev, [s]: "error" }));
              }
            })
          );
        }
        setRefreshedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      } finally {
        setRefreshing(false);
      }
    })();
  };

  // decisions + ETF assessments + weights, then the coach call per position
  const calls = useMemo(() => {
    const stockRows = held.filter(
      (r) => !isEtfHolding(r.holding.yahooSymbol, r.data?.quote.name ?? r.holding.name, r.data?.quote.quoteType, r.holding.securityType)
    );
    const etfRows = held.filter((r) => !stockRows.includes(r));
    const groups = decideAll(stockRows);
    /**
     * Weight denominator must be EVERY funded position, not just the ones whose
     * quote fetch succeeded. Dropping failed rows inflated each remaining
     * weight - and the coach trims at 15%, so an inflated number changed the
     * recommendation (25% shown elsewhere read as 33% here).
     */
    const total = rows
      .filter((r) => !r.holding.watch && r.holding.quantity > 0)
      .reduce((a, r) => a + toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx), 0);
    const etfAssessed = etfRows.length
      ? assessAll(
          etfRows.map((r) => ({
            etf: fallbackEtfData({
              symbol: r.holding.yahooSymbol,
              name: r.data?.quote.name ?? r.holding.name,
              price: r.data?.quote.price,
              currency: (r.data?.quote.currency as string | undefined) ?? r.holding.currency,
              prices: r.data?.prices,
            }),
            value: toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx),
          })),
          { market, portfolioTotal: total }
        )
      : [];
    const regime = macro !== undefined && typeof macro !== "string" ? macro.regime.key : undefined;

    const out: { row: AnalyzedHolding; call: CoachCall; m?: MomentumStats }[] = [];
    for (const r of held) {
      const sym = r.holding.yahooSymbol;
      const st = mom[sym.toUpperCase()];
      const stats = st && typeof st !== "string" ? st.stats : undefined;
      const isEtf = etfRows.includes(r);
      const value = toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx);
      const call = coachPosition({
        symbol: sym,
        isEtf,
        price: r.data?.quote.price,
        currency: (r.data?.quote.currency ?? r.holding.currency) as Currency,
        pnlPct: r.pnlPct,
        weightPct: total > 0 ? value / total : undefined,
        verdict: r.scorecard?.verdict,
        action: groups.decisions.get(r.holding.id)?.action,
        valStatus: groups.decisions.get(r.holding.id)?.valuation.status,
        etfVerdict: etfAssessed.find((a) => a.symbol.toUpperCase() === sym.toUpperCase())?.verdict,
        momentum: stats,
        regime,
      });
      out.push({ row: r, call, m: stats });
    }
    out.sort((a, b) => STANCE_META[a.call.stance].priority - STANCE_META[b.call.stance].priority);
    return out;
  }, [held, mom, macro, fx, market]);

  const loadingCount = symbols.filter((s) => mom[s] === undefined || mom[s] === "loading").length;
  const regimeLine = macro !== undefined && typeof macro !== "string" ? macro.regime.headline : undefined;

  if (!held.length) {
    return (
      <Card className="p-4">
        <SectionTitle>Position coach</SectionTitle>
        <p className="text-[13px] text-muted">Analyze a portfolio first - the coach works on your actual positions.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <SectionTitle sub="Per position: profit, weight, quality, valuation, live momentum and the market regime → one stance. Sizing and pacing, never market-timing - DCA is a strategy, not a consolation.">
            Position coach - trim, hold, buy the dip, or DCA?
          </SectionTitle>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="no-print shrink-0 inline-flex items-center gap-1.5 bg-series-1 text-white rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
            title="Re-fetch live momentum for every position + the market regime"
          >
            {refreshing ? <Spinner /> : <span aria-hidden>↻</span>} Refresh momentum
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
          {regimeLine && (
            <span>
              Regime: <strong className="text-ink">{regimeLine}</strong>
            </span>
          )}
          {loadingCount > 0 && (
            <span className="text-muted">
              <Spinner /> momentum {symbols.length - loadingCount}/{symbols.length}…
            </span>
          )}
          {refreshedAt && <span className="text-muted">refreshed {refreshedAt}</span>}
        </div>
      </Card>

      <Stagger mode="mount">
        <div className="space-y-3">
          {calls.map(({ row, call, m }) => {
            const sm = STANCE_META[call.stance];
            const short = row.holding.yahooSymbol.replace(/\.(NS|BO|TO|V)$/i, "");
            return (
              <StaggerItem key={row.holding.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-[15px]">{short}</span>{" "}
                      <span className="text-muted text-[12px]">{row.data?.quote.name}</span>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-2 tnum mt-0.5">
                        {row.pnlPct !== undefined && (
                          <span className={`font-semibold ${row.pnlPct >= 0 ? "text-success-text" : "text-status-critical"}`}>
                            {row.pnlPct >= 0 ? "+" : ""}
                            {fmtPct(row.pnlPct)} P&L
                          </span>
                        )}
                        {m?.pctFromHigh !== undefined && <span>{pf(m.pctFromHigh)} vs 52w high</span>}
                        {m?.vs200d !== undefined && <span>{pf(m.vs200d)} vs 200-day</span>}
                        {m?.ret3m !== undefined && <span>{pf(m.ret3m)} · 3m</span>}
                        {m?.ret12m1 !== undefined && (
                          <span>
                            {pf(m.ret12m1, 0)} · 12-1m <InfoTip k="momentum12" />
                          </span>
                        )}
                        {mom[row.holding.yahooSymbol.toUpperCase()] === "error" && (
                          <span className="text-muted">momentum unavailable - stance uses fundamentals only</span>
                        )}
                      </div>
                    </div>
                    <Badge tone={sm.tone} icon={sm.icon}>
                      {sm.label}
                    </Badge>
                  </div>

                  <p className="text-[13px] text-ink mt-2 leading-snug font-medium">{call.headline}</p>
                  {call.points.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {call.points.map((p, i) => (
                        <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                          <span className="text-series-1 shrink-0" aria-hidden>
                            ▸
                          </span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {call.dca && (
                    <div className="mt-2.5 bg-page hairline rounded-xl px-3 py-2.5">
                      <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1">
                        {call.dca.title} <InfoTip k="dca" />
                      </div>
                      <ul className="space-y-1">
                        {call.dca.lines.map((l, i) => (
                          <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                            <span className="text-muted shrink-0 tnum" aria-hidden>
                              {i + 1}.
                            </span>
                            <span>{l}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              </StaggerItem>
            );
          })}
        </div>
      </Stagger>

      <p className="text-[11px] text-muted italic">
        Stances are mechanical starting points from your own numbers - the currency here is discipline, not
        prediction. Trims are for weight, adds are in tranches, DCA never skips a month. Not financial advice; taxes
        and your cash needs are yours to weigh.
      </p>
    </div>
  );
}
