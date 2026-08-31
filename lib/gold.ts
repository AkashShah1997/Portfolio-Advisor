import type { Market } from "./store";
import type { Candle } from "./history";
import { regressionChannel } from "./history";
import { seriesStats, type SeriesStats } from "./macro";

/**
 * The gold desk - "is this a sensible time to add to the gold sleeve?"
 *
 * Gold has no earnings, so none of the stock machinery applies. What moves it
 * is a short list of macro forces, and they are all readable from free data:
 *
 *   1. REAL interest rates (the big one). Gold pays no coupon, so the return
 *      on inflation-protected government bonds IS its opportunity cost. Real
 *      yields down = gold's headwind lifts. Source: FRED DFII10 (keyless).
 *   2. The US dollar. Gold is priced in dollars, so a weaker dollar mechanically
 *      lifts the price - and a strong dollar caps it.
 *   3. Its own trend and stretch: above/below the 200-day average, and where
 *      price sits inside its 5-year log-regression channel.
 *   4. YOUR currency. An Indian or Canadian buyer earns the gold move PLUS the
 *      currency move; a weakening rupee has historically done half the work.
 *   5. Miners as confirmation - they lever the metal both ways.
 *   6. Central-bank demand: the slow structural bid (context, not a signal).
 *
 * Everything here stays honest about what gold IS: insurance, capped near
 * 5-10% of a portfolio, with 1980 (-65%, 28 years to recover) as the standing
 * reminder that it can be bought at a terrible price too.
 */

export type GoldState = "tailwind" | "headwind" | "neutral" | "unknown";

export interface GoldSignal {
  key: string;
  label: string;
  value: string;
  detail: string;
  state: GoldState;
  /** counted in the tailwind/headwind tally (context rows are not) */
  scored: boolean;
}

export interface GoldRead {
  key: "TAILWIND" | "MIXED" | "HEADWIND" | "STRETCHED" | "SLEEVE_FULL";
  tone: "good" | "neutral" | "warning" | "serious";
  headline: string;
  advice: string;
}

export interface GoldPayload {
  market: Market;
  asOf: string;
  priceUsd?: number;
  local?: { label: string; value: string; ret1y?: number };
  items: GoldSignal[];
  tally: { tailwinds: number; headwinds: number; scored: number };
  read: GoldRead;
  channel?: { cagr?: number; position?: number };
  mock?: boolean;
  errors?: string[];
}

/** Yahoo symbols the gold desk needs (all free, crumb-free chart endpoint). */
export const GOLD_SYMBOLS: Record<Market, { key: string; symbol: string; label: string }[]> = {
  india: [
    { key: "gold", symbol: "GC=F", label: "Gold (USD/oz)" },
    { key: "silver", symbol: "SI=F", label: "Silver (USD/oz)" },
    { key: "dxy", symbol: "DX-Y.NYB", label: "US dollar index" },
    { key: "fx", symbol: "INR=X", label: "USD/INR" },
    { key: "miners", symbol: "GDX", label: "Gold miners (GDX)" },
    { key: "us10y", symbol: "^TNX", label: "US 10-yr yield" },
  ],
  canada: [
    { key: "gold", symbol: "GC=F", label: "Gold (USD/oz)" },
    { key: "silver", symbol: "SI=F", label: "Silver (USD/oz)" },
    { key: "dxy", symbol: "DX-Y.NYB", label: "US dollar index" },
    { key: "fx", symbol: "CAD=X", label: "USD/CAD" },
    { key: "miners", symbol: "GDX", label: "Gold miners (GDX)" },
    { key: "us10y", symbol: "^TNX", label: "US 10-yr yield" },
  ],
};

/** The 10-year TIPS yield: the single most important number for gold. */
export interface RealYield {
  latest?: number; // percent, e.g. 1.85
  chg6m?: number; // percentage points, negative = falling
  asOf?: string;
}

const pct = (v: number | undefined, d = 1) =>
  v === undefined ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const num = (v: number | undefined, d = 0) =>
  v === undefined ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

// ---------------------------------------------------------------------------
// Structural context - slow-moving facts, dated and sourced, NOT live signals.
// ---------------------------------------------------------------------------

export const GOLD_CONTEXT_ASOF = "August 2026";

export interface GoldFact {
  label: string;
  text: string;
  source: string;
}

