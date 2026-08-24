"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyzedHolding, Currency, FxRates, Holding, Scorecard, StockData, Verdict } from "@/lib/types";
import { benchmarkCompare, portfolioSeries, summarize, toBase, VERDICT_META } from "@/lib/portfolio";
import { describeSnowflake, portfolioSnowflake } from "@/lib/snowflake";
import { currencyForSymbol, fmtMoney, fmtPct } from "@/lib/symbols";
import { nextId } from "@/lib/parse";
import { MARKET_META, type Market } from "@/lib/store";
import { candidatesFor, parseCustomSymbols, type CandidateStock, type UniverseCountry } from "@/lib/universe";
import { toMetricRow, type MetricRow } from "@/lib/screens";
import {
  fromLite,
  loadScanLites,
  saveScanLites,
  type ScanMode,
  type ScanState,
} from "@/lib/scancache";
import { Badge, Card, InfoTip, SectionTitle, Spinner } from "./ui";
import { compactMoney, HBars, StackedSplit } from "./charts";
import { Snowflake } from "./Snowflake";
import { StockCard } from "./StockCard";
import { PromptGenerator } from "./PromptGenerator";
import { MastersCard } from "./MastersCard";
import { Matrix } from "./Matrix";
import { DiscoverPanel } from "./DiscoverPanel";
import { DecisionBoard } from "./DecisionBoard";
import { ScreenerPanel } from "./ScreenerPanel";
import { SmartMoney } from "./SmartMoney";
import { ChartPanel } from "./ChartPanel";
import { HealthPanel } from "./HealthPanel";
import { Projector } from "./Projector";
import { AnimatedNumber, Stagger, StaggerItem, Switcher } from "./anim";
import ReactMarkdown from "react-markdown";

/** Full stock payload fetched on demand for prompts / watchlist adds. */
export interface Hydrated {
  data: StockData;
  scorecard: Scorecard;
}

