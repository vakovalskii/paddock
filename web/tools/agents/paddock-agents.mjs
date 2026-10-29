#!/usr/bin/env node
// paddock-agents — lets the agent in one Paddock chat see the other chats of the same user and talk to them.
// It talks to the harness app-server (the same one the web UI uses) over its local websocket, so it only ever
// sees this user's chats. No dependencies (node 22 has WebSocket).
//
//   node paddock-agents.mjs list
//   node paddock-agents.mjs read <id> [--last 6]
//   node paddock-agents.mjs send <id> "message" [--wait] [--timeout 600]
//
// <id> is a full thread id or the 8-character id printed by list (the random tail of the id: thread ids are
// UUIDv7, so their heads repeat for chats created within the same minute). A message to a busy chat is added to its
// running turn (turn/steer), otherwise it starts a new turn. --wait prints the target's final answer.
// Every message carries a hop counter; after MAX_HOPS agent-to-agent messages in a row sending is refused.
import { readFileSync } from "node:fs";

const URL_ = process.env.PADDOCK_APP_SERVER ?? "ws://127.0.0.1:4500";
const SELF = process.env.CODEX_THREAD_ID ?? "";
const MAX_HOPS = 5;
const HEADER = /^\[paddock-agents: from ([0-9a-f-]+)(?: "([^"]*)")?, hop (\d+)(, waiting)?\]/;

const die = (msg) => {
  console.error(`paddock-agents: ${msg}`);
  process.exit(1);
};

let token = "";
try {
  token = readFileSync(process.env.PADDOCK_WS_TOKEN_FILE ?? "/run/secrets/ws-token", "utf8").trim();
} catch {}

const ws = new WebSocket(URL_, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
let seq = 0;
const pending = new Map();
const call = (method, params) =>
  new Promise((ok, fail) => {
    pending.set(++seq, { ok, fail });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: seq, method, params }));
  });
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
ws.onerror = () => die(`cannot reach the harness app-server at ${URL_}`);

const text = (item) => (item.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
const short = (id) => id.replace(/-/g, "").slice(-8);
const oneLine = (s, n = 70) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const statusOf = (t) => (t.status?.type === "active" ? (t.status.activeFlags?.length ? `active (${t.status.activeFlags.join(", ")})` : "active") : t.status?.type ?? "?");

async function loaded() {
  const ids = (await call("thread/loaded/list", {})).data ?? [];
  const threads = await Promise.all(ids.map((id) => call("thread/read", { threadId: id }).then((r) => r.thread, () => null)));
  return threads.filter(Boolean).filter((t) => !t.ephemeral);
}

async function resolve(prefix) {
  const all = await loaded();
  const hits = all.filter((t) => t.id === prefix || short(t.id) === prefix || t.id.startsWith(prefix));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) die(`"${prefix}" matches several chats, use more characters`);
  // Not open anywhere: try the full id directly (resume loads it).
  if (prefix.length >= 32) return call("thread/resume", { threadId: prefix, excludeTurns: true }).then((r) => r.thread, (e) => die(e.message));
  die(`no open chat matches "${prefix}" — run list`);
}

async function lastTurns(id, n) {
  const page = await call("thread/turns/list", { threadId: id, limit: n, sortDirection: "desc", itemsView: "full" });
  return [...page.data].reverse();
}

// The hop of the message that started our own current turn (0 if a person wrote it).
async function myHop() {
  if (!SELF) return 0;
  const [turn] = await lastTurns(SELF, 1).catch(() => []);
  const user = turn?.items?.filter((i) => i.type === "userMessage").pop();
  const m = user && text(user).match(HEADER);
  return m ? Number(m[3]) : 0;
}

// The last thing said in a chat: titles repeat ("hi", "hi", "hi"), the last exchange tells chats apart.
async function lastLine(id) {
  const [turn] = await lastTurns(id, 1).catch(() => []);
  const items = (turn?.items ?? []).filter((i) => (i.type === "agentMessage" && i.text) || i.type === "userMessage");
  const last = items.pop();
  if (!last) return "";
  return last.type === "userMessage" ? `> ${oneLine(text(last), 60)}` : oneLine(last.text, 60);
}

async function list() {
  const all = await loaded();
  if (!all.length) return console.log("no open chats");
  const rows = await Promise.all(all.sort((a, b) => b.updatedAt - a.updatedAt).map(async (t) => [t, await lastLine(t.id)]));
  for (const [t, last] of rows) {
    const who = t.id === SELF ? "  ← you" : t.parentThreadId ? `  (sub-agent of ${short(t.parentThreadId)})` : "";
    console.log(`${short(t.id)}  ${statusOf(t).padEnd(8)}  ${oneLine(t.name ?? t.preview, 40).padEnd(40)}  ${t.cwd}${who}`);
    if (last) console.log(`          last: ${last}`);
  }
}

async function read(prefix, n) {
  const t = await resolve(prefix);
  console.log(`${short(t.id)}  ${statusOf(t)}  ${oneLine(t.name ?? t.preview)}  ${t.cwd}\n`);
  for (const turn of await lastTurns(t.id, n)) {
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
  const me = SELF ? await call("thread/read", { threadId: SELF }).then((r) => oneLine(r.thread.name ?? r.thread.preview, 40).replace(/"/g, "'"), () => "") : "";
  const header = `[paddock-agents: from ${SELF || "unknown"}${me ? ` "${me}"` : ""}, hop ${hop}${wait ? ", waiting" : ""}]`;
  const hint = wait
    ? "The sender is waiting for your final answer: just answer, do not send a message back."
    : `To answer, run: paddock-agents send ${short(SELF)} "…"`;
  const input = [{ type: "text", text: `${header}\n${hint}\n\n${body}`, text_elements: [] }];

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
    await new Promise((r) => setTimeout(r, 2000));
    const turns = await lastTurns(t.id, 3);
    const turn = turns.find((x) => x.id === turnId);
    if (turn && turn.status !== "inProgress") {
      const answer = (turn.items ?? []).filter((i) => i.type === "agentMessage" && i.text).pop()?.text;
      console.log(`\nanswer from ${short(t.id)} (${turn.status}):\n\n${answer ?? "(no text answer)"}`);
      return;
    }
  }
  console.log(`\nno answer within ${timeoutS}s; check later with: paddock-agents read ${short(t.id)}`);
}

ws.onopen = async () => {
  try {
    await call("initialize", { clientInfo: { name: "paddock-agents", version: "1" }, capabilities: { experimentalApi: true } });
    const [cmd, ...rest] = process.argv.slice(2);
    const flag = (name, def) => {
      const i = rest.indexOf(name);
      if (i < 0) return def;
      const v = rest[i + 1];
      rest.splice(i, v && !v.startsWith("--") ? 2 : 1);
      return v && !v.startsWith("--") ? v : true;
    };
    if (cmd === "list") await list();
    else if (cmd === "read") {
      const n = Number(flag("--last", 6));
      if (!rest[0]) die("usage: read <id> [--last 6]");
      await read(rest[0], n);
    } else if (cmd === "send") {
      const wait = flag("--wait", false) === true;
      const timeout = Number(flag("--timeout", 600));
      if (!rest[0]) die('usage: send <id> "message" [--wait] [--timeout 600]');
      await send(rest[0], rest.slice(1).join(" "), wait, timeout);
    } else die('usage: list | read <id> [--last 6] | send <id> "message" [--wait]');
    process.exit(0);
  } catch (e) {
    die(e.message);
  }
};
