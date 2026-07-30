import { chromium } from "playwright";
import { findChrome } from "./browser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3400";
const exe = findChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByText("load a sample portfolio").click();
await page.getByRole("button", { name: /Analyze portfolio/ }).click();
await page.waitForSelector("text=AI prompt generator", { timeout: 60000 });
await page.waitForTimeout(600);

// scroll generator into view, switch to "Pick stocks", select two
const gen = page.locator("text=AI prompt generator").first();
await gen.scrollIntoViewIfNeeded();
await page.getByRole("button", { name: "Pick stocks" }).click();
await page.getByRole("button", { name: "TCS.NS", exact: true }).click();
await page.getByRole("button", { name: "RELIANCE.NS", exact: true }).click();
await page.waitForTimeout(400);

const preview = await page.locator("#prompt-preview").inputValue();
if (!preview.includes("TCS.NS") || !preview.includes("RELIANCE.NS")) throw new Error("prompt missing selected stocks");
if (!preview.includes("Rank them")) throw new Error("multi-stock ranking task missing");
if (!preview.includes("fair-value estimate")) throw new Error("valuation line missing from prompt");

// copy works
await page.getByRole("button", { name: "Copy prompt" }).click();
await page.waitForTimeout(300);
const clip = await page.evaluate(() => navigator.clipboard.readText());
if (!clip.includes("Buffett")) throw new Error("clipboard copy failed");

// screenshot of the generator area
const card = page.locator("#prompt-preview").locator("xpath=ancestor::div[contains(@class,'bg-surface')]").first();
await card.screenshot({ path: "/tmp/shots/06-promptgen.png" });

// per-stock copy button
await page.getByRole("button", { name: /Copy AI prompt for this stock/ }).first().click();
await page.waitForTimeout(300);
const clip2 = await page.evaluate(() => navigator.clipboard.readText());
if (!clip2.includes("holding I want analyzed")) throw new Error("per-stock prompt copy failed");

console.log("PROMPTGEN E2E OK — prompt length:", preview.length);
await browser.close();
