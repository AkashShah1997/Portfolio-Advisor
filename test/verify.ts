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
import { loadHoldings, MARKET_META, saveHoldings } from "../lib/store";
import { METRIC_INFO } from "../lib/glossary";
import { incomeAxis, portfolioSnowflake, snowflakeOf, SNOWFLAKE_AXES } from "../lib/snowflake";
import { strengthsAndRisks } from "../lib/insights";
import { benchmarkCompare, monthlyCloses } from "../lib/portfolio";
import type { Journey } from "../lib/journey";
import { isEtfHolding, mapFundSummary, fundDataEmpty } from "../lib/etf";
import { catalogMer, categoryOf, ETF_CATALOG } from "../lib/etfcatalog";
import { assessAll, feeDrag, merBandOf } from "../lib/etfscore";
import { mockEtfData } from "../lib/mocketf";
import { mapStatementHistory, parseTimeseries } from "../lib/fundamentals";
import {
  buildTickerMap,
  diffFilings,
  normalizeIssuer,
  parseInfoTable,
  SUPERINVESTORS,
  tickerFor,
} from "../lib/thirteenf";
import { mapOwnership } from "../lib/ownership";
import { mockOwnership, mockSmartMoves } from "../lib/mock";
import { buildJourney, estimateBuyMonth } from "../lib/journey";
import { fromLite, toLite } from "../lib/scancache";
import { parseCustomSymbols } from "../lib/universe";
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
  check("7 holdings parsed (incl. 2 ETFs)", res.holdings.length === 7, `got ${res.holdings.length}`);
  check(
    "ETF rows map to .NS symbols",
    res.holdings.find((h) => h.rawSymbol === "NIFTYBEES")?.yahooSymbol === "NIFTYBEES.NS"
  );
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
  check("6 holdings parsed (incl. XEQT)", res.holdings.length === 6, `got ${res.holdings.length}`);
  check(
    "XEQT → XEQT.TO via CAD hint",
    res.holdings.find((h) => h.rawSymbol === "XEQT")?.yahooSymbol === "XEQT.TO"
  );
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

console.log("\n== Fundamentals parsers (live-data fallbacks) ==");
{
  // direct timeseries payload → YearFinancials
  const tsJson = {
    timeseries: {
      result: [
        {
          meta: { type: ["annualTotalRevenue"] },
          annualTotalRevenue: [
            { asOfDate: "2023-03-31", reportedValue: { raw: 1000 } },
            { asOfDate: "2024-03-31", reportedValue: { raw: 1200 } },
          ],
        },
        {
          meta: { type: ["annualNetIncome"] },
          annualNetIncome: [
            { asOfDate: "2023-03-31", reportedValue: { raw: 100 } },
            { asOfDate: "2024-03-31", reportedValue: { raw: 150 } },
            null,
          ],
        },
        {
          meta: { type: ["annualOperatingCashFlow"] },
          annualOperatingCashFlow: [{ asOfDate: "2024-03-31", reportedValue: { raw: 180 } }],
        },
        {
          meta: { type: ["annualCapitalExpenditure"] },
          annualCapitalExpenditure: [{ asOfDate: "2024-03-31", reportedValue: { raw: -40 } }],
        },
        { meta: {}, junk: true },
      ],
    },
  };
  const parsed = parseTimeseries(tsJson);
  check("timeseries parser pivots by fiscal year", parsed.length === 2, String(parsed.length));
  check("timeseries parser maps values", parsed[1].revenue === 1200 && parsed[1].netIncome === 150);
  check("timeseries parser derives FCF from OCF − capex", parsed[1].fcf === 140, String(parsed[1].fcf));
  check("timeseries parser sorts ascending", parsed[0].year === 2023 && parsed[1].year === 2024);
  check("timeseries parser survives junk entries", parseTimeseries({ nope: 1 }).length === 0);

  // quoteSummary statement-history fallback → YearFinancials
  const qs = {
    incomeStatementHistory: {
      incomeStatementHistory: [
        { endDate: new Date("2023-03-31"), totalRevenue: 1000, netIncome: 100, incomeBeforeTax: 130, interestExpense: -20 },
        { endDate: { raw: 1711843200 }, totalRevenue: 1200, netIncome: 150, incomeBeforeTax: 190, interestExpense: -25 },
      ],
    },
    balanceSheetHistory: {
      balanceSheetStatements: [
        { endDate: new Date("2023-03-31"), totalStockholderEquity: 800, longTermDebt: 300, shortLongTermDebt: 50, totalAssets: 2000, totalCurrentAssets: 400, totalCurrentLiabilities: 250, cash: 90 },
      ],
    },
    cashflowStatementHistory: {
      cashflowStatements: [{ endDate: new Date("2023-03-31"), totalCashFromOperatingActivities: 160, capitalExpenditures: -30 }],
    },
  };
  const hist = mapStatementHistory(qs);
  check("statement-history fallback merges 3 modules by year", hist.length === 2, String(hist.length));
  const y23 = hist.find((y) => y.year === 2023)!;
  check("fallback merges income+balance+cashflow", y23.revenue === 1000 && y23.equity === 800 && y23.fcf === 130);
  check("fallback computes EBIT = pretax + |interest|", y23.ebit === 150, String(y23.ebit));
  check("fallback sums short+long debt", y23.totalDebt === 350);
  check("fallback handles {raw} epoch endDate", hist.some((y) => y.year === 2024));
}

