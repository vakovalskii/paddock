// Крайние случаи сетки окон: границы, перетаскивание, раскладки, перезагрузка, горячие клавиши, узкое окно.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const LANG = process.env.HUB_LANG ?? "ru";
const dir = new URL(".", import.meta.url).pathname;
// Запуск: HUB_URL=http://localhost:8088 HUB_EMAIL=valera@hub.local HUB_PASS=... node tests/grid-edges.mjs (нужен puppeteer-core и Chrome)
const pass = process.env.HUB_PASS;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rect = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const paneRect = (i) => rect(`[data-pane="${i}"]`);
const drag = async (x1, y1, x2, y2) => { await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 5 }); await page.mouse.move(x2, y2, { steps: 5 }); await page.mouse.up(); await sleep(300); };

await page.goto(`${process.env.HUB_URL ?? "http://localhost:8088"}/login`, { waitUntil: "networkidle0" });
await page.evaluate((lang, sel) => {
  localStorage.clear();
  // Язык интерфейса явно: тесты ищут подписи; модель — для тестового пользователя без ChatGPT (HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}').
  localStorage.setItem("paddock.lang", JSON.stringify(lang));
  if (sel) localStorage.setItem("paddock.selection", sel);
}, LANG, process.env.HUB_SELECTION ?? null);
await page.reload({ waitUntil: "networkidle0" });
await page.type("input[name=email]", process.env.HUB_EMAIL ?? "valera@hub.local");
await page.type("input[name=password]", pass);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button")]);
await page.waitForFunction(() => document.body.innerText.includes("Лимиты Codex"), { timeout: 20000 });
await sleep(1000);

// 1. раскладка 4
await page.click('[title="Сколько чатов на экране"] button:nth-child(3)');
await sleep(500);
const r0 = await paneRect(0), r1 = await paneRect(1), r2 = await paneRect(2), r3 = await paneRect(3);
check("4 окна сеткой 2×2", r0.x < r1.x && r0.y < r2.y && Math.abs(r0.w - r1.w) < 3 && Math.abs(r0.h - r2.h) < 3);

// 2. граница по ширине: до упора влево/вправо — 20/80, двойной клик — поровну
const col = await rect('[data-splitter="col"]');
const grid = { x: r0.x, w: r1.x + r1.w - r0.x };
await drag(col.x + 2, col.y + 100, grid.x - 200, col.y + 100);
let a = await paneRect(0), b = await paneRect(1);
check("ширина: упор слева = 20%", Math.abs(a.w / (a.w + b.w) - 0.2) < 0.02, (a.w / (a.w + b.w)).toFixed(3));
let c2 = await rect('[data-splitter="col"]');
await drag(c2.x + 2, c2.y + 100, grid.x + grid.w + 300, c2.y + 100);
a = await paneRect(0); b = await paneRect(1);
check("ширина: упор справа = 80%", Math.abs(a.w / (a.w + b.w) - 0.8) < 0.02, (a.w / (a.w + b.w)).toFixed(3));
c2 = await rect('[data-splitter="col"]');
await page.mouse.click(c2.x + 2, c2.y + 100, { clickCount: 2 });
await sleep(300);
a = await paneRect(0); b = await paneRect(1);
check("ширина: двойной клик = 50%", Math.abs(a.w - b.w) < 3);
c2 = await rect('[data-splitter="col"]');
await drag(c2.x + 2, c2.y + 100, grid.x + grid.w * 0.35, c2.y + 100);
a = await paneRect(0); b = await paneRect(1);
check("ширина: произвольно ~35%", Math.abs(a.w / (a.w + b.w) - 0.35) < 0.03, (a.w / (a.w + b.w)).toFixed(3));
const c = await paneRect(2);
check("нижний ряд следует той же колонке", Math.abs(c.w - a.w) < 3);

// 3. граница по высоте
const row = await rect('[data-splitter="row"]');
await drag(row.x + 300, row.y + 2, row.x + 300, row.y - 2000);
a = await paneRect(0); const d = await paneRect(2);
check("высота: упор вверх = 20%", Math.abs(a.h / (a.h + d.h) - 0.2) < 0.02, (a.h / (a.h + d.h)).toFixed(3));
const row2 = await rect('[data-splitter="row"]');
await page.mouse.click(row2.x + 300, row2.y + 2, { clickCount: 2 });
await sleep(300);

