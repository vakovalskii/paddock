// Перевод тредов и событий Codex в сообщения для assistant-ui.
// Один ход Codex = сообщение пользователя + одно сообщение ассистента со всеми частями хода.
import type { ThreadMessageLike } from "@assistant-ui/react";
import { t as tr } from "./i18n";

export type ToolKind = "shell" | "read" | "search" | "list" | "patch" | "mcp" | "web" | "tool" | "agent";
export type WebLink = { title: string; url: string | null; domain: string | null; snippet: string | null };
export type FileEdit = { path: string; kind: "add" | "delete" | "update"; diff: string };
export type ToolArgs = { kind: ToolKind; title: string; durationMs: number | null; diff: boolean; verb?: string; links?: WebLink[]; files?: FileEdit[]; expand?: boolean };

export type Part =
  | { type: "text"; itemId: string; text: string }
  | { type: "reasoning"; itemId: string; text: string }
  | { type: "tool-call"; itemId: string; toolName: string; argsText: string; args: ToolArgs; result?: string; isError?: boolean }
  // Картинка в сообщении пользователя (вставка из буфера → localImage); путь в доме харнесса.
  | { type: "image"; itemId: string; path: string };

// Что известно о ходе: какой моделью отвечали, сколько шёл. Модель в истории Codex не хранится,
// поэтому её запоминаем сами (localStorage), а для старых ходов берём модель треда.
// outTokens — сумма выходных токенов всех вызовов модели за ход и ttftMs — время до первого токена (для скорости под ответом);
// usage — последний расход (контекст, кеш): Codex его при открытии чата не отдаёт.
export type TurnMeta = { model?: string | null; effort?: string | null; durationMs?: number | null; startedAt?: number; outTokens?: number; ttftMs?: number; usage?: unknown };

// Действие агента для ленты в правой панели (как Agent actions в agentbelt): что делал, сколько шло, упало ли.
export type Action = { id: string; kind: ToolKind; title: string; ok: boolean | null; durationMs: number | null; output: string; diff: string; at: number | null };

export function actionsOf(messages: Msg[], seen: Record<string, number>): Action[] {
  const out: Action[] = [];
  for (const m of messages)
    for (const p of m.parts)
      if (p.type === "tool-call")
        out.push({
          id: p.itemId,
          kind: p.args.kind,
          title: p.args.title,
          ok: p.result === undefined ? null : !p.isError,
          durationMs: p.args.durationMs,
          output: (p.result ?? "").slice(0, 4000),
          diff: (p.args.files ?? []).map((f) => `@@ ${f.path}\n${f.diff}`).join("\n").slice(0, 8000),
          at: seen[p.itemId] ?? null,
        });
  return out;
}

export type Msg = { id: string; role: "user" | "assistant"; turnId: string; parts: Part[]; running?: boolean; meta?: TurnMeta };

const tool = (item: any, kind: ToolKind, title: string, extra: Partial<Part & { type: "tool-call" }> = {}): Part => ({
  type: "tool-call",
  itemId: item.id,
  toolName: kind,
  argsText: title,
  args: { kind, title, durationMs: item.durationMs ?? null, diff: kind === "patch" },
  ...extra,
});

