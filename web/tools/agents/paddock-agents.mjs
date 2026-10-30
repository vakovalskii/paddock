#!/usr/bin/env node
// paddock-agents — lets one agent see the user's other agents and talk to them, whatever harness runs them.
// Two transports, picked per target:
//   codex  Paddock chats: the harness app-server (the same one the web UI uses) over its local websocket, so it
//          only ever sees this user's chats. Ids are the 8-character tail of the thread id.
//   tmux   any agent in a tmux pane (Claude Code, Codex CLI, Gemini CLI…): list = panes not running a bare shell,
//          read = capture-pane, send = bracketed paste + Enter. Ids are tmux pane ids (%3).
// No dependencies (node 22 has WebSocket).
//
//   node paddock-agents.mjs list [--all]
//   node paddock-agents.mjs read <id> [--last 6] [--lines 80]
//   node paddock-agents.mjs send <id> "message" [--wait] [--timeout 600]
//   node paddock-agents.mjs reply <msg> "answer"
//   node paddock-agents.mjs skill
//
// A message to a busy Codex chat is added to its running turn (turn/steer), otherwise it starts a new turn.
// --wait prints the target's final answer: Codex reports it as the turn ends; a tmux agent is asked to run
// `reply <msg> "…"`, which writes the answer to a file the sender polls.
// Every message is also logged as markdown to $PADDOCK_AGENTS_DIR/messages (default ~/.paddock-agents), any harness
// can read it. Every message carries a hop counter; after MAX_HOPS agent-to-agent messages in a row sending is refused.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const URL_ = process.env.PADDOCK_APP_SERVER ?? "ws://127.0.0.1:4500";
const DIR = process.env.PADDOCK_AGENTS_DIR ?? join(homedir(), ".paddock-agents");
const BIN = process.argv[1];
const MAX_HOPS = 5;
// A tmux agent has no turn history to read the hop from, so its hop comes from the last message logged to it,
// if that message is recent enough to have started what it is doing now.
const HOP_WINDOW_MS = 10 * 60 * 1000;
const SHELLS = new Set(["zsh", "bash", "sh", "fish", "dash", "ksh", "tcsh", "nu", "login", "tmux"]);
const SEP = " |pa| ";
const HEADER = /^\[paddock-agents: from ([^\s,"]+)(?: "([^"]*)")?, hop (\d+)(, waiting)?(?:, msg ([0-9a-f]+))?\]/;

const die = (msg) => {
  console.error(`paddock-agents: ${msg}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (id) => id.replace(/-/g, "").slice(-8);
const oneLine = (s, n = 70) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// ---- codex: the harness app-server ----

let ws = null;
let seq = 0;
const pending = new Map();
const call = (method, params) =>
  new Promise((ok, fail) => {
    pending.set(++seq, { ok, fail });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: seq, method, params }));
  });

// Connects if an app-server is there; outside Paddock there usually is none and only tmux is used.
async function connectCodex() {
  let token = null;
  try {
    token = readFileSync(process.env.PADDOCK_WS_TOKEN_FILE ?? "/run/secrets/ws-token", "utf8").trim();
  } catch {}
  const inPaddock = token != null || process.env.PADDOCK_APP_SERVER != null;
  const sock = new WebSocket(URL_, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  const open = await Promise.race([
    new Promise((r) => {
      sock.onopen = () => r(true);
      sock.onerror = () => r(false);
    }),
    sleep(1500).then(() => false),
  ]);
  if (!open) {
    try { sock.close(); } catch {}
    if (inPaddock) die(`cannot reach the harness app-server at ${URL_}`);
    return false;
  }
  ws = sock;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id != null && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result);
    } else if (m.id != null && m.method) {
      // A server request (approval etc.) for a thread we touched: not ours to answer, the user's UI answers it.
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "handled by the Paddock UI" } }));
    }
  };
  ws.onerror = () => die(`lost the harness app-server at ${URL_}`);
  const init = call("initialize", { clientInfo: { name: "paddock-agents", version: "2" }, capabilities: { experimentalApi: true } });
  return Promise.race([init.then(() => true, () => false), sleep(3000).then(() => false)]);
}

const text = (item) => (item.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
const statusOf = (t) => (t.status?.type === "active" ? (t.status.activeFlags?.length ? `active (${t.status.activeFlags.join(", ")})` : "active") : t.status?.type ?? "?");

async function loaded() {
  if (!ws) return [];
  const ids = (await call("thread/loaded/list", {})).data ?? [];
  const threads = await Promise.all(ids.map((id) => call("thread/read", { threadId: id }).then((r) => r.thread, () => null)));
  return threads.filter(Boolean).filter((t) => !t.ephemeral);
}

async function lastTurns(id, n) {
  const page = await call("thread/turns/list", { threadId: id, limit: n, sortDirection: "desc", itemsView: "full" });
  return [...page.data].reverse();
}

// The last thing said in a chat: titles repeat ("hi", "hi", "hi"), the last exchange tells chats apart.
async function lastLine(id) {
  const [turn] = await lastTurns(id, 1).catch(() => []);
  const items = (turn?.items ?? []).filter((i) => (i.type === "agentMessage" && i.text) || i.type === "userMessage");
  const last = items.pop();
  if (!last) return "";
  return last.type === "userMessage" ? `> ${oneLine(text(last), 60)}` : oneLine(last.text, 60);
}

// ---- tmux: any agent in a terminal pane ----

const tmux = (args, input) => execFileSync("tmux", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });

function panes(all) {
  let out = "";
  try {
    // Not a tab: without a UTF-8 locale tmux prints control characters as "_".
    out = tmux(["list-panes", "-a", "-F", ["#{pane_id}", "#{pane_current_command}", "#{session_name}:#{window_index}.#{pane_index}", "#{pane_current_path}", "#{pane_title}"].join(SEP)]);
  } catch {
    return []; // no tmux, or no server running
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [id, cmd, where, cwd, ...title] = l.split(SEP);
      return { id, cmd, where, cwd, title: title.join(SEP) };
    })
    .filter((p) => all || !SHELLS.has(p.cmd) || p.id === process.env.TMUX_PANE);
}

function capture(id, lines) {
  const out = tmux(["capture-pane", "-p", "-J", "-t", id, "-S", `-${lines}`]);
  return out.replace(/\s+$/, "");
}

// Bracketed paste keeps a multi-line message in one prompt (TUIs submit on a bare newline), then Enter submits it.
async function paste(id, body, msg) {
  const buf = `paddock-agents-${msg}`;
  tmux(["load-buffer", "-b", buf, "-"], body);
  tmux(["paste-buffer", "-p", "-d", "-b", buf, "-t", id]);
  await sleep(400);
  tmux(["send-keys", "-t", id, "Enter"]);
}

// ---- shared message log ----

function logMessage(m) {
  try {
    mkdirSync(join(DIR, "messages"), { recursive: true });
    const at = new Date().toISOString();
    const head = Object.entries({ msg: m.msg, from: m.from, to: m.to, transport: m.transport, hop: m.hop, waiting: m.wait, at })
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");
    writeFileSync(join(DIR, "messages", `${at.replace(/[:.]/g, "-")}-${m.msg}.md`), `---\n${head}\n---\n\n${m.body}\n`);
  } catch {} // the log is a convenience, delivery does not depend on it
}

function loggedTo(id) {
  let files = [];
  try {
    files = readdirSync(join(DIR, "messages")).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return null;
  }
  for (const f of files.reverse()) {
    const head = readFileSync(join(DIR, "messages", f), "utf8").split("\n---")[0];
    const field = (k) => JSON.parse(head.match(new RegExp(`^${k}: (.*)$`, "m"))?.[1] ?? "null");
    if (field("to") === id) return { hop: field("hop"), at: Date.parse(field("at")) };
  }
  return null;
}

// ---- who am I ----

let SELF = "";
async function myHop() {
  if (!SELF) return 0;
  if (ws && !SELF.startsWith("%")) {
    const [turn] = await lastTurns(SELF, 1).catch(() => []);
    const user = turn?.items?.filter((i) => i.type === "userMessage").pop();
    const m = user && text(user).match(HEADER);
    return m ? Number(m[3]) : 0;
  }
  const last = loggedTo(SELF);
  return last && Date.now() - last.at < HOP_WINDOW_MS ? last.hop : 0;
}

// ---- commands ----

async function resolve(prefix) {
  if (prefix.startsWith("%")) {
    const p = panes(true).find((x) => x.id === prefix);
    return p ? { transport: "tmux", id: p.id, pane: p } : die(`no tmux pane ${prefix} — run list`);
  }
  if (!ws) die(`no open chat matches "${prefix}" — run list`);
  const all = await loaded();
  const hits = all.filter((t) => t.id === prefix || short(t.id) === prefix || t.id.startsWith(prefix));
  if (hits.length > 1) die(`"${prefix}" matches several chats, use more characters`);
  if (hits.length === 1) return { transport: "codex", id: hits[0].id, thread: hits[0] };
  // Not open anywhere: try the full id directly (resume loads it).
  if (prefix.length >= 32)
    return call("thread/resume", { threadId: prefix, excludeTurns: true }).then((r) => ({ transport: "codex", id: r.thread.id, thread: r.thread }), (e) => die(e.message));
  die(`no open chat matches "${prefix}" — run list`);
}

async function list(all) {
  const threads = await loaded();
  const rows = await Promise.all(threads.sort((a, b) => b.updatedAt - a.updatedAt).map(async (t) => [t, await lastLine(t.id)]));
  for (const [t, last] of rows) {
    const who = t.id === SELF ? "  ← you" : t.parentThreadId ? `  (sub-agent of ${short(t.parentThreadId)})` : "";
    console.log(`${short(t.id)}  ${statusOf(t).padEnd(8)}  ${oneLine(t.name ?? t.preview, 40).padEnd(40)}  ${t.cwd}${who}`);
    if (last) console.log(`          last: ${last}`);
  }
  const ps = panes(all);
  for (const p of ps) {
    const who = p.id === SELF ? "  ← you" : "";
    console.log(`${p.id.padEnd(8)}  ${p.cmd.padEnd(8)}  ${oneLine(p.title, 40).padEnd(40)}  ${p.cwd}  (tmux ${p.where})${who}`);
  }
  if (!rows.length && !ps.length) console.log("no other agents found (no Paddock chats, no tmux panes running an agent)");
}

async function read(prefix, turns, lines) {
  const t = await resolve(prefix);
  if (t.transport === "tmux") {
    console.log(`${t.id}  ${t.pane.cmd}  ${oneLine(t.pane.title)}  ${t.pane.cwd}\n`);
    return console.log(capture(t.id, lines));
  }
  console.log(`${short(t.id)}  ${statusOf(t.thread)}  ${oneLine(t.thread.name ?? t.thread.preview)}  ${t.thread.cwd}\n`);
  for (const turn of await lastTurns(t.id, turns)) {
    for (const item of turn.items ?? []) {
      if (item.type === "userMessage") console.log(`> ${text(item)}\n`);
      else if (item.type === "agentMessage" && item.text) console.log(`${item.text}\n`);
    }
    if (turn.status === "inProgress") console.log("(still working…)\n");
  }
}

async function send(prefix, body, wait, timeoutS) {
  if (!body) die("empty message");
  const t = await resolve(prefix);
  if (t.id === SELF) die("that is your own chat");
  const hop = (await myHop()) + 1;
  if (hop > MAX_HOPS) die(`${MAX_HOPS} agent-to-agent messages in a row; stop and report to the user instead`);
  const msg = randomBytes(4).toString("hex");
  const me = SELF && ws && !SELF.startsWith("%") ? await call("thread/read", { threadId: SELF }).then((r) => oneLine(r.thread.name ?? r.thread.preview, 40).replace(/"/g, "'"), () => "") : "";
  const from = SELF ? (SELF.startsWith("%") ? SELF : short(SELF)) : "unknown";
  // Codex replies come back through the turn itself; a tmux agent needs the msg id to reply to.
  const tag = t.transport === "tmux" ? `, msg ${msg}` : "";
  const header = `[paddock-agents: from ${SELF || "unknown"}${me ? ` "${me}"` : ""}, hop ${hop}${wait ? ", waiting" : ""}${tag}]`;
  const hint = !wait
    ? `To answer, run: node ${BIN} send ${from} "…"`
    : t.transport === "tmux"
      ? `The sender is waiting for your answer: when you are done, run: node ${BIN} reply ${msg} "your final answer"`
      : "The sender is waiting for your final answer: just answer, do not send a message back.";
  const full = `${header}\n${hint}\n\n${body}`;
  logMessage({ msg, from: SELF || "unknown", to: t.id, transport: t.transport, hop, wait, body });

  if (t.transport === "tmux") {
    await paste(t.id, full, msg);
    console.log(`sent to ${t.id}`);
    if (!wait) return;
    const file = join(DIR, "replies", `${msg}.md`);
    const deadline = Date.now() + timeoutS * 1000;
    while (Date.now() < deadline) {
      await sleep(1000);
      let answer = null;
      try {
        answer = readFileSync(file, "utf8").split(/\n---\n\n/).slice(1).join("\n---\n\n").trim();
      } catch {}
      if (answer != null) return console.log(`\nanswer from ${t.id} (replied):\n\n${answer}`);
    }
    return console.log(`\nno answer within ${timeoutS}s; check later with: node ${BIN} read ${t.id}`);
  }

  const input = [{ type: "text", text: full, text_elements: [] }];
  let turnId;
  const [cur] = await lastTurns(t.id, 1).catch(() => []);
  if (cur?.status === "inProgress") {
    turnId = (await call("turn/steer", { threadId: t.id, input, expectedTurnId: cur.id })).turnId;
    console.log(`added to the running turn of ${short(t.id)}`);
  } else {
    await call("thread/resume", { threadId: t.id, excludeTurns: true }).catch(() => {});
    turnId = (await call("turn/start", { threadId: t.id, input })).turn.id;
    console.log(`sent to ${short(t.id)}`);
  }
  if (!wait) return;

  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const turns = await lastTurns(t.id, 3);
    const turn = turns.find((x) => x.id === turnId);
    if (turn && turn.status !== "inProgress") {
      const answer = (turn.items ?? []).filter((i) => i.type === "agentMessage" && i.text).pop()?.text;
      console.log(`\nanswer from ${short(t.id)} (${turn.status}):\n\n${answer ?? "(no text answer)"}`);
      return;
    }
  }
  console.log(`\nno answer within ${timeoutS}s; check later with: node ${BIN} read ${short(t.id)}`);
}

function reply(msg, body) {
  if (!/^[0-9a-f]{8}$/.test(msg ?? "")) die('usage: reply <msg> "answer" (msg is the 8-character id from the message header)');
  if (!body) die("empty answer");
  mkdirSync(join(DIR, "replies"), { recursive: true });
  writeFileSync(join(DIR, "replies", `${msg}.md`), `---\nmsg: "${msg}"\nfrom: ${JSON.stringify(SELF || "unknown")}\nat: "${new Date().toISOString()}"\n---\n\n${body}\n`);
  console.log(`replied to ${msg}`);
}

// The skill with this command's path filled in, for installing outside Paddock (~/.claude/skills, ~/.codex/skills).
function skill() {
  try {
    process.stdout.write(readFileSync(join(dirname(BIN), "SKILL.md"), "utf8").replaceAll("{{BIN}}", BIN));
  } catch {
    die("SKILL.md is not next to this command");
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, def) => {
  const i = rest.indexOf(name);
  if (i < 0) return def;
  const v = rest[i + 1];
  rest.splice(i, v && !v.startsWith("--") ? 2 : 1);
  return v && !v.startsWith("--") ? v : true;
};
try {
  if (cmd === "skill") skill();
  else if (cmd === "reply") {
    SELF = process.env.TMUX_PANE ?? process.env.CODEX_THREAD_ID ?? "";
    reply(rest[0], rest.slice(1).join(" "));
  } else if (["list", "read", "send"].includes(cmd)) {
    const codex = await connectCodex();
    SELF = (codex && process.env.CODEX_THREAD_ID) || process.env.TMUX_PANE || process.env.CODEX_THREAD_ID || "";
    if (cmd === "list") await list(flag("--all", false) === true);
    else if (cmd === "read") {
      const turns = Number(flag("--last", 6));
      const lines = Number(flag("--lines", 80));
      if (!rest[0]) die("usage: read <id> [--last 6] [--lines 80]");
      await read(rest[0], turns, lines);
    } else {
      const wait = flag("--wait", false) === true;
      const timeout = Number(flag("--timeout", 600));
      if (!rest[0]) die('usage: send <id> "message" [--wait] [--timeout 600]');
      await send(rest[0], rest.slice(1).join(" "), wait, timeout);
    }
  } else die('usage: list [--all] | read <id> [--last 6] [--lines 80] | send <id> "message" [--wait] | reply <msg> "answer" | skill');
  process.exit(0);
} catch (e) {
  die(e.message);
}
