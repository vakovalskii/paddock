// Вкладка «Файлы» правой панели: что агент создал, поменял или удалил в этом треде. Клик — дифф или текущее содержимое файла.
import { useEffect, useState } from "react";
import type { ChangedFile } from "@/lib/messages";
import { t } from "@/lib/i18n";
import { Icon } from "./icons";
import { FileView } from "./markdown";

const mark = {
  add: { sign: "A", color: "var(--green)", title: "added" },
  update: { sign: "M", color: "var(--yellow)", title: "modified" },
  delete: { sign: "D", color: "var(--red)", title: "deleted" },
} as const;

export function FilesPanel({ files, cwd, readFile }: {
  files: ChangedFile[];
  cwd: string | null;
  readFile: (path: string) => Promise<string>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"diff" | "file">("diff");
  const [content, setContent] = useState<{ path: string; text: string } | { path: string; error: string } | null>(null);
  const file = files.find((f) => f.path === selected) ?? null;
  const rel = (p: string) => (cwd && p.startsWith(cwd + "/") ? p.slice(cwd.length + 1) : p);

  useEffect(() => {
    if (!file || tab !== "file" || file.kind === "delete") return;
    setContent(null);
    readFile(file.path)
      .then((text) => setContent({ path: file.path, text }))
      .catch((e) => setContent({ path: file.path, error: e.message }));
    // перечитываем, когда файл снова поменяли
  }, [file?.path, file?.edits, tab, readFile]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)]/60 px-3">
        {file ? (
          <button onClick={() => setSelected(null)} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--panel)]" title={t("Back to list")}>
            <Icon name="chevron" size={15} className="rotate-90" />
          </button>
        ) : (
          <Icon name="file" size={15} className="ml-1.5 text-[var(--teal)]" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{file ? rel(file.path) : t("Files · {n}", { n: files.length })}</span>
        {file && (
          <div className="flex rounded-lg bg-[var(--panel)] p-0.5 text-xs">
            {(["diff", "file"] as const).map((tb) => (
              <button key={tb} onClick={() => setTab(tb)} className={`rounded-md px-2.5 py-1 ${tab === tb ? "bg-[var(--panel-2)] text-[var(--fg)]" : "text-[var(--muted)]"}`}>
                {tb === "diff" ? t("Diff") : t("File")}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!file && (
          <div className="p-2">
            {files.length === 0 && <p className="px-2 py-3 text-sm text-[var(--faint)]">{t("Codex hasn't changed any files in this chat yet.")}</p>}
            {files.map((f) => (
              <button key={f.path} onClick={() => { setSelected(f.path); setTab(f.kind === "delete" ? "diff" : "diff"); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--panel)]">
                <span className="w-3 shrink-0 font-mono text-xs font-bold" style={{ color: mark[f.kind].color }} title={t(mark[f.kind].title)}>{mark[f.kind].sign}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                  <span className="text-[var(--faint)]">{rel(f.path).includes("/") ? rel(f.path).replace(/[^/]+$/, "") : ""}</span>
                  {f.path.split("/").pop()}
                </span>
                {f.edits > 1 && <span className="shrink-0 font-mono text-[11px] text-[var(--faint)]">×{f.edits}</span>}
              </button>
            ))}
            {files.length > 0 && (
              <p className="px-2.5 pt-3 text-[11px] leading-snug text-[var(--faint)]">{t("Shows edits made via apply_patch. Files written by shell commands don't appear here.")}</p>
            )}
          </div>
        )}

        {file && tab === "diff" && file.kind === "add" && !/^(@@|---|\+\+\+|diff )/m.test(file.diff) && (
          <div className="p-3"><FileView path={file.path} content={file.diff} /></div>
        )}

        {file && tab === "diff" && !(file.kind === "add" && !/^(@@|---|\+\+\+|diff )/m.test(file.diff)) && (
          <pre className="p-3 font-mono text-[12px] leading-relaxed">
            {(file.diff || t("(empty diff)")).split("\n").map((l, i) => {
              const c = l.startsWith("+") && !l.startsWith("+++") ? "text-[var(--green)] bg-[var(--green)]/5"
                : l.startsWith("-") && !l.startsWith("---") ? "text-[var(--red)] bg-[var(--red)]/5"
                : l.startsWith("@@") ? "text-[var(--blue)]" : "text-[var(--muted)]";
              return <div key={i} className={`whitespace-pre-wrap break-words px-1 ${c}`}>{l || " "}</div>;
            })}
          </pre>
        )}

        {file && tab === "file" && (
          <div className="p-3">
            {file.kind === "delete" ? <p className="text-sm text-[var(--faint)]">{t("File deleted.")}</p>
              : !content || content.path !== file.path ? <p className="text-sm text-[var(--faint)]">{t("reading…")}</p>
              : "error" in content ? <p className="text-sm text-[var(--red)]">{content.error}</p>
              : <FileView path={file.path} content={content.text} />}
          </div>
        )}
      </div>
    </div>
  );
}
