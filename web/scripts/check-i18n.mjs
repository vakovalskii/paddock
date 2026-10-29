// Every t("…") key in the UI must have a Russian translation in lib/i18n/*.ts, otherwise the Russian UI shows English.
// Only literal keys are checked; t(variable) is the caller's job. Run: node scripts/check-i18n.mjs (from web/).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dict = new Set();
for (const f of readdirSync("lib/i18n")) {
  const src = readFileSync(join("lib/i18n", f), "utf8");
  for (const m of src.matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)) dict.add(JSON.parse(`"${m[1]}"`));
}
const files = ["app/login/page.tsx", "lib/format.ts", "lib/messages.ts", "lib/tools.ts", ...readdirSync("components").map((f) => join("components", f))];
const missing = [];
const russian = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\b(?:t|tr)\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    const key = JSON.parse(`"${m[1]}"`);
    if (/[A-Za-z]/.test(key) && !dict.has(key)) missing.push(`${f}: ${key}`);
  }
  // Source strings are English: Russian belongs in lib/i18n only.
  src.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
    if (/[А-Яа-яЁё]/.test(code) && !/^\s*\*/.test(code)) russian.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
}
if (missing.length) console.error(`${missing.length} keys without a Russian translation:\n` + missing.join("\n"));
if (russian.length) console.error(`${russian.length} lines with Russian outside lib/i18n and comments:\n` + russian.join("\n"));
if (missing.length || russian.length) process.exit(1);
console.log(`i18n ok: ${dict.size} translations`);
