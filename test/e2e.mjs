import { mkdirSync } from "node:fs";
import { launchBrowser } from "./browser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3400";
const shots = "/tmp/shots";
mkdirSync(shots, { recursive: true });

const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon/i.test(m.location()?.url ?? "")) errors.push(`console: ${m.text()}`);
});

// ---- landing: pick a market ----
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("text=One market at a time", { timeout: 15000 });
await page.screenshot({ path: `${shots}/01-landing.png`, fullPage: true });

await page.getByRole("button", { name: /Enter India/ }).click();
await page.waitForSelector("text=Your India portfolio", { timeout: 10000 });

// ---- import: sample + analyze ----
await page.getByText(/load a sample India portfolio/).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/02-import.png`, fullPage: true });

await page.getByRole("button", { name: /Analyze India portfolio/ }).click();
await page.waitForSelector("text=Action summary", { timeout: 90000 });

// ---- market weather: macro chips + regime read (simple mode too) ----
await page.waitForSelector("text=Market weather", { timeout: 15000 });
await page.waitForSelector("text=NIFTY 50", { timeout: 15000 });
await page.waitForSelector("text=India VIX", { timeout: 10000 });
await page.waitForSelector("text=Nothing extreme in the weather", { timeout: 10000 }); // mock india regime
await page.waitForSelector("text=Macro is context, not a signal", { timeout: 5000 });
// compact by default: 3 posture chips + hedge line, the rest behind "Full weather"
await page.waitForSelector("text=Gold in ₹ (10g)", { timeout: 10000 });
await page.waitForSelector("text=Your hedge sleeve", { timeout: 5000 });
if (await page.locator("text=Gold/silver ratio").count()) throw new Error("weather should start compact");
await page.getByRole("button", { name: /Full weather/ }).click();
await page.waitForSelector("text=Silver", { timeout: 5000 });
await page.waitForSelector("text=Gold/silver ratio", { timeout: 5000 });
await page.waitForSelector("text=Brent oil", { timeout: 5000 });
await page.getByRole("button", { name: /Compact view/ }).click(); // collapse back for clean screenshots
await page.waitForTimeout(300);

// ---- SIMPLE MODE (default): plain-words action plan, three tabs ----
await page.waitForSelector("text=Your action plan", { timeout: 10000 });
const planText = await page.locator("body").textContent();
if (!/worth acting on|Nothing needs action/.test(planText)) throw new Error("plan summary missing");
if (!/sitting tight IS the strategy/.test(planText)) throw new Error("plan hold line missing");
if (!/insurance, not the engine|same exposure costs less/.test(planText)) throw new Error("plan ETF line missing");
if (await page.locator("text=the Buffett matrix").count()) throw new Error("matrix should be hidden in simple mode");
if (!(await page.getByRole("button", { name: "Ideas" }).count() === 0)) throw new Error("Ideas tab should be hidden in simple mode");
if (!(await page.getByRole("button", { name: "Checkup" }).count() === 0)) throw new Error("Checkup tab should be hidden in simple mode");

// ---- portfolio snowflake in the action summary ----
await page.waitForSelector("text=Portfolio snowflake", { timeout: 10000 });
if (!(await page.locator("[data-testid=snowflake]").count())) throw new Error("portfolio snowflake missing");
// ...and the per-axis leader rows under it (which stocks carry fortress/quality/income)
await page.waitForSelector("text=Who carries each arm", { timeout: 10000 });
const leaderBody = await page.locator("body").textContent();
if (!/Fortress/.test(leaderBody) || !/Income/.test(leaderBody)) throw new Error("axis leader rows missing");

// ---- ETF holdings are routed to the ETFs tab ----
await page.waitForSelector("text=see the ETFs tab", { timeout: 10000 });

// ---- the Coach (simple mode): trim / hold / buy-dip / DCA per position ----
await page.locator("button[aria-pressed]").filter({ hasText: /^Coach/ }).first().click();
await page.waitForSelector("text=Position coach", { timeout: 10000 });
await page.waitForSelector("text=Keep DCA-ing", { timeout: 30000 }); // NIFTYBEES core ETF
await page.waitForSelector("text=The SIP plan", { timeout: 10000 });
await page.waitForSelector("text=vs 52w high", { timeout: 30000 }); // momentum chips loaded
const coachBody = await page.locator("body").textContent();
if (!/never by itself a reason to sell/.test(coachBody)) throw new Error("coach profit framing missing");
if (!/Sit tight|Trim a slice|Buy the dip/.test(coachBody)) throw new Error("coach stances missing");
await page.getByRole("button", { name: /Refresh momentum/ }).click();
await page.waitForSelector("text=/refreshed \\d/", { timeout: 30000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/24-coach.png`, fullPage: true });
await page.locator("button[aria-pressed]").filter({ hasText: /^Overview/ }).first().click();
await page.waitForTimeout(400);

