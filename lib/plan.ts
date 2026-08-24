import type { AnalyzedHolding, Currency, FxRates } from "./types";
import type { Market } from "./store";
import { decideAll } from "./decisions";
import { fallbackEtfData, isEtfHolding } from "./etf";
import { assessAll, type HeldEtfInput } from "./etfscore";
import { toBase } from "./portfolio";
import { fmtMoney, fmtPct } from "./symbols";

/**
 * The action plan — the entire analysis compressed into a few plain sentences:
 * what to sell, what to stop adding to, where new money belongs, which ETF fee
 * to fix, and what just needs patience. No new judgments are made here: every
 * line restates a decision the engines already reached; details live in the
 * Decisions and ETFs tabs.
 *
 * Works fully offline: stock decisions come from the scorecard, ETF actions
 * from the curated fee table + price history — no extra network calls.
 */

export interface PlanItem {
  id: string;
  tone: "critical" | "warning" | "good" | "neutral" | "muted";
  icon: string;
  symbols: string[]; // short symbols the sentence is about
  text: string; // one plain sentence
  goTo: "decisions" | "etfs" | null; // where the details live
}

export interface ActionPlan {
  items: PlanItem[];
  summary: string; // one-line read of the whole portfolio
  actionCount: number; // items that actually ask for action
}

const short = (sym: string) => sym.replace(/\.(NS|BO|TO|V)$/i, "");
const list = (syms: string[]) => syms.map(short).join(", ");

export function buildPlan(rows: AnalyzedHolding[], market: Market, fx: FxRates): ActionPlan {
  const base = fx.base;
  const inv = rows.filter((r) => !r.holding.watch && r.holding.quantity > 0);
  const isEtf = (r: AnalyzedHolding) =>
    isEtfHolding(r.holding.yahooSymbol, r.data?.quote.name ?? r.holding.name, r.data?.quote.quoteType);
  const stockRows = inv.filter((r) => !isEtf(r));
  const etfRows = inv.filter(isEtf);

  const items: PlanItem[] = [];

  // ---- stocks: reuse the decision engine verbatim ----
  const groups = decideAll(stockRows);
  const syms = (a: "EXIT" | "TRIM" | "ACCUMULATE" | "HOLD" | "REVIEW") =>
    groups.byAction[a].map((r) => r.holding.yahooSymbol);

  const exits = syms("EXIT");
  if (exits.length) {
    items.push({
      id: "exit",
      tone: "critical",
      icon: "✕",
      symbols: exits,
      text:
        exits.length === 1
          ? `Consider selling ${list(exits)} — it fails the long-term quality tests; that money likely compounds faster elsewhere.`
          : `Consider selling ${list(exits)} — they fail the long-term quality tests; that money likely compounds faster elsewhere.`,
      goTo: "decisions",
    });
  }

  const trims = syms("TRIM");
  if (trims.length) {
    items.push({
      id: "trim",
      tone: "warning",
      icon: "▼",
      symbols: trims,
      text: `Stop adding to ${list(trims)} — the numbers are weakening; give ${trims.length === 1 ? "it" : "them"} 2–4 quarters to prove the thesis before any new money.`,
      goTo: "decisions",
    });
  }

  // ---- ETFs: fee/duplication actions from the catalog (offline) ----
  const heldEtfs: HeldEtfInput[] = etfRows.map((r) => ({
    etf: fallbackEtfData({
      symbol: r.holding.yahooSymbol,
      name: r.data?.quote.name ?? r.holding.name,
      price: r.data?.quote.price,
      currency: (r.data?.quote.currency as string | undefined) ?? r.holding.currency,
      prices: r.data?.prices,
    }),
    value: toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx),
  }));
  const portfolioTotal = inv.reduce(
    (a, r) => a + toBase(r.currentValue ?? r.invested, r.holding.currency as Currency, fx),
    0
  );
  const etfAssessed = etfRows.length ? assessAll(heldEtfs, { market, portfolioTotal }) : [];

  for (const a of etfAssessed) {
    const s = short(a.symbol);
    if (a.verdict === "REDUCE") {
      const over = a.weightPct !== undefined ? `${fmtPct(a.weightPct, 0)} of your money` : "a big slice";
      items.push({
        id: `etf-reduce-${a.symbol}`,
        tone: "warning",
        icon: "▼",
        symbols: [a.symbol],
        text:
          a.category?.kind === "commodity"
            ? `${s} is ${over} — gold/silver is insurance, not the engine; the classic cap is ~5–10%.`
            : `${s} deserves a trim — ${a.reasons[0]?.toLowerCase() ?? "it's costly for what it does"}`,
        goTo: "etfs",
      });
    } else if (a.verdict === "SWITCH" && a.alternatives[0]) {
      const alt = a.alternatives[0];
      items.push({
        id: `etf-switch-${a.symbol}`,
        tone: "warning",
        icon: "⇄",
        symbols: [a.symbol],
        text: `${s}: the same exposure costs less in ${short(alt.symbol)} (~${fmtPct(alt.mer, 2)}/yr vs ~${fmtPct(a.effMer ?? 0, 2)}) — switching keeps ≈${fmtMoney(alt.savesPerYear, base, true)}/yr of your return (mind capital-gains tax).`,
        goTo: "etfs",
      });
    }
  }

  // ---- where new money belongs ----
  const adds = syms("ACCUMULATE");
  const coreEtfs = etfAssessed.filter((a) => a.verdict === "INCREASE").map((a) => a.symbol);
  if (adds.length || coreEtfs.length) {
    const both = [...adds, ...coreEtfs];
    items.push({
      id: "add",
      tone: "good",
      icon: "▲",
      symbols: both,
      text: `When you have new money, ${list(both)} ${both.length === 1 ? "is" : "are"} where it belongs — quality at a defensible price${coreEtfs.length ? " (and rock-bottom-fee index funds)" : ""}.`,
      goTo: adds.length ? "decisions" : "etfs",
    });
  }

  // ---- the rest: patience, said out loud ----
  const holds = syms("HOLD");
  const holdEtfs = etfAssessed.filter((a) => a.verdict === "HOLD" || a.verdict === "UNKNOWN").map((a) => a.symbol);
  const quiet = [...holds, ...holdEtfs];
  if (quiet.length) {
    items.push({
      id: "hold",
      tone: "neutral",
      icon: "●",
      symbols: quiet,
      text: `${list(quiet)} need${quiet.length === 1 ? "s" : ""} nothing — sitting tight IS the strategy.`,
      goTo: null,
    });
  }

  const reviews = syms("REVIEW"); // non-ETF rows the scorecard couldn't judge
  if (reviews.length) {
    items.push({
      id: "review",
      tone: "muted",
      icon: "?",
      symbols: reviews,
      text: `${list(reviews)} couldn't be scored (thin data) — judge ${reviews.length === 1 ? "it" : "them"} on ${reviews.length === 1 ? "its" : "their"} own terms.`,
      goTo: "decisions",
    });
  }

  const actionCount = items.filter((i) => i.tone === "critical" || i.tone === "warning").length;
  const summary =
    inv.length === 0
      ? "Nothing to plan yet — import a portfolio first."
      : actionCount === 0
        ? "Nothing needs action right now. A quiet plan is a feature, not a bug — check back after results season."
        : `${actionCount} thing${actionCount === 1 ? "" : "s"} worth acting on; everything else just needs patience.`;

  return { items, summary, actionCount };
}
