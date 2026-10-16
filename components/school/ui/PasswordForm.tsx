"use client";

import { useId, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { ApiError, spost } from "@/lib/school/client";
import { accountErrorKey, type UiKey } from "@/lib/school/i18n";
import { passwordIssues, passwordStrength, type PasswordIssue } from "@/lib/school/password";
import { Button, cn, inputCls } from "./kit";
import { useSchool } from "./SchoolProvider";

/** Password input with a show/hide toggle (44px tap target) */
export function PasswordField({
  label, value, onChange, autoComplete, describedBy, invalid, id,
}: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; describedBy?: string; invalid?: boolean; id?: string }) {
  const { t } = useSchool();
  const auto = useId();
  const fid = id ?? auto;
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={fid} className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          id={fid}
          type={show ? "text" : "password"}
          required
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(inputCls, "min-h-11 pr-12")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={128}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t("a_pw_hide") : t("a_pw_show")}
          aria-pressed={show}
          className="absolute right-0 top-0 grid size-11 place-items-center rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

const RULES: { key: UiKey; issues: PasswordIssue[] }[] = [
  { key: "a_pw_rule_len", issues: ["too_short", "too_long"] },
  { key: "a_pw_rule_letter", issues: ["no_letter"] },
  { key: "a_pw_rule_digit", issues: ["no_digit"] },
  { key: "a_pw_rule_common", issues: ["common"] },
  { key: "a_pw_rule_email", issues: ["contains_email"] },
  { key: "a_pw_rule_same", issues: ["same_as_current"] },
  { key: "a_pw_rule_repeat", issues: ["repeated"] },
];

/** Live checklist + strength meter. Status is shown with an icon AND text, never colour alone. */
export function PasswordRules({ id, pw, email, current }: { id: string; pw: string; email?: string; current?: string }) {
  const { t } = useSchool();
  const issues = passwordIssues(pw, { email, current });
  const level = passwordStrength(pw, { email, current });
  const label = level === 3 ? t("a_pw_s_strong") : level === 2 ? t("a_pw_s_fair") : level === 1 ? t("a_pw_s_weak") : "";
  return (
    <div id={id} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-semibold">{t("a_pw_strength")}</span>
        <div
          role="meter"
          aria-label={t("a_pw_strength")}
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={level}
          aria-valuetext={label || "-"}
          className="flex h-2 flex-1 gap-1"
        >
          {[1, 2, 3].map((i) => (
            <span key={i} className={cn("h-full flex-1 rounded-full bg-slate-300 dark:bg-slate-600", level >= i && (level === 1 ? "bg-red-600 dark:bg-red-500" : level === 2 ? "bg-amber-500" : "bg-emerald-600 dark:bg-emerald-500"))} />
          ))}
        </div>
        <span className="w-16 text-right font-semibold" data-testid="pw-strength">{label}</span>
      </div>
      <p className="mb-1 font-semibold">{t("a_pw_rules_title")}</p>
      <ul className="space-y-0.5">
        {RULES.filter((r) => r.key !== "a_pw_rule_same" || current !== undefined).map((r) => {
          const bad = r.issues.some((i) => issues.includes(i));
          const untouched = pw.length === 0;
          return (
            <li key={r.key} className="flex items-start gap-1.5">
              {untouched ? <span className="mt-0.5 size-3.5 shrink-0 rounded-full border border-slate-400" aria-hidden /> : bad ? <X className="mt-0.5 size-3.5 shrink-0 text-red-700 dark:text-red-400" aria-hidden /> : <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />}
              <span>{t(r.key)}</span>
              {!untouched && <span className="sr-only">{bad ? " - no" : " - ok"}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function errorMessage(e: unknown, t: (k: UiKey) => string): string {
  if (e instanceof ApiError) {
    const k = accountErrorKey(e.code);
    if (k) return t(k);
  }
  return t("a_err_generic");
}

/** Change-password form (forced after a temporary password, or voluntary from the profile / settings). */
export function ChangePasswordForm({ onDone, forced = false, askCurrentLabel }: { onDone?: () => void; forced?: boolean; askCurrentLabel?: string }) {
  const { t, session } = useSchool();
  const rulesId = useId();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;
  const issues = passwordIssues(pw, { email: session?.email, current: cur });
  const canSubmit = !!cur && issues.length === 0 && pw === pw2 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      await spost("/auth/change-password", { current_password: cur, new_password: pw });
      setDone(true);
      setCur("");
      setPw("");
      setPw2("");
      onDone?.();
    } catch (x) {
      setErr(errorMessage(x, t));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"><Check className="size-4" aria-hidden />{t("a_pw_success")}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <PasswordField id="cp-current" label={askCurrentLabel ?? (forced ? t("a_pw_current") : t("a_pw_current_plain"))} value={cur} onChange={setCur} autoComplete="current-password" />
      <PasswordField id="cp-new" label={t("a_pw_new")} value={pw} onChange={setPw} autoComplete="new-password" describedBy={rulesId} invalid={pw.length > 0 && issues.length > 0} />
      <PasswordRules id={rulesId} pw={pw} email={session?.email} current={cur} />
      <PasswordField id="cp-confirm" label={t("a_pw_confirm")} value={pw2} onChange={setPw2} autoComplete="new-password" invalid={mismatch} describedBy={mismatch ? "cp-mismatch" : undefined} />
      {mismatch && <p id="cp-mismatch" role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{t("a_pw_mismatch")}</p>}
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{err}</p>}
      <Button type="submit" variant="primary" loading={busy} disabled={!canSubmit} className="min-h-11 w-full">{t("a_pw_submit")}</Button>
    </form>
  );
}