// scroll through once so view-triggered entrances have fired, then capture the simple overview
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/03-overview.png`, fullPage: true });

// ---- switch to the full toolbench ----
await page.getByRole("button", { name: /All tools/ }).click();
await page.waitForSelector("text=the Buffett matrix", { timeout: 10000 });
await page.waitForSelector("text=Ideas", { timeout: 5000 });
await page.waitForSelector("text=Checkup", { timeout: 5000 });

// ---- the Buffett matrix collapses to a header until wanted ----
const matrixHeader = page.locator("button[aria-expanded]").filter({ hasText: /Buffett matrix/ }).first();
if ((await matrixHeader.getAttribute("aria-expanded")) !== "false") throw new Error("matrix should start collapsed");
await matrixHeader.click();
await page.waitForTimeout(500);
if ((await matrixHeader.getAttribute("aria-expanded")) !== "true") throw new Error("matrix did not expand");
await matrixHeader.click(); // collapse again - remembered on-device
await page.waitForTimeout(300);

// ---- the AI prompt generator collapses the same way ----
const pgHeader = page.locator("button[aria-expanded]").filter({ hasText: /AI prompt generator/ }).first();
if ((await pgHeader.getAttribute("aria-expanded")) !== "false") throw new Error("prompt generator should start collapsed");
await pgHeader.click();
await page.waitForSelector("text=include full 5-yr tables", { timeout: 5000 });
await pgHeader.click();
await page.waitForTimeout(300);

// ---- allocation slice toggle (stocks-only / ETFs-only) ----
await page.getByRole("button", { name: "Stocks", exact: true }).click();
await page.waitForSelector("text=Sectors - stocks", { timeout: 5000 });
await page.getByRole("button", { name: "ETFs", exact: true }).last().click();
const allocBody = await page.locator("body").textContent();
if (!/NIFTYBEES/.test(allocBody)) throw new Error("ETF-only allocation slice missing NIFTYBEES");
await page.getByRole("button", { name: "All", exact: true }).click();
await page.waitForTimeout(200);
// the sector chart buckets funds instead of 'Unknown'
if (!/ETFs \/ funds/.test(await page.locator("body").textContent())) throw new Error("ETF sector bucket missing");

// ---- hero chart: benchmark toggle (indexed vs NIFTY 50) ----
await page.getByRole("button", { name: /vs NIFTY 50/ }).click();
await page.waitForSelector("text=Your holdings", { timeout: 20000 });
await page.waitForSelector("text=/\\/yr vs NIFTY 50/", { timeout: 20000 });
await page.waitForSelector("text=both indexed to 100", { timeout: 5000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/17-benchmark.png`, fullPage: false });
await page.getByRole("button", { name: "Value", exact: true }).click();
await page.waitForTimeout(300);

