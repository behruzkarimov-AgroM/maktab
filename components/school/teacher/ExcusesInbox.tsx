"use client";

import { useState } from "react";
import { CheckCircle2, FileCheck2, XCircle } from "lucide-react";
import { Badge, Button, Card } from "@/components/school/ui/kit";
import { spost } from "@/lib/school/client";
import type { Notification } from "@/lib/school/types";
import { EmptyState, ErrorState, fmtDate, Skeleton, type useToasts, useApi } from "./common";
import { useTT } from "./use-tt";

interface Payload {
  student_id?: string;
  student_name?: string;
  class_name?: string;
  date?: string;
  reason?: string;
  note?: string;
  from?: string;
}

/** Number of unread parent explanations (for the dashboard badge) */
export function useExcuseCount(): { pending: number | null; reload: () => void } {
  const n = useApi<{ unread: number; items: Notification[] }>("/notifications?limit=100");
  return { pending: n.data ? n.data.items.filter((x) => x.type === "absence_excuse" && !x.read_at).length : null, reload: n.reload };
}

/** Inbox of `absence_excuse` notifications: Accept (POST /teacher/excuse/accept -> the absence becomes excused) or Reject (dismiss). */
export function ExcusesInbox({ toasts }: { toasts: ReturnType<typeof useToasts> }) {
  const { t, errText } = useTT();
  const list = useApi<{ unread: number; items: Notification[] }>("/notifications?limit=100");
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [handled, setHandled] = useState<Record<string, "accepted" | "rejected">>({});

  if (list.error) return <ErrorState message={errText(list.error)} onRetry={list.reload} />;
  if (!list.data) return <Skeleton className="h-40" />;
  const items = list.data.items.filter((n) => n.type === "absence_excuse");
  const pending = items.filter((n) => !n.read_at && !handled[n.id]);
  const done = items.filter((n) => n.read_at || handled[n.id]);

  async function accept(n: Notification) {
    setBusy(n.id);
    try {
      await spost("/teacher/excuse/accept", { notificationId: n.id });
      setHandled((h) => ({ ...h, [n.id]: "accepted" }));
      toasts.push("ok", t("a_ex_accepted"));
      list.reload();
    } catch (e) {
      toasts.push("error", errText(e));
      list.reload();
    } finally {
      setBusy(null);
    }
  }
  async function reject(n: Notification) {
    const text = comment.trim();
    if (text.length < 3) {
      toasts.push("error", t("a_ex_reject_short"));
      return;
    }
    setBusy(n.id);
    try {
      await spost("/teacher/excuse/reject", { notificationId: n.id, comment: text });
      setHandled((h) => ({ ...h, [n.id]: "rejected" }));
      setRejecting(null);
      setComment("");
      toasts.push("info", t("a_ex_rejected"));
      list.reload();
    } catch (e) {
      toasts.push("error", errText(e));
    } finally {
      setBusy(null);
    }
  }

  const reasonLabel = (r?: string) => (r === "sick" ? t("stSick") : r === "family" ? t("f_reasonFamily") : t("f_reasonOther"));

  return (
    <section aria-labelledby="h-excuses" className="space-y-3">
      <h2 id="h-excuses" className="flex items-center gap-2 text-base font-bold"><FileCheck2 className="size-4" aria-hidden />{t("a_ex_title")}{pending.length > 0 && <Badge tone="amber">{pending.length}</Badge>}</h2>
      {pending.length === 0 ? <EmptyState text={t("a_ex_empty")} /> : (
        <ul className="space-y-3" data-testid="excuse-list">
          {pending.map((n) => {
            const p = n.payload as Payload;
            return (
              <li key={n.id}>
                <Card className="p-4">
                  <p className="font-semibold">{(p.student_name ?? "").trim()} <span className="font-normal text-slate-600 dark:text-slate-400">{p.class_name}</span></p>
                  <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{p.date ? fmtDate(p.date) : ""} · {t("a_ex_reason")}: {reasonLabel(p.reason)}{p.from ? ` · ${p.from}` : ""}</p>
                  {p.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/60">{p.note}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" className="min-h-11" loading={busy === n.id && rejecting !== n.id} disabled={busy !== null} onClick={() => void accept(n)}>
                      <CheckCircle2 className="size-4" aria-hidden />{t("a_ex_accept")}
                    </Button>
                    <Button className="min-h-11" disabled={busy !== null} aria-expanded={rejecting === n.id} onClick={() => { setComment(""); setRejecting(rejecting === n.id ? null : n.id); }}>
                      <XCircle className="size-4" aria-hidden />{t("a_ex_reject")}
                    </Button>
                  </div>
                  {rejecting === n.id && (
                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs text-slate-600 dark:text-slate-300">{t("a_ex_reject_note")}</p>
                      <label htmlFor={`ex-why-${n.id}`} className="block text-sm font-medium">{t("a_ex_reject_why")}</label>
                      <textarea
                        id={`ex-why-${n.id}`}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        maxLength={300}
                        rows={3}
                        required
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                      />
                      <Button variant="danger" className="min-h-11" loading={busy === n.id} disabled={busy !== null || comment.trim().length < 3} onClick={() => void reject(n)}>{t("a_ex_reject_confirm")}</Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 && (
        <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <summary className="min-h-11 cursor-pointer text-sm font-medium">{t("a_ex_handled").replace("{n}", String(done.length))}</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {done.map((n) => {
              const p = n.payload as Payload;
              return <li key={n.id} className="flex flex-wrap items-center gap-2"><span>{p.student_name} · {p.date ? fmtDate(p.date) : ""}</span>{handled[n.id] === "rejected" ? <Badge tone="gray">{t("a_ex_rejected")}</Badge> : handled[n.id] === "accepted" ? <Badge tone="green">{t("a_ex_accepted_short")}</Badge> : null}</li>;
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
