# AI Prompt Templates — value-investing analysis (Buffett · Damani · Jhunjhunwala)

These are the same prompts the **AI prompt generator** inside Portfolio Advisor produces — the app
fills every `{placeholder}` automatically from live data and copies the result to your clipboard.
Keep this file as a manual fallback: fill the placeholders yourself and paste into ChatGPT, Claude,
Gemini, Perplexity, or any other AI.

**How to choose a template:** #1 for one stock, #2 for comparing a few, #3 for the whole portfolio.
Then swap the "What I want from you" block if your goal is a decision, a risk audit, or a news check
(blocks at the bottom).

---

## The shared header (start EVERY prompt with this)

```
You are a senior equity research analyst and long-term value investor. Today is {date}.

## Who I am (read this first — it changes the answer)
- I'm a long-term investor with a minimum 5-year holding horizon (often 10+). I hold Indian stocks
  (NSE, via Zerodha) and Canadian/US stocks (via Wealthsimple).
- My philosophy is anchored in Warren Buffett, Radhakishan Damani, and Rakesh Jhunjhunwala, and
  draws on the whole quality-value school: Charlie Munger, Benjamin Graham, Philip Fisher, Peter
  Lynch, Chuck Akre, Joel Greenblatt, Terry Smith, Mohnish Pabrai, Raamdeo Agrawal (QGLP), and
  Saurabh Mukherjea (Coffee Can). Buy wonderful, understandable businesses with durable moats and
  honest management at fair prices — then sit tight. "Buy right, sit tight."
- Frameworks I actively use: QGLP (Quality-Growth-Longevity-at-a-reasonable-Price), Coffee Can
  consistency (revenue growth ≥10% and ROCE ≥15% held year after year), Greenblatt's Magic-Formula
  pairing (earnings yield × return on capital), Akre's compounding machine (high ROE × reinvestment).
- Quality tests I trust: sustained ROE/ROCE ≥ 15%, low debt, interest coverage, positive & growing
  free cash flow, earnings consistency across cycles, margin stability, reinvestment runway.
- Price discipline: I'd rather pay a fair price for a great business than a great price for a
  mediocre one — but I refuse to overpay (P/E vs the company's own history, PEG, earnings yield).
- I am NOT a trader. Short-term price moves matter only as buying opportunities. No momentum or
  technical analysis.
```

---

## Template 1 — one stock (deep dive)

```
{shared header}

## The holding I want analyzed

### {Company name} ({TICKER}) — {sector} / {industry}
- My position: {qty} shares @ avg {avg cost} → invested {amount}; current price {price} ({±x}% unrealized)
- Market snapshot: P/E {x} (own 5-yr avg ≈ {x}), P/B {x}, PEG {x}, dividend yield {x}%,
  52-week range {low}–{high}, market cap {x}
- My screener's verdict: {Add More / Hold / Hold — pricey / Watch / Review for Exit} (score {x}/100 —
  Business Quality: {x}, Financial Fortress: {x}, Growth & Consistency: {x}, Valuation: {x})
- Red flags my screener raised: {list, or "none"}
- Growth ({n}-yr CAGR): revenue {x}%, EPS {x}%, FCF {x}%

5-year financial history (fiscal years):

| Metric         | FY22 | FY23 | FY24 | FY25 | FY26 |
|----------------|------|------|------|------|------|
| Revenue        |      |      |      |      |      |
| Net income     |      |      |      |      |      |
| EPS            |      |      |      |      |      |
| ROE            |      |      |      |      |      |
| ROCE           |      |      |      |      |      |
| Net margin     |      |      |      |      |      |
| Debt/Equity    |      |      |      |      |      |
| Interest cover |      |      |      |      |      |
| Free cash flow |      |      |      |      |      |
| P/E (yr-end)   |      |      |      |      |      |

## What I want from you
1. Bottom line first — in 2–3 sentences: is this a business a Buffett/Damani/Jhunjhunwala-style
   investor should own for the next 5 years, at today's price?
2. Challenge my screener — my tool scored this mechanically from the numbers above. Where would a
   thoughtful analyst disagree with the verdict, and why?
3. Moat & management (qualitative) — what is the durable competitive advantage, is it widening or
   eroding, and what do you know about management quality and capital allocation? (label outside knowledge)
4. The 5-year thesis — exactly what must stay true for this to compound for 5+ years, as 3–5
   falsifiable statements.
5. Bear case — the strongest argument to sell, argued honestly.
6. What to monitor — the 3–4 specific numbers/events in the next 2–4 quarters that would confirm or
   break the thesis.
7. Action & price discipline — add / hold / trim, and roughly what valuation level would change that
   answer (ranges, not precise targets).

{shared rules}
```

