"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { tr, type Locale } from "@/lib/types";
import type { OlympiadStrings } from "./i18n";
import { olympiadState } from "./OlympiadList";
import { maskPhone, phoneValue, registrationSchema, type IssuedTicket, type Olympiad } from "./types";

interface Props {
  olympiads: Olympiad[];
  selectedId: string;
  onSelect: (id: string) => void;
  locale: Locale;
  t: OlympiadStrings;
  now: number | null;
  onDone: (ticket: IssuedTicket) => void;
}

const inputCls =
  "w-full rounded-xl border bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:bg-slate-900/60 dark:text-white";

export function RegisterForm({ olympiads, selectedId, onSelect, locale, t, now, onDone }: Props) {
  const open = useMemo(() => olympiads.filter((o) => olympiadState(o, now) === "open"), [olympiads, now]);
  const oly = open.find((o) => o.id === selectedId) ?? null;

  const [v, setV] = useState({ name: "", birth: "", school: "", grade: "", subject: "", phone: "+998", extra: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grade = oly && oly.eligibleGrades.includes(Number(v.grade)) ? v.grade : "";
  const subject = oly && oly.subjects.some((s) => s.key === v.subject) ? v.subject : "";

  const parsed = registrationSchema.safeParse({
    olympiadId: oly?.id ?? "",
    studentFullName: v.name,
    birthDate: v.birth,
    currentSchool: v.school,
    grade: grade ? Number(grade) : 0,
    subjectKey: subject,
    parentPhone: phoneValue(v.phone),
    extraPhone: phoneValue(v.extra),
  });
  const fieldErr: Record<string, string> = {};
  if (!parsed.success) {
    const map: Record<string, string> = {
      olympiadId: "olympiad",
      studentFullName: "name",
      birthDate: "birth",
      currentSchool: "school",
      grade: "grade",
      subjectKey: "subject",
      parentPhone: "phone",
      extraPhone: "extra",
    };
    for (const i of parsed.error.issues) {
      const f = map[String(i.path[0])] ?? "form";
      if (!fieldErr[f]) fieldErr[f] = i.message === "Invalid input" ? "phone" : i.message;
    }
  }

  const touch = (k: string) => setTouched((s) => ({ ...s, [k]: true }));
  const showErr = (k: string) => (touched[k] && fieldErr[k] ? (t.errors[fieldErr[k]] ?? t.errors.invalid) : null);

  const today = new Date();
  const maxBirth = today.toISOString().slice(0, 10);
  const minBirth = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ olympiad: true, name: true, birth: true, school: true, grade: true, subject: true, phone: true, extra: true });
    if (!parsed.success || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/olympiad/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t.errors[json?.error as string] ?? t.errors.server);
        return;
      }
      onDone(json.ticket as IssuedTicket);
    } catch {
      setError(t.errors.network);
    } finally {
      setSubmitting(false);
    }
  }

  if (open.length === 0) {
    return <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">{t.noEligible}</p>;
  }

  const field = (id: string, label: string, children: React.ReactNode, k: string) => {
    const err = showErr(k);
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </label>
        {children}
        {err && (
          <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
            {err}
          </p>
        )}
      </div>
    );
  };
  const cls = (k: string) => `${inputCls} ${showErr(k) ? "border-red-500" : "border-slate-300 dark:border-white/15"}`;

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-2xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t.formTitle}</h2>

      {field(
        "oly-select",
        t.selectOlympiad,
        <select
          id="oly-select"
          className={cls("olympiad")}
          value={oly?.id ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          onBlur={() => touch("olympiad")}
          aria-invalid={!!showErr("olympiad")}
        >
          <option value="">{t.choose}</option>
          {open.map((o) => (
            <option key={o.id} value={o.id}>
              {tr(o.title, locale)}
            </option>
          ))}
        </select>,
        "olympiad",
      )}

      {field(
        "oly-name",
        t.fullName,
        <input
          id="oly-name"
          className={cls("name")}
          autoComplete="name"
          placeholder={t.fullNamePh}
          maxLength={120}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          onBlur={() => touch("name")}
          aria-invalid={!!showErr("name")}
          aria-describedby={showErr("name") ? "oly-name-err" : undefined}
        />,
        "name",
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "oly-birth",
          t.birthDate,
          <input
            id="oly-birth"
            type="date"
            min={minBirth}
            max={maxBirth}
            className={cls("birth")}
            value={v.birth}
            onChange={(e) => setV({ ...v, birth: e.target.value })}
            onBlur={() => touch("birth")}
            aria-invalid={!!showErr("birth")}
            aria-describedby={showErr("birth") ? "oly-birth-err" : undefined}
          />,
          "birth",
        )}
        {field(
          "oly-school",
          t.school,
          <input
            id="oly-school"
            className={cls("school")}
            placeholder={t.schoolPh}
            maxLength={120}
            value={v.school}
            onChange={(e) => setV({ ...v, school: e.target.value })}
            onBlur={() => touch("school")}
            aria-invalid={!!showErr("school")}
            aria-describedby={showErr("school") ? "oly-school-err" : undefined}
          />,
          "school",
        )}
      </div>

      {oly && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t.notEligibleGrade}: {oly.eligibleGrades.join(", ")}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "oly-grade",
          t.grade,
          <select
            id="oly-grade"
            className={cls("grade")}
            disabled={!oly}
            value={grade}
            onChange={(e) => setV({ ...v, grade: e.target.value })}
            onBlur={() => touch("grade")}
            aria-invalid={!!showErr("grade")}
            aria-describedby={showErr("grade") ? "oly-grade-err" : undefined}
          >
            <option value="">{t.choose}</option>
            {oly?.eligibleGrades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>,
          "grade",
        )}
        {field(
          "oly-subject",
          t.subject,
          <select
            id="oly-subject"
            className={cls("subject")}
            disabled={!oly}
            value={subject}
            onChange={(e) => setV({ ...v, subject: e.target.value })}
            onBlur={() => touch("subject")}
            aria-invalid={!!showErr("subject")}
            aria-describedby={showErr("subject") ? "oly-subject-err" : undefined}
          >
            <option value="">{t.choose}</option>
            {oly?.subjects.map((s) => (
              <option key={s.key} value={s.key}>
                {tr(s.name, locale)}
              </option>
            ))}
          </select>,
          "subject",
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "oly-phone",
          t.parentPhone,
          <input
            id="oly-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={cls("phone")}
            value={v.phone}
            onChange={(e) => setV({ ...v, phone: maskPhone(e.target.value) })}
            onBlur={() => touch("phone")}
            aria-invalid={!!showErr("phone")}
            aria-describedby={showErr("phone") ? "oly-phone-err" : undefined}
          />,
          "phone",
        )}
        {field(
          "oly-extra",
          t.extraPhone,
          <input
            id="oly-extra"
            type="tel"
            inputMode="tel"
            placeholder="+998"
            className={cls("extra")}
            value={v.extra}
            onChange={(e) => setV({ ...v, extra: maskPhone(e.target.value) })}
            onBlur={() => touch("extra")}
            aria-invalid={!!showErr("extra")}
            aria-describedby={showErr("extra") ? "oly-extra-err" : undefined}
          />,
          "extra",
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {submitting ? t.submitting : t.submit}
      </button>
    </form>
  );
}