// "/bin/bash -lc 'ls -la'" → "ls -la"
function bareCommand(cmd: string): string {
  const m = cmd.match(/^(?:\S*\/)?(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/);
  return m ? m[2] : cmd;
}

// A message between chats (paddock-agents): the header the CLI puts on it, and the hint line under it.
const AGENT_HEADER = /^\[paddock-agents: from ([0-9a-f-]+|unknown)(?: "([^"]*)")?, hop \d+(?:, waiting)?\]\n(?:(?:The sender is waiting|To answer, run)[^\n]*\n)?\n?/;
export function agentMessage(text: string): { from: { id: string; title: string | null }; text: string } | null {
  const m = text.match(AGENT_HEADER);
  return m ? { from: { id: m[1], title: m[2] ?? null }, text: text.slice(m[0].length) } : null;
}

// paddock-agents calls read as a conversation, not as a shell command: who was asked what, and the answer.
function agentsPart(item: any, verb: string, rest: string, extra: { result?: string; isError: boolean; argsText: string }): Part {
  const out = item.aggregatedOutput ?? "";
  if (verb === "send") {
    const m = rest.match(/^(\S+)\s+(['"])([\s\S]*?)\2/) ?? rest.match(/^(\S+)\s+(\S[\s\S]*?)(?:\s+--|$)/);
    const id = m?.[1] ?? "";
    const text = (m?.[3] ?? m?.[2] ?? "").trim();
    const answer = out.match(/answer from \S+ \([^)]*\):\n\n([\s\S]*)$/)?.[1]?.trim();
    const p = tool(item, "agent", `${id}: ${text.split("\n")[0]}`, {
      argsText: text,
      result: item.status === "inProgress" ? undefined : extra.isError ? out : answer ?? tr("delivered"),
      isError: extra.isError,
    });
    if (p.type === "tool-call") p.args = { ...p.args, verb: tr("Message to"), expand: true };
    return p;
  }
  const p = tool(item, "agent", verb === "read" ? rest.split(/\s/)[0] : "", { ...extra, argsText: "" });
  if (p.type === "tool-call") p.args = { ...p.args, verb: verb === "read" ? tr("Read chat") : tr("Open chats") };
  return p;
}

function commandPart(item: any): Part {
  const actions: any[] = item.commandActions ?? [];
  const cmd = bareCommand(item.command ?? "");
  const exit = item.exitCode == null ? "" : `\n[exit ${item.exitCode}]`;
  const result = item.aggregatedOutput == null ? (item.exitCode == null ? undefined : exit.trim()) : item.aggregatedOutput + exit;
  const extra = { result, isError: item.exitCode != null && item.exitCode !== 0, argsText: cmd };
  const agents = cmd.match(/paddock-agents(?:\.mjs)?\s+(list|read|send)\b\s*([\s\S]*)$/);
  if (agents) return agentsPart(item, agents[1], agents[2], extra);
  const only = (t: string) => actions.length > 0 && actions.every((a) => a.type === t);
  if (only("read")) return tool(item, "read", actions.map((a) => a.name ?? a.path).join(", "), extra);
  if (only("search")) return tool(item, "search", actions.map((a) => [a.query, a.path && tr("in {path}", { path: a.path })].filter(Boolean).join(" ")).join(", "), extra);
  if (only("listFiles")) return tool(item, "list", actions.map((a) => a.path ?? ".").join(", "), extra);
  return tool(item, "shell", cmd.split("\n")[0], extra);
}

function mcpText(result: any): string | undefined {
  if (result == null) return undefined;
  const texts = (result.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text);
  return texts.length ? texts.join("\n") : JSON.stringify(result, null, 2);
}

export function itemToPart(item: any): Part | null {
  switch (item.type) {
    case "agentMessage":
      return { type: "text", itemId: item.id, text: item.text ?? "" };
    case "plan":
      return { type: "text", itemId: item.id, text: item.text ?? "" };
    case "reasoning":
      return { type: "reasoning", itemId: item.id, text: (item.summary ?? []).join("\n\n") };
    case "contextCompaction":
      return { type: "reasoning", itemId: item.id, text: tr("Context compacted") };
    case "commandExecution":
      return commandPart(item);
    case "fileChange": {
      const changes: any[] = item.changes ?? [];
      const verb = (k: any) => ({ add: "+", delete: "−", update: "~" })[(k?.type ?? k) as string] ?? "~";
      const p = tool(item, "patch", changes.map((c) => `${verb(c.kind)} ${c.path}`).join(", "), {
        argsText: changes.map((c) => c.path).join("\n"),
        result: item.status === "inProgress" ? undefined : changes.map((c) => c.diff).join("\n"),
        isError: item.status === "failed" || item.status === "declined",
      });
      if (p.type === "tool-call" && item.status !== "failed" && item.status !== "declined")
        p.args = { ...p.args, files: changes.map((c) => ({ path: c.path, kind: c.kind?.type ?? c.kind ?? "update", diff: c.diff ?? "" })) };
      return p;
    }
    case "mcpToolCall":
      return tool(item, "mcp", `${item.server}.${item.tool}`, {
        argsText: JSON.stringify(item.arguments ?? {}, null, 2),
        result: item.error ? item.error.message : mcpText(item.result),
        isError: !!item.error,
      });
    case "dynamicToolCall":
      return tool(item, "tool", item.tool, {
        argsText: JSON.stringify(item.arguments ?? {}, null, 2),
        result: item.contentItems == null ? undefined : JSON.stringify(item.contentItems, null, 2),
        isError: item.success === false,
      });
    case "webSearch": {
      const a = item.action ?? {};
      const verb = a.type === "openPage" ? "Open" : a.type === "findInPage" ? "Find" : "Search";
      const title = a.type === "openPage" ? a.url : a.type === "findInPage" ? tr("{pattern} in {url}", { pattern: a.pattern ?? "", url: a.url ?? "" }) : a.query ?? a.queries?.join(", ") ?? item.query;
      const links: WebLink[] = (item.results ?? []).map((r: any) => ({ title: r.title ?? r.url ?? "", url: r.url ?? null, domain: r.domain ?? null, snippet: r.snippet ?? null }));
      const p = tool(item, "web", title ?? item.query ?? "", { result: item.results == null ? undefined : `${links.length}` });
      if (p.type === "tool-call") p.args = { ...p.args, verb, links };
      return p;
    }
    // Sub-agents (multi_agent): spawn, message, wait, list… The card shows the prompt and each target's last state.
    case "collabAgentToolCall": {
      const states = Object.entries(item.agentsStates ?? {}) as [string, { status: string; message: string | null }][];
      const first = (item.prompt ?? "").split("\n")[0];
      return tool(item, "agent", [item.tool, first].filter(Boolean).join(" · "), {
        argsText: [item.prompt, item.model && `model: ${item.model}${item.reasoningEffort ? ` ${item.reasoningEffort}` : ""}`].filter(Boolean).join("\n\n"),
        result: item.status === "inProgress" ? undefined : states.map(([id, st]) => `${id.slice(0, 8)} ${st.status}${st.message ? `: ${st.message}` : ""}`).join("\n") || item.status,
        isError: item.status === "failed",
      });
    }
    // /review: the request and the finished review.
    case "enteredReviewMode":
      return { type: "reasoning", itemId: item.id, text: tr("Reviewing: {what}", { what: item.review ?? "" }) };
    case "exitedReviewMode":
      return { type: "text", itemId: item.id, text: item.review ?? "" };
    case "subAgentActivity":
      return tool(item, "agent", `${item.kind} ${item.agentPath ?? ""}`.trim(), { result: item.model ?? "" });
    default:
      return null;
  }
}

export function userText(item: any): string {
  return (item.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
}

export function userParts(item: any): Part[] {
  const images: Part[] = (item.content ?? []).filter((c: any) => c.type === "localImage").map((c: any, i: number) => ({ type: "image", itemId: `${item.id}-img${i}`, path: c.path }));
  return [...images, { type: "text", itemId: item.id, text: userText(item) }];
}

export function turnsToMessages(turns: any[], meta: (turnId: string) => TurnMeta): Msg[] {
  const out: Msg[] = [];
  for (const turn of turns) {
    const parts: Part[] = [];
    for (const item of turn.items ?? []) {
      if (item.type === "userMessage") {
        out.push({ id: `u-${turn.id}`, role: "user", turnId: turn.id, parts: userParts(item) });
      } else {
        const p = itemToPart(item);
        if (p) parts.push(p);
      }
    }
    if (turn.error) parts.push({ type: "text", itemId: `err-${turn.id}`, text: `⚠️ ${turn.error.message ?? tr("turn failed")}` });
    const running = turn.status === "inProgress";
    out.push({
      id: `a-${turn.id}`,
      role: "assistant",
      turnId: turn.id,
      parts,
      running,
      meta: { ...meta(turn.id), durationMs: turn.durationMs, startedAt: turn.startedAt ? turn.startedAt * 1000 : undefined },
    });
  }
  return out;
}

export function toThreadMessage(m: Msg): ThreadMessageLike {
  // A message another chat sent here shows as from that agent, without the CLI's header lines.
  const first = m.role === "user" ? m.parts.find((p) => p.type === "text") : undefined;
  const incoming = first && "text" in first ? agentMessage(first.text) : null;
  return {
    id: m.id,
    role: m.role,
    status: m.role === "assistant" ? (m.running ? { type: "running" } : { type: "complete", reason: "stop" }) : undefined,
    metadata: { custom: { ...m.meta, turnId: m.turnId, from: incoming?.from } },
    content: m.parts.map((p) => (incoming && p === first ? { ...p, text: incoming.text } : p)).map((p) =>
      p.type === "tool-call"
        ? { type: "tool-call", toolCallId: p.itemId, toolName: p.toolName, argsText: p.argsText, args: p.args, result: p.result, isError: p.isError }
        : p.type === "image"
          ? { type: "image", image: p.path }
          : { type: p.type, text: p.text },
    ),
  };
}

// Все файлы, которые Codex трогал в треде (через apply_patch), в порядке последнего изменения.
export type ChangedFile = FileEdit & { edits: number; turnId: string };
export function changedFiles(messages: Msg[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const m of messages)
    for (const p of m.parts)
      if (p.type === "tool-call")
        for (const f of p.args.files ?? []) {
          const prev = byPath.get(f.path);
          byPath.delete(f.path);
          byPath.set(f.path, { ...f, kind: prev?.kind === "add" && f.kind === "update" ? "add" : f.kind, edits: (prev?.edits ?? 0) + 1, turnId: m.turnId });
        }
  return [...byPath.values()].reverse();
}
