// Редактор вставленной картинки, как разметка в macOS: карандаш, прямоугольник, овал, стрелка, текст, обрезка, поворот,
// 7 цветов, отмена, Cancel/Done. Всё — список операций поверх оригинала: отмена = перерисовать без последней.
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { Icon } from "./icons";

type Pt = { x: number; y: number };
type Tool = "pen" | "rect" | "ellipse" | "arrow" | "text" | "crop";
type Op =
  | { kind: "pen"; color: string; pts: Pt[] }
  | { kind: "rect" | "ellipse" | "arrow"; color: string; a: Pt; b: Pt }
  | { kind: "text"; color: string; at: Pt; text: string; size: number }
  | { kind: "crop"; a: Pt; b: Pt }
  | { kind: "rotate" };

const COLORS = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#0a84ff", "#ffffff", "#000000"];
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "pen", label: "Pen", icon: "✎" },
  { id: "rect", label: "Rectangle", icon: "▭" },
  { id: "ellipse", label: "Ellipse", icon: "◯" },
  { id: "arrow", label: "Arrow", icon: "↗" },
  { id: "text", label: "Text", icon: "T" },
  { id: "crop", label: "Crop", icon: "⌗" },
];

const box = (a: Pt, b: Pt) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

function drawOp(ctx: CanvasRenderingContext2D, op: Op, scale: number) {
  if (op.kind === "crop" || op.kind === "rotate") return;
  ctx.strokeStyle = ctx.fillStyle = op.color;
  ctx.lineWidth = Math.max(3, 4 * scale);
  ctx.lineCap = ctx.lineJoin = "round";
  if (op.kind === "pen") {
    ctx.beginPath();
    op.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  } else if (op.kind === "rect") {
    const r = box(op.a, op.b);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  } else if (op.kind === "ellipse") {
    const r = box(op.a, op.b);
    ctx.beginPath();
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (op.kind === "arrow") {
    const { a, b } = op;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(14, 18 * scale);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(ang - 0.45), b.y - head * Math.sin(ang - 0.45));
    ctx.lineTo(b.x - head * Math.cos(ang + 0.45), b.y - head * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  } else if (op.kind === "text") {
    ctx.font = `600 ${op.size}px -apple-system, Inter, sans-serif`;
    ctx.textBaseline = "top";
    ctx.lineWidth = Math.max(3, op.size / 8);
    ctx.strokeStyle = op.color === "#000000" ? "#ffffff" : "#000000";
    ctx.strokeText(op.text, op.at.x, op.at.y);
    ctx.fillText(op.text, op.at.x, op.at.y);
  }
}

// Оригинал + операции → холст. Обрезка и поворот меняют сам холст, рисование ложится поверх.
function render(img: HTMLImageElement, ops: Op[]): HTMLCanvasElement {
  let c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  for (const op of ops) {
    if (op.kind === "crop") {
      const r = box(op.a, op.b);
      if (r.w < 4 || r.h < 4) continue;
      const n = document.createElement("canvas");
      n.width = Math.round(r.w);
      n.height = Math.round(r.h);
      n.getContext("2d")!.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      c = n;
    } else if (op.kind === "rotate") {
      const n = document.createElement("canvas");
      n.width = c.height;
      n.height = c.width;
      const x = n.getContext("2d")!;
      x.translate(n.width, 0);
      x.rotate(Math.PI / 2);
      x.drawImage(c, 0, 0);
      c = n;
    } else drawOp(c.getContext("2d")!, op, Math.max(c.width, c.height) / 1200);
  }
  return c;
}

export function ImageEditor({ src, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (png: Blob, dataUrl: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [draft, setDraft] = useState<Op | null>(null);
  const [typing, setTyping] = useState<{ at: Pt; screen: Pt; text: string } | null>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);

  // Перерисовка: готовые операции → base, поверх — черновик (то, что сейчас тянем мышью).
  useEffect(() => {
    if (!img || !view.current) return;
    base.current = render(img, ops);
    const v = view.current;
    v.width = base.current.width;
    v.height = base.current.height;
    const ctx = v.getContext("2d")!;
    ctx.drawImage(base.current, 0, 0);
    if (draft?.kind === "crop") {
      const r = box(draft.a, draft.b);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, v.width, v.height);
      ctx.drawImage(base.current, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
    } else if (draft) drawOp(ctx, draft, Math.max(v.width, v.height) / 1200);
  }, [img, ops, draft]);

  const toImage = (e: React.PointerEvent): Pt => {
    const r = view.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * view.current!.width, y: ((e.clientY - r.top) / r.height) * view.current!.height };
  };

  const down = (e: React.PointerEvent) => {
    if (typing) return commitText();
    const p = toImage(e);
    if (tool === "text") {
      const r = view.current!.getBoundingClientRect();
      setTyping({ at: p, screen: { x: e.clientX - r.left, y: e.clientY - r.top }, text: "" });
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraft(tool === "pen" ? { kind: "pen", color, pts: [p] } : tool === "crop" ? { kind: "crop", a: p, b: p } : { kind: tool, color, a: p, b: p });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = toImage(e);
    setDraft(draft.kind === "pen" ? { ...draft, pts: [...draft.pts, p] } : "b" in draft ? { ...draft, b: p } : draft);
  };
  const up = () => {
    if (draft) setOps((o) => [...o, draft]);
    setDraft(null);
  };
  const commitText = () => {
    if (typing?.text.trim() && view.current) {
      const size = Math.max(22, Math.round(view.current.width / 28));
      setOps((o) => [...o, { kind: "text", color, at: typing.at, text: typing.text.trim(), size }]);
    }
    setTyping(null);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (typing) return;
      if (e.key === "Escape") onCancel();
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        setOps((o) => o.slice(0, -1));
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [typing, onCancel]);

  const done = () => {
    const c = base.current;
    if (!c) return;
    c.toBlob((b) => b && onDone(b, c.toDataURL("image/png")), "image/png");
  };

  const btn = "grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85" data-image-editor>
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-[var(--panel)] px-3 py-2">
        {TOOLS.map((x) => (
          <button key={x.id} onClick={() => { commitText(); setTool(x.id); }} title={t(x.label)} data-tool={x.id}
            className={`${btn} ${tool === x.id ? "bg-[var(--accent)] text-black" : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--fg)]"}`}>
            {x.icon}
          </button>
        ))}
        <button onClick={() => setOps((o) => [...o, { kind: "rotate" }])} title={t("Rotate")} className={`${btn} text-[var(--muted)] hover:bg-[var(--panel-2)]`}>⟳</button>
        <span className="mx-2 h-5 w-px bg-white/10" />
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} title={c} aria-label={c}
            className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-[var(--fg)] scale-110" : "border-white/20"}`} style={{ background: c }} />
        ))}
        <span className="mx-2 h-5 w-px bg-white/10" />
        <button onClick={() => setOps((o) => o.slice(0, -1))} disabled={!ops.length} title={t("Undo (⌘Z)")} className={`${btn} text-[var(--muted)] hover:bg-[var(--panel-2)] disabled:opacity-30`}>
          <Icon name="refresh" size={14} className="-scale-x-100" />
        </button>
        <span className="flex-1" />
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--panel-2)]">{t("Cancel")}</button>
        <button onClick={done} data-editor-done className="rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-3 py-1.5 text-sm font-medium text-black">{t("Done")}</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="relative max-h-full max-w-full">
          <canvas ref={view} onPointerDown={down} onPointerMove={move} onPointerUp={up}
            className={`block max-h-[calc(100dvh-7rem)] max-w-full touch-none rounded-lg shadow-2xl ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`} />
          {typing && (
            <input autoFocus value={typing.text} onChange={(e) => setTyping({ ...typing, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTyping(null); }}
              placeholder={t("text")} className="absolute rounded bg-black/60 px-1.5 py-0.5 text-lg font-semibold outline-none"
              style={{ left: typing.screen.x, top: typing.screen.y, color }} />
          )}
        </div>
      </div>
      {!img && <p className="pb-6 text-center text-sm text-[var(--muted)]">{t("opening image…")}</p>}
    </div>
  );
}