export const GOLD_CONTEXT: GoldFact[] = [
  {
    label: "Central banks are still net buyers",
    text: "Official-sector buying has run near record levels: Poland (~64t), Uzbekistan (~33t), China (~25t) and Kazakhstan (~20t) led purchases through May 2026, and a record 45% of central banks expect to add to their OWN reserves within a year. Russia and Turkey have been notable sellers. This is a slow structural bid under the price, not a reason to buy today.",
    source: "World Gold Council, central bank statistics (Jul 2026)",
  },
  {
    label: "The US holds the largest official hoard",
    text: "The United States reports 8,133.5 tonnes - more than Germany (3,350t) and Italy (2,452t) combined - and has not been an active buyer or seller for decades. US policy matters to gold through the dollar and real rates, not through its vault.",
    source: "IMF / World Gold Council reserve statistics",
  },
  {
    label: "Why sanctions talk moves gold",
    text: "Every time reserve assets are frozen or the dollar system is used as leverage, other central banks add gold - the one reserve asset that cannot be switched off. That is the mechanism behind the multi-year official bid; it plays out over years, not weeks.",
    source: "World Gold Council central bank surveys",
  },
];

/** Market-specific practicalities: what to actually buy, and what it costs. */
export const GOLD_HOWTO: Record<Market, { title: string; lines: string[]; caution: string }> = {
  india: {
    title: "Buying gold in India",
    lines: [
      "Gold ETFs (GOLDBEES, GOLDIETF, HDFCGOLD) are the cheapest liquid route: expense ratios roughly 0.5-0.8%/yr, held in your demat, no making charges, no purity risk.",
      "Gold mutual funds / FoFs cost slightly more but allow a true monthly SIP without a demat account - better for automation, though note the longer 24-month bar for the 12.5% LTCG rate.",
      "Sovereign Gold Bonds are DISCONTINUED for new issuance - the last tranche was 2023-24 Series IV in February 2024. Older SGBs still trade on the secondary market, but the tax-free-at-maturity benefit applies only to original allottees who hold to the full 8 years.",
      "Tax (since 1 Apr 2025): gold ETFs pay 12.5% long-term capital gains after a 12-MONTH holding period, while gold mutual funds and fund-of-funds need 24 MONTHS for the same rate. Below those thresholds gains are taxed at your slab rate. No indexation either way.",
      "Physical gold and jewellery carry 3% GST plus 5% GST on making charges (often 8-25% of the bill) - fine as ornament, expensive as an investment.",
      "Digital gold is unregulated: SEBI warned in Nov 2025 that it carries no investor protection, plus a 2-3% spread and 3% GST.",
    ],
    caution:
      "A weaker rupee raises the ₹ gold price even when world gold is flat - that currency leg is a real part of gold's job for an Indian saver, and it is also why ₹ returns can look better than the metal actually did.",
  },
  canada: {
    title: "Buying gold in Canada",
    lines: [
      "Physically-backed gold ETFs on the TSX (CGL / CGL.C, MNT, and the US-listed IAU/GLD) are the standard route; management fees run roughly 0.2-0.5%/yr.",
      "Currency-hedged versions (the .C tickers) strip out the USD/CAD move - which removes the currency cushion that has historically been part of gold's defence for a Canadian holder. Unhedged is usually the more honest hedge.",
      "Miner ETFs are NOT gold: they add company, cost and jurisdiction risk on top of the metal, and fall much harder in equity crashes.",
      "Registered accounts matter more than the fee: gold pays no income, so holding it in a TFSA or RRSP shelters the eventual capital gain rather than an annual distribution.",
      "Royal Canadian Mint bars and coins are trustworthy but carry dealer spreads and storage costs that quietly beat any ETF's MER.",
    ],
    caution:
      "Gold in Canadian dollars is a two-part bet: the metal AND the loonie. When oil and the loonie fall together, C$ gold often rises - that correlation is exactly why a small unhedged sleeve travels well here.",
  },
};

// ---------------------------------------------------------------------------
// The signals
// ---------------------------------------------------------------------------

