"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzedHolding, Currency } from "@/lib/types";
import type { Market } from "@/lib/store";
import { SUPERINVESTORS, type InvestorMoves, type Move } from "@/lib/thirteenf";
import type { OwnershipPayload } from "@/lib/ownership";
import { currencyForSymbol, fmtPct } from "@/lib/symbols";
import { compactMoney } from "./charts";
import { Badge, Card, SectionTitle, Spinner } from "./ui";
import { Stagger, StaggerItem } from "./anim";

/**
 * Smart money - two honest lenses on what serious long-horizon capital does:
 *  1. Conviction moves from a curated bench of superinvestors (SEC 13F
 *     filings - free, official, up to 45 days delayed, US-listed longs only).
 *  2. Which mutual funds & institutions own a given stock (works across your
 *     holdings; partial coverage for NSE names on free data).
 */

const dollars = (v?: number) => (v === undefined ? "–" : compactMoney(v, "USD"));

function MoveChip({
  m,
  kind,
  canWatch,
  watched,
  busy,
  onWatch,
}: {
  m: Move;
  kind: "new" | "add" | "trim" | "exit";
  canWatch: boolean;
  watched: boolean;
  busy: boolean;
  onWatch: () => void;
}) {
  const tone =
    kind === "new" ? "text-success-text" : kind === "add" ? "text-series-1" : kind === "trim" ? "text-[#8a6100]" : "text-status-critical";
  return (
    <span className="inline-flex items-center gap-1.5 bg-page hairline rounded-full pl-2.5 pr-1.5 py-[3px] text-[12px]">
      <span className={`font-semibold ${tone}`}>
        {m.ticker ?? m.issuer.split(" ").slice(0, 2).join(" ")}
      </span>
      <span className="text-ink-2 tnum">{fmtPct(m.weightPct, 1)} of book</span>
      {m.sharesChangePct !== undefined && kind !== "new" && kind !== "exit" && (
        <span className="text-muted tnum">
          {m.sharesChangePct >= 0 ? "+" : ""}
          {Math.round(m.sharesChangePct * 100)}% sh
        </span>
      )}
      {canWatch && (
        <button
          onClick={onWatch}
          disabled={watched || busy}
          className="text-series-1 hover:underline disabled:text-muted disabled:no-underline px-0.5"
          title="Add to your watchlist (scored by your own scorecard)"
        >
          {watched ? "✓" : busy ? "…" : "+watch"}
        </button>
      )}
    </span>
  );
}