// 4. перетаскивание во время живого хода: окно 0 в правый нижний слот, ход не рвётся
await page.click('[data-pane="0"] textarea');
await page.keyboard.type("Посчитай вслух от 1 до 40 через запятую, без пояснений.");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector('[data-pane="0"] [title="Остановить"]'), { timeout: 15000 });
const grip = await rect('[data-pane="0"] [data-grip]');
const t3 = await paneRect(3);
await drag(grip.x + 5, grip.y + 5, t3.x + t3.w / 2, t3.y + t3.h / 2);
a = await paneRect(0); b = await paneRect(3);
check("перетащили: окно 0 теперь справа снизу", a.x > b.x && a.y > b.y);
await page.waitForFunction(() => !document.querySelector('[data-pane="0"] [title="Остановить"]'), { timeout: 240000 });
const txt = await page.$eval('[data-pane="0"]', (e) => e.innerText);
check("ход в перетащенном окне дошёл до конца", /40/.test(txt) && /1,\s*2/.test(txt));

// 5. бросок на себя и мимо сетки ничего не меняет
const before = await page.evaluate(() => [...document.querySelectorAll("[data-pane]")].map((e) => e.getAttribute("data-slot")).join(","));
const g0 = await rect('[data-pane="0"] [data-grip]');
await drag(g0.x + 5, g0.y + 5, g0.x + 60, g0.y + 80);
await drag(g0.x + 5, g0.y + 5, 5, 5);
const after = await page.evaluate(() => [...document.querySelectorAll("[data-pane]")].map((e) => e.getAttribute("data-slot")).join(","));
check("бросок на своё место / мимо — порядок тот же", before === after, `${before} → ${after}`);

// 6. 4 → 1 → 4: содержимое окон живо
await page.click('[title="Сколько чатов на экране"] button:nth-child(1)');
await sleep(300);
const visible1 = await page.$$eval("[data-pane]", (els) => els.filter((e) => getComputedStyle(e).display !== "none").length);
check("раскладка 1: видно одно окно", visible1 === 1);
await page.click('[title="Сколько чатов на экране"] button:nth-child(3)');
await sleep(300);
const txt2 = await page.$eval('[data-pane="0"]', (e) => e.innerText);
check("4 → 1 → 4: переписка окна на месте", /40/.test(txt2));

// 7. Alt+N — переход по местам сетки
await page.keyboard.down("Alt"); await page.keyboard.press("Digit4"); await page.keyboard.up("Alt");
await sleep(300);
const active4 = await page.$eval('[data-pane="0"] section', (e) => e.className.includes("border-[var(--accent)]"));
check("Alt+4 активирует окно в 4-м месте (это окно 0 после перетаскивания)", active4);

// 8. тред уже открыт в окне — клик в сайдбаре не дублирует, а переключает
await page.keyboard.down("Alt"); await page.keyboard.press("Digit1"); await page.keyboard.up("Alt");
await sleep(200);
const title0 = await page.$eval('[data-pane="0"] header', (e) => e.innerText.split("\n")[0]);
await page.evaluate((t) => [...document.querySelectorAll("nav button")].find((b) => b.innerText.includes(t.slice(0, 20))).click(), title0);
await sleep(800);
const count = await page.$$eval("[data-pane] header", (hs, t) => hs.filter((h) => h.innerText.includes(t.slice(0, 20))).length, title0);
const activeBack = await page.$eval('[data-pane="0"] section', (e) => e.className.includes("border-[var(--accent)]"));
check("повторное открытие треда: без дубля, фокус на его окне", count === 1 && activeBack, `копий: ${count}`);

