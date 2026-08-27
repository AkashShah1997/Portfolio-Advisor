"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzedHolding, Currency, FxRates, Scorecard, StockData } from "@/lib/types";
import type { Market } from "@/lib/store";
import { buildSwot } from "@/lib/swot";
import { sectorPeers } from "@/lib/peers";
import { capTierOf, CAP_TIER_META, toMetricRow, type MetricRow } from "@/lib/screens";
import { buildValuation } from "@/lib/valuation";
import { ACTION_META, decideRow } from "@/lib/decisions";
import { coachPosition, momentumFromCandles, STANCE_META, trancheLadder, type MomentumStats } from "@/lib/coach";
import type { MacroPayload } from "@/lib/macro";
import { toBase } from "@/lib/portfolio";
import { currencyForSymbol, fmtMoney, fmtNum, fmtPct } from "@/lib/symbols";
import { isEtfHolding } from "@/lib/etf";
import type { OwnershipPayload } from "@/lib/ownership";
import { VERDICT_META } from "@/lib/portfolio";
import type { Candle } from "@/lib/history";
import { Badge, Card, InfoTip, SectionTitle, Spinner } from "./ui";
import { ChartPanel } from "./ChartPanel";
import { StockCard } from "./StockCard";

/**
 * Deep analysis - one full page per stock, for ANY India/Canada symbol, not
 * just holdings. Everything the tabs know about the name in one place, plus
 * what the portals show that we can power honestly: a rule-based SWOT with
 * evidence, sector comparison from YOUR OWN market scan, the advanced chart
 * with pre-built long-term trendlines, and who owns it.
 */

type Hydrated = { data: StockData; scorecard: Scorecard };

