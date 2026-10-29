import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { Icon } from "./icons";

export type Model = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
  provider?: string; // нет — подписка ChatGPT (провайдер openai)
  context?: number | null;
};
export type Selection = { model: string; effort: string; provider?: string };

const groupName = (p?: string) => (p === "neuraldeep" ? "NeuralDeep" : "ChatGPT");
const same = (m: Model, v: Selection | null) => !!v && m.model === v.model && (m.provider ?? "openai") === (v.provider ?? "openai");

export function ModelPicker({ models, value, onChange }: { models: Model[]; value: Selection | null; onChange: (s: Selection) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = models.find((m) => same(m, value));
  const groups = [...new Set(models.map((m) => m.provider))];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[15px] font-medium hover:bg-[var(--panel)]"
      >
        {current?.displayName ?? value?.model ?? t("Model")}
        {value?.provider === "neuraldeep" && <span className="rounded-md bg-[var(--teal)]/15 px-1.5 py-0.5 font-mono text-[11px] text-[var(--teal)]">nd</span>}
        {value?.effort && <span className="rounded-md bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--accent)]">{value.effort}</span>}
        <Icon name="chevron" size={15} className={`text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div data-picker-open className="absolute left-0 top-full z-30 mt-1.5 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl shadow-black/50">
          <div className="max-h-80 overflow-y-auto p-1.5">
            {groups.map((g) => (
              <div key={g ?? "openai"}>
                {groups.length > 1 && <div className="px-2.5 pb-1 pt-2 text-[10.5px] uppercase tracking-wider text-[var(--faint)]">{groupName(g)}</div>}
            {models.filter((m) => m.provider === g).map((m) => (
              <button
                key={`${m.provider ?? "openai"}:${m.id}`}
                onClick={() => {
                  const keep = m.supportedReasoningEfforts.some((e) => e.reasoningEffort === value?.effort);
                  onChange({ model: m.model, effort: keep && value ? value.effort : m.defaultReasoningEffort, provider: m.provider });
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--panel-2)] ${same(m, value) ? "bg-[var(--panel-2)]" : ""}`}
              >
                <span className="mt-0.5 w-4 shrink-0 text-[var(--accent)]">{same(m, value) && <Icon name="check" size={15} />}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {m.displayName}
                    {m.isDefault && <span className="text-[10px] uppercase tracking-wide text-[var(--faint)]">default</span>}
                  </span>
                  {m.description && <span className="block text-xs leading-snug text-[var(--muted)]">{m.description}</span>}
                </span>
              </button>
            ))}
              </div>
            ))}
          </div>
          {current && current.supportedReasoningEfforts.length > 0 && (
            <div className="border-t border-[var(--border)] p-2.5">
              <div className="mb-1.5 px-0.5 text-[11px] uppercase tracking-wider text-[var(--faint)]">{t("Reasoning effort")}</div>
              <div className="flex flex-wrap gap-1">
                {current.supportedReasoningEfforts.map((e) => (
                  <button
                    key={e.reasoningEffort}
                    title={e.description}
                    onClick={() => onChange({ model: current.model, effort: e.reasoningEffort, provider: current.provider })}
                    className={`rounded-md px-2 py-1 font-mono text-xs ${
                      e.reasoningEffort === value?.effort
                        ? "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-black"
                        : "bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {e.reasoningEffort}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