const VERDICT_ORDER: Verdict[] = [
  "REVIEW_EXIT",
  "WATCH",
  "ADD_MORE",
  "HOLD_QUALITY_PRICEY",
  "HOLD",
  "INSUFFICIENT_DATA",
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "decisions", label: "Decisions" },
  { id: "screeners", label: "Screeners" },
  { id: "smart", label: "Smart money" },
  { id: "chart", label: "Chart" },
  { id: "health", label: "Health & income" },
  { id: "future", label: "Projector" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function SeriesTip({
  active,
  payload,
  label,
  base,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string | number;
  base: Currency;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="bg-surface hairline rounded-lg px-3 py-2 shadow-sm text-[12px]">
      <div className="text-ink-2 mb-0.5">{String(label ?? "").slice(0, 7)}</div>
      <div className="font-semibold text-ink tnum">{typeof v === "number" ? fmtMoney(v, base, true) : v}</div>
    </div>
  );
}

function BenchTip({
  active,
  payload,
  label,
  benchLabel,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number | string }>;
  label?: string | number;
  benchLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const val = (k: string) => {
    const v = payload.find((p) => p.dataKey === k)?.value;
    return typeof v === "number" ? v.toFixed(0) : "—";
  };
  return (
    <div className="bg-surface hairline rounded-lg px-3 py-2 shadow-sm text-[12px]">
      <div className="text-ink-2 mb-0.5">{String(label ?? "").slice(0, 7)}</div>
      <div className="tnum">
        <span className="font-semibold text-series-1">You {val("you")}</span>
        <span className="text-muted"> · {benchLabel} {val("bench")}</span>
      </div>
    </div>
  );
}

export function Dashboard({
  market,
  rows,
  fxAll,
  aiKey,
  aiModel,
  onBack,
  onRowsChange,
}: {
  market: Market;
  rows: AnalyzedHolding[];
  fxAll: Record<Currency, FxRates>;
  aiKey?: string;
  aiModel?: string;
  onBack: () => void;
  onRowsChange: (rows: AnalyzedHolding[]) => void;
}) {
  const meta = MARKET_META[market];
  const base = meta.base;
  const fx = fxAll[base];

  const [sortBy, setSortBy] = useState<"weight" | "score" | "verdict">("verdict");
  const [tab, setTab] = useState<TabId>("overview");
  const [portfolioAi, setPortfolioAi] = useState<{ loading: boolean; text?: string; error?: string }>({
    loading: false,
  });

  // ---- shared market scan state (Decisions + Screeners), seeded from the on-device cache ----
  const [scans, setScans] = useState<Record<string, ScanState>>(() => {
    const seeded: Record<string, ScanState> = {};
    for (const key of [...meta.countries, "Custom"]) {
      const lites = loadScanLites(key);
      if (lites.length) {
        seeded[key] = {
          status: "done",
          done: lites.length,
          total: lites.length,
          results: lites.map(fromLite).sort((a, b) => b.score - a.score),
          errors: 0,
          failed: [],
          throttled: false,
          fromCache: true,
        };
      }
    }
    return seeded;
  });
  const runningRef = useRef<Set<string>>(new Set());
  const customCandsRef = useRef<CandidateStock[]>([]);
  const failedRef = useRef<Record<string, string[]>>({});

  const invRows = useMemo(() => rows.filter((r) => !r.holding.watch), [rows]);
  const watchRows = useMemo(() => rows.filter((r) => r.holding.watch), [rows]);
  const summary = useMemo(() => summarize(invRows, fx), [invRows, fx]);
  const series = useMemo(() => portfolioSeries(invRows, fx), [invRows, fx]);
  const pfFlake = useMemo(() => portfolioSnowflake(invRows, fx), [invRows, fx]);

  // ---- hero chart: value vs benchmark (indexed to 100) ----
  const [heroView, setHeroView] = useState<"value" | "bench">("value");
  const [benchRaw, setBenchRaw] = useState<
    Record<string, { time: string; close: number }[] | "error">
  >({});
  const benchSym = meta.benchmark.symbol;
  useEffect(() => {
    if (heroView !== "bench" || benchRaw[benchSym] !== undefined) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve(); // defer past render commit (react-compiler-safe)
      try {
        const res = await fetch(`/api/history/${encodeURIComponent(benchSym)}?range=5y`);
        const j = (await res.json()) as { candles?: { time: string; close: number }[] };
        if (!cancelled)
          setBenchRaw((prev) => ({
            ...prev,
            [benchSym]: Array.isArray(j.candles) && j.candles.length ? j.candles : "error",
          }));
      } catch {
        if (!cancelled) setBenchRaw((prev) => ({ ...prev, [benchSym]: "error" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [heroView, benchSym, benchRaw]);

  const benchCmp = useMemo(() => {
    const raw = benchRaw[benchSym];
    if (!raw || raw === "error" || series.length < 2) return null;
    return benchmarkCompare(series, raw);
  }, [benchRaw, benchSym, series]);
  const benchDelta =
    benchCmp?.youCagr !== undefined && benchCmp?.benchCagr !== undefined
      ? benchCmp.youCagr - benchCmp.benchCagr
      : undefined;

  const ok = useMemo(() => invRows.filter((r) => r.scorecard && r.data), [invRows]);
  const failed = useMemo(() => invRows.filter((r) => r.error || !r.data), [invRows]);
  const weakCount = ok.filter(
    (r) => r.scorecard!.verdict === "WATCH" || r.scorecard!.verdict === "REVIEW_EXIT"
  ).length;

  const sorted = useMemo(() => {
    const arr = [...invRows];
    if (sortBy === "weight") {
      arr.sort(
        (a, b) =>
          toBase(b.currentValue ?? b.invested, b.holding.currency, fx) -
          toBase(a.currentValue ?? a.invested, a.holding.currency, fx)
      );
    } else if (sortBy === "score") {
      arr.sort((a, b) => (b.scorecard?.totalScore ?? -1) - (a.scorecard?.totalScore ?? -1));
    } else {
      arr.sort((a, b) => {
        const av = VERDICT_ORDER.indexOf(a.scorecard?.verdict ?? "INSUFFICIENT_DATA");
        const bv = VERDICT_ORDER.indexOf(b.scorecard?.verdict ?? "INSUFFICIENT_DATA");
        if (av !== bv) return av - bv;
        return (b.scorecard?.totalScore ?? 0) - (a.scorecard?.totalScore ?? 0);
      });
    }
    const watchSorted = [...watchRows].sort(
      (a, b) => (b.scorecard?.totalScore ?? 0) - (a.scorecard?.totalScore ?? 0)
    );
    return [...arr, ...watchSorted];
  }, [invRows, watchRows, sortBy, fx]);

  const allocation = useMemo(
    () =>
      invRows
        .map((r) => ({
          label: r.holding.yahooSymbol,
          value: toBase(r.currentValue ?? r.invested, r.holding.currency, fx),
        }))
        .sort((a, b) => b.value - a.value),
    [invRows, fx]
  );

  const actions = useMemo(() => {
    const list: { verdict: Verdict; items: string[] }[] = [];
    for (const v of VERDICT_ORDER) {
      const items = ok
        .filter((r) => r.scorecard!.verdict === v)
        .sort((a, b) => b.scorecard!.totalScore - a.scorecard!.totalScore)
        .map((r) => r.holding.yahooSymbol);
      if (items.length) list.push({ verdict: v, items });
    }
    return list;
  }, [ok]);

  // ---- scanning machinery ----
  const runScan = useCallback(
    async (key: string, mode: ScanMode = "auto", customText?: string) => {
      if (runningRef.current.has(key)) return;
      const held = rows.map((r) => r.holding.yahooSymbol);
      let cands: CandidateStock[];
      if (key === "Custom") {
        if (customText !== undefined) customCandsRef.current = parseCustomSymbols(customText, held);
        cands = customCandsRef.current;
      } else {
        cands = candidatesFor(key as UniverseCountry, held);
      }

      const prevResults = mode === "force" ? [] : loadScanLites(key).map(fromLite);
      const existing = new Map(prevResults.map((r) => [r.symbol.toUpperCase(), r] as const));

      let target = cands;
      if (mode === "failed") {
        const failedList = failedRef.current[key] ?? [];
        target = cands.filter((x) => failedList.includes(x.symbol));
      } else if (mode === "auto") {
        target = cands.filter((x) => !existing.has(x.symbol.toUpperCase()));
      }

      const publish = (status: ScanState["status"], done: number, total: number, failedNow: string[], throttled: boolean) =>
        setScans((s) => ({
          ...s,
          [key]: {
            status,
            done,
            total,
            results: [...existing.values()].sort((a, b) => b.score - a.score),
            errors: failedNow.length,
            failed: failedNow,
            throttled,
            fromCache: false,
          },
        }));

      if (!target.length) {
        failedRef.current[key] = [];
        publish("done", 0, 0, [], false);
        return;
      }

      runningRef.current.add(key);
      const queue = [...target];
      const failedNow: string[] = [];
      let throttled = false;
      let done = 0;
      const saveBuffer: MetricRow[] = [];
      publish("running", 0, target.length, [], false);

      const worker = async () => {
        while (queue.length) {
          const cand = queue.shift()!;
          try {
            const res = await fetch(`/api/stock/${encodeURIComponent(cand.symbol)}`);
            const j = (await res.json()) as {
              data?: StockData;
              scorecard?: Scorecard;
              error?: string;
              throttled?: boolean;
            };
            if (!res.ok || !j.data || !j.scorecard) {
              if (res.status === 429 || j.throttled) throttled = true;
              throw new Error(j.error ?? `HTTP ${res.status}`);
            }
            const mr = toMetricRow(j.data, j.scorecard, {
              fallbackName: cand.name,
              fallbackSector: cand.sector,
            });
            existing.set(mr.symbol.toUpperCase(), mr);
            saveBuffer.push(mr);
            if (saveBuffer.length >= 5) saveScanLites(key, saveBuffer.splice(0, saveBuffer.length));
          } catch {
            failedNow.push(cand.symbol);
          }
          done++;
          publish("running", done, target.length, [...failedNow], throttled);
          // gentle client-side pacing on top of the server-side queue
          await new Promise((r) => setTimeout(r, 120));
        }
      };
      await Promise.all([worker(), worker()]);
      if (saveBuffer.length) saveScanLites(key, saveBuffer.splice(0, saveBuffer.length));
      failedRef.current[key] = failedNow;
      runningRef.current.delete(key);
      publish("done", done, target.length, failedNow, throttled);
    },
    [rows]
  );

  const hydrate = useCallback(async (symbol: string): Promise<Hydrated | null> => {
    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}`);
      const j = (await res.json()) as { data?: StockData; scorecard?: Scorecard };
      if (!res.ok || !j.data || !j.scorecard) return null;
      return { data: j.data, scorecard: j.scorecard };
    } catch {
      return null;
    }
  }, []);

  /** Add a symbol as a watchlist row (no capital; saved on this device). */
  const addWatch = useCallback(
    async (symbol: string, prefetched?: Hydrated): Promise<boolean> => {
      if (rows.some((x) => x.holding.yahooSymbol.toUpperCase() === symbol.toUpperCase())) return false;
      const full = prefetched ?? (await hydrate(symbol));
      if (!full) return false;
      const row: AnalyzedHolding = {
        holding: {
          id: nextId(),
          broker: "manual",
          rawSymbol: symbol,
          yahooSymbol: symbol,
          name: full.data.quote.name ?? symbol,
          quantity: 0,
          avgCost: 0,
          currency: currencyForSymbol(symbol),
          watch: true,
        },
        data: full.data,
        scorecard: full.scorecard,
        invested: 0,
      };
      onRowsChange([...rows, row]);
      return true;
    },
    [rows, onRowsChange, hydrate]
  );

  const removeRow = (id: string) => onRowsChange(rows.filter((x) => x.holding.id !== id));

  const patchHolding = (id: string, patch: Partial<Holding>) =>
    onRowsChange(rows.map((r) => (r.holding.id === id ? { ...r, holding: { ...r.holding, ...patch } } : r)));

  const runPortfolioAi = async () => {
    if (!aiKey) return;
    setPortfolioAi({ loading: true });
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: aiKey,
          model: aiModel,
          portfolio: {
            baseCurrency: base,
            summary,
            holdings: ok.map((r) => ({
              symbol: r.holding.yahooSymbol,
              name: r.data?.quote.name,
              sector: r.data?.quote.sector,
              weightPct: summary.totalCurrent
                ? (toBase(r.currentValue ?? r.invested, r.holding.currency, fx) / summary.totalCurrent) * 100
                : 0,
              pnlPct: r.pnlPct,
              score: r.scorecard?.totalScore,
              verdict: r.scorecard?.verdict,
              redFlags: r.scorecard?.redFlags,
            })),
          },
        }),
      });
      const j = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !j.text) setPortfolioAi({ loading: false, error: j.error ?? "AI request failed" });
      else setPortfolioAi({ loading: false, text: j.text });
    } catch (e) {
      setPortfolioAi({ loading: false, error: (e as Error).message });
    }
  };

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ generatedAt: new Date().toISOString(), market, baseCurrency: base, summary, rows }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${market}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        <button onClick={onBack} className="text-[13px] text-series-1 hover:underline mr-auto">
          ← Edit holdings / re-import
        </button>
        <label className="text-[12px] text-ink-2">
          Sort cards{" "}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="bg-surface hairline rounded-lg px-2 py-1 text-[13px] ml-1"
          >
            <option value="verdict">by action needed</option>
            <option value="weight">by weight</option>
            <option value="score">by score</option>
          </select>
        </label>
        <button onClick={exportJson} className="bg-surface hairline rounded-lg px-3 py-1 text-[13px] hover:bg-page">
          Download JSON
        </button>
        <button onClick={() => window.print()} className="bg-surface hairline rounded-lg px-3 py-1 text-[13px] hover:bg-page">
          Print / PDF
        </button>
      </div>

      {/* hero band */}
      <Card className="overflow-hidden elev-2">
        <div className="grid lg:grid-cols-[340px_1fr]">
          <div className="p-5 border-b lg:border-b-0 lg:border-r border-grid">
            <div className="text-[12px] text-ink-2">
              {meta.flag} {meta.label} portfolio · current value ({base})
            </div>
            <div className="text-[34px] font-semibold tracking-tight tnum leading-tight mt-1">
              <AnimatedNumber value={summary.totalCurrent} format={(v) => fmtMoney(v, base, true)} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <Badge tone={summary.totalPnl >= 0 ? "good" : "critical"}>
                {summary.totalPnl >= 0 ? "+" : ""}
                {fmtMoney(summary.totalPnl, base, true)} · {fmtPct(summary.totalPnlPct)} vs cost
              </Badge>
              <Badge tone="neutral">invested {fmtMoney(summary.totalInvested, base, true)}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3.5 text-[12.5px] text-ink-2">
              <span>
                Quality score <InfoTip k="score" />{" "}
                <strong className="text-ink tnum">
                  <AnimatedNumber value={summary.weightedScore} format={(v) => `${Math.round(v)}`} />
                  /100
                </strong>
              </span>
              <span>
                Top holding <strong className="text-ink tnum">{fmtPct(summary.topHoldingPct)}</strong>
              </span>
              <span>
                {invRows.length} holdings{watchRows.length ? ` · ${watchRows.length} watched` : ""}
              </span>
            </div>
          </div>
          {series.length > 1 && (
            <div className="p-3 pl-1 min-h-[190px]">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-6 pr-3 pt-1">
                <div className="inline-flex items-center gap-1.5 no-print">
                  <div className="inline-flex bg-page hairline rounded-lg p-0.5 text-[11.5px] font-medium">
                    <button
                      onClick={() => setHeroView("value")}
                      className={`px-2 py-0.5 rounded-md transition-colors ${heroView === "value" ? "bg-series-1 text-white" : "text-ink-2 hover:text-ink"}`}
                      aria-pressed={heroView === "value"}
                    >
                      Value
                    </button>
                    <button
                      onClick={() => setHeroView("bench")}
                      className={`px-2 py-0.5 rounded-md transition-colors ${heroView === "bench" ? "bg-series-1 text-white" : "text-ink-2 hover:text-ink"}`}
                      aria-pressed={heroView === "bench"}
                    >
                      vs {meta.benchmark.label}
                    </button>
                  </div>
                  <InfoTip k="vsBench" />
                </div>
                <div className="text-[11px] text-muted text-right">
                  {heroView === "value"
                    ? `your current holdings, valued over the last ${Math.round(series.length / 12)}y — not account history`
                    : `both indexed to 100 at the common start · price only, dividends excluded on both sides`}
                </div>
              </div>
              {heroView === "value" ? (
                <ResponsiveContainer width="100%" height={158}>
                  <AreaChart data={series} margin={{ top: 6, right: 14, bottom: 0, left: 6 }}>
                    <defs>
                      <linearGradient id="pfv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#2a78d6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#efeee9" strokeWidth={1} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => v.slice(0, 4)}
                      tickLine={false}
                      axisLine={{ stroke: "#e1e0d9" }}
                      minTickGap={110}
                    />
                    <YAxis
                      width={58}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => compactMoney(v, base)}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip content={<SeriesTip base={base} />} cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="value" stroke="#2a78d6" strokeWidth={2} fill="url(#pfv)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : benchCmp && benchCmp.points.length > 1 ? (
                <>
                  <ResponsiveContainer width="100%" height={138}>
                    <LineChart data={benchCmp.points} margin={{ top: 6, right: 14, bottom: 0, left: 6 }}>
                      <CartesianGrid stroke="#efeee9" strokeWidth={1} vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v: string) => v.slice(0, 4)}
                        tickLine={false}
                        axisLine={{ stroke: "#e1e0d9" }}
                        minTickGap={110}
                      />
                      <YAxis
                        width={44}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${Math.round(v)}`}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        content={<BenchTip benchLabel={meta.benchmark.label} />}
                        cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }}
                      />
                      <Line type="monotone" dataKey="you" stroke="#2a78d6" strokeWidth={2.2} dot={false} />
                      <Line
                        type="monotone"
                        dataKey="bench"
                        stroke="#6f6e66"
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 pr-3 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-4 h-[2.5px] bg-series-1 inline-block rounded-full" aria-hidden />
                      Your holdings
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-4 border-t-[2px] border-dashed border-[#6f6e66] inline-block" aria-hidden />
                      {meta.benchmark.label}
                    </span>
                    {benchDelta !== undefined && (
                      <Badge tone={benchDelta >= 0 ? "good" : "warning"}>
                        {benchDelta >= 0 ? "+" : ""}
                        {fmtPct(benchDelta)} /yr vs {meta.benchmark.label}
                        {benchCmp.years ? ` over ${benchCmp.years.toFixed(1)}y` : ""}
                      </Badge>
                    )}
                  </div>
                </>
              ) : benchRaw[benchSym] === "error" ? (
                <p className="text-[12px] text-muted px-6 py-10">
                  Couldn&apos;t fetch {meta.benchmark.label} history right now (often Yahoo throttling) — try again
                  in a minute.
                </p>
              ) : (
                <p className="text-[12.5px] text-ink-2 px-6 py-10">
                  <Spinner /> Fetching {meta.benchmark.label}…
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* tab bar */}
      <div className="flex gap-1 bg-surface hairline rounded-xl p-1 w-fit max-w-full overflow-x-auto no-print elev-1 sticky top-[66px] z-30">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative rounded-lg px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? "text-white" : "text-ink-2 hover:text-ink"
            }`}
            aria-pressed={tab === t.id}
          >
            {tab === t.id && (
              <motion.span
                layoutId="dashboard-tab-pill"
                className="absolute inset-0 bg-series-1 rounded-lg"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10">
              {t.label}
              {t.id === "decisions" && weakCount > 0 && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 py-[1px] ${
                    tab === t.id ? "bg-white/25 text-white" : "bg-status-warning/20 text-[#8a6100]"
                  }`}
                  title={`${weakCount} holding(s) worth re-examining`}
                >
                  {weakCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <Switcher id={tab}>
        {tab === "overview" && (
          <div className="space-y-5">
            {/* verdict summary */}
            <Card className="p-4">
              <SectionTitle sub="What the value-investing scorecard suggests, at a glance. 5-year+ horizon.">
                Action summary
              </SectionTitle>
              <div className={`grid ${pfFlake ? "md:grid-cols-[1fr_250px]" : ""} gap-x-6 gap-y-3 items-center`}>
                <div className="space-y-1.5">
                  {actions.map(({ verdict, items }) => {
                    const vm = VERDICT_META[verdict];
                    return (
                      <div key={verdict} className="flex flex-wrap items-center gap-2 text-[13px]">
                        <Badge tone={vm.tone} icon={vm.icon}>
                          {vm.label}
                        </Badge>
                        <span className="text-ink-2">{items.join(", ")}</span>
                      </div>
                    );
                  })}
                  {failed.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Badge tone="serious" icon="!">
                        No data
                      </Badge>
                      <span className="text-ink-2">
                        {failed.map((r) => r.holding.yahooSymbol).join(", ")} — often Yahoo throttling; go back
                        and re-analyze in a minute.
                      </span>
                    </div>
                  )}
                  <p className="text-[12px] text-ink-2 pt-1">
                    <button onClick={() => setTab("decisions")} className="text-series-1 hover:underline no-print">
                      → Open the full decision board: what to sell, what to accumulate, with every reason
                    </button>
                  </p>
                </div>
                {pfFlake && (
                  <div className="w-full max-w-[260px] mx-auto md:mx-0">
                    <Snowflake axes={pfFlake.axes} size="sm" title="portfolio snowflake" />
                    <p className="text-[11px] text-muted text-center leading-snug">
                      Portfolio snowflake <InfoTip k="snowflake" /> — value-weighted across {pfFlake.covered} scored
                      holding{pfFlake.covered === 1 ? "" : "s"}. {describeSnowflake(pfFlake.axes)}
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* the Buffett matrix */}
            <Card className="p-4">
              <SectionTitle sub="Every holding placed by business quality + growth (up) vs valuation margin of safety (right). Bubble = weight. The masters live top-right. Watchlist names appear translucent.">
                Quality vs price — the Buffett matrix
              </SectionTitle>
              <Matrix rows={rows} fx={fx} base={base} />
            </Card>

            {/* allocation */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="p-4">
                <SectionTitle sub={`Share of current value, in ${base}.`}>Allocation by holding</SectionTitle>
                <HBars items={allocation} format={(v) => fmtMoney(v, base, true)} />
              </Card>
              <div className="space-y-4">
                <Card className="p-4">
                  <SectionTitle>Geography</SectionTitle>
                  <StackedSplit items={summary.byCountry} format={(v) => fmtMoney(v, base, true)} />
                </Card>
                <Card className="p-4">
                  <SectionTitle>Sectors</SectionTitle>
                  <HBars items={summary.bySector} format={(v) => fmtMoney(v, base, true)} maxBars={8} />
                </Card>
              </div>
            </div>

            {/* AI prompt generator */}
            <PromptGenerator rows={rows} summary={summary} fx={fx} baseCurrency={base} />

            {/* portfolio AI */}
            {aiKey && (
              <Card className="p-4">
                <SectionTitle sub="Claude reviews allocation, concentration and the verdict mix through the three masters' lens.">
                  AI portfolio review
                </SectionTitle>
                {!portfolioAi.text && !portfolioAi.loading && (
                  <button onClick={runPortfolioAi} className="text-[13px] font-medium text-series-1 hover:underline">
                    ✦ Generate portfolio-level review
                  </button>
                )}
                {portfolioAi.loading && (
                  <span className="text-[13px] text-ink-2">
                    <Spinner /> Asking Claude…
                  </span>
                )}
                {portfolioAi.error && <p className="text-[12.5px] text-status-critical">{portfolioAi.error}</p>}
                {portfolioAi.text && (
                  <div className="prose prose-sm max-w-none text-[13px] leading-relaxed">
                    <ReactMarkdown>{portfolioAi.text}</ReactMarkdown>
                  </div>
                )}
              </Card>
            )}

            {/* stock cards */}
            <div>
              <SectionTitle sub="Click a card for the full 5-year breakdown: pillar scores, every check with evidence, intrinsic-value band, the since-you-bought fundamentals journey, ratio history, and charts.">
                Holdings — deep dive
              </SectionTitle>
              <Stagger>
                <div className="space-y-3">
                  {sorted.map((r) => (
                    <StaggerItem key={r.holding.id}>
                      <StockCard
                        row={r}
                        aiKey={aiKey}
                        aiModel={aiModel}
                        onRemove={r.holding.watch ? () => removeRow(r.holding.id) : undefined}
                        onPatchHolding={(patch) => patchHolding(r.holding.id, patch)}
                      />
                    </StaggerItem>
                  ))}
                </div>
              </Stagger>
            </div>

            <MastersCard />
          </div>
        )}

        {tab === "decisions" && (
          <div className="space-y-5">
            <DecisionBoard rows={rows} fx={fx} base={base} />
            <DiscoverPanel
              rows={rows}
              countries={meta.countries}
              scans={scans}
              onScan={(key, mode) => void runScan(key, mode)}
              onAddWatch={addWatch}
              hydrate={hydrate}
            />
          </div>
        )}

        {tab === "screeners" && (
          <ScreenerPanel
            rows={rows}
            countries={meta.countries}
            scans={scans}
            onScan={(key, mode) => void runScan(key, mode)}
            onScanCustom={(text) => void runScan("Custom", "force", text)}
            onAddWatch={addWatch}
            hydrate={hydrate}
          />
        )}

        {tab === "smart" && <SmartMoney rows={rows} market={market} onAddWatch={(s) => addWatch(s)} />}

        {tab === "chart" && <ChartPanel rows={rows} />}

        {tab === "health" && <HealthPanel rows={rows} fx={fx} base={base} />}

        {tab === "future" && <Projector rows={rows} fx={fx} base={base} startValue={summary.totalCurrent} />}
      </Switcher>

      <p className="text-[11.5px] text-muted leading-relaxed border-t border-grid pt-3">
        FX: {fx.source} · Data: Yahoo Finance (free, unofficial; figures can lag or contain errors — verify before
        acting). Everything you import stays in this browser. This tool encodes public value-investing principles as
        arithmetic checks; it is analysis to support your own judgment, <strong>not financial advice</strong>, and it
        knows nothing about your taxes, cash needs, or risk tolerance.
      </p>
    </div>
  );
}
