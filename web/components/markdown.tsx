// Markdown ответов: GFM, подсветка кода (highlight.js через rehype), блок кода с языком и кнопкой копирования.
import { useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { t } from "@/lib/i18n";
import { Icon } from "./icons";
import { isLocalImage, LocalImage } from "./local-image";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as any).props.children);
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = (Array.isArray(children) ? children[0] : children) as any;
  const lang = /language-([\w+-]+)/.exec(code?.props?.className ?? "")?.[1];
  const copy = async () => {
    await navigator.clipboard.writeText(textOf(code?.props?.children).replace(/\n$/, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="codeblock group/code overflow-hidden rounded-xl border border-[var(--border)] bg-[#0f0f0e]">
      <div className="flex items-center justify-between border-b border-[var(--border)]/70 px-3 py-1.5 font-mono text-[11px] text-[var(--faint)]">
        <span>{lang ?? "text"}</span>
        <button onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--panel-2)] hover:text-[var(--fg)]">
          {copied ? <Icon name="check" size={12} className="text-[var(--green)]" /> : <Icon name="copy" size={12} />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (isLocalImage(url) ? url : defaultUrlTransform(url))} // javascript: и прочее режется как раньше
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a: ({ node, ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" />,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          // ![…](/workspace/…/x.png) — файл у харнесса, показываем миниатюрой
          img: ({ src, alt }) => (typeof src === "string" && isLocalImage(src) ? <LocalImage path={src} alt={alt} /> : <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="max-h-80 rounded-xl" />),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

const extLang: Record<string, string> = {
  py: "python", ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", json: "json", md: "markdown",
  sh: "bash", bash: "bash", yml: "yaml", yaml: "yaml", toml: "ini", css: "css", html: "xml", go: "go", rs: "rust",
  sql: "sql", dockerfile: "dockerfile", conf: "nginx", env: "bash", txt: "text",
};

export function langOf(path: string): string {
  const base = path.split("/").pop()!.toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  return extLang[base.split(".").pop() ?? ""] ?? "text";
}

// Файл целиком как блок кода — та же подсветка, что и в ответах.
export function FileView({ path, content }: { path: string; content: string }) {
  if (langOf(path) === "markdown") return <Markdown text={content} />;
  const fence = "`".repeat(Math.max(3, ...(content.match(/`+/g) ?? []).map((m) => m.length + 1)));
  return <Markdown text={`${fence}${langOf(path)}\n${content}\n${fence}`} />;
}