export function buildGoldSignals(
  market: Market,
  stats: Record<string, SeriesStats>,
  real: RealYield,
  channel?: { cagr?: number; position?: number }
): GoldSignal[] {
  const items: GoldSignal[] = [];
  const gold = stats.gold ?? {};
  const silver = stats.silver ?? {};
  const dxy = stats.dxy ?? {};
  const fx = stats.fx ?? {};
  const miners = stats.miners ?? {};

  // 1. real yield level - gold's opportunity cost
  if (real.latest !== undefined) {
    const r = real.latest;
    const state: GoldState = r < 1 ? "tailwind" : r <= 2.2 ? "neutral" : "headwind";
    items.push({
      key: "realYield",
      label: "US 10-yr REAL yield",
      value: `${r.toFixed(2)}%`,
      detail:
        state === "tailwind"
          ? "low real yields: holding a metal that pays nothing costs you little - gold's biggest historical tailwind"
          : state === "headwind"
            ? "high real yields: safe inflation-protected bonds pay well, which is gold's biggest historical headwind"
            : "middling real yields: no strong push either way",
      state,
      scored: true,
    });
  } else {
    items.push({
      key: "realYield",
      label: "US 10-yr REAL yield",
      value: "–",
      detail: "FRED unreachable right now - the single most important gold input is missing, so the read below is weaker than usual",
      state: "unknown",
      scored: false,
    });
  }

  // 2. real yield direction over 6 months
  if (real.chg6m !== undefined) {
    const d = real.chg6m;
    const state: GoldState = d <= -0.25 ? "tailwind" : d >= 0.25 ? "headwind" : "neutral";
    items.push({
      key: "realTrend",
      label: "Real yield, 6-month move",
      value: `${d >= 0 ? "+" : ""}${d.toFixed(2)} pts`,
      detail:
        state === "tailwind"
          ? "real yields FALLING - historically when gold does its best work"
          : state === "headwind"
            ? "real yields RISING - the classic drag on gold"
            : "real yields going sideways",
      state,
      scored: true,
    });
  }

  // 3. the dollar
  if (dxy.last !== undefined) {
    const weak = (dxy.ret1y ?? 0) < -0.02 || dxy.above200dma === false;
    const strong = (dxy.ret1y ?? 0) > 0.05 && dxy.above200dma === true;
    items.push({
      key: "dxy",
      label: "US dollar index",
      value: num(dxy.last, 1),
      detail: `${pct(dxy.ret1y)} 1y · ${dxy.above200dma ? "above" : "below"} its 200-day avg - gold is priced in dollars, so a ${weak ? "softer dollar lifts it mechanically" : strong ? "firm dollar caps it" : "flat dollar is neutral"}`,
      state: weak ? "tailwind" : strong ? "headwind" : "neutral",
      scored: true,
    });
  }

  // 4. gold's own trend - symmetrical, so a broken trend can actually score as a headwind
  if (gold.last !== undefined && gold.above200dma !== undefined) {
    const above = gold.above200dma === true;
    items.push({
      key: "goldTrend",
      label: "Gold vs its 200-day average",
      value: above ? "above" : "below",
      detail: above
        ? "the multi-year uptrend is intact - keep the plan running, don't chase size"
        : "below its own long-term trend: cheaper entries, but momentum is against it - average in, don't lump in",
      state: above ? "tailwind" : "headwind",
      scored: true,
    });
  }

  // 5. stretch inside the 5-year channel
  if (channel?.position !== undefined) {
    const p = channel.position;
    const state: GoldState = p <= 0.35 ? "tailwind" : p >= 0.75 ? "headwind" : "neutral";
    items.push({
      key: "stretch",
      label: "Where it sits in its 5-yr channel",
      value: `${Math.round(p * 100)}% up the band`,
      detail:
        state === "tailwind"
          ? "near the cheap rail of its own long-term trend - the better half of the band to be adding in"
          : state === "headwind"
            ? "near the expensive rail: not a sell, but a reason to add on schedule instead of in size"
            : "mid-channel: neither cheap nor stretched versus its own trend",
      state,
      scored: true,
    });
  }

  // 6. your currency does half the work - but only claim a direction when it is known
  if (fx.last !== undefined) {
    const known = fx.ret1y !== undefined;
    const move = fx.ret1y ?? 0;
    const state: GoldState = !known ? "unknown" : move > 0.01 ? "tailwind" : move < -0.01 ? "headwind" : "neutral";
    items.push({
      key: "fx",
      label: market === "india" ? "USD/INR" : "USD/CAD",
      value: fx.last.toFixed(2),
      detail: !known
        ? `no 1-year history for this pair right now, so the currency leg is unknown - it usually does about half the work of local gold returns`
        : `${pct(fx.ret1y)} 1y - the ${market === "india" ? "rupee" : "loonie"} is ${move > 0.01 ? "weaker, which ADDS to your local gold return" : move < -0.01 ? "firmer, which TRIMS your local gold return" : "roughly flat"} on top of the metal itself`,
      state,
      scored: known,
    });
  }

  // 7. miners as confirmation
  if (miners.ret1y !== undefined && gold.ret1y !== undefined) {
    const spread = miners.ret1y - gold.ret1y;
    const state: GoldState = spread > 0.05 ? "tailwind" : spread < -0.1 ? "headwind" : "neutral";
    items.push({
      key: "miners",
      label: "Miners vs metal (1y)",
      value: `${spread >= 0 ? "+" : ""}${(spread * 100).toFixed(0)} pts`,
      detail:
        state === "tailwind"
          ? "miners leading the metal - money is committing to the sector, not just hedging"
          : state === "headwind"
            ? "miners lagging badly - the rally is defensive money, not sector conviction"
            : "miners tracking the metal",
      state,
      scored: true,
    });
  }

  // context rows (never scored)
  if (gold.last !== undefined && silver.last !== undefined && silver.last > 0) {
    const ratio = gold.last / silver.last;
    items.push({
      key: "gsRatio",
      label: "Gold/silver ratio",
      value: ratio.toFixed(0),
      detail: `${ratio >= 85 ? "silver historically cheap against gold" : ratio <= 50 ? "silver rich against gold" : "inside the long-run 60-70 band"} - context for WHICH metal, never for whether to buy`,
      state: "neutral",
      scored: false,
    });
  }
  items.push({
    key: "centralBanks",
    label: "Central-bank demand",
    value: "net buyers",
    detail: `record-level official buying continues (as of ${GOLD_CONTEXT_ASOF}) - a structural bid that plays out over years, not weeks`,
    state: "neutral",
    scored: false,
  });

  return items;
}

