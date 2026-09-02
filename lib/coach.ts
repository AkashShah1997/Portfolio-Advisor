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
  /**
   * "12-1" momentum: the return from ~12 months ago to ~1 month ago, skipping
   * the latest month on purpose (Jegadeesh & Titman 1993): the past year's
   * trend tends to persist for another 3-12 months, while the latest month
   * tends to bounce back. This is the ENTRY-PACING gauge - it never decides
   * whether to buy, only how fast. Daily and weekly moves are never used.
   */
  ret12m1?: number;
  lastClose?: number;
  asOf?: string; // date of last candle
}

export function momentumFromCandles(candles: Candle[]): MomentumStats {
  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 40) return {};
  const last = closes[closes.length - 1];
  // A "52-week high" needs about a year of bars. With two months of data every
  // stock sits AT its high, which silently disabled buy-the-dip on new listings
  // and made "near the high, trims execute well" fire on no evidence.
  const high = closes.length >= 180 ? Math.max(...closes) : undefined;
  const dmaWin = closes.slice(-200);
  // and a "200-day average" needs 200 bars, not 120
  const dma = dmaWin.length >= 200 ? dmaWin.reduce((a, b) => a + b, 0) / dmaWin.length : undefined;
  const i3m = closes.length - 1 - 63;
  // 12-1 momentum needs close to a year of bars: ~12 months ago → ~1 month ago
  const i1m = closes.length - 1 - 21;
  const i12m = Math.max(0, closes.length - 1 - 252);
  const ret12m1 =
    closes.length >= 240 && i1m > i12m && closes[i12m] > 0 ? closes[i1m] / closes[i12m] - 1 : undefined;
  return {
    pctFromHigh: high !== undefined && high > 0 ? last / high - 1 : undefined,
    vs200d: dma ? last / dma - 1 : undefined,
    ret3m: i3m >= 0 && closes[i3m] > 0 ? last / closes[i3m] - 1 : undefined,
    ret12m1,
    lastClose: last,
    asOf: candles[candles.length - 1]?.time,
  };
}

// ---------- entry timing: WHEN and HOW FAST, never WHETHER ----------

export type EntryTimingKey = "FALLING" | "RISING" | "NEUTRAL" | "UNKNOWN";

export interface EntryTiming {
  key: EntryTimingKey;
  label: string;
  /** the plain-language read, always ending in what to do about the PACE */
  text: string;
}

/**
 * The value-plus-momentum finding, applied to one job only: a business that
 * already passed the quality and price tests is bought at a PACE set by its
 * own trend. Cheap stocks still in a year-long slide ("falling knives") tend
 * to keep drifting for months before they turn, and cheap stocks in a
 * year-long rise rarely hand you the dip you are waiting for. Neither fact
 * ever decides WHETHER to buy - fundamentals and price decide that.
 *
 * Inputs are 12-1 momentum and the 200-day average. Nothing shorter is used:
 * this week's move is noise, and the latest month is skipped on purpose.
 */
export function entryTiming(m: MomentumStats): EntryTiming {
  if (m.ret12m1 === undefined) {
    return {
      key: "UNKNOWN",
      label: "Trend unknown",
      text: "Not enough price history for a 12-month trend read - use the standard 3-tranche ladder and let time do the pacing.",
    };
  }
  const below = m.vs200d !== undefined && m.vs200d < 0;
  const above = m.vs200d !== undefined && m.vs200d > 0;
  if (m.ret12m1 <= -0.2 && !above) {
    return {
      key: "FALLING",
      label: "Still falling - buy slower",
      text: `Down ${pf(m.ret12m1, 0)} over the year to last month${below ? " and below its 200-day average" : ""}. A cheap stock in a year-long slide tends to keep drifting for months before it turns, so a good business bought here can sit flat for a long time. Do not skip it - buy it SLOWER: spread the tranches across 2-3 quarters, and let the last tranche wait for the price to reclaim its 200-day average.`,
    };
  }
  if (m.ret12m1 >= 0.2 && !below) {
    return {
      key: "RISING",
      label: "Trending up - do not wait for a dip",
      text: `Up ${pf(m.ret12m1, 0)} over the year to last month${above ? " and above its 200-day average" : ""}. Year-long rises tend to persist, so the dip you are waiting for may never come - if the price is still sane, buy on a fixed schedule instead of waiting.`,
    };
  }
  return {
    key: "NEUTRAL",
    label: "No strong trend",
    text: `${pf(m.ret12m1, 0)} over the year to last month - no strong trend either way. The standard 3-tranche ladder is the right pace.`,
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
      `Momentum: ${pf(m.pctFromHigh, 1)} from its 52-week high${m.vs200d !== undefined ? `, ${pf(m.vs200d, 1)} vs its 200-day average` : ""}${m.ret3m !== undefined ? `, ${pf(m.ret3m, 1)} over 3 months` : ""}${m.ret12m1 !== undefined ? `, ${pf(m.ret12m1, 0)} over the year to last month (12-1 momentum)` : ""}.`
    );
  }
  // Entry pacing (value + momentum): decides HOW FAST to act, never WHETHER.
  const timing = entryTiming(m);

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

  // A holding still IN THE BUY ZONE never gets trimmed on profit: "up 40%" is
  // an anchor to your entry price, not evidence about the business or the
  // price today. If it's overweight AND undervalued, the fix is to direct NEW
  // money elsewhere - selling below fair value to tidy a percentage is how
  // compounders get lost.
  if (bigProfit && overweight && inp.valStatus === "BUY_ZONE") {
    points.push(
      `It's ${fmtPct(inp.weightPct!, 0)} of the portfolio but still priced in the buy zone - being up ${pf(inp.pnlPct)} is an entry-price anchor, not a sell signal. Rebalance by pointing fresh money elsewhere, not by selling cheap.`
    );
  }
  if (bigProfit && (inp.valStatus === "PRICEY" || overweight) && !dip && inp.valStatus !== "BUY_ZONE") {
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
    if (timing.key === "FALLING") points.push(`Entry pacing: ${timing.text}`);
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
    } else if (timing.key === "RISING" && (inp.valStatus === "FAIR" || inp.valStatus === "BUY_ZONE")) {
      points.push(`Entry pacing: ${timing.text}`);
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
