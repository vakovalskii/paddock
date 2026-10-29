// Настройки: вход в ChatGPT через device code прямо из морды, настройки Codex (config.toml в контейнере), пароль морды.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";
import { maskEmail, type AccountInfo } from "./account";
import { Icon } from "./icons";
import { ToolsTab } from "./tools";
import type { Model } from "./model-picker";
import { t } from "@/lib/i18n";

type Request = (method: string, params: unknown) => Promise<any>;
export type LoginEvent = { loginId: string | null; success: boolean; error: string | null };

const field = "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50";
const primary = "rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40";
const secondary = "rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--panel-2)] disabled:opacity-40";

export function Settings({ email, account, models, ndModels, reloadNeuralDeep, request, loginEvent, onClose }: {
  email: string;
  account: AccountInfo | null;
  models: Model[];
  ndModels: Model[];
  reloadNeuralDeep: () => Promise<number>;
  request: Request;
  loginEvent: LoginEvent | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"account" | "neuraldeep" | "tools" | "codex" | "proxy" | "web">("account");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const tabs = [
    ["account", "ChatGPT account"],
    ["neuraldeep", "NeuralDeep"],
    ["tools", "Tools"],
    ["codex", "Codex"],
    ["proxy", "Proxies"],
    ["web", "Paddock login"],
  ] as const;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl shadow-black/60">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <span className="font-semibold">{t("Settings")}</span>
          <span className="flex-1" />
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--panel-2)]" title={t("Close")}>
            <Icon name="plus" size={16} className="rotate-45" />
          </button>
        </div>
        <div className="flex gap-1 border-b border-[var(--border)] px-4">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm ${tab === id ? "border-[var(--accent)] text-[var(--fg)]" : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]"}`}>
              {t(label)}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "account" && <AccountTab account={account} request={request} loginEvent={loginEvent} />}
          {tab === "neuraldeep" && <NeuralDeepTab request={request} models={ndModels} reload={reloadNeuralDeep} />}
          {tab === "tools" && <ToolsTab request={request} />}
          {tab === "codex" && <CodexTab models={models} request={request} />}
          {tab === "proxy" && <ProxyTab />}
          {tab === "web" && <WebTab email={email} />}
        </div>
      </div>
    </div>
  );
}

function AccountTab({ account, request, loginEvent }: { account: AccountInfo | null; request: Request; loginEvent: LoginEvent | null }) {
  const [flow, setFlow] = useState<{ loginId: string; url: string; code: string } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!flow || !loginEvent || (loginEvent.loginId && loginEvent.loginId !== flow.loginId)) return;
    setFlow(null);
    setStatus(loginEvent.success ? { ok: true, text: t("Signed in") } : { ok: false, text: loginEvent.error ?? t("Sign-in failed") });
  }, [loginEvent, flow]);

  const startDevice = async () => {
    setStatus(null);
    try {
      const r = await request("account/login/start", { type: "chatgptDeviceCode" });
      setFlow({ loginId: r.loginId, url: r.verificationUrl, code: r.userCode });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : t("couldn't start sign-in") });
    }
  };

  const cancel = async () => {
    if (flow) await request("account/login/cancel", { loginId: flow.loginId }).catch(() => {});
    setFlow(null);
  };

  const useKey = async () => {
    try {
      await request("account/login/start", { type: "apiKey", apiKey: apiKey.trim() });
      setApiKey("");
      setStatus({ ok: true, text: t("API key saved") });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : t("key rejected") });
    }
  };

  const logout = async () => {
    await request("account/logout", undefined);
    setConfirmLogout(false);
    setStatus({ ok: true, text: t("Signed out") });
  };

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-3 rounded-xl bg-[var(--panel-2)] p-4">
        <span className={`h-2 w-2 shrink-0 rounded-full ${account?.email || account?.plan ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm">{account?.email ? maskEmail(account.email) : account?.plan ? t("account connected") : t("not connected")}</div>
          {account?.plan && <div className="text-xs text-[var(--muted)]">{t("plan")} <span className="font-mono text-[var(--accent)]">{account.plan}</span></div>}
        </div>
        {(account?.email || account?.plan) && !confirmLogout && <button onClick={() => setConfirmLogout(true)} className={secondary}>{t("Sign out")}</button>}
        {confirmLogout && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[var(--muted)]">{t("Codex will stop responding until you sign in again.")}</span>
            <button onClick={logout} className="rounded-lg bg-[var(--red)] px-2.5 py-1 font-medium text-black">{t("Sign out")}</button>
            <button onClick={() => setConfirmLogout(false)} className="rounded-lg px-2 py-1 text-[var(--muted)] hover:bg-[var(--panel)]">{t("No")}</button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-medium">{t("Sign in with ChatGPT")}</h3>
          <p className="text-sm text-[var(--muted)]">{t("Device code: open the link, sign in to ChatGPT and enter the code. No terminal needed.")}</p>
        </div>
        {!flow ? (
          <button onClick={startDevice} className={primary}>{account?.email ? t("Switch account") : t("Get code")}</button>
        ) : (
          <div className="space-y-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/[0.05] p-4">
            <div className="text-sm">
              {t("1. Open")}{" "}
              <a href={flow.url} target="_blank" rel="noreferrer noopener" className="font-mono text-[var(--accent)] underline underline-offset-2">{flow.url}</a>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {t("2. Enter the code")}
              <span className="rounded-lg bg-[var(--bg)] px-3 py-1.5 font-mono text-xl tracking-[0.2em] text-[var(--fg)]">{flow.code}</span>
              <button onClick={async () => { await navigator.clipboard.writeText(flow.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className={secondary}>
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-[var(--faint)] border-t-[var(--accent)]" />
              {t("waiting for confirmation…")}
              <span className="flex-1" />
              <button onClick={cancel} className="rounded-md px-2 py-1 hover:bg-[var(--panel-2)]">{t("Cancel")}</button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">{t("Or an OpenAI API key")}</h3>
        <div className="flex gap-2">
          <input type="password" name="openai-api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" className={field} />
          <button onClick={useKey} disabled={!apiKey.trim().startsWith("sk-")} className={secondary}>{t("Save")}</button>
        </div>
        <p className="text-xs text-[var(--faint)]">{t("The key goes straight to Codex (its auth.json in the container); Paddock doesn't store it.")}</p>
      </section>

      {status && <div className={`text-sm ${status.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{status.text}</div>}
    </div>
  );
}

