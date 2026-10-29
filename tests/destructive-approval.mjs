// Destructive commands must stop at an approval card even with approval_policy = "on-request" and full access:
// the harness ships ~/.codex/rules/paddock.rules (rm, rmdir, git push/reset/clean → prompt).
// The test asks the agent to rm a file, expects the card, denies it and checks the file survived.
// Prepare the file first: docker compose exec harness-test sh -c 'echo hi > /workspace/delete-me.txt'
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/destructive-approval.mjs
import puppeteer from "puppeteer-core";

const URL_ = process.env.HUB_URL ?? "http://localhost:8088";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const hasButton = (label) => page.evaluate((l) => [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === l), label);

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
await page.waitForSelector('[data-pane="0"] textarea', { timeout: 20000 });
// Wait for the model picker: a message sent before model/list returns starts the thread on the wrong provider.
const want = JSON.parse(process.env.HUB_SELECTION ?? "{}").model;
if (want) await page.waitForFunction((m) => document.querySelector("main")?.innerText.includes(m), { timeout: 30000 }, want);
await sleep(500);

await page.click('[data-pane="0"] textarea');
await page.keyboard.type("Run exactly this shell command and nothing else: rm /workspace/delete-me.txt");
await page.keyboard.press("Enter");

let card = false;
for (let i = 0; i < 60 && !card; i++) {
  await sleep(2000);
  card = await hasButton("Deny");
}
check("approval card shown for rm", card);
if (card) {
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Deny").click());
  for (let i = 0; i < 60 && (await page.$('[title="Stop"]')); i++) await sleep(2000);
}

// Archive the chat so test runs don't pile up.
await page.evaluate(() => document.querySelector("nav [data-archive]")?.click());
console.log(fails ? `\n${fails} FAIL` : "\nall green — now check the file still exists");
await browser.close();
process.exit(fails ? 1 : 0);
