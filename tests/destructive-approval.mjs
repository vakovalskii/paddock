// Destructive commands must stop at an approval card even with approval_policy = "on-request" and full access:
// the harness ships ~/.codex/rules/paddock.rules (rm, rmdir, git push/reset/clean → prompt).
// All three answers: Deny keeps the file, Allow deletes it, "For this session" deletes it; a different rm in
// the same chat still asks (session approval covers that exact command only). The test makes its own files with !touch and checks them with !test.
// Run: HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/destructive-approval.mjs
// Spends four model turns; archives its chat.
import { launch, login, send, idle, until, check, sleep, archiveChats, done } from "./lib.mjs";

const { browser, page, errors } = await launch();
await login(page);
const dir = `/workspace/.paddock-test-${Date.now() % 100000}`;
const hasButton = (label) => page.evaluate((l) => [...document.querySelectorAll('[data-pane="0"] button')].some((b) => b.innerText.trim() === l), label);
const press = (label) => page.evaluate((l) => [...document.querySelectorAll('[data-pane="0"] button')].find((b) => b.innerText.trim() === l)?.click(), label);

// !shell output sits in a collapsed card: run, open the card, read the verdict.
async function exists(name) {
  const tag = `chk-${Math.random().toString(36).slice(2, 7)}`;
  await send(page, `!test -e ${dir}/${name} && echo ${tag}-EXISTS || echo ${tag}-GONE`);
  await until(page, (t) => [...document.querySelectorAll('[data-pane="0"] button')].some((b) => b.innerText.includes(t)), 15000, tag);
  await sleep(1200);
  await page.evaluate((t) => [...document.querySelectorAll('[data-pane="0"] button')].filter((b) => b.innerText.includes(t)).pop()?.click(), tag);
  await until(page, (t) => new RegExp(`${t}-(EXISTS|GONE)\\n`).test(document.querySelector('[data-pane="0"]').innerText + "\n"), 5000, tag);
  return new RegExp(`${tag}-EXISTS`).test((await page.$eval('[data-pane="0"]', (e) => e.innerText)).replace(new RegExp(`echo ${tag}-EXISTS`, "g"), ""));
}

// Ask the agent to rm; returns whether an approval card showed up (and answers it with `answer`).
async function askRm(name, answer) {
  await send(page, `Run exactly this shell command and nothing else: rm ${dir}/${name}`);
  // Wait as long as the turn runs: NeuralDeep models sometimes think for minutes before the command.
  let card = false;
  for (let i = 0; i < 400 && !card; i++) {
    await sleep(1500);
    card = !!(await page.$('[data-pane="0"] [data-approval-armed]'));
    if (!card && i > 8 && !(await page.$('[data-pane="0"] [title="Stop"]'))) break;
  }
  if (card) await press(answer);
  await idle(page);
  return card;
}

await send(page, "Reply with the single word: ready");
await idle(page);
await send(page, `!mkdir -p ${dir} && touch ${dir}/a.txt ${dir}/b.txt ${dir}/c.txt`);
await sleep(2500);
check("setup: test files exist", await exists("a.txt"));

check("rm a.txt → approval card", await askRm("a.txt", "Deny"));
check("Deny: a.txt kept", await exists("a.txt"));

check("rm a.txt again → card again", await askRm("a.txt", "Allow"));
check("Allow: a.txt deleted", !(await exists("a.txt")));

check("rm b.txt → card", await askRm("b.txt", "For this session"));
check("For this session: b.txt deleted", !(await exists("b.txt")));
// "For this session" covers that exact command only: a different rm asks again.
check("rm c.txt (another command) → asks again", await askRm("c.txt", "Allow"));
check("c.txt deleted after Allow", !(await exists("c.txt")));

await send(page, `!rmdir ${dir}`);
await sleep(1500);
await archiveChats(page, 1);
await done(browser, errors);
