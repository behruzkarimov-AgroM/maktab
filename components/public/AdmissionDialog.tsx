"use client";

import clsx from "clsx";
import { CheckCircle2, X } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { maskPhone, phoneValue } from "@/components/olympiad/phone";
import { Link } from "@/i18n/navigation";
import { DICT } from "./i18n";
import { PhoneVerify, phoneRequiredText } from "./PhoneVerify";
import { btnGhost, btnPrimary, Modal, usePublic } from "./ui";

export type ApplicationType = "admission" | "campus_tour" | "callback";

const input =
  "w-full rounded-xl border border-slate-300/70 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-white/15 dark:bg-white/5 dark:text-white";

export function AdmissionForm({ initialType = "admission", onDone, compact }: { initialType?: ApplicationType; onDone?: () => void; compact?: boolean }) {
  const { locale, t } = usePublic();
  const [type, setType] = useState<ApplicationType>(initialType);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error" | "rate">("idle");
  const [phone, setPhone] = useState("+998");
  // phone confirmed with a code from the school's Telegram bot (required by the server once the bot is set up)
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [phoneRequired, setPhoneRequired] = useState(false);
  const uid = useId();
  const eid = (k: string) => `${uid}-${k}-err`;
  const [startedAt, setStartedAt] = useState(() => Date.now());

  /** Small hand-written validator (zod would add ~100 KB to the landing page). Mirrors the server schema in app/api/applications. */
  function validate(fd: Record<string, string>) {
    const errs: Record<string, string> = {};
    const parent = (fd.parent_name ?? "").trim();
    if (parent.length < 2 || parent.length > 100) errs.parent_name = t("errName");
    const grade = (fd.target_grade ?? "").trim();
    const gradeNum = grade === "" ? null : Number(grade);
    if (gradeNum !== null && (!Number.isInteger(gradeNum) || gradeNum < 1 || gradeNum > 11)) errs.target_grade = t("errGrade");
    const phoneRaw = (fd.phone ?? "").trim();
    if (phoneRaw.replace(/\D/g, "").replace(/^998/, "").length !== 9) errs.phone = t("errPhone");
    const lang = fd.preferred_language === "ru" || fd.preferred_language === "en" ? fd.preferred_language : "uz";
    return {
      errs,
      data: {
        parent_name: parent,
        child_name: (fd.child_name ?? "").trim().slice(0, 100),
        target_grade: gradeNum === null ? ("" as const) : gradeNum,
        phone: phoneRaw,
        preferred_language: lang,
        message: (fd.message ?? "").slice(0, 1000),
        website: fd.website ?? "",
      },
    };
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const { errs, data: d } = validate(fd);
    if (!errs.phone && phoneRequired && !phoneToken) errs.phone = phoneRequiredText(locale);
    if (Object.keys(errs).length) {
      setErrors(errs);
      const firstKey = ["parent_name", "phone", "target_grade"].find((k) => errs[k]);
      if (firstKey) form.querySelector<HTMLElement>(`[name="${firstKey}"]`)?.focus();
      return;
    }
    setErrors({});
    setStatus("sending");
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...d, phone: phoneValue(d.phone), target_grade: d.target_grade === "" ? null : d.target_grade, application_type: type, formStartedAt: startedAt,
          ...(phoneToken ? { phoneToken } : {}),
        }),
      });
      if (res.ok) {
        setStatus("ok");
        setStartedAt(Date.now());
      } else if (res.status === 400 && (await res.json().catch(() => ({}))).error === "phone_unverified") {
        setPhoneToken(null);
        setErrors({ phone: phoneRequiredText(locale) });
        setStatus("idle");
      } else setStatus(res.status === 429 ? "rate" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        <p className="max-w-sm text-lg font-medium text-slate-800 dark:text-slate-100">{t("success")}</p>
        <button type="button" className={btnGhost} onClick={() => (onDone ? onDone() : setStatus("idle"))}>
          {onDone ? t("close") : t("newRequest")}
        </button>
      </div>
    );
  }

  const types: [ApplicationType, keyof typeof DICT][] = [
    ["admission", "typeAdmission"], ["campus_tour", "typeTour"], ["callback", "typeCallback"],
  ];
  const err = (k: string) => (errors[k] ? <p id={eid(k)} className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">{errors[k]}</p> : null);
  const a11y = (k: string) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? eid(k) : undefined });
  const label = "mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/60 p-1 dark:bg-white/10" role="group" aria-label={t("formTitle")}>
        {types.map(([k, lk]) => (
          <button
            type="button" key={k} aria-pressed={type === k}
            onClick={() => setType(k)}
            className={clsx("rounded-xl px-2 py-2 text-xs font-semibold transition sm:text-sm",
              type === k ? "bg-white text-indigo-700 shadow dark:bg-indigo-600 dark:text-white" : "text-slate-600 hover:bg-white/50 dark:text-slate-300")}
          >
            {t(lk)}
          </button>
        ))}
      </div>

      <div className={clsx("grid gap-4", !compact && "sm:grid-cols-2")}>
        <div>
          <label className={label} htmlFor="ad-parent">{t("parentName")}</label>
          <input id="ad-parent" name="parent_name" autoComplete="name" className={input} {...a11y("parent_name")} />
          {err("parent_name")}
        </div>
        <div>
          <label className={label} htmlFor="ad-phone">{t("phone")}</label>
          <input id="ad-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" className={input} value={phone} onChange={(e) => { setPhone(maskPhone(e.target.value)); setPhoneToken(null); }} {...a11y("phone")} />
          {err("phone")}
          <PhoneVerify phone={phone} lang={locale} onToken={setPhoneToken} onRequired={setPhoneRequired} inputClass={input} />
        </div>
        <div>
          <label className={label} htmlFor="ad-child">{t("childName")} <span className="font-normal opacity-60">({t("optional")})</span></label>
          <input id="ad-child" name="child_name" className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ad-grade">{t("targetGrade")}</label>
            <select id="ad-grade" name="target_grade" defaultValue="" className={input} {...a11y("target_grade")}>
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
            {err("target_grade")}
          </div>
          <div>
            <label className={label} htmlFor="ad-lang">{t("prefLang")}</label>
            <select id="ad-lang" name="preferred_language" defaultValue={locale} className={input}>
              <option value="uz">O&apos;zbekcha</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="ad-msg">{t("message")}</label>
        <textarea id="ad-msg" name="message" rows={3} maxLength={1000} className={input} />
      </div>
      {/* honeypot: hidden from users */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>

      {(status === "error" || status === "rate") && (
        <p className="rounded-xl bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
          {status === "rate" ? t("errRate") : t("errGeneric")}
        </p>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-300">
        {t("privacyNote")}{" "}
        <Link href="/privacy" className="font-semibold text-indigo-700 underline underline-offset-2 dark:text-indigo-300">
          {t("privacyLink")}
        </Link>
      </p>
      <button type="submit" disabled={status === "sending"} className={clsx(btnPrimary, "w-full disabled:opacity-60")}>
        {status === "sending" ? t("sending") : t("submit")}
      </button>
    </form>
  );
}

/**
 * Reusable trigger + modal. Usage:
 *   <AdmissionDialog type="campus_tour">Book a tour</AdmissionDialog>
 * Omit children for the default localized label. Pass `className` to restyle the trigger.
 */
export function AdmissionDialog({
  type = "admission", children, className, ghost,
}: { type?: ApplicationType; children?: ReactNode; className?: string; ghost?: boolean }) {
  const { t } = usePublic();
  const [open, setOpen] = useState(false);
  const defaultLabel = type === "campus_tour" ? t("tour") : type === "callback" ? t("callback") : t("apply");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? (ghost ? btnGhost : btnPrimary)}>
        {children ?? defaultLabel}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} label={defaultLabel}>
        <button type="button" aria-label={t("close")} onClick={() => setOpen(false)} className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-4 pr-8 text-xl font-bold text-slate-900 dark:text-white">{t("formTitle")}</h2>
        <AdmissionForm initialType={type} onDone={() => setOpen(false)} compact />
      </Modal>
    </>
  );
}

export default AdmissionDialog;
