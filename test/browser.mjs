import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";

/**
 * Launch Chromium robustly across environments:
 *  1. CHROME_PATH env override
 *  2. any chromium build under /opt/pw-browsers (sandbox images)
 *  3. Playwright's own browser resolution (npx playwright install chromium)
 */
export function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const root = "/opt/pw-browsers";
  if (existsSync(root)) {
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium")) continue;
      for (const sub of ["chrome-linux/chrome", "chrome-linux/headless_shell", "chrome"]) {
        const p = `${root}/${dir}/${sub}`;
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

export async function launchBrowser() {
  const exe = findChrome();
  return chromium.launch(exe ? { executablePath: exe } : {});
}
