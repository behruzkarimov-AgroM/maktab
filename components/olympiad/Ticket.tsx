"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { CalendarPlus, CheckCircle2, Download, Printer, Share2 } from "lucide-react";
import { downloadIcs } from "./ics";
import { tr, type Locale } from "@/lib/types";
import { drawTicket, downloadTicketPdf, downloadTicketPng, type TicketLabels } from "@/lib/pdf/ticket";
import { fmtDate, type OlympiadStrings } from "./i18n";
import type { IssuedTicket, Olympiad } from "./types";

export function Ticket({
  ticket,
  olympiad,
  locale,
  t,
  onNew,
}: {
  ticket: IssuedTicket;
  olympiad: Olympiad | undefined;
  locale: Locale;
  t: OlympiadStrings;
  onNew: () => void;
}) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const subject = tr(olympiad?.subjects.find((s) => s.key === ticket.subjectKey)?.name, locale) || ticket.subjectKey;
  const title = tr(olympiad?.title, locale);
  const date = olympiad ? fmtDate(olympiad.eventDate, locale, true) : "";
  const place = tr(olympiad?.location, locale);

  const [copied, setCopied] = useState(false);
  // Shares text only (olympiad + ticket ID): no URL, no personal data in links.
  const share = async () => {
    const text = `${title}: ${ticket.ticket}`;
    try {
      if (navigator.share) await navigator.share({ title: t.ticketTitle, text });
      else {
        await navigator.clipboard.writeText(ticket.ticket);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user cancelled */
    }
  };

  const build = () => {
    const labels: TicketLabels = {
      schoolName: t.schoolName,
      title: t.ticketTitle,
      ticket: t.ticketNo,
      student: t.student,
      olympiad: t.selectOlympiad,
      subject: t.subject,
      grade: t.grade,
      date: t.eventDate,
      location: t.location,
      school: t.school,
      scanHint: t.scanHint,
      note: t.ticketNote,
    };
    return drawTicket(
      { ticket: ticket.ticket, name: ticket.studentName, olympiad: title, subject, grade: ticket.grade, date, location: place, school: ticket.school },
      labels,
      qrRef.current!,
    );
  };

  const run = async (kind: "pdf" | "png") => {
    if (!qrRef.current) return;
    setBusy(true);
    try {
      const c = build();
      if (kind === "pdf") await downloadTicketPdf(c, ticket.ticket);
      else downloadTicketPng(c, ticket.ticket);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-2 text-emerald-700 dark:text-emerald-300" role="status">
        <CheckCircle2 className="h-6 w-6" aria-hidden />
        <h2 className="text-xl font-bold">{t.ticketReady}</h2>
      </div>

      <div id="oly-ticket" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-indigo-700 to-purple-600 px-6 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">{t.schoolName}</p>
          <p className="text-2xl font-extrabold">{t.ticketTitle}</p>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto]">
          <dl className="space-y-3 text-sm">
            <Row k={t.ticketNo} v={ticket.ticket} mono />
            <Row k={t.student} v={ticket.studentName} />
            <Row k={t.selectOlympiad} v={title} />
            <Row k={t.subject} v={subject} />
            <Row k={t.grade} v={String(ticket.grade)} />
            <Row k={t.school} v={ticket.school} />
            {date && <Row k={t.eventDate} v={date} />}
            {place && <Row k={t.location} v={place} />}
          </dl>
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl bg-white p-3 shadow-inner ring-1 ring-slate-200">
              <QRCodeSVG value={ticket.qrPayload} size={160} level="M" title={ticket.ticket} />
            </div>
            <p className="max-w-40 text-center text-xs text-slate-500 dark:text-slate-400">{t.scanHint}</p>
          </div>
        </div>
      </div>

      {/* hidden high-res QR used for PDF/PNG export */}
      <div className="hidden" aria-hidden>
        <QRCodeCanvas ref={qrRef} value={ticket.qrPayload} size={640} level="M" marginSize={0} />
      </div>

      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t.ticketNote}</p>

      <div className="mt-5 flex flex-wrap gap-3 print:hidden">
        <button type="button" disabled={busy} onClick={() => run("pdf")} className={btn(true)}>
          <Download className="h-4 w-4" aria-hidden /> {t.downloadPdf}
        </button>
        <button type="button" disabled={busy} onClick={() => run("png")} className={btn(false)}>
          <Download className="h-4 w-4" aria-hidden /> {t.downloadPng}
        </button>
        {olympiad && (
          <button type="button" onClick={() => downloadIcs(olympiad, locale, t)} className={btn(false)}>
            <CalendarPlus className="h-4 w-4" aria-hidden /> {t.addToCalendar}
          </button>
        )}
        <button type="button" onClick={share} className={btn(false)}>
          <Share2 className="h-4 w-4" aria-hidden /> {copied ? t.copied : t.share}
        </button>
        <button type="button" onClick={() => window.print()} className={btn(false)}>
          <Printer className="h-4 w-4" aria-hidden /> {t.print}
        </button>
        <button type="button" onClick={onNew} className={btn(false)}>
          {t.newReg}
        </button>
      </div>
    </div>
  );
}

const btn = (primary: boolean) =>
  `inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
    primary
      ? "bg-indigo-600 text-white hover:bg-indigo-500"
      : "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
  }`;

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{k}</dt>
      <dd className={`text-base font-semibold text-slate-900 dark:text-white ${mono ? "font-mono text-lg" : ""}`}>{v}</dd>
    </div>
  );
}
