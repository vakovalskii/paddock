// Картинки из файлов харнесса (генерации, вложения): браузер тянет их через fs/readFile окна и показывает миниатюрами.
import { createContext, useContext, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { Icon } from "./icons";

type Reader = (path: string) => Promise<string>; // → data: URL
export const ImageReader = createContext<Reader | null>(null);

const cache = new Map<string, Promise<string>>();
const mime = (p: string) => (/\.jpe?g$/i.test(p) ? "image/jpeg" : /\.webp$/i.test(p) ? "image/webp" : /\.gif$/i.test(p) ? "image/gif" : "image/png");

export function makeReader(request: (m: string, p: unknown) => Promise<any>): Reader {
  return (path) => {
    if (!cache.has(path))
      cache.set(path, request("fs/readFile", { path }).then((r) => `data:${mime(path)};base64,${r.dataBase64}`).catch((e) => {
        cache.delete(path);
        throw e;
      }));
    return cache.get(path)!;
  };
}

export const isLocalImage = (src: string) => src.startsWith("/") && /\.(png|jpe?g|webp|gif)$/i.test(src);

export function LocalImage({ path, alt, size = "md" }: { path: string; alt?: string; size?: "sm" | "md" }) {
  const read = useContext(ImageReader);
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!read) return;
    read(path).then(setSrc).catch((e) => setErr(e.message));
  }, [read, path]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const box = size === "sm" ? "h-24 w-24" : "max-h-80 max-w-full";
  if (err) return <span className="inline-block rounded-lg border border-[var(--border)] px-2 py-1 font-mono text-xs text-[var(--red)]">{path.split("/").pop()}: {err}</span>;
  if (!src) return <span className={`inline-block animate-pulse rounded-xl bg-[var(--panel-2)] ${size === "sm" ? "h-24 w-24" : "h-48 w-48"}`} />;

  return (
    <>
      <button onClick={() => setOpen(true)} title={alt || path} className="group/img relative inline-block overflow-hidden rounded-xl border border-[var(--border)] align-top">
        <img src={src} alt={alt ?? ""} className={`${box} object-cover transition-transform group-hover/img:scale-[1.02]`} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-6" onClick={() => setOpen(false)}>
          <img src={src} alt={alt ?? ""} className="max-h-[85vh] max-w-[92vw] rounded-lg shadow-2xl" />
          <div className="flex items-center gap-3 font-mono text-xs text-[var(--muted)]" onClick={(e) => e.stopPropagation()}>
            <span>{path}</span>
            <a href={src} download={path.split("/").pop()} className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 hover:text-[var(--fg)]">
              <Icon name="arrowUp" size={12} className="rotate-180" /> {t("download")}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