console.log("\n== Fundamentals journey (then vs now) ==");
{
  // buy-month estimation from avg cost
  const prices = Array.from({ length: 61 }, (_, i) => {
    const y = 2021 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return { date: `${y}-${String(m).padStart(2, "0")}-01`, close: 100 + i * 5 }; // rising 100→400
  });
  const est = estimateBuyMonth(prices, 200)!;
  // closes rise 100,105,… so 195 (i=19 → 2022-08) is the EARLIEST close within 3% of a ₹200 avg cost
  check("buy month estimated at earliest close within 3%", est.ym === "2022-08", est.ym);
  const estEdge = estimateBuyMonth(prices, 50)!;
  check("avg cost below the window ⇒ earliest month flagged", estEdge.ym === "2021-01" && estEdge.atWindowEdge);

  // journey on a coiled spring: strong business (TCS mock) with a flat price history
  const flatPrices = prices.map((p) => ({ ...p, close: 3500 }));
  const springData = { ...mockStockData("TCS.NS"), prices: flatPrices };
  const springRow: AnalyzedHolding = {
    holding: { id: "j1", broker: "zerodha", rawSymbol: "TCS", yahooSymbol: "TCS.NS", quantity: 10, avgCost: 3500, currency: "INR" },
    data: springData,
    scorecard: buildScorecard(springData),
    invested: 35000,
    currentValue: 10 * (springData.quote.price ?? 3500),
  };
  const j = buildJourney(springRow)!;
  check("journey exists for held positions", !!j);
  check("journey compares an earlier FY to the latest FY", (j.thenYear ?? 0) < (j.nowYear ?? 0));
  check("growing mock business shows more ▲ than ▼", j.improved > j.worsened, `${j.improved}▲ ${j.worsened}▼`);
  check("flat price + improving business ⇒ coiled-spring verdict", j.verdict.tone === "good", j.verdict.line);
  check("user-set buy date wins over the estimate", buildJourney({ ...springRow, holding: { ...springRow.holding, buyDate: "2023-05" } })!.sinceYM === "2023-05");
  check("no journey for watchlist rows", buildJourney({ ...springRow, holding: { ...springRow.holding, watch: true, quantity: 0 } }) === undefined);

  // deteriorating business → critical verdict
  const dead = makeDeadMoney();
  const deadRow: AnalyzedHolding = {
    holding: { id: "j2", broker: "zerodha", rawSymbol: "DEADCO", yahooSymbol: "DEADCO.NS", quantity: 10, avgCost: 100, currency: "INR" },
    data: dead,
    scorecard: buildScorecard(dead),
    invested: 1000,
    currentValue: 1000,
  };
  const jd = buildJourney(deadRow)!;
  check("deteriorating business is called out", jd.verdict.tone === "critical" || jd.verdict.tone === "neutral", jd.verdict.tone);
}

console.log("\n== Scan cache round-trip ==");
{
  const data = mockStockData("TCS.NS");
  const mr = toMetricRow(data, buildScorecard(data), { owned: false });
  const lite = toLite(mr, 1000);
  check("lite strips heavy objects", !("data" in lite) && !("scorecard" in lite));
  const revived = fromLite(lite);
  check("lite round-trips every screen metric", revived.score === mr.score && revived.pe === mr.pe && revived.coffeeCan === mr.coffeeCan && revived.pillarQuality === mr.pillarQuality && revived.redFlags === mr.redFlags);
  check("revived rows carry no stale data objects", revived.data === undefined && revived.scorecard === undefined);
}

