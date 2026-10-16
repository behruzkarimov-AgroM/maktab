"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { Loader2, Trophy } from "lucide-react";
import { tr, type Locale } from "@/lib/types";
import { Countdown } from "./Countdown";
import { olympiadDict } from "./i18n";
import { Leaderboard } from "./Leaderboard";
import { OlympiadList, olympiadState } from "./OlympiadList";
import { RegisterForm } from "./RegisterForm";
import { ResultLookup } from "./ResultLookup";
import type { IssuedTicket, Olympiad, OlympiadListResponse } from "./types";

// QR code + ticket tooling is only needed after a successful registration
const Ticket = dynamic(() => import("./Ticket").then((m) => m.Ticket), {
  loading: () => <Loader2 className="mx-auto my-10 size-6 animate-spin text-slate-400" aria-hidden="true" />,
});

type Tab = "list" | "register" | "result" | "board";

export default function OlympiadsPage() {
  const locale = useLocale() as Locale;
  const t = olympiadDict[locale] ?? olympiadDict.uz;

  const [data, setData] = useState<OlympiadListResponse | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("list");
  const [selectedId, setSelectedId] = useState("");
  const [ticket, setTicket] = useState<IssuedTicket | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(false);
    setData(null);
    try {
      const r = await fetch("/api/olympiad", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setData((await r.json()) as OlympiadListResponse);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const olympiads: Olympiad[] = data?.olympiads ?? [];
  const next = olympiads
    .filter((o) => now !== null && new Date(o.eventDate).getTime() > now)
    .sort((a, b) => +new Date(a.eventDate) - +new Date(b.eventDate))[0];

  const tabs: [Tab, string][] = [
    ["list", t.tabList],
    ["register", t.tabRegister],
    ["result", t.tabResult],
    ["board", t.tabBoard],
  ];

  return (
    <div>
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-indigo-800 via-indigo-600 to-violet-600 px-4 pb-16 pt-28 text-white">
        <div className="pointer-events-none absolute -left-24 top-10 -z-10 h-72 w-72 rounded-full bg-sky-400/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-16 bottom-0 -z-10 h-80 w-80 rounded-full bg-fuchsia-400/25 blur-3xl" aria-hidden />
        <div className="mx-auto max-w-5xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur">
            <Trophy className="h-4 w-4" aria-hidden /> {t.badge}
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">{t.heroTitle}</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">{t.heroSub}</p>
          <div className="mt-8 rounded-3xl border border-white/20 bg-white/10 p-5 backdrop-blur-md sm:p-6">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/80">
              {t.nextEvent}
              {next ? `: ${tr(next.title, locale)}` : ""}
            </p>
            {next ? <Countdown target={next.eventDate} t={t} /> : <p className="text-white/90">{data ? t.noUpcoming : t.loading}</p>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <div role="tablist" aria-label={t.badge} className="mb-8 flex flex-wrap gap-2">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              id={`oly-tab-${k}`}
              aria-selected={tab === k}
              aria-controls="oly-panel"
              onClick={() => setTab(k)}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                tab === k
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div id="oly-panel" role="tabpanel" aria-labelledby={`oly-tab-${tab}`}>
          {error ? (
            <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <p>{t.loadError}</p>
              <button type="button" onClick={load} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">
                {t.retry}
              </button>
            </div>
          ) : !data ? (
            <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t.loading}
            </p>
          ) : tab === "list" ? (
            <OlympiadList
              olympiads={olympiads}
              locale={locale}
              t={t}
              now={now}
              onRegister={(id) => {
                setSelectedId(id);
                setTicket(null);
                setTab("register");
              }}
              onCheck={() => setTab("result")}
            />
          ) : tab === "register" ? (
            ticket ? (
              <Ticket
                ticket={ticket}
                olympiad={olympiads.find((o) => o.id === ticket.olympiadId)}
                locale={locale}
                t={t}
                onNew={() => setTicket(null)}
              />
            ) : (
              <RegisterForm
                key={selectedId}
                olympiads={olympiads.filter((o) => olympiadState(o, now) === "open")}
                selectedId={selectedId}
                onSelect={setSelectedId}
                locale={locale}
                t={t}
                now={now}
                onDone={setTicket}
              />
            )
          ) : tab === "board" ? (
            <Leaderboard olympiads={olympiads} locale={locale} t={t} />
          ) : (
            <ResultLookup t={t} locale={locale} olympiads={olympiads} demoTickets={data.demo ? data.demoTickets : undefined} />
          )}
        </div>
      </section>
    </div>
  );
}
