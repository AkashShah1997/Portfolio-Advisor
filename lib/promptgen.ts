import type { AnalyzedHolding, Currency, FxRates, PortfolioSummary } from "./types";
import { VERDICT_META } from "./portfolio";
import { FRAMEWORKS_LINE, ROSTER_LINE } from "./investors";
import { fmtMoney } from "./symbols";
import { buildValuation } from "./valuation";

/**
 * Prompt generator - packages the app's computed data into a ready-to-paste
 * prompt for ANY external AI (ChatGPT, Claude, Gemini, Perplexity, …).
 *
 * Design principles:
 *  - The AI gets real numbers (position, 5-year ratios, scorecard evidence),
 *    so it analyzes instead of hallucinating data.
 *  - The investor's philosophy and horizon are stated explicitly.
 *  - Tasks are numbered and specific; output format is specified.
 *  - Guardrails: label outside knowledge, no fake precision, be blunt.
 */

export type PromptFocus = "deep_dive" | "action" | "risk" | "news";

export const FOCUS_META: Record<PromptFocus, { label: string; blurb: string }> = {
  deep_dive: { label: "Full deep-dive", blurb: "complete quality + valuation + thesis analysis" },
  action: { label: "Buy / add / trim decision", blurb: "a concrete action with price discipline" },
  risk: { label: "Risk & red-flag audit", blurb: "hunt for what could break the thesis" },
  news: { label: "Latest results & news check", blurb: "for AIs with web access - recency review" },
};

const num = (v: number | undefined, d = 1): string => (v === undefined || Number.isNaN(v) ? "n/a" : v.toFixed(d));
const pct = (v: number | undefined, d = 1): string => (v === undefined || Number.isNaN(v) ? "n/a" : `${(v * 100).toFixed(d)}%`);

function philosophyBlock(): string {
  return `## Who I am (read this first - it changes the answer)
- I'm a long-term investor with a **minimum 5-year holding horizon** (often 10+). I hold Indian stocks (NSE, via Zerodha) and Canadian/US stocks (via Wealthsimple).
- My philosophy is anchored in **Warren Buffett, Radhakishan Damani, and Rakesh Jhunjhunwala**, and draws on the whole quality-value school: ${ROSTER_LINE}. Buy wonderful, understandable businesses with durable moats and honest management at fair prices - then sit tight. "Buy right, sit tight."
- Frameworks I actively use: ${FRAMEWORKS_LINE}.
- Quality tests I trust: sustained **ROE/ROCE ≥ 15%**, low debt, interest coverage, positive & growing free cash flow, earnings consistency across cycles, margin stability, reinvestment runway.
- Price discipline: I'd rather pay a fair price for a great business than a great price for a mediocre one - but I refuse to overpay (P/E vs the company's own history, PEG, earnings yield vs bonds).
- I am **not a trader**. Short-term price moves matter to me only as buying opportunities. Do not give me momentum/technical analysis.`;
}

function rulesBlock(): string {
  return `## Rules for your answer
- Ground every quantitative claim in the data I provided. If you use knowledge beyond it (industry trends, management record, news), **label it clearly** as outside knowledge and state how confident you are.
- If any number I provided looks wrong or stale to you, say so explicitly rather than silently using different figures.
- No fake precision: no price targets to the exact rupee/cent, no "guaranteed" returns.
- Be blunt. I want the bear case argued as strongly as the bull case - my biggest risk is falling in love with my own holdings.
- Keep the structure I asked for, use markdown headers, and **start with the bottom line**.
- End with: "This is analysis, not financial advice."`;
}

