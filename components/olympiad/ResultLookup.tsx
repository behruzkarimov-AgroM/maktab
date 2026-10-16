"use client";

import { useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { tr, type Locale } from "@/lib/types";
import type { OlympiadStrings } from "./i18n";
import { TICKET_RE, type Olympiad, type PublicResult } from "./types";

export function ResultLookup({
  t,
  locale,
  olympiads,
  demoTickets,
}: {
  t: OlympiadStrings;
  locale: Locale;
  olympiads: Olympiad[];
  demoTickets?: string[];
}) {
  const [ticket, setTicket] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<PublicResult | null>(null);

  const norm = ticket.trim().toUpperCase();
  const valid = TICKET_RE.test(norm);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setErr(null);
    setRes(null);
    try {
      const r = await fetch(`/api/olympiad/result?ticket=${encodeURIComponent(norm)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(t.errors[j?.error as string] ?? t.errors.server);
      else if (!j.result) setErr(t.errors.notFound);
      else setRes(j.result as PublicResult);
    } catch {
      setErr(t.errors.network);
    } finally {
      setLoading(false);
    }
  }

  const subjectName = (r: PublicResult) => {
    for (const o of olympiads) {
      const s = o.subjects.find((x) => x.key === r.subjectKey);
      if (s) return tr(s.name, locale);
    }
    return r.subjectName ? tr(r.subjectName, locale) : (r.subjectKey ?? "");
  };

  return (
    <div className="mx-auto max-w-xl">
      <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5" noValidate>
        <h2 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">{t.resultTitle}</h2>
        <label htmlFor="oly-ticket-id" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
          {t.ticketId}
        </label>
        <input
          id="oly-ticket-id"
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          placeholder={t.ticketPh}
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          aria-invalid={ticket.length > 0 && !valid}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono uppercase text-slate-900 focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 dark:border-white/15 dark:bg-slate-900/60 dark:text-white"
        />
        {ticket.length > 0 && !valid && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.ticketPh}</p>
        )}
        {demoTickets && demoTickets.length > 0 && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t.demoHint} <span className="font-mono">{demoTickets[0]}</span>
          </p>
        )}
        <button
          type="submit"
          disabled={!valid || loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {loading ? t.checking : t.check}
        </button>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t.resultNote}</p>
      </form>

      <div aria-live="polite">
        {err && (
          <p role="alert" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {err}
          </p>
        )}
        {res && (
          <div className="mt-5 rounded-3xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="mb-3 flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <Trophy className="h-6 w-6" aria-hidden />
              <span className="font-mono font-bold">{res.ticket}</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{res.name}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Item k={t.subject} v={subjectName(res)} />
              <Item k={t.status} v={t.statuses[res.status] ?? res.status} />
              <Item k={t.score} v={`${res.score} / ${res.maxScore}`} />
              {res.rank != null && <Item k={t.rank} v={`#${res.rank}`} />}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">{k}</dt>
      <dd className="text-lg font-bold text-slate-900 dark:text-white">{v}</dd>
    </div>
  );
}
