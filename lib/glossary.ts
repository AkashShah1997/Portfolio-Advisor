/**
 * Metric glossary - every ratio and screener column explained in plain words:
 * what it measures, how it's computed, and which direction the long-horizon
 * value school considers better. Rendered by the ⓘ InfoTip component.
 *
 * Keep entries short enough to read on hover: 1–2 sentences of "what",
 * one sentence of "which way is better" with the masters' bar.
 */

export interface MetricInfo {
  /** Full display name, e.g. "ROCE - return on capital employed" */
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
    what: "Where the whole scorecard lands: Add More / Hold / Hold-but-pricey / Watch / Review for Exit - with “insufficient data” when there isn't enough history to judge honestly.",
    better: "A guide for attention, not an instruction: green verdicts earn more capital, red ones earn scrutiny first.",
  },
  flags: {
    name: "Red flags",
    what: "Hard warnings raised from the statements: loss years, interest cover under 2×, D/E above 2, ROE collapsing, chronically negative free cash flow, extreme P/E without growth.",
    better: "Fewer is better - zero is the standard for a multi-year hold. Each flag is a reason a cheap-looking stock might deserve to be cheap.",
  },

  // ---- returns on capital ----
  roce: {
    name: "ROCE - return on capital employed",
    what: "EBIT ÷ (equity + debt): the pre-tax return the business earns on all the money tied up in it, however financed. The single best test of business quality.",
    better: "Higher is better: ≥15% sustained for years is the masters' bar; ≥20% with reinvestment is compounding gold. (Banks are judged on ROE/ROA instead.)",
  },
  roe: {
    name: "ROE - return on equity",
    what: "Net profit ÷ shareholders' equity: what the business earns each year on the owners' money.",
    better: "Higher is better - ≥15% sustained, and without leverage doing all the work (check D/E alongside). Buffett's favourite single yardstick.",
  },
  roa: {
    name: "ROA - return on assets",
    what: "Net profit ÷ total assets. The cleanest quality test for banks and lenders, where equity is thin by design.",
    better: "Higher is better; for a bank ≥1.3% marks a well-run lender (Buffett's bar).",
  },

  // ---- growth ----
  epsCagr: {
    name: "EPS CAGR (~5y)",
    what: "Compound annual growth of earnings per share over the years on record - the growth that actually accrues to you per share, after dilution.",
    better: "Higher and steadier is better: ≥12% doubles earnings roughly every six years. Negative means the business is shrinking per share.",
  },
  revCagr: {
    name: "Revenue CAGR (~5y)",
    what: "Compound annual sales growth. Revenue is the hardest line to window-dress and the raw material of all future profit.",
    better: "Higher is better; ≥10% is the Coffee-Can bar. Profit growth without revenue growth eventually runs out of costs to cut.",
  },
  eps: {
    name: "EPS - earnings per share",
    what: "Net profit ÷ shares outstanding: your slice of the year's profit. The line all valuation ultimately rests on.",
    better: "A rising five-year staircase is what matters - spikes and dips are for traders, steady compounding is for owners.",
  },
  revenue: {
    name: "Revenue",
    what: "The year's total sales - the top line everything else must come from.",
    better: "Growing ≥10%/yr is the quality-growth bar; flat revenue with rising profit is cost-cutting with an expiry date.",
  },
  netIncome: {
    name: "Net income",
    what: "The year's profit after every cost, interest and tax.",
    better: "Positive every year and growing - even one loss year in five disqualifies a Coffee-Can candidate.",
  },
  lossYears: {
    name: "No loss years",
    what: "Requires positive net profit in every one of the last ~5 fiscal years.",
    better: "Consistency is the point: a business that never loses money survives long enough to compound.",
  },

  // ---- valuation ----
  pe: {
    name: "P/E - price to earnings",
    what: "Price ÷ trailing 12-month EPS: how many years of today's earnings you pay up front. Its inverse (1 ÷ P/E) is the earnings yield.",
    better: "Lower is cheaper - but context beats the raw number: compare it to the company's own 5-yr average and to growth (PEG). A rock-bottom P/E can mean the market smells trouble.",
  },
  avgPE: {
    name: "Own 5-yr average P/E",
    what: "The stock's own valuation habit: fiscal-year-end price ÷ that year's EPS, averaged across the years on record.",
    better: "Today's P/E well below its own average - with fundamentals intact - is how Damani buys quality on sale. Well above it means paying up for the same business.",
  },
  approxPE: {
    name: "P/E at fiscal year-end",
    what: "That year's closing price ÷ that year's EPS - the multiple the market put on the stock each year. These form the own-history anchor.",
    better: "Useful as history, not prediction: buying below the stock's own habitual range has been the value investor's edge.",
  },
  peg: {
    name: "PEG - P/E ÷ growth",
    what: "P/E divided by EPS growth rate (in %). Peter Lynch's tool for judging whether growth justifies the price.",
    better: "Lower is better: ≤1 is attractively priced growth, up to 1.5 acceptable for high quality, above 2 you are prepaying many years of the future.",
  },
  pb: {
    name: "P/B - price to book",
    what: "Price ÷ net assets per share. Most meaningful for banks and lenders, whose book value is close to economic reality; less so for asset-light brands.",
    better: "Lower is cheaper, but always pair it with ROE: a 15%-ROE bank under 2× book can be a bargain, a 5%-ROE one is dear even at 1× book.",
  },
  earningsYield: {
    name: "Earnings yield",
    what: "EPS ÷ price - the P/E turned upside-down: the return the business earns on today's price, directly comparable with a bond or deposit rate.",
    better: "Higher is cheaper. ≥6% beats most fixed income with growth on top; Greenblatt's Magic Formula wants it high together with high ROCE.",
  },
  mos: {
    name: "Price vs fair-value estimate",
    what: "How far today's price sits from the median of the mechanical fair-value methods (Graham Number, growth formula, owner-earnings DCF, own-history P/E). −20% = price is 20% BELOW the estimate.",
    better: "More negative is better - that gap is Graham's margin of safety. A positive number means paying above the estimate, so returns lean on growth alone. Treat the estimate as a rough anchor, never a target.",
  },
  buyZone: {
    name: "Buy zone",
    what: "Price at or below the fair-value estimate minus the demanded margin of safety (20–40% depending on quality).",
    better: "Being in it means the valuation risk is on your side - the rarest and most valuable state for a quality business.",
  },
  week52: {
    name: "52-week range",
    what: "The lowest and highest prices of the past year, with today's price sitting between them.",
    better: "Near the low with intact fundamentals is where value hunters look; near the high, expectations carry more of the load. Neither is a signal by itself.",
  },
  marketCap: {
    name: "Market cap",
    what: "Share price × all shares outstanding - what the whole company sells for today.",
    better: "No direction is “better”: large caps buy stability and liquidity, small caps more room to compound and more ways to die. Filter to the size you can hold through a bad year.",
  },

  // ---- income ----
  divYield: {
    name: "Dividend yield",
    what: "Cash dividends per year ÷ price - the slice of your return paid out in cash while you wait.",
    better: "Higher pays you more today, but treat >6% with suspicion (often a fallen price or an unsustainable payout). A growing dividend from a low payout beats a big static yield.",
  },
  payout: {
    name: "Payout ratio",
    what: "The share of profit paid out as dividends; the rest is retained to grow the business.",
    better: "Lower leaves fuel for compounding: ≤60% is comfortable, >80% leaves no cushion, >100% is paid from borrowings or reserves.",
  },

  // ---- balance sheet ----
  d2e: {
    name: "D/E - debt to equity",
    what: "Total debt ÷ shareholders' equity: how much of the business is financed by lenders versus owners.",
    better: "Lower is safer: ≤0.5 is the fortress bar (Buffett), above 2 raises a red flag. Debt is what turns a bad year into a fatal one. (Skipped for banks - borrowing is their business.)",
  },
  icr: {
    name: "Interest cover",
    what: "EBIT ÷ interest expense: how many times operating profit covers the year's interest bill.",
    better: "Higher is safer - ≥6× comfortable, ≥8× fortress; under 2× means profit barely services the debt (red flag).",
  },
  currentRatio: {
    name: "Current ratio",
    what: "Current assets ÷ current liabilities - can the company pay this year's bills without borrowing more?",
    better: "Higher is safer: ≥1.25–1.5 comfortable, under 1 is tight.",
  },
  fcf: {
    name: "FCF - free cash flow",
    what: "Operating cash flow minus capital spending: the real cash the business throws off after maintaining itself - Buffett's “owner earnings”.",
    better: "Positive and growing is the gold standard. Reported profits with chronically negative FCF are accounting, not cash.",
  },
  fcfYield: {
    name: "FCF yield",
    what: "Free cash flow ÷ market cap: the cash return you would earn owning the whole company at today's price.",
    better: "Higher is cheaper: ≥4–5% is attractive for a quality business; near zero means paying for promises.",
  },
  netMargin: {
    name: "Net margin",
    what: "Net profit ÷ revenue: the share of every sale that survives to the bottom line. Fat, stable margins are the footprint of pricing power - a moat.",
    better: "Higher and steadier is better; the right level varies by industry, so weigh the trend more than the number.",
  },

  // ---- pillar meters ----
  pillarQuality: {
    name: "Business Quality (Moat) pillar",
    what: "Scores ROE, ROCE (ROA for banks), margin level and stability, the ROE trend and the Coffee-Can test - is this a business with durable pricing power?",
    better: "Higher is better; ≥70 here alongside ≥60 on growth is the classic compounder profile.",
  },
  pillarFortress: {
    name: "Financial Fortress pillar",
    what: "Scores leverage (D/E), interest cover, liquidity and FCF consistency - can the business survive a bad year without dilution or distress?",
    better: "Higher is safer. Quality carried on a weak balance sheet is quality on loan.",
  },
  pillarGrowth: {
    name: "Growth & Consistency pillar",
    what: "Scores revenue and EPS CAGR, loss years, FCF growth and the reinvestment engine (ROE × retention) - is the business getting bigger per share, reliably?",
    better: "Higher is better; consistency counts as much as speed.",
  },
  pillarValuation: {
    name: "Valuation & Margin of Safety pillar",
    what: "Scores today's price against the company's own history and cash yields: P/E vs its 5-yr average, PEG, earnings yield and FCF yield (P/B for banks).",
    better: "Higher means more safety in the price. A 90-quality business at a 20-valuation score is a great company being a bad stock.",
  },

  // ---- ETFs ----
  mer: {
    name: "MER - total expense ratio",
    what: "What the fund house skims off every year, taken silently out of the NAV - you never see the bill, only the slightly lower return. (India calls it TER.)",
    better: "Lower is better, always: it's the one number about the future you know today. Index funds ≤0.2% is the modern bar; ~1% compounds into a double-digit slice of your wealth over decades - Bogle's whole argument.",
  },
  aum: {
    name: "AUM - fund size",
    what: "Total assets the fund manages. Big funds trade with tight bid-ask spreads and don't get shut down.",
    better: "Bigger is safer for a passive holder; tiny funds (under ~₹100 Cr / $100M) risk wide spreads, tracking wobble, and closure/merger.",
  },
  feeDrag: {
    name: "Fee drag",
    what: "What today's fee compounds into: the gap between growing at the market's rate and growing at (market − MER), applied to your actual position over 10 years.",
    better: "Smaller is better - the point of the number is that a “tiny” 0.8%/yr quietly becomes a five-figure sum over a decade of compounding.",
  },
  etfOverlap: {
    name: "Duplicate exposure",
    what: "Two funds tracking the same index own the same stocks - you're paying two fee meters for one exposure, and it looks more diversified than it is.",
    better: "Consolidate into the cheapest, most liquid one. Diversification means different assets, not more tickers.",
  },
  trailingReturn: {
    name: "Trailing returns (annualized)",
    what: "The fund's compound annual return over the last 1 / 3 / 5 years, distributions included - mostly a mirror of the index it tracks.",
    better: "For an index fund, judge the fee and the index, not last year's number: chasing the hottest recent return is how most fund investors underperform their own funds.",
  },
  topWeight: {
    name: "Top-10 concentration",
    what: "The share of the fund sitting in its ten biggest holdings.",
    better: "Lower is more diversified. Broad indices run ~30–60%; above ~60% the “index fund” is really a bet on a handful of names.",
  },

  // ---- extras ----
  dca: {
    name: "DCA - dollar/rupee-cost averaging",
    what: "Investing a fixed amount on a fixed schedule (SIP), or a pre-planned tranche ladder into dips - so the plan decides when to buy, not your mood.",
    better: "The evidence: automatic, price-blind buying beats waiting for the perfect entry for almost everyone, because time in the market beats timing it. Boost below the 200-day average; never skip a month because it 'feels high'.",
  },
  swot: {
    name: "SWOT (rule-based)",
    what: "Strengths and Weaknesses describe the BUSINESS (what the app's own checks proved or failed); Opportunities and Threats describe the SITUATION (price vs value, trend, company size, market weather, your own position size). Every line carries its evidence.",
    better: "It's a thinking frame, not a verdict: a great business (many strengths) can still be a bad buy (threats side: priced for perfection). Like the portals' SWOT widgets it's rule-based - the difference is you can see every rule.",
  },
  sectorRank: {
    name: "Sector comparison (from your scan)",
    what: "This stock against every SAME-SECTOR name in the market scan cached on your device: the sector median for ROE, ROCE, growth, P/E, P/B and yield, plus this stock's rank on each. The honest version of 'industry P/E' - you can see exactly who the 'industry' is.",
    better: "Beating the median on quality yardsticks (ROE, ROCE, growth) matters most for a long-term holder; a P/E above the sector median is fine IF the quality rank justifies it. Run a market scan to widen the peer set.",
  },
  channel: {
    name: "Trend channel (auto-drawn)",
    what: "A best-fit straight line through the price on a LOG scale (straight in log space = steady compounding), with rails 2 standard deviations above and below. The label shows the growth rate the trend implies and where today's price sits inside the band.",
    better: "Near the LOWER rail = cheap versus its own multi-year trend; near the UPPER rail = stretched. For a 5-year holder it's a patience tool - it says 'wait' or 'this dip is normal', never 'buy now'.",
  },
  autosr: {
    name: "Support & resistance (auto-drawn)",
    what: "Price levels the market has actually respected: swing highs and lows that stood out for weeks, clustered together. More touches = a stronger level. Drawn automatically from the same chart data.",
    better: "Neither is a signal. Long-term buyers use them for tranche placement: staggering buys near tested support beats one buy at a random price. A clean break ABOVE old resistance often turns it into new support.",
  },
  stress: {
    name: "Crash stress test",
    what: "A fire drill: it takes real past crashes (2000, 2008, 2020, 2022, and gold's own 1980 winter) and applies the damage each TYPE of investment took back then to what you hold today. You see your total before and after, which holdings get hit hardest, how long recovery took, and what happened to people who kept buying.",
    better: "There is no better or worse - it's not a prediction. The one question it answers: if your portfolio fell this much next year, would you panic-sell at the bottom? If yes, your position sizes are the problem, and the cheap time to fix them is NOW, while markets are calm.",
  },
  conviction: {
    name: "Conviction vs speculation",
    what: "A 0-100 read of how much of the investment case is already PROVEN rather than assumed, across four pillars: evidence you can check (length and completeness of the record), proof already delivered (returns, profits, cash - on the record, not in the forecast), price that does not need heroics, and durability (survives being wrong for two years). It also names every assumption the case still depends on.",
    better: "Higher means less of the case rests on the future cooperating. It grades EVIDENCE, not outcome: speculations often make money, and the damage comes from owning one while believing it is a conviction - which is how a 3% bet ends up sized like a 20% core holding. The grade maps to a position size, and that is its real job.",
  },
  posture: {
    name: "Posture (buy, wait, or raise cash)",
    what: "A target CASH BAND derived from the opportunity set, not from a forecast: what share of the businesses you scanned are actually inside their buy zone, how much of what you own is priced above fair value, and what the market weather adds. Cash is treated the way the masters used it - the residue of price discipline, not a market call.",
    better: "There is no 'better' stance, only an honest one. Two hard guardrails: the band never targets 0% (dry powder turns a fall into an opportunity) and never targets more than 40% (going fully to cash has cost long-term investors more than the crashes, because nobody gets the re-entry right). Automatic index SIPs keep running in every stance.",
  },
  weatherproof: {
    name: "Weatherproof score",
    what: "Two separate reads. RECESSION RESILIENCE (0-100) is measured from the filings: leverage, interest cover, share of cash-positive years, loss years, margin stability and size - i.e. can this business fund itself through a bad year without dilution. AI DISRUPTION EXPOSURE is a hypothesis about the business MODEL by industry, shown with its counter-argument.",
    better: "Higher resilience is better - above 75 means most of your capital sits in businesses that survive a downturn intact, which is what lets you hold through it. The AI column is not a score to maximise: it flags where one thesis is carrying too much of your portfolio (above ~40% in high-exposure models is a concentrated bet), and it is explicitly arguable.",
  },
  crashRecord: {
    name: "Crash record",
    what: "How this specific stock behaved in every real market shock its price history covers - peak-to-trough fall, the same window for the index, and how many months it took to regain the old high.",
    better: "Smaller falls and faster recoveries are better, but the real use is rehearsal: if the number would have made you sell at the bottom, the position is too big TODAY. Survivor bias is total - the companies that never came back have no chart.",
  },
  goldDesk: {
    name: "The gold desk read",
    what: "A tally of the forces that actually move gold, each marked as helping or hurting: the US 10-year REAL yield and its direction (gold pays no interest, so inflation-protected bond yields are its opportunity cost - the single biggest driver), the US dollar (gold is priced in it), gold vs its own 200-day average, where it sits in its 5-year trend channel, your own currency (a weaker rupee or loonie adds to your local gold return), and miners as sector confirmation.",
    better: "More helping than hurting is a reason to FILL an under-filled 5-10% sleeve steadily - never to exceed it. The read is deliberately blunt about its limits: it paces an insurance purchase, it does not time a trade, and your existing sleeve size overrides every signal on this page.",
  },
  hedge: {
    name: "Hedge sleeve (gold & silver funds)",
    what: "The slice of your portfolio sitting in gold and silver funds. Think of it as insurance: it tends to hold value when stock markets and currencies fall, but it pays no dividend, builds no products, and compounds nothing.",
    better: "The masters cap it around 5-10% of the portfolio. Zero is a valid choice; much more than 10% turns insurance into a bet - and gold itself once fell 65% (1980) and took 28 years to recover. Insurance, not an engine.",
  },
  silver: {
    name: "Silver",
    what: "Gold's volatile little sibling: part precious metal (fear asset), part industrial input (solar panels, electronics). It usually moves in gold's direction but 2-3x as hard, in BOTH directions.",
    better: "Neither direction is 'better' - it's context. Big silver rallies typically come late, after gold has already run; big silver crashes are just as dramatic. If you hold it at all, hold it small.",
  },
  gsRatio: {
    name: "Gold/silver ratio",
    what: "How many ounces of silver one ounce of gold buys. Over the last century it has averaged roughly 60-70.",
    better: "Above ~85, silver is historically cheap compared to gold; below ~50, expensive. But the ratio can stay stretched for YEARS, so it's a patience curiosity, never a timing signal - and never a reason to load up on either metal.",
  },
  goldLocal: {
    name: "Gold in your currency",
    what: "The world gold price converted into your money - ₹ per 10 grams for India (how jewellers and GOLDBEES quote it), C$ per ounce for Canada. It moves with BOTH the world gold price and your currency's strength.",
    better: "Neither direction is 'better'. The useful insight: when the rupee weakens, gold in ₹ rises even if world gold does nothing - that's why gold works as currency insurance for Indian savers, and why its ₹ returns often beat its $ returns.",
  },
  topHolding: {
    name: "Top-holding concentration",
    what: "How much of your total portfolio sits in your single biggest position (and your biggest three). The bigger the share, the more your future depends on one company not stumbling.",
    better: "Lower is safer; the app flags a single name above 25%. History's warning cases - Enron, Nokia in 2000, Yes Bank - were all 'obviously safe' giants that fell 90%+ and never came back. Concentration is only for your single best-understood idea.",
  },
  sectorConc: {
    name: "Sector concentration",
    what: "How much of your portfolio rides one industry. Companies in the same sector share the same fate: one regulation, one technology shift, one bubble bursting hits them all together.",
    better: "Below ~35% in any one sector is the comfortable zone. When one theme owned portfolios before, it ended badly: the Nasdaq fell 78% in 2000 and took 15 years to recover - and the internet was REAL. The theme being right doesn't protect you from the price being wrong.",
  },
  hhi: {
    name: "Concentration index (HHI)",
    what: "One number (0 to 1) that measures how spread out your money really is, counting every position's weight. It answers: 'my 15 stocks - do they BEHAVE like 15, or like 4 big bets with 11 decorations?' The 'effective positions' number next to it is the honest count.",
    better: "Lower is more diversified. Below 0.10 reads as genuinely spread out; above 0.18 means a few names quietly dominate - your portfolio is more concentrated than its length suggests.",
  },
  checklist: {
    name: "Pre-buy gates (research prompt)",
    what: "Ten yes/no questions no data feed can answer, because they are about the BUSINESS not the ticker: the one-sentence explanation, the 10-year test, the named moat, who the competitors are, survival in a terrible year, management's record, governance flags, capital allocation, why the opportunity exists, and the external risks. The app builds a prompt; any AI answers each gate YES / NO / UNKNOWN with the deciding fact and a source.",
    better: "8 clean YES answers is the bar before a full-size position. The prompt forces an explicit UNKNOWN where evidence is missing - that is the honest answer most tools fake, and an UNKNOWN on governance or survival is itself a reason to go smaller or pass.",
  },
  momentum: {
    name: "Momentum (context chips)",
    what: "Where the price sits vs its own recent history: distance from the 52-week high, vs the 200-day average, and the 3-month move.",
    better: "For a long-term buyer these pace decisions, they don't make them: dips in quality are for tranches, strength is where trims execute best. Never a signal on its own.",
  },
  capTier: {
    name: "Company size (market-cap tier)",
    what: "Banded from live market cap: India - large ≥ ₹1,00,000 Cr, mid ≥ ₹25,000 Cr, small below (SEBI-style). Canada/US - large ≥ $10B, mid ≥ $2B, small below.",
    better: "No size is 'better': large = stability and liquidity; mid/small = longer growth runways AND more ways to fail - so the mid & small screen applies STRICTER quality bars, not looser ones.",
  },
  fscore: {
    name: "Piotroski F-Score (0–9, modified)",
    what: "Nine yes/no tests of whether the fundamentals IMPROVED year-over-year: profitable, cash-generative, cash beating book profit, deleveraging, better liquidity, no dilution, rising margins and asset turnover. Hover the number for the per-test breakdown. This app's version is slightly modified: up to 2% share-count growth still counts as 'no dilution' (the original demands strictly none), and tests with missing data drop out of the denominator instead of failing.",
    better: "Higher is better: 8–9 = fundamentals firing on all cylinders, 0–3 = deteriorating. One honest caveat: Piotroski designed and tested it on cheap, out-of-favour value stocks - on expensive glamour stocks its predictive power was much weaker, so read it alongside valuation, never alone.",
  },
  readiness: {
    name: "Decision-ready gate",
    what: "Before any buy/add/trim advice is shown, the app checks itself: enough data to score (coverage), enough years of history, a believable fair-value estimate, a live price, no solvency-level red flag, and no hidden account/tax complication. Anything missing becomes a listed gap. Banks and financials are always at most 'Partly ready', because their riskiest numbers (bad loans, capital adequacy) simply don't exist in free data.",
    better: "Green (Decision-ready) = the verdict can be read as written. Amber (Partly ready) = read the gaps first; they are open questions, not footnotes. Red (Not decision-ready) = the app is refusing to give action advice on this data - on purpose, because a confident answer would be a guess.",
  },
  coverage: {
    name: "Data coverage",
    what: "How much of the scorecard could actually be ANSWERED with available data, weighted by how much each check matters. 100% = every applicable check had real numbers. 50% = half the scorecard sits at n/a - and an n/a is an open question, never a pass.",
    better: "Higher is better. Below 60% the app refuses to recommend fresh money, and the total score should be read loosely: a 75/100 built on 40% coverage is a sketch, not a grade.",
  },
  idleCash: {
    name: "Idle cash",
    what: "Money sitting in your bank or broker account waiting to be invested - NOT your emergency fund, and not money you'll need within about 2 years. Enter it (optional) and the posture card compares your actual cash against the band it suggests, instead of talking percentages about money it can't see. Stored only on this device, like everything else here.",
    better: "Neither more nor less is 'better' - what matters is sitting inside the suggested band for current conditions: enough dry powder that a crash is an opportunity, not so much that a decade of compounding is missed waiting for one.",
  },
  regime: {
    name: "Market weather regime",
    what: "One read combining the index's trend (vs its 200-day average), distance from the 52-week high, and the volatility index's fear bands.",
    better: "There's no 'better' - only posture: fear favours brave buyers of quality (Buffett), calm record-highs demand bigger margins of safety. Never a timing signal.",
  },
  coffeeCan: {
    name: "Coffee Can test",
    what: "The share of years that cleared BOTH bars at once: revenue growth ≥10% and ROCE ≥15% (ROE for banks) - Saurabh Mukherjea's consistency filter.",
    better: "Higher is better: ≥75% of years qualifies a business to be locked away untouched for a decade.",
  },
  analyst: {
    name: "Analyst consensus (12-month)",
    what: "The average sell-side price target and buy/hold/sell tilt, with the number of analysts covering. A 12-month view - far shorter than this app's 5-year horizon.",
    better: "Context only: targets cluster near the current price and get revised after moves, not before. Use it to sense sentiment, never as the thesis.",
  },
  snowflake: {
    name: "The snowflake",
    what: "Five axes, each 0–100 from the same scorecard: Quality (moat), Fortress (balance-sheet safety), Growth (consistency), Value (price vs worth) and Income (dividend paid, covered and fuelled).",
    better: "Fuller and rounder is better; a spike with a hole shows exactly what you are betting on - e.g. great business, bad price.",
  },
  vsBench: {
    name: "Portfolio vs the index",
    what: "Both lines are indexed to 100 at the first common month: your current holdings valued through time versus the market index. Same starting point, same scale.",
    better: "Staying above the dashed line means your picks beat simply buying the index - the honest test every hand-picked portfolio must pass over years.",
  },
};

/** Convenience lookup that tolerates unknown keys. */
export function metricInfo(key: string): MetricInfo | undefined {
  return METRIC_INFO[key];
}
