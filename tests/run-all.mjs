// Runs every suite one after another in headless Chrome against HUB_URL and prints a summary.
//   node tests/run-all.mjs            all suites
//   node tests/run-all.mjs --quick    skip the ones that spend NeuralDeep image generations or many model turns
//   node tests/run-all.mjs slash agents   only these
// Env as for the single suites (HUB_URL, HUB_EMAIL, HUB_PASS, HUB_SELECTION). Exit code 1 if anything failed.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shots = mkdtempSync(join(tmpdir(), "paddock-tests-"));
// [suite, args, slow]: slow = image generations or many model turns.
const SUITES = [
  ["ui-tour", [join(shots, "tour")], false],
  ["grid-edges", [], false],
  ["layout", [], false],
  ["composer", [], false],
  ["slash", [], false],
  ["workspace", [], false],
  ["lost-messages", [], false],
  ["resilience", [], false],
  ["destructive-approval", [], false],
  ["agents", [join(shots, "agents.png")], true],
  ["images", [join(shots, "image.png")], true],
  ["two-factor", [], false],
];

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const only = args.filter((a) => !a.startsWith("--"));
const plan = SUITES.filter(([name, , slow]) => (only.length ? only.includes(name) : !(quick && slow)));

const results = [];
for (const [name, extra] of plan) {
  const started = Date.now();
  process.stdout.write(`\n▶ ${name}\n`);
  const out = [];
  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [join(here, `${name}.mjs`), ...extra], { env: process.env });
    const pipe = (d) => { out.push(d.toString()); process.stdout.write(d.toString().split("\n").filter((l) => !l.startsWith("PASS")).join("\n")); };
    p.stdout.on("data", pipe);
    p.stderr.on("data", pipe);
    p.on("close", resolve);
  });
  const text = out.join("");
  results.push({ name, ok: code === 0, pass: (text.match(/^PASS/gm) ?? []).length, fail: (text.match(/^FAIL/gm) ?? []).length, s: Math.round((Date.now() - started) / 1000) });
}

console.log("\n────────────────────────────────────────");
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(22)} ${String(r.pass).padStart(3)} pass ${String(r.fail).padStart(2)} fail  ${r.s}s`);
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} suites green, ${results.reduce((a, r) => a + r.pass, 0)} checks passed${bad.length ? `, failed: ${bad.map((r) => r.name).join(", ")}` : ""}`);
console.log(`screenshots: ${shots}`);
process.exit(bad.length ? 1 : 0);
