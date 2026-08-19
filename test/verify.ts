/**
 * Verification script: parser mappings, scorecard math, FX conversion.
 * Run: MOCK_DATA=1 npx tsx test/verify.ts
 */
import { readFileSync } from "node:fs";
import { parseBrokerCsv } from "../lib/parse";
import { mockHistory, mockStockData } from "../lib/mock";
import { buildScorecard, computeRatios } from "../lib/scorecard";
import { portfolioSeries, summarize } from "../lib/portfolio";
import { buildPrompt } from "../lib/promptgen";
import { decideAll, decideRow, priceCagrOf } from "../lib/decisions";
import { runCustom, SCREENS, toMetricRow, type MetricRow } from "../lib/screens";
import { sma } from "../lib/history";
import { loadHoldings, saveHoldings } from "../lib/store";
import type { StockData } from "../lib/types";
import { buildValuation } from "../lib/valuation";
import { UNIVERSES, UNIVERSE_COUNTRIES, candidatesFor } from "../lib/universe";
import { computeHealth, computeIncome, activeRows } from "../lib/health";
import { project, portfolioGrowthGuess, yearsToMultiple } from "../lib/project";
import { currencyForSymbol } from "../lib/symbols";
import type { AnalyzedHolding, FxRates } from "../lib/types";

