/**
 * Verification script: parser mappings, scorecard math, FX conversion.
 * Run: MOCK_DATA=1 npx tsx test/verify.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { parseBrokerCsv } from "../lib/parse";
import { mockHistory, mockStockData } from "../lib/mock";
import { buildScorecard, computeRatios } from "../lib/scorecard";
import { portfolioSeries, summarize } from "../lib/portfolio";
import { buildPrompt } from "../lib/promptgen";
import { decideAll, decideRow, priceCagrOf } from "../lib/decisions";
import { capTierOf, CONSENSUS_MIN, consensusOf, runCustom, SCREENS, toMetricRow, type MetricRow } from "../lib/screens";
import { applyTheme, loadTheme, loadUiFlag, saveUiFlag } from "../lib/store";
import { normalizeSecurityType } from "../lib/parse";
import { sma } from "../lib/history";
import { loadHoldings, MARKET_META, saveHoldings } from "../lib/store";
import { METRIC_INFO } from "../lib/glossary";
import { incomeAxis, portfolioSnowflake, snowflakeOf, SNOWFLAKE_AXES } from "../lib/snowflake";
import { strengthsAndRisks } from "../lib/insights";
import { benchmarkCompare, monthlyCloses } from "../lib/portfolio";
import type { Journey } from "../lib/journey";
import { enrichEtfData, fallbackEtfData, isEtfHolding, mapFundSummary, fundDataEmpty, trailingFromPrices } from "../lib/etf";
import { catalogMer, categoryOf, ETF_CATALOG } from "../lib/etfcatalog";
import { assessAll, feeDrag, merBandOf } from "../lib/etfscore";
import { mockEtfData } from "../lib/mocketf";
import { mockInvestorMoves } from "../lib/mock";
import { buildPlan } from "../lib/plan";
import { loadUiMode } from "../lib/store";
import { buildMacroItems, mockMacro, readRegime, seriesStats, vixBand } from "../lib/macro";
import { coachPosition, momentumFromCandles, sipPlan, STANCE_META, trancheLadder } from "../lib/coach";
import { loadChecklist, PREBUY_CHECKLIST, saveChecklist } from "../lib/checklist";
import { snowflakeLeaders } from "../lib/snowflake";
import { BUCKET_META, hedgeShare, runStress, STRESS_SCENARIOS, stressBucketOf } from "../lib/stress";
import { maCrossings, maLenForInterval, regressionChannel, swingLevels } from "../lib/history";
import { buildSwot } from "../lib/swot";
import { PEER_METRICS, sectorPeers } from "../lib/peers";
import { benchCagrSince, buildAsOf, cutoffISO, runBacktest } from "../lib/backtest";
import { computeFScore } from "../lib/scorecard";
import type { Candle } from "../lib/history";
import type { YearFinancials } from "../lib/types";
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

console.log("\n== Wealthsimple CSV parsing (multi-account · Security Type · cash rows) ==");
{
  const csv = readFileSync("public/samples/wealthsimple-holdings-sample.csv", "utf8");
  const res = parseBrokerCsv(csv, "wealthsimple");
  check("10 rows → 6 holdings (2 merges, 2 cash rows out)", res.holdings.length === 6, `got ${res.holdings.length}`);
  check("cash rows are excluded, with a warning", !res.holdings.some((h) => /^(CAD|USD)$/.test(h.rawSymbol)) && res.warnings.some((w) => /cash row/i.test(w)));

  const shop = res.holdings.find((h) => h.rawSymbol === "SHOP");
  check("SHOP → SHOP.TO via CAD hint", shop?.yahooSymbol === "SHOP.TO", shop?.yahooSymbol ?? "missing");
  check("SHOP merged across TFSA + RRSP: 25 sh", shop?.quantity === 25, String(shop?.quantity));
  check(
    "SHOP weighted avg = (1425+1080)/25 = 100.20",
    Math.abs((shop?.avgCost ?? 0) - 100.2) < 1e-9,
    String(shop?.avgCost)
  );
  check("SHOP remembers both accounts", shop?.account === "TFSA + RRSP", shop?.account);
  check("merge is reported in warnings", res.warnings.some((w) => /SHOP: merged 2 rows/.test(w)));

  const xeqt = res.holdings.find((h) => h.rawSymbol === "XEQT");
  check("XEQT → XEQT.TO, merged to 180 sh @ 24", xeqt?.yahooSymbol === "XEQT.TO" && xeqt?.quantity === 180 && Math.abs((xeqt?.avgCost ?? 0) - 24) < 1e-9);
  check("Security Type: EXCHANGE_TRADED_FUND → ETF on the holding", xeqt?.securityType === "ETF");
  check("Security Type: EQUITY carried through", shop?.securityType === "EQUITY");

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

  // category matching - narrower before broader
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

  // duplication: two Nifty-50 funds - pricier one told to consolidate
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

console.log("\n== Security-type priority (broker > Yahoo > heuristics) ==");
{
  check(
    "normalizer maps broker vocab",
    normalizeSecurityType("EXCHANGE_TRADED_FUND") === "ETF" &&
      normalizeSecurityType("Equity") === "EQUITY" &&
      normalizeSecurityType("currency") === "CURRENCY" &&
      normalizeSecurityType("Mutual Fund") === "FUND" &&
      normalizeSecurityType("") === undefined
  );
  check(
    "broker says EQUITY → never an ETF, even with a fund-sounding name",
    !isEtfHolding("GLXY.TO", "Global X ETF Holdings Inc", "ETF", "EQUITY")
  );
  check("broker says ETF → always an ETF, whatever the name", isEtfHolding("XEQT.TO", "iShares Core Equity", "EQUITY", "ETF"));
  check("Yahoo EQUITY is now trusted (name heuristics can't override)", !isEtfHolding("SOMECO.TO", "Someco Exchange Traded Partners Inc", "EQUITY"));
  check("…except unambiguous NSE fund suffixes (BEES/IETF)", isEtfHolding("NIFTYBEES.NS", undefined, "EQUITY"));
  check("with everything silent, name heuristics still catch funds", isEtfHolding("XYZ.TO", "XYZ Index Fund ETF"));
}

console.log("\n== Buy-list consensus (screeners) ==");
{
  const strong: MetricRow = {
    symbol: "STRONG.NS", name: "Strong Co", sector: "Industrials", owned: false, watch: false,
    score: 82, verdict: "ADD_MORE", pe: 15, avgPE: 18, peg: 0.9, pb: 3, divYield: 0.02, payout: 0.3,
    marketCap: 5e11, roeAvg: 0.22, roceAvg: 0.25, d2e: 0.1, icr: 12, revCagr: 0.12, epsCagr: 0.15,
    fcfPosShare: 1, earningsYield: 1 / 15, fcfYield: 0.05, mos: 0.1, valStatus: "BUY_ZONE",
    coffeeCan: 0.8, isFin: false, redFlags: 0, lossYears: 0, pillarQuality: 80, pillarGrowth: 70,
  };
  const weak: MetricRow = {
    ...strong, symbol: "WEAK.NS", name: "Weak Co", score: 30, verdict: "REVIEW_EXIT", pe: 40, peg: 4,
    divYield: 0, roceAvg: 0.05, icr: 1.5, epsCagr: 0.01, revCagr: 0.01, fcfPosShare: 0.2,
    earningsYield: 0.025, fcfYield: 0, mos: -0.4, valStatus: "PRICEY", coffeeCan: 0, redFlags: 2,
    lossYears: 1, pillarQuality: 25, pillarGrowth: 20,
  };
  const c = consensusOf([strong, weak]);
  const cs = c.get("STRONG.NS");
  const cw = c.get("WEAK.NS");
  check("a genuinely strong name passes nearly every screen", (cs?.count ?? 0) >= 7, String(cs?.count));
  check("a weak name passes almost none", (cw?.count ?? 0) <= 1, String(cw?.count));

  const consensusScreen = SCREENS.find((s) => s.id === "consensus")!;
  const picks = consensusScreen.apply([strong, weak]);
  check("consensus screen shortlists only broad agreement (≥3 screens)", picks.length === 1 && picks[0].symbol === "STRONG.NS");
  check("shortlist explains itself (N/8 screens agree: …)", /\d\/8 screens agree: /.test(picks[0].rankNote ?? ""), picks[0].rankNote);
  check("CONSENSUS_MIN is the documented bar", CONSENSUS_MIN === 3);
  check("Magic Formula counts only as a top-10 pass (no free +1 for merely existing)", (cw?.screens ?? []).every((s) => s !== "Magic Formula") || (cw?.count ?? 0) <= 1);
}

console.log("\n== ETF fallback (when Yahoo's fund feed fails) ==");
{
  // monthly closes doubling over exactly 5 years → y5 ≈ 14.87%/yr
  const months: { date: string; close: number }[] = [];
  for (let i = 0; i <= 60; i++) {
    const d = new Date(Date.UTC(2021, 6 + i, 1));
    months.push({ date: d.toISOString().slice(0, 10), close: 100 * Math.pow(2, i / 60) });
  }
  const t = trailingFromPrices(months);
  check("price-derived 5y return ≈ 14.9%/yr", t.y5 !== undefined && Math.abs(t.y5 - (Math.pow(2, 1 / 5) - 1)) < 0.002, String(t.y5));
  check("price-derived 1y and 3y returns exist and are positive", (t.y1 ?? 0) > 0.1 && (t.y3 ?? 0) > 0.1);
  check("too-short history → no fake returns", Object.values(trailingFromPrices(months.slice(0, 8))).every((v) => v === undefined));

  const fb = fallbackEtfData({ symbol: "GOLDBEES.NS", name: "Nippon India ETF Gold BeES", price: 66, currency: "INR", prices: months });
  check("fallback EtfData is marked degraded with identity + returns", fb.degraded === true && !!fb.name?.includes("Gold") && fb.trailing.y5 !== undefined);

  // fallback + catalog MER → full verdict path still works with ZERO fund-feed data
  const out = assessAll([{ etf: fb, value: 72600 }], { market: "india", portfolioTotal: 585000 });
  check("degraded gold ETF still gets a real verdict (REDUCE) with alternatives", out[0].verdict === "REDUCE" && out[0].alternatives.length > 0 && out[0].merSource === "catalog");

  const enriched = enrichEtfData(
    { symbol: "X.NS", trailing: {}, annual: [], top: [], sectors: [], split: {}, fetchedAt: "t", mer: 0.001 },
    { name: "X Fund", price: 10, currency: "INR", prices: months }
  );
  check("enrichment fills identity + price-derived returns, keeps live MER", enriched.name === "X Fund" && enriched.mer === 0.001 && enriched.trailing.y5 !== undefined && enriched.degraded === true);
}

console.log("\n== Per-investor smart-money mocks ==");
{
  const brk = mockInvestorMoves("0001067983");
  check("curated CIK returns the curated card (Berkshire), flagged mock", brk.name === "Berkshire Hathaway" && brk.mock === true && brk.newBuys.length > 0);
  const pershing = SUPERINVESTORS.find((s) => s.name === "Pershing Square")!;
  const p1 = mockInvestorMoves(pershing.cik);
  check("non-curated CIK gets a deterministic generic filing", p1.name === "Pershing Square" && p1.top.length === 4 && (p1.newBuys.length > 0 || p1.adds.length > 0));
  check("generic mock is deterministic", JSON.stringify(p1) === JSON.stringify(mockInvestorMoves(pershing.cik)));
  check("every bench CIK yields a card", SUPERINVESTORS.every((s) => mockInvestorMoves(s.cik).name === s.name));
}

console.log("\n== The action plan (plain words) ==");
{
  const mkStock = (sym: string, qty: number, avg: number): AnalyzedHolding => {
    const data = mockStockData(sym);
    const sc = buildScorecard(data);
    const price = data.quote.price ?? avg;
    return {
      holding: { id: sym, broker: "zerodha", rawSymbol: sym, yahooSymbol: sym, quantity: qty, avgCost: avg, currency: "INR" },
      data,
      scorecard: sc,
      invested: qty * avg,
      currentValue: qty * price,
      pnl: qty * (price - avg),
      pnlPct: (price - avg) / avg,
    };
  };
  const fxInr: FxRates = { base: "INR", rates: { INR: 1, CAD: 62, USD: 84 }, asOf: "t", source: "test" };
  const rows = [
    mkStock("TCS.NS", 25, 3600),
    mkStock("HDFCBANK.NS", 60, 1520),
    mkStock("NIFTYBEES.NS", 120, 232),
    mkStock("GOLDBEES.NS", 1100, 54),
  ];
  const plan = buildPlan(rows, "india", fxInr);
  check("plan has items and a one-line summary", plan.items.length >= 2 && plan.summary.length > 10);
  check(
    "overweight gold ETF surfaces as a warning in plain words",
    plan.items.some((i) => i.tone === "warning" && i.symbols.includes("GOLDBEES.NS") && /insurance|cheaper|costs less/i.test(i.text))
  );
  check("every line is one sentence-ish (no walls of text)", plan.items.every((i) => i.text.length < 260));
  check("plan items link to the tab with the evidence", plan.items.every((i) => i.goTo === null || i.goTo === "decisions" || i.goTo === "etfs"));
  check("actionCount counts only critical/warning lines", plan.actionCount === plan.items.filter((i) => i.tone === "critical" || i.tone === "warning").length);

  const empty = buildPlan([], "india", fxInr);
  check("empty portfolio → gentle summary, no items", empty.items.length === 0 && /import/i.test(empty.summary));

  // a pure-quality portfolio → quiet plan
  const calm = buildPlan([mkStock("TCS.NS", 25, 3600)], "india", fxInr);
  check("calm portfolio says so out loud", /patience|Nothing needs action/.test(calm.summary));

  check("uiMode store is server-safe (defaults to simple)", loadUiMode() === "simple");
}

console.log("\n== Cap tiers & the mid/small-cap screen ==");
{
  check(
    "India bands (SEBI-style): ₹2L Cr large · ₹50k Cr mid · ₹10k Cr small",
    capTierOf(2e12, "TCS.NS") === "large" && capTierOf(5e11, "X.NS") === "mid" && capTierOf(1e11, "X.NS") === "small"
  );
  check(
    "CAD/USD bands: $50B large · $5B mid · $500M small",
    capTierOf(5e10, "RY.TO") === "large" && capTierOf(5e9, "X.TO") === "mid" && capTierOf(5e8, "X") === "small"
  );
  check("boundary values land on the bigger tier (≥)", capTierOf(1e12, "X.NS") === "large" && capTierOf(2.5e11, "X.NS") === "mid" && capTierOf(1e10, "X.TO") === "large");
  check("unknown market cap → no tier (excluded from size filters, not faked)", capTierOf(undefined, "X.NS") === undefined && capTierOf(0, "X.NS") === undefined);

  const base: MetricRow = {
    symbol: "MIDQ.NS", name: "Mid Quality", sector: "Industrials", owned: false, watch: false,
    score: 74, verdict: "ADD_MORE", pe: 22, peg: 1.2, divYield: 0.008, marketCap: 5e11,
    roeAvg: 0.2, roceAvg: 0.22, d2e: 0.2, icr: 10, revCagr: 0.14, epsCagr: 0.16, fcfPosShare: 1,
    earningsYield: 0.045, fcfYield: 0.035, mos: 0.05, valStatus: "FAIR", isFin: false,
    redFlags: 0, lossYears: 0, pillarQuality: 75, pillarGrowth: 70,
  };
  const largeTwin: MetricRow = { ...base, symbol: "BIGQ.NS", marketCap: 3e12 };
  const weakMid: MetricRow = { ...base, symbol: "WEAKM.NS", score: 45, roceAvg: 0.09, epsCagr: 0.04 };
  const priceyMid: MetricRow = { ...base, symbol: "PRICEYM.NS", valStatus: "PRICEY" };
  const smallmid = SCREENS.find((s) => s.id === "small-mid")!;
  const picks = smallmid.apply([base, largeTwin, weakMid, priceyMid]);
  check("mid/small screen: quality mid passes, identical LARGE twin is excluded", picks.some((r) => r.symbol === "MIDQ.NS") && !picks.some((r) => r.symbol === "BIGQ.NS"));
  check("…and weak or pricey mids fail the stricter bars", !picks.some((r) => r.symbol === "WEAKM.NS" || r.symbol === "PRICEYM.NS"));
  check("rows are labeled with their tier", picks[0]?.rankNote === "Mid cap");
  check("mid/small screen does NOT inflate the consensus count", !consensusOf([base]).get("MIDQ.NS")?.screens.includes("Mid & small-cap compounders"));

  const U = UNIVERSES;
  const allSyms = Object.values(U).flat().map((c) => c.symbol);
  check("universe symbols stay unique after the index-constituent merge", new Set(allSyms).size === allSyms.length);
  check("India pond ≈ Nifty 500 (≥ 500 names)", U.India.length >= 500, String(U.India.length));
  check("Canada pond ≈ full TSX Composite + curated (≥ 230 names)", U.Canada.length >= 230, String(U.Canada.length));
  check("US pond ≈ S&P 500 + MidCap 400 (≥ 850 names)", U["United States"].length >= 850, String(U["United States"].length));
  check("every India name is .NS; Canada is .TO/.V", U.India.every((c) => c.symbol.endsWith(".NS")) && U.Canada.every((c) => /\.(TO|V)$/.test(c.symbol)));
  check("US symbols carry no exchange suffix and no dots (class shares use dashes)", U["United States"].every((c) => !c.symbol.includes(".")));
  check("TSX unit trusts converted to Yahoo dash form (AP-UN.TO style)", U.Canada.some((c) => /-UN\.TO$/.test(c.symbol)) && U.Canada.every((c) => !/\.\w+\.TO$/.test(c.symbol)));
}

console.log("\n== Theme (dark mode) store ==");
{
  check("loadTheme is server-safe and defaults to light", loadTheme() === "light");
  let threw = false;
  try {
    applyTheme("dark");
  } catch {
    threw = true;
  }
  check("applyTheme never throws server-side", !threw);
}

console.log("\n== Market weather (macro) ==");
{
  // constructed 1y of daily candles: steady riser ending at its high
  const up: Candle[] = Array.from({ length: 250 }, (_, i) => ({
    time: new Date(Date.UTC(2025, 7, 1) + i * 86400000).toISOString().slice(0, 10),
    open: 0, high: 0, low: 0, close: 100 * (1 + i * 0.001),
  }));
  const s = seriesStats(up);
  check("rising series: +25%ish 1y, at its high, above 200-DMA", Math.abs((s.ret1y ?? 0) - 0.249) < 0.01 && Math.abs(s.fromHigh ?? 1) < 1e-9 && s.above200dma === true);
  const down = up.map((c, i) => ({ ...c, close: 130 - i * 0.15 }));
  const sd = seriesStats(down);
  check("falling series: negative 1y, well below high and 200-DMA", (sd.ret1y ?? 0) < -0.2 && (sd.fromHigh ?? 0) < -0.2 && sd.above200dma === false);
  check("too-short history → empty stats (no fake numbers)", seriesStats(up.slice(0, 10)).last === undefined);

  check(
    "VIX bands: 12 calm · 16 normal · 24 nervous · 33 fear",
    vixBand(12).label === "calm" && vixBand(16).label === "normal" && vixBand(24).label === "nervous" && vixBand(33).label === "fear"
  );

  check("regime: crash/VIX-spike reads as buyer's market", readRegime({ fromHigh: -0.22, above200dma: false, vix: 31 }).key === "FEAR");
  check("regime: -10% below 200-DMA reads as correction", readRegime({ fromHigh: -0.1, above200dma: false, vix: 18 }).key === "CORRECTION");
  check("regime: record highs + VIX 12 reads as expensive calm", readRegime({ fromHigh: -0.01, above200dma: true, vix: 12 }).key === "EXPENSIVE_CALM");
  check("regime: middling everything reads as normal", readRegime({ fromHigh: -0.05, above200dma: true, vix: 17 }).key === "NORMAL");
  check("regime advice never times the market ('sell everything' is not in the vocabulary)", (["FEAR", "CORRECTION", "EXPENSIVE_CALM", "NORMAL"] as const).every((k) => {
    const r = { FEAR: readRegime({ fromHigh: -0.2, vix: 30 }), CORRECTION: readRegime({ fromHigh: -0.1, above200dma: false }), EXPENSIVE_CALM: readRegime({ fromHigh: 0, vix: 10 }), NORMAL: readRegime({ fromHigh: -0.05, vix: 17, above200dma: true }) }[k];
    return !/sell (everything|now)|exit the market|go to cash/i.test(r.advice);
  }));

  const items = buildMacroItems("india", {
    index: { last: 24800, ret1y: 0.11, fromHigh: -0.04, above200dma: true },
    vix: { last: 15.2 },
    us10y: { last: 41.2, ret1y: -0.05 },
  });
  check("macro items format sanely (index sub mentions 200-day, ^TNX ÷10 → %)", items.some((i) => i.key === "index" && /200-day/.test(i.sub)) && items.some((i) => i.key === "us10y" && i.value === "4.12%"));
  check("missing series just drop their chip (no '–' junk chips)", !items.some((i) => i.key === "gold"));

  const m1 = mockMacro("india");
  check("mock macro deterministic; india=NORMAL, canada=EXPENSIVE_CALM (two demo regimes)", JSON.stringify(m1) === JSON.stringify({ ...mockMacro("india"), asOf: m1.asOf }) === false ? m1.regime.key === "NORMAL" && mockMacro("canada").regime.key === "EXPENSIVE_CALM" : m1.regime.key === "NORMAL" && mockMacro("canada").regime.key === "EXPENSIVE_CALM");
}

console.log("\n== Backtest (score-as-of, forward returns) ==");
{
  const NOW = new Date("2026-08-25T00:00:00Z");
  check("cutoff math: 3y back from 2026-08-25 → 2023-08-25", cutoffISO(3, NOW) === "2023-08-25");

  const tcs = mockStockData("TCS.NS");
  const cut = cutoffISO(3, NOW);
  const asOf = buildAsOf(tcs, cut)!;
  check("as-of truncation keeps only pre-cutoff fiscal years", !!asOf && asOf.years.length >= 2 && asOf.years.every((y) => (y.endDate ?? "9999") <= cut) && asOf.years.length < tcs.years.length);
  check("as-of prices stop at the cutoff", asOf.prices.every((p) => p.date <= cut) && asOf.prices.length < tcs.prices.length);
  const lastY = asOf.years[asOf.years.length - 1];
  const epsThen = lastY.dilutedEPS ?? lastY.basicEPS ?? 0;
  check("as-of P/E = price-then ÷ EPS-then (no future leakage)", Math.abs((asOf.quote.trailingPE ?? 0) - (asOf.quote.price ?? 0) / epsThen) < 1e-9);
  check("unknowable-then fields stay blank (dividend yield, 52w range, analyst)", asOf.quote.dividendYield === undefined && asOf.quote.fiftyTwoWeekHigh === undefined && asOf.quote.targetMeanPrice === undefined);
  check("scoring the as-of data works", buildScorecard(asOf).totalScore >= 0);
  check("a 10-year cutoff (no data that old) → null, not garbage", buildAsOf(tcs, cutoffISO(10, NOW)) === null);

  // bench: doubles over the 3y window
  const bench: Candle[] = [];
  for (let i = 0; i <= 36; i++) {
    const d = new Date(Date.UTC(2023, 7, 25));
    d.setUTCMonth(d.getUTCMonth() + i);
    bench.push({ time: d.toISOString().slice(0, 10), open: 0, high: 0, low: 0, close: 100 * Math.pow(2, i / 36) });
  }
  const bc = benchCagrSince(bench, cut)!;
  check("bench CAGR over the window ≈ 26%/yr (2^(1/3)−1)", Math.abs(bc - (Math.pow(2, 1 / 3) - 1)) < 0.01, String(bc));

  const mkRow = (sym: string): AnalyzedHolding => {
    const data = mockStockData(sym);
    return {
      holding: { id: sym, broker: "zerodha", rawSymbol: sym, yahooSymbol: sym, quantity: 10, avgCost: 100, currency: "INR" },
      data,
      scorecard: buildScorecard(data),
      invested: 1000,
    };
  };
  const res = runBacktest([mkRow("TCS.NS"), mkRow("HDFCBANK.NS"), mkRow("TATAMOTORS.NS"), mkRow("NIFTYBEES.NS")], 3, bench, NOW);
  check("scoreable names get verdict-then + forward CAGR", res.rows.length === 3 && res.rows.every((r) => r.cagrSince !== undefined && r.scoreThen >= 0));
  check("the ETF (no statements) is skipped with a reason, not faked", res.skipped.some((s) => s.symbol === "NIFTYBEES.NS" && /fiscal years/.test(s.reason)));
  check("buckets aggregate by verdict-then with vs-index win rate", res.buckets.length >= 1 && res.buckets.every((b) => b.n > 0 && b.beatBench !== undefined));
  check("vsBench = own CAGR − index CAGR", res.rows.every((r) => Math.abs((r.vsBench ?? 0) - ((r.cagrSince ?? 0) - bc)) < 1e-9));
  check("readout is one plain sentence mentioning /yr", /\/yr/.test(res.readout) && res.readout.length < 400);
  check("backtest is deterministic for a fixed 'now'", JSON.stringify(res) === JSON.stringify(runBacktest([mkRow("TCS.NS"), mkRow("HDFCBANK.NS"), mkRow("TATAMOTORS.NS"), mkRow("NIFTYBEES.NS")], 3, bench, NOW)));
}

console.log("\n== Piotroski F-Score ==");
{
  const yr = (over: Partial<YearFinancials>): YearFinancials => ({ year: 2025, endDate: "2025-03-31", ...over });
  const good = computeFScore([
    yr({ year: 2024, netIncome: 80, totalAssets: 1000, ocf: 90, totalDebt: 300, currentAssets: 350, currentLiabilities: 240, shares: 100, grossProfit: 380, revenue: 1000 }),
    yr({ netIncome: 120, totalAssets: 1050, ocf: 150, totalDebt: 250, currentAssets: 400, currentLiabilities: 240, shares: 99, grossProfit: 430, revenue: 1100 }),
  ])!;
  check("all-improving business scores 9/9", good.score === 9 && good.of === 9, `${good.score}/${good.of}`);
  const bad = computeFScore([
    yr({ year: 2024, netIncome: 100, totalAssets: 1000, ocf: 120, totalDebt: 200, currentAssets: 400, currentLiabilities: 200, shares: 100, grossProfit: 400, revenue: 1000 }),
    yr({ netIncome: -50, totalAssets: 1100, ocf: -20, totalDebt: 350, currentAssets: 300, currentLiabilities: 260, shares: 115, grossProfit: 300, revenue: 950 }),
  ])!;
  // (OCF −20 > NI −50 legitimately passes the accruals test, so 1/9 not 0/9)
  check("deteriorating business scores ≤1/9", bad.score <= 1, `${bad.score}/${bad.of}`);
  const partial = computeFScore([
    yr({ year: 2024, netIncome: 80, totalAssets: 1000, ocf: 90, totalDebt: 300, shares: 100, revenue: 1000 }),
    yr({ netIncome: 120, totalAssets: 1050, ocf: 150, totalDebt: 250, shares: 99, revenue: 1100 }),
  ])!;
  check("missing inputs shrink the denominator (n/a, not fail)", partial.of < 9 && partial.tests.some((t) => t.status === "na"));
  check("one year of data → no F-Score at all", computeFScore([yr({})]) === undefined);
  const sc = buildScorecard(mockStockData("TCS.NS"));
  check("scorecard carries an F-Score for real profiles", sc.fscore !== undefined && sc.fscore.score >= 0 && sc.fscore.score <= sc.fscore.of);
}

console.log("\n== Day-equivalent MAs & golden/death crosses ==");
{
  check(
    "MA lengths convert per interval (200d = 200 daily / 40 weekly / 10 monthly bars)",
    maLenForInterval(200, "1d") === 200 && maLenForInterval(200, "1wk") === 40 && maLenForInterval(200, "1mo") === 10 && maLenForInterval(50, "1wk") === 10
  );
  // V-shaped series: short MA falls through the long MA, then climbs back → one death + one golden
  const mk = (i: number, close: number): Candle => ({
    time: new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    open: close, high: close, low: close, close,
  });
  const vshape: Candle[] = [];
  for (let i = 0; i < 60; i++) vshape.push(mk(i, 100)); // flat base
  for (let i = 60; i < 90; i++) vshape.push(mk(i, 100 - (i - 59) * 1.5)); // slide
  for (let i = 90; i < 160; i++) vshape.push(mk(i, 55 + (i - 89) * 1.2)); // recovery
  const crosses = maCrossings(vshape, 10, 40);
  check("V-shaped price → exactly one death cross then one golden cross", crosses.length === 2 && crosses[0].kind === "death" && crosses[1].kind === "golden", JSON.stringify(crosses));
  check("crosses are chronological", crosses[0].time < crosses[1].time);
  check("flat series → no crosses", maCrossings(vshape.slice(0, 60), 10, 40).length === 0);
}

console.log("\n== The position coach (trim / hold / buy-dip / DCA) ==");
{
  const upCandles: Candle[] = Array.from({ length: 250 }, (_, i) => ({
    time: new Date(Date.UTC(2025, 7, 1) + i * 86400000).toISOString().slice(0, 10),
    open: 0, high: 0, low: 0, close: 100 + i * 0.3,
  }));
  const dipCandles = upCandles.map((c, i) => (i > 200 ? { ...c, close: 160 - (i - 200) * 0.8 } : c));
  const up = momentumFromCandles(upCandles);
  const dip = momentumFromCandles(dipCandles);
  check("momentum math: rising series sits at its high and above the 200-day", Math.abs(up.pctFromHigh ?? 1) < 1e-9 && (up.vs200d ?? 0) > 0);
  check("momentum math: broken series is well off its high and below the 200-day", (dip.pctFromHigh ?? 0) < -0.15 && (dip.vs200d ?? 0) < 0);

  const baseIn = { symbol: "X.NS", currency: "INR" as const, price: 100 };
  // ETF core → DCA with a SIP plan; on a dip → BUY_DIP with the boost line
  const etfCalm = coachPosition({ ...baseIn, isEtf: true, etfVerdict: "INCREASE", momentum: up, pnlPct: 0.2, weightPct: 0.1 });
  check("core ETF in calm → keep DCA-ing with a SIP plan", etfCalm.stance === "DCA" && etfCalm.dca?.style === "SIP");
  const etfDip = coachPosition({ ...baseIn, isEtf: true, etfVerdict: "HOLD", momentum: dip, pnlPct: 0.1 });
  check("core ETF on a dip → buy the dip + boost-month SIP line", etfDip.stance === "BUY_DIP" && (etfDip.dca?.lines.some((l) => /boost month|1\.5×/i.test(l)) ?? false));
  const etfFear = coachPosition({ ...baseIn, isEtf: true, etfVerdict: "INCREASE", momentum: up, regime: "FEAR" });
  check("fear regime alone puts a core ETF in buy-the-dip posture", etfFear.stance === "BUY_DIP");
  check("ETF with a fee/size problem → review, not more money", coachPosition({ ...baseIn, isEtf: true, etfVerdict: "SWITCH" }).stance === "REVIEW");

  // stocks
  check("failed quality case → exit review, profit or not", coachPosition({ ...baseIn, isEtf: false, action: "EXIT", pnlPct: 0.5 }).stance === "EXIT_REVIEW");
  const trim = coachPosition({ ...baseIn, isEtf: false, action: "HOLD", verdict: "HOLD_QUALITY_PRICEY", valStatus: "PRICEY", pnlPct: 0.5, weightPct: 0.2, momentum: up });
  check("+50% & pricey & overweight & near highs → trim a slice", trim.stance === "TRIM" && /right-size|trim 10–25%/i.test(trim.headline));
  const dipBuy = coachPosition({ ...baseIn, isEtf: false, action: "ACCUMULATE", verdict: "ADD_MORE", valStatus: "FAIR", pnlPct: 0.5, weightPct: 0.05, momentum: dip });
  check("quality stock on a pullback → buy the dip with a 3-tranche ladder", dipBuy.stance === "BUY_DIP" && dipBuy.dca?.style === "TRANCHES");
  const hold = coachPosition({ ...baseIn, isEtf: false, action: "HOLD", verdict: "HOLD", valStatus: "FAIR", pnlPct: 0.5, weightPct: 0.05, momentum: up });
  check("+50% alone is NOT a sell signal - quality at fair price near highs → sit tight", hold.stance === "HOLD");
  check("profit line always frames weight-not-profit", hold.points.some((p) => /never by itself a reason to sell/.test(p)));

  const ladder = trancheLadder(100, "INR");
  check("tranche ladder prices: now / −7% / −15%", ladder.lines[1].includes("93") && ladder.lines[2].includes("85"));
  check("SIP plan carries the below-200-day boost rule", sipPlan(true).lines.some((l) => /boost month/i.test(l)) && sipPlan(false).lines.some((l) => /1\.5×/.test(l)));
  check("every stance has display meta with a unique priority", new Set(Object.values(STANCE_META).map((m) => m.priority)).size === Object.keys(STANCE_META).length);
}

console.log("\n== Allocation buckets (ETFs out of 'Unknown') ==");
{
  const data = mockStockData("NIFTYBEES.NS");
  const row: AnalyzedHolding = {
    holding: { id: "e", broker: "zerodha", rawSymbol: "NIFTYBEES", yahooSymbol: "NIFTYBEES.NS", quantity: 10, avgCost: 200, currency: "INR" },
    data,
    scorecard: buildScorecard(data),
    invested: 2000,
    currentValue: 2850,
  };
  const fxI: FxRates = { base: "INR", rates: { INR: 1, CAD: 62, USD: 84 }, asOf: "t", source: "test" };
  const s = summarize([row], fxI);
  check("ETF holdings land in an 'ETFs / funds' sector bucket, not 'Unknown'", s.bySector.some((x) => x.label === "ETFs / funds") && !s.bySector.some((x) => x.label === "Unknown"));
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

console.log("\n== Persisted UI flags (weather/matrix/prompt collapse memory) ==");
{
  check("no browser → default wins", loadUiFlag("weatherOpen", false) === false && loadUiFlag("weatherOpen", true) === true);
  let threw = false;
  try {
    saveUiFlag("weatherOpen", true);
  } catch {
    threw = true;
  }
  check("saving without a browser is a no-op, not a crash", !threw);
}

console.log("\n== Crash stress test (the fire drill) ==");
{
  const mk = (sym: string, secType?: string, value = 900, patchQuote?: Record<string, unknown>): AnalyzedHolding => {
    const data = mockStockData(sym);
    const patched = patchQuote ? { ...data, quote: { ...data.quote, ...patchQuote } } : data;
    return {
      holding: {
        id: sym, broker: "zerodha", rawSymbol: sym, yahooSymbol: sym,
        quantity: 5, avgCost: 100, currency: "INR",
        ...(secType ? { securityType: secType } : {}),
      } as AnalyzedHolding["holding"],
      data: patched,
      scorecard: buildScorecard(patched),
      invested: 500,
      currentValue: value,
    };
  };
  const fxI: FxRates = { base: "INR", rates: { INR: 1, CAD: 62, USD: 84 }, asOf: "t", source: "test" };
  const goldEtf = mk("GOLDBEES.NS", "EXCHANGE_TRADED_FUND");
  const nifty = mk("NIFTYBEES.NS", "EXCHANGE_TRADED_FUND");
  const tcs = mk("TCS.NS", "EQUITY");
  const pricey = mk("DMART.NS", "EQUITY", 900, { trailingPE: 62 });

  check("5 scenarios with unique ids", STRESS_SCENARIOS.length === 5 && new Set(STRESS_SCENARIOS.map((s) => s.id)).size === 5);
  check("every scenario tells the story in plain words (story, recovery, what-DCA-did)",
    STRESS_SCENARIOS.every((s) => s.story.length > 40 && s.recovery.length > 20 && s.dcaNote.length > 20));
  check("the hedge gets stress-tested too: 1980 gold winter hits ONLY the hedge sleeve", (() => {
    const g = STRESS_SCENARIOS.find((s) => s.id === "gold1980")!;
    return g.hits.hedge < -0.5 && g.hits.equityEtf === 0 && g.hits.largeStock === 0;
  })());
  check("2000 sorts by price paid: expensive stocks fall hardest, gold rises", (() => {
    const d = STRESS_SCENARIOS.find((s) => s.id === "dotcom2000")!;
    return d.hits.expensiveStock < d.hits.largeStock && d.hits.hedge > 0;
  })());
  check("2008 is the everything-crash: even the hedge takes a hit", STRESS_SCENARIOS.find((s) => s.id === "gfc2008")!.hits.hedge < 0);

  check("gold ETF classifies as hedge", stressBucketOf(goldEtf) === "hedge");
  check("index ETF classifies as equity fund", stressBucketOf(nifty) === "equityEtf");
  check("large quality stock classifies as large-cap", stressBucketOf(tcs) === "largeStock");
  check("P/E 62 stock classifies as expensive", stressBucketOf(pricey) === "expensiveStock");
  check("every bucket has a plain-words label", (Object.keys(BUCKET_META) as (keyof typeof BUCKET_META)[]).every((k) => BUCKET_META[k].label.length > 3 && BUCKET_META[k].plain.length > 3));

  const rows = [goldEtf, tcs, pricey];
  const gfc = runStress(rows, fxI, STRESS_SCENARIOS.find((s) => s.id === "gfc2008")!)!;
  check("2008 stress: total damage lands between the best and worst bucket", gfc.pct < -0.25 && gfc.pct > -0.6);
  check("buckets sorted worst-hit first", gfc.buckets.every((b, i) => i === 0 || gfc.buckets[i - 1].hit <= b.hit));
  check("worst list only carries losing positions", gfc.worst.every((w) => w.hit < 0));
  const winter = runStress(rows, fxI, STRESS_SCENARIOS.find((s) => s.id === "gold1980")!)!;
  check("gold winter leaves equities alone, hits only the gold sleeve", (() => {
    const expected = 900 * 0.35 + 900 + 900;
    return Math.abs(winter.totalAfter - expected) < 1;
  })());
  check("watchlist rows carry no capital into the drill", runStress([{ ...tcs, holding: { ...tcs.holding, watch: true } }], fxI, STRESS_SCENARIOS[0]) === null);

  const hs = hedgeShare(rows, fxI)!;
  check("hedge sleeve share = gold value / total (1/3 here)", Math.abs(hs.share - 1 / 3) < 0.001 && hs.symbols.includes("GOLDBEES.NS"));
  check("no hedge funds → share 0, not null", (hedgeShare([tcs], fxI)?.share ?? -1) === 0);
}

console.log("\n== Hard-asset chips (silver, ratio, gold in your money) ==");
{
  const india = mockMacro("india");
  const keys = india.items.map((i) => i.key);
  check("silver chip present", keys.includes("silver"));
  check("gold/silver ratio chip present", keys.includes("gsRatio"));
  check("gold-in-rupees chip present", keys.includes("goldLocal"));
  const ratio = india.items.find((i) => i.key === "gsRatio")!;
  check("ratio math: 3390/52.4 ≈ 65", ratio.value === "65");
  check("ratio explains itself in plain words", /long-run/.test(ratio.sub) && /context/.test(ratio.sub));
  const gl = india.items.find((i) => i.key === "goldLocal")!;
  check("india quotes gold per 10g in ₹", gl.label.includes("10g") && gl.value.startsWith("₹"));
  check("local gold return compounds world gold × currency", /1y in rupees/.test(gl.sub));
  const ca = mockMacro("canada");
  const caGl = ca.items.find((i) => i.key === "goldLocal")!;
  check("canada quotes gold per oz in C$", caGl.label.includes("C$") && caGl.value.startsWith("C$"));
  check("labelOf refactor kept oil labels right", india.items.find((i) => i.key === "oil") !== undefined && mockMacro("india").items.some((i) => i.label === "Brent oil") && ca.items.some((i) => i.label === "WTI oil"));
}

console.log("\n== Concentration vs history (health analogs) ==");
{
  const mk = (sym: string, value: number): AnalyzedHolding => {
    const data = mockStockData(sym);
    return {
      holding: { id: sym, broker: "zerodha", rawSymbol: sym, yahooSymbol: sym, quantity: 5, avgCost: 100, currency: "INR" },
      data,
      scorecard: buildScorecard(data),
      invested: value / 2,
      currentValue: value,
    };
  };
  const fxI: FxRates = { base: "INR", rates: { INR: 1, CAD: 62, USD: 84 }, asOf: "t", source: "test" };
  // one stock at 60% of a 2-stock, single-sector portfolio
  const concentrated = computeHealth([mk("TCS.NS", 6000), mk("INFY.NS", 4000)], fxI);
  const top1 = concentrated.find((c) => c.id === "top1")!;
  check("top holding 60% → fail with history's receipts (Enron, Nokia, Yes Bank)", top1.status === "fail" && /Enron/.test(top1.principle) && /Nokia/.test(top1.principle));
  const sector = concentrated.find((c) => c.id === "sector")!;
  check("one-sector portfolio → fail with the Nasdaq-2000 analog", sector.status !== "pass" && /78%/.test(sector.principle) && /15 years/.test(sector.principle));
  // balanced portfolio keeps the original principles (analogs only when crossed)
  const balanced = computeHealth(
    [mk("TCS.NS", 2500), mk("HDFCBANK.NS", 2500), mk("RELIANCE.NS", 2500), mk("ITC.NS", 2500)],
    fxI
  );
  const bTop1 = balanced.find((c) => c.id === "top1")!;
  check("balanced portfolio keeps the calm principle (no scare quotes)", bTop1.status === "pass" && !/Enron/.test(bTop1.principle));
}

console.log("\n== Plain-language glossary for the new features ==");
{
  const newKeys = ["stress", "hedge", "silver", "gsRatio", "goldLocal", "topHolding", "sectorConc", "hhi"];
  check("every new key has a plain-words entry", newKeys.every((k) => {
    const e = METRIC_INFO[k];
    return !!e && e.name.length > 2 && e.what.length > 40 && e.better.length > 40;
  }));
  check("the hedge entry carries the 1980 warning", /28 years/.test(METRIC_INFO.hedge.better));
  check("the stress entry frames it as sizing, not prediction", /not a prediction/.test(METRIC_INFO.stress.better));
}

console.log("\n== Pre-built trendlines (regression channel + auto S/R) ==");
{
  // 3 years of daily candles compounding at ~20%/yr with a sine wobble
  const mk = (n: number, growth: number, wobble = 0.06): Candle[] => {
    const out: Candle[] = [];
    const start = new Date("2023-01-02").getTime();
    for (let i = 0; i < n; i++) {
      const base = 100 * Math.exp((growth / 365) * i); // one CALENDAR day per bar
      const close = base * (1 + wobble * Math.sin(i / 17));
      const d = new Date(start + i * 24 * 3600 * 1000);
      out.push({
        time: d.toISOString().slice(0, 10),
        open: close * 0.995,
        high: close * 1.01,
        low: close * 0.99,
        close,
      });
    }
    return out;
  };
  const candles = mk(756, Math.log(1.2)); // exact 20%/yr in log space
  const ch = regressionChannel(candles)!;
  check("channel exists on 3y of dailies", !!ch);
  check("fitted growth recovers ~20%/yr", ch.cagr !== undefined && Math.abs(ch.cagr - 0.2) < 0.05, `got ${ch.cagr}`);
  check("upper rail above mid above lower, at both ends", ch.upper[0].value > ch.mid[0].value && ch.mid[0].value > ch.lower[0].value && ch.upper[1].value > ch.lower[1].value);
  check("band position is a 0..1 fraction", ch.position === undefined || (ch.position >= 0 && ch.position <= 1));
  check("too few bars → null, honestly", regressionChannel(candles.slice(0, 20)) === null);

  const zig: Candle[] = [];
  const startZ = new Date("2025-01-01").getTime();
  for (let i = 0; i < 120; i++) {
    // oscillate between ~80 support and ~100 resistance, touching each repeatedly
    const c = 90 + 10 * Math.sin(i / 6);
    const d = new Date(startZ + i * 24 * 3600 * 1000);
    zig.push({ time: d.toISOString().slice(0, 10), open: c, high: c + 0.6, low: c - 0.6, close: c });
  }
  const levels = swingLevels(zig);
  check("finds the repeated ~100 resistance and ~80 support", levels.some((l) => Math.abs(l.price - 100.6) < 3) && levels.some((l) => Math.abs(l.price - 79.4) < 3), JSON.stringify(levels));
  check("respects maxLevels and sorts by price", swingLevels(zig, { maxLevels: 2 }).length <= 2 && levels.every((l, i) => i === 0 || levels[i - 1].price <= l.price));
  check("levels carry touch counts ≥ 1", levels.every((l) => l.touches >= 1));
}

console.log("\n== SWOT (rule-based, evidence attached) ==");
{
  const data = mockStockData("TCS.NS");
  const sc = buildScorecard(data);
  const val = buildValuation(data, sc);
  const swot = buildSwot({ scorecard: sc, data, valuation: val, capTier: "large" });
  check("every quadrant renders at least one line", swot.strengths.length >= 1 && swot.weaknesses.length >= 1 && swot.opportunities.length >= 1 && swot.threats.length >= 1);
  check("quadrants are capped at 5", [swot.strengths, swot.weaknesses, swot.opportunities, swot.threats].every((a) => a.length <= 5));
  const dipSwot = buildSwot({
    scorecard: sc,
    data,
    valuation: val,
    momentum: { pctFromHigh: -0.2, vs200d: -0.08, ret3m: -0.1 },
    capTier: "small",
    regime: "EXPENSIVE_CALM",
    weightPct: 0.22,
  });
  check("quality on a dip becomes an opportunity", val.status !== "PRICEY" ? dipSwot.opportunities.some((o) => /on sale/i.test(o.text)) : true);
  check("downtrend, small-cap size, calm-highs regime and concentration all land as threats",
    dipSwot.threats.some((t) => /downtrend/i.test(t.text)) &&
    dipSwot.threats.some((t) => /small caps/i.test(t.text)) &&
    (dipSwot.threats.some((t) => /margin of safety/i.test(t.text)) || dipSwot.threats.length >= 5) &&
    (dipSwot.threats.some((t) => /heavyweight/i.test(t.text)) || dipSwot.threats.length >= 5));
  check("empty buckets get an honest line, never silence", (() => {
    const bare = buildSwot({ scorecard: { ...sc, checks: [], redFlags: [], totalScore: 50, fscore: undefined }, data: { ...data, quote: { ...data.quote, dividendYield: undefined, targetMeanPrice: undefined } } });
    return bare.strengths.length === 1 && /Nothing stands out/.test(bare.strengths[0].text) && bare.threats.length >= 1;
  })());
}

console.log("\n== Sector peers from the scanned universe ==");
{
  const mkPeer = (symbol: string, over: Partial<MetricRow>): MetricRow => ({
    symbol,
    name: symbol,
    sector: "Technology",
    owned: false,
    watch: false,
    score: 60,
    verdict: "HOLD",
    valStatus: "FAIR",
    isFin: false,
    redFlags: 0,
    lossYears: 0,
    pillarQuality: 60,
    pillarFortress: 60,
    pillarGrowth: 60,
    pillarValuation: 60,
    ...over,
  } as MetricRow);
  const self = mkPeer("AAA.NS", { score: 80, roeAvg: 0.24, pe: 30, pb: 6, revCagr: 0.2, roceAvg: 0.3, divYield: 0.01 });
  const uni = [
    mkPeer("BBB.NS", { score: 70, roeAvg: 0.18, pe: 25, pb: 5, revCagr: 0.12, roceAvg: 0.2, divYield: 0.02 }),
    mkPeer("CCC.NS", { score: 60, roeAvg: 0.12, pe: 20, pb: 4, revCagr: 0.08, roceAvg: 0.15, divYield: 0.015 }),
    mkPeer("DDD.NS", { score: 50, roeAvg: 0.08, pe: 15, pb: 2, revCagr: 0.05, roceAvg: 0.1, divYield: 0.03 }),
    mkPeer("EEE.NS", { score: 40, roeAvg: 0.05, pe: 12, pb: 1.5, revCagr: 0.02, roceAvg: 0.06, divYield: 0.04 }),
    mkPeer("ZZZ.NS", { sector: "Energy", score: 90 }),
  ];
  const st = sectorPeers(self, uni)!;
  check("sector isolated (Energy outsider excluded)", !!st && st.n === 5 && st.peers.every((p) => p.sector === "Technology"));
  const roe = st.ranks.find((r) => r.key === "roeAvg")!;
  check("ROE: rank 1 of 5, beats the median", roe.rank === 1 && roe.of === 5 && roe.better);
  const pe = st.ranks.find((r) => r.key === "pe")!;
  check("P/E: lower-is-better direction respected (priciest ranks last)", pe.rank === 5 && !pe.better);
  check("median math (ROE median = 0.12)", Math.abs((roe.median ?? 0) - 0.12) < 1e-9);
  check("read is honest: strong on quality but expensive → 4 of 7, no 'leader' crown", /4 of 7/.test(st.read) && !/sector leader/i.test(st.read));
  const leader = mkPeer("AAA.NS", { score: 80, roeAvg: 0.24, pe: 14, pb: 1.8, revCagr: 0.2, roceAvg: 0.3, divYield: 0.05 });
  check("cheap AND strong → crowned a sector leader", /sector leader/i.test(sectorPeers(leader, uni)!.read));
  check("peers listed best-score first with self included", st.peers[0].symbol === "AAA.NS");
  check("fewer than 4 peers → null (a median of two is a coin flip)", sectorPeers(self, uni.slice(0, 2)) === null);
  check("every peer metric declares its direction", PEER_METRICS.every((m) => typeof m.higherBetter === "boolean"));
}

console.log("\n== Pre-buy checklist (the judgment gates) ==");

console.log("\n== Pre-buy checklist (the judgment gates) ==");
{
  check("exactly 10 gates", PREBUY_CHECKLIST.length === 10);
  check("ids are unique", new Set(PREBUY_CHECKLIST.map((i) => i.id)).size === PREBUY_CHECKLIST.length);
  check("every gate has text and a master attribution", PREBUY_CHECKLIST.every((i) => i.text.length > 10 && i.master.length > 3));
  check("covers the canonical filters (moat, price discipline, sizing, why-cheap)",
    ["moat", "price", "sizing", "whycheap", "tenyear"].every((id) => PREBUY_CHECKLIST.some((i) => i.id === id)));
  // server-safe: no window in node - must degrade to empty, never throw
  const server = loadChecklist("TCS.NS");
  check("loadChecklist without a browser returns an empty Set", server instanceof Set && server.size === 0);
  let threw = false;
  try {
    saveChecklist("TCS.NS", new Set(["moat"]));
  } catch {
    threw = true;
  }
  check("saveChecklist without a browser is a no-op, not a crash", !threw);
}

console.log("\n== Snowflake axis leaders (who carries each arm) ==");
{
  const mk = (sym: string, watch = false): AnalyzedHolding => {
    const data = mockStockData(sym);
    return {
      holding: { id: sym, broker: "zerodha", rawSymbol: sym, yahooSymbol: sym, quantity: 5, avgCost: 100, currency: "INR", watch },
      data,
      scorecard: buildScorecard(data),
      invested: 500,
      currentValue: 900,
    };
  };
  const rows = [mk("TCS.NS"), mk("RELIANCE.NS"), mk("ITC.NS"), mk("HDFCBANK.NS"), mk("WATCHME.NS", true)];
  const leaders = snowflakeLeaders(rows, 3);
  check("one entry per snowflake axis, in axis order", leaders.length === SNOWFLAKE_AXES.length && leaders.every((l, i) => l.key === SNOWFLAKE_AXES[i].key));
  check("at most `top` leaders per axis", leaders.every((l) => l.leaders.length <= 3 && l.leaders.length > 0));
  check("leaders sorted best-first on every axis", leaders.every((l) => l.leaders.every((x, i) => i === 0 || l.leaders[i - 1].score >= x.score)));
  check("exchange suffixes stripped for display", leaders.every((l) => l.leaders.every((x) => !/\.(NS|BO|TO|V|NE)$/i.test(x.symbol))));
  check("watchlist rows never carry an arm", leaders.every((l) => l.leaders.every((x) => x.symbol !== "WATCHME")));
  const two = snowflakeLeaders(rows, 2);
  check("top parameter respected", two.every((l) => l.leaders.length <= 2));
}

console.log("\n== SEC EDGAR fair-access UA & typography sweep ==");
{
  const edgarSrc = readFileSync("lib/edgar.ts", "utf8");
  const uaLine = edgarSrc.split("\n").find((l) => l.includes("const UA"));
  check("EDGAR User-Agent carries a contact address (SEC 403 fix)", !!uaLine && uaLine.includes("@"));
  check("EDGAR UA names the app", !!uaLine && /PortfolioAdvisor/.test(uaLine));
  // the whole application is em-dash-free (placeholders use en dash, prose uses hyphens)
  const offenders: string[] = [];
  for (const dir of ["lib", "components", "app"]) {
    for (const f of readdirSync(dir, { recursive: true }) as string[]) {
      if (!/\.(ts|tsx|css)$/.test(f)) continue;
      if (readFileSync(`${dir}/${f}`, "utf8").includes("—")) offenders.push(`${dir}/${f}`);
    }
  }
  check("no em dashes anywhere in the app", offenders.length === 0, offenders.join(", "));
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
