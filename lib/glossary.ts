/**
 * Metric glossary — every ratio and screener column explained in plain words:
 * what it measures, how it's computed, and which direction the long-horizon
 * value school considers better. Rendered by the ⓘ InfoTip component.
 *
 * Keep entries short enough to read on hover: 1–2 sentences of "what",
 * one sentence of "which way is better" with the masters' bar.
 */

export interface MetricInfo {
  /** Full display name, e.g. "ROCE — return on capital employed" */
  name: string;
  /** Plain-words meaning / formula */
  what: string;
  /** Direction + threshold guidance ("higher is better; ≥15% is the bar") */
  better: string;
}

export const METRIC_INFO: Record<string, MetricInfo> = {
  // ---- headline ----
  score: {
    name: "Quality score (0–100)",
    what: "The weighted total of every check across the four pillars: business quality (moat), financial fortress, growth & consistency, and valuation.",
    better: "Higher is better. ≥70 is compounder territory, 55–70 solid, below 55 the burden of proof is on the story, not the numbers.",
  },
  verdict: {
    name: "Verdict",
    what: "Where the whole scorecard lands: Add More / Hold / Hold-but-pricey / Watch / Review for Exit — with “insufficient data” when there isn't enough history to judge honestly.",
    better: "A guide for attention, not an instruction: green verdicts earn more capital, red ones earn scrutiny first.",
  },
  flags: {
    name: "Red flags",
    what: "Hard warnings raised from the statements: loss years, interest cover under 2×, D/E above 2, ROE collapsing, chronically negative free cash flow, extreme P/E without growth.",
    better: "Fewer is better — zero is the standard for a multi-year hold. Each flag is a reason a cheap-looking stock might deserve to be cheap.",
  },

  // ---- returns on capital ----
  roce: {
    name: "ROCE — return on capital employed",
    what: "EBIT ÷ (equity + debt): the pre-tax return the business earns on all the money tied up in it, however financed. The single best test of business quality.",
    better: "Higher is better: ≥15% sustained for years is the masters' bar; ≥20% with reinvestment is compounding gold. (Banks are judged on ROE/ROA instead.)",
  },
  roe: {
    name: "ROE — return on equity",
    what: "Net profit ÷ shareholders' equity: what the business earns each year on the owners' money.",
    better: "Higher is better — ≥15% sustained, and without leverage doing all the work (check D/E alongside). Buffett's favourite single yardstick.",
  },
  roa: {
    name: "ROA — return on assets",
    what: "Net profit ÷ total assets. The cleanest quality test for banks and lenders, where equity is thin by design.",
    better: "Higher is better; for a bank ≥1.3% marks a well-run lender (Buffett's bar).",
  },

  // ---- growth ----
  epsCagr: {
    name: "EPS CAGR (~5y)",
    what: "Compound annual growth of earnings per share over the years on record — the growth that actually accrues to you per share, after dilution.",
    better: "Higher and steadier is better: ≥12% doubles earnings roughly every six years. Negative means the business is shrinking per share.",
  },
  revCagr: {
    name: "Revenue CAGR (~5y)",
    what: "Compound annual sales growth. Revenue is the hardest line to window-dress and the raw material of all future profit.",
    better: "Higher is better; ≥10% is the Coffee-Can bar. Profit growth without revenue growth eventually runs out of costs to cut.",
  },
  eps: {
    name: "EPS — earnings per share",
    what: "Net profit ÷ shares outstanding: your slice of the year's profit. The line all valuation ultimately rests on.",
    better: "A rising five-year staircase is what matters — spikes and dips are for traders, steady compounding is for owners.",
  },
  revenue: {
    name: "Revenue",
    what: "The year's total sales — the top line everything else must come from.",
    better: "Growing ≥10%/yr is the quality-growth bar; flat revenue with rising profit is cost-cutting with an expiry date.",
  },
  netIncome: {
    name: "Net income",
    what: "The year's profit after every cost, interest and tax.",
    better: "Positive every year and growing — even one loss year in five disqualifies a Coffee-Can candidate.",
  },
  lossYears: {
    name: "No loss years",
    what: "Requires positive net profit in every one of the last ~5 fiscal years.",
    better: "Consistency is the point: a business that never loses money survives long enough to compound.",
  },

  // ---- valuation ----
  pe: {
    name: "P/E — price to earnings",
    what: "Price ÷ trailing 12-month EPS: how many years of today's earnings you pay up front. Its inverse (1 ÷ P/E) is the earnings yield.",
    better: "Lower is cheaper — but context beats the raw number: compare it to the company's own 5-yr average and to growth (PEG). A rock-bottom P/E can mean the market smells trouble.",
  },
  avgPE: {
    name: "Own 5-yr average P/E",
    what: "The stock's own valuation habit: fiscal-year-end price ÷ that year's EPS, averaged across the years on record.",
    better: "Today's P/E well below its own average — with fundamentals intact — is how Damani buys quality on sale. Well above it means paying up for the same business.",
  },
  approxPE: {
    name: "P/E at fiscal year-end",
    what: "That year's closing price ÷ that year's EPS — the multiple the market put on the stock each year. These form the own-history anchor.",
    better: "Useful as history, not prediction: buying below the stock's own habitual range has been the value investor's edge.",
  },
  peg: {
    name: "PEG — P/E ÷ growth",
    what: "P/E divided by EPS growth rate (in %). Peter Lynch's tool for judging whether growth justifies the price.",
    better: "Lower is better: ≤1 is attractively priced growth, up to 1.5 acceptable for high quality, above 2 you are prepaying many years of the future.",
  },
  pb: {
    name: "P/B — price to book",
    what: "Price ÷ net assets per share. Most meaningful for banks and lenders, whose book value is close to economic reality; less so for asset-light brands.",
    better: "Lower is cheaper, but always pair it with ROE: a 15%-ROE bank under 2× book can be a bargain, a 5%-ROE one is dear even at 1× book.",
  },
  earningsYield: {
    name: "Earnings yield",
    what: "EPS ÷ price — the P/E turned upside-down: the return the business earns on today's price, directly comparable with a bond or deposit rate.",
    better: "Higher is cheaper. ≥6% beats most fixed income with growth on top; Greenblatt's Magic Formula wants it high together with high ROCE.",
  },
  mos: {
    name: "Price vs fair-value estimate",
    what: "How far today's price sits from the median of the mechanical fair-value methods (Graham Number, growth formula, owner-earnings DCF, own-history P/E). −20% = price is 20% BELOW the estimate.",
    better: "More negative is better — that gap is Graham's margin of safety. A positive number means paying above the estimate, so returns lean on growth alone. Treat the estimate as a rough anchor, never a target.",
  },
  buyZone: {
    name: "Buy zone",
    what: "Price at or below the fair-value estimate minus the demanded margin of safety (20–40% depending on quality).",
    better: "Being in it means the valuation risk is on your side — the rarest and most valuable state for a quality business.",
  },
  week52: {
    name: "52-week range",
    what: "The lowest and highest prices of the past year, with today's price sitting between them.",
    better: "Near the low with intact fundamentals is where value hunters look; near the high, expectations carry more of the load. Neither is a signal by itself.",
  },
  marketCap: {
    name: "Market cap",
    what: "Share price × all shares outstanding — what the whole company sells for today.",
    better: "No direction is “better”: large caps buy stability and liquidity, small caps more room to compound and more ways to die. Filter to the size you can hold through a bad year.",
  },

  // ---- income ----
  divYield: {
    name: "Dividend yield",
    what: "Cash dividends per year ÷ price — the slice of your return paid out in cash while you wait.",
    better: "Higher pays you more today, but treat >6% with suspicion (often a fallen price or an unsustainable payout). A growing dividend from a low payout beats a big static yield.",
  },
  payout: {
    name: "Payout ratio",
    what: "The share of profit paid out as dividends; the rest is retained to grow the business.",
    better: "Lower leaves fuel for compounding: ≤60% is comfortable, >80% leaves no cushion, >100% is paid from borrowings or reserves.",
  },

  // ---- balance sheet ----
  d2e: {
    name: "D/E — debt to equity",
    what: "Total debt ÷ shareholders' equity: how much of the business is financed by lenders versus owners.",
    better: "Lower is safer: ≤0.5 is the fortress bar (Buffett), above 2 raises a red flag. Debt is what turns a bad year into a fatal one. (Skipped for banks — borrowing is their business.)",
  },
  icr: {
    name: "Interest cover",
    what: "EBIT ÷ interest expense: how many times operating profit covers the year's interest bill.",
    better: "Higher is safer — ≥6× comfortable, ≥8× fortress; under 2× means profit barely services the debt (red flag).",
  },
  currentRatio: {
    name: "Current ratio",
    what: "Current assets ÷ current liabilities — can the company pay this year's bills without borrowing more?",
    better: "Higher is safer: ≥1.25–1.5 comfortable, under 1 is tight.",
  },
  fcf: {
    name: "FCF — free cash flow",
    what: "Operating cash flow minus capital spending: the real cash the business throws off after maintaining itself — Buffett's “owner earnings”.",
    better: "Positive and growing is the gold standard. Reported profits with chronically negative FCF are accounting, not cash.",
  },
  fcfYield: {
    name: "FCF yield",
    what: "Free cash flow ÷ market cap: the cash return you would earn owning the whole company at today's price.",
    better: "Higher is cheaper: ≥4–5% is attractive for a quality business; near zero means paying for promises.",
  },
  netMargin: {
    name: "Net margin",
    what: "Net profit ÷ revenue: the share of every sale that survives to the bottom line. Fat, stable margins are the footprint of pricing power — a moat.",
    better: "Higher and steadier is better; the right level varies by industry, so weigh the trend more than the number.",
  },

  // ---- pillar meters ----
  pillarQuality: {
    name: "Business Quality (Moat) pillar",
    what: "Scores ROE, ROCE (ROA for banks), margin level and stability, the ROE trend and the Coffee-Can test — is this a business with durable pricing power?",
    better: "Higher is better; ≥70 here alongside ≥60 on growth is the classic compounder profile.",
  },
  pillarFortress: {
    name: "Financial Fortress pillar",
    what: "Scores leverage (D/E), interest cover, liquidity and FCF consistency — can the business survive a bad year without dilution or distress?",
    better: "Higher is safer. Quality carried on a weak balance sheet is quality on loan.",
  },
  pillarGrowth: {
    name: "Growth & Consistency pillar",
    what: "Scores revenue and EPS CAGR, loss years, FCF growth and the reinvestment engine (ROE × retention) — is the business getting bigger per share, reliably?",
    better: "Higher is better; consistency counts as much as speed.",
  },
  pillarValuation: {
    name: "Valuation & Margin of Safety pillar",
    what: "Scores today's price against the company's own history and cash yields: P/E vs its 5-yr average, PEG, earnings yield and FCF yield (P/B for banks).",
    better: "Higher means more safety in the price. A 90-quality business at a 20-valuation score is a great company being a bad stock.",
  },

  // ---- extras ----
  coffeeCan: {
    name: "Coffee Can test",
    what: "The share of years that cleared BOTH bars at once: revenue growth ≥10% and ROCE ≥15% (ROE for banks) — Saurabh Mukherjea's consistency filter.",
    better: "Higher is better: ≥75% of years qualifies a business to be locked away untouched for a decade.",
  },
  analyst: {
    name: "Analyst consensus (12-month)",
    what: "The average sell-side price target and buy/hold/sell tilt, with the number of analysts covering. A 12-month view — far shorter than this app's 5-year horizon.",
    better: "Context only: targets cluster near the current price and get revised after moves, not before. Use it to sense sentiment, never as the thesis.",
  },
  snowflake: {
    name: "The snowflake",
    what: "Five axes, each 0–100 from the same scorecard: Quality (moat), Fortress (balance-sheet safety), Growth (consistency), Value (price vs worth) and Income (dividend paid, covered and fuelled).",
    better: "Fuller and rounder is better; a spike with a hole shows exactly what you are betting on — e.g. great business, bad price.",
  },
  vsBench: {
    name: "Portfolio vs the index",
    what: "Both lines are indexed to 100 at the first common month: your current holdings valued through time versus the market index. Same starting point, same scale.",
    better: "Staying above the dashed line means your picks beat simply buying the index — the honest test every hand-picked portfolio must pass over years.",
  },
};

/** Convenience lookup that tolerates unknown keys. */
export function metricInfo(key: string): MetricInfo | undefined {
  return METRIC_INFO[key];
}
