import { launchBrowser } from "./browser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3400";
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Enter India|Continue India/ }).click();
await page.waitForSelector("text=Your India portfolio", { timeout: 10000 });

// masters card on the import screen
const summary = page.locator("summary", { hasText: "The masters behind the checks" });
await summary.scrollIntoViewIfNeeded();
await summary.click();
await page.waitForTimeout(400);
const card = summary.locator("xpath=ancestor::div[contains(@class,'bg-surface')]").first();
await card.screenshot({ path: "/tmp/shots/14-masters.png" });

const text = await card.textContent();
for (const name of ["Munger", "Graham", "Fisher", "Lynch", "Akre", "Greenblatt", "Terry Smith", "Pabrai", "Agrawal", "Mukherjea", "Damani", "Jhunjhunwala", "Buffett"]) {
  if (!text.includes(name)) throw new Error(`masters card missing ${name}`);
}

// verify checks + valuation render in an expanded card after analysis
await page.getByText(/load a sample India portfolio/).click();
await page.getByRole("button", { name: /Analyze India portfolio/ }).click();
await page.waitForSelector("text=Action summary", { timeout: 90000 });
await page.locator("button[aria-expanded]").first().click();
await page.waitForTimeout(600);
const body = await page.locator("body").textContent();
if (!body.includes("Coffee Can test")) throw new Error("Coffee Can check not rendered");
if (!body.includes("Reinvestment engine")) throw new Error("Reinvestment check not rendered");
if (!body.includes("Intrinsic value (rough)")) throw new Error("Valuation block not rendered");

console.log("MASTERS E2E OK");
await browser.close();