type CodexConfig = {
  model: string;
  model_reasoning_effort: string;
  approval_policy: string;
  sandbox_mode: string;
  web_search: string;
  multi_agent_v2: string;
  developer_instructions: string;
};

// Функция, а не константа: подписи переводятся при рендере.
const options = () => ({
  approval_policy: [
    ["on-request", t("when the model asks; rm and git push/reset always")],
    ["never", t("never ask")],
  ],
  sandbox_mode: [
    ["danger-full-access", t("full access (the container is the sandbox)")],
    ["workspace-write", t("write to workspace only")],
    ["read-only", t("read-only")],
  ],
  multi_agent_v2: [
    ["off", t("basic: spawn and wait")],
    ["on", t("v2: also list, message, interrupt (OpenAI models only)")],
  ],
  web_search: [
    ["live", t("live search")],
    ["cached", t("OpenAI cache")],
    ["disabled", t("off")],
  ],
} as const);

function CodexTab({ models, request }: { models: Model[]; request: Request }) {
  const [cfg, setCfg] = useState<CodexConfig | null>(null);
  const [initial, setInitial] = useState<CodexConfig | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    request("config/read", {}).then((r) => {
      const c = r.config;
      const v: CodexConfig = {
        model: c.model ?? "",
        model_reasoning_effort: c.model_reasoning_effort ?? "",
        // "untrusted" is gone from Codex; an old config that still has it shows as the default.
        approval_policy: typeof c.approval_policy === "string" && c.approval_policy !== "untrusted" ? c.approval_policy : "on-request",
        sandbox_mode: c.sandbox_mode ?? "danger-full-access",
        web_search: c.web_search ?? "live",
        multi_agent_v2: c.features?.multi_agent_v2 ? "on" : "off",
        developer_instructions: c.developer_instructions ?? "",
      };
      setCfg(v);
      setInitial(v);
    }).catch((e) => setStatus({ ok: false, text: e.message }));
  }, [request]);

  if (!cfg || !initial) return <p className="text-sm text-[var(--faint)]">{status?.text ?? t("reading config.toml…")}</p>;

  const set = (k: keyof CodexConfig, v: string) => { setCfg({ ...cfg, [k]: v }); setStatus(null); };
  const model = models.find((m) => m.model === cfg.model);
  const changed = (Object.keys(cfg) as (keyof CodexConfig)[]).filter((k) => cfg[k] !== initial[k]);

  const save = async () => {
    try {
      await request("config/batchWrite", {
        // Feature flags live under [features] as booleans; everything else is a top-level string.
        edits: changed.map((k) => (k === "multi_agent_v2"
          ? { keyPath: "features.multi_agent_v2", value: cfg[k] === "on", mergeStrategy: "replace" }
          : { keyPath: k, value: cfg[k] === "" ? null : cfg[k], mergeStrategy: "replace" })),
        reloadUserConfig: true,
      });
      setInitial(cfg);
      setStatus({ ok: true, text: t("Saved. Applies to new chats.") });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : t("not saved") });
    }
  };

  const select = (k: keyof CodexConfig, items: readonly (readonly [string, string])[]) => (
    <select value={cfg[k]} onChange={(e) => set(k, e.target.value)} className={field}>
      {items.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">{t("This is")} <span className="font-mono">~/.codex/config.toml</span> {t("in your container: defaults for new chats. The model picker in the header overrides them on the fly.")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-[var(--muted)]">{t("Default model")}</span>
          {select("model", [["", t("Codex default")], ...models.map((m) => [m.model, m.displayName] as const)])}
        </label>
        <label className="space-y-1.5">
          <span className="text-xs text-[var(--muted)]">{t("Reasoning effort")}</span>
          {select("model_reasoning_effort", [["", t("model default")], ...(model?.supportedReasoningEfforts ?? models[0]?.supportedReasoningEfforts ?? []).map((e) => [e.reasoningEffort, e.reasoningEffort] as const)])}
        </label>
        <label className="space-y-1.5">
          <span className="text-xs text-[var(--muted)]">{t("When to ask for approval")}</span>
          {select("approval_policy", options().approval_policy)}
        </label>
        <label className="space-y-1.5">
          <span className="text-xs text-[var(--muted)]">{t("Sandbox")}</span>
          {select("sandbox_mode", options().sandbox_mode)}
        </label>
        <label className="space-y-1.5">
          <span className="text-xs text-[var(--muted)]">{t("Web search")}</span>
          {select("web_search", options().web_search)}
        </label>
        <label className="space-y-1.5">
          <span className="text-xs text-[var(--muted)]">{t("Sub-agents")}</span>
          {select("multi_agent_v2", options().multi_agent_v2)}
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs text-[var(--muted)]">{t("Custom instructions (appended to the system prompt)")}</span>
        <textarea value={cfg.developer_instructions} onChange={(e) => set("developer_instructions", e.target.value)} rows={5}
          placeholder={t("E.g.: answer in English, briefly; comment code in English.")} className={`${field} resize-y font-mono text-[13px]`} />
      </label>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={changed.length === 0} className={primary}>{t("Save")}</button>
        {status && <span className={`text-sm ${status.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{status.text}</span>}
      </div>
    </div>
  );
}

function WebTab({ email }: { email: string }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
    if (error) return setStatus({ ok: false, text: error.message ?? t("failed") });
    setCur("");
    setNext("");
    setStatus({ ok: true, text: t("Password changed, other sessions signed out") });
  };

  return (
    <div className="space-y-8">
    <form onSubmit={change} className="max-w-sm space-y-3" autoComplete="on">
      <h3 className="font-medium">{t("Paddock password")}</h3>
      {/* Логин для менеджера паролей: без него Chrome вписывает почту в первое попавшееся поле страницы — в поиск по чатам. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder={t("current password")} autoComplete="current-password" className={field} />
      <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t("new password, 12+ characters")} autoComplete="new-password" className={field} />
      <button disabled={!cur || next.length < 12} className={primary}>{t("Change")}</button>
      {status && <div className={`text-sm ${status.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{status.text}</div>}
    </form>
    <TwoFactor email={email} />
    </div>
  );
}

// 2FA по TOTP: пароль → QR для Authy → код из приложения подтверждает включение. Резервные коды показываем один раз.
function TwoFactor({ email }: { email: string }) {
  const session = authClient.useSession();
  // Сессия в браузере обновляется не сразу — после включения/выключения статус держим сами.
  const [override, setOverride] = useState<boolean | null>(null);
  const enabled = override ?? !!(session.data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled;
  const [pass, setPass] = useState("");
  const [setup, setSetup] = useState<{ qr: string; secret: string; backup: string[] } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : t("failed") });
    }
    setBusy(false);
  };

  const start = () => run(async () => {
    const { data, error } = await authClient.twoFactor.enable({ password: pass, issuer: "Paddock" });
    if (error || !data) throw new Error(error?.status === 400 || error?.status === 401 ? t("Wrong password") : error?.message ?? t("failed"));
    if (!("totpURI" in data)) throw new Error(t("server didn't return a TOTP"));
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setSetup({ qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }), secret, backup: data.backupCodes });
    setPass("");
    setOverride(true);
    setStatus({ ok: true, text: t("2FA enabled. Add the QR to Authy — from your next sign-in you'll be asked for a code after the password.") });
  });

  const disable = () => run(async () => {
    const { error } = await authClient.twoFactor.disable({ password: pass });
    if (error) throw new Error(error.status === 400 || error.status === 401 ? t("Wrong password") : error.message ?? t("failed"));
    setPass("");
    setSetup(null);
    setOverride(false);
    setStatus({ ok: true, text: t("2FA disabled") });
  });

  return (
    <div className="max-w-md space-y-3">
      <h3 className="flex items-center gap-2 font-medium">
        {t("Two-factor sign-in")}
        <span className={`text-xs ${enabled ? "text-[var(--green)]" : "text-[var(--faint)]"}`}>{enabled ? t("on") : t("off")}</span>
      </h3>
      <p className="text-sm text-[var(--muted)]">{t("After the password, a code from Authy, Google Authenticator or 1Password. Without “Remember this browser” at sign-in, the session lasts until the browser closes; with it, 30 days without password or code.")}</p>
      {!setup && (
        <form onSubmit={(e) => { e.preventDefault(); void (enabled ? disable() : start()); }} className="flex gap-2">
          <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t("confirm with your Paddock password")} autoComplete="current-password" className={field} />
          <button disabled={!pass || busy} className={`${enabled ? secondary : primary} shrink-0`}>{busy ? "…" : enabled ? t("Disable 2FA") : t("Enable 2FA")}</button>
        </form>
      )}
      {setup && (
        <div className="space-y-3 rounded-xl bg-[var(--panel-2)] p-3">
          <p className="text-sm">{t("In Authy: “+” → “Scan QR code”. Camera not working? Enter the key manually.")}</p>
          <div className="flex items-center gap-4">
            <img src={setup.qr} alt={t("QR code for the authenticator app")} className="h-40 w-40 rounded-lg bg-white p-1" />
            <code className="break-all font-mono text-xs text-[var(--muted)]">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </div>
        </div>
      )}
      {setup && (
        <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
          <p className="text-sm">{t("Backup codes — one per sign-in, for when your phone isn't at hand:")}</p>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm">{setup.backup.map((c) => <span key={c}>{c}</span>)}</div>
          <button type="button" onClick={() => navigator.clipboard.writeText(setup.backup.join("\n"))} className={secondary}>{t("Copy")}</button>
        </div>
      )}
      {status && <div className={`text-sm ${status.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{status.text}</div>}
    </div>
  );
}

// 203.0.113.42 → 203.***.***.42 (порт и доменные имена не трогаем)
const maskIp = (v: string) => v.replace(/\b(\d{1,3})\.\d{1,3}\.\d{1,3}\.(\d{1,3})\b/g, "$1.***.***.$2");

type Node = { name: string; addr: string; username: string; password: string; hasPassword: boolean };
type Exit = { ip: string; country: string | null; org: string | null; ms: number };

// Цепочка внешних прокси, через которую Codex и морда ходят в интернет. Сверху вниз = приоритет: следующий берётся,
// когда предыдущий не отвечает. Меняется на лету, без рестарта.
function ProxyTab() {
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [exit, setExit] = useState<Exit | { error: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);

  const apply = (r: { nodes: Omit<Node, "password">[] }) => {
    const list = r.nodes.map((n) => ({ ...n, password: "" }));
    setNodes(list);
    setSaved(JSON.stringify(list));
  };

  useEffect(() => {
    fetch("/api/proxy").then(async (r) => {
      const j = await r.json();
      if (!r.ok) return setError(r.status === 403 ? t("Only an admin can configure proxies.") : j.error ?? t("error {status}", { status: r.status }));
      apply(j);
    }).catch((e) => setError(e.message));
  }, []);

  const check = async () => {
    setChecking(true);
    const r = await fetch("/api/proxy/check", { method: "POST" });
    setExit(await r.json());
    setChecking(false);
  };

  if (error) return <p className="text-sm text-[var(--muted)]">{error}</p>;
  if (!nodes) return <p className="text-sm text-[var(--faint)]">{t("reading chain…")}</p>;

  const dirty = JSON.stringify(nodes) !== saved;
  const upd = (i: number, patch: Partial<Node>) => { setNodes(nodes.map((n, j) => (j === i ? { ...n, ...patch } : n))); setStatus(null); };
  const move = (i: number, d: number) => {
    const next = [...nodes];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setNodes(next);
  };
  const activeIp = exit && "ip" in exit ? exit.ip : null;

  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/proxy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes: nodes.map(({ name, addr, username, password }) => ({ name, addr, username, password })) }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setStatus({ ok: false, text: j.error ?? t("not saved") });
    apply(j);
    setStatus({ ok: true, text: t("Applied and saved to gost.yaml") });
    check();
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        {t("Codex and Paddock reach the internet through these proxies — they have no direct access. Order = priority: if the top one doesn't respond, the next one is used.")}
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--panel-2)] p-3 text-sm">
        <button onClick={check} disabled={checking} className={secondary}>{checking ? t("checking…") : t("Check exit")}</button>
        <button onClick={() => setReveal((r) => !r)} className="order-last ml-auto text-xs text-[var(--muted)] hover:text-[var(--fg)]">{reveal ? t("hide IP") : t("show IP")}</button>
        {exit && ("error" in exit
          ? <span className="text-[var(--red)]">{exit.error}</span>
          : <span className="font-mono text-[13px]">
              <span className="text-[var(--green)]">●</span> {reveal ? exit.ip : maskIp(exit.ip)} <span className="text-[var(--muted)]">{[exit.country, exit.org].filter(Boolean).join(" · ")}</span>{" "}
              <span className="text-[var(--faint)]">{t("{ms} ms", { ms: exit.ms })}</span>
            </span>)}
      </div>

      <div className="flex gap-2">
        {/* Подпись снизу вверх: чем выше узел, тем выше приоритет */}
        <div className="flex w-5 shrink-0 flex-col items-center gap-1 py-1" title={t("Top is highest priority, lower ones are fallbacks")}>
          <Icon name="arrowUp" size={13} className="text-[var(--accent)]" />
          <div className="w-px flex-1 bg-gradient-to-b from-[var(--accent)] to-[var(--border)]" />
          <span className="rotate-180 text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] [writing-mode:vertical-rl]">{t("priority")}</span>
        </div>
      <div className="min-w-0 flex-1 space-y-2">
        {nodes.map((n, i) => {
          const isActive = activeIp && n.addr.split(":")[0] === activeIp;
          return (
            <div key={i} className={`grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-xl border p-3 ${isActive ? "border-[var(--green)]/40" : "border-[var(--border)]"}`}>
              <div className="flex flex-col items-center gap-0.5 pt-1">
                <span className="font-mono text-xs text-[var(--faint)]">{i + 1}</span>
                <button disabled={i === 0} onClick={() => move(i, -1)} className="text-[var(--faint)] hover:text-[var(--fg)] disabled:opacity-20" title={t("Move up")}><Icon name="chevron" size={14} className="rotate-180" /></button>
                <button disabled={i === nodes.length - 1} onClick={() => move(i, 1)} className="text-[var(--faint)] hover:text-[var(--fg)] disabled:opacity-20" title={t("Move down")}><Icon name="chevron" size={14} /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={n.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder={t("name")} className={field} />
                <input value={reveal ? n.addr : maskIp(n.addr)} readOnly={!reveal} onFocus={() => !reveal && n.addr && setReveal(true)}
                  onChange={(e) => upd(i, { addr: e.target.value })} placeholder="host:port" className={`${field} font-mono`} />
                <input value={n.username} onChange={(e) => upd(i, { username: e.target.value })} placeholder={t("username (if needed)")} autoComplete="off" className={field} />
                <input type="password" value={n.password} onChange={(e) => upd(i, { password: e.target.value })} autoComplete="new-password"
                  placeholder={n.hasPassword ? t("password saved — leave empty to keep") : t("password")} className={field} />
              </div>
              <div className="flex flex-col items-end gap-1 pt-1">
                <button onClick={() => setNodes(nodes.filter((_, j) => j !== i))} disabled={nodes.length === 1} title={t("Remove")}
                  className="rounded-md p-1 text-[var(--faint)] hover:bg-[var(--panel-2)] hover:text-[var(--red)] disabled:opacity-20">
                  <Icon name="plus" size={15} className="rotate-45" />
                </button>
                {isActive && <span className="text-[10px] uppercase tracking-wide text-[var(--green)]">{t("exit")}</span>}
              </div>
            </div>
          );
        })}
        <button onClick={() => setNodes([...nodes, { name: `proxy-${nodes.length + 1}`, addr: "", username: "", password: "", hasPassword: false }])}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-[var(--accent)] hover:bg-[var(--panel-2)]">
          <Icon name="plus" size={14} /> {t("Add proxy")}
        </button>
      </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={!dirty || busy} className={primary}>{busy ? "…" : t("Apply")}</button>
        {dirty && <button onClick={() => setNodes(JSON.parse(saved))} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">{t("Discard changes")}</button>}
        {status && <span className={`text-sm ${status.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{status.text}</span>}
      </div>
      <p className="text-xs text-[var(--faint)]">{t("HTTP proxies are supported. Passwords are stored only in egress and never sent to the browser.")}</p>
    </div>
  );
}