// 9. перезагрузка: раскладка, порядок, размеры и треды восстановлены
const sizeBefore = (await paneRect(0)).w;
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Лимиты Codex"), { timeout: 20000 });
await sleep(2500);
const r0b = await paneRect(0), r3b = await paneRect(3);
const txt3 = await page.$eval('[data-pane="0"]', (e) => e.innerText);
check("после перезагрузки: 4 окна, окно 0 справа снизу", r0b.x > r3b.x && r0b.y > r3b.y);
check("после перезагрузки: ширины те же", Math.abs(r0b.w - sizeBefore) < 3, `${sizeBefore.toFixed(0)} → ${r0b.w.toFixed(0)}`);
check("после перезагрузки: переписка вернулась из истории", /40/.test(txt3));

// 10. закрыть окно — оно становится пустым «Новый чат», остальные не трогаются
const others = await page.$eval('[data-pane="1"]', (e) => e.innerText.length);
await page.click('[data-pane="0"] [title="Закрыть окно"]');
await sleep(400);
const closed = await page.$eval('[data-pane="0"]', (e) => e.innerText);
check("закрытие окна: пустое", closed.includes("Чем займёмся"));
check("закрытие окна: соседнее не тронуто", (await page.$eval('[data-pane="1"]', (e) => e.innerText.length)) === others);

// 11. тесное окно браузера: нет горизонтальной прокрутки, у окон разумная ширина
await page.setViewport({ width: 1280, height: 720 });
await sleep(400);
const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const minW = Math.min(...(await Promise.all([0, 1, 2, 3].map(async (i) => (await paneRect(i)).w))));
check("1280×720: нет горизонтальной прокрутки", ov <= 0, `лишние ${ov}px`);
check("1280×720: окна не уже 200px", minW >= 200, `мин ${minW.toFixed(0)}px`);
await page.screenshot({ path: "/tmp/grid-edges.png" });

// 12. нижнее правое окно, длинный чат, вставка многострочного текста: пузырь виден сразу и окно едет за ответом.
// Регрессия: после открытия чата окно стояло выше низа, автопрокрутка не включалась — сообщение уходило за край.
const vis3 = () => page.evaluate(() => {
  const el = document.querySelector('[data-pane="3"]');
  const vp = [...el.querySelectorAll("*")].find((x) => x.scrollHeight > x.clientHeight + 20 && getComputedStyle(x).overflowY === "auto");
  const bubble = [...el.querySelectorAll("*")].filter((x) => x.children.length < 3 && x.innerText?.startsWith("Лог для проверки")).at(-1);
  if (!vp || !bubble) return { ok: false, why: vp ? "нет пузыря" : "нет прокрутки" };
  const b = bubble.getBoundingClientRect(), v = vp.getBoundingClientRect();
  return { ok: b.top < v.bottom && b.bottom > v.top, atBottom: vp.scrollHeight - vp.scrollTop - vp.clientHeight < 40 };
});
await page.click('[data-pane="3"] textarea');
await page.keyboard.type("Выведи числа от 1 до 60, каждое на своей строке, без пояснений.");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector('[data-pane="3"] [title="Остановить"]'), { timeout: 20000 });
await page.waitForFunction(() => !document.querySelector('[data-pane="3"] [title="Остановить"]'), { timeout: 240000 });
await page.click('[data-pane="3"] textarea');
await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData("text/plain", "Лог для проверки:\nстрока 1\nстрока 2\nстрока 3\nОтветь одним словом: ок");
  if (document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })))
    document.execCommand("insertText", false, dt.getData("text/plain"));
});
await page.keyboard.press("Enter");
await sleep(250);
const v1 = await vis3();
check("4 окна, нижнее правое: вставленное сообщение видно сразу", v1.ok, v1.why ?? "");
await page.waitForFunction(() => !document.querySelector('[data-pane="3"] [title="Остановить"]'), { timeout: 60000 });
await sleep(1500);
const v2 = await vis3();
check("4 окна, нижнее правое: после ответа окно внизу", v2.atBottom, JSON.stringify(v2));
await page.evaluate(() => [...document.querySelectorAll("nav .group\\/t")].find((r) => r.innerText.includes("Выведи числа от 1 до 60"))?.querySelector("[data-archive]")?.click());
await sleep(800);

check("без ошибок JS на странице", errors.length === 0, errors.join(" | "));
console.log(fails ? `\n${fails} FAIL` : "\nвсё зелёное");
await browser.close();
process.exit(fails ? 1 : 0);
