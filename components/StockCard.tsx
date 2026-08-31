"use client";

import { useMemo, useState } from "react";
import type { AnalyzedHolding, Check, CheckStatus, Currency, Holding } from "@/lib/types";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/symbols";
import { VERDICT_META } from "@/lib/portfolio";
import { ACTION_META, decideRow } from "@/lib/decisions";
import { buildPrompt } from "@/lib/promptgen";
import { buildValuation } from "@/lib/valuation";
import { buildJourney } from "@/lib/journey";
import { strengthsAndRisks } from "@/lib/insights";
import { describeSnowflake, snowflakeOf } from "@/lib/snowflake";
import { buildChecklistPrompt, PREBUY_CHECKLIST } from "@/lib/checklist";
import { assessReadiness, READINESS_META } from "@/lib/readiness";
import { ConvictionCard } from "./ConvictionCard";
import { isEtfHolding } from "@/lib/etf";
import { Badge, Card, InfoTip, Meter, Spinner } from "./ui";
import { Snowflake } from "./Snowflake";
import { EpsBars, PriceLine, RevenueEarnings } from "./charts";
import { ValuationBlock } from "./ValuationBlock";
import { Journey } from "./Journey";
import { AnimatedNumber, Collapse } from "./anim";
import ReactMarkdown from "react-markdown";

const STATUS_ICON: Record<CheckStatus, { icon: string; cls: string; label: string }> = {
  pass: { icon: "✓", cls: "text-success-text", label: "pass" },
  warn: { icon: "!", cls: "text-[#8a6100]", label: "borderline" },
  fail: { icon: "✕", cls: "text-status-critical", label: "fail" },
  na: { icon: "–", cls: "text-muted", label: "no data" },
};

