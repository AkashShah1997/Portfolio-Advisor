"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { AnalyzedHolding } from "@/lib/types";
import { runCustom, SCREENS, toMetricRow, type CustomFilter, type MetricRow } from "@/lib/screens";
import { UNIVERSES, type UniverseCountry } from "@/lib/universe";
import { VERDICT_META } from "@/lib/portfolio";
import { currencyForSymbol, fmtNum, fmtPct } from "@/lib/symbols";
import { buildPrompt } from "@/lib/promptgen";
import { VALUATION_STATUS_META } from "@/lib/valuation";
import { Badge, Card, SectionTitle, Spinner } from "./ui";
import { EASE } from "./anim";
import type { ScanState, ScanResult } from "./DiscoverPanel";

/**
 * Long-term screeners — the classic screens (Coffee Can, Magic Formula, QGLP,
 * GARP, fortress, dividends, buy-zone quality) plus a custom filter builder,
 * run over your market's scanned universe AND your own holdings.
 */
export function ScreenerPanel({
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
  const [active, setActive] = useState<string>("coffee-can");
  const [copied, setCopied] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomFilter>({ minScore: 60 });

  const watched = useMemo(
    () => new Set(rows.filter((r) => r.holding.watch).map((r) => r.holding.yahooSymbol.toUpperCase())),
    [rows]
  );

  const dataset = useMemo<MetricRow[]>(() => {
    const out = new Map<string, MetricRow>();
    for (const c of countries) {
      for (const res of scans[c]?.results ?? []) {
        out.set(res.symbol.toUpperCase(), toMetricRow(res.data, res.scorecard, { fallbackName: res.name, fallbackSector: res.sector }));
      }
    }
    for (const r of rows) {
      if (!r.data || !r.scorecard) continue;
      out.set(r.holding.yahooSymbol.toUpperCase(), toMetricRow(r.data, r.scorecard, { owned: !r.holding.watch, watch: r.holding.watch }));
    }
    return [...out.values()];
  }, [rows, scans, countries]);

  const pending = countries.filter((c) => scans[c]?.status !== "done");
  const running = countries.filter((c) => scans[c]?.status === "running");

  const screen = SCREENS.find((s) => s.id === active);
  const results = useMemo(() => {
    if (!dataset.length) return [];
    if (active === "custom") return runCustom(dataset, custom);
    return screen ? screen.apply(dataset) : [];
  }, [dataset, active, custom, screen]);

  const copyPrompt = async (r: MetricRow) => {
    const cur = currencyForSymbol(r.symbol);
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

  const num = (v: number | undefined, d = 1) => (v === undefined ? "—" : v.toFixed(d));
  const setC = (k: keyof CustomFilter, raw: string, scale = 1) =>
    setCustom((c) => ({ ...c, [k]: raw === "" ? undefined : Number(raw) / scale }));

  return (
    <div className="space-y-4">
      {/* dataset status */}
      <Card className="p-4">
        <SectionTitle sub="Screens run over your holdings plus the scanned market universe — every name scored by the same 4-pillar engine, entirely on your device.">
          Screening universe
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{dataset.length} scored names available</Badge>
          {countries.map((c) => {
            const s = scans[c];
            return (
              <span key={c} className="inline-flex items-center gap-1.5 text-[12.5px]">
                {s?.status === "done" ? (
                  <Badge tone="good" icon="✓">
                    {c}: {s.results.length} scored
                  </Badge>
                ) : s?.status === "running" ? (
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <Spinner /> {c} {s.done}/{s.total}…
                  </span>
                ) : (
                  <button
                    onClick={() => onScan(c)}
                    className="text-series-1 hover:underline font-medium"
                  >
                    + Scan {c} universe ({UNIVERSES[c].length} names)
                  </button>
                )}
              </span>
            );
          })}
        </div>
        {running.length > 0 && (
          <div className="h-[6px] rounded-full bg-page hairline overflow-hidden mt-3">
            <motion.div
              className="h-full bg-series-1 rounded-full"
              animate={{
                width: `${Math.round(
                  (countries.reduce((a, c) => a + (scans[c]?.done ?? 0), 0) /
                    Math.max(1, countries.reduce((a, c) => a + (scans[c]?.total ?? UNIVERSES[c].length), 0))) *
                    100
                )}%`,
              }}
              transition={{ duration: 0.3, ease: EASE }}
            />
          </div>
        )}
        {pending.length > 0 && running.length === 0 && (
          <p className="text-[12px] text-muted mt-2">
            Screens work best after scanning — otherwise they only see your own holdings.
          </p>
        )}
      </Card>

      {/* screen picker */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
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
            <div className={`text-[11px] mt-0.5 ${active === s.id ? "text-white/85" : "text-muted"}`}>
              {s.master}
            </div>
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
            your rules
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
            <SectionTitle sub="Blank = no constraint. Percentages are annual; ROCE uses ROE for financials; D/E is skipped for financials.">
              Custom screen — your rules
            </SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mb-4 text-[12.5px]">
              {(
                [
                  ["Min score /100", "minScore", 1, custom.minScore],
                  ["Min ROCE %", "minRoce", 100, custom.minRoce !== undefined ? custom.minRoce * 100 : undefined],
                  ["Max D/E ×", "maxD2E", 1, custom.maxD2E],
                  ["Min revenue CAGR %", "minRevCagr", 100, custom.minRevCagr !== undefined ? custom.minRevCagr * 100 : undefined],
                  ["Min EPS CAGR %", "minEpsCagr", 100, custom.minEpsCagr !== undefined ? custom.minEpsCagr * 100 : undefined],
                  ["Max P/E ×", "maxPE", 1, custom.maxPE],
                  ["Max PEG ×", "maxPEG", 1, custom.maxPEG],
                  ["Min dividend yield %", "minDivYield", 100, custom.minDivYield !== undefined ? custom.minDivYield * 100 : undefined],
                ] as [string, keyof CustomFilter, number, number | undefined][]
              ).map(([label, key, scale, value]) => (
                <label key={key} className="text-ink-2">
                  {label}
                  <input
                    type="number"
                    value={value ?? ""}
                    onChange={(e) => setC(key, e.target.value, scale)}
                    className="block w-full bg-page hairline rounded-lg px-2 py-1.5 mt-1 tnum"
                  />
                </label>
              ))}
              <label className="text-ink-2 inline-flex items-end gap-1.5 pb-1.5">
                <input
                  type="checkbox"
                  checked={!!custom.onlyBuyZone}
                  onChange={(e) => setCustom((c) => ({ ...c, onlyBuyZone: e.target.checked }))}
                  className="accent-[#2a78d6]"
                />
                in the buy zone only
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
          </>
        )}

        {dataset.length === 0 ? (
          <p className="text-[13px] text-muted">Scan the universe above to populate the screens.</p>
        ) : results.length === 0 ? (
          <p className="text-[13px] text-muted">
            Nothing passes right now. Damani would call that information, not failure — patience is a
            position.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] text-muted border-b border-grid uppercase tracking-wide">
                    <th className="py-1.5 pr-2 font-medium">#</th>
                    <th className="py-1.5 pr-3 font-medium">Company</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Score</th>
                    <th className="py-1.5 pr-3 font-medium text-right">ROCE</th>
                    <th className="py-1.5 pr-3 font-medium text-right">EPS CAGR</th>
                    <th className="py-1.5 pr-3 font-medium text-right">P/E</th>
                    <th className="py-1.5 pr-3 font-medium text-right">PEG</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Yield</th>
                    <th className="py-1.5 pr-3 font-medium text-right">vs fair value</th>
                    <th className="py-1.5 pr-2 font-medium">Verdict</th>
                    <th className="py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 25).map((r, i) => {
                    const vm = VERDICT_META[r.verdict];
                    const vs = VALUATION_STATUS_META[r.valStatus];
                    return (
                      <tr key={r.symbol} className="border-b border-grid/50 hover:bg-page/60">
                        <td className="py-2 pr-2 text-muted tnum">{i + 1}</td>
                        <td className="py-2 pr-3">
                          <div className="font-semibold text-[13px]">
                            {r.symbol}
                            {r.owned && (
                              <Badge tone="neutral">owned</Badge>
                            )}{" "}
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
                        <td className="py-2 pr-3 text-right">
                          <span
                            className={`tnum ${
                              (r.mos ?? -1) >= 0 ? "text-success-text" : "text-ink-2"
                            }`}
                            title={vs.label}
                          >
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
                              onClick={() =>
                                onAddWatch({
                                  symbol: r.symbol,
                                  name: r.name,
                                  sector: r.sector,
                                  score: r.score,
                                  verdict: r.verdict,
                                  data: r.data,
                                  scorecard: r.scorecard,
                                  mos: r.mos,
                                  valStatus: r.valStatus,
                                })
                              }
                              disabled={watched.has(r.symbol.toUpperCase())}
                              className="text-[12px] text-series-1 hover:underline disabled:text-muted disabled:no-underline mr-2.5"
                            >
                              {watched.has(r.symbol.toUpperCase()) ? "✓" : "+ watch"}
                            </button>
                          )}
                          <button
                            onClick={() => void copyPrompt(r)}
                            className="text-[12px] text-series-1 hover:underline"
                          >
                            {copied === r.symbol ? "✓" : "AI prompt"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {results.length > 25 && (
              <p className="text-[11.5px] text-muted mt-2">Showing top 25 of {results.length}.</p>
            )}
          </>
        )}
        <p className="text-[11px] text-muted italic mt-3">
          “vs fair value”: −20% means the price sits 20% BELOW the rough mechanical estimate (a margin
          of safety), + means above it. Screens are starting points — read the business before the
          checklist. High score ≠ buy signal.
        </p>
      </Card>
    </div>
  );
}