---

## Template 2 — several stocks (comparison)

Use Template 1's per-stock block **once per stock**, then replace task 8 onward with:

```
8. Rank them — order these stocks by where incremental capital deserves to go, with one-line
   justifications for each position in the ranking.
```

---

## Template 3 — whole portfolio

Add this block right after the shared header, then include per-stock blocks (Template 1 format):

```
## My portfolio (all values in {CAD/INR/USD})
- Total invested: {x} · current value: {x} · unrealized P&L: {x} ({x}%)
- Geography: India {x}%, Canada {x}%, United States {x}%
- Sectors: {sector} {x}%, {sector} {x}%, …
- Top holding is {x}% of the portfolio · value-weighted quality score {x}/100
- My screener's verdict mix: {e.g. Add More ×2, Hold ×4, Watch ×1}
```

And add these portfolio tasks:

```
8. Portfolio construction — concentration, sector/geography balance, currency exposure (INR/CAD/USD),
   overlap between holdings, and what's missing.
9. Capital recycling — which holdings deserve more capital and which are the weakest claim on it,
   consistent with a 5-year horizon (mind taxes/transaction friction qualitatively).
```

---

## Swap-in goal blocks (replace "What I want from you")

**Buy / add / trim decision:**
```
1. Decision first — for each stock: ADD, HOLD, or TRIM/EXIT, one line each with conviction (high/medium/low).
2. Why — the 3 strongest data-grounded reasons, and the single strongest counter-argument.
3. Price discipline — at what rough valuation (P/E band, earnings-yield threshold, or % drawdown)
   would you flip from HOLD to ADD, or HOLD to EXIT?
4. Position sizing — is the position too big, too small, or right for its quality?
5. The one thing — if I could only track one metric per stock for the next year, what is it and what
   reading would trigger action?
6. Priority order — sequence the actions: what to do first and why.
```

**Risk & red-flag audit:**
```
1. Kill the thesis — act as a short-seller. What is the most credible path to permanent capital loss over 5 years?
2. Balance-sheet stress — using the debt, coverage and FCF history: how does it fare in a recession or rate spike?
3. Earnings quality — any signs reported earnings overstate reality? Label anything you infer.
4. Structural threats — disruption, regulation, promoter/management risk, cyclicality (label outside knowledge).
5. My screener's red flags — real problems or noise? What did it MISS?
6. Risk ranking — which single risk deserves my attention most?
```

**Latest results & news check (for AIs with web access):**
```
1. Latest results — find the most recent 1–2 quarters (my data may lag). Are revenue, margins, EPS
   and debt moving in line with the 5-year history I provided, or is the trend changing?
2. Material news — management changes, acquisitions, regulation, guidance — last ~6 months, with dated sources.
3. Valuation now vs history — cheaper or richer than the 5-yr average P/E I provided?
4. Thesis check — does anything you found strengthen or weaken the long-term compounding thesis?
5. Watchlist — upcoming events (results dates, rulings, launches) for my calendar.
If you do NOT have web access, say so upfront and answer from training knowledge with its cutoff stated.
```

---

## The shared rules (end EVERY prompt with this)

```
## Rules for your answer
- Ground every quantitative claim in the data I provided. If you use knowledge beyond it, label it
  clearly as outside knowledge and state your confidence.
- If any number I provided looks wrong or stale, say so explicitly rather than silently substituting.
- No fake precision: no exact price targets, no "guaranteed" returns.
- Be blunt. Argue the bear case as strongly as the bull case — my biggest risk is falling in love
  with my own holdings.
- Use markdown headers and start with the bottom line.
- End with: "This is analysis, not financial advice."
```