export function readGold(
  items: GoldSignal[],
  channelPosition?: number,
  sleeveShare?: number
): { read: GoldRead; tally: { tailwinds: number; headwinds: number; scored: number } } {
  const scored = items.filter((i) => i.scored && i.state !== "unknown");
  const tailwinds = scored.filter((i) => i.state === "tailwind").length;
  const headwinds = scored.filter((i) => i.state === "headwind").length;
  const tally = { tailwinds, headwinds, scored: scored.length };
  const net = tailwinds - headwinds;

  // the sleeve overrides the macro: a full hedge is a full hedge
  if (sleeveShare !== undefined && sleeveShare >= 0.1) {
    return {
      read: {
        key: "SLEEVE_FULL",
        tone: "warning",
        headline: "Your gold sleeve is already full - the macro doesn't change that.",
        advice:
          "You are at or above the classic 5-10% insurance cap. Whatever the signals say, more gold here buys concentration, not protection. Let new money go to the compounders and let the sleeve drift back inside the band on its own.",
      },
      tally,
    };
  }

  // price paid outranks the tally: a stretched entry is stretched even when the
  // macro is helping - that is the same rule the app applies to expensive stocks
  if (channelPosition !== undefined && channelPosition >= 0.8) {
    return {
      read: {
        key: "STRETCHED",
        tone: "warning",
        headline: "Gold is stretched against its own trend - add on schedule, not in size.",
        advice:
          net >= 2
            ? "The macro is helping, but price still decides: near the top rail of its five-year channel, the odds of a flat year or a drawdown go up. Keep filling an under-filled 5-10% sleeve with the monthly amount and let a pullback place the bigger tranche. Remember 1980: bought at a panic top, gold fell 65% and took 28 years to recover."
            : "Near the top rail of its five-year channel, the odds of a flat year or a drawdown go up. If the sleeve is under-filled, keep the monthly buy running and let a pullback do the rest. Remember 1980: bought at a panic top, gold fell 65% and took 28 years to recover.",
      },
      tally,
    };
  }
  if (net >= 2) {
    return {
      read: {
        key: "TAILWIND",
        tone: "good",
        headline: "The macro wind is behind gold - a reasonable window to top up the sleeve.",
        advice:
          "More of the forces that actually drive gold are helping than hurting. That is a reason to fill an UNDER-filled 5-10% sleeve steadily, in two or three tranches - not a reason to exceed it. Gold is the insurance on the portfolio, never the engine.",
      },
      tally,
    };
  }
  if (net <= -2) {
    return {
      read: {
        key: "HEADWIND",
        tone: "warning",
        headline: "The macro is leaning against gold right now.",
        advice:
          "Real yields and/or the dollar are working against the metal. If you already hold your sleeve, do nothing - insurance is not sold because the weather improved. If you are building one, a slow monthly SIP beats a lump sum here.",
      },
      tally,
    };
  }
  return {
    read: {
      key: "MIXED",
      tone: "neutral",
      headline: "Mixed signals - which is the normal state, and why a schedule beats a decision.",
      advice:
        "Nothing here justifies a big call either way. Fill the sleeve to its 5-10% band with a fixed monthly amount, add a little more when gold sits in the lower half of its channel, and ignore the rest of the noise.",
    },
    tally,
  };
}

