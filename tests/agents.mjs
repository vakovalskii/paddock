// Agents talk across panes: the Agents tool is installed, pane 2 is told a build number, pane 1 is asked to get it
// from the other chat with paddock-agents. Checks the number comes back, pane 2 shows the agent's message and
// both panes end idle (a turn started by the CLI must finish in the UI too).
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/agents.mjs
// Spends three model turns; archives both chats at the end.
import puppeteer from "puppeteer-core";

const URL_ = process.env.HUB_URL ?? "http://localhost:8088";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: Number(process.env.HUB_DPR ?? 1) },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const pane = (i) => page.$eval(`[data-pane="${i}"]`, (e) => e.innerText);
const running = () => page.evaluate(() => [0, 1].filter((i) => document.querySelector(`[data-pane="${i}"] [title="Stop"]`)));
const idle = async (limit = 240) => { await sleep(2500); for (let i = 0; i < limit / 2 && (await running()).length; i++) await sleep(2000); await sleep(1000); return running(); };
const want = JSON.parse(process.env.HUB_SELECTION ?? "{}").model;
const word = `build ${7000 + (Date.now() % 1000)}`;

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

// 1. Settings → Tools: Agents on.
await page.click('[title="Settings"]');
await page.evaluate(() => [...document.querySelectorAll(".fixed.inset-0 button")].find((b) => b.innerText.trim() === "Tools").click());
await page.waitForFunction(() => /Agents/.test(document.querySelector(".fixed.inset-0").innerText) && !/reading skills/.test(document.querySelector(".fixed.inset-0").innerText), { timeout: 20000 });
// The Agents card: its label holds the checkbox and the description; Apply sits next to it.
const label = () => [...document.querySelectorAll(".fixed.inset-0 label")].find((l) => l.querySelector("input[type=checkbox]") && l.innerText.includes("other open chats"));
await page.waitForFunction(label, { timeout: 20000 });
const on = await page.evaluate((f) => new Function(`return (${f})()`)().querySelector("input").checked, label.toString());
if (!on) await page.evaluate((f) => new Function(`return (${f})()`)().querySelector("input").click(), label.toString());
await page.evaluate((f) => [...new Function(`return (${f})()`)().parentElement.querySelectorAll("button")].find((b) => /Apply|Update/.test(b.innerText) && !b.disabled)?.click(), label.toString());
await sleep(2500);
check("agents tool installed", await page.evaluate((f) => /installed/.test(new Function(`return (${f})()`)().innerText), label.toString()));
await page.keyboard.press("Escape");

// 2. Two panes: the second one learns a code word.
await page.click('[title="Chats on screen"] button:nth-child(2)');
await sleep(800);
await page.click('[data-pane="1"] textarea');
await page.keyboard.type(`FYI: the current release is ${word}. Reply only with: ok`);
await page.keyboard.press("Enter");
await idle();

// 3. The first one asks it through paddock-agents.
await page.click('[data-pane="0"] textarea');
await page.keyboard.type("My other open chat knows which release build is current. Use paddock-agents: send the other chat (not you) the question 'which release build is current?' with --wait, then tell me the build number it answered.");
await page.keyboard.press("Enter");
const stuck = await idle(300);
check("both panes idle after the exchange", stuck.length === 0, stuck.length ? `still running: ${stuck.join(",")}` : "");
const p0 = await pane(0);
const p1 = await pane(1);
check("asker got the build number", p0.toLowerCase().includes(word), p0.slice(-200).replace(/\n/g, " "));
check("other pane shows it as from an agent", !!(await page.$('[data-pane="1"] [data-agent-from]')) && !/paddock-agents: from/.test(p1));
check("asker shows the exchange as a message card", /Message to/.test(p0) && p0.toLowerCase().includes(word));
check("other pane answered it", (p1.toLowerCase().match(new RegExp(word, "g")) ?? []).length >= 2);
await page.screenshot({ path: process.argv[2] ?? "/tmp/agents.png" });

for (let k = 0; k < 2; k++) { await page.evaluate(() => document.querySelector("nav [data-archive]")?.click()); await sleep(600); }
check("no JS errors", errors.length === 0, errors.join(" | "));
console.log(fails ? `\n${fails} FAIL` : "\nall green");
await browser.close();
process.exit(fails ? 1 : 0);
