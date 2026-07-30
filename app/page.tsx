"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AnalyzedHolding, Broker, Currency, FxRates, Holding, Scorecard, StockData } from "@/lib/types";
import { currencyForSymbol } from "@/lib/symbols";
import { nextId } from "@/lib/parse";
import { ImportPanel } from "@/components/ImportPanel";
import { HoldingsTable } from "@/components/HoldingsTable";
import { Dashboard } from "@/components/Dashboard";
import { MastersCard } from "@/components/MastersCard";
import { Badge, Card, SectionTitle, Spinner } from "@/components/ui";
import { EASE, FadeUp, MotionRoot } from "@/components/anim";

type Step = "import" | "analyzing" | "done";

const SAMPLE: Array<[string, string, number, number, Broker]> = [
  ["RELIANCE", "RELIANCE.NS", 40, 2450, "zerodha"],
  ["TCS", "TCS.NS", 25, 3600, "zerodha"],
  ["HDFCBANK", "HDFCBANK.NS", 60, 1520, "zerodha"],
  ["TATAMOTORS", "TATAMOTORS.NS", 100, 640, "zerodha"],
  ["ITC", "ITC.NS", 200, 415, "zerodha"],
  ["SHOP", "SHOP.TO", 15, 95, "wealthsimple"],
  ["RY", "RY.TO", 20, 135, "wealthsimple"],
  ["ENB", "ENB.TO", 45, 49, "wealthsimple"],
  ["AAPL", "AAPL", 10, 175, "wealthsimple"],
  ["MSFT", "MSFT", 6, 330, "wealthsimple"],
];

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

