# 🧭 Portfolio Advisor

Analyze your **Zerodha (India)** + **Wealthsimple (Canada)** portfolio through the lens of
**Warren Buffett, Radhakishan Damani, and Rakesh Jhunjhunwala** — built for investors with a
**5-year+ holding horizon**.

Upload your broker CSVs (or type holdings in), and for every stock the app pulls ~5 fiscal years of
financial statements plus 5 years of prices from **free APIs (no keys needed)**, computes the ratios the
masters care about, and scores each holding on four pillars:

| Pillar | What it checks | Whose principle |
|---|---|---|
| **Business Quality (Moat)** | ROE ≥15%, ROCE ≥15%, fat & stable net margins, no multi-year ROE decline, **Coffee Can test** (rev ≥10% + ROCE ≥15% year after year) | Buffett · Damani · Jhunjhunwala · Terry Smith · Mukherjea · Agrawal |
| **Financial Fortress** | Debt/Equity ≤0.5, interest coverage ≥6x, current ratio, FCF positive in ≥80% of years | Buffett · Jhunjhunwala · Graham |
| **Growth & Consistency** | Revenue CAGR ≥10%, EPS CAGR ≥12%, no loss years, FCF growing, **reinvestment engine** (ROE × retention ≥12%) | Jhunjhunwala · Buffett · Lynch · Akre |
| **Valuation & Margin of Safety** | P/E vs its own 5-yr average, PEG ≤1.5, earnings yield ≥6%, FCF yield ≥4% | Damani · Buffett · Graham · Greenblatt · Pabrai |

The full bench: **Buffett, Munger, Graham, Fisher, Lynch, Akre, Greenblatt, Terry Smith, Pabrai,
Damani, Jhunjhunwala, Raamdeo Agrawal (QGLP), Saurabh Mukherjea (Coffee Can)** — every check in the
app names the investor whose public principle it encodes, and a "masters" reference card in the UI
summarizes each one.

Banks/financials are scored with sector-appropriate checks (ROA, leverage, P/B) instead of D/E and
current ratio. Every check shows its **evidence**, red flags are called out (leverage spikes, loss
years, cash burn, moat erosion), and each stock gets a verdict: **Add More · Hold · Hold-but-pricey ·
Watch · Review for Exit** — always framed for the long term ("buy right, sit tight").

## The dashboard, tab by tab

**Overview** — headline tiles, an action summary grouped by verdict, allocation / geography / sector
charts, and a **quality-vs-price scatter ("the Buffett matrix")**: every holding placed by business
quality + growth vs valuation margin of safety, bubble = weight. The sweet spot is top-right —
wonderful companies at fair prices. Each stock card expands into pillar meters, every check with
evidence, 5-year charts, ratio history, and an **intrinsic-value band**.

**Intrinsic value (rough)** — per stock, a mechanical fair-value estimate blended (median) from
classic methods: **Graham Number**, **Graham growth formula**, a conservative **10-year owner-earnings
DCF** (growth haircut 25%, faded to terminal; 13% discount for INR, 10% for CAD/USD), the stock's
**own-history P/E anchor**, and **justified P/B** for financials. You get a buy-below price that
demands a bigger margin of safety from weaker businesses (20% / 30% / 40% by quality), plotted as a
band with the current price and your average cost marked. A sanity anchor, never a target.

**Upgrade ideas** — the "remove weeds, water flowers" tab. It scans a hand-curated universe of
widely-followed quality names **in the same market** (India / Canada / US — edit `lib/universe.ts`),
scores each with the exact same scorecard, then (a) for every holding rated Watch / Review-for-Exit,
shows same-country businesses currently screening ≥10 points stronger, and (b) ranks the strongest
ideas you don't own, with valuation status and a one-click **＋ watchlist** (scored and charted like a
holding, but carrying no capital). Candidates, not recommendations — the scorecard judges.

**Health & income** — construction-level checks with the investor principle behind each: holding
count, top-holding and top-3 concentration, HHI (effective number of positions), sector cap,
home-market tilt, **capital riding high-quality businesses**, capital stuck in laggards, red-flag
exposure. Plus estimated **annual dividend income** (yield on value and on cost, per-holding bars)
and currency exposure.

**Sit-tight projector** — a compounding illustration of "buy right, sit tight": scenario returns
derived from your holdings' value-weighted EPS growth (clamped, with conservative/optimistic bands),
optional monthly contributions, value-vs-contributed chart, years-to-double. An illustration, not a
forecast — the point is the cost of interrupting compounding.