// expand first stock card → intrinsic value band + strengths/risks + snowflake + analyst line
await page.locator("[data-testid=stock-card-header]").first().click();
await page.waitForSelector("text=Intrinsic value (rough)", { timeout: 10000 });
await page.waitForSelector("text=✦ Strengths", { timeout: 10000 });
await page.waitForSelector("text=⚑ Risks", { timeout: 10000 });
await page.waitForSelector("text=12-mo target", { timeout: 10000 });
await page.waitForSelector("text=F-Score", { timeout: 10000 });
await page.waitForSelector("text=Decision board says", { timeout: 10000 }); // same engine as the Decisions tab, inline
if ((await page.locator("[data-testid=snowflake]").count()) < 2) throw new Error("stock-card snowflake missing");
if (!(await page.locator("[data-infotip=pe]").count())) throw new Error("info tooltips not wired in stock card");

// ---- pre-buy checklist: ten judgment gates, ticks persist per symbol ----
const chkHeader = page.locator("button[aria-expanded]").filter({ hasText: /Pre-buy checklist/ }).first();
await chkHeader.waitFor({ timeout: 10000 });
if (!/0\/10/.test(await chkHeader.textContent())) throw new Error("checklist should start at 0/10");
await chkHeader.click();
await page.waitForSelector("text=gambling, not investing", { timeout: 5000 });
if ((await page.locator("label input[type=checkbox]").count()) < 10) throw new Error("checklist gates missing");
await page.getByText("I can explain what this business sells").first().click(); // label click ticks the gate
await page.waitForTimeout(400);
if (!/1\/10/.test(await chkHeader.textContent())) throw new Error("tick did not update the checklist count");

await page.waitForTimeout(600);
await page.screenshot({ path: `${shots}/04-card-open.png`, fullPage: true });

// ---- decisions tab ----
await page.getByRole("button", { name: /^Decisions/ }).click();
await page.waitForSelector("text=Capital in exit / trim candidates", { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/05-decisions.png`, fullPage: true });

// scan India universe from the discover section
await page.waitForSelector("text=Scan the market for stronger businesses", { timeout: 10000 });
await page.getByRole("button", { name: /^India/ }).last().click();
await page.waitForSelector("text=Strongest India ideas outside your portfolio", { timeout: 300000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/06-upgrades.png`, fullPage: true });

const addBtn = page.getByRole("button", { name: "+ watchlist" }).first();
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForSelector("text=✓ watching", { timeout: 10000 });
}

// ---- screeners tab (shares the scan) ----
// ---- deep analysis: full-page per-stock view (SWOT, sector peers, chart, everything) ----
await page.locator("button[aria-pressed]").filter({ hasText: /^Overview/ }).first().click();
await page.waitForTimeout(500);
await page.locator("text=Deep analysis →").first().click(); // from the first stock card
await page.waitForSelector("text=SWOT", { timeout: 15000 });
await page.waitForSelector("text=Strengths", { timeout: 5000 });
await page.waitForSelector("text=Threats", { timeout: 5000 });
await page.waitForSelector("text=Sector comparison", { timeout: 5000 });
await page.waitForSelector("text=Coach's call on YOUR position", { timeout: 15000 }); // held, non-ETF
await page.waitForSelector("text=Full breakdown", { timeout: 5000 });
await page.waitForSelector("[data-testid=price-chart] canvas", { timeout: 25000 });
await page.waitForSelector("text=Trend channel", { timeout: 5000 });
await page.waitForSelector("text=up the channel", { timeout: 15000 }); // auto-channel read line
const ddBody = await page.locator("body").textContent();
if (!/Sector median|Not enough scanned peers/.test(ddBody)) throw new Error("peer comparison section missing");
if (!/every line carries its evidence/.test(ddBody)) throw new Error("SWOT honesty framing missing");
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/26-deepdive.png`, fullPage: true });

// ---- deep-dive ANY stock: search a symbol you don't hold ----
await page.getByLabel("Deep-dive any stock").fill("DMART");
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.waitForSelector("text=DMART.NS", { timeout: 30000 });
await page.waitForSelector("text=Entry plan", { timeout: 20000 }); // not held → entry discipline, not position management
await page.waitForSelector("text=add to watchlist", { timeout: 5000 });
await page.getByRole("button", { name: /Back to the dashboard/ }).click();
await page.waitForSelector("text=Action summary", { timeout: 10000 });

// Screeners now live inside the Ideas tab (default view)
await page.locator("button[aria-pressed]").filter({ hasText: /^Ideas/ }).first().click();
await page.waitForSelector("text=two ways to find the next name", { timeout: 5000 });
await page.waitForSelector("text=Screening universe", { timeout: 10000 });
if (!(await page.locator("text=India: ").count())) console.log("note: scan badge not found (ok if relabeled)");
await page.waitForSelector("text=Coffee Can compounders", { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/07-screener-coffeecan.png`, fullPage: true });

