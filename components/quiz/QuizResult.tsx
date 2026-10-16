"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, RotateCcw, Star, XCircle } from "lucide-react";
import { formatDate } from "@/lib/format";
import { tr, type Locale } from "@/lib/types";
import { useLocale } from "next-intl";
import { drawCertificate, downloadCertificatePdf, downloadCertificatePng, type CertificateLabels } from "@/lib/pdf/certificate";
import { quizDict } from "./i18n";
import type { QuizQuestion, QuizSummary, SubmitResult } from "./types";

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

interface Props {
  best: { name: string; pct: number } | null;
  onRetryWrong: () => void;
  quiz: QuizSummary;
  questions: QuizQuestion[];
  result: SubmitResult;
  studentName: string;
  grade: number;
  seconds: number;
  timeUp: boolean;
  onRetake: () => void;
}

export default function QuizResult({ quiz, questions, result, studentName, grade, seconds, onRetake, onRetryWrong, best }: Props) {
  const locale = useLocale() as Locale;
  const t = quizDict[locale] ?? quizDict.uz;
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = useRef(false);

  const stars = !result.passed ? 0 : result.scorePercent >= 90 ? 3 : result.scorePercent >= 75 ? 2 : 1;

  useEffect(() => {
    if (!result.passed) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.4 } });
      if (result.scorePercent >= 90) setTimeout(() => confetti({ particleCount: 100, spread: 120, origin: { y: 0.5 } }), 400);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  const timeStr = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const byId = new Map(questions.map((q) => [q.id, q]));
  const rows = result.review.filter((r) => (onlyWrong ? !r.isCorrect : true));

  async function download(kind: "cert" | "sheet" | "png") {
    setBusy(true);
    try {
      const labels: CertificateLabels = {
        schoolName: t.schoolName,
        certificateTitle: t.certTitle,
        resultTitle: t.resultTitle,
        awardedTo: t.awardedTo,
        forQuiz: t.forQuiz,
        score: t.score,
        correct: t.correct,
        grade: t.grade,
        time: t.time,
        date: t.date,
        passed: t.passedLabel,
        failed: t.failedLabel,
        footer: t.certFooter,
      };
      const date = formatDate(locale, new Date());
      // "certificate" is only issued on pass; otherwise the same layout is a plain result sheet.
      const canvas = drawCertificate(
        {
          studentName,
          quizTitle: tr(quiz.title, locale),
          subject: tr(quiz.subjectName, locale),
          grade,
          scorePercent: result.scorePercent,
          correct: result.correct,
          total: result.total,
          passed: result.passed,
          stars,
          date,
          timeSpent: timeStr,
        },
        labels,
      );
      if (kind === "png") downloadCertificatePng(canvas, studentName);
      else {
        const blob = await downloadCertificatePdf(canvas, studentName);
        // archive passed certificates server-side (no-op when storage isn't configured)
        if (result.passed && result.certToken && !archived.current && blob.size < 1_500_000) {
          archived.current = true;
          void blobToBase64(blob)
            .then((pdf) =>
              fetch(`/api/quiz/${encodeURIComponent(quiz.id)}/certificate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pdf, scorePercent: result.scorePercent, token: result.certToken ?? "", name: studentName.trim() }),
              }),
            )
            .catch(() => {
              archived.current = false;
            });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const optText = (q: QuizQuestion | undefined, id: string | null) => {
    if (!q || !id) return t.noAnswer;
    const o = q.options.find((x) => x.id === id);
    return o ? `${o.id}. ${tr(o.text, locale)}` : id;
  };

  const btn =
    "inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10";

  return (
    <div>
      <div
        className={`rounded-3xl p-8 text-center text-white ${
          result.passed ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-slate-600 to-slate-800"
        }`}
        role="status"
      >
        <div className="mb-3 flex justify-center gap-2" aria-label={`${stars}/3`}>
          {[0, 1, 2].map((i) => (
            <Star key={i} className={`h-12 w-12 ${i < stars ? "fill-amber-300 text-amber-300" : "text-white/40"}`} aria-hidden />
          ))}
        </div>
        <h1 className="text-2xl font-extrabold">{result.passed ? (result.scorePercent === 100 ? t.perfect : t.passed) : t.failed}</h1>
        <p className="mt-4 text-6xl font-extrabold tabular-nums">{result.scorePercent}%</p>
        <p className="mt-2 text-white/85">
          {t.correct}: {result.correct}/{result.total} &middot; {t.time}: {timeStr} &middot; {t.passing}: {quiz.passingScorePercent}%
        </p>
      </div>

      {best && (
        <p className="mt-3 text-center text-sm text-slate-600 dark:text-slate-300">
          {t.bestPrev}: {best.pct}% ({best.name})
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {result.passed && (
          <button type="button" disabled={busy} onClick={() => download("cert")} className={`${btn} !border-indigo-600 !bg-indigo-600 !text-white hover:!bg-indigo-500`}>
            <Download className="h-4 w-4" aria-hidden /> {t.certificate}
          </button>
        )}
        {!result.passed && (
          <button type="button" disabled={busy} onClick={() => download("sheet")} className={btn}>
            <Download className="h-4 w-4" aria-hidden /> {t.resultSheet}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => download("png")} className={btn}>
          <Download className="h-4 w-4" aria-hidden /> {t.png}
        </button>
        {result.correct < result.total && (
          <button type="button" onClick={onRetryWrong} className={btn}>
            <RotateCcw className="h-4 w-4" aria-hidden /> {t.retryWrong} ({result.total - result.correct})
          </button>
        )}
        <button type="button" onClick={onRetake} className={btn}>
          <RotateCcw className="h-4 w-4" aria-hidden /> {t.retake}
        </button>
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t.analysis}</h2>
        <button type="button" aria-pressed={onlyWrong} onClick={() => setOnlyWrong(!onlyWrong)} className="text-sm font-medium text-indigo-600 underline dark:text-indigo-300">
          {onlyWrong ? t.showAll : t.onlyMistakes}
        </button>
      </div>
      <ol className="space-y-3">
        {rows.map((r) => {
          const q = byId.get(r.questionId);
          const n = questions.findIndex((x) => x.id === r.questionId) + 1;
          return (
            <li
              key={r.questionId}
              className={`rounded-2xl border p-4 ${
                r.isCorrect
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : "border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
              }`}
            >
              <p className="flex items-start gap-2 font-semibold text-slate-900 dark:text-white">
                {r.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label={t.correct} />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-label={t.failedLabel} />
                )}
                <span>
                  {n}. {q ? tr(q.text, locale) : ""}
                </span>
              </p>
              <dl className="mt-2 space-y-1 pl-7 text-sm text-slate-700 dark:text-slate-200">
                <div>
                  <dt className="inline font-medium">{t.yourAnswer}: </dt>
                  <dd className="inline">{optText(q, r.selected)}</dd>
                </div>
                {!r.isCorrect && (
                  <div>
                    <dt className="inline font-medium">{t.correctAnswer}: </dt>
                    <dd className="inline">{optText(q, r.correctOptionId)}</dd>
                  </div>
                )}
                {r.explanation && tr(r.explanation, locale) && (
                  <div className="pt-1 text-slate-600 dark:text-slate-300">
                    <dt className="inline font-medium">{t.explanation}: </dt>
                    <dd className="inline">{tr(r.explanation, locale)}</dd>
                  </div>
                )}
              </dl>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