function stockBlock(r: AnalyzedHolding, includeHistory: boolean): string {
  const { holding: h, data, scorecard: sc } = r;
  const q = data?.quote;
  const cur = (q?.currency ?? h.currency) as Currency;
  const lines: string[] = [];

  lines.push(`### ${q?.name ?? h.rawSymbol} (${h.yahooSymbol})${q?.sector ? ` - ${q.sector} / ${q.industry ?? ""}` : ""}`);
  if (h.quantity > 0) {
    lines.push(
      `- My position: ${h.quantity} shares @ avg ${fmtMoney(h.avgCost, cur)} → invested ${fmtMoney(r.invested, cur, true)}; ` +
        `current price ${fmtMoney(q?.price, cur)} (${r.pnlPct !== undefined ? `${r.pnl! >= 0 ? "+" : ""}${pct(r.pnlPct)} unrealized` : "P&L n/a"})`
    );
  } else {
    lines.push(
      `- I do NOT own this yet - it's on my watchlist. Evaluate it as a fresh purchase at the current price of ${fmtMoney(q?.price, cur)}.`
    );
  }
  if (q) {
    lines.push(
      `- Market snapshot: P/E ${num(q.trailingPE)}${sc?.avgPE ? ` (own 5-yr avg ≈ ${num(sc.avgPE)})` : ""}, ` +
        `P/B ${num(q.priceToBook)}, PEG ${num(q.pegRatio, 2)}, dividend yield ${pct(q.dividendYield)}, ` +
        `52-week range ${fmtMoney(q.fiftyTwoWeekLow, cur, true)}–${fmtMoney(q.fiftyTwoWeekHigh, cur, true)}, market cap ${fmtMoney(q.marketCap, cur, true)}`
    );
  }
  if (sc) {
    const vm = VERDICT_META[sc.verdict];
    lines.push(
      `- My screener's verdict: **${vm.label}** (score ${sc.totalScore}/100 - ` +
        sc.pillars
          .filter((p) => p.applicable)
          .map((p) => `${p.label.split(" (")[0]}: ${p.score}`)
          .join(", ") +
        `)${sc.isFinancialSector ? " [scored with financial-sector checks]" : ""}`
    );
    if (sc.redFlags.length) lines.push(`- Red flags my screener raised: ${sc.redFlags.join(" | ")}`);
    lines.push(
      `- Growth (${sc.cagr.years}-yr CAGR): revenue ${pct(sc.cagr.revenue)}, EPS ${pct(sc.cagr.eps)}, FCF ${pct(sc.cagr.fcf)}`
    );
    if (data) {
      const val = buildValuation(data, sc);
      if (val.intrinsic !== undefined) {
        lines.push(
          `- My screener's rough mechanical fair-value estimate: ≈ ${fmtMoney(val.intrinsic, cur)}/share ` +
            `(band ${fmtMoney(val.low, cur)}–${fmtMoney(val.high, cur)}; I'd want to buy below ${fmtMoney(val.buyBelow, cur)}; ` +
            `current price implies ${pct(val.marginOfSafety)} margin of safety). ` +
            `Methods used: ${val.methods.map((m) => m.label).join(", ")}. Challenge this estimate rather than anchoring on it.`
        );
      }
    }

    if (includeHistory && sc.ratios.length) {
      lines.push("", `5-year financial history (fiscal years, ${cur}; source: Yahoo Finance):`, "");
      const years = sc.ratios;
      const header = `| Metric | ${years.map((y) => `FY${String(y.year).slice(2)}`).join(" | ")} |`;
      const sep = `|---|${years.map(() => "---").join("|")}|`;
      const row = (label: string, f: (y: (typeof years)[number]) => string) =>
        `| ${label} | ${years.map(f).join(" | ")} |`;
      lines.push(header, sep);
      lines.push(row("Revenue", (y) => (y.revenue !== undefined ? fmtMoney(y.revenue, cur, true) : "n/a")));
      lines.push(row("Net income", (y) => (y.netIncome !== undefined ? fmtMoney(y.netIncome, cur, true) : "n/a")));
      lines.push(row("EPS", (y) => num(y.eps, 2)));
      lines.push(row("ROE", (y) => pct(y.roe)));
      lines.push(row("ROCE", (y) => pct(y.roce)));
      lines.push(row("Net margin", (y) => pct(y.netMargin)));
      lines.push(row("Debt/Equity", (y) => num(y.debtToEquity, 2)));
      lines.push(row("Interest cover", (y) => (y.interestCoverage !== undefined ? `${num(y.interestCoverage)}x` : "n/a")));
      lines.push(row("Free cash flow", (y) => (y.fcf !== undefined ? fmtMoney(y.fcf, cur, true) : "n/a")));
      lines.push(row("P/E (yr-end)", (y) => num(y.approxPE)));
    }
  } else if (r.error) {
    lines.push(`- Note: my screener could not fetch data for this one (${r.error}) - please analyze from your own knowledge and label it as such.`);
  }
  return lines.join("\n");
}