export function buildGoldPayload(
  market: Market,
  stats: Record<string, SeriesStats>,
  real: RealYield,
  goldCandles?: Candle[],
  errors?: string[]
): GoldPayload {
  const ch = goldCandles?.length ? regressionChannel(goldCandles) : null;
  const channel = ch ? { cagr: ch.cagr, position: ch.position } : undefined;
  const items = buildGoldSignals(market, stats, real, channel);
  // The server knows nothing about your holdings, so the sleeve override cannot
  // be applied here - GoldPanel re-runs readGold with your actual sleeve share.
  const { read, tally } = readGold(items, channel?.position);
  const gold = stats.gold ?? {};
  const fx = stats.fx ?? {};
  let local: GoldPayload["local"] | undefined;
  if (gold.last !== undefined && fx.last !== undefined) {
    const ret =
      gold.ret1y !== undefined && fx.ret1y !== undefined ? (1 + gold.ret1y) * (1 + fx.ret1y) - 1 : undefined;
    local =
      market === "india"
        ? { label: "Gold in ₹ (10g)", value: `₹${num((gold.last * fx.last * 10) / 31.1035)}`, ret1y: ret }
        : { label: "Gold in C$ (oz)", value: `C$${num(gold.last * fx.last)}`, ret1y: ret };
  }
  return {
    market,
    asOf: new Date().toISOString(),
    priceUsd: gold.last,
    local,
    items,
    tally,
    read,
    channel,
    errors: errors?.length ? errors : undefined,
  };
}

/** Deterministic demo payload for MOCK_DATA=1 runs. */
export function mockGold(market: Market): GoldPayload {
  const stats: Record<string, SeriesStats> = {
    gold: { last: 3390, ret1y: 0.27, fromHigh: -0.035, above200dma: true },
    silver: { last: 52.4, ret1y: 0.31, fromHigh: -0.06, above200dma: true },
    dxy: { last: 97.4, ret1y: -0.061, fromHigh: -0.09, above200dma: false },
    miners: { last: 62.1, ret1y: 0.38, fromHigh: -0.04, above200dma: true },
    us10y: { last: 41.2, ret1y: -0.06 },
    fx:
      market === "india"
        ? { last: 87.6, ret1y: 0.031, above200dma: true }
        : { last: 1.35, ret1y: -0.012, above200dma: false },
  };
  const real: RealYield = { latest: 1.62, chg6m: -0.38, asOf: "2026-08-26" };
  // a synthetic 5y gold series compounding ~11%/yr, currently mid-channel
  const candles: Candle[] = [];
  const start = new Date("2021-08-27").getTime();
  for (let i = 0; i < 260; i++) {
    const base = 1800 * Math.exp((Math.log(1.11) / 52) * i);
    const c = base * (1 + 0.05 * Math.sin(i / 9));
    const d = new Date(start + i * 7 * 24 * 3600 * 1000);
    candles.push({ time: d.toISOString().slice(0, 10), open: c * 0.99, high: c * 1.02, low: c * 0.98, close: c });
  }
  return { ...buildGoldPayload(market, stats, real, candles), mock: true };
}