// ---- size filter + the mid/small-cap screen ----
await page.waitForSelector("text=Company size", { timeout: 10000 });
await page.getByRole("button", { name: /Mid & small-cap compounders/ }).first().click();
await page.waitForSelector("text=Jhunjhunwala's hunting ground", { timeout: 5000 });
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Mid cap", exact: true }).click();
await page.waitForTimeout(300);
const smBody = await page.locator("body").textContent();
if (!/pass at this size|Nothing mid-cap passes|Nothing passes right now/.test(smBody)) {
  throw new Error("size filter feedback missing");
}
await page.screenshot({ path: `${shots}/23-smallmid.png`, fullPage: false });
await page.getByRole("button", { name: "All sizes", exact: true }).click();
await page.waitForTimeout(200);

// ---- consensus: the names almost every buy-list agrees on ----
await page.getByRole("button", { name: /Consensus picks/ }).first().click();
await page.waitForSelector("text=ranked by how many agree", { timeout: 5000 });
await page.waitForTimeout(400);
const consBody = await page.locator("body").textContent();
if (!/screens agree:|Nothing passes/.test(consBody)) throw new Error("consensus results/empty-state missing");
await page.screenshot({ path: `${shots}/20-consensus.png`, fullPage: false });

await page.getByRole("button", { name: /Magic Formula/ }).first().click();
await page.waitForTimeout(400);
if (!(await page.locator("text=MF rank #1").count())) throw new Error("magic formula ranking missing");

// ---- info tooltips on screener headers: hover ⓘ → glossary card ----
const scoreTip = page.locator("th [data-infotip=score]").first();
if (!(await scoreTip.count())) throw new Error("screener header info icon missing");
await scoreTip.hover();
await page.waitForSelector("[role=tooltip]", { timeout: 5000 });
const tipText = await page.locator("[role=tooltip]").textContent();
if (!/Quality score/.test(tipText) || !/Higher is better/.test(tipText)) {
  throw new Error(`tooltip content wrong: ${tipText}`);
}
await page.screenshot({ path: `${shots}/18-infotip.png`, fullPage: false });
await page.mouse.move(0, 0); // close the tooltip
// accessibility: the trigger carries the full explanation as aria-label
const ariaLen = await scoreTip.evaluate((el) => (el.getAttribute("aria-label") ?? "").length);
if (ariaLen < 60) throw new Error("info icon aria-label missing/too short");

await page.getByRole("button", { name: /Custom screen/ }).first().click();
await page.waitForSelector("text=raw fundamentals, your thresholds", { timeout: 5000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/08-screener-custom.png`, fullPage: true });

// ---- ETFs tab: fee-first fund analysis ----
await page.locator("button[aria-pressed]").filter({ hasText: /^ETFs/ }).first().click();
await page.waitForSelector("text=Your ETFs - cost-first analysis", { timeout: 15000 });
await page.waitForSelector("text=Nippon India ETF Gold BeES", { timeout: 25000 });
await page.waitForSelector("text=Nippon India ETF Nifty 50 BeES", { timeout: 25000 });
await page.waitForSelector("text=Weighted MER", { timeout: 5000 });
await page.waitForSelector("text=Same exposure, lower fee", { timeout: 10000 });
if (!(await page.locator("text=Trim this one").count())) throw new Error("gold REDUCE verdict missing");
if (!(await page.locator("text=add to on autopilot").count())) throw new Error("core INCREASE verdict missing");
if (!(await page.locator("[data-infotip=mer]").count())) throw new Error("MER info tooltip missing");
const bodyEtf = await page.locator("body").textContent();
if (!/GOLDIETF|ICICI Prudential Gold/.test(bodyEtf)) throw new Error("cheaper gold alternative missing");
// inspect an arbitrary fund by symbol
await page.getByPlaceholder("JUNIORBEES.NS").fill("JUNIORBEES.NS");
await page.getByRole("button", { name: "Analyze fund" }).click();
await page.waitForSelector("text=Junior BeES", { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/19-etfs.png`, fullPage: true });

