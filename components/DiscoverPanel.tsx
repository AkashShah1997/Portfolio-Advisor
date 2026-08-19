"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { AnalyzedHolding, Currency } from "@/lib/types";
import { UNIVERSES, type UniverseCountry } from "@/lib/universe";
import { VALUATION_STATUS_META } from "@/lib/valuation";
import { VERDICT_META } from "@/lib/portfolio";
import { countryForSymbol, currencyForSymbol, fmtPct } from "@/lib/symbols";
import { buildPrompt } from "@/lib/promptgen";
import type { MetricRow } from "@/lib/screens";
import type { ScanMode, ScanState } from "@/lib/scancache";
import type { Hydrated } from "./Dashboard";
import { Badge, Card, SectionTitle, Spinner } from "./ui";
import { EASE, Stagger, StaggerItem } from "./anim";

/**
 * Upgrade ideas — the "remove weeds, water flowers" panel. Scan state is owned
 * by the dashboard and shared with the Screeners tab; results are cached on
 * this device for 24h, so a scan only fetches what's missing or stale.
 */
export function DiscoverPanel({
  rows,
  countries,
  scans,
  onScan,
  onAddWatch,
  hydrate,
}: {
  rows: AnalyzedHolding[];
  countries: UniverseCountry[];
  scans: Record<string, ScanState>;
  onScan: (key: string, mode?: ScanMode) => void;
  onAddWatch: (symbol: string, prefetched?: Hydrated) => Promise<boolean>;
  hydrate: (symbol: string) => Promise<Hydrated | null>;
}) {
  const [country, setCountry] = useState<UniverseCountry>(countries[0]);
  const [buyZoneOnly, setBuyZoneOnly] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const watched = useMemo(
    () => new Set(rows.filter((r) => r.holding.watch).map((r) => r.holding.yahooSymbol.toUpperCase())),
    [rows]
  );
  /** symbols held with real capital (watchlist rows stay visible, marked ✓) */
  const owned = useMemo(
    () => new Set(rows.filter((r) => !r.holding.watch).map((r) => r.holding.yahooSymbol.toUpperCase())),
    [rows]
  );

  const scan = scans[country];
  const weak = rows.filter(
    (r) =>
      !r.holding.watch &&
      r.scorecard &&
      (r.scorecard.verdict === "WATCH" || r.scorecard.verdict === "REVIEW_EXIT")
  );

  const upgradesFor = (w: AnalyzedHolding): MetricRow[] | undefined => {
    const c = countryForSymbol(w.holding.yahooSymbol) as UniverseCountry;
    const s = scans[c];
    if (!s || (s.status !== "done" && s.results.length < 5)) return undefined;
    return s.results
      .filter((r) => !owned.has(r.symbol.toUpperCase()))
      .filter((r) => r.verdict === "ADD_MORE" || r.verdict === "HOLD_QUALITY_PRICEY")
      .filter((r) => r.score >= (w.scorecard?.totalScore ?? 0) + 10)
      .slice(0, 3);
  };

  const addWatch = async (r: MetricRow) => {
    setBusy(`w:${r.symbol}`);
    try {
      await onAddWatch(r.symbol, r.data && r.scorecard ? { data: r.data, scorecard: r.scorecard } : undefined);
    } finally {
      setBusy(null);
    }
  };

  const copyPrompt = async (r: MetricRow) => {
    setBusy(`p:${r.symbol}`);
    try {
      const full = r.data && r.scorecard ? { data: r.data, scorecard: r.scorecard } : await hydrate(r.symbol);
      if (!full) return;
      const cur = currencyForSymbol(r.symbol) as Currency;
      const pseudo: AnalyzedHolding = {
        holding: {
          id: `scan-${r.symbol}`,
          broker: "manual",
          rawSymbol: r.symbol,
          yahooSymbol: r.symbol,
          name: r.name,
          quantity: 0,
          avgCost: 0,
          currency: cur,
          watch: true,
        },
        data: full.data,
        scorecard: full.scorecard,
        invested: 0,
      };
      await navigator.clipboard.writeText(
        buildPrompt([pseudo], { focus: "deep_dive", includeHistory: true, baseCurrency: cur })
      );
      setCopied(r.symbol);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const shown = (scan?.results ?? [])
    .filter((r) => !r.owned && !owned.has(r.symbol.toUpperCase()))
    .filter((r) => (buyZoneOnly ? r.valStatus === "BUY_ZONE" : true))
    .slice(0, 12);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle sub="Scores the market universe (~100–150 widely-traded names per market) with the exact same scorecard — so weeds and flowers are judged by one standard. Results are cached on this device for 24h; a scan only fetches what's missing. Candidates, not recommendations.">
          Scan the market for stronger businesses
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          {countries.map((cKey) => {
            const s = scans[cKey];
            const active = country === cKey;
            return (
              <button
                key={cKey}
                onClick={() => {
                  setCountry(cKey);
                  if (!scans[cKey] || scans[cKey].results.length === 0) onScan(cKey);
                }}
                className={`rounded-full px-3.5 py-[6px] text-[12.5px] font-medium border transition-colors ${
                  active
                    ? "bg-series-1 text-white border-series-1"
                    : "bg-surface text-ink-2 border-baseline hover:bg-page"
                }`}
              >
                {cKey}
                <span className={`ml-1.5 text-[11px] ${active ? "text-white/80" : "text-muted"}`}>
                  {s?.status === "running"
                    ? `${s.done}/${s.total}…`
                    : s && s.results.length
                      ? `✓ ${s.results.length} scored${s.fromCache ? " (cached)" : ""}`
                      : `${UNIVERSES[cKey].length} names`}
                </span>
              </button>
            );
          })}
          {scan && scan.status === "done" && (
            <>
              <button
                onClick={() => onScan(country, "auto")}
                className="text-[12px] text-series-1 hover:underline ml-1"
                title="Fetch anything missing or older than 24h"
              >
                refresh
              </button>
              <button
                onClick={() => onScan(country, "force")}
                className="text-[12px] text-series-1 hover:underline"
                title="Refetch every name from scratch"
              >
                full re-scan
              </button>
            </>
          )}
          <label className="ml-auto text-[12px] text-ink-2 inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={buyZoneOnly}
              onChange={(e) => setBuyZoneOnly(e.target.checked)}
              className="accent-[#2a78d6]"
            />
            in the buy zone only
          </label>
        </div>

        {scan?.status === "running" && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <Spinner /> Scoring {country} — {scan.done}/{scan.total} fetched (free Yahoo data, gently
              throttled; results appear as they land)
            </div>
            <div className="h-[6px] rounded-full bg-page hairline overflow-hidden mt-2">
              <motion.div
                className="h-full bg-series-1 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: `${Math.round((scan.done / Math.max(1, scan.total)) * 100)}%` }}
                transition={{ duration: 0.3, ease: EASE }}
              />
            </div>
          </div>
        )}

        {scan && scan.failed.length > 0 && scan.status === "done" && (
          <div className="flex flex-wrap items-center gap-2 mt-3 text-[12.5px] bg-status-warning/10 border border-status-warning/40 rounded-lg px-3 py-2">
            <span className="text-[#8a6100]">
              {scan.failed.length} name{scan.failed.length === 1 ? "" : "s"} failed
              {scan.throttled ? " — Yahoo was rate-limiting; wait ~1 minute" : ""} (
              {scan.failed.slice(0, 5).join(", ")}
              {scan.failed.length > 5 ? "…" : ""})
            </span>
            <button
              onClick={() => onScan(country, "failed")}
              className="text-series-1 font-medium hover:underline ml-auto"
            >
              ↻ Retry failed
            </button>
          </div>
        )}
        {!scan && (
          <p className="text-[12.5px] text-muted mt-3">
            Pick a market above to start. First full scan of ~{UNIVERSES[country].length} names takes a few
            minutes on live data (instant on demo data); after that it&apos;s cached on this device.
          </p>
        )}
      </Card>

      {/* Upgrade ideas for weak holdings */}
      {weak.length > 0 && (
        <Card className="p-4">
          <SectionTitle sub="“Selling your flowers and watering your weeds” is Lynch's cardinal sin — this flips it: for each holding the screener distrusts, same-market businesses that currently screen far stronger.">
            Upgrade candidates for your weakest holdings
          </SectionTitle>
          <div className="space-y-3">
            {weak.map((w) => {
              const ups = upgradesFor(w);
              const wc = countryForSymbol(w.holding.yahooSymbol) as UniverseCountry;
              const vm = VERDICT_META[w.scorecard!.verdict];
              return (
                <div key={w.holding.id} className="rounded-xl bg-page hairline p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <strong>{w.holding.yahooSymbol}</strong>
                    <Badge tone={vm.tone} icon={vm.icon}>
                      {vm.label} · {w.scorecard!.totalScore}/100
                    </Badge>
                    <span className="text-ink-2 text-[12px]">
                      {ups === undefined
                        ? `scan ${wc} above to see stronger ${wc} alternatives`
                        : ups.length
                          ? "same market, currently screening stronger:"
                          : "no clearly stronger candidate in the scanned universe right now"}
                    </span>
                  </div>
                  {ups && ups.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ups.map((u) => (
                        <span
                          key={u.symbol}
                          className="inline-flex items-center gap-1.5 bg-surface hairline rounded-full pl-2.5 pr-1 py-[3px] text-[12px]"
                        >
                          <strong>{u.symbol}</strong>
                          <span className="text-success-text font-semibold tnum">{u.score}</span>
                          <span className="text-muted tnum">vs {w.scorecard!.totalScore}</span>
                          <button
                            onClick={() => void addWatch(u)}
                            disabled={watched.has(u.symbol.toUpperCase()) || busy === `w:${u.symbol}`}
                            className="text-series-1 hover:underline disabled:text-muted disabled:no-underline px-1"
                            title="Add to watchlist"
                          >
                            {watched.has(u.symbol.toUpperCase()) ? "✓" : busy === `w:${u.symbol}` ? "…" : "+ watch"}
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted mt-3 italic">
            Swapping means selling — mind taxes, friction, and whether the weakness is temporary (a
            great business having a bad year is a buy, not a sell).
          </p>
        </Card>
      )}

      {/* Strongest ideas not owned */}
      {scan && scan.results.length > 0 && (
        <Card className="p-4">
          <SectionTitle
            sub={`The ${country} universe you don't own, ranked by the same 4-pillar scorecard.`}
          >
            Strongest {country} ideas outside your portfolio
          </SectionTitle>
          <Stagger mode="mount">
            <div className="space-y-1.5">
              {shown.map((r, i) => {
                const vm = VERDICT_META[r.verdict];
                const vs = VALUATION_STATUS_META[r.valStatus];
                return (
                  <StaggerItem key={r.symbol}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-page hairline px-3 py-2">
                      <span className="text-[11px] text-muted tnum w-4">{i + 1}</span>
                      <div className="min-w-[150px] flex-1">
                        <div className="text-[13px]">
                          <strong>{r.symbol}</strong> <span className="text-ink-2">{r.name}</span>
                        </div>
                        <div className="text-[11px] text-muted">{r.sector}</div>
                      </div>
                      <span className="text-[17px] font-semibold tnum" title="Scorecard total">
                        {r.score}
                      </span>
                      <Badge tone={vm.tone} icon={vm.icon}>
                        {vm.label}
                      </Badge>
                      {r.valStatus !== "UNKNOWN" && (
                        <Badge tone={vs.tone}>
                          {r.valStatus === "BUY_ZONE" ? `buy zone (MoS ${fmtPct(r.mos ?? 0, 0)})` : vs.label}
                        </Badge>
                      )}
                      {r.pe !== undefined && r.avgPE !== undefined && (
                        <span className="text-[11.5px] text-ink-2 tnum">
                          P/E {r.pe.toFixed(0)} vs {r.avgPE.toFixed(0)} avg
                        </span>
                      )}
                      <span className="flex gap-2 ml-auto">
                        <button
                          onClick={() => void addWatch(r)}
                          disabled={watched.has(r.symbol.toUpperCase()) || busy === `w:${r.symbol}`}
                          className="text-[12px] text-series-1 hover:underline disabled:text-muted disabled:no-underline"
                        >
                          {watched.has(r.symbol.toUpperCase())
                            ? "✓ watching"
                            : busy === `w:${r.symbol}`
                              ? "adding…"
                              : "+ watchlist"}
                        </button>
                        <button
                          onClick={() => void copyPrompt(r)}
                          disabled={busy === `p:${r.symbol}`}
                          className="text-[12px] text-series-1 hover:underline disabled:text-muted"
                          title="Copy a full AI research prompt for this stock"
                        >
                          {copied === r.symbol ? "✓ copied" : busy === `p:${r.symbol}` ? "…" : "AI prompt"}
                        </button>
                      </span>
                    </div>
                  </StaggerItem>
                );
              })}
            </div>
          </Stagger>
          {buyZoneOnly && shown.length === 0 && (
            <p className="text-[12.5px] text-muted">
              Nothing in the scanned universe is in the buy zone right now — Damani would call that a
              signal in itself. Patience is a position.
            </p>
          )}
          <p className="text-[11px] text-muted italic mt-3">
            Universe = broad hand-curated market coverage (edit{" "}
            <code className="text-[10.5px]">lib/universe.ts</code>, or paste any list in Screeners).
            High score ≠ buy signal. Watchlist names carry no capital; they&apos;re saved on this device.
          </p>
        </Card>
      )}
    </div>
  );
}
