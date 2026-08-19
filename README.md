# 🧭 Portfolio Advisor

Pick a market — **🇮🇳 India (Zerodha)** or **🇨🇦 Canada (Wealthsimple)** — import that broker's CSV,
and get **Buffett · Damani · Jhunjhunwala**-school analysis on a **5-year+ horizon**: what to sell,
what to accumulate, what to buy instead, and why — with every number shown.

**Everything is saved only in your browser** (localStorage): no accounts, no database, no cloud.
Re-open the app and your holdings and watchlist are still there; hit "erase saved data" (or clear
site data) and they're gone. Only stock *symbols* leave the device, to fetch public price data from
**free APIs (no keys needed)**.

## How it's organized

**One market at a time.** The top bar always shows **India | Canada**. Each market keeps its own
holdings, watchlist, and dashboard: India runs in ₹ (NSE/BSE via Zerodha CSV), Canada in C$
(TSX + US listings via Wealthsimple CSV — US positions are handled and converted).

Every holding gets ~5 fiscal years of statements + 5 years of prices and is scored on four pillars:

| Pillar | What it checks | Whose principle |
|---|---|---|
| **Business Quality (Moat)** | ROE ≥15%, ROCE ≥15%, fat & stable margins, no ROE decay, **Coffee Can test** | Buffett · Damani · Jhunjhunwala · Terry Smith · Mukherjea · Agrawal |
| **Financial Fortress** | D/E ≤0.5, interest cover ≥6x, current ratio, FCF positive ≥80% of years | Buffett · Jhunjhunwala · Graham |
| **Growth & Consistency** | Revenue CAGR ≥10%, EPS CAGR ≥12%, no loss years, FCF growing, **reinvestment engine** | Jhunjhunwala · Buffett · Lynch · Akre |
| **Valuation & Margin of Safety** | P/E vs own history, PEG ≤1.5, earnings yield ≥6%, FCF yield ≥4% | Damani · Buffett · Graham · Greenblatt · Pabrai |

Financials get sector-appropriate checks (ROA, leverage, P/B). Every check names its investor and
shows its evidence. ETFs and new listings get an honest "insufficient data" verdict.

## The tabs

**Overview** — hero band with your current value and a **5-year chart of today's holdings**, action
summary, the **Buffett matrix** (quality+growth vs valuation, bubble = weight), allocation /
geography / sector splits, and deep-dive cards per stock: pillar meters, every check with evidence,
an **intrinsic-value band** (Graham Number, Graham growth formula, 10-y owner-earnings DCF,
own-history P/E anchor, justified P/B for financials → buy-below price that demands 20/30/40% margin
of safety by quality), 5-year charts and ratio tables.

**Decisions** — the straight answer to "I've held this for years and it's done nothing":
every holding sorted into **Consider exiting / Trim / Accumulate / Hold** with the full evidence
trail (long-run price CAGR, business growth, score, your P&L, price vs fair estimate, red flags).
A **dead-money detector** flags years of flat price *and* flat earnings — and a coiled-spring guard
refuses to call a growing business an exit just because the price lagged. Below it, the
**upgrade scanner**: same-market quality names that currently screen far stronger than your weak
holdings, one click to watchlist.

**Screeners** — the classic long-term screens, run over your market's scanned universe plus your own
holdings, entirely client-side: **Coffee Can** (Mukherjea), **Magic Formula** (Greenblatt, joint
rank of earnings yield × ROCE), **QGLP** (Agrawal), **Dividend compounders**, **Fortress balance
sheets**, **GARP / PEG ≤ 1** (Lynch), **Quality in the buy zone** (Damani/Graham) — plus a **custom
screen builder** (min score/ROCE/growth, max P/E/PEG/D-E, yield, buy-zone-only, exclude-owned).