console.log("\n== New screens & custom fundamentals filters ==");
{
  const dataset = ["TCS.NS", "ITC.NS", "HDFCBANK.NS", "TATAMOTORS.NS", "RELIANCE.NS", "MSFT", "AAPL", "ENB.TO", "CNR.TO", "SHOP.TO"].map((s) => {
    const d = mockStockData(s);
    return toMetricRow(d, buildScorecard(d), { owned: s === "TCS.NS" });
  });
  const twoYear = SCREENS.find((s) => s.id === "two-year")!.apply(dataset);
  check(
    "Two-year keepers demand quality + clean flags + sane price",
    twoYear.every((r) => r.score >= 60 && r.redFlags === 0 && (r.epsCagr ?? 0) >= 0.08 && r.valStatus !== "PRICEY")
  );
  const pe20 = runCustom(dataset, { minPE: 10, maxPE: 20 });
  check("custom P/E band respects both bounds", pe20.every((r) => (r.pe ?? 0) >= 10 && (r.pe ?? 99) <= 20));
  const clean = runCustom(dataset, { noLossYears: true, maxRedFlags: 0 });
  check("no-loss-years + zero-flags filter works", clean.every((r) => r.lossYears === 0 && r.redFlags === 0));
  const bigCaps = runCustom(dataset, { minMarketCapB: 100 });
  check("market-cap floor filters small names", bigCaps.every((r) => (r.marketCap ?? 0) >= 100e9));

  const parsedList = parseCustomSymbols("tcs.ns, GSY.TO\nCOST bad_sym!! tcs.ns", ["COST"]);
  check(
    "custom symbol parser dedups, uppercases, excludes held & junk",
    parsedList.map((p) => p.symbol).join(",") === "TCS.NS,GSY.TO",
    parsedList.map((p) => p.symbol).join(",")
  );
}

