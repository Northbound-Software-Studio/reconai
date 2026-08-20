import { chromium } from "playwright-core";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto("http://localhost:3939/", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/shot-top.png" });
// Trigger the instant client-side sample
await page.getByText("Preview sample output (no API key)").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/shot-full.png", fullPage: true });
console.log("done");
await browser.close();
