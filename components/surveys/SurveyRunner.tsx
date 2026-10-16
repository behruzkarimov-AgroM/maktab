"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import { tr } from "@/lib/types";
import { MAX_TEXT_ANSWER, ROLE_HINTS, type Answers, type AnswerValue, type PublicSurvey, type PublicSurveyQuestion, type RoleHint } from "@/lib/surveys/types";
import { Mascot } from "@/components/psych/Mascot";
import { useSurveyT } from "./i18n";
import { getRespondentToken, isSurveyDone, markSurveyDone } from "./token";

type Stage = "intro" | "questions" | "submitting" | "done" | "already" | "closed" | "error";

const AUDIENCE_ROLE: Record<string, RoleHint | undefined> = { parents: "parent", students: "student", teachers: "teacher" };

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const isAnswered = (v: AnswerValue | undefined) => v !== undefined && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && v.length === 0);

export function SurveyRunner({ survey }: { survey: PublicSurvey }) {
  const { t, locale } = useSurveyT();
  const questions = survey.questions ?? [];
  const [stage, setStage] = useState<Stage>("intro");
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [answers, setAnswers] = useState<Answers>({});
  const [roleHint, setRoleHint] = useState<RoleHint | "">(AUDIENCE_ROLE[survey.audience] ?? "");
  const [grade, setGrade] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const startedAt = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    if (!survey.allow_multiple_responses && isSurveyDone(survey.id)) setStage("already");
    return () => abortRef.current?.abort();
  }, [survey.id, survey.allow_multiple_responses]);

  const total = questions.length;
  const question = questions[index];
  const askRole = !AUDIENCE_ROLE[survey.audience];
  const roleRequired = !survey.is_anonymous;
  const canStart = !roleRequired || !!roleHint;

  function setAnswer(id: string, v: AnswerValue | undefined) {
    setAnswers((a) => {
      const next = { ...a };
      if (v === undefined) delete next[id];
      else next[id] = v;
      return next;
    });
  }

  async function submit() {
    setStage("submitting");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const g = Number(grade);
      const res = await fetch("/api/surveys/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          surveyId: survey.id,
          answers,
          token: getRespondentToken(),
          roleHint: roleHint || undefined,
          grade: roleHint === "student" && Number.isInteger(g) && g >= 1 && g <= 11 ? g : undefined,
          website: honeypot,
          formStartedAt: startedAt.current,
        }),
      });
      if (res.ok) {
        markSurveyDone(survey.id);
        setStage("done");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "already_responded") {
        markSurveyDone(survey.id);
        setStage("already");
      } else if (body.error === "survey_closed" || body.error === "not_found") setStage("closed");
      else setStage("error");
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setStage("error");
    }
  }

  function next() {
    if (!question) return;
    if (question.required && !isAnswered(answers[question.id])) return;
    if (index + 1 >= total) void submit();
    else {
      setDir(1);
      setIndex(index + 1);
    }
  }
  function back() {
    if (index === 0) return;
    setDir(-1);
    setIndex(index - 1);
  }

  const pct = total ? Math.round((index / total) * 100) : 0;
  const answered = question ? isAnswered(answers[question.id]) : false;
  const last = index + 1 >= total;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <Link href={`/${locale}/surveys`} className="mb-4 inline-block text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
        ← {t.allSurveys}
      </Link>

      {stage === "intro" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
          <div className="mx-auto w-fit">
            <Mascot size={130} />
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-50 sm:text-3xl">{tr(survey.title, locale)}</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{tr(survey.description, locale)}</p>
          <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">
            🔒 {survey.is_anonymous ? t.anonymousHint : t.notAnonymousHint} · {total} {t.questionsCount}
          </p>

          {askRole && (
            <fieldset className="mt-5 text-left">
              <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                {t.whoAreYou} <span className="text-slate-500">({roleRequired ? t.required : t.optional})</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {ROLE_HINTS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={roleHint === r}
                    onClick={() => setRoleHint(roleHint === r && !roleRequired ? "" : r)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      roleHint === r ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {t.roles[r]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {roleHint === "student" && (
            <label className="mt-4 block text-left text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">{t.gradeOpt}</span>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className={inputCls}>
                <option value="">-</option>
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* honeypot: invisible to people, tempting to bots */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </label>
          </div>

          <button
            type="button"
            disabled={!canStart || total === 0}
            onClick={() => {
              startedAt.current = Date.now();
              setStage("questions");
            }}
            className="mt-6 w-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 px-6 py-3 text-lg font-semibold text-white shadow transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          >
            {t.start}
          </button>
        </div>
      )}

      {stage === "questions" && question && (
        <div>
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>
              {t.question} {index + 1} {t.of} {total}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="mb-6 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
          </div>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={question.id}
              custom={dir}
              initial={{ opacity: 0, x: 40 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 * dir }}
              transition={{ duration: 0.25 }}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-7"
              data-testid="survey-question"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="shrink-0">
                  <Mascot size={64} mood="think" />
                </div>
                <div className="pt-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 sm:text-xl">{tr(question.question_text, locale)}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {question.required ? t.required : t.optional}
                    {question.type === "single" && ` · ${t.pickOne}`}
                    {question.type === "multiple" && ` · ${t.pickMany}`}
                  </p>
                </div>
              </div>
              <QuestionInput q={question} value={answers[question.id]} onChange={(v) => setAnswer(question.id, v)} />
            </motion.div>
          </AnimatePresence>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={back}
              disabled={index === 0}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ← {t.back}
            </button>
            <button
              type="button"
              onClick={next}
              disabled={question.required && !answered}
              className="rounded-full bg-indigo-600 px-7 py-2.5 font-semibold text-white shadow transition hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-40"
            >
              {last ? t.finish : !question.required && !answered ? t.skip : t.next} {last ? "" : "→"}
            </button>
          </div>
        </div>
      )}

      {stage === "submitting" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto w-fit">
            <Mascot size={120} mood="think" />
          </div>
          <p className="mt-4 font-medium text-slate-700 dark:text-slate-200" aria-live="polite">
            {t.submitting}
          </p>
        </div>
      )}

      {stage === "error" && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900 dark:bg-rose-950" role="alert">
          <p className="mb-4 font-semibold text-rose-800 dark:text-rose-200">{t.errorTitle}</p>
          <button type="button" onClick={() => void submit()} className="rounded-full bg-rose-600 px-6 py-2 font-semibold text-white hover:bg-rose-700">
            {t.retry}
          </button>
        </div>
      )}

      {(stage === "done" || stage === "already" || stage === "closed") && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"
          data-testid="survey-thanks"
        >
          <div className="mx-auto w-fit">
            <Mascot size={130} mood="celebrate" />
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-50">{stage === "closed" ? t.closed : t.thanksTitle}</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{stage === "done" ? t.thanksText : stage === "already" ? t.already : t.notFoundText}</p>
          <Link href={`/${locale}/surveys`} className="mt-6 inline-block rounded-full bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-700">
            {t.allSurveys}
          </Link>
        </motion.div>
      )}
    </div>
  );
}

function QuestionInput({ q, value, onChange }: { q: PublicSurveyQuestion; value: AnswerValue | undefined; onChange: (v: AnswerValue | undefined) => void }) {
  const { t, locale } = useSurveyT();
  const opt = (selected: boolean) =>
    `w-full rounded-2xl border-2 px-4 py-3 text-left font-medium transition active:scale-[0.99] ${
      selected
        ? "border-indigo-600 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
        : "border-slate-200 text-slate-800 hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
    }`;

  if (q.type === "single")
    return (
      <ul className="space-y-3" role="radiogroup">
        {q.options.map((o) => (
          <li key={o.id}>
            <button type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={opt(value === o.id)}>
              {tr(o.text, locale)}
            </button>
          </li>
        ))}
      </ul>
    );

  if (q.type === "multiple") {
    const cur = Array.isArray(value) ? value : [];
    return (
      <ul className="space-y-3">
        {q.options.map((o) => {
          const on = cur.includes(o.id);
          return (
            <li key={o.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => {
                  const nextVal = on ? cur.filter((x) => x !== o.id) : [...cur, o.id];
                  onChange(nextVal.length ? nextVal : undefined);
                }}
                className={opt(on)}
              >
                <span className="mr-2" aria-hidden="true">
                  {on ? "☑" : "☐"}
                </span>
                {tr(o.text, locale)}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (q.type === "yesno")
    return (
      <div className="grid grid-cols-2 gap-3" role="radiogroup">
        {(["yes", "no"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`${opt(value === v)} text-center text-lg`}>
            {v === "yes" ? "👍 " : "👎 "}
            {t[v]}
          </button>
        ))}
      </div>
    );

  if (q.type === "scale") {
    const values = Array.from({ length: q.scale_max - q.scale_min + 1 }, (_, i) => q.scale_min + i);
    return (
      <div>
        <div className="flex flex-wrap justify-center gap-2" role="radiogroup">
          {values.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              onClick={() => onChange(n)}
              className={`size-12 rounded-full border-2 text-lg font-bold transition active:scale-95 ${
                value === n
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 text-slate-800 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-100"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {(tr(q.scale_min_label, locale) || tr(q.scale_max_label, locale)) && (
          <div className="mt-3 flex justify-between gap-4 text-xs text-slate-500">
            <span>{tr(q.scale_min_label, locale)}</span>
            <span className="text-right">{tr(q.scale_max_label, locale)}</span>
          </div>
        )}
      </div>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value || undefined)}
        maxLength={MAX_TEXT_ANSWER}
        rows={5}
        placeholder={t.typeHere}
        aria-label={tr(q.question_text, locale)}
        className={inputCls}
      />
      <p className="mt-1 text-right text-xs text-slate-500">
        {text.length}/{MAX_TEXT_ANSWER} {t.chars}
      </p>
    </div>
  );
}