function InvestorCard({
  inv,
  market,
  watchedSet,
  busyWatch,
  onWatch,
}: {
  inv: InvestorMoves;
  market: Market;
  watchedSet: Set<string>;
  busyWatch: string | null;
  onWatch: (symbol: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const canWatchTicker = (t?: string) => !!t && market === "canada"; // 13F names are US listings

  const group = (label: string, kind: "new" | "add" | "trim" | "exit", moves: Move[], cap = 6) =>
    moves.length > 0 && (
      <div>
        <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{label}</div>
        <div className="flex flex-wrap gap-1.5">
          {moves.slice(0, cap).map((m) => (
            <MoveChip
              key={m.cusip}
              m={m}
              kind={kind}
              canWatch={canWatchTicker(m.ticker)}
              watched={!!m.ticker && watchedSet.has(m.ticker.toUpperCase())}
              busy={busyWatch === m.ticker}
              onWatch={() => m.ticker && onWatch(m.ticker)}
            />
          ))}
          {moves.length > cap && <span className="text-[11px] text-muted self-center">+{moves.length - cap} more</span>}
        </div>
      </div>
    );

  return (
    <Card className="p-4">
      <button className="w-full text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px]">{inv.name}</span>
              <span className="text-[12px] text-ink-2">{inv.manager}</span>
              <Badge tone="muted">{inv.record}</Badge>
            </div>
            <div className="text-[12px] text-ink-2 mt-0.5">{inv.blurb}</div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-ink-2">
            {inv.error ? (
              <Badge tone="serious" icon="!">
                fetch failed
              </Badge>
            ) : (
              <>
                <span className="tnum">
                  {inv.quarter ? `Q ending ${inv.quarter}` : ""}
                  {inv.filedAt ? ` · filed ${inv.filedAt}` : ""}
                </span>
                <Badge tone="neutral">{dollars(inv.aumUsd)} · {inv.positionsCount} pos.</Badge>
              </>
            )}
            <span className="text-muted text-[13px]" aria-hidden>
              {open ? "▾" : "▸"}
            </span>
          </div>
        </div>
        {!open && !inv.error && (
          <div className="text-[12px] text-ink-2 mt-1.5">
            <span className="text-success-text font-medium">{inv.newBuys.length} new</span> ·{" "}
            <span className="text-series-1 font-medium">{inv.adds.length} added</span> ·{" "}
            <span className="text-[#8a6100] font-medium">{inv.trims.length} trimmed</span> ·{" "}
            <span className="text-status-critical font-medium">{inv.exits.length} exited</span>
            {inv.top.length > 0 && (
              <span className="text-muted">
                {" "}
                · top: {inv.top.slice(0, 3).map((t) => t.ticker ?? t.issuer.split(" ")[0]).join(", ")}
              </span>
            )}
          </div>
        )}
      </button>

      {inv.error && (
        <p className="text-[12px] text-ink-2 mt-1.5">
          Couldn&apos;t read this filer right now ({inv.error}). SEC EDGAR occasionally throttles - reopen
          the tab in a minute.
        </p>
      )}

      {open && !inv.error && (
        <div className="mt-3 space-y-3">
          {group("🟢 New buys this quarter", "new", inv.newBuys)}
          {group("➕ Added to (≥20% more shares)", "add", inv.adds)}
          {inv.top.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                Top 10 holdings
              </div>
              <div className="space-y-1">
                {inv.top.map((t) => (
                  <div key={t.cusip} className="grid grid-cols-[minmax(120px,220px)_1fr_auto] items-center gap-2 text-[12px]">
                    <span className="truncate">
                      <strong>{t.ticker ?? "–"}</strong> <span className="text-ink-2">{t.issuer}</span>
                    </span>
                    <div className="h-[10px] bg-page rounded-r-[4px] overflow-hidden">
                      <div className="h-full rounded-r-[4px] bg-series-1" style={{ width: `${Math.min(100, t.weightPct * 250)}%` }} />
                    </div>
                    <span className="tnum text-ink-2 text-right w-[110px]">
                      {fmtPct(t.weightPct, 1)}
                      {t.prevWeightPct !== undefined && (
                        <span className={`ml-1 ${t.weightPct >= t.prevWeightPct ? "text-success-text" : "text-status-critical"}`}>
                          {t.weightPct >= t.prevWeightPct ? "▲" : "▼"}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {group("🔻 Trimmed (≥20% fewer shares)", "trim", inv.trims)}
          {group("✕ Exited", "exit", inv.exits)}
        </div>
      )}
    </Card>
  );
}

export function SmartMoney({
  rows,
  market,
  onAddWatch,
}: {
  rows: AnalyzedHolding[];
  market: Market;
  onAddWatch: (symbol: string) => Promise<boolean>;
}) {
  // one entry per filer - each card loads, fails and retries on its own.
  // India view: 13Fs are US-only disclosures, so the bench is opt-in there
  // and "Who owns your stock" (which covers NSE names) leads instead.
  const [showBench, setShowBench] = useState(market !== "india");
  const [invs, setInvs] = useState<Record<string, InvestorMoves | "loading" | "error">>({});
  const invInFlight = useRef<Set<string>>(new Set());
  const [busyWatch, setBusyWatch] = useState<string | null>(null);
  const symbols = useMemo(() => rows.map((r) => r.holding.yahooSymbol), [rows]);
  const [holdersSym, setHoldersSym] = useState<string>(symbols[0] ?? "");
  const [holdersCustom, setHoldersCustom] = useState("");
  const [holders, setHolders] = useState<{ loading: boolean; error?: string; data?: OwnershipPayload }>({
    loading: false,
  });

  const watchedSet = useMemo(
    () => new Set(rows.map((r) => r.holding.yahooSymbol.toUpperCase())),
    [rows]
  );

  // fetch each filer independently, 3 at a time - cards appear as they arrive
  useEffect(() => {
    if (!showBench) return; // India: don't fetch SEC filings until asked
    const missing = SUPERINVESTORS.filter(
      (s) => invs[s.cik] === undefined && !invInFlight.current.has(s.cik)
    ).slice(0, 3);
    if (!missing.length) return;
    for (const s of missing) invInFlight.current.add(s.cik);
    void (async () => {
      await Promise.resolve(); // defer past render commit
      setInvs((prev) => {
        const next = { ...prev };
        for (const s of missing) if (next[s.cik] === undefined) next[s.cik] = "loading";
        return next;
      });
      await Promise.all(
        missing.map(async (s) => {
          try {
            const res = await fetch(`/api/smart/investor/${s.cik}`);
            const j = (await res.json()) as InvestorMoves & { error?: string };
            setInvs((prev) => ({ ...prev, [s.cik]: res.ok && !j.error ? j : "error" }));
          } catch {
            setInvs((prev) => ({ ...prev, [s.cik]: "error" }));
          } finally {
            invInFlight.current.delete(s.cik);
          }
        })
      );
    })();
  }, [invs, showBench]);

  const retryInvestor = (cik: string) => {
    setInvs((prev) => {
      const next = { ...prev };
      delete next[cik];
      return next;
    });
  };

  const loaded = useMemo(
    () =>
      SUPERINVESTORS.map((s) => invs[s.cik]).filter(
        (v): v is InvestorMoves => v !== undefined && typeof v !== "string"
      ),
    [invs]
  );
  const loadingCount = SUPERINVESTORS.filter(
    (s) => invs[s.cik] === undefined || invs[s.cik] === "loading"
  ).length;

  // fetch holders when the selected symbol changes
  useEffect(() => {
    if (!holdersSym) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setHolders({ loading: true });
      try {
        const res = await fetch(`/api/smart/holders/${encodeURIComponent(holdersSym)}`);
        const j = (await res.json()) as OwnershipPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setHolders({ loading: false, data: j });
      } catch (e) {
        if (!cancelled) setHolders({ loading: false, error: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [holdersSym]);

  const consensus = useMemo(() => {
    const byKey = new Map<string, { label: string; ticker?: string; investors: string[] }>();
    for (const inv of loaded) {
      if (inv.error) continue;
      for (const m of [...inv.newBuys, ...inv.adds]) {
        const key = (m.ticker ?? m.issuer).toUpperCase();
        const entry = byKey.get(key) ?? { label: m.ticker ?? m.issuer, ticker: m.ticker, investors: [] };
        if (!entry.investors.includes(inv.name)) entry.investors.push(inv.name);
        byKey.set(key, entry);
      }
    }
    return [...byKey.values()].filter((e) => e.investors.length >= 2).sort((a, b) => b.investors.length - a.investors.length);
  }, [loaded]);

  const doWatch = async (symbol: string) => {
    setBusyWatch(symbol);
    try {
      await onAddWatch(symbol);
    } finally {
      setBusyWatch(null);
    }
  };

  const cur = (holdersSym ? currencyForSymbol(holdersSym) : "USD") as Currency;
  const isIndiaSym = holdersSym.toUpperCase().endsWith(".NS") || holdersSym.toUpperCase().endsWith(".BO");

  const holdersTable = (title: string, list: OwnershipPayload["funds"]) => (
    <div className="flex-1 min-w-[280px]">
      <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{title}</div>
      {list.length === 0 ? (
        <p className="text-[12px] text-muted">No data on the free feed for this listing.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-muted border-b border-grid">
              <th className="py-1 pr-2 font-medium">Holder</th>
              <th className="py-1 pr-2 font-medium text-right">% held</th>
              <th className="py-1 pr-2 font-medium text-right">Value</th>
              <th className="py-1 font-medium text-right">As of</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 8).map((f) => (
              <tr key={f.organization} className="border-b border-grid/50">
                <td className="py-1 pr-2 truncate max-w-[220px]">{f.organization}</td>
                <td className="py-1 pr-2 tnum text-right">{fmtPct(f.pctHeld)}</td>
                <td className="py-1 pr-2 tnum text-right">{f.value !== undefined ? compactMoney(f.value, cur) : "–"}</td>
                <td className="py-1 tnum text-right text-muted">{f.reportDate ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    // flex + explicit order: India leads with what covers NSE names (the
    // ownership feed); the US-only 13F bench is opt-in there. Canada leads
    // with the bench - those ARE its investable listings.
    <div className="flex flex-col gap-4">
      {/* India: the US bench is opt-in, with the honest reason */}
      {market === "india" && !showBench && (
        <Card className="p-4 order-2">
          <SectionTitle sub="13F filings are a US disclosure - great for ideas, but none of these managers can hold your NSE names, and India has no free 13F equivalent. For Indian names, “Who owns your stock” above reads the ownership feed (promoters show under insiders); the exchange shareholding pattern has the authoritative list.">
            US superinvestor bench (optional here)
          </SectionTitle>
          <button
            onClick={() => setShowBench(true)}
            className="bg-series-1 text-white rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold"
          >
            Show the US bench ▸
          </button>
        </Card>
      )}

      {/* superinvestor moves */}
      {showBench && (
      <Card className={`p-4 ${market === "india" ? "order-2" : ""}`}>
        <SectionTitle sub="A hand-picked bench of long-horizon managers with decades-long public records, read straight from their official SEC 13F filings. Filings lag by up to 45 days and show US-listed long positions only - clone ideas, then do your own work.">
          Superinvestor conviction moves
        </SectionTitle>
        {loadingCount > 0 && (
          <p className="text-[13px] text-ink-2">
            <Spinner /> Reading 13F filings from SEC EDGAR - {loaded.length} of {SUPERINVESTORS.length} in,
            cards appear as each filing arrives…
          </p>
        )}
        {loaded.some((i) => i.mock) && <Badge tone="muted">demo data</Badge>}
        {consensus.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 mb-1">
            <span className="text-[12px] font-semibold text-ink-2">
              Bought/added by ≥2 of the bench{loadingCount > 0 ? ` (from ${loaded.length} filings so far)` : ""}:
            </span>
            {consensus.slice(0, 8).map((cItem) => (
              <span key={cItem.label} className="inline-flex items-center gap-1.5 bg-status-good/8 border border-status-good/30 rounded-full px-2.5 py-[3px] text-[12px]">
                <strong className="text-success-text">{cItem.label}</strong>
                <span className="text-ink-2" title={cItem.investors.join(", ")}>
                  ×{cItem.investors.length}
                </span>
                {cItem.ticker && market === "canada" && (
                  <button
                    onClick={() => void doWatch(cItem.ticker!)}
                    disabled={watchedSet.has(cItem.ticker.toUpperCase()) || busyWatch === cItem.ticker}
                    className="text-series-1 hover:underline disabled:text-muted disabled:no-underline"
                  >
                    {watchedSet.has(cItem.ticker.toUpperCase()) ? "✓" : "+watch"}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </Card>
      )}

      {showBench && (
      <div className={market === "india" ? "order-3" : ""}>
      <Stagger mode="mount">
        <div className="space-y-3">
          {SUPERINVESTORS.map((s) => {
            const state = invs[s.cik];
            if (state === undefined || state === "loading") {
              return (
                <StaggerItem key={s.cik}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-3 text-[13px]">
                      <span className="font-semibold text-[15px]">{s.name}</span>
                      <span className="text-[12px] text-ink-2">{s.manager}</span>
                      <span className="text-ink-2">
                        <Spinner /> reading filing…
                      </span>
                    </div>
                  </Card>
                </StaggerItem>
              );
            }
            if (state === "error") {
              return (
                <StaggerItem key={s.cik}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
                      <div>
                        <span className="font-semibold text-[15px]">{s.name}</span>{" "}
                        <span className="text-[12px] text-ink-2">{s.manager}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Badge tone="serious" icon="!">
                          couldn&apos;t read this filing
                        </Badge>
                        <button
                          onClick={() => retryInvestor(s.cik)}
                          className="text-series-1 text-[12.5px] font-medium hover:underline"
                        >
                          ↻ retry
                        </button>
                      </div>
                    </div>
                  </Card>
                </StaggerItem>
              );
            }
            return (
              <StaggerItem key={s.cik}>
                <InvestorCard
                  inv={state}
                  market={market}
                  watchedSet={watchedSet}
                  busyWatch={busyWatch}
                  onWatch={(sym) => void doWatch(sym)}
                />
              </StaggerItem>
            );
          })}
        </div>
      </Stagger>
      </div>
      )}

      {/* who owns your stock - leads in the India view */}
      <Card className={`p-4 ${market === "india" ? "order-1" : ""}`}>
        <SectionTitle sub="Top mutual funds and institutions holding a stock, from the free ownership feed - full for US/Canadian listings, partial for NSE names (promoter stakes show under 'insiders').">
          Who owns your stock
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] no-print">
          <select
            value={symbols.includes(holdersSym) ? holdersSym : "__custom"}
            onChange={(e) => e.target.value !== "__custom" && setHoldersSym(e.target.value)}
            className="bg-page hairline rounded-lg px-2 py-1.5 font-medium"
            aria-label="Symbol to inspect"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {!symbols.includes(holdersSym) && holdersSym && <option value="__custom">{holdersSym}</option>}
          </select>
          <input
            value={holdersCustom}
            onChange={(e) => setHoldersCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && holdersCustom.trim() && setHoldersSym(holdersCustom.trim().toUpperCase())}
            placeholder="any symbol…"
            className="bg-page hairline rounded-lg px-2 py-1.5 w-[150px]"
          />
          <button
            onClick={() => holdersCustom.trim() && setHoldersSym(holdersCustom.trim().toUpperCase())}
            className="text-series-1 font-medium hover:underline"
          >
            load
          </button>
          {holders.loading && <Spinner />}
        </div>

        {holders.error && <p className="text-[12.5px] text-status-critical mt-2">{holders.error}</p>}

        {holders.data && (
          <>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="font-semibold text-[14px] mr-1">{holders.data.symbol}</span>
              {holders.data.breakdown.insidersPct !== undefined && (
                <Badge tone="neutral">
                  {isIndiaSym ? "promoters/insiders" : "insiders"} {fmtPct(holders.data.breakdown.insidersPct)}
                </Badge>
              )}
              {holders.data.breakdown.institutionsPct !== undefined && (
                <Badge tone="neutral">institutions {fmtPct(holders.data.breakdown.institutionsPct)}</Badge>
              )}
              {holders.data.breakdown.institutionsFloatPct !== undefined && (
                <Badge tone="muted">of float {fmtPct(holders.data.breakdown.institutionsFloatPct)}</Badge>
              )}
              {holders.data.breakdown.institutionsCount !== undefined && (
                <Badge tone="muted">{holders.data.breakdown.institutionsCount} institutions</Badge>
              )}
              {holders.data.mock && <Badge tone="muted">demo data</Badge>}
            </div>
            <div className="flex flex-wrap gap-6 mt-3">
              {holdersTable("Top mutual funds / ETFs", holders.data.funds)}
              {holdersTable("Top institutions", holders.data.institutions)}
            </div>
            {isIndiaSym && (
              <p className="text-[11px] text-muted italic mt-2">
                NSE coverage on the free feed is partial - treat this as a sample, and check the quarterly
                shareholding pattern on the exchange for the authoritative list.
              </p>
            )}
          </>
        )}
      </Card>

      <p className={`text-[11.5px] text-muted leading-relaxed ${market === "india" ? "order-4" : ""}`}>
        Sources: SEC EDGAR 13F filings (official, free) and Yahoo Finance ownership data (free,
        unofficial). Smart-money positions are context, not instructions - Pabrai clones shamelessly,
        but he reads the filing first. Their size, mandates and hedges differ from yours.
      </p>
    </div>
  );
}
