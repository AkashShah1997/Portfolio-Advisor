"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AnalyzedHolding, Broker, Currency, FxRates, Holding, Scorecard, StockData } from "@/lib/types";
import { currencyForSymbol } from "@/lib/symbols";
import { nextId } from "@/lib/parse";
import { parseBrokerCsv } from "@/lib/parse";
import {
  clearHoldings,
  loadHoldings,
  loadMarket,
  MARKET_META,
  saveHoldings,
  saveMarket,
  type Market,
} from "@/lib/store";
import { TopBar } from "@/components/TopBar";
import { MarketLanding } from "@/components/MarketLanding";
import { ImportScreen } from "@/components/ImportScreen";
import { Dashboard } from "@/components/Dashboard";
import { Card, SectionTitle, Spinner } from "@/components/ui";
import { EASE, MotionRoot } from "@/components/anim";

type Step = "import" | "analyzing" | "done";

const SAMPLES: Record<Market, Array<[string, string, number, number]>> = {
  india: [
    ["RELIANCE", "RELIANCE.NS", 40, 2450],
    ["TCS", "TCS.NS", 25, 3600],
    ["HDFCBANK", "HDFCBANK.NS", 60, 1520],
    ["INFY", "INFY.NS", 30, 1450],
    ["TATAMOTORS", "TATAMOTORS.NS", 100, 640],
    ["ITC", "ITC.NS", 200, 415],
  ],
  canada: [
    ["SHOP", "SHOP.TO", 15, 95],
    ["RY", "RY.TO", 20, 135],
    ["ENB", "ENB.TO", 45, 49],
    ["CNR", "CNR.TO", 12, 155],
    ["AAPL", "AAPL", 10, 175],
    ["MSFT", "MSFT", 6, 330],
  ],
};

interface ProgressRow {
  symbol: string;
  status: "queued" | "fetching" | "ok" | "error";
  note?: string;
}

const stepAnim = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3, ease: EASE },
};

type PerMarket<T> = Record<Market, T>;
const per = <T,>(v: T): PerMarket<T> => ({ india: structuredClone(v), canada: structuredClone(v) });

