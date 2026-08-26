import type { Currency, Verdict } from "./types";
import type { Action } from "./decisions";
import type { ValuationStatus } from "./valuation";
import type { EtfVerdict } from "./etfscore";
import type { MacroRegime } from "./macro";
import type { Candle } from "./history";
import { fmtMoney, fmtPct } from "./symbols";

/**
 * The position coach - "I'm sitting on +X% in this name: what's the better
 * move NOW?" One stance per position, from evidence the app already has plus
 * live momentum:
 *
 *   quality verdict + decision  (is the business worth owning?)
 *   valuation status            (is the price sane?)
 *   your P&L and weight         (profit is a reason to check WEIGHT,
 *                                never by itself a reason to sell a compounder)
 *   momentum                    (vs 200-day average, drawdown from 52w high)
 *   market regime               (fear / cooling / expensive calm / normal)
 *
 * DCA is first-class: ETFs default to SIP plans (automated, price-blind, with
 * a below-200-day boost), stocks get 3-tranche dip ladders with real prices.
 * The engine never says "sell everything" and never times the market - it
 * sizes and paces, value-school style.
 */

export type Stance = "TRIM" | "HOLD" | "BUY_DIP" | "DCA" | "REVIEW" | "EXIT_REVIEW";

export const STANCE_META: Record<
  Stance,
  { label: string; icon: string; tone: "good" | "neutral" | "warning" | "serious" | "critical" | "muted"; priority: number }
> = {
  EXIT_REVIEW: { label: "Exit review", icon: "✕", tone: "critical", priority: 0 },
  TRIM: { label: "Trim a slice", icon: "▼", tone: "warning", priority: 1 },
  BUY_DIP: { label: "Buy the dip", icon: "◎", tone: "good", priority: 2 },
  DCA: { label: "Keep DCA-ing", icon: "∿", tone: "good", priority: 3 },
  HOLD: { label: "Sit tight", icon: "●", tone: "neutral", priority: 4 },
  REVIEW: { label: "Review", icon: "?", tone: "muted", priority: 5 },
};

// ---------- momentum from ~1y of daily candles ----------

export interface MomentumStats {
  pctFromHigh?: number; // ≤ 0, distance from 52-week high
  vs200d?: number; // last vs 200-day average (or longest available ≥120d)
  ret3m?: number; // ~63 trading days
  lastClose?: number;
  asOf?: string; // date of last candle
}

export function momentumFromCandles(candles: Candle[]): MomentumStats {
  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 40) return {};
  const last = closes[closes.length - 1];
  const high = Math.max(...closes);
  const dmaWin = closes.slice(-200);
  const dma = dmaWin.length >= 120 ? dmaWin.reduce((a, b) => a + b, 0) / dmaWin.length : undefined;
  const i3m = closes.length - 1 - 63;
  return {
    pctFromHigh: high > 0 ? last / high - 1 : undefined,
    vs200d: dma ? last / dma - 1 : undefined,
    ret3m: i3m >= 0 && closes[i3m] > 0 ? last / closes[i3m] - 1 : undefined,
    lastClose: last,
    asOf: candles[candles.length - 1]?.time,
  };
}

// ---------- DCA plans ----------

export interface DcaPlan {
  style: "SIP" | "TRANCHES";
  title: string;
  lines: string[];
}

export function sipPlan(belowDma: boolean): DcaPlan {
  return {
    style: "SIP",
    title: "The SIP plan (core holding)",
    lines: [
      "Invest a fixed amount on a fixed date every month - automate it, then ignore the price.",
      belowDma
        ? "It's trading below its 200-day average right now - this is a boost month: put in ~1.5× your normal amount."
        : "Boost rule: any month it trades below its 200-day average, put in ~1.5× the normal amount.",
      "Never skip a month because the market feels high - time in the market beats timing it.",
    ],
  };
}

export function trancheLadder(price: number | undefined, cur: Currency): DcaPlan {
  const lines =
    price && price > 0
      ? [
          `Tranche 1 - a third of your planned amount now (~${fmtMoney(price, cur)}).`,
          `Tranche 2 - a third if it dips ~7% (≈ ${fmtMoney(price * 0.93, cur)}).`,
          `Tranche 3 - the last third at ~15% down (≈ ${fmtMoney(price * 0.85, cur)}).`,
          "If tranches 2–3 never fill, you still own a third of a rising quality business - that's fine.",
        ]
      : [
          "Split the planned amount into three tranches: a third now, a third ~7% lower, the last at ~15% lower.",
          "If the lower tranches never fill, you still own a third of a rising quality business - that's fine.",
        ];
  return { style: "TRANCHES", title: "The 3-tranche dip ladder", lines };
}

// ---------- the stance engine ----------

export interface CoachInput {
  symbol: string;
  isEtf: boolean;
  price?: number;
  currency: Currency;
  pnlPct?: number; // fraction
  weightPct?: number; // fraction of portfolio
  verdict?: Verdict;
  action?: Action; // stock decision engine
  valStatus?: ValuationStatus;
  etfVerdict?: EtfVerdict;
  momentum?: MomentumStats;
  regime?: MacroRegime["key"];
}

export interface CoachCall {
  symbol: string;
  stance: Stance;
  headline: string; // one plain sentence
  points: string[]; // evidence bullets, ≤4
  dca?: DcaPlan;
}

const pf = (v: number | undefined, d = 0) =>
  v === undefined ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

