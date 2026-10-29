// Правая панель «как agentbelt»: Файлы · Действия · Сеть · Сессии. Всё — по активному окну, кроме сети и сессий.
import { useEffect, useMemo, useState } from "react";
import type { Action, ToolKind } from "@/lib/messages";
import { fmtDuration } from "@/lib/format";
import { FilesPanel } from "./files-panel";
import { t, locale } from "@/lib/i18n";
import { Icon } from "./icons";
import { store } from "@/lib/store";
import type { PaneState } from "./pane";

export type SideTab = "files" | "actions" | "net" | "sessions";
type Snapshot = { id: string; name: string; data: SnapshotData; createdAt: number };
// threads — по номеру окна (как в localStorage), slots — где какое окно на сетке, active — окно в фокусе.
export type SnapshotData = { layout: 1 | 2 | 4; threads: (string | null)[]; slots: number[]; col: number; row: number; active: number };

const kindLook: Record<ToolKind, { label: string; color: string }> = {
  shell: { label: "bash", color: "var(--yellow)" },
  read: { label: "reads", color: "var(--blue)" },
  search: { label: "search", color: "var(--pink)" },
  list: { label: "list", color: "var(--blue)" },
  patch: { label: "edits", color: "var(--green)" },
  mcp: { label: "mcp", color: "var(--teal)" },
  web: { label: "web", color: "var(--teal)" },
  tool: { label: "tool", color: "var(--muted)" },
};

const SIDE_DEFAULT = 480;
const SIDE_MIN = 320;

