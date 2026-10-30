import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = 4783;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const PROOF_DIR = path.join(ROOT, "proof");
fs.mkdirSync(PROOF_DIR, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${url}/`, { method: "HEAD" });
      if (response.ok) return;
    } catch {
      /* Retry until the server is accepting connections. */
    }
    await wait(250);
  }
  throw new Error("The local server did not start.");
}

async function makeBrowser() {
  try {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    return { browser, engine: "Google Chrome (hardware WebGL)" };
  } catch {
    const browser = await chromium.launch({ headless: true });
    return { browser, engine: "Playwright Chromium" };
  }
}

async function preparePage(context, errors) {
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ORBITAL_WATCH__?.ready === true, null, {
    timeout: 120000,
  });
  await page.locator("#welcome:not([hidden])").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#welcomeSearch").fill("New York");
  await page.locator(".city-suggestion").first().waitFor({ state: "visible" });
  await page.locator(".city-suggestion").first().click();
  await page.waitForFunction(
    () => window.__ORBITAL_WATCH__.location?.name === "New York",
    null,
    { timeout: 10000 }
  );
  try {
    await page.waitForFunction(
      () => document.querySelector("#passLoading").hidden === true,
      null,
      { timeout: 45000 }
    );
  } catch {
    /* The partial pass list is still useful; screenshots capture the loading state honestly. */
  }
  await page.waitForTimeout(800);
  await page.keyboard.press("Control+k");
  await page.locator("#paletteInput").fill("ISS (ZARYA)");
  await page.waitForTimeout(250);
  await page.locator(".palette-item").filter({ hasText: "ISS (ZARYA)" }).first().click();
  await page.waitForFunction(
    () => window.__ORBITAL_WATCH__.selected === "ISS (ZARYA)",
    null,
    { timeout: 10000 }
  );
  await page.waitForTimeout(3000);
  return page;
}

async function screenshot(page, name) {
  const file = path.join(PROOF_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

const server = spawn(process.execPath, ["server/server.js"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});

let browser;
const errors = [];
const screenshots = [];
const report = {
  capturedAtUtc: new Date().toISOString(),
  url: BASE_URL,
};

try {
  await waitForServer(BASE_URL);
  const launched = await makeBrowser();
  browser = launched.browser;
  report.browser = launched.engine;

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "America/New_York",
    acceptDownloads: true,
  });
  const desktop = await preparePage(
    desktopContext,
    errors
  );
  await desktop.waitForTimeout(1200);
  report.desktop = await desktop.evaluate(() => ({
    satelliteCount: window.__ORBITAL_WATCH__.satelliteCount,
    drawnCount: window.__ORBITAL_WATCH__.drawnCount,
    fps: window.__ORBITAL_WATCH__.fps,
    passesFound: window.__ORBITAL_WATCH__.passesFound,
    selected: window.__ORBITAL_WATCH__.selected,
    location: window.__ORBITAL_WATCH__.location?.name,
    consoleErrors: window.__ORBITAL_WATCH__.consoleErrors,
  }));
  screenshots.push(await screenshot(desktop, "desktop-selected.png"));
  await desktop.locator("#issSpotlight").click();
  await desktop.locator("#skyView").waitFor({ state: "visible" });
  await desktop.waitForTimeout(1000);
  screenshots.push(await screenshot(desktop, "desktop-sky.png"));
  report.desktop.skyOpen = await desktop.evaluate(
    () => window.__ORBITAL_WATCH__.skyOpen
  );
  await desktop.keyboard.press("Escape");
  await desktop.context().close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "America/New_York",
    acceptDownloads: true,
  });
  const mobile = await preparePage(mobileContext, errors);
  await mobile.waitForTimeout(1200);
  report.mobile = await mobile.evaluate(() => ({
    satelliteCount: window.__ORBITAL_WATCH__.satelliteCount,
    drawnCount: window.__ORBITAL_WATCH__.drawnCount,
    fps: window.__ORBITAL_WATCH__.fps,
    passesFound: window.__ORBITAL_WATCH__.passesFound,
    selected: window.__ORBITAL_WATCH__.selected,
    location: window.__ORBITAL_WATCH__.location?.name,
    consoleErrors: window.__ORBITAL_WATCH__.consoleErrors,
  }));
  screenshots.push(await screenshot(mobile, "phone-selected.png"));
  await mobile.locator('[data-sheet="tonight"]').click();
  await mobile.waitForTimeout(500);
  screenshots.push(await screenshot(mobile, "phone-tonight.png"));
  await mobile.locator("#issSpotlight").click();
  await mobile.locator("#skyView").waitFor({ state: "visible" });
  await mobile.waitForTimeout(1000);
  screenshots.push(await screenshot(mobile, "phone-sky.png"));
  report.mobile.skyOpen = await mobile.evaluate(() => window.__ORBITAL_WATCH__.skyOpen);
  await mobile.context().close();

  const internalErrors = [
    ...(report.desktop?.consoleErrors || []),
    ...(report.mobile?.consoleErrors || []),
  ];
  for (const message of internalErrors) {
    if (!errors.includes(message)) errors.push(message);
  }
  report.consoleErrors = errors;
  report.screenshots = screenshots;
  report.passed = errors.length === 0;
  fs.writeFileSync(
    path.join(PROOF_DIR, "report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) {
    console.error("Console errors detected:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
} catch (error) {
  report.consoleErrors = errors;
  report.error = error.message;
  fs.writeFileSync(
    path.join(PROOF_DIR, "report.json"),
    JSON.stringify(report, null, 2)
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