// ---- smart money tab: India leads with holders; the US bench is opt-in ----
// Smart money is the second view inside Ideas
await page.locator("button[aria-pressed]").filter({ hasText: /^Ideas/ }).first().click();
await page.getByRole("button", { name: "Smart money" }).click();
await page.waitForSelector("text=Who owns your stock", { timeout: 15000 });
await page.waitForSelector("text=US superinvestor bench (optional here)", { timeout: 10000 });
if (await page.locator("text=Superinvestor conviction moves").count())
  throw new Error("US bench should be hidden in India until revealed");
await page.getByRole("button", { name: /Show the US bench/ }).click();
await page.waitForSelector("text=Superinvestor conviction moves", { timeout: 15000 });
await page.waitForSelector("text=Berkshire Hathaway", { timeout: 15000 });
await page.waitForSelector("text=Pershing Square", { timeout: 20000 }); // non-curated filer card rendered too
await page.waitForSelector("text=Bought/added by ≥2 of the bench", { timeout: 20000 });
await page.locator("text=Berkshire Hathaway").first().click(); // expand the card
await page.waitForSelector("text=New buys this quarter", { timeout: 5000 });
await page.waitForSelector("text=Who owns your stock", { timeout: 5000 });
await page.waitForSelector("text=Top mutual funds / ETFs", { timeout: 20000 });
const bodySmart = await page.locator("body").textContent();
if (!/SBI|Vanguard|ICICI/.test(bodySmart)) throw new Error("holders table missing");
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/16-smartmoney.png`, fullPage: true });

// ---- backtest tab: score-as-of vs what happened since ----
// Backtest is the third view inside Checkup
await page.locator("button[aria-pressed]").filter({ hasText: /^Checkup/ }).first().click();
await page.waitForSelector("text=is the portfolio built right", { timeout: 5000 });
await page.getByRole("button", { name: "Backtest" }).click();
await page.waitForSelector("text=would the engine have helped?", { timeout: 15000 });
await page.waitForSelector("text=/cutoff \\d{4}-\\d{2}-\\d{2}/", { timeout: 10000 });
await page.waitForSelector("text=Verdict then", { timeout: 20000 });
await page.waitForSelector("text=/yr avg", { timeout: 20000 });
const btBody = await page.locator("body").textContent();
if (!/TCS/.test(btBody)) throw new Error("backtest table missing holdings");
if (!/Honest limits/.test(btBody)) throw new Error("backtest caveats missing");
// switch cutoff to 2y and confirm it recomputes
await page.getByRole("button", { name: "2y ago", exact: true }).click();
await page.waitForTimeout(600);
await page.waitForSelector("text=Verdict then", { timeout: 10000 });
await page.screenshot({ path: `${shots}/21-backtest.png`, fullPage: true });

// ---- crash stress test: real history applied to today's holdings (Checkup › Stress test) ----
await page.getByRole("button", { name: "Stress test" }).click();
await page.waitForSelector("text=If history repeats", { timeout: 10000 });
await page.waitForSelector("text=would have become", { timeout: 10000 }); // default: 2008
await page.waitForSelector("text=What kept-buying did", { timeout: 5000 });
await page.locator("button[aria-pressed]").filter({ hasText: /^1980 gold winter/ }).first().click();
await page.waitForSelector("text=28 YEARS", { timeout: 5000 });
await page.waitForSelector("text=Insurance is not an engine", { timeout: 5000 });
await page.locator("button[aria-pressed]").filter({ hasText: /^2000 dot-com/ }).first().click();
await page.waitForSelector("text=sorted stocks by PRICE PAID", { timeout: 5000 });
const stBody = await page.locator("body").textContent();
if (!/Gold & silver funds/.test(stBody)) throw new Error("stress buckets missing the hedge sleeve");
if (!/not a prediction of the future/.test(stBody)) throw new Error("stress caveat missing");
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/25-stress.png`, fullPage: true });