export default function Home() {
  const [booted, setBooted] = useState(false);
  const [market, setMarket] = useState<Market | null>(null);
  const [holdingsBy, setHoldingsBy] = useState<PerMarket<Holding[]>>(per<Holding[]>([]));
  const [restoredBy, setRestoredBy] = useState<PerMarket<boolean>>(per(false));
  const [warningsBy, setWarningsBy] = useState<PerMarket<string[]>>(per<string[]>([]));
  const [stepBy, setStepBy] = useState<PerMarket<Step>>(per<Step>("import"));
  const [rowsBy, setRowsBy] = useState<PerMarket<AnalyzedHolding[]>>(per<AnalyzedHolding[]>([]));
  const [fatalBy, setFatalBy] = useState<PerMarket<string | null>>(per<string | null>(null));
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [fxAll, setFxAll] = useState<Record<Currency, FxRates> | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("claude-sonnet-4-5");
  const [showAi, setShowAi] = useState(false);
  const abortRef = useRef(false);

  // boot: restore market + holdings from this device
  useEffect(() => {
    const india = loadHoldings("india") ?? [];
    const canada = loadHoldings("canada") ?? [];
    setHoldingsBy({ india, canada });
    setRestoredBy({ india: india.length > 0, canada: canada.length > 0 });
    setMarket(loadMarket());
    setBooted(true);
  }, []);

  const persistHoldings = useCallback((m: Market, holdings: Holding[]) => {
    setHoldingsBy((prev) => ({ ...prev, [m]: holdings }));
    saveHoldings(m, holdings);
  }, []);

  const chooseMarket = (m: Market) => {
    setMarket(m);
    saveMarket(m);
  };

  const goHome = () => {
    setMarket(null);
    saveMarket(null);
  };

  const onFile = (m: Market) => (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const res = parseBrokerCsv(text, MARKET_META[m].broker);
      // replace positions, keep the watchlist
      const watch = holdingsBy[m].filter((h) => h.watch);
      persistHoldings(m, [...res.holdings, ...watch]);
      setWarningsBy((prev) => ({ ...prev, [m]: res.warnings }));
    };
    reader.readAsText(file);
  };

  const loadSample = (m: Market) => {
    const broker: Broker = MARKET_META[m].broker;
    const watch = holdingsBy[m].filter((h) => h.watch);
    persistHoldings(m, [
      ...SAMPLES[m].map(([raw, ysym, qty, avg]) => ({
        id: nextId(),
        broker,
        rawSymbol: raw,
        yahooSymbol: ysym,
        quantity: qty,
        avgCost: avg,
        currency: currencyForSymbol(ysym),
      })),
      ...watch,
    ]);
    setWarningsBy((prev) => ({ ...prev, [m]: [] }));
  };

  const eraseMarket = (m: Market) => {
    clearHoldings(m);
    setHoldingsBy((prev) => ({ ...prev, [m]: [] }));
    setRestoredBy((prev) => ({ ...prev, [m]: false }));
    setRowsBy((prev) => ({ ...prev, [m]: [] }));
    setStepBy((prev) => ({ ...prev, [m]: "import" }));
  };

  const analyze = async (m: Market) => {
    const all = holdingsBy[m];
    const targets = all.filter((h) => h.yahooSymbol && (h.quantity > 0 || h.watch));
    if (!targets.length) return;
    setFatalBy((prev) => ({ ...prev, [m]: null }));
    abortRef.current = false;
    setStepBy((prev) => ({ ...prev, [m]: "analyzing" }));
    setProgress(targets.map((h) => ({ symbol: h.yahooSymbol, status: "queued" })));

    let fx = fxAll;
    if (!fx) {
      try {
        const [cad, inr, usd] = await Promise.all(
          (["CAD", "INR", "USD"] as Currency[]).map(async (b) => {
            const r = await fetch(`/api/fx?base=${b}`);
            if (!r.ok) throw new Error(`FX fetch failed (${b})`);
            return (await r.json()) as FxRates;
          })
        );
        fx = { CAD: cad, INR: inr, USD: usd };
        setFxAll(fx);
      } catch (e) {
        setFatalBy((prev) => ({
          ...prev,
          [m]: `Could not fetch currency rates: ${(e as Error).message}. Try again in a minute.`,
        }));
        setStepBy((prev) => ({ ...prev, [m]: "import" }));
        return;
      }
    }

    const results: AnalyzedHolding[] = [];
    const queue = [...targets];
    const CONCURRENCY = 3;

    const worker = async () => {
      while (queue.length && !abortRef.current) {
        const h = queue.shift()!;
        setProgress((p) => p.map((r) => (r.symbol === h.yahooSymbol ? { ...r, status: "fetching" } : r)));
        const invested = h.watch ? 0 : h.quantity * h.avgCost;
        try {
          const res = await fetch(`/api/stock/${encodeURIComponent(h.yahooSymbol)}`);
          const j = (await res.json()) as { data?: StockData; scorecard?: Scorecard; error?: string };
          if (!res.ok || !j.data) throw new Error(j.error ?? `HTTP ${res.status}`);
          const price = j.data.quote.price;
          const currentValue = !h.watch && price !== undefined ? h.quantity * price : undefined;
          results.push({
            holding: { ...h, name: h.name ?? j.data.quote.name },
            data: j.data,
            scorecard: j.scorecard,
            invested,
            currentValue,
            pnl: currentValue !== undefined ? currentValue - invested : undefined,
            pnlPct:
              currentValue !== undefined && invested > 0 ? (currentValue - invested) / invested : undefined,
          });
          setProgress((p) => p.map((r) => (r.symbol === h.yahooSymbol ? { ...r, status: "ok" } : r)));
        } catch (e) {
          results.push({ holding: h, invested, error: (e as Error).message });
          setProgress((p) =>
            p.map((r) => (r.symbol === h.yahooSymbol ? { ...r, status: "error", note: (e as Error).message } : r))
          );
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // keep original ordering: positions first (by import order), then watchlist
    const orderIndex = new Map(all.map((h, i) => [h.id, i] as const));
    results.sort((a, b) => (orderIndex.get(a.holding.id) ?? 0) - (orderIndex.get(b.holding.id) ?? 0));

    setRowsBy((prev) => ({ ...prev, [m]: results }));
    setStepBy((prev) => ({ ...prev, [m]: "done" }));
  };

  const onRowsChange = (m: Market) => (rows: AnalyzedHolding[]) => {
    setRowsBy((prev) => ({ ...prev, [m]: rows }));
    persistHoldings(m, rows.map((r) => r.holding));
  };

  const step = market ? stepBy[market] : "import";

  return (
    <MotionRoot>
      <TopBar market={market} onMarket={chooseMarket} onHome={goHome} />
      <main className="flex-1 page-glow">
        {!booted ? (
          <div className="max-w-6xl mx-auto px-4 py-20 text-center text-muted text-[13px]">
            <Spinner />
          </div>
        ) : market === null ? (
          <MarketLanding
            onPick={chooseMarket}
            savedCounts={{
              india: holdingsBy.india.filter((h) => !h.watch).length,
              canada: holdingsBy.canada.filter((h) => !h.watch).length,
            }}
          />
        ) : (
          <div className="max-w-6xl mx-auto px-4 py-6">
            <AnimatePresence mode="wait" initial={false}>
              {step === "import" && (
                <motion.div key={`${market}-import`} {...stepAnim}>
                  <ImportScreen
                    market={market}
                    holdings={holdingsBy[market]}
                    warnings={warningsBy[market]}
                    restored={restoredBy[market]}
                    fatal={fatalBy[market]}
                    aiKey={aiKey}
                    aiModel={aiModel}
                    showAi={showAi}
                    onShowAi={setShowAi}
                    onAiKey={setAiKey}
                    onAiModel={setAiModel}
                    onFile={onFile(market)}
                    onHoldingsChange={(h) => persistHoldings(market, h)}
                    onLoadSample={() => loadSample(market)}
                    onAnalyze={() => void analyze(market)}
                    onErase={() => eraseMarket(market)}
                  />
                </motion.div>
              )}

              {step === "analyzing" && (
                <motion.div key={`${market}-analyzing`} {...stepAnim}>
                  <Card className="p-5">
                    <SectionTitle sub="Fetching 5 years of statements, ratios and prices per stock from Yahoo Finance (free API — a large portfolio takes a minute).">
                      Analyzing {progress.length} {MARKET_META[market].label} holdings…
                    </SectionTitle>
                    <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                      {progress.map((p, i) => (
                        <motion.li
                          key={p.symbol}
                          className="flex items-center gap-2 text-[13px]"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25, ease: EASE, delay: Math.min(i * 0.03, 0.6) }}
                        >
                          {p.status === "queued" && <span className="w-3.5 text-muted">·</span>}
                          {p.status === "fetching" && <Spinner />}
                          {p.status === "ok" && <span className="w-3.5 text-success-text font-bold">✓</span>}
                          {p.status === "error" && <span className="w-3.5 text-status-critical font-bold">✕</span>}
                          <span className="tnum">{p.symbol}</span>
                          {p.note && <span className="text-[11px] text-muted truncate">{p.note}</span>}
                        </motion.li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        abortRef.current = true;
                      }}
                      className="mt-4 text-[12.5px] text-ink-2 hover:underline"
                    >
                      Cancel
                    </button>
                  </Card>
                </motion.div>
              )}

              {step === "done" && fxAll && (
                <motion.div key={`${market}-done`} {...stepAnim}>
                  <Dashboard
                    key={market}
                    market={market}
                    rows={rowsBy[market]}
                    fxAll={fxAll}
                    aiKey={aiKey.startsWith("sk-ant-") ? aiKey : undefined}
                    aiModel={aiModel}
                    onBack={() => setStepBy((prev) => ({ ...prev, [market]: "import" }))}
                    onRowsChange={onRowsChange(market)}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <footer className="mt-10 text-[11px] text-muted no-print">
              Built for long-horizon investors. Not affiliated with Zerodha, Wealthsimple or Yahoo. Everything
              stays on this device. Analysis ≠ advice.
            </footer>
          </div>
        )}
      </main>
    </MotionRoot>
  );
}