let failures = 0;
function check(name: string, cond: boolean, note = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name} ${note}`);
  }
}

console.log("\n== Zerodha CSV parsing ==");
{
  const csv = readFileSync("public/samples/zerodha-holdings-sample.csv", "utf8");
  const res = parseBrokerCsv(csv, "zerodha");
  check("5 holdings parsed", res.holdings.length === 5, `got ${res.holdings.length}`);
  const rel = res.holdings.find((h) => h.rawSymbol === "RELIANCE");
  check("RELIANCE → RELIANCE.NS", rel?.yahooSymbol === "RELIANCE.NS", rel?.yahooSymbol ?? "missing");
  check("RELIANCE qty=40", rel?.quantity === 40);
  check("RELIANCE avg=2450.50", Math.abs((rel?.avgCost ?? 0) - 2450.5) < 1e-9);
  check("currency INR", rel?.currency === "INR");
  check(
    "uses Quantity Available (not pledged)",
    res.holdings.every((h) => h.quantity > 0)
  );
}

console.log("\n== Zerodha auto-detect (no hint) ==");
{
  const csv = readFileSync("public/samples/zerodha-holdings-sample.csv", "utf8");
  const res = parseBrokerCsv(csv);
  check("broker detected as zerodha", res.detectedBroker === "zerodha", res.detectedBroker);
}

console.log("\n== Wealthsimple CSV parsing (Book Cost = total) ==");
{
  const csv = readFileSync("public/samples/wealthsimple-holdings-sample.csv", "utf8");
  const res = parseBrokerCsv(csv, "wealthsimple");
  check("5 holdings parsed", res.holdings.length === 5, `got ${res.holdings.length}`);
  const shop = res.holdings.find((h) => h.rawSymbol === "SHOP");
  check("SHOP → SHOP.TO via CAD hint", shop?.yahooSymbol === "SHOP.TO", shop?.yahooSymbol ?? "missing");
  check("SHOP avg = 1425/15 = 95", Math.abs((shop?.avgCost ?? 0) - 95) < 1e-9, String(shop?.avgCost));
  const aapl = res.holdings.find((h) => h.rawSymbol === "AAPL");
  check("AAPL stays US (USD hint)", aapl?.yahooSymbol === "AAPL", aapl?.yahooSymbol ?? "missing");
  check("AAPL avg = 175", Math.abs((aapl?.avgCost ?? 0) - 175) < 1e-9, String(aapl?.avgCost));
  check("AAPL currency USD", aapl?.currency === "USD");
}

console.log("\n== Ratio math (hand-computed vs computeRatios) ==");
{
  const years = [
    {
      year: 2024,
      endDate: "2024-03-31",
      revenue: 1000,
      netIncome: 150,
      ebit: 220,
      equity: 750,
      totalDebt: 250,
      interestExpense: 20,
      currentAssets: 400,
      currentLiabilities: 200,
      dilutedEPS: 15,
      fcf: 120,
    },
  ];
  const r = computeRatios(years, [])[0];
  check("ROE = 150/750 = 20%", Math.abs((r.roe ?? 0) - 0.2) < 1e-9);
  check("ROCE = 220/1000 = 22%", Math.abs((r.roce ?? 0) - 0.22) < 1e-9);
  check("net margin = 15%", Math.abs((r.netMargin ?? 0) - 0.15) < 1e-9);
  check("D/E = 250/750", Math.abs((r.debtToEquity ?? 0) - 250 / 750) < 1e-9);
  check("ICR = 220/20 = 11x", Math.abs((r.interestCoverage ?? 0) - 11) < 1e-9);
  check("current ratio = 2", Math.abs((r.currentRatio ?? 0) - 2) < 1e-9);
}

console.log("\n== Scorecard on mock profiles ==");
{
  const tcs = buildScorecard(mockStockData("TCS.NS"));
  console.log(`  TCS.NS → score ${tcs.totalScore}, verdict ${tcs.verdict}`);
  check("TCS scores high (≥65)", tcs.totalScore >= 65, String(tcs.totalScore));
  check("TCS not flagged for exit", tcs.verdict !== "REVIEW_EXIT" && tcs.verdict !== "WATCH", tcs.verdict);
  check("TCS has no red flags", tcs.redFlags.length === 0, tcs.redFlags.join("; "));

  const hdfc = buildScorecard(mockStockData("HDFCBANK.NS"));
  console.log(`  HDFCBANK.NS → score ${hdfc.totalScore}, verdict ${hdfc.verdict}`);
  check("HDFC treated as financial sector", hdfc.isFinancialSector);
  check(
    "HDFC has no D/E check (financial)",
    !hdfc.checks.some((c) => c.id === "d2e"),
    hdfc.checks.map((c) => c.id).join(",")
  );
  check("HDFC has ROA check instead", hdfc.checks.some((c) => c.id === "roa"));
  check(
    "HDFC not punished by leverage red-flag",
    !hdfc.redFlags.some((f) => f.includes("Debt-to-equity")),
    hdfc.redFlags.join("; ")
  );

  const tata = buildScorecard(mockStockData("TATAMOTORS.NS"));
  console.log(`  TATAMOTORS.NS → score ${tata.totalScore}, verdict ${tata.verdict}`);
  const cons = tata.checks.find((c) => c.id === "consistency");
  check("Tata Motors loss year dents consistency", (cons?.score ?? 1) < 1, `score ${cons?.score}`);

  const enb = buildScorecard(mockStockData("ENB.TO"));
  console.log(`  ENB.TO → score ${enb.totalScore}, verdict ${enb.verdict}`);
  const d2e = enb.checks.find((c) => c.id === "d2e");
  check("Enbridge D/E check present and not full marks", (d2e?.score ?? 1) < 1, `score ${d2e?.score}`);

  // Sanity across all curated + generic symbols: totalScore within 0..100, verdict set
  const syms = ["RELIANCE.NS", "ITC.NS", "SHOP.TO", "RY.TO", "AAPL", "MSFT", "UNKNOWN.NS", "RANDOM.TO", "ZZZZ"];
  let ok = true;
  for (const s of syms) {
    const sc = buildScorecard(mockStockData(s));
    if (sc.totalScore < 0 || sc.totalScore > 100 || !sc.verdict) ok = false;
  }
  check("all scores within 0..100 with verdicts", ok);

  // New masters' checks
  const tcs2 = buildScorecard(mockStockData("TCS.NS"));
  const coffee = tcs2.checks.find((c) => c.id === "coffeecan");
  check("Coffee Can check exists with evidence", !!coffee && /years met both bars/.test(coffee.detail), coffee?.detail);
  check("TCS Coffee Can ≥ half credit (high ROCE, ~10% growth)", (coffee?.score ?? 0) >= 0.5, `score ${coffee?.score}`);
  const reinvest = tcs2.checks.find((c) => c.id === "reinvest");
  check("Reinvestment engine check exists", !!reinvest && reinvest.status !== "na", `${reinvest?.status}: ${reinvest?.detail}`);
  const hdfc2 = buildScorecard(mockStockData("HDFCBANK.NS"));
  const coffeeFin = hdfc2.checks.find((c) => c.id === "coffeecan");
  check("Coffee Can uses ROE for financials", !!coffeeFin && coffeeFin.label.includes("ROE"), coffeeFin?.label);
  const attributions = tcs2.checks.map((c) => c.philosophy).join(" ");
  check(
    "new masters appear in check attributions",
    /Terry Smith/.test(attributions) && /Greenblatt/.test(attributions) && /Akre/.test(attributions) && /Mukherjea/.test(attributions) && /Lynch/.test(attributions),
    attributions.slice(0, 120)
  );
}

console.log("\n== FX + portfolio summary ==");
{
  const fx: FxRates = {
    base: "CAD",
    rates: { CAD: 1, USD: 1.36, INR: 1.36 / 87.2 },
    asOf: "t",
    source: "test",
  };
  const rows: AnalyzedHolding[] = [
    {
      holding: {
        id: "1",
        broker: "zerodha",
        rawSymbol: "TCS",
        yahooSymbol: "TCS.NS",
        quantity: 10,
        avgCost: 3000,
        currency: "INR",
      },
      data: mockStockData("TCS.NS"),
      scorecard: buildScorecard(mockStockData("TCS.NS")),
      invested: 30000, // INR
      currentValue: 40000, // INR
      pnl: 10000,
      pnlPct: 1 / 3,
    },
    {
      holding: {
        id: "2",
        broker: "wealthsimple",
        rawSymbol: "AAPL",
        yahooSymbol: "AAPL",
        quantity: 10,
        avgCost: 175,
        currency: "USD",
      },
      data: mockStockData("AAPL"),
      scorecard: buildScorecard(mockStockData("AAPL")),
      invested: 1750, // USD
      currentValue: 2000, // USD
      pnl: 250,
      pnlPct: 250 / 1750,
    },
  ];
  const s = summarize(rows, fx);
  const expInvested = 30000 * (1.36 / 87.2) + 1750 * 1.36;
  const expCurrent = 40000 * (1.36 / 87.2) + 2000 * 1.36;
  check("invested converts to CAD correctly", Math.abs(s.totalInvested - expInvested) < 1e-6, `${s.totalInvested} vs ${expInvested}`);
  check("current converts to CAD correctly", Math.abs(s.totalCurrent - expCurrent) < 1e-6);
  check("country split has India+US", s.byCountry.length === 2);
  check(
    "top holding pct correct",
    Math.abs(s.topHoldingPct - Math.max(40000 * (1.36 / 87.2), 2000 * 1.36) / expCurrent) < 1e-9
  );
}

console.log("\n== Prompt generator ==");
{
  const mk = (sym: string, qty: number, avg: number): AnalyzedHolding => {
    const data = mockStockData(sym);
    const price = data.quote.price ?? avg;
    return {
      holding: {
        id: sym,
        broker: sym.endsWith(".NS") ? "zerodha" : "wealthsimple",
        rawSymbol: sym.split(".")[0],
        yahooSymbol: sym,
        quantity: qty,
        avgCost: avg,
        currency: sym.endsWith(".NS") ? "INR" : sym.endsWith(".TO") ? "CAD" : "USD",
      },
      data,
      scorecard: buildScorecard(data),
      invested: qty * avg,
      currentValue: qty * price,
      pnl: qty * (price - avg),
      pnlPct: (price - avg) / avg,
    };
  };
  const one = mk("TCS.NS", 25, 3600);
  const p1 = buildPrompt([one], { focus: "deep_dive", includeHistory: true, baseCurrency: "INR" });
  check("single-stock prompt names the stock", p1.includes("TCS.NS") && p1.includes("Tata Consultancy"));
  check("includes position", p1.includes("25 shares"));
  check("includes 5-yr table", p1.includes("| ROE |") && p1.includes("Interest cover"));
  check("includes screener verdict", /screener's verdict/.test(p1));
  check("includes philosophy", p1.includes("Buffett") && p1.includes("Jhunjhunwala") && p1.includes("5-year"));
  check(
    "expanded roster + frameworks in prompt",
    p1.includes("Munger") && p1.includes("Terry Smith") && p1.includes("Coffee Can") && p1.includes("QGLP") && p1.includes("scuttlebutt")
  );
  check("includes rules & disclaimer", p1.includes("not financial advice"));
  check("deep-dive tasks present", p1.includes("Bottom line first") && p1.includes("Bear case"));

  const many = [one, mk("SHOP.TO", 15, 95), mk("AAPL", 10, 175)];
  const p2 = buildPrompt(many, { focus: "action", includeHistory: false, baseCurrency: "CAD" });
  check("multi-stock prompt covers all", p2.includes("TCS.NS") && p2.includes("SHOP.TO") && p2.includes("AAPL"));
  check("action focus asks for decisions", p2.includes("ADD, HOLD, or TRIM"));
  check("no 5-yr table when toggled off", !p2.includes("| ROE |"));

  const fx: FxRates = { base: "CAD", rates: { CAD: 1, USD: 1.36, INR: 1.36 / 87.2 }, asOf: "t", source: "test" };
  const summary = summarize(many, fx);
  const p3 = buildPrompt(many, { focus: "risk", includeHistory: true, baseCurrency: "CAD" }, summary, fx);
  check("portfolio prompt includes totals & geography", p3.includes("Total invested") && p3.includes("Geography"));
  check("risk focus asks to kill the thesis", p3.includes("Kill the thesis"));

  const p4 = buildPrompt(many, { focus: "news", includeHistory: false, baseCurrency: "CAD" }, summary, fx);
  check("news focus handles no-web-access case", p4.includes("web access"));
}

console.log("\n== Valuation math ==");
{
  const data = mockStockData("TCS.NS");
  const sc = buildScorecard(data);
  const v = buildValuation(data, sc);
  check("valuation produces ≥2 methods", v.methods.length >= 2, String(v.methods.length));
  check("intrinsic is positive & finite", (v.intrinsic ?? 0) > 0 && Number.isFinite(v.intrinsic ?? NaN));
  check("buy-below sits below intrinsic", (v.buyBelow ?? 0) < (v.intrinsic ?? 0));
  check(
    "MoS target scales with quality",
    v.mosTarget === (sc.totalScore >= 70 ? 0.2 : sc.totalScore >= 55 ? 0.3 : 0.4),
    `score ${sc.totalScore} → ${v.mosTarget}`
  );
  const price = data.quote.price!;
  const expStatus = price <= v.buyBelow! ? "BUY_ZONE" : price <= v.intrinsic! * 1.05 ? "FAIR" : "PRICEY";
  check("status consistent with price vs bands", v.status === expStatus, v.status);

  // hand-check Graham Number: √(22.5 × EPS × BVPS)
  const last = data.years[data.years.length - 1];
  const eps = data.quote.epsTrailing!;
  const bvps = last.equity! / last.shares!;
  const graham = v.methods.find((m) => m.id === "graham");
  check(
    "Graham Number = √(22.5·EPS·BVPS)",
    !!graham && Math.abs(graham.value - Math.sqrt(22.5 * eps * bvps)) < 1e-6,
    graham ? String(graham.value) : "missing"
  );
  // MoS identity: 1 − price/intrinsic
  check(
    "margin of safety = 1 − price/intrinsic",
    Math.abs((v.marginOfSafety ?? 0) - (1 - price / v.intrinsic!)) < 1e-9
  );

  const fin = mockStockData("HDFCBANK.NS");
  const fsc = buildScorecard(fin);
  const fval = buildValuation(fin, fsc);
  check("financials skip the FCF DCF", !fval.methods.some((m) => m.id === "dcf"));
  check(
    "financials get justified-P/B method",
    fval.methods.some((m) => m.id === "justpb"),
    fval.methods.map((m) => m.id).join(",")
  );
}

console.log("\n== Scan universes ==");
{
  check(
    "three universes with ≥25 names each",
    UNIVERSE_COUNTRIES.every((c) => UNIVERSES[c].length >= 25),
    UNIVERSE_COUNTRIES.map((c) => `${c}:${UNIVERSES[c].length}`).join(" ")
  );
  const noDup = (arr: { symbol: string }[]) => new Set(arr.map((x) => x.symbol)).size === arr.length;
  check("no duplicate symbols within a universe", UNIVERSE_COUNTRIES.every((c) => noDup(UNIVERSES[c])));
  check("India universe is all .NS", UNIVERSES.India.every((c) => c.symbol.endsWith(".NS")));
  check(
    "Canada universe maps to CAD",
    UNIVERSES.Canada.every((c) => currencyForSymbol(c.symbol) === "CAD")
  );
  check(
    "US universe maps to USD",
    UNIVERSES["United States"].every((c) => currencyForSymbol(c.symbol) === "USD")
  );
  const cands = candidatesFor("India", ["TCS.NS", "itc.ns"]);
  check(
    "candidatesFor excludes held symbols (case-insensitive)",
    !cands.some((c) => c.symbol === "TCS.NS" || c.symbol === "ITC.NS") &&
      cands.length === UNIVERSES.India.length - 2
  );
}

console.log("\n== Health checks & income ==");
{
  const fx: FxRates = { base: "CAD", rates: { CAD: 1, USD: 1.36, INR: 1.36 / 87.2 }, asOf: "t", source: "test" };
  const mk = (sym: string, invested: number, current: number, watch = false): AnalyzedHolding => {
    const data = mockStockData(sym);
    return {
      holding: {
        id: sym + (watch ? "-w" : ""),
        broker: "manual",
        rawSymbol: sym,
        yahooSymbol: sym,
        quantity: watch ? 0 : 10,
        avgCost: watch ? 0 : invested / 10,
        currency: sym.endsWith(".NS") ? "INR" : sym.endsWith(".TO") ? "CAD" : "USD",
        watch,
      },
      data,
      scorecard: buildScorecard(data),
      invested: watch ? 0 : invested,
      currentValue: watch ? undefined : current,
    };
  };
  const rows = [mk("TCS.NS", 30000, 40000), mk("AAPL", 1750, 2000), mk("MSFT", 0, 0, true)];
  check("watch rows carry no capital in health math", activeRows(rows).length === 2);

  const checks = computeHealth(rows, fx);
  check("health produces a battery of checks", checks.length >= 6, String(checks.length));
  const tcsCad = 40000 * (1.36 / 87.2);
  const aaplCad = 2000 * 1.36;
  const total = tcsCad + aaplCad;
  const top1 = checks.find((c) => c.id === "top1");
  const expTop1 = Math.max(tcsCad, aaplCad) / total; // ≈ 81% → fail
  check("top-holding check fails at ~81%", top1?.status === "fail", top1?.detail);
  const hhi = checks.find((c) => c.id === "hhi");
  const expHhi = Math.pow(tcsCad / total, 2) + Math.pow(aaplCad / total, 2);
  check(
    "HHI matches hand computation",
    !!hhi && hhi.detail.includes(expHhi.toFixed(3)),
    `${hhi?.detail} vs ${expHhi.toFixed(3)}`
  );
  check("top1 share sanity", Math.abs(expTop1 - aaplCad / total) < 1e-9);

  const income = computeIncome(rows, fx);
  const yTcs = mockStockData("TCS.NS").quote.dividendYield ?? 0;
  const yAapl = mockStockData("AAPL").quote.dividendYield ?? 0;
  const expIncome = tcsCad * yTcs + aaplCad * yAapl;
  check("income = Σ value × trailing yield", Math.abs(income.total - expIncome) < 1e-6, `${income.total} vs ${expIncome}`);
  check("yield-on-value consistent", Math.abs((income.yieldOnValue ?? 0) - expIncome / total) < 1e-9);
}

console.log("\n== Sit-tight projection math ==");
{
  const pts = project(1000, 10, 0, 0.1);
  check("pure compounding = start × 1.1^n", Math.abs(pts[10].value - 1000 * Math.pow(1.1, 10)) < 1e-6);
  const flat = project(1000, 5, 100, 0);
  check("zero-return contributions just add up", Math.abs(flat[5].value - (1000 + 100 * 12 * 5)) < 1e-6);
  check("invested tracks start + contributions", Math.abs(flat[5].invested - 7000) < 1e-9);
  check("projection is year-indexed", pts.length === 11 && pts[0].year === 0 && pts[10].year === 10);
  const y2 = yearsToMultiple(2, 0.1)!;
  check("years-to-double at 10% ≈ 7.27", Math.abs(y2 - Math.log(2) / Math.log(1.1)) < 1e-9, y2.toFixed(2));

  const fx: FxRates = { base: "CAD", rates: { CAD: 1, USD: 1.36, INR: 1.36 / 87.2 }, asOf: "t", source: "test" };
  const data = mockStockData("TCS.NS");
  const rows: AnalyzedHolding[] = [
    {
      holding: { id: "1", broker: "manual", rawSymbol: "TCS", yahooSymbol: "TCS.NS", quantity: 10, avgCost: 3000, currency: "INR" },
      data,
      scorecard: buildScorecard(data),
      invested: 30000,
      currentValue: 40000,
    },
  ];
  const g = portfolioGrowthGuess(rows, fx);
  check("growth scenarios are ordered", g.conservative <= g.base && g.base <= g.optimistic, JSON.stringify(g));
  check("growth guess is clamped to 0–18%", g.base >= 0 && g.base <= 0.18, String(g.base));
}

console.log("\n== Watchlist & valuation in prompts ==");
{
  const data = mockStockData("ASIANPAINT.NS");
  const sc = buildScorecard(data);
  const watchRow: AnalyzedHolding = {
    holding: {
      id: "w1",
      broker: "manual",
      rawSymbol: "ASIANPAINT.NS",
      yahooSymbol: "ASIANPAINT.NS",
      quantity: 0,
      avgCost: 0,
      currency: "INR",
      watch: true,
    },
    data,
    scorecard: sc,
    invested: 0,
  };
  const p = buildPrompt([watchRow], { focus: "deep_dive", includeHistory: true, baseCurrency: "INR" });
  check("watchlist prompt says 'not owned yet'", p.includes("do NOT own this yet"));
  check("prompt carries fair-value estimate", /fair-value estimate/.test(p));
  check("prompt warns against anchoring", /Challenge this estimate/.test(p));

  const owned: AnalyzedHolding = { ...watchRow, holding: { ...watchRow.holding, quantity: 25, avgCost: 2800, watch: false }, invested: 70000, currentValue: 25 * (data.quote.price ?? 2800) };
  const p2 = buildPrompt([owned], { focus: "deep_dive", includeHistory: true, baseCurrency: "INR" });
  check("owned prompt keeps position line", p2.includes("25 shares"));
}

// ---------- v2 helpers ----------
function mkAnalyzed(sym: string, qty: number, avg: number, watch = false) {
  const data = mockStockData(sym);
  const price = data.quote.price ?? avg;
  return {
    holding: {
      id: sym + (watch ? "-w" : ""),
      broker: "manual" as const,
      rawSymbol: sym,
      yahooSymbol: sym,
      quantity: watch ? 0 : qty,
      avgCost: watch ? 0 : avg,
      currency: (sym.endsWith(".NS") ? "INR" : sym.endsWith(".TO") ? "CAD" : "USD") as "INR" | "CAD" | "USD",
      watch,
    },
    data,
    scorecard: buildScorecard(data),
    invested: watch ? 0 : qty * avg,
    currentValue: watch ? undefined : qty * price,
    pnl: watch ? undefined : qty * (price - avg),
    pnlPct: watch ? undefined : (price - avg) / avg,
  } as AnalyzedHolding;
}

/** Hand-built "dead money": flat price for 5y, flat/shrinking earnings, weak balance sheet. */
function makeDeadMoney(): StockData {
  const years = [0, 1, 2, 3, 4].map((i) => ({
    year: 2021 + i,
    endDate: `${2021 + i}-03-31`,
    revenue: 1000 + (i % 2 ? 5 : -5),
    netIncome: 50 - i * 1.5,
    ebit: 70,
    pretaxIncome: 66,
    interestExpense: 60, // coverage ≈ 1.2x → red flag
    equity: 800,
    totalDebt: 700,
    totalAssets: 2200,
    currentAssets: 300,
    currentLiabilities: 280,
    cash: 60,
    fcf: i % 2 ? -12 : 4, // negative most years → cash-burn flag
    ocf: 20,
    capex: -25,
    dilutedEPS: 5 - i * 0.15,
    basicEPS: 5 - i * 0.15,
    shares: 10,
  }));
  const prices: { date: string; close: number }[] = [];
  for (let i = 0; i <= 60; i++) {
    const y = 2021 + Math.floor(i / 12);
    const mo = (i % 12) + 1;
    prices.push({ date: `${y}-${String(mo).padStart(2, "0")}-01`, close: 100 + (i % 3) - 1 });
  }
  return {
    symbol: "DEADCO.NS",
    quote: {
      symbol: "DEADCO.NS",
      name: "Dead Money Industries",
      price: 100,
      currency: "INR",
      trailingPE: 100 / 4.4,
      epsTrailing: 4.4,
      marketCap: 1000,
      sector: "Industrials",
      industry: "Diversified",
    },
    years,
    prices,
    fetchedAt: "t",
  };
}

console.log("\n== Decision engine ==");
{
  const tcs = mkAnalyzed("TCS.NS", 25, 3600);
  const d = decideRow(tcs);
  check("quality compounder never rated EXIT", d.action !== "EXIT", d.action);
  check("decision carries evidence", d.reasons.length >= 3, String(d.reasons.length));
  check("decision includes price-CAGR evidence", d.priceCagr !== undefined && (d.spanYears ?? 0) > 2.5);

  const dead = makeDeadMoney();
  const deadRow: AnalyzedHolding = {
    holding: { id: "dm", broker: "zerodha", rawSymbol: "DEADCO", yahooSymbol: "DEADCO.NS", quantity: 100, avgCost: 110, currency: "INR" },
    data: dead,
    scorecard: buildScorecard(dead),
    invested: 11000,
    currentValue: 10000,
    pnl: -1000,
    pnlPct: -1000 / 11000,
  };
  const dd = decideRow(deadRow);
  check("dead-money pattern detected (flat price + flat business)", dd.deadMoney === true);
  check("dead money with weak score → EXIT", dd.action === "EXIT", `${dd.action} (score ${deadRow.scorecard?.totalScore})`);
  check("dead-money reason surfaced", dd.reasons.some((r) => /Dead-money/i.test(r)));

  // coiled spring: flat price but the business keeps compounding → must NOT be an exit
  const springData = { ...mockStockData("TCS.NS"), prices: dead.prices };
  const springRow: AnalyzedHolding = { ...tcs, data: springData, scorecard: buildScorecard(springData) };
  const sd = decideRow(springRow);
  check("flat price + growing business is never EXIT (coiled spring)", sd.action !== "EXIT", sd.action);

  const pc = priceCagrOf([
    { date: "2021-07-01", close: 100 },
    { date: "2026-07-01", close: 200 },
  ]);
  check("price CAGR: doubling in 5y ≈ 14.9%/yr", Math.abs((pc.cagr ?? 0) - (Math.pow(2, 1 / 5) - 1)) < 0.002);
  const pcShort = priceCagrOf([
    { date: "2025-01-01", close: 100 },
    { date: "2026-01-01", close: 200 },
  ]);
  check("under ~2.5y of history → no long-run CAGR claimed", pcShort.cagr === undefined);

  const watchRow = mkAnalyzed("ITC.NS", 0, 0, true);
  const groups = decideAll([tcs, deadRow, watchRow]);
  check("watchlist rows get no capital decision", !groups.decisions.has(watchRow.holding.id));
  const totalGrouped = groups.order.reduce((a, k) => a + groups.byAction[k].length, 0);
  check("decision board partitions every position exactly once", totalGrouped === 2, String(totalGrouped));
}

console.log("\n== Screeners ==");
{
  const dataset = ["TCS.NS", "ITC.NS", "HDFCBANK.NS", "TATAMOTORS.NS", "RELIANCE.NS", "MSFT", "AAPL", "ENB.TO", "CNR.TO", "SHOP.TO"].map((s) => {
    const d = mockStockData(s);
    return toMetricRow(d, buildScorecard(d), { owned: s === "TCS.NS" });
  });
  check("metric rows extract fundamentals", dataset.every((r) => r.score >= 0 && (r.roceAvg !== undefined || r.isFin)));

  const byId = (id: string) => SCREENS.find((s) => s.id === id)!;
  const cc = byId("coffee-can").apply(dataset);
  check("Coffee Can respects its bar", cc.every((r) => (r.coffeeCan ?? 0) >= 0.5 && r.score >= 60));
  const fortress = byId("fortress").apply(dataset);
  check("Fortress excludes financials & leverage", fortress.every((r) => !r.isFin && (r.d2e ?? 99) <= 0.35));
  const garp = byId("garp").apply(dataset);
  check("GARP enforces PEG ≤ 1 with growth ≥ 10%", garp.every((r) => (r.peg ?? 9) <= 1 && (r.epsCagr ?? 0) >= 0.1));
  const mf = byId("magic-formula").apply(dataset);
  check("Magic Formula ranks non-financials only", mf.length > 0 && mf.every((r) => !r.isFin));
  check("Magic Formula annotates ranks", mf[0]?.rankNote === "MF rank #1", mf[0]?.rankNote);

  // hand-check MF ranking on synthetic rows
  const synth = (symbol: string, ey: number, roce: number): MetricRow =>
    ({ ...dataset[0], symbol, isFin: false, earningsYield: ey, roceAvg: roce }) as MetricRow;
  const ranked = byId("magic-formula").apply([synth("A", 0.1, 0.3), synth("B", 0.05, 0.4), synth("C", 0.08, 0.1)]);
  check(
    "Magic Formula combined-rank math (A < B < C)",
    ranked.map((r) => r.symbol).join("") === "ABC",
    ranked.map((r) => r.symbol).join("")
  );

  const custom = runCustom(dataset, { minScore: 70, maxPE: 30 });
  check("custom filter respects bounds", custom.every((r) => r.score >= 70 && (r.pe ?? 0) <= 30));
  const noOwned = runCustom(dataset, { excludeOwned: true });
  check("custom filter can exclude owned", noOwned.every((r) => r.symbol !== "TCS.NS"));
}

console.log("\n== OHLC history (mock) ==");
{
  const h = mockHistory("TCS.NS", "1y");
  check("1y daily history has ~250 candles", h.length > 200 && h.length <= 260, String(h.length));
  check(
    "OHLC is internally consistent",
    h.every((c) => c.low <= Math.min(c.open, c.close) + 1e-9 && c.high >= Math.max(c.open, c.close) - 1e-9)
  );
  check("times ascending & unique", h.every((c, i) => i === 0 || c.time > h[i - 1].time));
  const endPx = mockStockData("TCS.NS").quote.price ?? 0;
  check("series ends at the quoted price", Math.abs(h[h.length - 1].close - endPx) < 1e-6);
  check("deterministic across calls", JSON.stringify(mockHistory("TCS.NS", "1y")) === JSON.stringify(h));

  const s = sma(h, 50);
  const hand = h.slice(0, 50).reduce((a, c) => a + c.close, 0) / 50;
  check("SMA(50) window math", s.length === h.length - 49 && Math.abs(s[0].value - hand) < 1e-9);
  check("weekly range provides candles too", mockHistory("ENB.TO", "5y").length > 200);
}

console.log("\n== Portfolio value series ==");
{
  const fx: FxRates = { base: "CAD", rates: { CAD: 1, USD: 1.5, INR: 0.02 }, asOf: "t", source: "test" };
  const mk = (sym: string, ccy: "INR" | "USD", qty: number, prices: [string, number][]): AnalyzedHolding => ({
    holding: { id: sym, broker: "manual", rawSymbol: sym, yahooSymbol: sym, quantity: qty, avgCost: 1, currency: ccy },
    data: {
      symbol: sym,
      quote: { symbol: sym },
      years: [],
      prices: prices.map(([date, close]) => ({ date, close })),
      fetchedAt: "t",
    },
    invested: qty,
  });
  const rows = [
    mk("A.NS", "INR", 10, [
      ["2024-01-01", 100],
      ["2024-02-01", 110],
    ]),
    mk("B", "USD", 2, [
      ["2024-02-01", 50],
      ["2024-03-01", 60],
    ]),
  ];
  const s = portfolioSeries(rows, fx);
  check("series spans the union of months", s.length === 3, String(s.length));
  check("month 1 = A only (20 CAD)", Math.abs(s[0].value - 20) < 1e-9, String(s[0]?.value));
  check("month 2 sums both (22 + 150)", Math.abs(s[1].value - 172) < 1e-9, String(s[1]?.value));
  check("month 3 carries A forward (22 + 180)", Math.abs(s[2].value - 202) < 1e-9, String(s[2]?.value));
  const withWatch = [...rows, { ...mk("W", "USD", 5, [["2024-01-01", 999]]), holding: { ...mk("W", "USD", 5, [["2024-01-01", 999]]).holding, watch: true, quantity: 0 } }];
  const s2 = portfolioSeries(withWatch, fx);
  check("watch rows never enter the value series", JSON.stringify(s2) === JSON.stringify(s));
}

console.log("\n== Local store (server-side safety) ==");
{
  check("loadHoldings is a safe no-op without a browser", loadHoldings("india") === null);
  let threw = false;
  try {
    saveHoldings("india", []);
  } catch {
    threw = true;
  }
  check("saveHoldings never throws server-side", !threw);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