// Свой провайдер в codex: model_providers.neuraldeep с wire_api = "responses" (как в доке neuraldeep.ru/docs).
function NeuralDeepTab({ request, models, reload }: { request: Request; models: Model[]; reload: () => Promise<number> }) {
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const readKey = () =>
    request("config/read", {}).then((r) => setCurrent(r.config?.model_providers?.neuraldeep?.experimental_bearer_token ?? null));
  useEffect(() => { readKey().catch(() => setCurrent(null)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const write = async (value: unknown) =>
    request("config/batchWrite", { edits: [{ keyPath: "model_providers.neuraldeep", value, mergeStrategy: "replace" }], reloadUserConfig: true });

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await write({ name: "NeuralDeep Hub", base_url: "https://api.neuraldeep.ru/v1", wire_api: "responses", experimental_bearer_token: key.trim() });
      setKey("");
      await readKey();
      const n = await reload();
      setStatus({ ok: true, text: t("Connected: {n} chat models in the model picker", { n }) });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : t("failed") });
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    await write(null).catch(() => {});
    await readKey();
    await reload().catch(() => 0);
    setStatus({ ok: true, text: t("Key removed") });
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        {t("Models from")} <a href="https://neuraldeep.ru/docs" target="_blank" rel="noreferrer noopener" className="text-[var(--accent)] underline underline-offset-2">neuraldeep.ru</a> {t("via the Responses API. The key goes into")}{" "}
        <span className="font-mono">config.toml</span> {t("of your Codex; Paddock doesn't store it. The key's chat models will appear in the model picker under “NeuralDeep”.")}
      </p>

      <div className="flex items-center gap-3 rounded-xl bg-[var(--panel-2)] p-3 text-sm">
        <span className={`h-2 w-2 rounded-full ${current ? "bg-[var(--green)]" : "bg-[var(--faint)]"}`} />
        <span className="flex-1 font-mono text-[13px]">
          {current === undefined ? t("reading…") : current ? `${current.slice(0, 5)}…${current.slice(-4)}` : t("no key set")}
        </span>
        {current && <button onClick={() => reload().then((n) => setStatus({ ok: true, text: t("{n} chat models", { n }) })).catch((e) => setStatus({ ok: false, text: e.message }))} className={secondary}>{t("Refresh models")}</button>}
        {current && <button onClick={remove} disabled={busy} className={secondary}>{t("Remove")}</button>}
      </div>

      <div className="flex gap-2">
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("sk-… from hub.neuraldeep.ru/app/keys")} autoComplete="off" className={field} />
        <button onClick={save} disabled={busy || !/^sk-[\w-]{10,}$/.test(key.trim())} className={primary}>{busy ? "…" : current ? t("Replace") : t("Connect")}</button>
      </div>

      {status && <div className={`text-sm ${status.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{status.text}</div>}

      {models.length > 0 && (
        <div>
          <div className="mb-2 text-xs text-[var(--muted)]">{t("Models for this key")}</div>
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => (
              <span key={m.id} className="rounded-md bg-[var(--panel-2)] px-2 py-1 font-mono text-xs" title={m.description}>
                {m.id}{m.context ? <span className="text-[var(--faint)]"> {Math.round(m.context / 1000)}k</span> : null}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--faint)]">{t("The provider is set per chat: picking a NeuralDeep model in a chat with a ChatGPT model sends the next message to a new chat.")}</p>
        </div>
      )}
    </div>
  );
}