function ChecksBlock({ checks }: { checks: Check[] }) {
  const pillars = [...new Set(checks.map((c) => c.pillar))];
  const pillarLabel: Record<string, string> = {
    quality: "Business Quality (Moat)",
    fortress: "Financial Fortress",
    growth: "Growth & Consistency",
    valuation: "Valuation & Margin of Safety",
  };
  return (
    <div className="space-y-3">
      {pillars.map((p) => (
        <div key={p}>
          <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1">{pillarLabel[p]}</div>
          <ul className="space-y-1">
            {checks
              .filter((c) => c.pillar === p)
              .map((c) => {
                const s = STATUS_ICON[c.status];
                return (
                  <li key={c.id} className="flex gap-2 text-[12.5px] leading-snug">
                    <span className={`${s.cls} font-bold w-3 shrink-0`} aria-label={s.label} title={s.label}>
                      {s.icon}
                    </span>
                    <span>
                      <span className="text-ink">{c.label}</span>{" "}
                      <span className="text-ink-2">- {c.detail}</span>
                      <span className="block text-[11px] text-muted italic">{c.philosophy}</span>
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RatioTable({ h }: { h: AnalyzedHolding }) {
  const rows = h.scorecard?.ratios ?? [];
  if (!rows.length) return null;
  const cur = (h.data?.quote.currency ?? h.holding.currency) as Currency;
  const cols: { key: string; label: string; g: string; fmt: (r: (typeof rows)[number]) => string }[] = [
    { key: "revenue", label: "Revenue", g: "revenue", fmt: (r) => (r.revenue !== undefined ? compact(r.revenue, cur) : "–") },
    { key: "netIncome", label: "Net income", g: "netIncome", fmt: (r) => (r.netIncome !== undefined ? compact(r.netIncome, cur) : "–") },
    { key: "eps", label: "EPS", g: "eps", fmt: (r) => fmtNum(r.eps) },
    { key: "roe", label: "ROE", g: "roe", fmt: (r) => fmtPct(r.roe) },
    { key: "roce", label: "ROCE", g: "roce", fmt: (r) => fmtPct(r.roce) },
    { key: "netMargin", label: "Net margin", g: "netMargin", fmt: (r) => fmtPct(r.netMargin) },
    { key: "debtToEquity", label: "D/E", g: "d2e", fmt: (r) => fmtNum(r.debtToEquity) },
    { key: "interestCoverage", label: "Int. cover", g: "icr", fmt: (r) => (r.interestCoverage !== undefined ? `${r.interestCoverage.toFixed(1)}x` : "–") },
    { key: "fcf", label: "FCF", g: "fcf", fmt: (r) => (r.fcf !== undefined ? compact(r.fcf, cur) : "–") },
    { key: "approxPE", label: "P/E (yr-end)", g: "approxPE", fmt: (r) => fmtNum(r.approxPE, 1) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] w-full">
        <thead>
          <tr className="text-left text-muted border-b border-grid">
            <th className="py-1 pr-3 font-medium">Fiscal year</th>
            {rows.map((r) => (
              <th key={r.year} className="py-1 pr-3 font-medium tnum text-right">
                FY{String(r.year).slice(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map((c) => (
            <tr key={c.key} className="border-b border-grid/50">
              <td className="py-1 pr-3 text-ink-2 whitespace-nowrap">
                {c.label} <InfoTip k={c.g} />
              </td>
              {rows.map((r) => (
                <td key={r.year} className="py-1 pr-3 tnum text-right text-ink">
                  {c.fmt(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compact(v: number, currency: Currency): string {
  return fmtMoney(v, currency, true);
}

/**
 * The pre-buy gates - ten yes/no questions no data feed can answer, because
 * they are about the BUSINESS, not the ticker. Rather than asking you to
 * self-grade, this builds a research prompt for any AI: it must answer each
 * gate YES / NO / UNKNOWN with the deciding fact and a source.
 */
function PrebuyGates({
  symbol,
  name,
  sector,
  industry,
  price,
  appFacts,
}: {
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  price?: string;
  appFacts: string[];
}) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = buildChecklistPrompt({ symbol, name, sector, industry, price, appFacts });
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      /* clipboard blocked - ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  return (
    <div className="border-t border-grid pt-3">
      <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">
        Pre-buy gates <InfoTip k="checklist" />
      </div>
      <p className="text-[12.5px] text-ink-2 mt-1 leading-snug">
        {PREBUY_CHECKLIST.length} yes/no questions the numbers above can&apos;t answer: moat, competition,
        management, governance, capital allocation, why the opportunity exists. Copy the prompt into any AI and it
        answers each one <strong className="text-ink">YES / NO / UNKNOWN</strong> with the deciding fact and a
        source, plus the bear case in three lines. Fewer than 8 clean YES answers means small position or skip.
      </p>
      <button
        onClick={copy}
        className="mt-2 bg-surface hairline rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-series-1 hover:bg-page no-print"
      >
        {copied ? "✓ Prompt copied - paste into any AI" : `📋 Copy the ${PREBUY_CHECKLIST.length}-gate research prompt`}
      </button>
    </div>
  );
}

const PILLAR_G: Record<string, string> = {
  quality: "pillarQuality",
  fortress: "pillarFortress",
  growth: "pillarGrowth",
  valuation: "pillarValuation",
};

const RECO_LABEL: Record<string, string> = {
  strong_buy: "strong buy",
  buy: "buy",
  hold: "hold",
  underperform: "underperform",
  sell: "sell",
};

export function StockCard({
  row,
  aiKey,
  aiModel,
  onRemove,
  onPatchHolding,
  onGoDecisions,
  onDeepDive,
  defaultOpen = false,
}: {
  row: AnalyzedHolding;
  aiKey?: string;
  aiModel?: string;
  onRemove?: () => void;
  onPatchHolding?: (patch: Partial<Holding>) => void;
  onGoDecisions?: () => void;
  onDeepDive?: (symbol: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [ai, setAi] = useState<{ loading: boolean; text?: string; error?: string }>({ loading: false });
  const [promptCopied, setPromptCopied] = useState(false);
  const { holding, data, scorecard } = row;
  const cur = (data?.quote.currency ?? holding.currency) as Currency;
  const isWatch = !!holding.watch;

  // derived analysis (pure, memoized; guarded so hooks run before any early return)
  const valuation = useMemo(
    () => (data && scorecard ? buildValuation(data, scorecard) : undefined),
    [data, scorecard]
  );
  const journey = useMemo(() => (isWatch ? undefined : buildJourney(row)), [row, isWatch]);
  const insights = useMemo(
    () =>
      scorecard && scorecard.verdict !== "INSUFFICIENT_DATA"
        ? strengthsAndRisks(scorecard, valuation, journey)
        : undefined,
    [scorecard, valuation, journey]
  );
  const flake = useMemo(() => (scorecard ? snowflakeOf(scorecard, data) : null), [scorecard, data]);
  // the same engine the Decisions tab runs - shown here so the two views can never disagree
  const decision = useMemo(
    () => (!isWatch && scorecard && scorecard.verdict !== "INSUFFICIENT_DATA" ? decideRow(row) : null),
    [row, isWatch, scorecard]
  );
  // the decision-readiness gate: is there enough evidence to act on the verdict at all?
  const readiness = useMemo(
    () =>
      data && scorecard
        ? assessReadiness({ card: scorecard, data, valuation, account: holding.account })
        : undefined,
    [data, scorecard, valuation, holding.account]
  );

  const copyPrompt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = buildPrompt([row], { focus: "deep_dive", includeHistory: true, baseCurrency: cur });
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      /* clipboard unavailable - ignore */
    }
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 1800);
  };

  if (row.error || !data || !scorecard) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="font-semibold">{holding.yahooSymbol}</span>
            <span className="text-ink-2 text-[13px] ml-2">{holding.name ?? holding.rawSymbol}</span>
          </div>
          <Badge tone="serious" icon="!">
            fetch failed
          </Badge>
        </div>
        <p className="text-[12.5px] text-ink-2 mt-1">
          {row.error ?? "No data returned."} - check the Yahoo symbol and re-run.
        </p>
      </Card>
    );
  }

  const vm = VERDICT_META[scorecard.verdict];
  const q = data.quote;
  const isEtf = isEtfHolding(holding.yahooSymbol, q.name ?? holding.name, q.quoteType, holding.securityType);

  const runAi = async () => {
    if (!aiKey) return;
    setAi({ loading: true });
    try {
      const payload = {
        apiKey: aiKey,
        model: aiModel,
        stock: {
          symbol: holding.yahooSymbol,
          name: q.name,
          sector: q.sector,
          industry: q.industry,
          position: { quantity: holding.quantity, avgCost: holding.avgCost, currency: cur, pnlPct: row.pnlPct },
          quote: {
            price: q.price,
            trailingPE: q.trailingPE,
            priceToBook: q.priceToBook,
            dividendYield: q.dividendYield,
            marketCap: q.marketCap,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow,
          },
          scorecard: {
            totalScore: scorecard.totalScore,
            verdict: scorecard.verdict,
            pillars: scorecard.pillars,
            redFlags: scorecard.redFlags,
            checks: scorecard.checks.map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
            cagr: scorecard.cagr,
            avgPE: scorecard.avgPE,
          },
          ratioHistory: scorecard.ratios,
        },
      };
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !j.text) setAi({ loading: false, error: j.error ?? "AI request failed" });
      else setAi({ loading: false, text: j.text });
    } catch (e) {
      setAi({ loading: false, error: (e as Error).message });
    }
  };

  return (
    <Card className="p-4">
      {/* header */}
      <button
        className="w-full text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-testid="stock-card-header"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px]">{q.name ?? holding.yahooSymbol}</span>
              <span className="text-muted text-[12px] tnum">{holding.yahooSymbol}</span>
              {q.sector && <Badge tone="neutral">{q.sector}</Badge>}
              {isEtf && (
                <Badge tone="muted" icon="◫">
                  ETF → see the ETFs tab
                </Badge>
              )}
              {isWatch && (
                <Badge tone="muted" icon="☆">
                  watchlist
                </Badge>
              )}
              {data.mock && <Badge tone="muted">demo data</Badge>}
            </div>
            <div className="text-[12.5px] text-ink-2 mt-0.5 tnum">
              {fmtMoney(q.price, cur)}
              {!isWatch && (
                <>
                  {" "}
                  · {holding.quantity} sh · avg {fmtMoney(holding.avgCost, cur)}
                  {holding.account && <span className="text-muted"> · {holding.account}</span>}
                  {row.pnlPct !== undefined && (
                    <span className={`ml-2 font-medium ${(row.pnl ?? 0) >= 0 ? "text-success-text" : "text-status-critical"}`}>
                      {(row.pnl ?? 0) >= 0 ? "+" : ""}
                      {fmtPct(row.pnlPct)}
                    </span>
                  )}
                </>
              )}
              {isWatch && <span className="ml-2 text-muted">no capital committed - evaluating</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[11px] text-muted">Score</div>
              <div className="text-[22px] font-semibold tnum leading-none">
                <AnimatedNumber value={scorecard.totalScore} />
              </div>
            </div>
            <Badge tone={vm.tone} icon={vm.icon}>
              {vm.label}
            </Badge>
            <span className="text-muted text-[13px]" aria-hidden>
              {open ? "▾" : "▸"}
            </span>
          </div>
        </div>
      </button>

      {/* verdict line */}
      <p className="text-[12.5px] text-ink-2 mt-2">
        {isEtf && scorecard.verdict === "INSUFFICIENT_DATA"
          ? "Fund units aren't judged on the four stock pillars - open the ETFs tab for the fee-first fund analysis (MER, size, duplication, cheaper twins)."
          : scorecard.verdictText}
      </p>
      {/* decision-readiness gate - visible whether the card is open or closed */}
      {readiness && !isEtf && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
          <Badge tone={READINESS_META[readiness.level].tone} icon={READINESS_META[readiness.level].icon}>
            {readiness.label}
          </Badge>
          <InfoTip k="readiness" />
          {readiness.gaps.length > 0 && (
            <span className="text-ink-2">
              {readiness.gaps.length} gap{readiness.gaps.length === 1 ? "" : "s"}
              {!open ? " - open the card for the list" : " listed below"}
            </span>
          )}
        </div>
      )}
      {!open && scorecard.redFlags.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {scorecard.redFlags.map((f, i) => {
            const crit = scorecard.criticalFlags.includes(f);
            return (
              <li key={i} className="text-[12px] text-status-critical flex gap-1.5">
                <span aria-hidden>{crit ? "⛔" : "⚑"}</span>
                <span>
                  {crit && <strong>Critical: </strong>}
                  {f}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-4 items-center">
        {onDeepDive && !isEtf && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeepDive(holding.yahooSymbol);
            }}
            className="mt-1.5 text-[12px] font-medium text-series-1 hover:underline no-print"
            title="Full-page analysis: SWOT, sector comparison, advanced chart with auto trendlines, every check"
          >
            🔬 Deep analysis →
          </button>
        )}
        <button
          onClick={copyPrompt}
          className="mt-1.5 text-[12px] text-series-1 hover:underline no-print"
          title="Copies a full analysis prompt (position + 5-yr ratios + scorecard) to paste into ChatGPT, Claude, Gemini…"
        >
          {promptCopied ? "✓ Prompt copied - paste into any AI" : "📋 Copy AI prompt for this stock"}
        </button>
        {isWatch && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="mt-1.5 text-[12px] text-status-critical hover:underline no-print"
          >
            ✕ remove from watchlist
          </button>
        )}
      </div>

      <Collapse open={open}>
        <div className="mt-4 space-y-5">
          {/* why the gate is not fully open - every gap, in plain words */}
          {readiness && !isEtf && readiness.level !== "full" && (
            <div className="bg-page hairline rounded-xl px-3 py-2">
              <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">
                Why {readiness.level === "blocked" ? "no action can be recommended" : "not fully decision-ready"}{" "}
                <InfoTip k="readiness" />
              </div>
              <ul className="mt-1 space-y-1">
                {readiness.gaps.map((g, i) => (
                  <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                    <span className="text-[#8a6100] font-bold shrink-0" aria-hidden>
                      ◐
                    </span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted mt-1.5 italic">{readiness.notes[0]}</p>
            </div>
          )}

          {/* what the decision board says about THIS position - same engine, zero disagreement */}
          {decision && !isEtf && !readiness?.suppressActions && (
            <div className="bg-page hairline rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
              <span className="text-muted text-[11.5px] uppercase tracking-wide">Decision board says</span>
              <Badge tone={ACTION_META[decision.action].tone} icon={ACTION_META[decision.action].icon}>
                {ACTION_META[decision.action].label}
              </Badge>
              <span className="text-ink-2 leading-snug">{decision.headline}</span>
              {onGoDecisions && (
                <button
                  onClick={onGoDecisions}
                  className="text-series-1 hover:underline no-print text-[12px]"
                >
                  every reason →
                </button>
              )}
            </div>
          )}

          {/* conviction or speculation - the size question, up front */}
          {!isEtf && scorecard.verdict !== "INSUFFICIENT_DATA" && (
            <ConvictionCard data={data} scorecard={scorecard} valuation={valuation} compact />
          )}

          {/* the two lines that matter most, before the detail */}
          {insights && (insights.strengths.length > 0 || insights.risks.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              <div className="bg-page hairline rounded-xl px-3 py-2">
                <div className="text-[10.5px] font-semibold text-success-text uppercase tracking-wide">
                  Best thing about it
                </div>
                <p className="text-[12.5px] text-ink leading-snug mt-0.5">
                  {insights.strengths[0] ?? "Nothing in the checks stands out as a durable edge."}
                </p>
              </div>
              <div className="bg-page hairline rounded-xl px-3 py-2">
                <div className="text-[10.5px] font-semibold text-status-critical uppercase tracking-wide">
                  Worst thing about it
                </div>
                <p className="text-[12.5px] text-ink leading-snug mt-0.5">
                  {insights.risks[0] ?? "No material risk flagged - which is itself worth a sceptical look."}
                </p>
              </div>
            </div>
          )}

          {/* strengths & risks - every bullet restates a check the engine ran */}
          {insights && (insights.strengths.length > 0 || insights.risks.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <div className="text-[11.5px] font-semibold text-success-text uppercase tracking-wide mb-1">
                  ✦ Strengths
                </div>
                {insights.strengths.length ? (
                  <ul className="space-y-1">
                    {insights.strengths.map((s, i) => (
                      <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                        <span className="text-success-text font-bold shrink-0" aria-hidden>
                          +
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-muted">Nothing stands out on the upside right now.</p>
                )}
              </div>
              <div>
                <div className="text-[11.5px] font-semibold text-status-critical uppercase tracking-wide mb-1">
                  ⚑ Risks
                </div>
                {insights.risks.length ? (
                  <ul className="space-y-1">
                    {insights.risks.map((s, i) => (
                      <li key={i} className="text-[12.5px] text-ink-2 leading-snug flex gap-1.5">
                        <span className="text-status-critical font-bold shrink-0" aria-hidden>
                          −
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-muted">No material risks flagged by the checks.</p>
                )}
              </div>
            </div>
          )}

          {/* snowflake + pillars */}
          <div className={`grid ${flake ? "md:grid-cols-[230px_1fr]" : ""} gap-x-7 gap-y-3 items-center`}>
            {flake && (
              <div className="max-w-[260px] mx-auto md:mx-0 w-full">
                <Snowflake axes={flake} size="sm" title={`${holding.yahooSymbol} snowflake`} />
                <p className="text-[11px] text-muted text-center leading-snug">
                  The snowflake <InfoTip k="snowflake" /> - {describeSnowflake(flake)}
                </p>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {scorecard.pillars
                .filter((p) => p.applicable)
                .map((p) => (
                  <div key={p.pillar}>
                    <div className="flex justify-between text-[12px] mb-1 gap-2">
                      <span className="text-ink-2">
                        {p.label} <InfoTip k={PILLAR_G[p.pillar]} />
                      </span>
                      <span className="font-medium tnum">{p.score}</span>
                    </div>
                    <Meter value={p.score} />
                  </div>
                ))}
            </div>
          </div>

          {/* valuation snapshot */}
          <div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2 tnum">
              <span>
                P/E <InfoTip k="pe" /> <strong className="text-ink">{fmtNum(q.trailingPE, 1)}</strong>
                {scorecard.avgPE && (
                  <>
                    {" "}
                    vs 5y avg <InfoTip k="avgPE" /> <strong className="text-ink">{fmtNum(scorecard.avgPE, 1)}</strong>
                  </>
                )}
              </span>
              <span>
                P/B <InfoTip k="pb" /> <strong className="text-ink">{fmtNum(q.priceToBook, 1)}</strong>
              </span>
              <span>
                Div yield <InfoTip k="divYield" /> <strong className="text-ink">{fmtPct(q.dividendYield)}</strong>
              </span>
              <span>
                Rev CAGR <InfoTip k="revCagr" /> <strong className="text-ink">{fmtPct(scorecard.cagr.revenue)}</strong>
              </span>
              <span>
                EPS CAGR <InfoTip k="epsCagr" /> <strong className="text-ink">{fmtPct(scorecard.cagr.eps)}</strong>
              </span>
              <span>
                52w <InfoTip k="week52" /> {fmtMoney(q.fiftyTwoWeekLow, cur, true)}–{fmtMoney(q.fiftyTwoWeekHigh, cur, true)}
              </span>
              <span>
                Data coverage <InfoTip k="coverage" />{" "}
                <strong className={scorecard.coverage >= 0.6 ? "text-ink" : "text-[#8a6100]"}>
                  {Math.round(scorecard.coverage * 100)}%
                </strong>
              </span>
              {scorecard.fscore && (
                <span
                  title={scorecard.fscore.tests
                    .filter((t) => t.status !== "na")
                    .map((t) => `${t.status === "pass" ? "✓" : "✕"} ${t.label}`)
                    .join("\n")}
                >
                  F-Score <InfoTip k="fscore" />{" "}
                  <strong
                    className={
                      scorecard.fscore.score / scorecard.fscore.of >= 0.78
                        ? "text-success-text"
                        : scorecard.fscore.score / scorecard.fscore.of <= 0.34
                          ? "text-status-critical"
                          : "text-ink"
                    }
                  >
                    {scorecard.fscore.score}/{scorecard.fscore.of}
                  </strong>
                </span>
              )}
            </div>
            {q.targetMeanPrice !== undefined &&
              q.price !== undefined &&
              (q.numberOfAnalystOpinions ?? 0) > 0 && (
                <p className="text-[12px] text-muted mt-1.5 tnum">
                  Analysts ({q.numberOfAnalystOpinions}) <InfoTip k="analyst" /> - 12-mo target{" "}
                  <strong className="text-ink-2">{fmtMoney(q.targetMeanPrice, cur)}</strong>{" "}
                  <span className={q.targetMeanPrice >= q.price ? "text-success-text" : "text-status-critical"}>
                    ({q.targetMeanPrice >= q.price ? "+" : ""}
                    {fmtPct(q.targetMeanPrice / q.price - 1)})
                  </span>
                  {q.recommendationKey && RECO_LABEL[q.recommendationKey] && (
                    <>
                      {" "}
                      · lean “{RECO_LABEL[q.recommendationKey]}”
                    </>
                  )}{" "}
                  <span className="italic">- context only; their horizon is 1 year, yours is 5.</span>
                </p>
              )}
          </div>

          {/* intrinsic value strip - withheld entirely when the gate is closed */}
          {readiness?.suppressActions ? (
            <p className="text-[12.5px] text-muted italic">
              Fair-value prices are withheld - the readiness gaps above have to close before a buy-below number
              would mean anything.
            </p>
          ) : (
            <ValuationBlock data={data} scorecard={scorecard} avgCost={isWatch ? undefined : holding.avgCost} />
          )}

          {/* fundamentals then-vs-now */}
          {!isWatch && <Journey row={row} onPatchHolding={onPatchHolding} />}

          {/* charts */}
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <div className="text-[12px] font-medium text-ink-2 mb-1">Price - 5 years (monthly)</div>
              <PriceLine prices={data.prices} currency={cur} />
            </div>
            <div>
              <div className="text-[12px] font-medium text-ink-2 mb-1">Revenue vs net income (annual)</div>
              <RevenueEarnings years={data.years} currency={cur} />
            </div>
          </div>
          <div>
            <div className="text-[12px] font-medium text-ink-2 mb-1">EPS by year</div>
            <EpsBars years={data.years} />
          </div>

          {/* checks + ratio table */}
          <div className="grid lg:grid-cols-2 gap-6">
            <ChecksBlock checks={scorecard.checks} />
            <div>
              <div className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1">
                Ratio history
              </div>
              <RatioTable h={row} />
              <p className="text-[11px] text-muted mt-2 italic">{scorecard.philosophyNote}</p>
            </div>
          </div>

          {/* pre-buy gates - a research prompt, because these need facts, not self-grading */}
          {!isEtf && (
            <PrebuyGates
              symbol={holding.yahooSymbol}
              name={q.name}
              sector={q.sector}
              industry={q.industry}
              price={fmtMoney(q.price, cur)}
              appFacts={[
                `App scorecard: ${scorecard.totalScore}/100 (${VERDICT_META[scorecard.verdict].label})`,
                `5y revenue CAGR ${fmtPct(scorecard.cagr.revenue)}, EPS CAGR ${fmtPct(scorecard.cagr.eps)}`,
                `P/E ${fmtNum(q.trailingPE, 1)}${scorecard.avgPE ? ` vs own 5y avg ${fmtNum(scorecard.avgPE, 1)}` : ""}, P/B ${fmtNum(q.priceToBook, 1)}`,
                ...(scorecard.fscore ? [`Piotroski F-Score ${scorecard.fscore.score}/${scorecard.fscore.of}`] : []),
                ...(scorecard.redFlags.length ? [`Red flags already found: ${scorecard.redFlags.join("; ")}`] : []),
              ]}
            />
          )}

          {/* AI commentary */}
          {aiKey && (
            <div className="border-t border-grid pt-3">
              {!ai.text && !ai.loading && (
                <button onClick={runAi} className="text-[13px] font-medium text-series-1 hover:underline">
                  ✦ Generate AI commentary for {holding.yahooSymbol}
                </button>
              )}
              {ai.loading && (
                <span className="text-[13px] text-ink-2">
                  <Spinner /> Asking Claude…
                </span>
              )}
              {ai.error && <p className="text-[12.5px] text-status-critical">{ai.error}</p>}
              {ai.text && (
                <div className="prose prose-sm max-w-none text-[13px] leading-relaxed [&_h1]:text-[14px] [&_h2]:text-[13.5px] [&_h3]:text-[13px] [&_strong]:text-ink">
                  <ReactMarkdown>{ai.text}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {data.errors && data.errors.length > 0 && (
            <p className="text-[11px] text-muted">Data notes: {data.errors.join(" · ")}</p>
          )}
        </div>
      </Collapse>
    </Card>
  );
}