function tasksBlock(focus: PromptFocus, scope: "one" | "many" | "portfolio"): string {
  const subject = scope === "one" ? "this stock" : scope === "many" ? "each stock" : "this portfolio";
  const t: string[] = [];

  if (focus === "deep_dive") {
    t.push(
      `1. **Bottom line first** - in 2–3 sentences: is ${subject} a business this school of investors (Buffett, Damani, Jhunjhunwala, Munger, Terry Smith…) should own for the next 5 years, at today's price? Where useful, apply the named frameworks: does it pass QGLP? Would it belong in a Coffee Can?`,
      `2. **Challenge my screener** - my tool scored ${subject} mechanically from the numbers above. Where would a thoughtful analyst disagree with the verdict, and why?`,
      `3. **Moat & management (qualitative)** - what is the durable competitive advantage, is it widening or eroding, and what do you know about management quality/capital allocation? Channel Phil Fisher's scuttlebutt: what would customers, suppliers and competitors say? (label outside knowledge)`,
      `4. **The 5-year thesis** - state exactly what must stay true for ${subject} to compound for 5+ years, as 3–5 falsifiable statements.`,
      `5. **Bear case** - the strongest argument to sell, argued honestly.`,
      `6. **What to monitor** - the 3–4 specific numbers/events in the next 2–4 quarters that would confirm or break the thesis.`,
      `7. **Action & price discipline** - add / hold / trim, and roughly what valuation level would change that answer (ranges, not precise targets).`
    );
    if (scope === "many") t.push(`8. **Rank them** - order the stocks by where incremental capital deserves to go, with one-line justifications.`);
    if (scope === "portfolio")
      t.push(
        `8. **Portfolio construction** - concentration, sector/geography balance, currency exposure (INR/CAD/USD), overlap between holdings, and what's missing.`,
        `9. **Capital recycling** - which holdings deserve more capital and which are the weakest claim on it, consistent with a 5-year horizon (mind taxes/transaction friction qualitatively).`
      );
  } else if (focus === "action") {
    t.push(
      `1. **Decision first** - for ${subject}: ADD, HOLD, or TRIM/EXIT, in one line each with conviction level (high/medium/low).`,
      `2. **Why** - the 3 strongest data-grounded reasons for your decision, and the single strongest counter-argument.`,
      `3. **Price discipline** - at what rough valuation (P/E band, earnings-yield threshold, or % drawdown) would you flip from HOLD to ADD, or from HOLD to EXIT?`,
      `4. **Position sizing** - given my current allocation (see data), is the position too big, too small, or right for its quality?`,
      `5. **The one thing** - if I could only track one metric per stock for the next year, what is it and what reading would trigger action?`
    );
    if (scope !== "one") t.push(`6. **Priority order** - sequence the actions: what to do first and why.`);
  } else if (focus === "risk") {
    t.push(
      `1. **Kill the thesis** - act as a short-seller/devil's advocate. For ${subject}, what is the most credible path to permanent capital loss over 5 years?`,
      `2. **Balance-sheet stress** - using the debt, coverage and FCF history provided: how does ${subject} fare in a recession or rate spike? Any refinancing/dilution risk?`,
      `3. **Earnings quality** - any signs in the numbers (margins vs cash flow, receivables-style patterns, one-off gains) that reported earnings overstate reality? Label anything you infer.`,
      `4. **Structural threats** - disruption, regulation, promoter/management risk, industry cyclicality (label outside knowledge).`,
      `5. **My screener's red flags** - are the ones listed real problems or noise? What red flags did it MISS?`,
      `6. **Risk ranking** - rank ${scope === "one" ? "the risks" : "the holdings by riskiness"} and state which single risk deserves my attention most.`
    );
  } else {
    t.push(
      `1. **Latest results** - find the most recent 1–2 quarterly/annual results for ${subject} (my data may lag). Did revenue, margins, EPS and debt move in line with the 5-year history I provided, or is the trend changing?`,
      `2. **Material news** - management changes, acquisitions, regulatory actions, guidance changes, major capex - anything in the last ~6 months a 5-year owner must know. Cite sources with dates.`,
      `3. **Valuation now vs history** - with the latest price and earnings, is it cheaper or richer than the 5-yr average P/E I provided?`,
      `4. **Thesis check** - does anything you found strengthen or weaken the long-term compounding thesis? Update my screener's verdict if warranted.`,
      `5. **Watchlist** - what upcoming events (results dates, rulings, launches) should I put on my calendar?`,
      `If you do NOT have web access, say so upfront and answer only from your training knowledge with its cutoff date stated.`
    );
  }
  return `## What I want from you\n${t.join("\n")}`;
}

