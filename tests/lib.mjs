// Shared helpers for the newer suites: headless Chrome, login as the test user, checks and waits.
// Env: HUB_URL, HUB_EMAIL, HUB_PASS, HUB_SELECTION (model for new chats), HUB_LANG (default en), CHROME.
import puppeteer from "puppeteer-core";

export const URL_ = process.env.HUB_URL ?? "http://localhost:8088";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const MODEL = JSON.parse(process.env.HUB_SELECTION ?? "{}").model ?? null;

let fails = 0;
export const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

export async function launch({ width = 1400, height = 900, dpr = 1 } = {}) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    defaultViewport: { width, height, deviceScaleFactor: dpr },
    protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { browser, page, errors };
}

// Fresh browser state, language and model picked up front, then the password login.
export async function login(page, { lang = process.env.HUB_LANG ?? "en", extra = {} } = {}) {
  await page.goto(`${URL_}/login`, { waitUntil: "networkidle0" });
  await page.evaluate((lang, sel, extra) => {
    localStorage.clear();
    localStorage.setItem("paddock.lang", JSON.stringify(lang));
    if (sel) localStorage.setItem("paddock.selection", sel);
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
  }, lang, process.env.HUB_SELECTION ?? null, extra);
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("input[name=email]", process.env.HUB_EMAIL ?? "test@hub.local");
  await page.type("input[name=password]", process.env.HUB_PASS);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("form button[type=submit], form button:last-of-type")]);
  await ready(page);
}

// The workspace is usable: a composer exists and the model list has answered.
export async function ready(page) {
  await page.waitForSelector('[data-pane="0"] textarea', { timeout: 30000 });
  if (MODEL) await page.waitForFunction((m) => document.querySelector("main")?.innerText.includes(m), { timeout: 30000 }, MODEL);
}

export const paneText = (page, i = 0) => page.$eval(`[data-pane="${i}"]`, (e) => e.innerText);
export const running = (page, i = 0) => page.$(`[data-pane="${i}"] [title="Stop"]`).then(Boolean);
export const until = (page, fn, ms = 20000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true, () => false);

export async function send(page, text, i = 0) {
  await page.click(`[data-pane="${i}"] textarea`);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

export async function idle(page, i = 0, ms = 180000) {
  await sleep(1500);
  const end = Date.now() + ms;
  while (Date.now() < end && (await running(page, i))) await sleep(1000);
  await sleep(800);
  return !(await running(page, i));
}

export const chatId = (page) => new URL(page.url()).searchParams.get("chat");

export async function archiveChats(page, n) {
  for (let k = 0; k < n; k++) {
    await page.evaluate(() => document.querySelector("nav [data-archive]")?.click());
    await sleep(600);
  }
}

export async function done(browser, errors) {
  check("no JS errors", errors.length === 0, errors.join(" | "));
  console.log(fails ? `\n${fails} FAIL` : "\nall green");
  await browser.close();
  process.exit(fails ? 1 : 0);
}
