import { useEffect, useMemo, useRef, useState } from "react";
import { dayGroup } from "@/lib/format";
import { getLang, setLang, t } from "@/lib/i18n";
import { AccountCard, type AccountInfo } from "./account";
import { Icon } from "./icons";

export type ThreadInfo = { id: string; title: string; updatedAt: number };

export function Sidebar({ threads, current, openIds, running, email, connected, open, onNew, listFolders, createFolder, account, loadUsage, resetLimits, onOpen, onArchive, onClose, onLogout, onSettings }: {
  threads: ThreadInfo[];
  current: string | null;
  openIds: string[];
  running: string[];
  email: string;
  connected: boolean;
  open: boolean;
  onNew: (cwd?: string) => void;
  listFolders: () => Promise<string[]>;
  createFolder: (name: string) => Promise<void>;
  account: AccountInfo | null;
  loadUsage: () => Promise<any>;
  resetLimits: (creditId: string) => Promise<string>;
  onOpen: (id: string) => void;
  onArchive: (id: string) => void;
  onClose: () => void;
  onLogout: () => void;
  onSettings: () => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const out: [string, ThreadInfo[]][] = [];
    for (const t of threads.filter((t) => t.title.toLowerCase().includes(q.toLowerCase()))) {
      const g = dayGroup(t.updatedAt);
      const last = out[out.length - 1];
      if (last?.[0] === g) last[1].push(t);
      else out.push([g, [t]]);
    }
    return out;
  }, [threads, q]);

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-10 bg-black/50 md:hidden" />}
      <aside
        className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-20 w-72 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] md:static md:flex`}
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] font-mono text-sm font-bold text-black">
            {">_"}
          </span>
          <span className="font-semibold tracking-tight">Paddock</span>
        </div>

        <div className="space-y-2 px-3 py-2">
          <NewChatMenu onNew={onNew} listFolders={listFolders} createFolder={createFolder} />
          <label className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] focus-within:bg-[var(--panel)]">
            <Icon name="search" size={15} />
            <input type="search" name="thread-search" autoComplete="off" data-1p-ignore data-lpignore="true" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search chats…")} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--faint)]" />
          </label>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {groups.map(([g, items]) => (
            <div key={g} className="mt-3">
              <div className="px-3 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--faint)]">{g}</div>
              {items.map((th) => (
                <div key={th.id} className="group/t relative">
                <button
                  onClick={() => onOpen(th.id)}
                  className={`relative block w-full truncate rounded-lg py-1.5 pl-3 pr-8 text-left text-sm ${
                    th.id === current ? "bg-[var(--panel-2)] text-[var(--fg)]" : "text-[var(--fg)]/80 hover:bg-[var(--panel)]"
                  }`}
                >
                  {th.id === current && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[var(--accent)]" />}
                  {running.includes(th.id) ? (
                    <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] align-middle" title={t("working")} />
                  ) : openIds.includes(th.id) ? (
                    <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--green)] align-middle" title={t("open in a pane")} />
                  ) : null}
                  {th.title}
                </button>
                <button onClick={() => onArchive(th.id)} title={t("Archive")} data-archive
                  className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md p-1 text-[var(--faint)] hover:bg-[var(--panel-2)] hover:text-[var(--fg)] group-hover/t:block">
                  <Icon name="archive" size={13} />
                </button>
                </div>
              ))}
            </div>
          ))}
          {threads.length === 0 && <p className="px-3 pt-4 text-sm text-[var(--faint)]">{t("Nothing here yet")}</p>}
        </nav>

        <AccountCard info={account} loadUsage={loadUsage} resetLimits={resetLimits} />

        <div className="flex items-center gap-2.5 border-t border-[var(--border)] px-4 py-3">
          <span className="relative grid h-7 w-7 place-items-center rounded-full bg-[var(--panel-2)] text-xs font-semibold uppercase">
            {email[0]}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--sidebar)] ${connected ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--muted)]">{email}</span>
          <button onClick={onSettings} title={t("Settings")} className="rounded-md p-1.5 text-[var(--faint)] hover:bg-[var(--panel)] hover:text-[var(--fg)]">
            <Icon name="gear" size={15} />
          </button>
          <button onClick={() => setLang(getLang() === "ru" ? "en" : "ru")} title={t("Interface language")} data-lang-toggle
            className="rounded-md px-1.5 py-1 font-mono text-[11px] font-semibold text-[var(--faint)] hover:bg-[var(--panel)] hover:text-[var(--fg)]">
            {getLang() === "ru" ? "RU" : "EN"}
          </button>
          <button onClick={onLogout} title={t("Sign out")} className="rounded-md p-1.5 text-[var(--faint)] hover:bg-[var(--panel)] hover:text-[var(--fg)]">
            <Icon name="logout" size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}

// «Новый чат» + меню: в какой папке /workspace его начать, или создать новую папку.
function NewChatMenu({ onNew, listFolders, createFolder }: {
  onNew: (cwd?: string) => void;
  listFolders: () => Promise<string[]>;
  createFolder: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setFolders(null);
    listFolders().then(setFolders).catch(() => setFolders([]));
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, listFolders]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!/^[\p{L}\p{N}._ -]+$/u.test(n) || n.startsWith(".")) return setError(t("letters, digits, space, . _ -"));
    try {
      await createFolder(n);
      setOpen(false);
      setName("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    }
  };

  const item = "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-[var(--panel-2)]";

  return (
    <div ref={ref} className="relative">
      <div className="flex overflow-hidden rounded-lg bg-[var(--panel)]">
        <button onClick={() => onNew()} className="flex flex-1 items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-[var(--panel-2)]">
          <Icon name="plus" size={16} className="text-[var(--accent)]" />
          {t("New chat")}
        </button>
        <button onClick={() => setOpen((o) => !o)} title={t("New chat in folder")} className="border-l border-[var(--border)] px-2.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--fg)]">
          <Icon name="folder" size={15} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-2xl shadow-black/50">
          <div className="px-2.5 pb-1 pt-1 text-[10.5px] uppercase tracking-wider text-[var(--faint)]">{t("New chat in folder")}</div>
          <button onClick={() => { onNew(); setOpen(false); }} className={item}>
            <Icon name="folder" size={14} className="text-[var(--blue)]" />
            <span className="font-mono text-[13px]">/workspace</span>
          </button>
          <div className="max-h-56 overflow-y-auto">
            {folders === null && <div className="px-2.5 py-1.5 text-xs text-[var(--faint)]">{t("loading folders…")}</div>}
            {folders?.map((f) => (
              <button key={f} onClick={() => { onNew(`/workspace/${f}`); setOpen(false); }} className={item}>
                <Icon name="folder" size={14} className="text-[var(--blue)]" />
                <span className="truncate font-mono text-[13px]">{f}</span>
              </button>
            ))}
          </div>
          <form onSubmit={create} className="mt-1 border-t border-[var(--border)] px-1 pt-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--bg)] px-2 focus-within:ring-1 focus-within:ring-[var(--accent)]/50">
              <Icon name="plus" size={14} className="text-[var(--accent)]" />
              <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder={t("new folder")}
                className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-[13px] outline-none placeholder:text-[var(--faint)]" />
              <button disabled={!name.trim()} className="text-xs text-[var(--accent)] disabled:opacity-30">{t("create")}</button>
            </div>
            {error && <div className="px-1 pt-1 text-xs text-[var(--red)]">{error}</div>}
          </form>
        </div>
      )}
    </div>
  );
}