// ---- cross-link: a hardest-hit name jumps straight to its chart ----
const hitBtn = page.locator("button[title='Open in the Chart tab']").first();
const hitSym = (await hitBtn.textContent())?.trim();
await hitBtn.click();
await page.waitForTimeout(600);
const chartTab = page.locator("button[aria-pressed=true]").filter({ hasText: /^Chart/ });
if (!(await chartTab.count())) throw new Error("stress hardest-hit click did not open the Chart tab");
await page.waitForFunction(
  (sym) => document.querySelector('select[aria-label="Symbol"]')?.value === sym,
  `${hitSym}.NS`,
  { timeout: 15000 }
);

// ---- chart tab ----
await page.getByRole("button", { name: "Chart", exact: true }).click();
await page.waitForSelector("[data-testid=price-chart] canvas", { timeout: 20000 });
await page.waitForTimeout(800);
await page.getByRole("button", { name: "5Y", exact: true }).click();
await page.waitForTimeout(900);
await page.getByRole("checkbox").nth(1).check(); // SMA 200
await page.waitForTimeout(600);
await page.screenshot({ path: `${shots}/09-chart.png`, fullPage: true });
if (!(await page.locator("[data-testid=price-chart] canvas").count())) throw new Error("chart canvas missing");

// ---- health (the Projector tab is gone by design) ----
// Health & income is the first view inside Checkup (the group remembers the last view, so click it explicitly)
await page.locator("button[aria-pressed]").filter({ hasText: /^Checkup/ }).first().click();
await page.getByRole("button", { name: /Health & income/ }).click();
await page.waitForSelector("text=Portfolio health checks", { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/10-health.png`, fullPage: true });
if (await page.locator("button[aria-pressed]").filter({ hasText: /^Projector/ }).count())
  throw new Error("Projector tab should be removed");

// ---- dark mode: toggle, verify tokens flip, persists across reload ----
await page.getByRole("button", { name: "Switch to dark mode" }).click();
await page.waitForTimeout(400);
const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme);
if (themeAttr !== "dark") throw new Error("data-theme not set to dark");
const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
if (darkBg !== "rgb(20, 20, 23)") throw new Error(`dark body background wrong: ${darkBg}`);
await page.getByRole("button", { name: /Overview/ }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/22-dark.png`, fullPage: false });

// ---- persistence: reload restores market + holdings (incl. watchlist) ----
await page.reload({ waitUntil: "networkidle" });
const themeAfterReload = await page.evaluate(() => document.documentElement.dataset.theme);
if (themeAfterReload !== "dark") throw new Error("dark mode did not persist across reload");
await page.waitForSelector("text=Your India portfolio", { timeout: 15000 });
await page.waitForSelector("text=/Restored \\d+ holding/", { timeout: 10000 });
const tableText = await page.locator("table").first().textContent();
if (!tableText.includes("TCS")) throw new Error("holdings not restored after reload");
await page.screenshot({ path: `${shots}/12-restored.png`, fullPage: true });

// ---- switch market from the top bar ----
await page.getByRole("button", { name: /Canada/ }).first().click();
await page.waitForSelector("text=Your Canada portfolio", { timeout: 10000 });
await page.waitForSelector("text=Wealthsimple holdings CSV", { timeout: 5000 });
await page.screenshot({ path: `${shots}/13-canada.png`, fullPage: true });

console.log("E2E OK");
if (errors.length) {
  console.log("PAGE ERRORS:");
  for (const e of errors) console.log(" -", e);
}
await browser.close();
process.exit(errors.length ? 1 : 0);