export default function Home() {
  const [step, setStep] = useState<Step>("import");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [rows, setRows] = useState<AnalyzedHolding[]>([]);
  const [fxAll, setFxAll] = useState<Record<Currency, FxRates> | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("claude-sonnet-4-5");
  const [showAi, setShowAi] = useState(false);
  const abortRef = useRef(false);

  const onImport = useCallback((imported: Holding[], warns: string[], broker: Broker) => {
    setHoldings((prev) => {
      // replace prior rows from the same broker, keep others
      const kept = prev.filter((h) => h.broker !== broker);
      return [...kept, ...imported];
    });
    setWarnings(warns);
  }, []);

  const loadSample = () => {
    setHoldings(
      SAMPLE.map(([raw, ysym, qty, avg, broker]) => ({
        id: nextId(),
        broker,
        rawSymbol: raw,
        yahooSymbol: ysym,
        quantity: qty,
        avgCost: avg,
        currency: currencyForSymbol(ysym),
      }))
    );
    setWarnings([]);
  };

  const analyze = async () => {
    const targets = holdings.filter((h) => h.yahooSymbol && h.quantity > 0);
    if (!targets.length) return;
    setFatal(null);
    abortRef.current = false;
    setStep("analyzing");
    setProgress(targets.map((h) => ({ symbol: h.yahooSymbol, status: "queued" })));

    // FX for all three bases up-front (3 small calls)
    let fx: Record<Currency, FxRates>;
    try {
      const [cad, inr, usd] = await Promise.all(
        (["CAD", "INR", "USD"] as Currency[]).map(async (b) => {
          const r = await fetch(`/api/fx?base=${b}`);
          if (!r.ok) throw new Error(`FX fetch failed (${b})`);
          return (await r.json()) as FxRates;
        })
      );
      fx = { CAD: cad, INR: inr, USD: usd };
    } catch (e) {
      setFatal(`Could not fetch currency rates: ${(e as Error).message}. Try again in a minute.`);
      setStep("import");
      return;
    }

    const results: AnalyzedHolding[] = [];
    const queue = [...targets];
    const CONCURRENCY = 3;

    const worker = async () => {
      while (queue.length && !abortRef.current) {
        const h = queue.shift()!;
        setProgress((p) => p.map((r) => (r.symbol === h.yahooSymbol ? { ...r, status: "fetching" } : r)));
        const invested = h.quantity * h.avgCost;
        try {
          const res = await fetch(`/api/stock/${encodeURIComponent(h.yahooSymbol)}`);
          const j = (await res.json()) as { data?: StockData; scorecard?: Scorecard; error?: string };
          if (!res.ok || !j.data) throw new Error(j.error ?? `HTTP ${res.status}`);
          const price = j.data.quote.price;
          const currentValue = price !== undefined ? h.quantity * price : undefined;
          results.push({
            holding: { ...h, name: h.name ?? j.data.quote.name },
            data: j.data,
            scorecard: j.scorecard,
            invested,
            currentValue,
            pnl: currentValue !== undefined ? currentValue - invested : undefined,
            pnlPct: currentValue !== undefined && invested > 0 ? (currentValue - invested) / invested : undefined,
          });
          setProgress((p) => p.map((r) => (r.symbol === h.yahooSymbol ? { ...r, status: "ok" } : r)));
        } catch (e) {
          results.push({ holding: h, invested, error: (e as Error).message });
          setProgress((p) =>
            p.map((r) =>
              r.symbol === h.yahooSymbol ? { ...r, status: "error", note: (e as Error).message } : r
            )
          );
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    setRows(results);
    setFxAll(fx);
    setStep("done");
  };

  return (
    <MotionRoot>
      <main className="max-w-5xl w-full mx-auto px-4 py-8 flex-1 page-glow">
        {/* header */}
        <motion.header
          className="mb-6"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="flex items-center gap-2.5">
            <motion.span
              className="text-[22px]"
              aria-hidden
              initial={{ rotate: -50, scale: 0.6, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 210, damping: 13, delay: 0.15 }}
            >
              🧭
            </motion.span>
            <h1 className="text-[22px] font-semibold tracking-tight">Portfolio Advisor</h1>
            <Badge tone="neutral">5-year horizon</Badge>
          </div>
          <p className="text-[13px] text-ink-2 mt-1 max-w-2xl">
            Your Zerodha + Wealthsimple holdings, analyzed through the lens of{" "}
            <strong>Buffett, Damani &amp; Jhunjhunwala</strong> — and the school they belong to: Munger, Graham,
            Fisher, Lynch, Akre, Greenblatt, Terry Smith, Pabrai, Agrawal&apos;s QGLP, Mukherjea&apos;s Coffee Can.
            Multi-year ratios, moat and balance-sheet checks, intrinsic-value bands, upgrade ideas. Free data,
            nothing stored.
          </p>
          <motion.div
            className="h-[3px] rounded-full mt-3 max-w-2xl no-print"
            style={{ background: "linear-gradient(90deg, #2a78d6, #1baf7a 55%, #eb6834)" }}
            initial={{ scaleX: 0, transformOrigin: "0% 50%" }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.2 }}
            aria-hidden
          />
          <div className="flex flex-wrap gap-1.5 mt-3 no-print">
            {[
              "4-pillar scorecard",
              "Intrinsic-value bands",
              "Upgrade ideas by market",
              "Health & income checks",
              "Sit-tight projector",
              "AI prompts for any chatbot",
            ].map((f, i) => (
              <motion.span
                key={f}
                className="text-[11.5px] text-ink-2 bg-surface hairline rounded-full px-2.5 py-[3px]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: 0.35 + i * 0.06 }}
              >
                {f}
              </motion.span>
            ))}
          </div>
        </motion.header>

        <AnimatePresence mode="wait" initial={false}>
          {step === "import" && (
            <motion.div key="import" {...stepAnim} className="space-y-5">
              <FadeUp>
                <section>
                  <SectionTitle sub="Upload one or both broker files — or skip straight to manual entry below.">
                    1 · Import holdings
                  </SectionTitle>
                  <ImportPanel onImport={onImport} />
                  <button onClick={loadSample} className="mt-2 text-[12.5px] text-series-1 hover:underline no-print">
                    …or load a sample portfolio to see how it works
                  </button>
                  {warnings.map((w, i) => (
                    <p key={i} className="text-[12.5px] text-[#8a6100] mt-2">
                      ⚠ {w}
                    </p>
                  ))}
                </section>
              </FadeUp>

              {holdings.length > 0 && (
                <section>
                  <SectionTitle sub="Fix any symbol the auto-guess got wrong (edit the Yahoo symbol, or hit “check”). NSE adds .NS, TSX adds .TO, US stays plain.">
                    2 · Review &amp; edit ({holdings.length} holdings)
                  </SectionTitle>
                  <Card className="p-4">
                    <HoldingsTable holdings={holdings} onChange={setHoldings} />
                  </Card>
                </section>
              )}

              <FadeUp delay={0.05}>
                <section>
                  <SectionTitle sub="Optional: paste your own Anthropic API key to add Claude-written commentary on top of the deterministic scorecard. The key stays in this tab's memory only — never stored or logged.">
                    {holdings.length > 0 ? "3" : "2"} · AI commentary (optional)
                  </SectionTitle>
                  <Card className="p-4">
                    {!showAi ? (
                      <button onClick={() => setShowAi(true)} className="text-[13px] text-series-1 hover:underline">
                        + Add an Anthropic API key
                      </button>
                    ) : (
                      <div className="flex flex-wrap gap-2 items-center">
                        <input
                          type="password"
                          value={aiKey}
                          onChange={(e) => setAiKey(e.target.value)}
                          placeholder="sk-ant-…"
                          className="bg-page hairline rounded px-2 py-1 text-[13px] w-[260px]"
                          autoComplete="off"
                        />
                        <select
                          value={aiModel}
                          onChange={(e) => setAiModel(e.target.value)}
                          className="bg-page hairline rounded px-2 py-1 text-[13px]"
                        >
                          <option value="claude-sonnet-4-5">Claude Sonnet 4.5 (balanced)</option>
                          <option value="claude-haiku-4-5">Claude Haiku 4.5 (fastest)</option>
                          <option value="claude-opus-4-6">Claude Opus 4.6 (deepest)</option>
                        </select>
                        {aiKey.startsWith("sk-ant-") && (
                          <Badge tone="good" icon="✓">
                            key set
                          </Badge>
                        )}
                      </div>
                    )}
                  </Card>
                </section>
              </FadeUp>

              {fatal && <p className="text-[13px] text-status-critical">{fatal}</p>}

              <motion.button
                onClick={analyze}
                disabled={holdings.length === 0}
                className="bg-series-1 text-white rounded-lg px-5 py-2.5 text-[14px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Analyze portfolio →
              </motion.button>

              <FadeUp delay={0.05}>
                <MastersCard />
              </FadeUp>
            </motion.div>
          )}

          {step === "analyzing" && (
            <motion.div key="analyzing" {...stepAnim}>
              <Card className="p-5">
                <SectionTitle sub="Fetching 5 years of statements, ratios and prices per stock from Yahoo Finance (free API — a large portfolio takes a minute).">
                  Analyzing {progress.length} holdings…
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
            <motion.div key="done" {...stepAnim}>
              <Dashboard
                rows={rows}
                fxAll={fxAll}
                aiKey={aiKey.startsWith("sk-ant-") ? aiKey : undefined}
                aiModel={aiModel}
                onBack={() => setStep("import")}
                onRowsChange={setRows}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-10 text-[11px] text-muted no-print">
          Built for long-horizon investors. Not affiliated with Zerodha, Wealthsimple or Yahoo. Analysis ≠ advice.
        </footer>
      </main>
    </MotionRoot>
  );
}
