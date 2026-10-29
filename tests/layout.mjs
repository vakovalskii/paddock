// Layout: the address follows the active chat (?chat=<id>) and a reload lands on it, the chat list collapses on
// desktop and slides over on mobile, the side panel resizes by its left edge and remembers the width.
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/layout.mjs
// Spends one short model turn; archives the chat at the end.
import puppeteer from "puppeteer-core";

const URL_ = process.env.HUB_URL ?? "http://localhost:8088";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const sidebarShown = () => page.evaluate(() => { const a = document.querySelector("aside"); return !!a && getComputedStyle(a).display !== "none" && a.getBoundingClientRect().width > 0; });
const sideWidth = () => page.$eval("[data-side-resize]", (h) => h.parentElement.getBoundingClientRect().width);
const want = JSON.parse(process.env.HUB_SELECTION ?? "{}").model;
const ready = async () => {
  await page.waitForSelector('[data-pane="0"] textarea', { timeout: 20000 });
  if (want) await page.waitForFunction((m) => document.querySelector("main")?.innerText.includes(m), { timeout: 30000 }, want);
};

await page.goto(`${URL_}/login`, { waitUntil: "networkidle0" });
await page.evaluate((sel) => {
  localStorage.clear();
  localStorage.setItem("paddock.lang", JSON.stringify("en"));
  if (sel) localStorage.setItem("paddock.selection", sel);
}, process.env.HUB_SELECTION ?? null);
await page.reload({ waitUntil: "networkidle0" });
await page.type("input[name=email]", process.env.HUB_EMAIL ?? "test@hub.local");
await page.type("input[name=password]", process.env.HUB_PASS);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("form button[type=submit], form button:last-of-type")]);
await ready();

// 1. Chat id in the address.
check("no chat → no ?chat=", !page.url().includes("chat="));
await page.click('[data-pane="0"] textarea');
await page.keyboard.type("Reply with the single word: pong");
await page.keyboard.press("Enter");
await page.waitForFunction(() => location.search.includes("chat="), { timeout: 30000 }).catch(() => {});
const id = new URL(page.url()).searchParams.get("chat");
check("new chat → ?chat=<id>", !!id, page.url());
for (let i = 0; i < 60 && (await page.$('[title="Stop"]')); i++) await sleep(1000);

// A fresh browser state with only the link opens the same chat.
await page.evaluate(() => localStorage.removeItem("paddock.panes"));
await page.goto(`${URL_}/?chat=${id}`, { waitUntil: "networkidle0" });
await ready();
await page.waitForFunction(() => /pong/i.test(document.querySelector('[data-pane="0"]')?.innerText ?? ""), { timeout: 20000 }).catch(() => {});
check("link opens the chat", /pong/i.test(await page.$eval('[data-pane="0"]', (e) => e.innerText)));
check("address kept after load", page.url().includes(`chat=${id}`));

// 2. Chat list collapses on desktop and stays collapsed after reload.
check("sidebar shown by default", await sidebarShown());
await page.click("[data-sidebar-toggle]");
await sleep(300);
check("sidebar collapsed", !(await sidebarShown()));
await page.reload({ waitUntil: "networkidle0" });
await ready();
check("collapse remembered", !(await sidebarShown()));
await page.click("[data-sidebar-toggle]");
await sleep(300);
check("sidebar back", await sidebarShown());

// 3. Side panel resizes by dragging its left edge.
await page.click("[data-side-toggle]");
await page.waitForSelector("[data-side-resize]");
const w0 = await sideWidth();
const h = await page.$eval("[data-side-resize]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(h.x, h.y);
await page.mouse.down();
await page.mouse.move(h.x - 150, h.y, { steps: 8 });
await page.mouse.up();
const w1 = await sideWidth();
check("side panel wider after drag", w1 > w0 + 100, `${w0} → ${w1}`);
check("chat grid still fits", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await page.reload({ waitUntil: "networkidle0" });
await ready();
if (!(await page.$("[data-side-resize]"))) await page.click("[data-side-toggle]");
await page.waitForSelector("[data-side-resize]");
check("width remembered", Math.abs((await sideWidth()) - w1) < 4);
await page.click("[data-side-resize]", { clickCount: 2 });
await sleep(200);
check("double-click resets width", Math.abs((await sideWidth()) - 480) < 4);
await page.click("[data-side-toggle]");

// 4. Mobile: the list is hidden and the same button slides it over.
await page.setViewport({ width: 390, height: 844 });
await sleep(500);
check("mobile: list hidden", !(await sidebarShown()));
await page.click("[data-sidebar-toggle]");
await sleep(300);
check("mobile: button opens the list", await sidebarShown());
check("mobile: no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await page.setViewport({ width: 1600, height: 1000 });
await sleep(300);

// Clean up: archive the test chat.
await page.evaluate((id) => document.querySelector(`nav [data-archive="${id}"]`)?.click() ?? document.querySelector("nav [data-archive]")?.click(), id);

check("no JS errors", errors.length === 0, errors.join(" | "));
console.log(fails ? `\n${fails} FAIL` : "\nall green");
await browser.close();
process.exit(fails ? 1 : 0);
