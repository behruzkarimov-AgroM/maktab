"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, KeyRound, Send } from "lucide-react";
import { sdelete, sget, spost, sput } from "@/lib/school/client";
import type { UiKey } from "@/lib/school/i18n";
import { Badge, Card, cn } from "./kit";
import { ChangePasswordForm, errorMessage } from "./PasswordForm";
import { useSchool } from "./SchoolProvider";

type PrefKey = "absence" | "announcements" | "telegram" | "email" | "low_grade";
type Prefs = Record<PrefKey, boolean>;

interface Row {
  key: PrefKey;
  label: UiKey;
  help: UiKey;
  /** the preference is stored but nothing sends it yet (honest helper text + badge) */
  notLive?: boolean;
}
const FAMILY_ROWS: Row[] = [
  { key: "absence", label: "a_pref_absence", help: "a_pref_h_absence" },
  { key: "announcements", label: "a_pref_announcements", help: "a_pref_h_announcements" },
  { key: "telegram", label: "a_pref_telegram", help: "a_pref_h_telegram" },
  { key: "email", label: "a_pref_email", help: "a_pref_h_email", notLive: true },
  { key: "low_grade", label: "a_pref_lowgrade", help: "a_pref_h_lowgrade", notLive: true },
];
const STAFF_ROWS: Row[] = [
  { key: "announcements", label: "a_pref_announcements", help: "a_pref_h_announcements" },
  { key: "email", label: "a_pref_email", help: "a_pref_h_email", notLive: true },
];

/** Notification preferences wired to GET/PUT /api/school/me/prefs (no localStorage). */
export function NotifPrefsCard() {
  const { t, session } = useSchool();
  const rows = session?.role === "parent" || session?.role === "student" ? FAMILY_ROWS : STAFF_ROWS;
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let live = true;
    sget<{ prefs: Prefs }>("/me/prefs")
      .then((r) => live && setPrefs(r.prefs))
      .catch((e) => live && setError(errorMessage(e, t)));
    return () => {
      live = false;
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(k: PrefKey) {
    if (!prefs) return;
    const next = !prefs[k];
    const before = prefs;
    setPrefs({ ...prefs, [k]: next });
    setStatus("saving");
    setError(null);
    try {
      const r = await sput<{ prefs: Prefs }>("/me/prefs", { [k]: next });
      setPrefs((p) => (p ? { ...p, ...r.prefs } : p));
      setStatus("saved");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setPrefs(before);
      setStatus("idle");
      setError(errorMessage(e, t));
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><BellRing className="size-4" aria-hidden />{t("a_pref_title")}</h2>
        <span role="status" aria-live="polite" className="text-xs text-slate-600 dark:text-slate-300">
          {status === "saving" ? t("a_pref_saving") : status === "saved" ? t("a_pref_saved") : ""}
        </span>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{error}</p>}
      {!prefs && !error ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : prefs ? (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <li key={r.key}>
              <label className="flex min-h-12 cursor-pointer items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t(r.label)}
                    {r.notLive && <Badge tone="amber">{t("a_pref_not_live")}</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">{t(r.help)}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className={cn("mt-0.5 size-6 shrink-0 accent-indigo-600")}
                  checked={prefs[r.key]}
                  onChange={() => void toggle(r.key)}
                />
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/** Voluntary password change (all roles). */
export function PasswordCard() {
  const { t } = useSchool();
  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" aria-hidden />{t("a_pw_title")}</h2>
      <div className="max-w-md"><ChangePasswordForm /></div>
    </Card>
  );
}

/** Connect / disconnect the Telegram bot: a one-time deep link (GET/POST/DELETE /api/school/telegram). */
export function TelegramCard() {
  const { t } = useSchool();
  const [state, setState] = useState<{ linked: boolean; username: string | null; bot: string | null } | null>(null);
  const [code, setCode] = useState<{ code: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    sget<{ linked: boolean; username: string | null; bot: string | null }>("/telegram")
      .then((r) => live && setState(r))
      .catch((e) => live && setError(errorMessage(e, t)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  const connect = () => run(async () => setCode(await spost<{ code: string; url: string }>("/telegram")));
  const disconnect = () =>
    run(async () => {
      await sdelete("/telegram");
      setState((s) => (s ? { ...s, linked: false, username: null } : s));
      setCode(null);
    });

  const btn = "inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50";
  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Send className="size-4" aria-hidden />{t("a_tg_title")}</h2>
      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">{t("a_tg_help")}</p>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{error}</p>}
      {!state && !error ? (
        <div className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : state && !state.bot ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">{t("a_tg_off")}</p>
      ) : state?.linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="green">{t("a_tg_linked")}{state.username ? ` · @${state.username}` : ""}</Badge>
          <button type="button" disabled={busy} onClick={() => void disconnect()} className={cn(btn, "border border-slate-300 dark:border-slate-700")}>{t("a_tg_disconnect")}</button>
        </div>
      ) : code ? (
        <div className="space-y-3">
          <a href={code.url} target="_blank" rel="noopener noreferrer" className={cn(btn, "bg-sky-600 text-white hover:bg-sky-500")}>
            <Send className="size-4" aria-hidden />{t("a_tg_open")}
          </a>
          <p className="text-xs text-slate-600 dark:text-slate-400">{t("a_tg_code_help")}</p>
          <p className="font-mono text-lg font-bold tracking-widest" aria-label={code.code.split("").join(" ")}>/start {code.code}</p>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => void connect()} className={cn(btn, "bg-sky-600 text-white hover:bg-sky-500")}>
          <Send className="size-4" aria-hidden />{t("a_tg_connect")}
        </button>
      )}
    </Card>
  );
}

/** Security + notification settings block shared by the director settings page, the teacher account page and the family profile. */
export function AccountPanel() {
  return (
    <div className="space-y-4">
      <TelegramCard />
      <NotifPrefsCard />
      <PasswordCard />
    </div>
  );
}
