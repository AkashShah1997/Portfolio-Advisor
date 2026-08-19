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
// scroll through once so view-triggered entrances have fired, then capture
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/03-overview.png`, fullPage: true });

if (!(await page.locator("text=the Buffett matrix").count())) throw new Error("matrix card missing");

// expand first stock card → intrinsic value band
await page.locator("button[aria-expanded]").first().click();
await page.waitForSelector("text=Intrinsic value (rough)", { timeout: 10000 });
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

await page.getByRole("button", { name: /Custom screen/ }).first().click();
await page.waitForSelector("text=raw fundamentals, your thresholds", { timeout: 5000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/08-screener-custom.png`, fullPage: true });

// ---- smart money tab ----
await page.getByRole("button", { name: "Smart money" }).click();
await page.waitForSelector("text=Superinvestor conviction moves", { timeout: 15000 });
await page.waitForSelector("text=Berkshire Hathaway", { timeout: 15000 });
if (!(await page.locator("text=Bought/added by ≥2 of the bench").count())) throw new Error("consensus strip missing");
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
