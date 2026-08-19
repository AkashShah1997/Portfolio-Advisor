"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { AnalyzedHolding, Scorecard, StockData } from "@/lib/types";
import { UNIVERSES, type UniverseCountry } from "@/lib/universe";
import { VALUATION_STATUS_META, type ValuationStatus } from "@/lib/valuation";
import { VERDICT_META } from "@/lib/portfolio";
import { countryForSymbol, currencyForSymbol, fmtPct } from "@/lib/symbols";
import { buildPrompt } from "@/lib/promptgen";
import { Badge, Card, SectionTitle, Spinner } from "./ui";
import { EASE, Stagger, StaggerItem } from "./anim";

/**
 * Upgrade ideas — the "remove weeds, water flowers" panel. Scan state is owned
 * by the dashboard and shared with the Screeners tab, so one scan feeds both.
 */

export interface ScanResult {
  symbol: string;
  name: string;
  sector: string;
  score: number;
  verdict: Scorecard["verdict"];
  data: StockData;
  scorecard: Scorecard;
  mos?: number;
  valStatus: ValuationStatus;
}

export interface ScanState {
  status: "running" | "done";
  done: number;
  total: number;
  results: ScanResult[];
  errors: number;
}

export function DiscoverPanel({
  rows,
  countries,
  scans,
  onScan,
  onAddWatch,
}: {
  rows: AnalyzedHolding[];
  countries: UniverseCountry[];
  scans: Partial<Record<UniverseCountry, ScanState>>;
  onScan: (c: UniverseCountry) => void;
  onAddWatch: (r: ScanResult) => boolean;
}) {
  const [country, setCountry] = useState<UniverseCountry>(countries[0]);
  const [buyZoneOnly, setBuyZoneOnly] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const watched = useMemo(
    () => new Set(rows.filter((r) => r.holding.watch).map((r) => r.holding.yahooSymbol.toUpperCase())),
    [rows]
  );

  const scan = scans[country];
  const weak = rows.filter(
    (r) =>
      !r.holding.watch &&
      r.scorecard &&
      (r.scorecard.verdict === "WATCH" || r.scorecard.verdict === "REVIEW_EXIT")
  );

  const upgradesFor = (w: AnalyzedHolding): ScanResult[] | undefined => {
    const c = countryForSymbol(w.holding.yahooSymbol) as UniverseCountry;
    const s = scans[c];
    if (!s || s.status !== "done") return undefined;
    return s.results
      .filter((r) => r.verdict === "ADD_MORE" || r.verdict === "HOLD_QUALITY_PRICEY")
      .filter((r) => r.score >= (w.scorecard?.totalScore ?? 0) + 10)
      .slice(0, 3);
  };

  const copyPrompt = async (r: ScanResult) => {
    const cur = currencyForSymbol(r.symbol);
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
      data: r.data,
      scorecard: r.scorecard,
      invested: 0,
    };
    try {
      await navigator.clipboard.writeText(
        buildPrompt([pseudo], { focus: "deep_dive", includeHistory: true, baseCurrency: cur })
      );
      setCopied(r.symbol);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* ignore */
    }
  };

  const shown = (scan?.results ?? [])
    .filter((r) => (buyZoneOnly ? r.valStatus === "BUY_ZONE" : true))
    .slice(0, 12);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle sub="Scores a hand-picked universe of widely-followed quality names in your market with the exact same scorecard — so weeds and flowers are judged by one standard. Candidates, not recommendations.">
          Scan the market for stronger businesses
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          {countries.map((c) => {
            const s = scans[c];
            const active = country === c;
            return (
              <button
                key={c}
                onClick={() => {
                  setCountry(c);
                  if (!scans[c]) onScan(c);
                }}
                className={`rounded-full px-3.5 py-[6px] text-[12.5px] font-medium border transition-colors ${
                  active
                    ? "bg-series-1 text-white border-series-1"
                    : "bg-surface text-ink-2 border-baseline hover:bg-page"
                }`}
              >
                {c}
                <span className={`ml-1.5 text-[11px] ${active ? "text-white/80" : "text-muted"}`}>
                  {s?.status === "done"
                    ? `✓ ${s.results.length} scored`
                    : s?.status === "running"
                      ? `${s.done}/${s.total}…`
                      : `${UNIVERSES[c].length} names`}
                </span>
              </button>
            );
          })}
          {scan?.status === "done" && (
            <button onClick={() => onScan(country)} className="text-[12px] text-series-1 hover:underline ml-1">
              re-scan
            </button>
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
              <Spinner /> Scoring {country} universe — {scan.done}/{scan.total} (free Yahoo data, ~3 at a time)
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
        {!scan && (
          <p className="text-[12.5px] text-muted mt-3">
            Pick a market above to start a scan (~30–60s on live data; instant on demo data).
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
                            onClick={() => onAddWatch(u)}
                            disabled={watched.has(u.symbol.toUpperCase())}
                            className="text-series-1 hover:underline disabled:text-muted disabled:no-underline px-1"
                            title="Add to watchlist"
                          >
                            {watched.has(u.symbol.toUpperCase()) ? "✓" : "+ watch"}
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
            sub={`The ${country} universe you don't own, ranked by the same 4-pillar scorecard.${scan.errors ? ` ${scan.errors} name(s) failed to fetch and were skipped.` : ""}`}
          >
            Strongest {country} ideas outside your portfolio
          </SectionTitle>
          <Stagger mode="mount">
            <div className="space-y-1.5">
              {shown.map((r, i) => {
                const vm = VERDICT_META[r.verdict];
                const vs = VALUATION_STATUS_META[r.valStatus];
                const sc = r.scorecard;
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
                      {sc.currentPE !== undefined && sc.avgPE !== undefined && (
                        <span className="text-[11.5px] text-ink-2 tnum">
                          P/E {sc.currentPE.toFixed(0)} vs {sc.avgPE.toFixed(0)} avg
                        </span>
                      )}
                      <span className="flex gap-2 ml-auto">
                        <button
                          onClick={() => onAddWatch(r)}
                          disabled={watched.has(r.symbol.toUpperCase())}
                          className="text-[12px] text-series-1 hover:underline disabled:text-muted disabled:no-underline"
                        >
                          {watched.has(r.symbol.toUpperCase()) ? "✓ watching" : "+ watchlist"}
                        </button>
                        <button
                          onClick={() => void copyPrompt(r)}
                          className="text-[12px] text-series-1 hover:underline"
                          title="Copy a full AI research prompt for this stock"
                        >
                          {copied === r.symbol ? "✓ copied" : "AI prompt"}
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
            Universe = a hand-picked starting pond of widely-followed names (edit{" "}
            <code className="text-[10.5px]">lib/universe.ts</code>). High score ≠ buy signal. Watchlist
            names carry no capital; they&apos;re saved on this device with everything else.
          </p>
        </Card>
      )}
    </div>
  );
}