**Chart** — TradingView-style charting (built on TradingView's open-source `lightweight-charts`):
candles or area, 6M→Max ranges (daily/weekly/monthly), SMA 50/200, volume, **two-click trendline
drawing**, and the value-investor twist — **your average cost, the fair-value estimate and the
buy-below level drawn on the price axis**. Works for any Yahoo symbol, not just holdings.

**Health & income** — concentration checks (top holding, top-3, HHI), sector caps, capital-in-quality
share, laggard capital, red-flag exposure — each with the master's principle — plus estimated annual
dividend income (yield on value / on cost) and currency exposure.

**Projector** — "buy right, sit tight" in numbers: scenario compounding built from your holdings'
own value-weighted EPS growth, monthly-contribution slider, years-to-double. An illustration, not a
forecast.

**Take it to any AI:** every stock, scanned idea, and decision has a one-click **AI prompt** —
positions, 5-year ratios, scorecard verdicts and fair-value estimates baked in — for ChatGPT,
Claude, Gemini, Perplexity. Optionally paste your own Anthropic API key for in-app Claude
commentary (key lives in tab memory only, never saved).

The UI is animated with [Motion](https://motion.dev) (Framer Motion v12) and typeset in self-hosted
Inter — reduced-motion is respected, and print always shows full content.

---

## Data sources (all free, no API keys)

- **Yahoo Finance** (via [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2), unofficial):
  quotes, ~5y annual statements, 5y monthly prices, and OHLCV history for the chart. Covers NSE
  (`.NS`), BSE (`.BO`), TSX (`.TO`) and US tickers.
- **frankfurter.dev** (ECB rates): INR/CAD/USD conversion, with Yahoo FX pairs as fallback.

## Run locally

```sh
npm install
npm run dev          # http://localhost:3000
```

No environment variables needed. (`MOCK_DATA=1 npm run dev` runs with deterministic demo data —
useful offline or in sandboxes; never set this in production.)

Samples: `public/samples/zerodha-holdings-sample.csv`, `public/samples/wealthsimple-holdings-sample.csv`,
or click **"load a sample portfolio"** inside either market.

## Deploy to Vercel (~3 minutes)

1. Push this folder to a GitHub repo → [vercel.com/new](https://vercel.com/new) → Import.
2. Framework auto-detects as Next.js; set Root Directory if it's a subfolder.
3. Deploy. No env vars, no database. Stock fetches run as serverless functions
   (`maxDuration: 60`, fine on the free Hobby plan). The app fetches 3 stocks at a time and caches
   per-symbol for 10 minutes; a first market scan (~32–43 names) takes ~30–60s, then it's instant.

## Import formats

- **Zerodha** — Console → Portfolio → Holdings → Download CSV. Preamble rows and column variants are
  auto-detected; symbols get `.NS` (series suffixes like `-BE` stripped).
- **Wealthsimple** — any CSV with Symbol / Quantity / (Average cost **or** total Book Cost) /
  Currency. CAD rows get `.TO`; USD rows stay US; book-cost totals convert to per-share.
- Anything the auto-guess gets wrong is editable inline (validate against Yahoo search with
  **check**). Imports replace positions but keep your watchlist.

## Tests

```sh
MOCK_DATA=1 npx tsx test/verify.ts   # parser, ratios, scorecard, valuation, decisions, screeners,
                                     # OHLC history, portfolio series, health, projection, FX (110+ checks)
```

`test/e2e.mjs` drives the whole UI with Playwright against a `MOCK_DATA=1` server: market landing,
import, analysis, decisions board, market scan, screeners, the chart tab, health, projector,
**persistence across reload**, and market switching. Playwright isn't a package dependency —
`npm i --no-save playwright` first; the scripts find Chromium via `CHROME_PATH`, a sandbox install,
or Playwright's own browsers.

---

**Disclaimer:** This tool converts public value-investing principles into arithmetic checks over
free (sometimes imperfect) data. Scan universes are hand-picked starting ponds, not recommendations;
fair-value bands are mechanical estimates, not targets; decisions are disciplined starting points,
not instructions. It is analysis to support your own judgment — **not financial advice** — and it
knows nothing about your taxes, cash needs, or risk tolerance. Verify numbers before acting.
