"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { AnalyzedHolding, Currency } from "@/lib/types";
import {
  CONSENSUS_MIN,
  consensusOf,
  runCustom,
  SCREENS,
  toMetricRow,
  type CustomFilter,
  type MetricRow,
} from "@/lib/screens";
import { UNIVERSES, type UniverseCountry } from "@/lib/universe";
import { VERDICT_META } from "@/lib/portfolio";
import { currencyForSymbol, fmtNum, fmtPct } from "@/lib/symbols";
import { buildPrompt } from "@/lib/promptgen";
import { VALUATION_STATUS_META } from "@/lib/valuation";
import type { ScanMode, ScanState } from "@/lib/scancache";
import type { Hydrated } from "./Dashboard";
import { Badge, Card, InfoTip, SectionTitle, Spinner } from "./ui";
import { EASE } from "./anim";

/**
 * Long-term screeners — classic screens (Two-year keepers, Coffee Can, Magic
 * Formula, QGLP, GARP, fortress, dividends, buy-zone) plus a raw-fundamentals
 * custom builder, run over the scanned market universe, any pasted list, and
 * your own holdings.
 */
export function ScreenerPanel({
  rows,
  countries,
  scans,
  onScan,
  onScanCustom,
  onAddWatch,
  hydrate,
}: {
  rows: AnalyzedHolding[];
  countries: UniverseCountry[];
  scans: Record<string, ScanState>;
  onScan: (key: string, mode?: ScanMode) => void;
  onScanCustom: (text: string) => void;
  onAddWatch: (symbol: string, prefetched?: Hydrated) => Promise<boolean>;
  hydrate: (symbol: string) => Promise<Hydrated | null>;
}) {
  const [active, setActive] = useState<string>("two-year");
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [customList, setCustomList] = useState("");
  const [custom, setCustom] = useState<CustomFilter>({ minScore: 60 });

  const watched = useMemo(
    () => new Set(rows.filter((r) => r.holding.watch).map((r) => r.holding.yahooSymbol.toUpperCase())),
    [rows]
  );

  const scanKeys = useMemo(() => [...countries, "Custom"], [countries]);

  const dataset = useMemo<MetricRow[]>(() => {
    const out = new Map<string, MetricRow>();
    for (const key of scanKeys) {
      for (const res of scans[key]?.results ?? []) out.set(res.symbol.toUpperCase(), res);
    }
    for (const r of rows) {
      if (!r.data || !r.scorecard) continue;
      out.set(
        r.holding.yahooSymbol.toUpperCase(),
        toMetricRow(r.data, r.scorecard, { owned: !r.holding.watch, watch: r.holding.watch })
      );
    }
    return [...out.values()];
  }, [rows, scans, scanKeys]);

  const anyRunning = scanKeys.some((k) => scans[k]?.status === "running");
  const totalFailed = scanKeys.reduce((a, k) => a + (scans[k]?.status === "done" ? scans[k].failed.length : 0), 0);
  const anyThrottled = scanKeys.some((k) => scans[k]?.throttled);

  const screen = SCREENS.find((s) => s.id === active);
  const results = useMemo(() => {
    if (!dataset.length) return [];
    if (active === "custom") return runCustom(dataset, custom);
    return screen ? screen.apply(dataset) : [];
  }, [dataset, active, custom, screen]);

  // the "almost every buy list" strip — top names by screen agreement
  const topConsensus = useMemo(() => {
    if (!dataset.length) return [];
    const c = consensusOf(dataset);
    return [...c.entries()]
      .filter(([, e]) => e.count >= CONSENSUS_MIN)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([sym, e]) => ({ sym, ...e }));
  }, [dataset]);

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
          id: `screen-${r.symbol}`,
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

  const num = (v: number | undefined, d = 1) => (v === undefined ? "—" : v.toFixed(d));
  const setC = (k: keyof CustomFilter, raw: string, scale = 1) =>
    setCustom((c) => ({ ...c, [k]: raw === "" ? undefined : Number(raw) / scale }));

  return (
    <div className="space-y-4">
      {/* dataset status */}
      <Card className="p-4">
        <SectionTitle sub="Screens run over your holdings + the scanned market universe + any pasted list — every name scored by the same 4-pillar engine, cached on this device for 24h.">
          Screening universe
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={dataset.length ? "neutral" : "warning"}>{dataset.length} scored names available</Badge>
          {countries.map((cKey) => {
            const s = scans[cKey];
            return (
              <span key={cKey} className="inline-flex items-center gap-1.5 text-[12.5px]">
                {s?.status === "running" ? (
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <Spinner /> {cKey} {s.done}/{s.total}…
                  </span>
                ) : s && s.results.length ? (
                  <>
                    <Badge tone="good" icon="✓">
                      {cKey}: {s.results.length} scored{s.fromCache ? " (cached)" : ""}
                    </Badge>
                    <button onClick={() => onScan(cKey, "auto")} className="text-series-1 hover:underline" title="Fetch missing / stale names">
                      refresh
                    </button>
                  </>
                ) : (
                  <button onClick={() => onScan(cKey)} className="text-series-1 hover:underline font-medium">
                    + Scan {cKey} ({UNIVERSES[cKey].length} names)
                  </button>
                )}
              </span>
            );
          })}
          {scans["Custom"] && scans["Custom"].results.length > 0 && (
            <Badge tone="good" icon="✓">
              Custom list: {scans["Custom"].results.length} scored
            </Badge>
          )}
        </div>

        {anyRunning && (
          <div className="h-[6px] rounded-full bg-page hairline overflow-hidden mt-3">
            <motion.div
              className="h-full bg-series-1 rounded-full"
              animate={{
                width: `${Math.round(
                  (scanKeys.reduce((a, k) => a + (scans[k]?.done ?? 0), 0) /
                    Math.max(1, scanKeys.reduce((a, k) => a + (scans[k]?.total ?? 0), 0))) * 100
                )}%`,
              }}
              transition={{ duration: 0.3, ease: EASE }}
            />
          </div>
        )}

        {totalFailed > 0 && !anyRunning && (
          <div className="flex flex-wrap items-center gap-2 mt-3 text-[12.5px] bg-status-warning/10 border border-status-warning/40 rounded-lg px-3 py-2">
            <span className="text-[#8a6100]">
              {totalFailed} name{totalFailed === 1 ? "" : "s"} failed to fetch
              {anyThrottled ? " — Yahoo was rate-limiting; wait ~1 minute" : ""}.
            </span>
            {scanKeys
              .filter((k) => (scans[k]?.failed.length ?? 0) > 0)
              .map((k) => (
                <button key={k} onClick={() => onScan(k, "failed")} className="text-series-1 font-medium hover:underline">
                  ↻ Retry {k}
                </button>
              ))}
          </div>
        )}

        {/* buy-list consensus strip */}
        {topConsensus.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-[12px] font-semibold text-ink-2">Almost every buy-list agrees on:</span>
            {topConsensus.map((t) => (
              <button
                key={t.sym}
                onClick={() => setActive("consensus")}
                className="inline-flex items-center gap-1.5 bg-status-good/8 border border-status-good/30 rounded-full px-2.5 py-[3px] text-[12px] hover:-translate-y-[1px] transition-transform"
                title={`${t.count} of 8 screens: ${t.screens.join(", ")}`}
              >
                <strong className="text-success-text">{t.sym.replace(/\.(NS|BO|TO|V)$/i, "")}</strong>
                <span className="text-ink-2 tnum">×{t.count}</span>
              </button>
            ))}
            <button onClick={() => setActive("consensus")} className="text-[12px] text-series-1 hover:underline">
              see the shortlist →
            </button>
          </div>
        )}

        {/* custom list scan */}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-[12px] text-ink-2 flex-1 min-w-[260px]">
            Scan your own list (any Yahoo symbols — comma / space separated, ≤100)
            <input
              value={customList}
              onChange={(e) => setCustomList(e.target.value)}
              placeholder="e.g. ASIANPAINT.NS, CDSL.NS, GSY.TO, COST"
              className="block w-full bg-page hairline rounded-lg px-2.5 py-1.5 mt-1 text-[12.5px]"
              onKeyDown={(e) => e.key === "Enter" && customList.trim() && onScanCustom(customList)}
            />
          </label>
          <button
            onClick={() => customList.trim() && onScanCustom(customList)}
            disabled={!customList.trim() || anyRunning}
            className="bg-series-1 text-white rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
          >
            Scan list
          </button>
        </div>
      </Card>

      {/* screen picker */}
      <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {SCREENS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`text-left rounded-xl p-3 border transition-all ${
              active === s.id
                ? "bg-series-1 text-white border-series-1 elev-1"
                : "bg-surface hairline text-ink hover:-translate-y-[1px]"
            }`}
          >
            <div className="text-[13px] font-semibold leading-tight">{s.name}</div>
            <div className={`text-[11px] mt-0.5 ${active === s.id ? "text-white/85" : "text-muted"}`}>{s.master}</div>
          </button>
        ))}
        <button
          onClick={() => setActive("custom")}
          className={`text-left rounded-xl p-3 border transition-all ${
            active === "custom"
              ? "bg-series-1 text-white border-series-1 elev-1"
              : "bg-surface hairline text-ink hover:-translate-y-[1px]"
          }`}
        >
          <div className="text-[13px] font-semibold leading-tight">Custom screen</div>
          <div className={`text-[11px] mt-0.5 ${active === "custom" ? "text-white/85" : "text-muted"}`}>
            your fundamentals rules
          </div>
        </button>
      </div>

      {/* active screen */}
      <Card className="p-4">
        {active !== "custom" && screen && (
          <SectionTitle sub={`${screen.blurb} — ${screen.criteria}.`}>
            {screen.name} <span className="text-[12px] font-normal text-muted">· {screen.master}</span>
          </SectionTitle>
        )}
        {active === "custom" && (
          <>
            <SectionTitle sub="Blank = no constraint. Percentages are annual. ROCE uses ROE for financials; D/E and interest cover are skipped for financials. “P/E at least” filters out too-cheap-to-be-true traps.">
              Custom screen — raw fundamentals, your thresholds
            </SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mb-3 text-[12.5px]">
              {(
                [
                  ["Min score /100", "minScore", 1, "score"],
                  ["Min ROCE %", "minRoce", 100, "roce"],
                  ["Min revenue CAGR %", "minRevCagr", 100, "revCagr"],
                  ["Min EPS CAGR %", "minEpsCagr", 100, "epsCagr"],
                  ["P/E at least ×", "minPE", 1, "pe"],
                  ["P/E at most ×", "maxPE", 1, "pe"],
                  ["Max PEG ×", "maxPEG", 1, "peg"],
                  ["Max P/B ×", "maxPB", 1, "pb"],
                  ["Max D/E ×", "maxD2E", 1, "d2e"],
                  ["Min interest cover ×", "minIcr", 1, "icr"],
                  ["Min dividend yield %", "minDivYield", 100, "divYield"],
                  ["Max payout %", "maxPayout", 100, "payout"],
                  ["Min FCF yield %", "minFcfYield", 100, "fcfYield"],
                  ["Min market cap (B)", "minMarketCapB", 1, "marketCap"],
                  ["Max red flags", "maxRedFlags", 1, "flags"],
                ] as [string, keyof CustomFilter, number, string][]
              ).map(([label, key, scale, gkey]) => {
                const v = custom[key];
                return (
                  <label key={`${key}-${label}`} className="text-ink-2">
                    {label} <InfoTip k={gkey} />
                    <input
                      type="number"
                      step="any"
                      value={typeof v === "number" ? Number((v * scale).toPrecision(6)) : ""}
                      onChange={(e) => setC(key, e.target.value, scale)}
                      className="block w-full bg-page hairline rounded-lg px-2 py-1.5 mt-1 tnum"
                    />
                  </label>
                );
              })}
              <label className="text-ink-2 inline-flex items-end gap-1.5 pb-1.5">
                <input
                  type="checkbox"
                  checked={!!custom.noLossYears}
                  onChange={(e) => setCustom((c) => ({ ...c, noLossYears: e.target.checked }))}
                  className="accent-[#2a78d6]"
                />
                no loss years (5y) <InfoTip k="lossYears" />
              </label>
              <label className="text-ink-2 inline-flex items-end gap-1.5 pb-1.5">
                <input
                  type="checkbox"
                  checked={!!custom.onlyBuyZone}
                  onChange={(e) => setCustom((c) => ({ ...c, onlyBuyZone: e.target.checked }))}
                  className="accent-[#2a78d6]"
                />
                in the buy zone only <InfoTip k="buyZone" />
              </label>
              <label className="text-ink-2 inline-flex items-end gap-1.5 pb-1.5">
                <input
                  type="checkbox"
                  checked={!!custom.excludeOwned}
                  onChange={(e) => setCustom((c) => ({ ...c, excludeOwned: e.target.checked }))}
                  className="accent-[#2a78d6]"
                />
                exclude what I own
              </label>
            </div>
            <p className="text-[11.5px] text-muted mb-3">
              A sensible “minimum 2-year hold” template: score ≥ 60 · EPS CAGR ≥ 8% · interest cover ≥ 4 ·
              max red flags 0 · no loss years — or just use the <strong>Two-year keepers</strong> preset.
            </p>
          </>
        )}

        {dataset.length === 0 ? (
          <p className="text-[13px] text-muted">
            Scan a market (or paste a list) above to populate the screens — your own analyzed holdings are
            included automatically.
          </p>
        ) : results.length === 0 ? (
          <p className="text-[13px] text-muted">
            Nothing passes right now. Damani would call that information, not failure — patience is a position.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] text-muted border-b border-grid uppercase tracking-wide">
                    <th className="py-1.5 pr-2 font-medium">#</th>
                    <th className="py-1.5 pr-3 font-medium">Company</th>
                    <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">
                      Score <InfoTip k="score" />
                    </th>
                    <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">
                      ROCE <InfoTip k="roce" />
                    </th>
                    <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">
                      EPS CAGR <InfoTip k="epsCagr" />
                    </th>
                    <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">
                      P/E <InfoTip k="pe" />
                    </th>
                    <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">
                      PEG <InfoTip k="peg" />
                    </th>
                    <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">
                      Yield <InfoTip k="divYield" />
                    </th>
                    <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">
                      Flags <InfoTip k="flags" />
                    </th>
                    <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">
                      vs fair value <InfoTip k="mos" />
                    </th>
                    <th className="py-1.5 pr-2 font-medium whitespace-nowrap">
                      Verdict <InfoTip k="verdict" />
                    </th>
                    <th className="py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 30).map((r, i) => {
                    const vm = VERDICT_META[r.verdict];
                    const vs = VALUATION_STATUS_META[r.valStatus];
                    return (
                      <tr key={r.symbol} className="border-b border-grid/50 hover:bg-page/60">
                        <td className="py-2 pr-2 text-muted tnum">{i + 1}</td>
                        <td className="py-2 pr-3">
                          <div className="font-semibold text-[13px]">
                            {r.symbol} {r.owned && <Badge tone="neutral">owned</Badge>}{" "}
                            {r.watch && <Badge tone="muted">☆ watch</Badge>}
                          </div>
                          <div className="text-[11px] text-muted truncate max-w-[220px]">
                            {r.name} · {r.sector}
                            {r.rankNote ? ` · ${r.rankNote}` : ""}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold tnum text-[14px]">{r.score}</td>
                        <td className="py-2 pr-3 text-right tnum">{fmtPct(r.isFin ? r.roeAvg : r.roceAvg, 0)}</td>
                        <td className="py-2 pr-3 text-right tnum">{fmtPct(r.epsCagr, 0)}</td>
                        <td className="py-2 pr-3 text-right tnum">{num(r.pe)}</td>
                        <td className="py-2 pr-3 text-right tnum">{num(r.peg, 2)}</td>
                        <td className="py-2 pr-3 text-right tnum">{fmtPct(r.divYield)}</td>
                        <td className="py-2 pr-3 text-right tnum">
                          {r.redFlags === 0 ? <span className="text-success-text">0 ✓</span> : <span className="text-status-critical">{r.redFlags} ⚑</span>}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <span className={`tnum ${(r.mos ?? -1) >= 0 ? "text-success-text" : "text-ink-2"}`} title={vs.label}>
                            {r.mos === undefined ? "—" : `${r.mos >= 0 ? "-" : "+"}${fmtNum(Math.abs(r.mos) * 100, 0)}%`}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          <Badge tone={vm.tone} icon={vm.icon}>
                            {vm.label}
                          </Badge>
                        </td>
                        <td className="py-2 whitespace-nowrap text-right">
                          {!r.owned && (
                            <button
                              onClick={() => void addWatch(r)}
                              disabled={watched.has(r.symbol.toUpperCase()) || busy === `w:${r.symbol}`}
                              className="text-[12px] text-series-1 hover:underline disabled:text-muted disabled:no-underline mr-2.5"
                            >
                              {watched.has(r.symbol.toUpperCase()) ? "✓" : busy === `w:${r.symbol}` ? "…" : "+ watch"}
                            </button>
                          )}
                          <button
                            onClick={() => void copyPrompt(r)}
                            disabled={busy === `p:${r.symbol}`}
                            className="text-[12px] text-series-1 hover:underline disabled:text-muted"
                          >
                            {copied === r.symbol ? "✓" : busy === `p:${r.symbol}` ? "…" : "AI prompt"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {results.length > 30 && (
              <p className="text-[11.5px] text-muted mt-2">Showing top 30 of {results.length}.</p>
            )}
          </>
        )}
        <p className="text-[11px] text-muted italic mt-3">
          “vs fair value”: −20% means the price sits 20% BELOW the rough mechanical estimate (a margin of
          safety), + means above it. Screens are starting points — read the business before the checklist.
          High score ≠ buy signal.
        </p>
      </Card>
    </div>
  );
}
