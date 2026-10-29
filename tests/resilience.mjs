// Staying alive: the network drops in the middle of a turn and comes back (the pane reconnects and shows the
// full answer without a reload); Stop interrupts a running turn and the chat stays usable; turn metrics
// (model, time, TTFT) survive a reload; the app works at phone width end to end.
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/resilience.mjs
// Spends four short model turns; archives its chats.
import { launch, login, ready, send, idle, paneText, running, until, chatId, archiveChats, check, sleep, done, MODEL } from "./lib.mjs";

const { browser, page, errors } = await launch();
const cdp = await page.createCDPSession();
await login(page);

// 1. Offline mid-turn: events are lost while the socket is down; the reconnect re-reads the chat from history.
await send(page, "Count from 1 to 30, one number per line, then write the word: finished");
await until(page, () => /\b3\b/.test(document.querySelector('[data-pane="0"]').innerText), 60000);
await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await sleep(8000);
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const finished = await until(page, () => /finished/i.test(document.querySelector('[data-pane="0"]').innerText), 120000);
check("offline mid-turn: full answer arrives after reconnect, no reload", finished, (await paneText(page)).slice(-120).replace(/\n/g, " "));
check("offline mid-turn: pane ends idle", await idle(page));
const first = chatId(page);
const text1 = await paneText(page);
const answer1 = text1.split("then write the word: finished").pop() ?? "";
check("offline mid-turn: answer shown once", (answer1.match(/finished/gi) ?? []).length === 1 && (answer1.match(/^30$/gm) ?? []).length <= 1);

// 2. Stop interrupts a running turn; the chat takes the next message.
await send(page, "Write a 600-word essay about fences, slowly and in detail.");
await until(page, () => !!document.querySelector('[data-pane="0"] [title="Stop"]'), 30000);
await sleep(4000);
await page.click('[data-pane="0"] [title="Stop"]');
check("Stop: turn ends", await idle(page, 0, 30000));
await send(page, "Reply with the single word: alive");
await idle(page);
check("Stop: next message answered", /alive/i.test((await paneText(page)).split("Reply with the single word: alive").pop() ?? ""));

// 3. Metrics under answers survive a reload.
const metrics = (t) => (t.match(/TTFT [\d.]+ m?s/g) ?? []).length;
const before = metrics(await paneText(page));
await page.reload({ waitUntil: "networkidle0" });
await ready(page);
await until(page, () => /alive/i.test(document.querySelector('[data-pane="0"]').innerText), 20000);
const after = await paneText(page);
check("reload: same chat open", chatId(page) === first);
check("reload: TTFT kept under answers", before > 0 && metrics(after) === before, `${before} → ${metrics(after)}`);
check("reload: model shown under answers", MODEL ? after.includes(MODEL) : true);

// 4. Phone width end to end: new chat, send, answer, no horizontal scroll.
await page.setViewport({ width: 390, height: 844 });
await sleep(500);
await page.click("[data-sidebar-toggle]");
await sleep(300);
await page.evaluate(() => [...document.querySelectorAll("aside button")].find((b) => /New chat/.test(b.innerText))?.click());
await sleep(800);
if (await page.$("aside[class*=fixed]")) await page.keyboard.press("Escape");
await send(page, "Reply with the single word: mobile");
check("phone: answer arrives", await idle(page) && /mobile/i.test((await paneText(page)).split("single word: mobile").pop() ?? ""));
check("phone: no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
check("phone: composer fully on screen", await page.$eval('[data-pane="0"] textarea', (t) => { const r = t.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight; }));
await page.setViewport({ width: 1400, height: 900 });
await sleep(300);

void running;
await archiveChats(page, 2);
await done(browser, errors);
