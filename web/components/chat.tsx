"use client";

// Рабочая область: одно соединение с codex, сайдбар, аккаунт, настройки и до четырёх окон чата (pane.tsx).
// События codex разлетаются по окнам, каждое берёт свои по threadId; одобрения идут в окно своего треда.
import { createRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { CodexClient, type ServerRequest } from "@/lib/codex-client";
import { t } from "@/lib/i18n";
import { store } from "@/lib/store";
import type { AccountInfo, Snapshot } from "./account";
import { SidePanel, type SideTab, type SnapshotData } from "./side-panel";
import { Icon } from "./icons";
import type { Model, Selection } from "./model-picker";
import { CWD, Pane, type PaneCommand, type PaneHandle, type PaneState } from "./pane";
import { Settings, type LoginEvent } from "./settings";
import { Sidebar, type ThreadInfo } from "./sidebar";
import type { RateLimits } from "./status-bar";

const PANES = 4;
type Layout = 1 | 2 | 4;
const emptyState: PaneState = { threadId: null, running: false, waiting: false, files: [], actions: [], cwd: CWD, model: null };

// Раскладка, порядок окон и выбор модели живут в localStorage, которого нет на сервере, —
// рисуем рабочую область только в браузере, иначе React ругается на расхождение разметки (#418).
export function Chat({ email }: { email: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Workspace email={email} /> : <div className="h-dvh bg-[var(--bg)]" />;
}

function Workspace({ email }: { email: string }) {
  const client = useRef<CodexClient | null>(null);
  const handles = useMemo(() => Array.from({ length: PANES }, () => createRef<PaneHandle>()), []);
  const [connected, setConnected] = useState(false);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [sidebar, setSidebar] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [ndModels, setNdModels] = useState<Model[]>([]);
  const [defaultSel, setDefaultSel] = useState<Selection | null>(null);
  const [limits, setLimits] = useState<RateLimits | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loginEvent, setLoginEvent] = useState<LoginEvent | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>(() => store.get<SideTab>("paddock.sideTab", "files"));
  const chooseSideTab = useCallback((t: SideTab) => { setSideTab(t); store.set("paddock.sideTab", t); }, []);

  // Раскладка и какие треды открыты в окнах — переживают перезагрузку вкладки.
  type Saved = { layout: Layout; threads: (string | null)[]; slots?: number[]; col?: number; row?: number };
  const saved = useMemo(() => store.get<Saved>("paddock.panes", { layout: 1, threads: [] }), []);
  const [layout, setLayout] = useState<Layout>(saved.layout);
  // slots[место на сетке] = номер окна. Перетаскивание меняет местами записи, сами окна (и их состояние) не пересоздаются.
  const [slots, setSlots] = useState<number[]>(() => (saved.slots?.length === PANES ? saved.slots : [0, 1, 2, 3]));
  const [col, setCol] = useState(saved.col ?? 0.5);
  const [row, setRow] = useState(saved.row ?? 0.5);
  const [drag, setDrag] = useState<{ pane: number; x: number; y: number; over: number | null } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [activePane, setActivePane] = useState(0);
  const [states, setStates] = useState<PaneState[]>(() => Array(PANES).fill(emptyState));
  const counter = useRef(0);
  const [commands, setCommands] = useState<(PaneCommand | null)[]>(() =>
    Array.from({ length: PANES }, (_, i) => (saved.threads[i] ? { type: "open", threadId: saved.threads[i]!, n: ++counter.current } : null)),
  );
  const activeRef = useRef(0);
  activeRef.current = activePane;

  const request = useCallback((method: string, params: unknown) => client.current!.request(method, params), []);
  const api = useMemo(() => ({ request, respond: (id: number | string, result: unknown) => client.current!.respond(id, result) }), [request]);

  type NewCommand = { type: "open"; threadId: string } | { type: "new"; cwd: string };
  const command = (pane: number, c: NewCommand) =>
    setCommands((cs) => cs.map((x, i) => (i === pane ? ({ ...c, n: ++counter.current } as PaneCommand) : x)));

  const loadThreads = useCallback(async () => {
    const res = await client.current!.request("thread/list", { limit: 100, sortKey: "updated_at" });
    // После thread/revert codex 0.165 отдаёт тред дважды (старое и новое превью) — оставляем первую, свежую запись.
    const seen = new Set<string>();
    const fresh = res.data.filter((t: any) => !seen.has(t.id) && seen.add(t.id));
    setThreads(fresh.map((th: any) => ({ id: th.id, title: th.name || th.preview || t("без названия"), updatedAt: th.updatedAt })));
  }, []);

  const loadAccount = useCallback(async () => {
    const c = client.current!;
    const [rl, acc] = await Promise.all([
      c.request("account/rateLimits/read", {}).catch(() => null),
      c.request("account/read", {}).catch(() => null),
    ]);
    if (rl?.rateLimits) setLimits(rl.rateLimits);
    setAccount({
      email: acc?.account?.email ?? null,
      plan: acc?.account?.planType ?? rl?.rateLimits?.planType ?? null,
      limits: rl?.rateLimitsByLimitId ?? (rl?.rateLimits ? { codex: rl.rateLimits } : {}),
      resets: (rl?.rateLimitResetCredits?.credits ?? [])
        .filter((r: any) => r.status === "available")
        .sort((a: any, b: any) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity)),
    });
  }, []);

  // Модели NeuralDeep: ключ лежит в config.toml этого codex, список берём через морду (у браузера нет egress).
  const loadNeuralDeep = useCallback(async (): Promise<number> => {
    const cfg = await client.current!.request("config/read", {});
    const key = cfg.config?.model_providers?.neuraldeep?.experimental_bearer_token;
    if (!key) {
      setNdModels([]);
      return 0;
    }
    const r = await fetch("/api/neuraldeep/models", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? t("ошибка {status}", { status: r.status }));
    const efforts = ["low", "medium", "high"].map((e) => ({ reasoningEffort: e, description: "" }));
    setNdModels(j.models.map((m: { id: string; context: number | null; reasoning: boolean }) => ({
      id: m.id,
      model: m.id,
      displayName: m.id,
      description: m.context ? t("{k}k контекста", { k: Math.round(m.context / 1000) }) + (m.reasoning ? "" : t(" · без рассуждений")) : "",
      isDefault: false,
      defaultReasoningEffort: m.reasoning ? "medium" : "",
      supportedReasoningEfforts: m.reasoning ? efforts : [],
      provider: "neuraldeep",
      context: m.context,
    })));
    return j.models.length;
  }, []);

  const resetLimits = useCallback(async (creditId: string) => {
    const r = await client.current!.request("account/rateLimitResetCredit/consume", { idempotencyKey: crypto.randomUUID(), creditId });
    await loadAccount();
    return r.outcome as string;
  }, [loadAccount]);

  const onNotification = useCallback((method: string, p: any) => {
    if (method === "account/rateLimits/updated") {
      const s: Snapshot = p.rateLimits;
      setLimits(s);
      setAccount((a) => (a ? { ...a, limits: { ...a.limits, [s.limitId ?? "codex"]: s } } : a));
      return;
    }
    if (method === "thread/name/updated") return void loadThreads();
    if (method === "account/login/completed") {
      setLoginEvent(p);
      return void loadAccount();
    }
    if (method === "account/updated") return void loadAccount();
    for (const h of handles) h.current?.notify(method, p);
  }, [handles, loadThreads, loadAccount]);

  // Одобрение — в окно, где открыт этот тред; если такого нет — в активное.
  const onServerRequest = useCallback((req: ServerRequest) => {
    const tid = req.params?.threadId;
    const target = handles.find((h) => tid && h.current?.threadId() === tid) ?? handles[activeRef.current];
    target.current?.serverRequest(req);
  }, [handles]);

  useEffect(() => {
    let closed = false;
    let first = true;
    const connect = async () => {
      const c = new CodexClient(onNotification, onServerRequest, () => {
        setConnected(false);
        if (!closed) setTimeout(connect, 2000);
      });
      client.current = c;
      try {
        await c.connect();
        setConnected(true);
        const [list] = await Promise.all([c.request("model/list", {}), loadAccount(), loadThreads(), loadNeuralDeep().catch(() => 0)]);
        const ms: Model[] = list.data.filter((m: any) => !m.hidden);
        setModels(ms);
        const sel = store.get<Selection | null>("paddock.selection", null);
        const def = ms.find((m) => m.isDefault) ?? ms[0];
        const ok = sel && (sel.provider ? true : ms.some((m) => m.model === sel.model));
        // Без своего выбора — то, что задано в config.toml харнесса: у пользователя только с NeuralDeep там
        // model_provider = "neuraldeep", а model/list всё равно советует модель OpenAI, к которой у него нет доступа.
        const cfg = ok ? null : await c.request("config/read", {}).then((r) => r.config).catch(() => null);
        const own = cfg?.model && cfg?.model_provider && cfg.model_provider !== "openai" ? { model: cfg.model as string, effort: "", provider: cfg.model_provider as string } : null;
        setDefaultSel(ok ? sel : own ?? (def ? { model: def.model, effort: def.defaultReasoningEffort } : null));
        if (!first) for (const h of handles) h.current?.reconnected();
        first = false;
      } catch {
        c.close();
      }
    };
    connect();
    return () => {
      closed = true;
      client.current?.close();
    };
  }, [onNotification, onServerRequest, loadThreads, loadAccount, loadNeuralDeep, handles]);

  // Стабильные обработчики на каждое окно — чтобы memo(Pane) не перерисовывал соседей на каждый кусок стрима.
  const onFocus = useMemo(() => Array.from({ length: PANES }, (_, i) => () => i !== activeRef.current && setActivePane(i)), []);
  const closeRef = useRef<(i: number) => void>(() => {});
  const onClose = useMemo(() => Array.from({ length: PANES }, (_, i) => () => closeRef.current(i)), []);

  const onState = useMemo(
    () => Array.from({ length: PANES }, (_, i) => (s: PaneState) => setStates((ss) => (ss[i] === s ? ss : ss.map((x, j) => (j === i ? s : x))))),
    [],
  );

  useEffect(() => {
    store.set("paddock.panes", { layout, threads: states.map((s) => s.threadId), slots, col, row });
  }, [layout, states, slots, col, row]);

  const visible = layout === 1 ? [activePane] : slots.slice(0, layout);

  const switchLayout = (l: Layout) => {
    setLayout(l);
    if (l !== 1 && !slots.slice(0, l).includes(activePane)) setActivePane(slots[0]);
  };

  // Границы между окнами: тянем мышью, двойной клик — поровну. Не уже 20% и не шире 80%.
  const startResize = (axis: "col" | "row") => (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = gridRef.current!.getBoundingClientRect();
    const set = axis === "col" ? setCol : setRow;
    const move = (ev: PointerEvent) => {
      const r = axis === "col" ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      set(Math.min(0.8, Math.max(0.2, r)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = axis === "col" ? "col-resize" : "row-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Перетаскивание окна за ручку в шапке: бросили на другое окно — поменялись местами.
  const slotAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-slot]") as HTMLElement | null;
    return el ? Number(el.dataset.slot) : null;
  };
  const gripRef = useRef<(pane: number) => (e: React.PointerEvent) => void>(() => () => {});
  gripRef.current = (pane: number) => (e: React.PointerEvent) => {
    if (layout === 1 || e.button !== 0) return;
    e.preventDefault();
    setDrag({ pane, x: e.clientX, y: e.clientY, over: null });
    const move = (ev: PointerEvent) => setDrag((d) => d && { ...d, x: ev.clientX, y: ev.clientY, over: slotAt(ev.clientX, ev.clientY) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const to = slotAt(ev.clientX, ev.clientY);
      setDrag(null);
      if (to === null) return;
      setSlots((ss) => {
        const from = ss.indexOf(pane);
        if (from === to || to >= layout) return ss;
        const next = [...ss];
        [next[from], next[to]] = [next[to], next[from]];
        return next;
      });
      setActivePane(pane);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onGrip = useMemo(() => Array.from({ length: PANES }, (_, i) => (e: React.PointerEvent) => gripRef.current(i)(e)), []);

  // Правая панель → Сессии: перейти к окну (в одиночной раскладке оно становится видимым), снимки раскладок.
  const focusPane = (i: number) => setActivePane(i);
  const snapshotNow = (): SnapshotData => ({ layout, threads: states.map((s) => s.threadId), slots, col, row, active: activePane });
  const restoreSnapshot = (d: SnapshotData) => {
    setLayout(d.layout);
    if (d.slots?.length === PANES) setSlots(d.slots);
    setCol(d.col ?? 0.5);
    setRow(d.row ?? 0.5);
    setActivePane(d.active ?? 0);
    d.threads.forEach((t, i) => (t ? t !== states[i].threadId && command(i, { type: "open", threadId: t }) : states[i].threadId && command(i, { type: "new", cwd: CWD })));
  };

  // Тред из сайдбара: если он уже открыт в каком-то окне — переходим туда, иначе открываем в активном.
  const openThread = (id: string) => {
    setSidebar(false);
    const at = states.findIndex((s, i) => s.threadId === id && (layout === 1 || visible.includes(i)));
    if (at >= 0) return setActivePane(at);
    command(activePane, { type: "open", threadId: id });
  };

  // В архив: тред пропадает из списка (codex хранит его в archived_sessions), окна с ним становятся пустыми.
  const archiveThread = async (id: string) => {
    await client.current!.request("thread/archive", { threadId: id }).catch(() => {});
    states.forEach((s, i) => s.threadId === id && command(i, { type: "new", cwd: s.cwd ?? CWD }));
    await loadThreads();
  };

  const newThread = (cwd = CWD) => {
    setSidebar(false);
    command(activePane, { type: "new", cwd });
  };

  const closePane = (i: number) => {
    command(i, { type: "new", cwd: CWD });
    const rest = visible.filter((v) => v !== i);
    if (activePane === i && rest.length) setActivePane(rest[0]);
  };

  closeRef.current = closePane;

  const listFolders = useCallback(async (): Promise<string[]> => {
    const r = await client.current!.request("fs/readDirectory", { path: CWD });
    return r.entries.filter((e: any) => e.isDirectory && !e.fileName.startsWith(".")).map((e: any) => e.fileName).sort();
  }, []);

  const createFolder = async (name: string) => {
    await client.current!.request("fs/createDirectory", { path: `${CWD}/${name}`, recursive: true });
    newThread(`${CWD}/${name}`);
  };

  // Alt+1…4 — перейти в окно (как ⌘1…4 в терминале; ⌘ в браузере занят вкладками).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const n = Number(e.code.replace("Digit", "")) - 1;
      if (n >= 0 && n < (layout === 1 ? 1 : layout)) {
        e.preventDefault();
        setActivePane(layout === 1 ? activeRef.current : slots[n]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [layout, slots]);

  // Файлы — по активному окну. Панель сама открывается, когда Codex начал писать файлы в живом ходе.
  const act = states[activePane];
  const seenFiles = useRef<number[]>(Array(PANES).fill(0));
  useEffect(() => {
    states.forEach((s, i) => {
      if (i === activePane && s.running && s.files.length > seenFiles.current[i] && window.innerWidth >= 1024) {
        setFilesOpen(true);
        setSideTab((t) => (t === "actions" ? t : "files"));
      }
      seenFiles.current[i] = s.files.length;
    });
  }, [states, activePane]);

  const readFile = useCallback(async (path: string) => {
    const abs = path.startsWith("/") ? path : `${act.cwd ?? CWD}/${path}`;
    const r = await client.current!.request("fs/readFile", { path: abs });
    const bytes = Uint8Array.from(atob(r.dataBase64), (ch) => ch.charCodeAt(0));
    if (bytes.length > 512 * 1024) return t("(файл больше 512 КБ, не показываю)");
    return new TextDecoder().decode(bytes);
  }, [act.cwd]);

  // Новая сборка выкатилась (в том числе самим Codex) — предлагаем перезагрузить вкладку.
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let first: string | null = null;
    const check = () =>
      fetch("/api/version").then((r) => r.json()).then(({ build }) => {
        if (first === null) first = build;
        else if (build !== first) setStale(true);
      }).catch(() => {});
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  const loadUsage = useCallback(() => client.current!.request("account/usage/read", {}), []);

  const logout = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  const titleOf = (id: string | null) => (id ? threads.find((t) => t.id === id)?.title ?? null : null);
  const openIds = visible.map((i) => states[i].threadId).filter(Boolean) as string[];
  // Сетка с дорожками под границы: [окно | 5px | окно] по столбцам и, для 4 окон, так же по строкам.
  const gridStyle = layout === 1
    ? { gridTemplateColumns: "minmax(0,1fr)", gridTemplateRows: "minmax(0,1fr)" }
    : {
        gridTemplateColumns: `minmax(0,${col}fr) 5px minmax(0,${1 - col}fr)`,
        gridTemplateRows: layout === 4 ? `minmax(0,${row}fr) 5px minmax(0,${1 - row}fr)` : "minmax(0,1fr)",
      };
  const place = (pane: number) => {
    if (layout === 1) return { gridColumn: 1, gridRow: 1 };
    const s = slots.indexOf(pane);
    return { gridColumn: (s % 2) * 2 + 1, gridRow: Math.floor(s / 2) * 2 + 1 };
  };

  return (
    <div className="flex h-dvh">
      <Sidebar
        threads={threads}
        current={act.threadId}
        openIds={openIds}
        running={states.filter((s) => s.running).map((s) => s.threadId!).filter(Boolean)}
        email={email}
        connected={connected}
        open={sidebar}
        onNew={newThread}
        listFolders={listFolders}
        createFolder={createFolder}
        account={account}
        loadUsage={loadUsage}
        resetLimits={resetLimits}
        onOpen={openThread}
        onArchive={archiveThread}
        onClose={() => setSidebar(false)}
        onLogout={logout}
        onSettings={() => { setSidebar(false); setSettingsOpen(true); }}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {stale && (
          <button onClick={() => location.reload()} className="absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-full border border-[var(--accent)]/50 bg-[var(--panel)] px-4 py-1.5 text-sm shadow-xl shadow-black/40 hover:bg-[var(--panel-2)]">
            <span className="text-[var(--accent)]">●</span> {t("Вышла новая версия — обновить")}
          </button>
        )}

        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--border)]/60 px-2">
          {layout !== 1 && (
            <div className="flex min-w-0 items-center gap-0.5">
              {visible.map((i) => (
                <button key={i} onClick={() => setActivePane(i)} title={`Alt+${i + 1}`}
                  className={`flex max-w-[16rem] items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs ${i === activePane ? "bg-[var(--panel)] text-[var(--fg)]" : "text-[var(--muted)] hover:bg-[var(--panel)]"}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${states[i].running ? "animate-pulse bg-[var(--accent)]" : states[i].threadId ? "bg-[var(--green)]" : "bg-[var(--faint)]"}`} />
                  <span className="truncate">{titleOf(states[i].threadId) ?? t("Новый чат")}</span>
                  <span className="font-mono text-[10px] text-[var(--faint)]">{states[i].running ? t("работает") : t("готов")} ⌥{i + 1}</span>
                </button>
              ))}
            </div>
          )}
          <span className="flex-1" />
          <div className="flex items-center rounded-lg bg-[var(--panel)] p-0.5" title={t("Сколько чатов на экране")}>
            {([1, 2, 4] as const).map((l) => (
              <button key={l} onClick={() => switchLayout(l)}
                className={`grid h-7 w-8 place-items-center rounded-md ${layout === l ? "bg-[var(--panel-2)] text-[var(--accent)]" : "text-[var(--faint)] hover:text-[var(--fg)]"}`}>
                <LayoutIcon n={l} />
              </button>
            ))}
          </div>
          <button
            onClick={() => setFilesOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm hover:bg-[var(--panel)] ${filesOpen ? "bg-[var(--panel)] text-[var(--fg)]" : "text-[var(--muted)]"}`}
            title={t("Панель: файлы, действия агента, сеть, сессии")}
            data-side-toggle
          >
            <Icon name="file" size={15} className="text-[var(--teal)]" />
            {t("Панель")}
            {act.files.length > 0 && <span className="rounded-md bg-[var(--panel-2)] px-1.5 font-mono text-[11px] text-[var(--teal)]">{act.files.length}</span>}
            {states.some((s) => s.waiting) && <span className="h-1.5 w-1.5 rounded-full bg-[var(--yellow)] shadow-[0_0_6px_var(--yellow)]" title={t("Агент ждёт разрешения")} />}
          </button>
        </div>

        <div ref={gridRef} className="relative grid min-h-0 flex-1" style={gridStyle}>
          {layout !== 1 && (
            <div onPointerDown={startResize("col")} onDoubleClick={() => setCol(0.5)} data-splitter="col" title={t("Тяни, чтобы изменить ширину; двойной клик — поровну")}
              className="relative z-10 cursor-col-resize bg-[var(--border)]/60 hover:bg-[var(--accent)]/60" style={{ gridColumn: 2, gridRow: "1 / -1" }} />
          )}
          {layout === 4 && (
            <div onPointerDown={startResize("row")} onDoubleClick={() => setRow(0.5)} data-splitter="row" title={t("Тяни, чтобы изменить высоту; двойной клик — поровну")}
              className="relative z-10 cursor-row-resize bg-[var(--border)]/60 hover:bg-[var(--accent)]/60" style={{ gridRow: 2, gridColumn: "1 / -1" }} />
          )}
          {handles.map((h, i) => {
            const shown = visible.includes(i);
            const slot = layout === 1 ? 0 : slots.indexOf(i);
            const over = drag && drag.pane !== i && drag.over === slot;
            return (
              <div key={i} data-slot={shown ? slot : undefined} data-pane={i} style={shown ? place(i) : undefined}
                className={`${shown ? "flex" : "hidden"} relative min-h-0 min-w-0 flex-col bg-[var(--bg)] ${drag?.pane === i ? "opacity-50" : ""}`}>
                {over && <div className="pointer-events-none absolute inset-0 z-20 border-2 border-dashed border-[var(--accent)] bg-[var(--accent)]/10" />}
                <Pane
                  handleRef={h}
                  api={api}
                  connected={connected}
                  models={models}
                  ndModels={ndModels}
                  defaultSel={defaultSel}
                  limits={limits}
                  command={commands[i]}
                  title={titleOf(states[i].threadId)}
                  active={i === activePane}
                  compact={layout !== 1}
                  closable={layout !== 1}
                  onFocus={onFocus[i]}
                  onClose={onClose[i]}
                  onState={onState[i]}
                  onThreadsChanged={loadThreads}
                  onGrip={onGrip[i]}
                />
              </div>
            );
          })}
        </div>
      </main>

      {drag && (
        <div className="pointer-events-none fixed z-50 rounded-lg border border-[var(--accent)]/60 bg-[var(--panel)] px-3 py-1.5 text-sm shadow-2xl shadow-black/60"
          style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {titleOf(states[drag.pane].threadId) ?? t("Новый чат")}
        </div>
      )}
      {settingsOpen && <Settings email={email} account={account} models={models} ndModels={ndModels} reloadNeuralDeep={loadNeuralDeep} request={request} loginEvent={loginEvent} onClose={() => setSettingsOpen(false)} />}
      {filesOpen && (
        <SidePanel tab={sideTab} setTab={chooseSideTab} act={act} states={states} visible={visible} activePane={activePane}
          titleOf={titleOf} readFile={readFile} onFocusPane={focusPane} snapshotNow={snapshotNow} restore={restoreSnapshot} onClose={() => setFilesOpen(false)} />
      )}
    </div>
  );
}

function LayoutIcon({ n }: { n: Layout }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="1.5" y="2" width="13" height="12" rx="2" />
      {n >= 2 && <path d="M8 2v12" />}
      {n === 4 && <path d="M1.5 8h13" />}
    </svg>
  );
}
