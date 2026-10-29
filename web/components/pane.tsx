"use client";

// Одно окно чата: свой тред, своя модель, свои ходы и одобрения. Окон на экране до четырёх,
// соединение с codex у них общее — события сюда приносит рабочая область (chat.tsx), окно само фильтрует по threadId.
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
} from "@assistant-ui/react";
import type { ServerRequest } from "@/lib/codex-client";
import { actionsOf, changedFiles, itemToPart, toThreadMessage, turnsToMessages, userParts, userText, type Action, type ChangedFile, type Msg, type Part, type TurnMeta } from "@/lib/messages";
import { t } from "@/lib/i18n";
import { store } from "@/lib/store";
import { Icon } from "./icons";
import { ImageReader, makeReader } from "./local-image";
import { Approval, AssistantMessage, UserEditComposer, UserMessage } from "./messages";
import { ModelPicker, type Model, type Selection } from "./model-picker";
import { ImageEditor } from "./image-editor";
import { SessionTools } from "./tools";
import { StatusBar, type RateLimits, type TokenUsage } from "./status-bar";

export const CWD = "/workspace";

export type PaneCommand = { type: "open"; threadId: string; n: number } | { type: "new"; cwd: string; n: number };
export type PaneHandle = {
  threadId: () => string | null;
  notify: (method: string, p: any) => void;
  serverRequest: (req: ServerRequest) => void;
  reconnected: () => void;
};
// waiting — агент ждёт разрешения (как blocked в herdr); actions — лента для правой панели.
export type PaneState = { threadId: string | null; running: boolean; waiting: boolean; files: ChangedFile[]; actions: Action[]; cwd: string | null; model: string | null };

type Api = {
  request: (method: string, params: unknown) => Promise<any>;
  respond: (id: number | string, result: unknown) => void;
};

