"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { AnalyzedHolding, Currency, FxRates, Verdict } from "@/lib/types";
import { summarize, toBase, VERDICT_META } from "@/lib/portfolio";
import { currencyForSymbol, fmtMoney, fmtPct } from "@/lib/symbols";
import { nextId } from "@/lib/parse";
import { Badge, Card, SectionTitle, Spinner, StatTile } from "./ui";
import { HBars, StackedSplit } from "./charts";
import { StockCard } from "./StockCard";
import { PromptGenerator } from "./PromptGenerator";
import { MastersCard } from "./MastersCard";
import { Matrix } from "./Matrix";
import { DiscoverPanel, type ScanResult } from "./DiscoverPanel";
import { HealthPanel } from "./HealthPanel";
import { Projector } from "./Projector";
import { AnimatedNumber, Stagger, StaggerItem, Switcher } from "./anim";
import ReactMarkdown from "react-markdown";

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
  { id: "ideas", label: "Upgrade ideas" },
  { id: "health", label: "Health & income" },
  { id: "future", label: "Sit-tight projector" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Dashboard({
  rows,
  fxAll,
  aiKey,
  aiModel,
  onBack,
  onRowsChange,
}: {
  rows: AnalyzedHolding[];
  fxAll: Record<Currency, FxRates>;
  aiKey?: string;
  aiModel?: string;
  onBack: () => void;
  onRowsChange: (rows: AnalyzedHolding[]) => void;
}) {
  const [base, setBase] = useState<Currency>("CAD");
  const [sortBy, setSortBy] = useState<"weight" | "score" | "verdict">("verdict");
  const [tab, setTab] = useState<TabId>("overview");
  const [portfolioAi, setPortfolioAi] = useState<{ loading: boolean; text?: string; error?: string }>({
    loading: false,
  });

  const fx = fxAll[base];
  const invRows = useMemo(() => rows.filter((r) => !r.holding.watch), [rows]);
  const watchRows = useMemo(() => rows.filter((r) => r.holding.watch), [rows]);
  const summary = useMemo(() => summarize(invRows, fx), [invRows, fx]);

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

  /** Add a scanned candidate as a watchlist row (no capital, scored + charted). */
  const addWatch = (r: ScanResult): boolean => {
    if (rows.some((x) => x.holding.yahooSymbol.toUpperCase() === r.symbol.toUpperCase())) return false;
    const row: AnalyzedHolding = {
      holding: {
        id: nextId(),
        broker: "manual",
        rawSymbol: r.symbol,
        yahooSymbol: r.symbol,
        name: r.data.quote.name ?? r.name,
        quantity: 0,
        avgCost: 0,
        currency: currencyForSymbol(r.symbol),
        watch: true,
      },
      data: r.data,
      scorecard: r.scorecard,
      invested: 0,
    };
    onRowsChange([...rows, row]);
    return true;
  };

  const removeRow = (id: string) => onRowsChange(rows.filter((x) => x.holding.id !== id));

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
      [JSON.stringify({ generatedAt: new Date().toISOString(), baseCurrency: base, summary, rows }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-analysis-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        <button onClick={onBack} className="text-[13px] text-series-1 hover:underline mr-auto">
          ← Edit holdings / re-analyze
        </button>
        <label className="text-[12px] text-ink-2">
          Base currency{" "}
          <select
            value={base}
            onChange={(e) => setBase(e.target.value as Currency)}
            className="bg-surface hairline rounded px-2 py-1 text-[13px] ml-1"
          >
            <option value="CAD">CAD</option>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="text-[12px] text-ink-2">
          Sort{" "}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="bg-surface hairline rounded px-2 py-1 text-[13px] ml-1"
          >
            <option value="verdict">by action needed</option>
            <option value="weight">by weight</option>
            <option value="score">by score</option>
          </select>
        </label>
        <button onClick={exportJson} className="bg-surface hairline rounded px-3 py-1 text-[13px] hover:bg-page">
          Download JSON
        </button>
        <button onClick={() => window.print()} className="bg-surface hairline rounded px-3 py-1 text-[13px] hover:bg-page">
          Print / PDF
        </button>
      </div>

      {/* headline tiles */}
      <Stagger mode="mount" className="flex flex-wrap gap-3">
        <StaggerItem className="flex-1 min-w-[150px] flex">
          <StatTile
            label={`Current value (${base})`}
            value={<AnimatedNumber value={summary.totalCurrent} format={(v) => fmtMoney(v, base, true)} />}
            hero
          />
        </StaggerItem>
        <StaggerItem className="flex-1 min-w-[150px] flex">
          <StatTile
            label={`Invested (${base})`}
            value={<AnimatedNumber value={summary.totalInvested} format={(v) => fmtMoney(v, base, true)} />}
          />
        </StaggerItem>
        <StaggerItem className="flex-1 min-w-[150px] flex">
          <StatTile
            label="Unrealized P&L"
            value={<AnimatedNumber value={summary.totalPnl} format={(v) => fmtMoney(v, base, true)} />}
            delta={`${summary.totalPnl >= 0 ? "+" : ""}${fmtPct(summary.totalPnlPct)} vs cost`}
            deltaGood={summary.totalPnl >= 0}
          />
        </StaggerItem>
        <StaggerItem className="flex-1 min-w-[150px] flex">
          <StatTile
            label="Portfolio quality score"
            value={<AnimatedNumber value={summary.weightedScore} format={(v) => `${Math.round(v)}/100`} />}
          />
        </StaggerItem>
        <StaggerItem className="flex-1 min-w-[150px] flex">
          <StatTile
            label="Top holding concentration"
            value={fmtPct(summary.topHoldingPct)}
            delta={summary.topHoldingPct > 0.25 ? "concentrated — Buffett approves only if it's your best idea" : "diversified"}
            deltaGood={summary.topHoldingPct <= 0.25}
          />
        </StaggerItem>
      </Stagger>

      {/* tab bar */}
      <div className="flex gap-1 bg-surface hairline rounded-xl p-1 w-fit max-w-full overflow-x-auto no-print">
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
              {t.id === "ideas" && weakCount > 0 && (
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
          <div className="space-y-6">
            {/* verdict summary */}
            <Card className="p-4">
              <SectionTitle sub="What the value-investing scorecard suggests, at a glance. 5-year+ horizon.">
                Action summary
              </SectionTitle>
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
                    <span className="text-ink-2">{failed.map((r) => r.holding.yahooSymbol).join(", ")}</span>
                  </div>
                )}
                {weakCount > 0 && (
                  <p className="text-[12px] text-ink-2 pt-1">
                    <button onClick={() => setTab("ideas")} className="text-series-1 hover:underline no-print">
                      → See same-market businesses that screen stronger than your {weakCount} weakest
                    </button>
                  </p>
                )}
              </div>
            </Card>

            {/* AI prompt generator — take the analysis to any AI */}
            <PromptGenerator rows={rows} summary={summary} fx={fx} baseCurrency={base} />

            {/* the Buffett matrix */}
            <Card className="p-4">
              <SectionTitle sub="Every holding placed by business quality + growth (up) vs valuation margin of safety (right). Bubble = weight. The masters live top-right: wonderful companies at fair prices. Watchlist names appear translucent.">
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
              <SectionTitle sub="Click a card for the full 5-year breakdown: pillar scores, every check with evidence, intrinsic-value band, ratio history, and charts. Watchlist names sit at the end.">
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
                      />
                    </StaggerItem>
                  ))}
                </div>
              </Stagger>
            </div>

            <MastersCard />
          </div>
        )}

        {tab === "ideas" && <DiscoverPanel rows={rows} onAddWatch={addWatch} />}

        {tab === "health" && <HealthPanel rows={rows} fx={fx} base={base} />}

        {tab === "future" && (
          <Projector rows={rows} fx={fx} base={base} startValue={summary.totalCurrent} />
        )}
      </Switcher>

      <p className="text-[11.5px] text-muted leading-relaxed border-t border-grid pt-3">
        FX: {fx.source} · Data: Yahoo Finance (free, unofficial; figures can lag or contain errors — verify before
        acting). This tool encodes public value-investing principles as arithmetic checks. It is analysis to support
        your own judgment, <strong>not financial advice</strong>, and it knows nothing about your taxes, cash needs, or
        risk tolerance.
      </p>
    </div>
  );
}