**Take it to any AI:** the dashboard includes an **AI prompt generator** — pick one stock, several,
or the whole portfolio, choose a goal (deep-dive / buy-sell decision / risk audit / news check), and
it composes a ready-to-paste prompt with your positions, 5-year ratios, scorecard verdicts, and the
intrinsic-value estimate baked in. Works with ChatGPT, Claude, Gemini, Perplexity — no API key
needed. (Manual fill-in versions live in `prompt-templates.md`.) Each stock card and each scanned
idea has a one-click "Copy AI prompt" button.

**Privacy by design:** no database, no accounts. Holdings and watchlists live only in your browser
tab; refresh and they're gone. Optionally paste your own Anthropic API key to add Claude-written
commentary per stock and for the whole portfolio — the key stays in tab memory, is sent only with
those requests, and is never stored.

The UI is animated with [Motion](https://motion.dev) (Framer Motion v12): staggered entrances,
animated meters and count-ups, tab transitions, live scan progress — all respecting your OS
reduced-motion preference, and forced visible in print.

---

## Data sources (all free, no API keys)

- **Yahoo Finance** (via [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2), unofficial):
  quotes, ~5y annual income/balance/cash-flow statements, 5y monthly prices. Covers NSE (`.NS`),
  BSE (`.BO`), TSX (`.TO`) and US tickers.
- **frankfurter.dev** (ECB rates): INR/CAD/USD conversion, with Yahoo FX pairs as automatic fallback.

## Run locally

```sh
npm install
npm run dev          # http://localhost:3000
```

No environment variables needed. (`MOCK_DATA=1 npm run dev` runs with deterministic demo data —
useful offline or in sandboxes; never set this in production.)

Sample import files to try: `public/samples/zerodha-holdings-sample.csv` and
`public/samples/wealthsimple-holdings-sample.csv`, or click **"load a sample portfolio"** in the app.

## Deploy to Vercel (~3 minutes)

**Option A — GitHub (recommended):**

1. Push this `portfolio-advisor` folder to a GitHub repo (it can be a subfolder of your existing repo).
2. Go to [vercel.com/new](https://vercel.com/new) → Import the repo.
3. If the app is a subfolder, set **Root Directory** to `portfolio-advisor`. Framework auto-detects as Next.js.
4. Deploy. No env vars, no database — done.

**Option B — Vercel CLI:**

```sh
npm i -g vercel
cd portfolio-advisor
vercel          # follow prompts; then `vercel --prod`
```

Notes:
- Stock fetches run as serverless functions with `maxDuration: 60` (works on the free Hobby plan).
- Yahoo occasionally rate-limits; the app fetches 3 stocks at a time and caches per-symbol for
  10 minutes on a warm function, so re-runs are fast. A market scan (~30 names) takes ~30–60s the
  first time and is near-instant within the cache window.

## Import formats

- **Zerodha** — Console → Portfolio → Holdings → Download CSV. Preamble rows, `Quantity Available`,
  `Average Price` etc. are auto-detected; symbols get `.NS` (series suffixes like `-BE` are stripped).
- **Wealthsimple** — any CSV with Symbol / Quantity / (Average cost **or** total Book Cost) /
  Currency columns. CAD rows get `.TO`; USD rows stay US. Book-cost totals are converted to per-share.
- Anything the auto-guess gets wrong is editable inline — fix the Yahoo symbol and hit **check**
  (validates against Yahoo search). ETFs and new listings get an honest "insufficient data" verdict
  rather than a fake score.

## Tests

```sh
MOCK_DATA=1 npx tsx test/verify.ts   # parser, ratio math, scorecard, valuation, universes, health, projection, FX (63 checks)
```

`test/e2e.mjs` drives the whole UI with Playwright against a `MOCK_DATA=1` server (all four tabs,
market scan, watchlist add, prompt copy). Playwright isn't a package dependency — `npm i --no-save playwright`
first; the scripts find Chromium via `CHROME_PATH`, a sandbox install, or Playwright's own browsers.

---

**Disclaimer:** This tool converts public value-investing principles into arithmetic checks over free
(sometimes imperfect) data. Scan universes are hand-picked starting ponds, not recommendations, and
intrinsic-value bands are mechanical estimates, not targets. It is analysis to support your own
judgment — **not financial advice** — and it knows nothing about your taxes, cash needs, or risk
tolerance. Verify numbers before acting.