export function coachPosition(inp: CoachInput): CoachCall {
  const points: string[] = [];
  const m = inp.momentum ?? {};
  const dip = (m.pctFromHigh !== undefined && m.pctFromHigh <= -0.12) || (m.vs200d !== undefined && m.vs200d < -0.02);
  const nearHigh = m.pctFromHigh !== undefined && m.pctFromHigh >= -0.03;
  const bigProfit = (inp.pnlPct ?? 0) >= 0.4;
  const overweight = (inp.weightPct ?? 0) >= 0.15;
  const fear = inp.regime === "FEAR";
  const expensive = inp.regime === "EXPENSIVE_CALM";

  if (inp.pnlPct !== undefined) {
    points.push(
      `You're sitting on ${pf(inp.pnlPct)}${inp.weightPct !== undefined ? ` and it's ${fmtPct(inp.weightPct, 1)} of the portfolio` : ""} - profit is a reason to check weight, never by itself a reason to sell a compounder.`
    );
  }
  if (m.pctFromHigh !== undefined) {
    points.push(
      `Momentum: ${pf(m.pctFromHigh, 1)} from its 52-week high${m.vs200d !== undefined ? `, ${pf(m.vs200d, 1)} vs its 200-day average` : ""}${m.ret3m !== undefined ? `, ${pf(m.ret3m, 1)} over 3 months` : ""}.`
    );
  }

  // ---------- ETFs: DCA is the default state of the world ----------
  if (inp.isEtf) {
    if (inp.etfVerdict === "REDUCE" || inp.etfVerdict === "SWITCH") {
      return {
        symbol: inp.symbol,
        stance: "REVIEW",
        headline:
          inp.etfVerdict === "REDUCE"
            ? "Fix the sizing/fee problem first - the ETFs tab has the specifics; pause fresh money here meanwhile."
            : "Same exposure exists cheaper - switch first (mind capital-gains tax), then resume the SIP in the cheaper fund.",
        points,
      };
    }
    if (overweight && (inp.weightPct ?? 0) >= 0.3) {
      points.push(`At ${fmtPct(inp.weightPct!, 0)} of the portfolio even a core fund deserves a rebalance check.`);
    }
    const belowDma = m.vs200d !== undefined && m.vs200d < 0;
    if (dip || fear) {
      points.push(
        fear
          ? "The market regime reads fearful - for a core index fund that's a discount, not a warning."
          : "It's trading at a discount to its own trend - dips in broad funds are for buying, not agonizing."
      );
      return {
        symbol: inp.symbol,
        stance: "BUY_DIP",
        headline: "Core fund on sale: keep the SIP running AND add the boost tranche - this is what the cash was waiting for.",
        points,
        dca: sipPlan(belowDma),
      };
    }
    if (expensive) points.push("Regime is calm-and-expensive - the SIP continues at normal size; no hero tranches into strength.");
    return {
      symbol: inp.symbol,
      stance: "DCA",
      headline: "Nothing to decide - this is exactly what systematic monthly buying is for. Automate and look away.",
      points,
      dca: sipPlan(belowDma),
    };
  }

  // ---------- stocks ----------
  if (inp.action === "EXIT" || inp.verdict === "REVIEW_EXIT") {
    points.push("The business fails the long-term quality tests - that's the reason to act, not the price.");
    if ((inp.pnlPct ?? 0) > 0) points.push("Selling a weak business at a profit is a gift - take it into strength, in one or two steps.");
    return {
      symbol: inp.symbol,
      stance: "EXIT_REVIEW",
      headline: "Profit or loss doesn't matter here - the quality case failed. Recycle into a stronger compounder.",
      points,
    };
  }

  const qualityOk = inp.action === "ACCUMULATE" || inp.action === "HOLD" || inp.verdict === "ADD_MORE" || inp.verdict === "HOLD_QUALITY_PRICEY" || inp.verdict === "HOLD";

  if (bigProfit && (inp.valStatus === "PRICEY" || overweight) && !dip) {
    points.push(
      overweight
        ? `Position size (${fmtPct(inp.weightPct!, 0)}) is the honest reason to trim - you're de-risking the portfolio, not calling a top.`
        : "The price has run well past the fair-value estimate - trimming into strength banks some of the market's enthusiasm."
    );
    if (nearHigh) points.push("It's within a few percent of its 52-week high - trims execute best into strength, not after the fall.");
    return {
      symbol: inp.symbol,
      stance: "TRIM",
      headline: "Let the winner run - but right-size it: trim 10–25%, keep the core, and pre-decide where the proceeds go.",
      points,
    };
  }

  if (inp.action === "TRIM") {
    points.push("The thesis is weakening on the numbers - no new money until 2–4 quarters prove it either way.");
    return {
      symbol: inp.symbol,
      stance: "TRIM",
      headline: "Stop adding and consider a partial trim - this one has to earn its place back with results.",
      points,
    };
  }

  if (qualityOk && dip && inp.valStatus !== "PRICEY") {
    points.push(
      fear
        ? "Quality business + market-wide fear + a real drawdown - the classic be-greedy setup, in tranches."
        : "The business passes the tests while the price has pulled back - that's a valuation reset, not decay."
    );
    return {
      symbol: inp.symbol,
      stance: "BUY_DIP",
      headline: "Quality on a pullback: add in three planned tranches - ladders beat lump-sum courage.",
      points,
      dca: trancheLadder(m.lastClose ?? inp.price, inp.currency),
    };
  }

  if (qualityOk) {
    if (expensive || inp.valStatus === "PRICEY") {
      points.push("Price is rich for new money - holding what you own costs nothing; chasing does.");
    }
    return {
      symbol: inp.symbol,
      stance: "HOLD",
      headline: "The thesis is intact and the price isn't a gift - sit tight and let it compound; add only on planned dips.",
      points,
    };
  }

  return {
    symbol: inp.symbol,
    stance: "REVIEW",
    headline: "Not enough conviction either way - treat it as a fresh idea: would you buy it today? If not, why hold?",
    points,
  };
}
