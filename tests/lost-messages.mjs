// A pane that points at a chat the server no longer has (deleted sessions, an old link, a stale saved layout)
// must say so and turn into a new chat; before, messages sent there vanished until a reload.
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/lost-messages.mjs
// Spends one short model turn; archives the chat at the end.
import puppeteer from "puppeteer-core";

const URL_ = process.env.HUB_URL ?? "http://localhost:8088";
const GONE = "00000000-0000-7000-8000-000000000000";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const pane = () => page.$eval('[data-pane="0"]', (e) => e.innerText);
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

await page.goto(`${URL_}/?chat=${GONE}`, { waitUntil: "networkidle0" });
await ready();
await page.waitForFunction(() => /no longer exists/.test(document.querySelector('[data-pane="0"]')?.innerText ?? ""), { timeout: 20000 }).catch(() => {});
check("missing chat: pane says so", /no longer exists/.test(await pane()));
check("missing chat: address dropped", !page.url().includes(GONE), page.url());

const marker = `lost-${Date.now() % 100000}`;
await page.click('[data-pane="0"] textarea');
await page.keyboard.type(`Reply with the single word ok. ${marker}`);
await page.keyboard.press("Enter");
await sleep(1000);
check("message visible right after send", (await pane()).includes(marker));
await page.waitForFunction(() => location.search.includes("chat="), { timeout: 30000 }).catch(() => {});
check("new chat started", page.url().includes("chat=") && !page.url().includes(GONE), page.url());
for (let i = 0; i < 60 && (await page.$('[title="Stop"]')); i++) await sleep(1000);
const after = await pane();
check("message still there after the answer", after.includes(marker));
check("notice gone once the chat started", !/no longer exists/.test(after));
check("answer arrived", !/⚠️/.test(after) && /tok\/s|\d+(\.\d+)? s/.test(after), after.slice(-100).replace(/\n/g, " "));

await page.evaluate(() => document.querySelector("nav [data-archive]")?.click());
check("no JS errors", errors.length === 0, errors.join(" | "));
console.log(fails ? `\n${fails} FAIL` : "\nall green");
await browser.close();
process.exit(fails ? 1 : 0);
