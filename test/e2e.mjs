import { chromium } from "playwright";

const BASE = "http://localhost:3400";
const shots = "/tmp/shots";
import { mkdirSync } from "node:fs";
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
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

// expand first stock card (click its header button: the one with aria-expanded)
const cardBtn = page.locator("button[aria-expanded]").first();
await cardBtn.click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${shots}/04-card-open.png`, fullPage: true });

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