// Модель, усилие, скорость в истории Codex не хранятся — запоминаем сами, общий словарь на все окна.
// Источник правды — таблица turn_meta морды (/api/turns), localStorage — кеш, чтобы не ждать сеть.
const meta: { current: Record<string, TurnMeta> } = { current: {} };
let metaLoaded = false;
let unsent: Record<string, TurnMeta> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function patchMetaStore(tId: string, patch: TurnMeta) {
  meta.current[tId] = { ...meta.current[tId], ...patch };
  const keys = Object.keys(meta.current);
  if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete meta.current[k];
  store.set("paddock.turnMeta", meta.current);
  unsent[tId] = { ...unsent[tId], ...patch };
  flushTimer ??= setTimeout(() => {
    const turns = unsent;
    unsent = {};
    flushTimer = null;
    fetch("/api/turns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turns }) }).catch(() => {});
  }, 1000);
}
// Подтянуть с сервера то, чего нет в локальном кеше (ходы из другого браузера).
async function loadServerMeta(ids: string[]) {
  const missing = ids.filter((id) => !meta.current[id]?.model);
  if (missing.length === 0) return;
  const r = await fetch(`/api/turns?ids=${missing.slice(-300).join(",")}`).then((x) => x.json()).catch(() => null);
  for (const [id, m] of Object.entries((r?.turns ?? {}) as Record<string, TurnMeta>)) meta.current[id] = { ...m, ...meta.current[id] };
}

export const Pane = memo(function Pane({ handleRef, api, connected, models, ndModels, defaultSel, limits, command, title, active, compact, closable,
  onFocus, onClose, onState, onThreadsChanged, onGrip }: {
  handleRef: Ref<PaneHandle>;
  api: Api;
  connected: boolean;
  models: Model[];
  ndModels: Model[];
  defaultSel: Selection | null;
  limits: RateLimits | null;
  command: PaneCommand | null;
  title: string | null;
  active: boolean;
  compact: boolean;
  closable: boolean;
  onFocus: () => void;
  onClose: () => void;
  onState: (s: PaneState) => void;
  onThreadsChanged: () => void;
  onGrip: (e: React.PointerEvent) => void;
}) {
  if (!metaLoaded && typeof window !== "undefined") {
    meta.current = store.get("paddock.turnMeta", {});
    metaLoaded = true;
  }
  const [threadId, setThreadId] = useState<string | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  // Команды shell этого чата — по ним поповер в статус-баре отмечает, какие скиллы и CLI агент реально использовал.
  const commands = useMemo(() => messages.flatMap((m) => m.parts.flatMap((p) => (p.type === "tool-call" && p.argsText ? [p.argsText] : []))), [messages]);
  const [turnId, setTurnId] = useState<string | null>(null);
  const finished = useRef(new Set<string>());
  const [approvals, setApprovals] = useState<ServerRequest[]>([]);
  const [sel, setSel] = useState<Selection | null>(null);
  const selRef = useRef<Selection | null>(null);
  const threadProvider = useRef<string>("openai");
  const [ctx, setCtx] = useState<{ cwd: string | null; branch: string | null }>({ cwd: CWD, branch: null });
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const newCwd = useRef(CWD);
  const done = useRef(0);
  const files = useMemo(() => changedFiles(messages), [messages]);
  // Наверх сообщаем только когда список файлов реально поменялся, а не на каждый кусок стрима.
  const filesKey = files.map((f) => `${f.path}:${f.edits}:${f.kind}`).join("|");
  // Когда действие появилось вживую — для времени в ленте; у истории времени нет (Codex его не хранит).
  const seen = useRef<Record<string, number>>({});
  const actions = useMemo(() => actionsOf(messages, seen.current), [messages]);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const actionsKey = actions.map((a) => `${a.id}:${a.ok}`).join("|");
  const filesRef = useRef(files);
  filesRef.current = files;

  threadIdRef.current = threadId;
  selRef.current = sel ?? defaultSel;

  const choose = useCallback((s: Selection) => {
    setSel(s);
    store.set("paddock.selection", s);
  }, []);

  const patchMeta = useCallback((tId: string, patch: TurnMeta) => {
    patchMetaStore(tId, patch);
    setMessages((ms) => ms.map((m) => (m.id === `a-${tId}` ? { ...m, meta: { ...m.meta, ...patch } } : m)));
  }, []);
  // TTFT — длительность, а не отметка: в истории startedAt серверный, а часы браузера с ним не сверены.
  const firstToken = useCallback((tId: string) => {
    const m = meta.current[tId];
    if (m && m.ttftMs == null && m.startedAt) patchMeta(tId, { ttftMs: Date.now() - m.startedAt });
  }, [patchMeta]);

  // Пара сообщений хода появляется по первому сигналу — ответу turn/start или событию userMessage, что раньше.
  const ensureTurn = useCallback((tId: string, parts: Part[]) => {
    setMessages((ms) =>
      ms.some((m) => m.id === `a-${tId}`)
        ? ms
        : [
            ...ms.filter((m) => m.id !== "u-pending"),
            { id: `u-${tId}`, role: "user", turnId: tId, parts },
            { id: `a-${tId}`, role: "assistant", turnId: tId, parts: [], running: !finished.current.has(tId), meta: meta.current[tId] },
          ],
    );
  }, []);

  const updatePart = useCallback((tId: string, itemId: string, fn: (p: Part | undefined) => Part | null) => {
    setMessages((ms) =>
      ms.map((m) => {
        if (m.id !== `a-${tId}`) return m;
        const i = m.parts.findIndex((p) => p.itemId === itemId);
        const next = fn(i >= 0 ? m.parts[i] : undefined);
        if (!next) return m;
        const parts = [...m.parts];
        if (i >= 0) parts[i] = next;
        else parts.push(next);
        return { ...m, parts };
      }),
    );
  }, []);

  // A line from Paddock itself in the chat: what went wrong, instead of a silently empty pane or a vanished message.
  const notice = useCallback((text: string) => {
    setMessages((ms) => [...ms.filter((m) => m.id !== "notice"), { id: "notice", role: "assistant", turnId: "", parts: [{ type: "text", itemId: "notice", text: `⚠️ ${text}` }] }]);
  }, []);

  // Подписка на тред + история ходов. И при открытии, и после переподключения:
  // всё, что пришло, пока связи не было, берём из истории, а не из потерянных событий.
  const hydrate = useCallback(async (id: string) => {
    const r = await api.request("thread/resume", { threadId: id, excludeTurns: true });
    const page = await api.request("thread/turns/list", { threadId: id, limit: 100, sortDirection: "desc", itemsView: "full" });
    const turns = [...page.data].reverse();
    await loadServerMeta(turns.map((t: any) => t.id));
    if (threadIdRef.current !== id) return;
    const threadModel = { model: r.model as string, effort: (r.reasoningEffort as string | null) ?? null };
    for (const t of turns) if (t.status !== "inProgress") finished.current.add(t.id);
    setMessages(turnsToMessages(turns, (t) => ({ ...threadModel, ...meta.current[t] })));
    // Статус-бар (контекст, кеш) — из последнего хода, где расход известен; после перезагрузки событий ещё не было.
    const lastUsage = [...turns].reverse().map((t: any) => meta.current[t.id]?.usage).find(Boolean);
    if (lastUsage) setUsage((u) => u ?? (lastUsage as TokenUsage));
    setTurnId(turns.find((t: any) => t.status === "inProgress")?.id ?? null);
    setCtx({ cwd: r.cwd, branch: r.thread.gitInfo?.branch ?? null });
    threadProvider.current = r.modelProvider ?? "openai";
    const provider = threadProvider.current === "openai" ? undefined : threadProvider.current;
    if (r.model) choose({ model: r.model, effort: r.reasoningEffort ?? (provider ? "" : selRef.current?.effort ?? "medium"), provider });
  }, [api, choose]);

  const notify = useCallback((method: string, p: any) => {
    if (!p?.threadId || p.threadId !== threadIdRef.current) return;
    switch (method) {
      case "turn/started":
        if (!finished.current.has(p.turn.id)) setTurnId(p.turn.id);
        break;
      case "item/started":
      case "item/completed": {
        if (p.item.type === "userMessage") {
          ensureTurn(p.turnId, userParts(p.item));
          break;
        }
        firstToken(p.turnId);
        if (method === "item/started") seen.current[p.item.id] ??= Date.now();
        const part = itemToPart(p.item);
        if (part) updatePart(p.turnId, p.item.id, () => part);
        break;
      }
      case "item/agentMessage/delta":
        firstToken(p.turnId);
        updatePart(p.turnId, p.itemId, (old) => ({ type: "text", itemId: p.itemId, text: (old && "text" in old ? old.text : "") + p.delta }));
        break;
      case "item/reasoning/summaryTextDelta":
        firstToken(p.turnId);
        updatePart(p.turnId, p.itemId, (old) => ({ type: "reasoning", itemId: p.itemId, text: (old && "text" in old ? old.text : "") + p.delta }));
        break;
      case "item/commandExecution/outputDelta":
        updatePart(p.turnId, p.itemId, (old) => (old?.type === "tool-call" ? { ...old, result: (old.result ?? "") + p.delta } : null));
        break;
      case "thread/tokenUsage/updated":
        setUsage(p.tokenUsage);
        // Каждое обновление — один вызов модели; last — его расход.
        if (p.turnId && p.tokenUsage?.last)
          patchMeta(p.turnId, { outTokens: (meta.current[p.turnId]?.outTokens ?? 0) + p.tokenUsage.last.outputTokens, usage: { last: p.tokenUsage.last, total: p.tokenUsage.total, modelContextWindow: p.tokenUsage.modelContextWindow } });
        break;
      case "model/rerouted":
        patchMeta(p.turnId, { model: p.toModel });
        break;
      case "turn/completed":
        finished.current.add(p.turn.id);
        setTurnId((t) => (t === p.turn.id ? null : t));
        setMessages((ms) => ms.map((m) => (m.id === `a-${p.turn.id}` ? { ...m, running: false } : m)));
        patchMeta(p.turn.id, { durationMs: p.turn.durationMs });
        if (p.turn.error) updatePart(p.turn.id, `err-${p.turn.id}`, () => ({ type: "text", itemId: `err-${p.turn.id}`, text: `⚠️ ${p.turn.error.message ?? t("turn failed")}` }));
        onThreadsChanged();
        break;
      case "error":
        if (!p.willRetry) updatePart(p.turnId, `err-${p.turnId}`, () => ({ type: "text", itemId: `err-${p.turnId}`, text: `⚠️ ${p.error?.message ?? t("error")}` }));
        break;
    }
  }, [ensureTurn, updatePart, patchMeta, firstToken, onThreadsChanged]);

  useImperativeHandle(handleRef, () => ({
    threadId: () => threadIdRef.current,
    notify,
    serverRequest: (req) => setApprovals((a) => [...a, req]),
    reconnected: () => void (threadIdRef.current && hydrate(threadIdRef.current).catch((e) => notice(t("Could not reload the chat after reconnecting: {error}", { error: e?.message ?? String(e) })))),
  }), [notify, hydrate, notice]);

  // Автопрокрутка assistant-ui едет за ответом, только если окно уже внизу. После открытия чата высота
  // дорастает (markdown, подсветка, картинки) уже после первой прокрутки, и окно остаётся выше низа —
  // новое сообщение и ответ уходят за край. Поэтому сами прижимаем вниз: после открытия и при отправке.
  const viewport = useRef<HTMLDivElement>(null);
  const toBottom = useCallback(() => {
    for (const ms of [0, 150, 500, 1200]) setTimeout(() => {
      const el = viewport.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, ms);
  }, []);

  const openThread = useCallback(async (id: string) => {
    setThreadId(id);
    threadIdRef.current = id;
    setMessages([]);
    setUsage(null);
    setApprovals([]);
    try {
      await hydrate(id);
    } catch (e: any) {
      // The chat's file is gone (deleted sessions, a stale link): the pane becomes a new chat, otherwise every
      // message sent here would go to a thread that no longer exists and vanish.
      if (/no rollout found|not found/i.test(e?.message ?? "")) {
        setThreadId(null);
        threadIdRef.current = null;
        notice(t("This chat no longer exists on the server. A message here starts a new chat."));
      } else notice(t("Could not open the chat: {error}", { error: e?.message ?? String(e) }));
    }
    toBottom();
  }, [hydrate, toBottom, notice]);

  const newThread = useCallback((cwd: string) => {
    setThreadId(null);
    threadIdRef.current = null;
    setMessages([]);
    setTurnId(null);
    setUsage(null);
    setApprovals([]);
    newCwd.current = cwd;
    setCtx({ cwd, branch: null });
  }, []);

  // Команды от рабочей области (открыть тред из сайдбара, новый чат в папке) — когда есть связь.
  useEffect(() => {
    if (!command || !connected || command.n === done.current) return;
    done.current = command.n;
    if (command.type === "open") openThread(command.threadId);
    else newThread(command.cwd);
  }, [command, connected, openThread, newThread]);

  useEffect(() => {
    onState({ threadId, running: turnId !== null, waiting: approvals.length > 0, files: filesRef.current, actions: actionsRef.current, cwd: ctx.cwd, model: selRef.current?.model ?? null });
  }, [threadId, turnId, approvals.length, filesKey, actionsKey, ctx.cwd, onState]);

  // Вложения поля ввода: картинки из буфера (уже лежат файлом в харнессе) и свёрнутые длинные вставки.
  const [images, setImages] = useState<{ path: string; url: string }[]>([]);
  const [pastes, setPastes] = useState<{ n: number; text: string; lines: number }[]>([]);
  const pasteN = useRef(0);
  const [editing, setEditing] = useState<string | null>(null); // data: URL картинки в редакторе
  const pasteToken = (p: { n: number; lines: number }) => `[Pasted text #${p.n} +${p.lines} lines]`;

  const startTurn = async (typed: string) => {
    // Токены вставок → полный текст; картинки уходят отдельными localImage.
    const text = pastes.reduce((acc, p) => acc.replace(pasteToken(p), p.text), typed);
    const imgs = images.map((i) => i.path);
    setPastes([]);
    setImages([]);
    const parts = (itemId: string): Part[] => [...imgs.map((path, i) => ({ type: "image" as const, itemId: `${itemId}-img${i}`, path })), { type: "text", itemId, text }];
    // Пузырь сообщения сразу, не дожидаясь thread/start и turn/start (в новом чате это секунды); ensureTurn заменит его настоящим.
    setMessages((ms) => [...ms.filter((m) => m.id !== "u-pending" && m.id !== "notice"), { id: "u-pending", role: "user", turnId: "", parts: parts("u-pending") }]);
    toBottom();
    try {
      await startTurnNow(text, imgs, parts);
    } catch (e: any) {
      // Not sent: the text goes back into the input and the reason is shown, nothing disappears silently.
      setMessages((ms) => ms.filter((m) => m.id !== "u-pending"));
      runtime.thread.composer.setText(typed);
      notice(t("Message not sent: {error}", { error: e?.message ?? String(e) }));
    }
  };

  const startTurnNow = async (text: string, imgs: string[] = [], parts: (itemId: string) => Part[] = (itemId) => [{ type: "text", itemId, text }]) => {
    // No selection yet = model/list has not answered; starting now would put the thread on OpenAI by default.
    // The bubble is already on screen, so wait for the models a little instead of failing.
    for (let i = 0; i < 75 && !selRef.current; i++) await new Promise((r) => setTimeout(r, 200));
    const s = selRef.current;
    if (!s) throw new Error(t("models are still loading, try again in a second"));
    const provider = s.provider ?? "openai";
    let tid = threadIdRef.current;
    // Провайдер у Codex задаётся на весь тред — модель другого провайдера продолжает в новом чате той же папки.
    if (tid && threadProvider.current !== provider) {
      newThread(ctx.cwd ?? CWD);
      tid = null;
    }
    if (!tid) {
      const nd = ndModels.find((m) => m.model === s?.model && provider === "neuraldeep");
      const r = await api.request("thread/start", {
        cwd: newCwd.current,
        model: s?.model,
        modelProvider: provider,
        config: nd?.context ? { model_context_window: nd.context } : null,
      });
      tid = r.thread.id as string;
      threadIdRef.current = tid;
      threadProvider.current = r.modelProvider ?? provider;
      setThreadId(tid);
      setCtx({ cwd: r.cwd, branch: r.thread.gitInfo?.branch ?? null });
    }
    const startedAt = Date.now();
    const res = await api.request("turn/start", {
      threadId: tid,
      input: [...imgs.map((path) => ({ type: "localImage", path })), { type: "text", text, text_elements: [] }],
      model: s?.model,
      effort: s?.effort || null,
    });
    const id = res.turn.id as string;
    patchMeta(id, { model: s?.model, effort: s?.effort, startedAt });
    ensureTurn(id, parts(`u-${id}`));
    toBottom();
    if (!finished.current.has(id)) setTurnId(id);
    onThreadsChanged();
  };

  const textOf = (m: AppendMessage) => m.content.map((c) => (c.type === "text" ? c.text : "")).join("\n").trim();

  // Правка и «ответить заново»: откатываем тред до хода с этим сообщением и запускаем ход заново.
  const rerun = async (userMsgId: string, text: string) => {
    const tid = threadIdRef.current;
    const msg = messages.find((m) => m.id === userMsgId);
    if (!tid || !msg) return;
    await api.request("thread/revert", { threadId: tid, beforeTurnId: msg.turnId });
    setMessages((ms) => ms.slice(0, ms.findIndex((m) => m.id === userMsgId)));
    await startTurn(text);
  };

  const runtime = useExternalStoreRuntime<Msg>({
    messages,
    isRunning: turnId !== null,
    convertMessage: toThreadMessage,
    onNew: async (m) => { const tx = textOf(m); if (tx || images.length) await startTurn(tx); },
    onEdit: async (m) => { const t = textOf(m); if (t && m.sourceId) await rerun(m.sourceId, t); },
    onReload: async (parentId) => {
      const m = messages.find((x) => x.id === parentId);
      const text = m?.parts.map((p) => ("text" in p ? p.text : "")).join("\n");
      if (m && text) await rerun(m.id, text);
    },
    onCancel: async () => { if (threadId && turnId) await api.request("turn/interrupt", { threadId, turnId }); },
  });

  const answer = (req: ServerRequest, result: unknown) => {
    api.respond(req.id, result);
    setApprovals((a) => a.filter((r) => r.id !== req.id));
  };

  const readImage = useMemo(() => makeReader(api.request), [api]);
  const shown = sel ?? defaultSel;
  const running = turnId !== null;
  const empty = messages.length === 0;
  const width = compact ? "max-w-none" : "max-w-3xl";

  // Вставка: картинка → редактор (как разметка в macOS) → файл в <папка>/.paddock/uploads/<тред>/;
  // длинный текст (больше 10 строк) → чип [Pasted text #N +M lines], полный текст уйдёт при отправке — как в Claude Code.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = [...e.clipboardData.items].find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
    if (file) {
      e.preventDefault();
      const r = new FileReader();
      r.onload = () => setEditing(String(r.result));
      r.readAsDataURL(file);
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    const lines = text.split("\n").length;
    if (lines <= 10) return;
    e.preventDefault();
    const paste = { n: ++pasteN.current, text, lines };
    setPastes((ps) => [...ps, paste]);
    document.execCommand("insertText", false, pasteToken(paste));
  };

  const saveImage = async (png: Blob, url: string) => {
    setEditing(null);
    const dir = `${ctx.cwd ?? CWD}/.paddock/uploads/${threadIdRef.current ?? "new"}`;
    const path = `${dir}/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
    const bytes = new Uint8Array(await png.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    await api.request("fs/createDirectory", { path: dir, recursive: true });
    await api.request("fs/writeFile", { path, dataBase64: btoa(bin) });
    setImages((is) => [...is, { path, url }]);
  };

  const removePaste = (n: number) => {
    const p = pastes.find((x) => x.n === n);
    if (!p) return;
    const c = runtime.thread.composer;
    c.setText(c.getState().text.replace(pasteToken(p), ""));
    setPastes((ps) => ps.filter((x) => x.n !== n));
  };

  // Ответить на выделенное: выделил кусок ответа → кнопка → цитата «> …» в поле ввода, текст заодно в буфере (как мод quote-reply).
  const paneRef = useRef<HTMLElement>(null);
  const [quote, setQuote] = useState<{ text: string; x: number; y: number } | null>(null);
  const onMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!sel || !text || !viewport.current?.contains(sel.anchorNode)) return setQuote(null);
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const box = paneRef.current!.getBoundingClientRect();
    setQuote({ text, x: Math.min(Math.max(r.left - box.left + r.width / 2, 90), box.width - 90), y: r.top - box.top - 8 });
  };
  const replyToQuote = () => {
    if (!quote) return;
    navigator.clipboard?.writeText(quote.text).catch(() => {});
    const c = runtime.thread.composer;
    const cur = c.getState().text;
    c.setText(`${quote.text.split("\n").map((l) => `> ${l}`).join("\n")}\n\n${cur}`);
    setQuote(null);
    window.getSelection()?.removeAllRanges();
    setTimeout(() => paneRef.current?.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(), 0);
  };

  const composer = (
    <div className="space-y-2">
      {approvals.map((req) => <Approval key={req.id} req={req} onAnswer={answer} />)}
      <ComposerPrimitive.Root className="composer rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 transition-colors focus-within:border-[var(--accent)]/40">
        {(images.length > 0 || pastes.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 px-1.5 pt-1" data-attachments>
            {images.map((im) => (
              <span key={im.path} className="group/att relative">
                <img src={im.url} alt="" title={im.path} className="h-14 w-14 rounded-lg border border-[var(--border)] object-cover" />
                <button onClick={() => setImages((is) => is.filter((x) => x.path !== im.path))} title={t("Remove")}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--panel-2)] text-[var(--muted)] opacity-0 shadow group-hover/att:opacity-100">
                  <Icon name="plus" size={11} className="rotate-45" />
                </button>
              </span>
            ))}
            {pastes.map((p) => (
              <span key={p.n} title={p.text.split("\n").slice(0, 12).join("\n")} data-paste-chip
                className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 font-mono text-[11.5px] text-[var(--muted)]">
                {pasteToken(p)}
                <button onClick={() => removePaste(p.n)} title={t("Remove")} className="rounded p-0.5 hover:text-[var(--fg)]">
                  <Icon name="plus" size={11} className="rotate-45" />
                </button>
              </span>
            ))}
          </div>
        )}
        <ComposerPrimitive.Input
          onPaste={onPaste}
          autoFocus={active}
          placeholder={connected ? t("What should we do?") : t("No connection to codex…")}
          className={`${compact ? "max-h-40 min-h-9" : "max-h-60 min-h-11"} w-full resize-none bg-transparent px-2.5 py-2 leading-relaxed outline-none placeholder:text-[var(--faint)]`}
        />
        <div className="flex items-center gap-2 px-1">
          <span className="flex min-w-0 items-center gap-1.5 truncate rounded-lg border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--muted)]" title={t("Codex working folder")}>
            <Icon name="folder" size={13} className="shrink-0 text-[var(--blue)]" />
            <span className="truncate">{ctx.cwd ?? CWD}</span>
            {ctx.branch && (
              <>
                <Icon name="branch" size={12} className="ml-1 shrink-0 text-[var(--teal)]" />
                {ctx.branch}
              </>
            )}
          </span>
          <span className="flex-1" />
          <ThreadPrimitive.If running={false}>
            <ComposerPrimitive.Send className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-black shadow-[0_0_18px_-4px_var(--accent)] transition-opacity disabled:opacity-30 disabled:shadow-none">
              <Icon name="arrowUp" size={18} strokeWidth={2.25} />
            </ComposerPrimitive.Send>
          </ThreadPrimitive.If>
          <ThreadPrimitive.If running>
            <ComposerPrimitive.Cancel className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--accent)]/50 text-[var(--accent)]" title={t("Stop")}>
              <Icon name="stop" size={14} fill="currentColor" />
            </ComposerPrimitive.Cancel>
          </ThreadPrimitive.If>
        </div>
      </ComposerPrimitive.Root>
      <StatusBar model={shown?.model ?? null} effort={shown?.effort ?? null} cwd={ctx.cwd} branch={ctx.branch} usage={usage} limits={limits} connected={connected}
        extra={connected && ctx.cwd ? <SessionTools request={api.request} cwd={ctx.cwd} commands={commands} /> : null} />
    </div>
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ImageReader.Provider value={readImage}>
      <section ref={paneRef} onMouseDown={onFocus} onFocusCapture={onFocus} onMouseUp={onMouseUp}
        className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${compact ? `border-t-2 ${active ? "border-[var(--accent)]" : "border-transparent"}` : ""}`}>
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--border)]/60 px-2">
          {compact && (
            <button onPointerDown={onGrip} title={t("Drag to swap panes")} data-grip
              className="cursor-grab touch-none rounded-md p-1 text-[var(--faint)] hover:bg-[var(--panel)] hover:text-[var(--fg)] active:cursor-grabbing">
              <Icon name="grip" size={14} strokeWidth={3} />
            </button>
          )}
          {compact && (
            <span className="flex min-w-0 items-center gap-2 pl-1 pr-1">
              <span title={running ? t("working") : t("done")}
                className={`h-2 w-2 shrink-0 rounded-full ${running ? "animate-pulse bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" : threadId ? "bg-[var(--green)]" : "bg-[var(--faint)]"}`} />
              <span className="max-w-[16rem] truncate text-sm text-[var(--muted)]">{title ?? t("New chat")}</span>
            </span>
          )}
          <ModelPicker models={[...models, ...ndModels]} value={shown} onChange={choose} />
          <span className="flex-1" />
          {closable && (
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} title={t("Close pane")}
              className="rounded-md p-1.5 text-[var(--faint)] hover:bg-[var(--panel)] hover:text-[var(--fg)]">
              <Icon name="plus" size={15} className="rotate-45" />
            </button>
          )}
        </header>

        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          {empty && compact ? (
            // В сетке поле ввода всегда внизу — чтобы в ряду окон оно стояло на одной высоте.
            <>
              <div className="glow flex flex-1 items-center justify-center px-4">
                <h1 className="text-center text-xl font-semibold tracking-tight">{t("What are we building?")}</h1>
              </div>
              <div className="w-full px-3 pb-3">{composer}</div>
            </>
          ) : empty ? (
            <div className={`glow flex flex-1 flex-col items-center justify-center px-4 ${compact ? "pb-6" : "pb-24"}`}>
              <h1 className={`mb-5 text-center font-semibold tracking-tight ${compact ? "text-xl" : "text-2xl md:text-[28px]"}`}>{t("What are we building?")}</h1>
              <div className={`w-full ${compact ? "max-w-xl" : "max-w-3xl"}`}>{composer}</div>
            </div>
          ) : (
            <>
              <ThreadPrimitive.Viewport ref={viewport} className={`flex-1 overflow-y-auto px-4 ${compact ? "py-4" : "py-8"}`}>
                <div className={`mx-auto ${width} ${compact ? "space-y-5" : "space-y-7"}`}>
                  <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage, UserEditComposer }} />
                </div>
              </ThreadPrimitive.Viewport>
              <div className={`mx-auto w-full ${width} px-3 pb-3`}>{composer}</div>
            </>
          )}
        </ThreadPrimitive.Root>
        {quote && (
          <button onMouseDown={(e) => e.preventDefault()} onClick={replyToQuote} data-quote-reply
            className="absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs shadow-xl shadow-black/50 hover:border-[var(--accent)]/60"
            style={{ left: quote.x, top: quote.y }}>
            <span className="text-[var(--accent)]">❝</span> {t("Reply to selection")}
          </button>
        )}
        {editing && <ImageEditor src={editing} onCancel={() => setEditing(null)} onDone={(png, url) => void saveImage(png, url)} />}
      </section>
      </ImageReader.Provider>
    </AssistantRuntimeProvider>
  );
});