export interface PromptOptions {
  focus: PromptFocus;
  includeHistory: boolean;
  baseCurrency: Currency;
}

export function buildPrompt(
  rows: AnalyzedHolding[],
  opts: PromptOptions,
  summary?: PortfolioSummary,
  fx?: FxRates
): string {
  const scope: "one" | "many" | "portfolio" = summary ? "portfolio" : rows.length === 1 ? "one" : "many";
  const today = new Date().toISOString().slice(0, 10);
  const parts: string[] = [];

  parts.push(
    `You are a senior equity research analyst and long-term value investor. Today is ${today}. My portfolio data below was computed from Yahoo Finance (free API) - treat it as a good-faith snapshot that can lag by days.`
  );
  parts.push(philosophyBlock());

  if (scope === "portfolio" && summary) {
    const b = opts.baseCurrency;
    parts.push(
      `## My portfolio (all values in ${b}${fx ? `; FX source: ${fx.source}` : ""})
- Total invested: ${fmtMoney(summary.totalInvested, b, true)} · current value: ${fmtMoney(summary.totalCurrent, b, true)} · unrealized P&L: ${fmtMoney(summary.totalPnl, b, true)} (${pct(summary.totalPnlPct)})
- Geography: ${summary.byCountry.map((c) => `${c.label} ${pct(c.value / (summary.totalCurrent || 1))}`).join(", ")}
- Sectors: ${summary.bySector.slice(0, 6).map((s) => `${s.label} ${pct(s.value / (summary.totalCurrent || 1))}`).join(", ")}
- Top holding is ${pct(summary.topHoldingPct)} of the portfolio · value-weighted quality score ${summary.weightedScore}/100
- My screener's verdict mix: ${Object.entries(summary.byVerdict)
        .filter(([, n]) => n > 0)
        .map(([v, n]) => `${VERDICT_META[v as keyof typeof VERDICT_META].label} ×${n}`)
        .join(", ")}`
    );
    parts.push(`## The holdings\n\n${rows.map((r) => stockBlock(r, opts.includeHistory)).join("\n\n")}`);
  } else {
    parts.push(
      `## The ${rows.length === 1 ? "holding" : `${rows.length} holdings`} I want analyzed\n\n${rows
        .map((r) => stockBlock(r, opts.includeHistory))
        .join("\n\n")}`
    );
  }

  parts.push(tasksBlock(opts.focus, scope));
  parts.push(rulesBlock());
  return parts.join("\n\n");
}

/** Rough token estimate for UI display (~4 chars/token). */
export function estimateTokens(s: string): number {
  return Math.round(s.length / 4);
}
