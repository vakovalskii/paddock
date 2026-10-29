// Around the chats: sidebar search and archive, the language switch (EN ↔ RU), every Settings tab opens,
// Codex settings round-trip (custom instructions saved to config.toml and read back), layout snapshots
// (save, change the layout, restore, delete).
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/workspace.mjs
// Spends one short model turn; archives its chat and leaves the settings as they were.
import { launch, login, ready, send, idle, until, check, sleep, done } from "./lib.mjs";

const { browser, page, errors } = await launch();
await login(page);
const nav = () => page.$eval("nav", (e) => e.innerText);
const modal = () => page.$eval(".fixed.inset-0", (e) => e.innerText).catch(() => "");
const clickText = (sel, text) => page.evaluate((s, t) => { const b = [...document.querySelectorAll(s)].find((x) => x.innerText.trim() === t); b?.click(); return !!b; }, sel, text);

// 1. A chat to work with.
const marker = `ws-${Date.now() % 100000}`;
await send(page, `Reply with the single word: ok. ${marker}`);
await idle(page);
check("chat listed in the sidebar", await until(page, (m) => document.querySelector("nav").innerText.includes(m), 15000, marker));

// 2. Search.
await page.type('input[name="thread-search"]', marker);
await sleep(300);
const hits = await page.$$eval("nav [data-archive]", (bs) => bs.length);
check("search: finds the chat", (await nav()).includes(marker) && hits === 1, `${hits} rows`);
await page.click('input[name="thread-search"]', { clickCount: 3 });
await page.keyboard.type("zz-no-such-chat-zz");
await sleep(300);
check("search: nothing for a miss", (await page.$$("nav [data-archive]")).length === 0);
await page.click('input[name="thread-search"]', { clickCount: 3 });
await page.keyboard.press("Backspace");
await sleep(300);

// 3. Layout snapshots.
await page.click("[data-side-toggle]");
await page.click('[data-side-tab="sessions"]');
await sleep(500);
const snapName = `snap-${marker}`;
await page.type('aside input[placeholder^="name"]', snapName);
await page.keyboard.press("Enter");
check("snapshot saved", await until(page, (n) => document.body.innerText.includes(n), 10000, snapName));
await page.click('[title="Chats on screen"] button:nth-child(3)');
await sleep(600);
check("layout changed to 4", (await page.$$("[data-pane]")).length >= 4);
await page.evaluate((n) => [...document.querySelectorAll("aside .rounded-xl")].find((c) => c.innerText.includes(n))?.querySelector("button")?.click(), snapName);
await sleep(1200);
check("snapshot restored: one pane with the chat", (await page.$$eval("[data-pane]", (ps) => ps.filter((p) => p.getBoundingClientRect().width > 0).length)) === 1 && (await page.$eval('[data-pane="0"]', (e) => e.innerText)).includes(marker));
await page.evaluate((n) => [...document.querySelectorAll("aside .rounded-xl")].find((c) => c.innerText.includes(n))?.querySelector('[title="Remove"]')?.click(), snapName);
check("snapshot deleted", await until(page, (n) => !document.body.innerText.includes(n), 10000, snapName));
await page.click("[data-side-toggle]");

// 4. Every Settings tab opens and shows its content.
await page.click('[title="Settings"]');
await sleep(500);
const tabs = { "ChatGPT account": /ChatGPT|sign in|Log in|account/i, NeuralDeep: /NeuralDeep|key/i, Tools: /Paddock tools/i, Codex: /config\.toml/, Proxies: /through these proxies|Only an admin can configure proxies/, "Paddock login": /password|Two-factor|2FA/i };
for (const [tab, want] of Object.entries(tabs)) {
  await clickText(".fixed.inset-0 button", tab);
  const ok = await until(page, (w) => new RegExp(w.src, w.flags).test(document.querySelector(".fixed.inset-0")?.innerText ?? ""), 15000, { src: want.source, flags: want.flags });
  check(`settings: ${tab} tab`, ok && !/Something went wrong|Unhandled/i.test(await modal()));
}

// 5. Codex settings round-trip: custom instructions saved and read back, then cleared.
await clickText(".fixed.inset-0 button", "Codex");
await page.waitForSelector(".fixed.inset-0 textarea");
const note = `test note ${marker}`;
await page.click(".fixed.inset-0 textarea", { clickCount: 3 });
await page.keyboard.type(note);
await clickText(".fixed.inset-0 button", "Save");
check("codex settings: saved", await until(page, () => /Saved/.test(document.querySelector(".fixed.inset-0").innerText), 10000));
await page.keyboard.press("Escape");
await sleep(300);
await page.click('[title="Settings"]');
await clickText(".fixed.inset-0 button", "Codex");
await page.waitForSelector(".fixed.inset-0 textarea");
await sleep(800);
check("codex settings: read back after reopening", (await page.$eval(".fixed.inset-0 textarea", (t) => t.value)) === note);
await page.click(".fixed.inset-0 textarea", { clickCount: 3 });
await page.keyboard.press("Backspace");
await clickText(".fixed.inset-0 button", "Save");
check("codex settings: cleared again", await until(page, () => /Saved/.test(document.querySelector(".fixed.inset-0").innerText), 10000));
await page.keyboard.press("Escape");

// 6. Language switch: EN → RU → EN, the choice survives the reload it triggers.
if (await page.$(".fixed.inset-0")) await page.keyboard.press("Escape");
await sleep(300);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => document.querySelector("[data-lang-toggle]").click())]);
await ready(page).catch(() => {});
check("language: Russian after the switch", await until(page, () => /Новый чат/.test(document.body.innerText), 15000));
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => document.querySelector("[data-lang-toggle]").click())]);
check("language: back to English", await until(page, () => /New chat/.test(document.body.innerText), 15000));

// 7. Archive: the chat leaves the list and its pane empties.
await ready(page);
await page.type('input[name="thread-search"]', marker);
await sleep(300);
await page.evaluate(() => document.querySelector("nav [data-archive]")?.click());
await sleep(1000);
await page.click('input[name="thread-search"]', { clickCount: 3 });
await page.keyboard.press("Backspace");
check("archive: gone from the list", await until(page, (m) => !document.querySelector("nav").innerText.includes(m), 10000, marker));
check("archive: pane emptied", await until(page, () => /What are we building/.test(document.querySelector('[data-pane="0"]').innerText), 10000));

await done(browser, errors);
