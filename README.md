# 🧭 Portfolio Advisor

Pick a market - **🇮🇳 India (Zerodha)** or **🇨🇦 Canada (Wealthsimple)** - import that broker's CSV,
and get **Buffett · Damani · Jhunjhunwala**-school analysis on a **5-year+ horizon**: what to sell,
what to accumulate, what to buy instead, and why - with every number shown.

**Everything is saved only in your browser** (localStorage): no accounts, no database, no cloud.
Re-open the app and your holdings and watchlist are still there; hit "erase saved data" (or clear
site data) and they're gone. Only stock *symbols* leave the device, to fetch public price data from
**free APIs (no keys needed)**.

## How it's organized

**One market at a time.** The top bar always shows **India | Canada**. Each market keeps its own
holdings, watchlist, and dashboard: India runs in ₹ (NSE/BSE via Zerodha CSV), Canada in C$
(TSX + US listings via Wealthsimple CSV - US positions are handled and converted).

Every holding gets ~5 fiscal years of statements + 5 years of prices and is scored on four pillars:

| Pillar | What it checks | Whose principle |
|---|---|---|
| **Business Quality (Moat)** | ROE ≥15%, ROCE ≥15%, fat & stable margins, no ROE decay, **Coffee Can test** | Buffett · Damani · Jhunjhunwala · Terry Smith · Mukherjea · Agrawal |
| **Financial Fortress** | D/E ≤0.5, interest cover ≥6x, current ratio, FCF positive ≥80% of years | Buffett · Jhunjhunwala · Graham |
| **Growth & Consistency** | Revenue CAGR ≥10%, EPS CAGR ≥12%, no loss years, FCF growing, **reinvestment engine** | Jhunjhunwala · Buffett · Lynch · Akre |
| **Valuation & Margin of Safety** | P/E vs own history, PEG ≤1.5, earnings yield ≥6%, FCF yield ≥4% | Damani · Buffett · Graham · Greenblatt · Pabrai |

Financials get sector-appropriate checks (ROA, leverage, P/B). Every check names its investor and
shows its evidence. ETFs and new listings get an honest "insufficient data" verdict.

## Simple by default

