// Images end to end: the Images tool is on (Settings → Tools), the agent draws a picture with paddock-images,
// the thumbnail shows in the answer and opens large, the statusbar marks the image CLI as used, tok/s is shown.
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/images.mjs [screenshot.png]
// Spends one NeuralDeep image generation; archives its chat.
import { launch, login, send, idle, until, check, sleep, archiveChats, done } from "./lib.mjs";

const { browser, page, errors } = await launch({ width: 1400, height: 950 });
await login(page);

// 1. Images tool on.
await page.click('[title="Settings"]');
await page.evaluate(() => [...document.querySelectorAll(".fixed.inset-0 button")].find((b) => b.innerText.trim() === "Tools").click());
const label = () => [...document.querySelectorAll(".fixed.inset-0 label")].find((l) => l.querySelector("input[type=checkbox]") && l.innerText.includes("Generate and edit images"));
await page.waitForFunction(label, { timeout: 20000 });
const call = (body) => page.evaluate((f, b) => new Function("card", b)(new Function(`return (${f})()`)()), label.toString(), body);
if (!(await call("return card.querySelector('input').checked"))) await call("card.querySelector('input').click()");
await call("[...card.parentElement.querySelectorAll('button')].find((b) => /Apply|Update/.test(b.innerText) && !b.disabled)?.click()");
await sleep(2500);
check("images tool installed", await call("return /installed/.test(card.innerText)"));
await page.keyboard.press("Escape");

// 2. Draw.
await send(page, "Draw a simple flat icon: an orange horseshoe on a dark background. Show the image in your answer.");
const thumb = await until(page, () => [...document.querySelectorAll('[data-pane="0"] img')].some((i) => i.naturalWidth > 0 && /^(data:image|blob:)/.test(i.src)), 240000);
check("thumbnail in the answer", thumb);
await idle(page, 0, 120000);
const text = await page.$eval('[data-pane="0"]', (e) => e.innerText);
check("tok/s under the answer", /tok\/s/.test(text));
check("statusbar: image CLI marked as used", /used/.test(text));

// 3. Opens large.
await page.click('[data-pane="0"] button.group\\/img');
check("image opens large", await until(page, () => [...document.querySelectorAll(".fixed.inset-0 img")].some((i) => i.getBoundingClientRect().width > 400), 5000));
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
await page.keyboard.press("Escape");
await page.evaluate(() => document.querySelector(".fixed.inset-0")?.click());

await archiveChats(page, 1);
await done(browser, errors);
