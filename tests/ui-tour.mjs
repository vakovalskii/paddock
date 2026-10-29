// Полный проход по морде: каждый экран и действие — шаг с проверкой и скриншотом.
// Запуск: HUB_URL=http://localhost:8088 HUB_EMAIL=valera@hub.local HUB_PASS=... node tests/ui-tour.mjs [папка-для-скриншотов]
// Нужны puppeteer-core и Chrome (CHROME=путь, по умолчанию macOS). Создаёт 1–2 коротких треда в истории.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const LANG = process.env.HUB_LANG ?? "ru";

const URL_ = process.env.HUB_URL ?? "http://localhost:8088";
const out = (process.argv[2] ?? "/tmp/ui-tour").replace(/\/$/, "") + "/";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  defaultViewport: { width: 1512, height: 945, deviceScaleFactor: 1 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0, fails = 0;
const shot = (name) => page.screenshot({ path: `${out}${String(++n).padStart(2, "0")}-${name}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const clickText = (sel, t) => page.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find((e) => e.innerText.includes(t)); el?.click(); return !!el; }, sel, t);
const tab = (name) => page.evaluate((nm) => [...document.querySelectorAll(".fixed.inset-0 button")].find((b) => b.innerText.trim() === nm)?.click(), name);

async function step(name, fn) {
  const started = Date.now();
  try {
    const ok = await fn();
    if (ok === false) throw new Error("проверка не прошла");
    console.log(`PASS  ${name}  (${Date.now() - started} мс)`);
  } catch (e) {
    fails++;
    console.log(`FAIL  ${name}  — ${e.message.split("\n")[0].slice(0, 160)}`);
    await shot(`FAIL-${name.replace(/\W+/g, "_")}`).catch(() => {});
  }
  await sleep(250);
}

await step("вход: неверный пароль — понятная ошибка", async () => {
  await page.goto(`${URL_}/login`, { waitUntil: "networkidle0" });
  await page.evaluate((lang, sel) => {
    localStorage.clear();
    // Язык интерфейса явно: тесты ищут подписи; модель — для тестового пользователя без ChatGPT (HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}').
    localStorage.setItem("paddock.lang", JSON.stringify(lang));
    if (sel) localStorage.setItem("paddock.selection", sel);
  }, LANG, process.env.HUB_SELECTION ?? null);
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("input[name=email]", process.env.HUB_EMAIL ?? "valera@hub.local");
  await page.type("input[name=password]", "wrong-password-123");
  await page.click("button");
  await page.waitForFunction(() => document.body.innerText.includes("Неверная почта или пароль"), { timeout: 10000 });
  await shot("login-wrong");
});

await step("вход: верный пароль — рабочая область", async () => {
  await page.click("input[name=password]", { clickCount: 3 });
  await page.type("input[name=password]", process.env.HUB_PASS);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button")]);
  await page.waitForFunction(() => document.body.innerText.includes("Лимиты Codex"), { timeout: 20000 });
  await shot("empty");
  return (await text()).includes("Чем займёмся");
});

await step("новый чат: ответ, модель и время под ответом", async () => {
  await page.click("main textarea");
  await page.keyboard.type("Ответь одним словом: столица Франции?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector('[title="Остановить"]'), { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('[title="Остановить"]'), { timeout: 240000 });
  await shot("answer");
  const t = await text();
  return /Париж/i.test(t) && /\d+(\.\d)? с/.test(t);
});

await step("правка сообщения: откат и новый ответ", async () => {
  await page.hover("main .items-end > div");
  await page.click('[title="Изменить и переотправить"]');
  await shot("edit-composer");
  await page.$eval("main form textarea, main textarea", (ta) => ta.select());
  await page.keyboard.type("Ответь одним словом: столица Италии?");
  await clickText("main button", "Отправить");
  await page.waitForFunction(() => /Рим/.test(document.querySelector("main").innerText), { timeout: 240000 });
  await page.waitForFunction(() => !document.querySelector('[title="Остановить"]'), { timeout: 60000 });
  const t = await page.$eval("main", (e) => e.innerText);
  await shot("edited");
  return !/Париж/.test(t);
});

await step("выбор модели: список и усилие", async () => {
  await page.click("[data-pane].flex header > div > button");
  await page.waitForFunction(() => /усилие рассуждения/i.test(document.body.innerText), { timeout: 5000 });
  await shot("model-picker");
  await page.keyboard.press("Escape");
});

await step("старый тред с инструментами: карточки и результаты веб-поиска", async () => {
  if (!(await clickText("nav button", "1) Через apply_patch"))) return true; // треда может не быть на чистой установке
  await page.waitForFunction(() => document.body.innerText.includes("Search"), { timeout: 20000 });
  await clickText("main button", "Search");
  await sleep(300);
  await shot("tools");
  return (await page.$eval("main", (e) => e.innerText)).includes("рез.");
});

await step("лимиты: панель с расходом", async () => {
  // У пользователя без входа в ChatGPT (тестовый, только NeuralDeep) лимитов нет — шаг не про него.
  if ((await text()).includes("нет данных")) return true;
  await clickText("aside button", "Лимиты Codex");
  await page.waitForFunction(() => document.body.innerText.includes("всего"), { timeout: 20000 });
  await shot("account");
  const masked = /\*{3,}@/.test(await text());
  await page.click('[title="Закрыть"]');
  return masked;
});

await step("меню нового чата в папке", async () => {
  await page.click('[title="Новый чат в папке"]');
  await page.waitForFunction(() => !document.body.innerText.includes("читаю папки"), { timeout: 10000 });
  await shot("folder-menu");
  await page.mouse.click(900, 600);
});

for (const t of ["Аккаунт ChatGPT", "NeuralDeep", "Codex", "Прокси", "Вход в морду"]) {
  await step(`настройки: ${t}`, async () => {
    if (!(await page.$(".fixed.inset-0"))) await page.click('[title="Настройки"]');
    await tab(t);
    await page.waitForFunction(() => !/читаю|…$/.test(document.querySelector(".fixed.inset-0")?.innerText ?? ""), { timeout: 15000 });
    await shot(`settings-${t.split(" ")[0]}`);
  });
}
await page.keyboard.press("Escape");

await step("правая панель: файлы, действия, сеть, сессии", async () => {
  await page.click("[data-side-toggle]");
  await sleep(400);
  await page.click('[data-side-tab="files"]');
  await sleep(300);
  await shot("files");
  const files = /Файлы · \d+/.test(await text());
  await page.click('[data-side-tab="actions"]');
  await sleep(300);
  const actions = /действий \d+/.test(await text());
  await page.click('[data-side-tab="net"]');
  await page.waitForFunction(() => /цепочка/.test(document.body.innerText), { timeout: 60000 });
  await shot("network");
  const net = !/цепочка\s+dead\s+dead\s+dead/.test(await text());
  await page.click('[data-side-tab="sessions"]');
  await sleep(500);
  const sessions = (await text()).includes("Снимки раскладок") || /снимки раскладок/i.test(await text());
  await page.click('[data-side-tab="files"]');
  await page.click("[data-side-toggle]");
  return files && actions && net && sessions;
});

await step("раскладка 4: поля ввода на одной высоте в каждом ряду", async () => {
  await page.click('[title="Сколько чатов на экране"] button:nth-child(3)');
  await sleep(600);
  const y = await page.$$eval("[data-pane] textarea", (els) => els.map((e) => Math.round(e.getBoundingClientRect().bottom)));
  await shot("layout-4");
  return Math.abs(y[0] - y[1]) <= 2 && Math.abs(y[2] - y[3]) <= 2;
});

await step("раскладка 2 и обратно 1", async () => {
  await page.click('[title="Сколько чатов на экране"] button:nth-child(2)');
  await sleep(400);
  await shot("layout-2");
  await page.click('[title="Сколько чатов на экране"] button:nth-child(1)');
  await sleep(300);
  return (await page.$$eval("[data-pane]", (els) => els.filter((e) => getComputedStyle(e).display !== "none").length)) === 1;
});

await step("уборка: тестовые треды в архив", async () => {
  for (const q of ["столица Италии", "столица Франции"]) {
    const id = await page.evaluate((q) => {
      const row = [...document.querySelectorAll("nav .group\\/t")].find((r) => r.innerText.includes(q));
      row?.querySelector("[data-archive]")?.click();
      return !!row;
    }, q);
    if (id) await sleep(800);
  }
  return !(await page.$eval("nav", (e) => e.innerText)).includes("столица Италии");
});

await step("без ошибок JS", async () => (errors.length ? Promise.reject(new Error(errors.join(" | "))) : true));

console.log(fails ? `\n${fails} FAIL, скриншоты: ${out}` : `\nвсё зелёное, скриншоты: ${out}`);
await browser.close();
process.exit(fails ? 1 : 0);