export function SidePanel({ tab, setTab, act, states, visible, activePane, titleOf, readFile, onFocusPane, snapshotNow, restore, onClose }: {
  tab: SideTab;
  setTab: (t: SideTab) => void;
  act: PaneState;
  states: PaneState[];
  visible: number[];
  activePane: number;
  titleOf: (id: string | null) => string | null;
  readFile: (path: string) => Promise<string>;
  onFocusPane: (i: number) => void;
  snapshotNow: () => SnapshotData;
  restore: (d: SnapshotData) => void;
  onClose: () => void;
}) {
  // Desktop width is dragged by the left edge and remembered; on narrow screens the panel covers the chat.
  const [width, setWidth] = useState(() => store.get<number>("paddock.sideWidth", SIDE_DEFAULT));
  const resize = (w: number) => {
    const v = Math.round(Math.min(Math.max(w, SIDE_MIN), window.innerWidth * 0.7));
    setWidth(v);
    store.set("paddock.sideWidth", v);
  };
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (m: PointerEvent) => resize(window.innerWidth - m.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const tabs: [SideTab, string, number | null][] = [
    ["files", t("Files"), act.files.length || null],
    ["actions", t("Actions"), act.actions.length || null],
    ["net", t("Network"), null],
    ["sessions", t("Sessions"), states.filter((s) => s.running).length || null],
  ];
  return (
    <aside style={{ "--side-w": `${width}px` } as React.CSSProperties}
      className="fixed inset-y-0 right-0 z-20 flex w-full max-w-[34rem] flex-col border-l border-[var(--border)] bg-[var(--sidebar)] lg:relative lg:w-[var(--side-w)] lg:max-w-none lg:shrink-0">
      <div onPointerDown={startResize} onDoubleClick={() => resize(SIDE_DEFAULT)} title={t("Drag to resize, double-click to reset")} data-side-resize
        className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize hover:bg-[var(--accent)]/30 lg:block" />
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-[var(--border)]/60 px-2">
        {tabs.map(([id, label, n]) => (
          <button key={id} onClick={() => setTab(id)} data-side-tab={id}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${tab === id ? "bg-[var(--panel)] text-[var(--fg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}>
            {label}
            {n != null && <span className="rounded bg-[var(--panel-2)] px-1 font-mono text-[10.5px] text-[var(--faint)]">{n}</span>}
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={onClose} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--panel)]" title={t("Close")}>
          <Icon name="plus" size={16} className="rotate-45" />
        </button>
      </div>
      {tab === "files" && <FilesPanel files={act.files} cwd={act.cwd} readFile={readFile} />}
      {tab === "actions" && <ActionsTab act={act} title={titleOf(act.threadId)} />}
      {tab === "net" && <NetTab />}
      {tab === "sessions" && <SessionsTab states={states} visible={visible} activePane={activePane} titleOf={titleOf} onFocusPane={onFocusPane} snapshotNow={snapshotNow} restore={restore} />}
    </aside>
  );
}

// Лента действий активного окна: фильтр по типу со счётчиками, упавшие — красным, клик — вывод или дифф.
function ActionsTab({ act, title }: { act: PaneState; title: string | null }) {
  const [filter, setFilter] = useState<ToolKind | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c = new Map<ToolKind, number>();
    for (const a of act.actions) c.set(a.kind, (c.get(a.kind) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [act.actions]);
  const list = act.actions.filter((a) => filter === "all" || a.kind === filter);
  const failed = act.actions.filter((a) => a.ok === false).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-[var(--border)]/60 px-3 py-2.5">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{title ?? t("New chat")}</div>
        <div className="font-mono text-[11.5px] text-[var(--muted)]">
          {act.running ? <span className="text-[var(--accent)]">{t("working")}</span> : act.waiting ? <span className="text-[var(--yellow)]">{t("waiting for approval")}</span> : t("done")}
          {" · "}{t("{n} actions", { n: act.actions.length })}{failed > 0 && <span className="text-[var(--red)]"> · {t("{n} failed", { n: failed })}</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {([["all", act.actions.length], ...counts] as [ToolKind | "all", number][]).map(([k, n]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${filter === k ? "border-[var(--accent)] text-[var(--fg)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"}`}>
              {k === "all" ? "all" : kindLook[k].label} {n}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1 font-mono text-[12px]">
        {list.length === 0 && <p className="px-3 py-3 font-sans text-sm text-[var(--faint)]">{t("The agent hasn't run anything in this chat yet.")}</p>}
        {list.map((a) => <ActionRow key={a.id} a={a} open={open === a.id} toggle={() => setOpen(open === a.id ? null : a.id)} />)}
      </div>
    </div>
  );
}

function ActionRow({ a, open, toggle }: { a: Action; open: boolean; toggle: () => void }) {
  const look = kindLook[a.kind];
  const time = a.at ? new Date(a.at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const body = a.diff || a.output;
  return (
    <div>
      <button onClick={toggle} className={`flex w-full items-center gap-2.5 px-3 py-1 text-left hover:bg-[var(--panel)] ${open ? "bg-[var(--panel)]" : ""}`}>
        <span className="w-14 shrink-0 text-[var(--faint)]">{time}</span>
        <span className="w-12 shrink-0" style={{ color: look.color }}>{look.label}</span>
        <span className={`min-w-0 flex-1 truncate ${a.ok === false ? "text-[var(--red)]" : "text-[var(--fg)]/90"}`}>
          {a.ok === false && "✗ "}{a.ok === null && "… "}{a.title}
        </span>
        {a.durationMs != null && <span className="shrink-0 text-[10.5px] text-[var(--faint)]">{fmtDuration(a.durationMs)}</span>}
      </button>
      {open && (
        <pre className="mx-3 mb-2 max-h-80 overflow-auto rounded-lg bg-[var(--bg)] p-2 text-[11.5px] leading-relaxed">
          {body ? body.split("\n").map((l, i) => {
            const c = !a.diff ? "text-[var(--muted)]" : l.startsWith("+") ? "text-[var(--green)]" : l.startsWith("-") ? "text-[var(--red)]" : l.startsWith("@@") ? "text-[var(--blue)]" : "text-[var(--muted)]";
            return <div key={i} className={`whitespace-pre-wrap break-words ${c}`}>{l || " "}</div>;
          }) : <span className="text-[var(--faint)]">{t("(no output)")}</span>}
        </pre>
      )}
    </div>
  );
}

type Probe = { ms: number | null; status: number | null; state: "ok" | "blocked" | "dead" };
type Net = { checkedAt: number; chain: Record<string, Probe>; proxies: { name: string; results: Record<string, Probe> }[]; exit: { country: string | null; org: string | null; ms: number } | null };
const endpoints = [["chatgpt", "chatgpt"], ["openai", "openai"], ["neuraldeep", "neuraldeep"]] as const;

// Сеть: каждый прокси × API, куда ходят агенты; первая строка — цепочка, которой агенты ходят на самом деле.
function NetTab() {
  const [net, setNet] = useState<Net | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = (force = false) => {
    setBusy(true);
    fetch(`/api/net${force ? "?force=1" : ""}`).then((r) => r.json()).then((j) => (j.error ? setError(j.error) : (setNet(j), setError("")))).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => {
    load();
    const t = setInterval(() => load(), 60_000);
    return () => clearInterval(t);
  }, []);

  const cell = (p: Probe | undefined) =>
    !p ? <span className="text-[var(--faint)]">—</span>
      : p.state === "dead" ? <span className="text-[var(--red)]">dead</span>
      : p.state === "blocked" ? <span className="text-[var(--yellow)]" title={t("403: blocked in this region")}>403 {p.ms}ms</span>
      : <span className={p.ms! > 1500 ? "text-[var(--yellow)]" : "text-[var(--green)]"}>{p.ms}ms</span>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[12.5px]">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{t("Agent network")}</span>
        <button onClick={() => load(true)} disabled={busy} className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--panel)] disabled:opacity-40" title={t("Check now")}>
          <Icon name="refresh" size={13} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
      {!net && !error && <p className="text-sm text-[var(--faint)]">{t("checking each proxy…")}</p>}
      {net && (
        <>
          {net.exit && (
            <p className="mb-3 font-mono text-[12px] text-[var(--muted)]">
              {t("agents → egress →")} <span className="text-[var(--fg)]">{net.exit.country ?? "?"}</span>{net.exit.org && <span className="text-[var(--faint)]"> · {net.exit.org.replace(/^AS\d+\s*/, "")}</span>} <span className="text-[var(--green)]">✓ {net.exit.ms}ms</span>
            </p>
          )}
          <table className="w-full font-mono text-[12px]">
            <thead>
              <tr className="text-left text-[var(--faint)]">
                <th className="pb-1 font-normal">{t("proxy")}</th>
                {endpoints.map(([id, label]) => <th key={id} className="pb-1 font-normal">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--border)]/60">
                <td className="py-1 text-[var(--accent)]" title={t("Failover chain: this is how agents connect")}>● {t("chain")}</td>
                {endpoints.map(([id]) => <td key={id}>{cell(net.chain[id])}</td>)}
              </tr>
              {net.proxies.map((p, i) => {
                const dead = endpoints.every(([id]) => p.results[id]?.state === "dead");
                return (
                  <tr key={p.name}>
                    <td className="py-1"><span className={dead ? "text-[var(--red)]" : "text-[var(--muted)]"}>{dead ? "○" : "●"}</span> {p.name}<span className="text-[var(--faint)]"> #{i + 1}</span></td>
                    {endpoints.map(([id]) => <td key={id}>{cell(p.results[id])}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-snug text-[var(--faint)]">
            {t("Checked at {time} from the server, every minute.", { time: new Date(net.checkedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}
            {" "}{t("401/404 without a key = API reachable; 403 = region block; dead = proxy not responding. Proxy order and addresses: Settings → Proxy (admin).")}
          </p>
        </>
      )}
    </div>
  );
}

// Сессии: что открыто в окнах и в каком состоянии (работает / ждёт разрешения / готов) + снимки раскладок.
function SessionsTab({ states, visible, activePane, titleOf, onFocusPane, snapshotNow, restore }: {
  states: PaneState[];
  visible: number[];
  activePane: number;
  titleOf: (id: string | null) => string | null;
  onFocusPane: (i: number) => void;
  snapshotNow: () => SnapshotData;
  restore: (d: SnapshotData) => void;
}) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [name, setName] = useState("");
  const load = () => fetch("/api/snapshots").then((r) => r.json()).then((j) => setSnaps(j.snapshots ?? [])).catch(() => setSnaps([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data = snapshotNow();
    const label = name.trim() || t("snapshot {date}", { date: new Date().toLocaleString(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) });
    await fetch("/api/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: label, data }) });
    setName("");
    load();
  };
  const remove = async (id: string) => {
    await fetch(`/api/snapshots?id=${id}`, { method: "DELETE" });
    load();
  };

  const status = (s: PaneState) =>
    s.waiting ? { text: t("waiting for approval"), color: "var(--yellow)" } : s.running ? { text: t("working"), color: "var(--accent)" } : s.threadId ? { text: t("done"), color: "var(--green)" } : { text: t("empty"), color: "var(--faint)" };

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-[13px]">
      <section className="space-y-1.5">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{t("Panes")}</div>
        {states.map((s, i) => {
          const st = status(s);
          const shown = visible.includes(i);
          return (
            <button key={i} onClick={() => onFocusPane(i)}
              className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left ${i === activePane ? "border-[var(--accent)]/60 bg-[var(--panel)]" : "border-[var(--border)] hover:bg-[var(--panel)]"} ${shown ? "" : "opacity-60"}`}>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: st.color, boxShadow: s.running || s.waiting ? `0 0 6px ${st.color}` : undefined }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{titleOf(s.threadId) ?? t("New chat")}</span>
                <span className="block truncate font-mono text-[11px] text-[var(--faint)]">
                  <span style={{ color: st.color }}>{st.text}</span> · {s.model ?? "—"} · {(s.cwd ?? "").replace(/^\/workspace\/?/, "~/") || "~/"} · {t("{n} actions", { n: s.actions.length })}
                </span>
              </span>
              <span className="font-mono text-[10.5px] text-[var(--faint)]">⌥{i + 1}</span>
            </button>
          );
        })}
      </section>

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{t("Layout snapshots")}</div>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("name, e.g. “release”")}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50" />
          <button className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-[var(--panel-2)]">{t("Save")}</button>
        </form>
        {snaps?.length === 0 && <p className="text-xs text-[var(--faint)]">{t("A layout snapshot remembers how many panes you have, which chats are in them and where the splits are. Restore it in one click, on any device.")}</p>}
        {snaps?.map((sn) => (
          <div key={sn.id} className="rounded-xl border border-[var(--border)] p-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{sn.name}</span>
              <button onClick={() => restore(sn.data)} className="rounded-md px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--panel-2)]">{t("Restore")}</button>
              <button onClick={() => remove(sn.id)} className="rounded-md p-1 text-[var(--faint)] hover:bg-[var(--panel-2)] hover:text-[var(--red)]" title={t("Remove")}>
                <Icon name="plus" size={13} className="rotate-45" />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(sn.data.layout === 1 ? [sn.data.threads[sn.data.active]] : sn.data.slots.slice(0, sn.data.layout).map((i) => sn.data.threads[i])).map((th, i) => (
                <span key={i} className="max-w-[13rem] truncate rounded-md bg-[var(--panel-2)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">{titleOf(th) ?? t("empty")}</span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
