// paddock-agents over tmux, no model and no Paddock: a private tmux server (its own TMUX_TMPDIR) with three scripted
// "agents" (one of them sitting on an approval prompt) and a bare shell. Checks list (shells hidden, "← you"), send with a multi-line message, read, --wait with
// reply, the markdown message log, refusals to type into a shell or an approval prompt, and the hop limit.
// Run: node tests/agents-tmux.mjs   (needs tmux)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../web/tools/agents/paddock-agents.mjs");
const root = mkdtempSync(join(tmpdir(), "paddock-agents-"));
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMUX_TMPDIR: root, PADDOCK_AGENTS_DIR: join(root, "bus"), PADDOCK_WS_TOKEN_FILE: join(root, "none") };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const tmux = (...a) => execFileSync("tmux", a, { env, encoding: "utf8" });
// The CLI as the agent in pane %0 would run it.
const cli = (...a) => {
  try {
    return execFileSync(process.execPath, [BIN, ...a], { env: { ...env, TMUX_PANE: "%0" }, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    return `EXIT ${e.status}\n${e.stdout}${e.stderr}`;
  }
};

// A fake agent: prints what it receives; if asked to reply, replies with the command the message names.
const fake = join(root, "fake-agent.mjs");
writeFileSync(fake, `
import { execSync } from "node:child_process";
process.stdout.write(process.argv[2] === "asking" ? "Run rm -rf build?\\nDo you want to proceed?\\n❯ 1. Yes\\n  2. No\\n" : "fake agent ready\\n");
let buf = "", timer;
process.stdin.on("data", (d) => {
  buf += d;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const got = buf; buf = "";
    process.stdout.write("RECEIVED " + got.trim().split(/\\r?\\n/).length + " lines: " + got.trim().split(/\\r?\\n/).pop() + "\\n");
    const m = got.match(/run: (node \\S+ reply [0-9a-f]{8})/);
    if (m) execSync(m[1] + ' "answer 4"', { stdio: "inherit" });
  }, 600);
});
`);

tmux("new-session", "-d", "-s", "t", "-x", "200", "-y", "50", `exec ${process.execPath} ${fake}`);
tmux("split-window", "-t", "t", `exec ${process.execPath} ${fake}`);
tmux("split-window", "-t", "t", "exec sh");
tmux("split-window", "-t", "t", `exec ${process.execPath} ${fake} asking`);
tmux("select-layout", "-t", "t", "tiled");
await sleep(1500);

// 1. list: the two agents, not the shell; the caller is marked.
const listed = cli("list");
check("list: shows the other agent", /^%1\s+node/m.test(listed), listed.trim().split("\n").join(" | "));
check("list: marks the caller", /^%0 .*← you/m.test(listed));
check("list: hides a bare shell", !/^%2/m.test(listed));
check("list --all: shows the shell", /^%2/m.test(cli("list", "--all")));

// 2. send a multi-line message: it arrives as one prompt.
const sent = cli("send", "%1", "first line\nsecond line");
check("send: delivered", /sent to %1/.test(sent), sent.trim());
await sleep(1500);
const pane = cli("read", "%1");
check("read: header with sender and hop", /\[paddock-agents: from %0, hop 1, msg [0-9a-f]{8}\]/.test(pane));
check("send: multi-line arrives as one message", /RECEIVED 5 lines: second line/.test(pane), pane.split("\n").filter((l) => l.startsWith("RECEIVED")).join(" | "));

// 3. --wait: the receiver runs reply, the sender prints the answer.
const asked = cli("send", "%1", "what is 2+2", "--wait", "--timeout", "20");
check("--wait: answer comes back through reply", /answer from %1 \(replied\):\n\nanswer 4/.test(asked), asked.trim().split("\n").pop());

// 4. The markdown log has both messages.
const logged = readdirSync(join(root, "bus", "messages")).map((f) => readFileSync(join(root, "bus", "messages", f), "utf8"));
check("log: one markdown file per message", logged.length === 2 && logged.every((m) => /^---\nmsg: "[0-9a-f]{8}"\nfrom: "%0"\nto: "%1"\ntransport: "tmux"/.test(m)));

// 5. Never type into a shell or into a pending approval.
check("shell pane: refused", /runs a shell/.test(cli("send", "%2", "echo pwned")));
check("approval prompt: refused", /waiting for the user to approve/.test(cli("send", "%3", "hi")));

// 6. Hop limit: the caller's last incoming message was hop 5, so it may not send a sixth.
mkdirSync(join(root, "bus", "messages"), { recursive: true });
writeFileSync(join(root, "bus", "messages", "9999-hop.md"), `---\nmsg: "00000000"\nfrom: "%1"\nto: "%0"\ntransport: "tmux"\nhop: 5\nwaiting: false\nat: "${new Date().toISOString()}"\n---\n\nhi\n`);
const refused = cli("send", "%1", "one more");
check("hop limit: sixth hop refused", /EXIT 1/.test(refused) && /5 agent-to-agent messages/.test(refused));

// 7. Errors.
check("unknown pane: clear error", /no tmux pane %9/.test(cli("send", "%9", "hi")));
check("own pane: refused", /your own chat/.test(cli("send", "%0", "hi")));
check("skill: path filled in", cli("skill").includes(`node ${BIN} list`));

tmux("kill-server");
rmSync(root, { recursive: true, force: true });
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
