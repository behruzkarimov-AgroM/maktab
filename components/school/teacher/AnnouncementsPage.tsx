"use client";

import { useState } from "react";
import { Bell, Megaphone, Pin, Trash2 } from "lucide-react";
import { Badge, Button, Card, cn, inputCls } from "@/components/school/ui/kit";
import { sdelete, spost } from "@/lib/school/client";
import type { Announcement, Notification } from "@/lib/school/types";
import { EmptyState, ErrorState, Field, fmtDate, Gate, PageHead, selectCls, Skeleton, Tabs, ToastHost, useApi, useBase, useToasts, type Base } from "./common";
import { ExcusesInbox } from "./ExcusesInbox";
import { useTT } from "./use-tt";

export function AnnouncementsPage() {
  const state = useBase();
  return <Gate state={state}>{(b) => <Inner b={b} />}</Gate>;
}

function Inner({ b }: { b: Base }) {
  const { tt, t, session, errText } = useTT();
  const toasts = useToasts();
  const [tab, setTab] = useState<"ann" | "notif" | "excuses">(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "excuses" ? "excuses" : "ann"));
  const ann = useApi<{ announcements: Announcement[] }>("/announcements?limit=50");
  const notif = useApi<{ unread: number; items: Notification[] }>("/notifications?limit=50");
  const [classId, setClassId] = useState(b.ov.classes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async () => {
    setBusy(true);
    try {
      await spost("/announcements", { audience: "class", class_id: classId, title, body, pinned: false });
      setTitle("");
      setBody("");
      toasts.push("ok", tt("ann_posted"));
      ann.reload();
    } catch (e) {
      toasts.push("error", errText(e));
    } finally {
      setBusy(false);
    }
  };
  const del = async (id: string) => {
    if (!window.confirm(tt("ann_confirmDelete"))) return;
    try {
      await sdelete(`/announcements/${id}`);
      ann.reload();
    } catch (e) {
      toasts.push("error", errText(e));
    }
  };
  const markAll = async () => {
    try {
      await spost("/notifications", { all: true });
      notif.reload();
    } catch (e) {
      toasts.push("error", errText(e));
    }
  };
  const className = (id: string | null) => b.ov.classes.find((c) => c.id === id)?.name;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title={tt("ann_title")} actions={<Tabs value={tab} onChange={setTab} items={[{ key: "ann", label: tt("navAnnouncements") }, { key: "excuses", label: t("a_ex_nav") }, { key: "notif", label: `${tt("navNotifications")}${notif.data?.unread ? ` (${notif.data.unread})` : ""}` }]} />} />
      {tab === "ann" ? (
        <div className="space-y-4">
          {b.ov.classes.length > 0 && (
            <Card className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-bold"><Megaphone className="size-4" />{tt("ann_new")}</h2>
              <Field label={tt("class")}><select className={selectCls} value={classId} onChange={(e) => setClassId(e.target.value)}>{b.ov.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label={tt("ann_subject")}><input className={cn(inputCls, "min-h-11")} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label={tt("ann_body")}><textarea rows={3} className={inputCls} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
              <Button variant="primary" loading={busy} disabled={!title.trim() || !classId} onClick={() => void post()}>{tt("ann_post")}</Button>
            </Card>
          )}
          {ann.error ? <ErrorState message={errText(ann.error)} onRetry={ann.reload} /> : !ann.data ? <Skeleton className="h-40" /> : ann.data.announcements.length === 0 ? <EmptyState text={tt("noData")} /> : (
            <ul className="space-y-3">
              {ann.data.announcements.map((a) => (
                <li key={a.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="flex items-center gap-1.5 font-bold">{a.pinned && <Pin className="size-4 text-fuchsia-500" />}{a.title}</p>
                        <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span>{fmtDate(a.publish_at.slice(0, 10))}</span><Badge tone="blue">{a.audience === "class" ? className(a.class_id) ?? tt("class") : a.audience}</Badge></p></div>
                      {a.author_id === session?.id && <button aria-label={tt("delete")} onClick={() => void del(a.id)} className="grid size-11 place-items-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="size-4" /></button>}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{a.body}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : tab === "excuses" ? (
        <ExcusesInbox toasts={toasts} />
      ) : notif.error ? <ErrorState message={errText(notif.error)} onRetry={notif.reload} /> : !notif.data ? <Skeleton className="h-40" /> : (
        <div>
          <div className="mb-2 flex justify-end"><Button size="sm" disabled={!notif.data.unread} onClick={() => void markAll()}>{tt("notif_markAll")}</Button></div>
          {notif.data.items.length === 0 ? <EmptyState icon={<Bell className="size-8 opacity-60" />} text={tt("noData")} /> : (
            <ul className="space-y-2">
              {notif.data.items.map((n) => (
                <li key={n.id} className={cn("rounded-xl border p-3 text-sm", n.read_at ? "border-slate-200 dark:border-slate-800" : "border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/20")}>
                  <p className="font-semibold">{String(n.payload.title ?? n.payload.student_name ?? n.type)}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{n.type === "absence_excuse" ? t("a_ex_nav") : n.type} · {fmtDate(n.created_at.slice(0, 10))}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ToastHost items={toasts.items} dismiss={toasts.dismiss} />
    </div>
  );
}