export function DeepDive({
  symbol,
  rows,
  universe,
  market,
  fx,
  base,
  aiKey,
  aiModel,
  hydrate,
  onBack,
  onChangeSymbol,
  onAddWatch,
}: {
  symbol: string | null;
  rows: AnalyzedHolding[];
  universe: MetricRow[];
  market: Market;
  fx: FxRates;
  base: Currency;
  aiKey?: string;
  aiModel?: string;
  hydrate: (symbol: string) => Promise<Hydrated | null>;
  onBack: () => void;
  onChangeSymbol: (symbol: string) => void;
  onAddWatch: (symbol: string, prefetched?: Hydrated) => Promise<boolean>;
}) {
  const held = useMemo(
    () => (symbol ? rows.find((r) => r.holding.yahooSymbol.toUpperCase() === symbol.toUpperCase()) : undefined),
    [rows, symbol]
  );

  // ---- external symbols get hydrated into a synthetic watch-style row ----
  const [external, setExternal] = useState<Record<string, AnalyzedHolding | "loading" | "error">>({});
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!symbol || held || external[symbol] !== undefined || inFlight.current.has(symbol)) return;
    inFlight.current.add(symbol);
    void (async () => {
      await Promise.resolve();
      setExternal((p) => (p[symbol] === undefined ? { ...p, [symbol]: "loading" } : p));
      const full = await hydrate(symbol);
      setExternal((p) => ({
        ...p,
        [symbol]: full
          ? {
              holding: {
                id: `dd-${symbol}`,
                broker: "manual",
                rawSymbol: symbol,
                yahooSymbol: symbol,
                quantity: 0,
                avgCost: 0,
                currency: currencyForSymbol(symbol),
                watch: true,
              },
              data: full.data,
              scorecard: full.scorecard,
              invested: 0,
              currentValue: 0,
            }
          : "error",
      }));
      inFlight.current.delete(symbol);
    })();
  }, [symbol, held, external, hydrate]);

  const row = held ?? (symbol && typeof external[symbol] === "object" ? (external[symbol] as AnalyzedHolding) : undefined);

  // ---- momentum (1y candles) + macro regime, fetched once per symbol/market ----
  const [candles, setCandles] = useState<Record<string, Candle[] | "loading" | "error">>({});
  useEffect(() => {
    if (!symbol || candles[symbol] !== undefined || inFlight.current.has(`h:${symbol}`)) return;
    inFlight.current.add(`h:${symbol}`);
    void (async () => {
      await Promise.resolve();
      setCandles((p) => (p[symbol] === undefined ? { ...p, [symbol]: "loading" } : p));
      try {
        const res = await fetch(`/api/history/${encodeURIComponent(symbol)}?range=1y`);
        const j = (await res.json()) as { candles?: Candle[] };
        setCandles((p) => ({ ...p, [symbol]: Array.isArray(j.candles) && j.candles.length ? j.candles : "error" }));
      } catch {
        setCandles((p) => ({ ...p, [symbol]: "error" }));
      } finally {
        inFlight.current.delete(`h:${symbol}`);
      }
    })();
  }, [symbol, candles]);

  const [regime, setRegime] = useState<MacroPayload["regime"]["key"] | undefined>(undefined);
  useEffect(() => {
    if (regime !== undefined || inFlight.current.has("macro")) return;
    inFlight.current.add("macro");
    void (async () => {
      await Promise.resolve();
      try {
        const res = await fetch(`/api/macro/${market}`);
        const j = (await res.json()) as MacroPayload;
        setRegime(j?.regime?.key ?? "NORMAL");
      } catch {
        setRegime("NORMAL");
      } finally {
        inFlight.current.delete("macro");
      }
    })();
  }, [market, regime]);

  // ---- who owns it (funds + institutions) ----
  const [owners, setOwners] = useState<Record<string, OwnershipPayload | "loading" | "error">>({});
  useEffect(() => {
    if (!symbol || owners[symbol] !== undefined || inFlight.current.has(`o:${symbol}`)) return;
    inFlight.current.add(`o:${symbol}`);
    void (async () => {
      await Promise.resolve();
      setOwners((p) => (p[symbol] === undefined ? { ...p, [symbol]: "loading" } : p));
      try {
        const res = await fetch(`/api/smart/holders/${encodeURIComponent(symbol)}`);
        const j = (await res.json()) as OwnershipPayload & { error?: string };
        setOwners((p) => ({ ...p, [symbol]: res.ok && !j.error ? j : "error" }));
      } catch {
        setOwners((p) => ({ ...p, [symbol]: "error" }));
      } finally {
        inFlight.current.delete(`o:${symbol}`);
      }
    })();
  }, [symbol, owners]);

  // ---- derived analysis (all pure) ----
  const momentum: MomentumStats = useMemo(() => {
    const c = symbol ? candles[symbol] : undefined;
    return typeof c === "object" ? momentumFromCandles(c) : {};
  }, [candles, symbol]);

  const scored = !!row?.scorecard && row.scorecard.verdict !== "INSUFFICIENT_DATA";
  const isEtf = row
    ? isEtfHolding(row.holding.yahooSymbol, row.data?.quote.name ?? row.holding.name, row.data?.quote.quoteType, row.holding.securityType)
    : false;
  const valuation = useMemo(
    () => (row?.data && row.scorecard ? buildValuation(row.data, row.scorecard) : undefined),
    [row]
  );
  const capTier = row ? capTierOf(row.data?.quote.marketCap, row.holding.yahooSymbol) : undefined;
  const weightPct = useMemo(() => {
    if (!held) return undefined;
    const total = rows
      .filter((r) => !r.holding.watch)
      .reduce((a, r) => a + toBase(r.currentValue ?? r.invested, r.holding.currency, fx), 0);
    const v = toBase(held.currentValue ?? held.invested, held.holding.currency, fx);
    return total > 0 ? v / total : undefined;
  }, [held, rows, fx]);

  const decision = useMemo(() => (row && scored && !isEtf ? decideRow(row) : null), [row, scored, isEtf]);
  const swot = useMemo(
    () =>
      row?.data && row.scorecard && scored
        ? buildSwot({ scorecard: row.scorecard, data: row.data, valuation, momentum, capTier, regime, weightPct })
        : null,
    [row, scored, valuation, momentum, capTier, regime, weightPct]
  );
  const peers = useMemo(() => {
    if (!row?.data || !row.scorecard || !scored) return null;
    const self = toMetricRow(row.data, row.scorecard, { owned: !!held, watch: !held });
    return sectorPeers(self, universe);
  }, [row, scored, held, universe]);

  const coach = useMemo(() => {
    if (!held || !row || !scored || isEtf) return null;
    return coachPosition({
      symbol: row.holding.yahooSymbol,
      isEtf: false,
      price: row.data?.quote.price,
      currency: (row.data?.quote.currency ?? row.holding.currency) as Currency,
      pnlPct: row.pnlPct,
      weightPct,
      verdict: row.scorecard?.verdict,
      action: decision?.action,
      valStatus: valuation?.status,
      momentum,
      regime,
    });
  }, [held, row, scored, isEtf, weightPct, decision, valuation, momentum, regime]);

  // ---- symbol search (any India/Canada stock) ----
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const runSearch = async () => {
    const raw = query.trim().toUpperCase();
    if (!raw || searching) return;
    setSearching(true);
    setSearchErr(null);
    const suffix = market === "india" ? ".NS" : ".TO";
    const tries = raw.includes(".") ? [raw] : [raw + suffix, raw];
    let found: string | null = null;
    for (const t of tries) {
      if (rows.some((r) => r.holding.yahooSymbol.toUpperCase() === t)) {
        found = t;
        break;
      }
      const full = await hydrate(t);
      if (full) {
        setExternal((p) => ({
          ...p,
          [t]: {
            holding: {
              id: `dd-${t}`,
              broker: "manual",
              rawSymbol: t,
              yahooSymbol: t,
              quantity: 0,
              avgCost: 0,
              currency: currencyForSymbol(t),
              watch: true,
            },
            data: full.data,
            scorecard: full.scorecard,
            invested: 0,
            currentValue: 0,
          },
        }));
        found = t;
        break;
      }
    }
    setSearching(false);
    if (found) {
      setQuery("");
      onChangeSymbol(found);
    } else {
      setSearchErr(`Couldn't find "${raw}"${raw.includes(".") ? "" : ` (tried ${tries.join(", ")})`} - check the code on Yahoo Finance.`);
    }
  };

  const [addedWatch, setAddedWatch] = useState(false);
  const q = row?.data?.quote;
  const cur = (q?.currency ?? row?.holding.currency ?? base) as Currency;
  const vm = row?.scorecard ? VERDICT_META[row.scorecard.verdict] : undefined;
  const external404 = symbol && !held && external[symbol] === "error";
  const loading = symbol && !row && !external404;
  const ownership = symbol ? owners[symbol] : undefined;

  return (
    <div className="space-y-4">
      {/* header row: back + any-symbol search */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-[13px] text-series-1 hover:underline no-print">
          ← Back to the dashboard
        </button>
        <div className="ml-auto flex items-center gap-2 no-print">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder={market === "india" ? "Deep-dive any NSE stock… e.g. DMART" : "Deep-dive any TSX/US stock… e.g. CNR"}
            className="bg-surface hairline rounded-lg px-3 py-1.5 text-[13px] w-[230px]"
            aria-label="Deep-dive any stock"
          />
          <button
            onClick={() => void runSearch()}
            className="bg-series-1 text-white rounded-lg px-3 py-1.5 text-[13px] font-medium hover:opacity-90"
          >
            {searching ? <Spinner /> : "Analyze"}
          </button>
        </div>
      </div>
      {searchErr && <p className="text-[12.5px] text-status-critical">{searchErr}</p>}

      {!symbol && (
        <Card className="p-5">
          <SectionTitle sub="Type any listed company's Yahoo code above - it gets the FULL treatment: scorecard, SWOT, sector comparison against your scanned market, valuation anchors, the advanced chart with pre-built long-term trendlines, and who owns it. Holdings and watchlist names get here in one click from their card.">
            Deep analysis - any stock, whole story
          </SectionTitle>
          <p className="text-[12.5px] text-ink-2">
            Examples: {market === "india" ? "DMART, TITAN.NS, HDFCBANK" : "CNR, SHOP.TO, BN"} - a bare code gets{" "}
            {market === "india" ? ".NS" : ".TO"} tried first.
          </p>
        </Card>
      )}

      {loading && (
        <Card className="p-5">
          <p className="text-[13px] text-ink-2">
            <Spinner /> Fetching 5 years of fundamentals for {symbol}…
          </p>
        </Card>
      )}
      {external404 && (
        <Card className="p-5">
          <p className="text-[13px] text-status-critical">
            Couldn&apos;t analyze {symbol} - Yahoo returned nothing usable (throttling or an unknown code). Try again in a
            minute or check the code.
          </p>
        </Card>
      )}

      {row && symbol && (
        <>
          {/* identity header */}
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[19px] leading-tight">{q?.name ?? symbol}</span>
                  <span className="text-muted text-[12.5px] tnum">{symbol}</span>
                  {q?.sector && <Badge tone="neutral">{q.sector}</Badge>}
                  {q?.industry && q.industry !== q.sector && <Badge tone="muted">{q.industry}</Badge>}
                  {capTier && <Badge tone="muted">{CAP_TIER_META[capTier].label}</Badge>}
                  {row.data?.mock && <Badge tone="muted">demo data</Badge>}
                </div>
                <div className="text-[13px] text-ink-2 mt-1 tnum">
                  {fmtMoney(q?.price, cur)}
                  {momentum.pctFromHigh !== undefined && (
                    <span className="text-muted">
                      {" "}
                      · {fmtPct(Math.abs(momentum.pctFromHigh))} below 52w high
                    </span>
                  )}
                  {q?.marketCap !== undefined && <span className="text-muted"> · mcap {fmtMoney(q.marketCap, cur, true)}</span>}
                  {held && !held.holding.watch ? (
                    <span className="ml-2">
                      you hold {held.holding.quantity} sh
                      {held.pnlPct !== undefined && (
                        <strong className={`ml-1 ${(held.pnl ?? 0) >= 0 ? "text-success-text" : "text-status-critical"}`}>
                          ({(held.pnl ?? 0) >= 0 ? "+" : ""}
                          {fmtPct(held.pnlPct)})
                        </strong>
                      )}
                      {weightPct !== undefined && <span className="text-muted"> · {fmtPct(weightPct, 1)} of portfolio</span>}
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        void onAddWatch(symbol).then((ok) => setAddedWatch(ok));
                      }}
                      className="ml-2 text-series-1 hover:underline no-print"
                    >
                      {addedWatch ? "✓ on your watchlist" : "☆ add to watchlist"}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {decision && (
                  <Badge tone={ACTION_META[decision.action].tone} icon={ACTION_META[decision.action].icon}>
                    {ACTION_META[decision.action].label}
                  </Badge>
                )}
                {coach && <Badge tone={STANCE_META[coach.stance].tone} icon={STANCE_META[coach.stance].icon}>{STANCE_META[coach.stance].label}</Badge>}
                {row.scorecard && vm && (
                  <div className="text-right">
                    <div className="text-[11px] text-muted">Score</div>
                    <div className="text-[24px] font-semibold tnum leading-none">{row.scorecard.totalScore}</div>
                  </div>
                )}
                {vm && (
                  <Badge tone={vm.tone} icon={vm.icon}>
                    {vm.label}
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {/* SWOT */}
          {swot && (
            <Card className="p-4">
              <SectionTitle sub="Rule-based, from this app's own checks and prices - every line carries its evidence. Strengths/Weaknesses = the business; Opportunities/Threats = the situation.">
                SWOT <InfoTip k="swot" />
              </SectionTitle>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                {(
                  [
                    { title: "✦ Strengths", items: swot.strengths, cls: "text-success-text", icon: "+" },
                    { title: "△ Weaknesses", items: swot.weaknesses, cls: "text-status-critical", icon: "−" },
                    { title: "◎ Opportunities", items: swot.opportunities, cls: "text-series-1", icon: "▸" },
                    { title: "⚑ Threats", items: swot.threats, cls: "text-[#9c4a26]", icon: "!" },
                  ] as const
                ).map((quad) => (
                  <div key={quad.title}>
                    <div className={`text-[11.5px] font-semibold uppercase tracking-wide mb-1.5 ${quad.cls}`}>
                      {quad.title}
                    </div>
                    <ul className="space-y-1.5">
                      {quad.items.map((it, i) => (
                        <li key={i} className="text-[12.5px] leading-snug flex gap-1.5">
                          <span className={`${quad.cls} font-bold shrink-0`} aria-hidden>
                            {quad.icon}
                          </span>
                          <span>
                            <span className="text-ink">{it.text}</span>
                            {it.evidence && <span className="block text-[11px] text-muted">{it.evidence}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* sector comparison from the user's own scan */}
          <Card className="p-4">
            <SectionTitle sub="The honest version of 'industry P/E': medians and ranks computed from the market universe YOU scanned, cached on this device - you can see exactly who the 'industry' is.">
              Sector comparison <InfoTip k="sectorRank" />
            </SectionTitle>
            {peers ? (
              <>
                <p className="text-[13px] text-ink mb-2">
                  <strong>{peers.sector}</strong> · {peers.n} scanned peers · {peers.read}
                </p>
                <div className="grid lg:grid-cols-2 gap-x-6 gap-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="text-left text-[11px] text-muted border-b border-grid uppercase tracking-wide">
                          <th className="py-1.5 pr-3 font-medium">Yardstick</th>
                          <th className="py-1.5 pr-3 font-medium text-right">This stock</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Sector median</th>
                          <th className="py-1.5 font-medium text-right">Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {peers.ranks.map((r) => {
                          const fmt = (v?: number) =>
                            v === undefined ? "–" : r.kind === "pct" ? fmtPct(v) : r.kind === "x" ? fmtNum(v, 1) : String(Math.round(v));
                          return (
                            <tr key={r.key} className="border-b border-grid/50">
                              <td className="py-1.5 pr-3 text-ink-2">{r.label}</td>
                              <td className={`py-1.5 pr-3 text-right tnum font-medium ${r.you !== undefined && r.median !== undefined ? (r.better ? "text-success-text" : "text-ink") : "text-ink"}`}>
                                {fmt(r.you)}
                              </td>
                              <td className="py-1.5 pr-3 text-right tnum text-ink-2">{fmt(r.median)}</td>
                              <td className="py-1.5 text-right tnum text-ink-2">
                                {r.rank !== undefined ? `${r.rank}/${r.of}` : "–"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1">
                      Strongest scanned peers
                    </div>
                    <ul className="space-y-1">
                      {peers.peers.map((p) => {
                        const pvm = VERDICT_META[p.verdict];
                        const you = p.symbol.toUpperCase() === symbol.toUpperCase();
                        return (
                          <li key={p.symbol} className={`flex items-center gap-2 text-[12.5px] ${you ? "bg-page hairline rounded-lg px-2 py-1" : "px-2"}`}>
                            <span className="font-semibold w-[92px] truncate">{p.symbol.replace(/\.(NS|BO|TO|V|NE)$/i, "")}</span>
                            <span className="tnum w-[34px] text-right">{p.score}</span>
                            <Badge tone={pvm.tone}>{pvm.label}</Badge>
                            <span className="text-muted tnum text-[11.5px] ml-auto">
                              ROE {p.roeAvg !== undefined ? fmtPct(p.roeAvg) : "–"} · P/E {p.pe !== undefined ? fmtNum(p.pe, 1) : "–"}
                            </span>
                            {you && <span className="text-[10.5px] text-series-1 font-medium">you</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-ink-2">
                Not enough scanned peers in this sector yet. Run a market scan (Decisions tab › "Scan the market",
                or Ideas › Screeners) and this section fills with sector medians, ranks and the strongest
                competitors - all from your own cached scan.
              </p>
            )}
          </Card>

          {/* the position coach (held) or an entry plan (not held) */}
          {scored && !isEtf && (
            <Card className="p-4">
              {coach ? (
                <>
                  <SectionTitle sub="The same call the Coach tab makes - momentum-aware, weight-aware, regime-aware.">
                    Coach&apos;s call on YOUR position
                  </SectionTitle>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <Badge tone={STANCE_META[coach.stance].tone} icon={STANCE_META[coach.stance].icon}>
                      {STANCE_META[coach.stance].label}
                    </Badge>
                    <span className="text-[13px] text-ink">{coach.headline}</span>
                  </div>
                  <ul className="space-y-1">
                    {coach.points.map((p, i) => (
                      <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                        <span className="text-muted shrink-0" aria-hidden>
                          ·
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                  {coach.dca && (
                    <div className="mt-2 bg-page hairline rounded-xl px-3 py-2">
                      <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">{coach.dca.title}</div>
                      <ul className="mt-1 space-y-0.5">
                        {coach.dca.lines.map((l, i) => (
                          <li key={i} className="text-[12.5px] text-ink-2 tnum">
                            {l}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <SectionTitle sub="You don't hold this one - so the plan is about ENTRY discipline, not position management.">
                    Entry plan (you don&apos;t own it yet)
                  </SectionTitle>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2 tnum mb-2">
                    {valuation?.intrinsic !== undefined && (
                      <span>
                        Fair estimate <strong className="text-ink">{fmtMoney(valuation.intrinsic, cur, true)}</strong>
                      </span>
                    )}
                    {valuation?.buyBelow !== undefined && (
                      <span>
                        Buy below <strong className="text-success-text">{fmtMoney(valuation.buyBelow, cur, true)}</strong>
                      </span>
                    )}
                    {q?.price !== undefined && (
                      <span>
                        Today <strong className="text-ink">{fmtMoney(q.price, cur, true)}</strong>
                      </span>
                    )}
                  </div>
                  {q?.price !== undefined && (
                    <div className="bg-page hairline rounded-xl px-3 py-2">
                      <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">
                        {trancheLadder(q.price, cur).title}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {trancheLadder(q.price, cur).lines.map((l, i) => (
                          <li key={i} className="text-[12.5px] text-ink-2 tnum">
                            {l}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-[11px] text-muted italic mt-2">
                    Graham&apos;s rule from the pre-buy checklist applies: write YOUR buy-below price before acting on
                    today&apos;s quote. The full checklist is inside the breakdown below.
                  </p>
                </>
              )}
            </Card>
          )}

          {/* advanced chart with pre-built long-term trendlines */}
          <div>
            <SectionTitle sub="Golden/death crosses, value levels, and the pre-built long-term lines: the log-trend channel (±2σ rails) and auto support/resistance from tested swing levels. Draw your own on top.">
              Advanced chart
            </SectionTitle>
            <ChartPanel rows={[row]} focusSymbol={symbol} />
          </div>

          {/* who owns it */}
          {typeof ownership === "object" && (ownership.funds.length > 0 || ownership.institutions.length > 0) && (
            <Card className="p-4">
              <SectionTitle sub="Top professional holders from free Yahoo data (full for US/Canada, partial for NSE - promoter stakes show under insiders).">
                Who owns it
              </SectionTitle>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2 tnum mb-2">
                {ownership.breakdown.insidersPct !== undefined && (
                  <span>
                    Insiders/promoters <strong className="text-ink">{fmtPct(ownership.breakdown.insidersPct)}</strong>
                  </span>
                )}
                {ownership.breakdown.institutionsPct !== undefined && (
                  <span>
                    Institutions <strong className="text-ink">{fmtPct(ownership.breakdown.institutionsPct)}</strong>
                  </span>
                )}
                {ownership.breakdown.institutionsCount !== undefined && (
                  <span>
                    {ownership.breakdown.institutionsCount} institutional holders
                  </span>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {(
                  [
                    { label: "Top funds", list: ownership.funds },
                    { label: "Top institutions", list: ownership.institutions },
                  ] as const
                ).map(
                  (grp) =>
                    grp.list.length > 0 && (
                      <div key={grp.label}>
                        <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1">
                          {grp.label}
                        </div>
                        <ul className="space-y-0.5">
                          {grp.list.slice(0, 5).map((e, i) => (
                            <li key={i} className="text-[12px] text-ink-2 flex justify-between gap-3">
                              <span className="truncate">{e.organization}</span>
                              <span className="tnum text-muted shrink-0">
                                {e.pctHeld !== undefined ? fmtPct(e.pctHeld) : "–"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                )}
              </div>
            </Card>
          )}

          {/* the full breakdown - the entire stock card, opened */}
          <div>
            <SectionTitle sub="Pillar scores, every check with evidence, the intrinsic-value band, snowflake, ratio history, charts, F-Score and the pre-buy checklist - the complete record.">
              Full breakdown
            </SectionTitle>
            <StockCard row={row} aiKey={aiKey} aiModel={aiModel} defaultOpen />
          </div>
        </>
      )}
    </div>
  );
}
