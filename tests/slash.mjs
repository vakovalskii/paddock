// Composer commands: the "/" hint popup with keyboard completion, /help, !shell, /rename, /status, /diff, /fork,
// /compact, /new. /review and /init are full model turns and are left out.
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/slash.mjs
// Spends one short model turn; archives the chats it made.
import puppeteer from "puppeteer-core";

const URL_ = process.env.HUB_URL ?? "http://localhost:8088";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1400, height: 950 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const pane = () => page.$eval('[data-pane="0"]', (e) => e.innerText);
const input = () => page.$eval('[data-pane="0"] textarea', (t) => t.value);
const hints = () => page.$$eval("[data-slash-hints] button", (bs) => bs.map((b) => b.innerText.split(/\s/)[0]));
const typeIn = async (text) => { await page.click('[data-pane="0"] textarea'); await page.keyboard.type(text); };
const send = async (text) => { await typeIn(text); await page.keyboard.press("Enter"); await sleep(400); if ((await input()).trim()) await page.keyboard.press("Enter"); };
const until = (fn, ms = 20000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true, () => false);
const chatId = () => new URL(page.url()).searchParams.get("chat");
const want = JSON.parse(process.env.HUB_SELECTION ?? "{}").model;

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
if (want) await page.waitForFunction((m) => document.querySelector("main")?.innerText.includes(m), { timeout: 30000 }, want);

// 1. Hints.
await typeIn("/");
await sleep(300);
check("'/' lists commands", (await hints()).length >= 9, (await hints()).join(" "));
await page.keyboard.type("re");
await sleep(200);
check("'/re' narrows to rename, review", JSON.stringify((await hints()).sort()) === JSON.stringify(["/rename", "/review"]), (await hints()).join(" "));
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Tab");
await sleep(200);
check("arrow + Tab completes", /^\/re(name|view) $/.test(await input()), JSON.stringify(await input()));
await page.keyboard.press("Escape");
await page.click('[data-pane="0"] textarea', { clickCount: 3 });
await page.keyboard.press("Backspace");

// 2. /help in an empty chat.
await send("/help");
check("/help lists commands", await until(() => /\/compact/.test(document.querySelector('[data-pane="0"]').innerText) && /!command/.test(document.querySelector('[data-pane="0"]').innerText)));

// 3. A real message first: Codex lists a chat in the sidebar only once it has one. Then !shell.
await send("Reply with the single word: ok");
await until(() => location.search.includes("chat="), 30000);
for (let i = 0; i < 60 && (await page.$('[data-pane="0"] [title="Stop"]')); i++) await sleep(1000);
const first = chatId();
check("chat started", !!first, page.url());
await send("!echo paddock-$((6*7))");
const expand = () => page.evaluate(() => [...document.querySelectorAll('[data-pane="0"] button')].filter((b) => b.innerText.includes("echo paddock")).forEach((b) => b.click()));
check("!shell card shown", await until(() => /echo paddock/.test(document.querySelector('[data-pane="0"]').innerText)));
await sleep(1500);
await expand();
check("!shell output shown", await until(() => /paddock-42/.test(document.querySelector('[data-pane="0"]').innerText), 5000), (await pane()).slice(-150).replace(/\n/g, " "));

// 4. /rename shows in the sidebar.
const name = `slash test ${Date.now() % 1000}`;
await send(`/rename ${name}`);
check("/rename shows in the sidebar", await until((n) => document.querySelector("nav")?.innerText.includes(n), 10000, name));

// 5. /status.
await send("/status");
check("/status shows the model", await until((m) => document.querySelector('[data-pane="0"]').innerText.includes(`Model: ${m}`), 10000, want));

// 6. /diff runs git in the folder (the folder may not be a repo: any output card counts).
await send("/diff");
check("/diff ran", await until(() => /git status --short|not a git repository|diff/.test(document.querySelector('[data-pane="0"]').innerText)), "");

// 7. /fork opens a copy.
await send("/fork");
check("/fork opens a new chat", await until((id) => !location.search.includes(id) && location.search.includes("chat="), 15000, first), page.url());
check("/fork keeps the history", await until(() => /echo paddock/.test(document.querySelector('[data-pane="0"]').innerText), 15000));

// 8. /compact.
await send("/compact");
check("/compact runs", await until(() => /Context compacted|compact/i.test(document.querySelector('[data-pane="0"]').innerText), 90000));
for (let i = 0; i < 60 && (await page.$('[data-pane="0"] [title="Stop"]')); i++) await sleep(1000);

// 9. /new.
await send("/new");
check("/new empties the pane", await until(() => /What are we building/.test(document.querySelector('[data-pane="0"]').innerText), 5000));

for (let k = 0; k < 3; k++) { await page.evaluate(() => document.querySelector("nav [data-archive]")?.click()); await sleep(600); }
check("no JS errors", errors.length === 0, errors.join(" | "));
console.log(fails ? `\n${fails} FAIL` : "\nall green");
await browser.close();
process.exit(fails ? 1 : 0);
