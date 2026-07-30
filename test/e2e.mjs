import { mkdirSync } from "node:fs";
import { launchBrowser } from "./browser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3400";
const shots = "/tmp/shots";
mkdirSync(shots, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  // favicon fetches are environment noise, not app failures
  if (m.type() === "error" && !/favicon/i.test(m.location()?.url ?? "") ) errors.push(`console: ${m.text()}`);
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.screenshot({ path: `${shots}/01-import.png`, fullPage: true });

// load sample portfolio
await page.getByText("load a sample portfolio").click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/02-holdings.png`, fullPage: true });

// symbol "check" (resolve) on first row
await page.getByRole("button", { name: "check" }).first().click();
await page.waitForTimeout(600);

// analyze
await page.getByRole("button", { name: /Analyze portfolio/ }).click();
await page.waitForSelector("text=Action summary", { timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/03-dashboard.png`, fullPage: true });

// Buffett matrix rendered
if (!(await page.locator("text=the Buffett matrix").count())) throw new Error("matrix card missing");

// expand first stock card (click its header button: the one with aria-expanded)
const cardBtn = page.locator("button[aria-expanded]").first();
await cardBtn.click();
await page.waitForSelector("text=Intrinsic value (rough)", { timeout: 10000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${shots}/04-card-open.png`, fullPage: true });

// ---- Upgrade ideas tab: scan India, add a watchlist name ----
await page.getByRole("button", { name: /Upgrade ideas/ }).click();
await page.waitForSelector("text=Scan a market for stronger businesses", { timeout: 10000 });
await page.getByRole("button", { name: /India/ }).first().click();
await page.waitForSelector("text=Strongest India ideas outside your portfolio", { timeout: 180000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${shots}/08-ideas.png`, fullPage: true });

const addBtn = page.getByRole("button", { name: "+ watchlist" }).first();
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForTimeout(300);
  const watching = await page.getByRole("button", { name: "✓ watching" }).count();
  if (!watching) throw new Error("watchlist add did not register");
}

// upgrade-ideas block exists when weak holdings are present (sample has some)
const upgradeHdr = await page.locator("text=Upgrade ideas for your weakest holdings").count();
console.log("upgrade section present:", !!upgradeHdr);

// ---- Health tab ----
await page.getByRole("button", { name: /Health & income/ }).click();
await page.waitForSelector("text=Portfolio health checks", { timeout: 10000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${shots}/09-health.png`, fullPage: true });
if (!(await page.locator("text=Dividend income").count())) throw new Error("income card missing");

// ---- Projector tab ----
await page.getByRole("button", { name: /Sit-tight projector/ }).click();
await page.waitForSelector("text=The sit-tight projector", { timeout: 10000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${shots}/10-projector.png`, fullPage: true });

// ---- back to Overview: watchlist card should be present ----
await page.getByRole("button", { name: "Overview", exact: true }).click();
await page.waitForSelector("text=Action summary", { timeout: 10000 });
const bodyText = await page.locator("body").textContent();
if (!bodyText.includes("watchlist")) throw new Error("watchlist row missing on overview");

// switch base currency to INR
await page.locator("select").first().selectOption("INR");
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/05-inr.png`, fullPage: false });

// sort by score
await page.locator("select").nth(1).selectOption("score");
await page.waitForTimeout(300);

// back to import and re-analyze survives
await page.getByText("← Edit holdings / re-analyze").click();
await page.waitForSelector("text=Review & edit", { timeout: 5000 });

console.log("E2E OK");
if (errors.length) {
  console.log("PAGE ERRORS:");
  for (const e of errors) console.log(" -", e);
}
await browser.close();
process.exit(errors.length ? 1 : 0);