The dashboard opens with just **four tabs - Overview, Coach, Decisions, ETFs** - and the Overview leads
with **"Your action plan"**: the whole analysis compressed into a few plain sentences (what to sell,
what to stop adding to, which ETF fee to fix, where new money belongs, and what just needs
patience), each line linking to the tab that holds the evidence. One click on **"All tools"**
reveals the full bench, now grouped so the top row stays calm: **Ideas** (Screeners · Smart money -
"what to buy next"), **Checkup** (Health & income · Stress test · Backtest - "is the portfolio
built right?"), plus Chart, the Buffett matrix and the AI prompt generator. The choice is
remembered on-device.

## The tabs

The features are wired to each other, so every finding carries its fix: stock cards show what the
**Decision board says** inline (same engine, zero disagreement), failing health checks link to the
Coach or Decisions, the stress test's hardest-hit names click through to their chart, the hedge
sleeve line links to the ETFs tab, and the Overview's Buffett matrix and AI prompt generator fold
away until wanted (remembered on-device).

**Every ratio explains itself.** Hover (or keyboard-focus) the **ⓘ** beside any metric - screener
headers, custom-filter fields, pillar meters, ratio tables, the valuation snapshot - for a plain-words
card: what the ratio means, how it's computed, and **which direction the value school considers
better** (with the masters' thresholds).

**Market weather** (top of the Overview, both modes; **compact by default** - the regime read, three
posture chips and your hedge sleeve, with all 9 readings one click away and the choice remembered) -
the macro situation from free public data:
index level with 1-year return, distance from the 52-week high and position vs its **200-day
average**; **India VIX / VIX** with fear bands (calm <14 · fear >28); USD/INR / USD/CAD; gold AND
silver; the **gold/silver ratio** (long-run ~60-70, labelled "context, never a signal"); **gold in
YOUR currency** (₹ per 10g for India - what GOLDBEES-style funds track - C$ per oz for Canada); oil;
the US 10-year yield. Below the chips, the **hedge sleeve** line shows what share of your portfolio
sits in gold/silver funds against the classic 5-10% insurance band. All of it condenses into **one plain-words regime read** - "fear is on sale -
deploy gradually into quality" / "market cooling - watchlist season" / "sunny and expensive - demand
a bigger margin of safety" / "nothing extreme - stick to the plan" - with the value-school caveat
printed on it: macro is context for posture, never a timing signal.

**Overview** - hero band with your current value and a **5-year chart of today's holdings** that
flips to **"vs NIFTY 50" / "vs TSX Composite"**: both lines indexed to 100 at the common start, your
±%/yr gap badged - the honest test every hand-picked portfolio must pass. The action summary carries
the **portfolio snowflake** (five axes from the same scorecard: Quality · Growth · Fortress · Value ·
Income, value-weighted - fuller and rounder is better) with **"who carries each arm"** rows naming
the top holdings per axis (so you can see WHICH stocks are your fortress, quality and income), then the **Buffett matrix** (quality+growth
vs valuation, bubble = weight), allocation / geography / sector splits, and deep-dive cards per
stock: **strengths & risks bullets** (each one restates a check the engine actually ran, evidence in
brackets), a per-stock **snowflake**, pillar meters, every check with evidence, an
**intrinsic-value band** (Graham Number, Graham growth formula, 10-y owner-earnings DCF, own-history
P/E anchor, justified P/B for financials → buy-below price that demands 20/30/40% margin of safety
by quality), the **analyst 12-month consensus as labelled context** (their horizon is 1 year, yours
is 5), the **since-you-bought fundamentals journey** (below), 5-year charts, ratio tables, and a
**pre-buy checklist**: ten yes-or-no judgment gates from the masters' actual filters (Lynch's
one-sentence test, Buffett's market-closure test, Munger's inversion, Graham's price-first
discipline). No data feed can tick these - only you can; ticks save on-device per symbol, and if
you can't honestly tick 8 of 10, you're gambling, not investing.

**Since you bought (fundamentals journey)** - every held stock gets a then-vs-now table: revenue,
net income, EPS, ROE/ROCE, margins, leverage, interest cover and FCF **in the fiscal year you
bought** versus **today**, each marked ▲ better / ▼ worse. The buy month is estimated from your
average cost against the price history (editable - set the real month and it's saved on-device).
The verdict separates the three reasons a stock "did nothing" for years: improving business +
lagging price (coiled spring - keep), flat business + flat price (dead money - recycle), or
deteriorating business (the fall is deserved - exit review). The same chip appears on the Decisions
board.

**Deep analysis** - a full page for ANY India/Canada stock (every stock card has a "Deep analysis"
button, and "Deep-dive any stock" in the toolbar takes a bare NSE/TSX code - DMART gets .NS tried
automatically). One screen collects everything the tabs know plus the portal-style extras, powered
honestly: a **rule-based SWOT** with the evidence printed on every line (Strengths/Weaknesses = the
business per the checks; Opportunities/Threats = the situation - price vs value, trend, size, market
weather, even your own concentration); **sector comparison from YOUR OWN scan** (medians and ranks
for ROE, ROCE, growth, P/E, P/B, yield against the scanned universe - the honest version of
"industry P/E", where you can see exactly who the industry is); the **Coach's call** for held
positions or an **entry plan** (fair estimate, buy-below, tranche ladder) for names you don't own;
the **advanced chart**; **who owns it** (promoters/insiders, institutions, top funds); and the full
stock card opened - checks, intrinsic band, snowflake, journey, F-Score, pre-buy checklist.

**Coach** - the "I'm up 50% on this: now what?" screen. Every position gets ONE stance - **Trim a
slice / Sit tight / Buy the dip / Keep DCA-ing / Exit review** - from your profit and weight, the
quality verdict, valuation, **live momentum** (distance from the 52-week high, vs the 200-day
average, 3-month move) and the market regime. DCA is first-class: core ETFs get **SIP plans**
(fixed monthly amount, automated, with a ~1.5× boost rule below the 200-day average, "never skip a
month because it feels high"), and quality-stock pullbacks get **3-tranche dip ladders with actual
prices** (now / −7% / −15%). The framing is value-school throughout: profit is a reason to check
WEIGHT, never by itself a reason to sell a compounder; trims execute into strength; adds happen in
tranches, not lump-sum courage. A **↻ Refresh momentum** button re-pulls every position's price
history and the regime fresh, stamped with the time.

**Decisions** - the straight answer to "I've held this for years and it's done nothing":
every holding sorted into **Consider exiting / Trim / Accumulate / Hold** with the full evidence
trail (long-run price CAGR, business growth, score, your P&L, price vs fair estimate, red flags).
A **dead-money detector** flags years of flat price *and* flat earnings - and a coiled-spring guard
refuses to call a growing business an exit just because the price lagged. Below it, the
**upgrade scanner**: same-market quality names that currently screen far stronger than your weak
holdings, one click to watchlist.

**Ideas › Screeners** - classic long-term screens run over the scanned market universe (**~520 India - the
Nifty 500 tiers · ~235 Canada - the full S&P/TSX Composite · ~900 US - the S&P 500 + MidCap 400**,
merged from official index constituent lists, editable), any **pasted custom list** (≤100 symbols
per paste, repeatable), and
your own holdings - entirely client-side: **Two-year keepers** (quality + zero red flags + sane
price for a 2-year-minimum hold), **Coffee Can** (Mukherjea), **Magic Formula** (Greenblatt),
**QGLP** (Agrawal), **Dividend compounders**, **Fortress balance sheets**, **GARP / PEG ≤ 1**
(Lynch), **Quality in the buy zone** (Damani/Graham) - and **Consensus picks**: the names that pass
**≥3 of the 8 screens at once** (Magic Formula counts only its top 10), ranked by how many agree,
with the agreeing screens listed per row. The screening-universe card surfaces the same thing as an
"almost every buy-list agrees on" strip. **Company size is a first-class dimension**: every name is
banded live from market cap (India SEBI-style: large ≥ ₹1L Cr, mid ≥ ₹25k Cr; Canada/US: ≥ $10B /
≥ $2B), an **All / Large / Mid / Small filter applies on top of every screen**, mid/small rows carry
size badges, and a dedicated **"Mid & small-cap compounders"** screen hunts where tomorrow's large
caps live - with deliberately STRICTER bars (score ≥ 60, zero red flags, ROCE ≥ 18%, EPS growth
≥ 12%, not above fair value), because smaller names have more ways to fail. Plus a
**raw-fundamentals custom builder**:
min/max P/E ("P/E at least…" included), PEG, P/B, D/E, interest cover, ROCE, revenue/EPS CAGR,
dividend yield, payout, FCF yield, market cap, red flags, no-loss-years, buy-zone-only,
exclude-owned. Scan results are **cached on-device for 24h** and refresh incrementally, so screens
stay populated between sessions; failed names are listed with one-click retry.

**ETFs** - fund units can't be judged on stock pillars, so they get the **Bogle lens instead of the
Buffett lens**: every held ETF is analyzed on what actually decides passive outcomes - **MER** (live
from Yahoo when available, else a hand-checked approximate table), what it compounds into (**your
fees in ₹/$ per year and over 10 years**), AUM/closure risk, top-10 concentration, sector mix,
trailing returns, and **duplicate exposure** (two funds tracking the same index = two fee meters,
one exposure). Each fund gets a verdict - **Core add-worthy / Hold / Cheaper twin exists / Reduce**
- with the evidence written out, plus a **"same exposure, lower fee" table** (Nifty 50, Next 50,
midcap, gold, bank, S&P 500, TSX, all-in-one, NASDAQ, dividend, bond categories for both markets)
showing exactly what the switch saves per year and per decade, with the capital-gains-tax caveat
stated. Overweight commodity/thematic positions get flagged against the classic 5–10% cap. An
**"inspect any ETF"** box runs the same analysis on any symbol before you buy it. ETF rows on the
Overview link here instead of pretending the stock scorecard applies. When Yahoo's fund feed has
nothing for a listing (common for NSE ETFs), the tab **falls back** to the curated fee table plus
returns computed from the fund's own price history - labeled "limited data", never silently blank.

**Ideas › Smart money** - regional by design: the **India view leads with "Who owns your stock"** (the
ownership feed covers NSE names; promoters show under insiders) and keeps the US-only 13F bench
opt-in behind a button with the honest reason stated (13Fs are a US disclosure; India has no free
equivalent). The **Canada view leads with the bench** - those are its investable listings. Two
honest lenses on what serious long-horizon capital is doing. (1)
**Superinvestor conviction moves**: a hand-picked bench of nine managers with decades-long public
records (Buffett's Berkshire, Terry Smith's Fundsmith, Akre, Li Lu's Himalaya, Chris Hohn's TCI,
Ackman's Pershing Square, Klarman's Baupost, Gayner's Markel, Rochon's Giverny), read straight from
their official **SEC EDGAR 13F filings** (free, no key - but SEC's fair-access policy requires a
contact address in the User-Agent, so put YOUR email in the `UA` constant in `lib/edgar.ts` when
self-hosting): new buys, ≥20% adds/trims, exits and top-10
weights, quarter over quarter, plus a consensus strip for names bought by ≥2 of the bench -
with the 45-day-lag and US-longs-only caveats stated, not hidden. Each manager's card **loads
independently with per-card retry**, so one slow SEC response never blanks the tab - the consensus
strip fills in as filings arrive. (2) **Who owns your stock**: top
mutual funds/ETFs and institutions holding any symbol (full for US/Canada, partial for NSE, where
promoter stakes appear under "insiders"). One click adds any smart-money name to your watchlist,
where **your own scorecard** judges it.

**Checkup › Backtest** - "would this engine have helped?", answered honestly: the SAME scorecard re-run **as
of 1, 2 or 3 years ago using only data that existed then** - fiscal years ending before the cutoff,
the price on that day, valuation rebuilt from the two (P/E-then, P/B-then); anything unknowable then
(dividend yield, TTM figures, 52-week range) deliberately goes n/a so nothing leaks from the future.
Each verdict bucket then shows what it actually returned since - average CAGR, how many beat the
index over the same window - plus a per-name table (verdict-then → verdict-now with drift arrows)
and a one-line readout that is allowed to deliver bad news. Limits stated on the card: a handful of
names is a sanity check, not statistics; price-only returns; survivor bias; free data caps cutoffs
at ~3 years. Every stock card also carries a **Piotroski F-Score** (0–9 year-over-year
fundamental-improvement tests, hover for the breakdown).

**Checkup › Stress test** - real past crashes applied to what you hold TODAY: the 2000
dot-com bust, the 2008 financial crisis, the 2020 COVID crash, the 2022 rate shock, and - because
gold-pitch videos never mention it - the **1980 gold winter** (gold -65%, 28 years to recover).
Each holding gets its TYPE's historical hit (index funds, gold/silver funds, large caps, mid/small
caps, expensive stocks at P/E ≥ 40), and the card shows your total before/after, the hardest-hit
positions, how long recovery took, and **what kept-running SIPs did** through each bottom. A fire
drill for position sizing with its limits printed on it - arithmetic on the past, not a prediction.

**Chart** - TradingView-style charting (built on TradingView's open-source `lightweight-charts`),
now with **pre-built long-term trendlines**: a log-scale **regression trend channel** (best-fit
compounding line ±2σ rails, with a plain-words read - "trend +14%/yr · 22% up the channel (near
the cheap rail)") and **auto support/resistance** drawn from clustered swing points the market
actually respected (S×3 = support touched 3 times). Both toggle on/off next to:
candles or area, 6M→Max ranges (daily/weekly/monthly), volume, **two-click trendline drawing**, and
the value-investor twist - **your average cost, the fair-value estimate and the buy-below level
drawn on the price axis**. The moving averages are **day-equivalent on every range** (the "200-day
MA" is the 40-week MA on weekly data - not a meaningless 200-week average), both are on by default,
and **golden / death crosses are marked right on the chart** where the 50-day crosses the 200-day.
Works for any Yahoo symbol, not just holdings.

**Checkup › Health & income** - concentration checks (top holding, top-3, HHI - each with a plain-words
tooltip), sector caps **with history's receipts when a threshold is crossed** (Enron/Nokia/Yes Bank
for single names, Nasdaq-2000's 78%-and-15-years for sector bets), capital-in-quality
share, laggard capital, red-flag exposure - each with the master's principle - plus estimated annual
dividend income (yield on value / on cost) and currency exposure.

(The old Projector tab was retired - the Coach's DCA plans and the Backtest answer the same
questions with fewer made-up numbers.)

**Take it to any AI:** every stock, scanned idea, and decision has a one-click **AI prompt** -
positions, 5-year ratios, scorecard verdicts and fair-value estimates baked in - for ChatGPT,
Claude, Gemini, Perplexity. Optionally paste your own Anthropic API key for in-app Claude
commentary (key lives in tab memory only, never saved).

The UI is animated with [Motion](https://motion.dev) (Framer Motion v12) and typeset in self-hosted
Inter - reduced-motion is respected, and print always shows full content. **Dark mode** ships too:
the ☾/☀ toggle in the top bar re-themes everything - cards, charts, the TradingView-style chart -
via the design-token layer, is saved on-device, applies before first paint (no flash), and printing
always falls back to the light palette because paper is light.

---

## Data sources (all free, no API keys)

- **Yahoo Finance** (via [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2), unofficial):
  quotes, ~5y annual statements, 5y monthly prices, and OHLCV history for the chart. Covers NSE
  (`.NS`), BSE (`.BO`), TSX (`.TO`) and US tickers.
- **frankfurter.dev** (ECB rates): INR/CAD/USD conversion, with Yahoo FX pairs as fallback.

The data layer is hardened for free-API reality: a polite global queue (3 in-flight, spaced, with
backoff retries), fundamentals fetched via a minimal 23-field timeseries request (no cookie/crumb,
tiny URL) with the library call and 4-year `quoteSummary` statement history as fallbacks, quotes
falling back to chart metadata when Yahoo's cookie handshake hiccups, and schema validation
disabled so new Yahoo fields never break parsing. Rate-limited symbols surface as retryable
failures instead of silently becoming "insufficient data".

## Run locally

```sh
npm install
npm run dev          # http://localhost:3000
```

No environment variables needed. (`MOCK_DATA=1 npm run dev` runs with deterministic demo data -
useful offline or in sandboxes; never set this in production.)

Samples: `public/samples/zerodha-holdings-sample.csv`, `public/samples/wealthsimple-holdings-sample.csv`,
or click **"load a sample portfolio"** inside either market.

## Deploy to Vercel (~3 minutes)

1. Push this folder to a GitHub repo → [vercel.com/new](https://vercel.com/new) → Import.
2. Framework auto-detects as Next.js; set Root Directory if it's a subfolder.
3. Deploy. No env vars, no database. Stock fetches run as serverless functions
   (`maxDuration: 60`, fine on the free Hobby plan). The app fetches 3 stocks at a time and caches
   per-symbol for 10 minutes. A first FULL market scan is now a big job (the ponds cover whole
indices - ~520 India / ~235 Canada / ~900 US names) and can take 15–30+ minutes against free
Yahoo endpoints; progress saves incrementally every few names, failed names retry with one click,
and the 24-hour on-device cache means you do it roughly once a day at most - refreshes only fetch
what's missing or stale.

## Import formats

- **Zerodha** - Console → Portfolio → Holdings → Download CSV. Preamble rows and column variants are
  auto-detected; symbols get `.NS` (series suffixes like `-BE` stripped).
- **Wealthsimple** - any CSV with Symbol / Quantity / (Average cost **or** total Book Cost) /
  Currency. CAD rows get `.TO`; USD rows stay US; book-cost totals convert to per-share.
  **Multi-account exports are handled**: the same symbol across TFSA/RRSP/personal accounts is
  merged into one position (quantities added, cost-weighted average, accounts remembered and shown
  on the card); a **Security Type** column (EQUITY / EXCHANGE_TRADED_FUND / CURRENCY) is read as the
  authoritative stock-vs-ETF flag - broker's word beats Yahoo's label beats name guessing - and
  **cash rows are excluded** with a note instead of being "analyzed" as stocks.
- Anything the auto-guess gets wrong is editable inline (validate against Yahoo search with
  **check**). Imports replace positions but keep your watchlist.

## Tests

```sh
MOCK_DATA=1 npx tsx test/verify.ts   # parser, ratios, scorecard, valuation, decisions, screeners,
                                     # fundamentals fallbacks, journey, scan cache, OHLC history,
                                     # portfolio series, health, projection, FX, metric glossary,
                                     # snowflake axes, strengths/risks, benchmark indexing, ETF
                                     # detection/catalog/fee-math/verdicts, ETF fallbacks,
                                     # multi-account merging, security-type priority,
                                     # buy-list consensus, the action plan, macro regimes,
                                     # backtest as-of math, Piotroski F-Score, cap tiers,
                                     # the mid/small screen, theme store, the position coach,
                                     # MA crossings, allocation buckets, the pre-buy checklist,
                                     # snowflake axis leaders, the SEC UA contact rule, the crash
                                     # stress test, hard-asset chips, concentration analogs, the
                                     # regression channel + auto S/R, rule-based SWOT, sector peers
                                     # from the scan cache (420+ checks)
```

`test/e2e.mjs` drives the whole UI with Playwright against a `MOCK_DATA=1` server: market landing,
import, analysis, decisions board, market scan, screeners, the chart tab, health, the coach,
**persistence across reload**, and market switching. Playwright isn't a package dependency -
`npm i --no-save playwright` first; the scripts find Chromium via `CHROME_PATH`, a sandbox install,
or Playwright's own browsers.

---

**Disclaimer:** This tool converts public value-investing principles into arithmetic checks over
free (sometimes imperfect) data. Scan universes are hand-picked starting ponds, not recommendations;
fair-value bands are mechanical estimates, not targets; decisions are disciplined starting points,
not instructions. It is analysis to support your own judgment - **not financial advice** - and it
knows nothing about your taxes, cash needs, or risk tolerance. Verify numbers before acting.