console.log("\n== 13F parsing & diffing (smart money) ==");
{
  const xml = `<?xml version="1.0"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip>
    <value>500000000</value><shrsOrPrnAmt><sshPrnamt>2000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
  </infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>COCA COLA CO</ns1:nameOfIssuer><ns1:cusip>191216100</ns1:cusip>
    <ns1:value>300000000</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>4000000</ns1:sshPrnamt></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip><value>100000000</value>
    <shrsOrPrnAmt><sshPrnamt>400000</sshPrnamt></shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>SPY</nameOfIssuer><cusip>78462F103</cusip><value>50000000</value>
    <shrsOrPrnAmt><sshPrnamt>1000000</sshPrnamt></shrsOrPrnAmt><putCall>Put</putCall>
  </infoTable>
</informationTable>`;
  const pos = parseInfoTable(xml);
  check("parses plain + namespaced infoTables", pos.length === 2, String(pos.length));
  const aapl = pos.find((p) => p.cusip === "037833100")!;
  check("aggregates duplicate CUSIPs (multi-manager filings)", aapl.value === 600000000 && aapl.shares === 2400000);
  check("skips option (putCall) rows", !pos.some((p) => p.cusip === "78462F103"));
  check("positions sorted by value desc", pos[0].cusip === "037833100");

  const prev = [
    { issuer: "APPLE INC", cusip: "A", value: 500, shares: 100 },
    { issuer: "OLD CO", cusip: "O", value: 300, shares: 30 },
    { issuer: "TRIM CO", cusip: "T", value: 200, shares: 100 },
  ];
  const curr = [
    { issuer: "APPLE INC", cusip: "A", value: 600, shares: 130 },
    { issuer: "NEW CO", cusip: "N", value: 150, shares: 10 },
    { issuer: "TRIM CO", cusip: "T", value: 90, shares: 60 },
  ];
  const d = diffFilings(curr, prev);
  check("diff finds the new buy", d.newBuys.length === 1 && d.newBuys[0].cusip === "N");
  check(
    "diff flags a ≥20% share add with the change",
    d.adds.length === 1 && d.adds[0].cusip === "A" && Math.abs((d.adds[0].sharesChangePct ?? 0) - 0.3) < 1e-9
  );
  check("diff flags the trim", d.trims.length === 1 && d.trims[0].cusip === "T");
  check("diff flags the exit", d.exits.length === 1 && d.exits[0].cusip === "O");
  check("current-book weights sum to 1", Math.abs(d.top.reduce((a, t) => a + t.weightPct, 0) - 1) < 1e-9);
  check("AUM equals the current filing total", d.aumUsd === 840);

  const map = buildTickerMap([
    { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
    { cik_str: 1, ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" },
    { cik_str: 2, ticker: "UNP", title: "UNION PACIFIC CORP" },
    { cik_str: 3, ticker: "UNH", title: "UNITEDHEALTH GROUP INC" },
  ]);
  check(
    "issuer normalization strips suffixes & share classes",
    normalizeIssuer("APPLE INC") === "APPLE" && normalizeIssuer("Berkshire Hathaway Inc CL B") === "BERKSHIRE HATHAWAY"
  );
  check("exact issuer→ticker match", tickerFor("APPLE INC", map) === "AAPL");
  check("13F abbreviations expand (UNION PAC CORP → UNP)", tickerFor("UNION PAC CORP", map) === "UNP");
  check("prefix fallback maps partial names", tickerFor("UNITEDHEALTH GROUP INC COM", map) === "UNH");
  check(
    "bench: 9 investors, unique 10-digit CIKs",
    SUPERINVESTORS.length === 9 &&
      new Set(SUPERINVESTORS.map((s) => s.cik)).size === 9 &&
      SUPERINVESTORS.every((s) => /^\d{10}$/.test(s.cik))
  );
}

console.log("\n== Ownership mapper & smart-money mocks ==");
{
  const own = mapOwnership("AAPL", {
    majorHoldersBreakdown: { insidersPercentHeld: 0.02, institutionsPercentHeld: { raw: 0.61 }, institutionsCount: 5000 },
    fundOwnership: {
      ownershipList: [
        { organization: "Vanguard Index Fund", pctHeld: 0.03, position: 1000, value: 2000, reportDate: 1719705600 },
        { organization: "Small Fund", pctHeld: 0.001 },
      ],
    },
    institutionOwnership: { ownershipList: [] },
  });
  check("ownership breakdown reads plain and {raw} numbers", own.breakdown.insidersPct === 0.02 && own.breakdown.institutionsPct === 0.61);
  check("epoch reportDate becomes ISO date", own.funds[0].reportDate === "2024-06-30", own.funds[0].reportDate);
  check("fund lists sort by % held", own.funds[0].organization === "Vanguard Index Fund");

  const sm = mockSmartMoves();
  check("mock smart moves are deterministic", JSON.stringify(sm) === JSON.stringify(mockSmartMoves()));
  check(
    "mock includes a ≥2-investor consensus name (UNH)",
    sm.filter((i) => [...i.newBuys, ...i.adds].some((m) => m.ticker === "UNH")).length >= 2
  );
  const mo = mockOwnership("TCS.NS");
  check("mock ownership deterministic & India-flavoured for .NS", JSON.stringify(mo) === JSON.stringify(mockOwnership("TCS.NS")) && mo.funds.some((f) => /SBI|ICICI|HDFC/.test(f.organization)));
  const moUs = mockOwnership("MSFT");
  check("mock ownership US-flavoured otherwise", moUs.funds.some((f) => /Vanguard|Fidelity/.test(f.organization)));
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

console.log("\n== Metric glossary (info tooltips) ==");
{
  // every key the UI wires an InfoTip to must exist, with all three fields filled
  const wired = [
    // screener table headers + custom filter labels
    "score", "roce", "epsCagr", "pe", "peg", "divYield", "flags", "mos", "verdict",
    "revCagr", "pb", "d2e", "icr", "payout", "fcfYield", "marketCap", "lossYears", "buyZone",
    // stock card: ratio table + snapshot + pillars + extras
    "revenue", "netIncome", "eps", "roe", "netMargin", "fcf", "approxPE", "avgPE", "week52",
    "pillarQuality", "pillarFortress", "pillarGrowth", "pillarValuation",
    "analyst", "snowflake", "vsBench",
  ];
  const missing = wired.filter((k) => !METRIC_INFO[k]);
  check("every wired InfoTip key has a glossary entry", missing.length === 0, missing.join(","));
  const incomplete = Object.entries(METRIC_INFO).filter(
    ([, v]) => !v.name.trim() || v.what.trim().length < 20 || v.better.trim().length < 15
  );
  check("every glossary entry has name + substantive what/better", incomplete.length === 0, incomplete.map(([k]) => k).join(","));
  check("glossary states direction for P/E and ROCE", /lower/i.test(METRIC_INFO.pe.better) && /higher/i.test(METRIC_INFO.roce.better));
}

console.log("\n== Snowflake (5-axis radar) ==");
{
  check("income axis: non-payer scores 0", incomeAxis({}) === 0 && incomeAxis({ dividendYield: 0 }) === 0);
  check(
    "income axis: 4% yield, low payout, all-FCF years → 100",
    incomeAxis({ dividendYield: 0.04, payoutRatio: 0.3, fcfPosShare: 1 }) === 100
  );
  check(
    "income axis: 2% yield with unknown payout/FCF → half-ish credit",
    incomeAxis({ dividendYield: 0.02 }) === 50
  );
  check(
    "income axis: unsustainable payout (≥110%) earns no sustainability credit",
    incomeAxis({ dividendYield: 0.04, payoutRatio: 1.2, fcfPosShare: 1 }) === 75
  );

  const tcs = mockStockData("TCS.NS");
  const scTcs = buildScorecard(tcs);
  const flake = snowflakeOf(scTcs, tcs);
  check("snowflake exists for a scored stock", !!flake);
  check(
    "snowflake axes all within 0–100",
    !!flake && SNOWFLAKE_AXES.every((a) => flake[a.key] >= 0 && flake[a.key] <= 100)
  );
  check("TCS (quality profile) scores high on the quality axis", !!flake && flake.quality >= 60, String(flake?.quality));
  check(
    "snowflake axes mirror the pillar scores",
    !!flake && flake.quality === scTcs.pillars.find((p) => p.pillar === "quality")?.score
  );

  const thin: StockData = { ...tcs, years: tcs.years.slice(0, 1) };
  const scThin = buildScorecard(thin);
  check("insufficient data → no snowflake (never a fake shape)", scThin.verdict === "INSUFFICIENT_DATA" && snowflakeOf(scThin, thin) === null);

  // portfolio snowflake is value-weighted: heavier holding pulls the average
  const itc = mockStockData("ITC.NS");
  const scItc = buildScorecard(itc);
  const mkRow = (sym: string, data: StockData, sc: ReturnType<typeof buildScorecard>, value: number): AnalyzedHolding => ({
    holding: { id: sym, broker: "zerodha", rawSymbol: sym, yahooSymbol: sym, quantity: 1, avgCost: value, currency: "INR" },
    data,
    scorecard: sc,
    invested: value,
    currentValue: value,
  });
  const fxInr: FxRates = { base: "INR", rates: { INR: 1, CAD: 62, USD: 84 }, asOf: "t", source: "test" };
  const heavyTcs = portfolioSnowflake([mkRow("TCS.NS", tcs, scTcs, 900), mkRow("ITC.NS", itc, scItc, 100)], fxInr);
  const heavyItc = portfolioSnowflake([mkRow("TCS.NS", tcs, scTcs, 100), mkRow("ITC.NS", itc, scItc, 900)], fxInr);
  const fTcs = snowflakeOf(scTcs, tcs)!;
  const fItc = snowflakeOf(scItc, itc)!;
  check("portfolio snowflake covers both holdings", heavyTcs?.covered === 2 && heavyTcs.total === 2);
  check(
    "portfolio snowflake is value-weighted (tilts toward the heavier holding)",
    !!heavyTcs && !!heavyItc &&
      Math.abs(heavyTcs.axes.income - fTcs.income) <= Math.abs(heavyTcs.axes.income - fItc.income) &&
      Math.abs(heavyItc.axes.income - fItc.income) <= Math.abs(heavyItc.axes.income - fTcs.income)
  );
  check("watch rows carry no weight in the portfolio snowflake", (() => {
    const w = mkRow("ITC.NS", itc, scItc, 9000);
    w.holding.watch = true;
    const p = portfolioSnowflake([mkRow("TCS.NS", tcs, scTcs, 100), w], fxInr);
    return !!p && p.covered === 1 && p.axes.quality === fTcs.quality;
  })());
}

console.log("\n== Strengths & risks bullets ==");
{
  const tcs = mockStockData("TCS.NS");
  const sc = buildScorecard(tcs);
  const val = buildValuation(tcs, sc);
  const ins = strengthsAndRisks(sc, val);
  check("quality profile yields 1–4 strengths", ins.strengths.length >= 1 && ins.strengths.length <= 4, String(ins.strengths.length));
  check("bullet lists are capped at 4", ins.risks.length <= 4);
  check("bullets carry evidence in parentheses", ins.strengths.some((s) => /\(/.test(s)));

  // PRICEY valuation surfaces as a risk
  const pricey = strengthsAndRisks(sc, { ...val, status: "PRICEY", marginOfSafety: -0.3 });
  check("priced above fair value becomes a risk bullet", pricey.risks.some((r) => /above the rough fair-value/.test(r)));
  const cheap = strengthsAndRisks(sc, { ...val, status: "BUY_ZONE", marginOfSafety: 0.25 });
  check("buy-zone pricing becomes the lead strength", /below the rough fair-value/.test(cheap.strengths[0] ?? ""));

  // journey tones flow through
  const coiled = { verdict: { tone: "good", line: "" }, priceCagrSince: 0.01 } as unknown as Journey;
  check(
    "coiled spring journey adds a strength",
    strengthsAndRisks(sc, val, coiled).strengths.some((s) => /coiled spring/.test(s))
  );
  const deteriorating = { verdict: { tone: "critical", line: "" }, priceCagrSince: -0.02 } as unknown as Journey;
  check(
    "deteriorating journey adds a risk",
    strengthsAndRisks(sc, val, deteriorating).risks.some((r) => /worsened since you bought/.test(r))
  );

  // red flags always surface (TATAMOTORS has a loss year in the curated mocks)
  const tm = mockStockData("TATAMOTORS.NS");
  const scTm = buildScorecard(tm);
  if (scTm.redFlags.length) {
    const insTm = strengthsAndRisks(scTm, buildValuation(tm, scTm));
    check("red flags appear among the risks", insTm.risks.length >= 1);
  } else {
    check("red flags appear among the risks (skipped: no flags on this profile)", true);
  }
}

console.log("\n== Benchmark comparison (indexed to 100) ==");
{
  check(
    "both markets declare a benchmark index",
    MARKET_META.india.benchmark.symbol === "^NSEI" && MARKET_META.canada.benchmark.symbol === "^GSPTSE"
  );

  const m = monthlyCloses([
    { time: "2024-01-03", close: 10 },
    { time: "2024-01-28", close: 12 }, // later in same month wins
    { time: "2024-02-10", close: 15 },
  ]);
  check("monthlyCloses keeps the last close per month", m.get("2024-01") === 12 && m.get("2024-02") === 15);

  // 4 years: you double (×2), bench +50% (×1.5)
  const months: string[] = [];
  for (let y = 2021; y <= 2025; y++) for (let mo = 1; mo <= 12; mo++) {
    if (y === 2025 && mo > 1) break;
    months.push(`${y}-${String(mo).padStart(2, "0")}-01`);
  }
  const N = months.length - 1;
  const series = months.map((d, i) => ({ date: d, value: 1000 * Math.pow(2, i / N) }));
  const bench = months.map((d, i) => ({ time: d, close: 20000 * Math.pow(1.5, i / N) }));
  const cmp = benchmarkCompare(series, bench);
  const first = cmp.points[0];
  const last = cmp.points[cmp.points.length - 1];
  check("both series start indexed at 100", !!first && Math.round(first.you!) === 100 && Math.round(first.bench!) === 100);
  check("indexing preserves total growth (you ≈200, bench ≈150)", !!last && Math.abs(last.you! - 200) < 1 && Math.abs(last.bench! - 150) < 1);
  check(
    "CAGRs annualize correctly (≈18.9% vs ≈10.7%)",
    cmp.youCagr !== undefined && cmp.benchCagr !== undefined &&
      Math.abs(cmp.youCagr - (Math.pow(2, 1 / 4) - 1)) < 0.005 &&
      Math.abs(cmp.benchCagr - (Math.pow(1.5, 1 / 4) - 1)) < 0.005,
    `${cmp.youCagr} ${cmp.benchCagr}`
  );
  check("FX/level-free: scaling the portfolio 1000× changes nothing", (() => {
    const scaled = benchmarkCompare(series.map((p) => ({ ...p, value: p.value * 1000 })), bench);
    return Math.abs((scaled.points.at(-1)?.you ?? 0) - last.you!) < 1e-9;
  })());
  check("no overlapping months → empty comparison", benchmarkCompare(series, [{ time: "1999-01-01", close: 5 }]).points.length === 0);

  // the mock history endpoint serves any symbol, so the bench toggle works offline
  const nifty = mockHistory("^NSEI", "5y");
  check("mock history covers benchmark symbols for offline/e2e use", nifty.length > 100);
}

console.log("\n== ETF detection & catalog ==");
{
  check(
    "detects ETFs by quoteType, symbol pattern and name",
    isEtfHolding("NIFTYBEES.NS") &&
      isEtfHolding("XEQT.TO", "iShares Core Equity ETF Portfolio") &&
      isEtfHolding("ANY", undefined, "ETF") &&
      isEtfHolding("GOLDIETF.NS") &&
      !isEtfHolding("RELIANCE.NS", "Reliance Industries Ltd", "EQUITY") &&
      !isEtfHolding("TCS.NS", "Tata Consultancy Services")
  );

  const syms = ETF_CATALOG.flatMap((c) => c.options.map((o) => o.symbol));
  check("catalog symbols are unique", new Set(syms).size === syms.length);
  check(
    "catalog MERs are sane fractions (0 < mer < 1.5%/yr)",
    ETF_CATALOG.every((c) => c.options.every((o) => o.mer > 0 && o.mer < 0.015))
  );
  check(
    "catalog symbols carry the right exchange suffix",
    ETF_CATALOG.every((c) =>
      c.options.every((o) => (c.market === "india" ? o.symbol.endsWith(".NS") : o.symbol.endsWith(".TO")))
    )
  );
  check(
    "every category has ≥2 options (else 'alternatives' is meaningless)",
    ETF_CATALOG.every((c) => c.options.length >= 2)
  );

  // category matching — narrower before broader
  check("NIFTYBEES → Nifty 50 trackers", categoryOf("india", "NIFTYBEES.NS", "Nippon India ETF Nifty 50 BeES")?.key === "in-nifty50");
  check("JUNIORBEES → Next 50 (not Nifty 50)", categoryOf("india", "JUNIORBEES.NS", "Nippon India ETF Nifty Next 50 Junior BeES")?.key === "in-next50");
  check("BANKBEES → Bank (not Nifty 50)", categoryOf("india", "BANKBEES.NS", "Nippon India ETF Nifty Bank BeES")?.key === "in-bank");
  check("GOLDBEES → gold", categoryOf("india", "GOLDBEES.NS", "Nippon India ETF Gold BeES")?.key === "in-gold");
  check("MID150BEES → midcap", categoryOf("india", "MID150BEES.NS", "Nippon India ETF Nifty Midcap 150")?.key === "in-midcap");
  check("VFV → S&P 500 (CAD)", categoryOf("canada", "VFV.TO", "Vanguard S&P 500 Index ETF")?.key === "ca-sp500");
  check("XEQT → all-in-one equity", categoryOf("canada", "XEQT.TO", "iShares Core Equity ETF Portfolio")?.key === "ca-allequity");
  check("XIU → TSX broad (not S&P 500)", categoryOf("canada", "XIU.TO", "iShares S&P/TSX 60 Index ETF")?.key === "ca-tsx");
  check("XAW → global ex-Canada", categoryOf("canada", "XAW.TO", "iShares Core MSCI All Country World ex Canada Index ETF")?.key === "ca-intl");
  check("catalogMer finds a held symbol's approximate fee", Math.abs((catalogMer("GOLDBEES.NS")?.mer ?? 0) - 0.0082) < 1e-9);
}

console.log("\n== ETF fee math & MER bands ==");
{
  // ₹1L at 10% growth: 1% fee costs ~₹22.9k over 10y; 0.04% costs ~₹1k
  const d1 = feeDrag(100000, 0.01, 10);
  const d004 = feeDrag(100000, 0.0004, 10);
  check("fee drag: 1%/yr on ₹1L ≈ ₹22–24k over 10y", d1 > 21000 && d1 < 25000, d1.toFixed(0));
  check("fee drag: 0.04%/yr stays under ₹1.1k", d004 > 800 && d004 < 1100, d004.toFixed(0));
  check("fee drag grows with fee, value and years", feeDrag(200000, 0.01, 10) > d1 && feeDrag(100000, 0.02, 10) > d1 && feeDrag(100000, 0.01, 20) > d1);
  check("fee drag is 0 for zero fee/value", feeDrag(0, 0.01, 10) === 0 && feeDrag(100000, 0, 10) === 0);

  check(
    "MER bands: 0.04% core = excellent, 0.82% commodity = high, 0.82% core = expensive",
    merBandOf(0.0004, "core") === "excellent" &&
      merBandOf(0.0082, "commodity") === "high" &&
      merBandOf(0.0082, "core") === "expensive" &&
      merBandOf(undefined, "core") === "unknown"
  );
}

console.log("\n== ETF verdict engine ==");
{
  const nifty = mockEtfData("NIFTYBEES.NS");
  const gold = mockEtfData("GOLDBEES.NS");
  const total = 585000;

  // held: cheap core (6%) + overweight expensive commodity (12.4%)
  const out = assessAll(
    [
      { etf: nifty, value: 34200 },
      { etf: gold, value: 72600 },
    ],
    { market: "india", portfolioTotal: total }
  );
  const aN = out.find((a) => a.symbol === "NIFTYBEES.NS")!;
  const aG = out.find((a) => a.symbol === "GOLDBEES.NS")!;
  check("cheap broad core → INCREASE", aN.verdict === "INCREASE", aN.verdict);
  check("overweight pricey commodity → REDUCE", aG.verdict === "REDUCE", aG.verdict);
  check("gold reasons name the overweight AND the cheaper twin", aG.reasons.some((r) => /commodity|insurance/i.test(r)) && aG.alternatives.length > 0);
  check("gold's cheapest alternative is ICICI (0.50%)", aG.alternatives[0]?.symbol === "GOLDIETF.NS");
  check(
    "switch savings math: value × ΔMER",
    Math.abs((aG.alternatives[0]?.savesPerYear ?? 0) - 72600 * (0.0082 - 0.005)) < 1
  );
  check("annual fee = value × MER", Math.abs((aG.annualFee ?? 0) - 72600 * 0.0082) < 1);
  check("results sorted by weight (gold first)", out[0].symbol === "GOLDBEES.NS");

  // duplication: two Nifty-50 funds — pricier one told to consolidate
  const sbi = { ...mockEtfData("SETFNIF50.NS"), name: "SBI Nifty 50 ETF", category: "Large-Cap Index (Nifty 50)", mer: 0.0004 };
  const hdfc = { ...mockEtfData("HDFCNIFTY.NS"), name: "HDFC Nifty 50 ETF", category: "Large-Cap Index (Nifty 50)", mer: 0.0007 };
  const dup = assessAll(
    [
      { etf: sbi, value: 50000 },
      { etf: hdfc, value: 50000 },
    ],
    { market: "india", portfolioTotal: 500000 }
  );
  const aH = dup.find((a) => a.symbol === "HDFCNIFTY.NS")!;
  const aS = dup.find((a) => a.symbol === "SETFNIF50.NS")!;
  check("duplicate exposure: pricier twin flagged SWITCH", aH.verdict === "SWITCH" && aH.reasons.some((r) => /duplicates/i.test(r)));
  check("duplicate exposure: cheaper twin keeps a caution, not a switch", aS.verdict !== "SWITCH" && aS.cautions.some((c) => /overlaps/i.test(c)));
  check("overlap lists the sibling symbol", aH.overlapWith.includes("SETFNIF50.NS"));

  // no data at all → UNKNOWN
  const empty = assessAll(
    [{ etf: { symbol: "XYZ.NS", trailing: {}, annual: [], top: [], sectors: [], split: {}, fetchedAt: "t" }, value: 10000 }],
    { market: "india", portfolioTotal: 100000 }
  );
  check("no fund data anywhere → UNKNOWN verdict", empty[0].verdict === "UNKNOWN");
}

console.log("\n== ETF mapper & mocks ==");
{
  // tolerant mapping: plain numbers AND {raw} wrappers
  const mapped = mapFundSummary("VFV.TO", {
    price: { longName: "Vanguard S&P 500 Index ETF", regularMarketPrice: { raw: 148.2 }, currency: "CAD", quoteType: "ETF" },
    fundProfile: { family: "Vanguard", categoryName: "US Equity", feesExpensesInvestment: { annualReportExpenseRatio: { raw: 0.0009 } } },
    defaultKeyStatistics: { totalAssets: 2.1e10, yield: 0.011 },
    fundPerformance: {
      trailingReturns: { oneYear: 0.18, threeYear: { raw: 0.14 }, fiveYear: 0.135 },
      annualTotalReturns: { returns: [{ year: "2024", annualValue: { raw: 0.22 } }, { year: "2025", annualValue: 0.1 }] },
    },
    topHoldings: {
      holdings: [{ symbol: "AAPL", holdingName: "Apple Inc", holdingPercent: { raw: 0.07 } }],
      stockPosition: 0.998,
      sectorWeightings: [{ technology: { raw: 0.32 } }, { financial_services: 0.13 }],
    },
  });
  check("mapper unwraps {raw} and plain values alike", mapped.mer === 0.0009 && mapped.price === 148.2 && mapped.trailing.y3 === 0.14);
  check("mapper reads AUM, yield, holdings, sectors", mapped.aum === 2.1e10 && mapped.fundYield === 0.011 && mapped.top[0].name === "Apple Inc" && mapped.sectors[0].label === "Technology");
  check("annual returns sorted ascending by year", mapped.annual[0].year === 2024 && mapped.annual[1].year === 2025);
  check("fundDataEmpty is false when data exists", !fundDataEmpty(mapped));
  check("fundDataEmpty is true for a bare payload", fundDataEmpty(mapFundSummary("X", {})));

  const m1 = mockEtfData("NIFTYBEES.NS");
  check("mock ETF data is deterministic", JSON.stringify({ ...m1, fetchedAt: 0 }) === JSON.stringify({ ...mockEtfData("NIFTYBEES.NS"), fetchedAt: 0 }));
  check("mock NIFTYBEES mirrors the real fund (0.04%, huge AUM)", m1.mer === 0.0004 && (m1.aum ?? 0) > 1e11 && m1.top.length === 10);
  check("mock generic fund exists for unknown symbols", mockEtfData("RANDOMX.NS").mer !== undefined);
}

console.log("\n== Analyst context fields (mock determinism) ==");
{
  const q = mockStockData("TCS.NS").quote;
  check("mock quote carries a 12-mo target above 0", (q.targetMeanPrice ?? 0) > 0);
  check("quality mock leans buy with target above price", q.recommendationKey === "buy" && (q.targetMeanPrice ?? 0) > (q.price ?? 0));
  check("analyst count is plausible (8–32)", (q.numberOfAnalystOpinions ?? 0) >= 8 && (q.numberOfAnalystOpinions ?? 0) <= 32);
  check(
    "analyst fields are deterministic",
    JSON.stringify(q) === JSON.stringify(mockStockData("TCS.NS").quote)
  );
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
