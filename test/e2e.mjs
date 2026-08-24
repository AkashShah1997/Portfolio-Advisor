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

// ---- SIMPLE MODE (default): plain-words action plan, three tabs ----
await page.waitForSelector("text=Your action plan", { timeout: 10000 });
const planText = await page.locator("body").textContent();
if (!/worth acting on|Nothing needs action/.test(planText)) throw new Error("plan summary missing");
if (!/sitting tight IS the strategy/.test(planText)) throw new Error("plan hold line missing");
if (!/insurance, not the engine|same exposure costs less/.test(planText)) throw new Error("plan ETF line missing");
if (await page.locator("text=the Buffett matrix").count()) throw new Error("matrix should be hidden in simple mode");
if (!(await page.getByRole("button", { name: "Screeners" }).count() === 0)) throw new Error("screeners tab should be hidden in simple mode");

// ---- portfolio snowflake in the action summary ----
await page.waitForSelector("text=Portfolio snowflake", { timeout: 10000 });
if (!(await page.locator("[data-testid=snowflake]").count())) throw new Error("portfolio snowflake missing");

// ---- ETF holdings are routed to the ETFs tab ----
await page.waitForSelector("text=see the ETFs tab", { timeout: 10000 });

// scroll through once so view-triggered entrances have fired, then capture the simple overview
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/03-overview.png`, fullPage: true });

// ---- switch to the full toolbench ----
await page.getByRole("button", { name: /All tools/ }).click();
await page.waitForSelector("text=the Buffett matrix", { timeout: 10000 });
await page.waitForSelector("text=Screeners", { timeout: 5000 });

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
await page.locator("button[aria-expanded]").first().click();
await page.waitForSelector("text=Intrinsic value (rough)", { timeout: 10000 });
await page.waitForSelector("text=✦ Strengths", { timeout: 10000 });
await page.waitForSelector("text=⚑ Risks", { timeout: 10000 });
await page.waitForSelector("text=12-mo target", { timeout: 10000 });
if ((await page.locator("[data-testid=snowflake]").count()) < 2) throw new Error("stock-card snowflake missing");
if (!(await page.locator("[data-infotip=pe]").count())) throw new Error("info tooltips not wired in stock card");
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
await page.getByRole("button", { name: "Screeners" }).click();
await page.waitForSelector("text=Screening universe", { timeout: 10000 });
if (!(await page.locator("text=India: ").count())) console.log("note: scan badge not found (ok if relabeled)");
await page.waitForSelector("text=Coffee Can compounders", { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/07-screener-coffeecan.png`, fullPage: true });

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
await page.waitForSelector("text=Your ETFs — cost-first analysis", { timeout: 15000 });
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

// ---- smart money tab (progressive per-investor loading) ----
await page.getByRole("button", { name: "Smart money" }).click();
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

// ---- health + projector ----
await page.getByRole("button", { name: /Health & income/ }).click();
await page.waitForSelector("text=Portfolio health checks", { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/10-health.png`, fullPage: true });

await page.getByRole("button", { name: "Projector" }).click();
await page.waitForSelector("text=The sit-tight projector", { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/11-projector.png`, fullPage: true });

// ---- persistence: reload restores market + holdings (incl. watchlist) ----
await page.reload({ waitUntil: "networkidle" });
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
