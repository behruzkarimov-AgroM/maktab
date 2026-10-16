"use client";

import { useState } from "react";
import { Bell, Megaphone, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { sdelete, spatch, spost } from "@/lib/school/client";
import { AUDIENCES, type Announcement, type Audience } from "@/lib/school/types";
import { Badge, Button, Card } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import {
  Async, ConfirmDialog, DirPage, EmptyState, Field, Input, Kpi, Modal, SectionCard, Select, Tabs, Textarea, fmtDateTime, useApi, useClasses, useErrText, useToast,
} from "./common";

interface NotifStats { total: number; unread: number; read_rate: number | null; by_type: { type: string; total: number; unread: number }[]; recent: { id: string; type: string; created_at: string; read: boolean; payload: Record<string, unknown> }[] }

export function Announcements() {
  const { t } = useSchool();
  const [tab, setTab] = useState<"list" | "notif">("list");
  return (
    <DirPage title={t("navAnnouncements")}>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "list", label: t("navAnnouncements") }, { key: "notif", label: t("d_notif_overview") }]} />
      {tab === "list" ? <List /> : <NotifOverview />}
    </DirPage>
  );
}

function List() {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const { classes } = useClasses();
  const res = useApi<{ announcements: Announcement[] }>("/announcements?limit=100");
  const [form, setForm] = useState<Announcement | "new" | null>(null);
  const [del, setDel] = useState<Announcement | null>(null);

  async function togglePin(a: Announcement) {
    res.setData((d) => ({ ...d, announcements: d.announcements.map((x) => (x.id === a.id ? { ...x, pinned: !x.pinned } : x)) })); // optimistic
    try {
      await spatch(`/announcements/${a.id}`, { audience: a.audience, class_id: a.class_id, title: a.title, body: a.body, pinned: !a.pinned });
      res.reload();
    } catch (e) {
      res.reload();
      toast("err", errText(e));
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setForm("new")}><Plus className="size-4" /> {t("d_new_announcement")}</Button></div>
      <Async state={res} empty={!!res.data && res.data.announcements.length === 0}>
        <div className="space-y-3">
          {res.data?.announcements.map((a) => (
            <Card key={a.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold">{a.pinned ? <Pin className="size-4 text-fuchsia-500" /> : <Megaphone className="size-4 text-slate-500 dark:text-slate-400" />}{a.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="navy">{t(`d_aud_${a.audience}` as "d_aud_all")}{a.class_id ? `: ${classes.find((c) => c.id === a.class_id)?.name ?? ""}` : ""}</Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDateTime(a.publish_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{a.body}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label={a.pinned ? t("d_unpin") : t("d_pin")} aria-pressed={a.pinned} onClick={() => togglePin(a)}>{a.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</Button>
                  <Button size="icon" variant="ghost" aria-label={t("edit")} onClick={() => setForm(a)}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={t("delete")} onClick={() => setDel(a)}><Trash2 className="size-4 text-red-500" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Async>
      {form && <AnnForm ann={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={res.reload} />}
      <ConfirmDialog
        open={!!del} danger title={t("delete")} text={del?.title} onClose={() => setDel(null)}
        onConfirm={async () => {
          try { await sdelete(`/announcements/${del!.id}`); toast("ok", t("d_deleted")); res.reload(); } catch (e) { toast("err", errText(e)); }
          setDel(null);
        }}
      />
    </div>
  );
}

function AnnForm({ ann, onClose, onSaved }: { ann: Announcement | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const { classes } = useClasses();
  const [f, setF] = useState({ audience: (ann?.audience ?? "all") as Audience, class_id: ann?.class_id ?? "", title: ann?.title ?? "", body: ann?.body ?? "", pinned: ann?.pinned ?? false });
  const [busy, setBusy] = useState(false);
  const bad = !f.title.trim() || (f.audience === "class" && !f.class_id);
  async function save() {
    setBusy(true);
    const body = { ...f, class_id: f.audience === "class" ? f.class_id : null };
    try {
      if (ann) await spatch(`/announcements/${ann.id}`, body);
      else await spost("/announcements", body);
      toast("ok", t("d_saved"));
      onSaved();
      onClose();
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={ann ? t("edit") : t("d_new_announcement")} footer={<><Button onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={bad} onClick={save}>{t("save")}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("d_audience")}><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as Audience })}>{AUDIENCES.map((a) => <option key={a} value={a}>{t(`d_aud_${a}` as "d_aud_all")}</option>)}</Select></Field>
          {f.audience === "class" && <Field label={t("class")} required><Select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}><option value="">-</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
        </div>
        <Field label={t("d_title")} required><Input value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t("d_text")}><Textarea rows={6} value={f.body} maxLength={4000} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> {t("d_pin")}</label>
      </div>
    </Modal>
  );
}

function NotifOverview() {
  const { t } = useSchool();
  const res = useApi<{ stats: NotifStats }>("/director/notifications");
  const s = res.data?.stats;
  return (
    <Async state={res}>
      {s && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Kpi label={t("d_total")} value={s.total} icon={<Bell className="size-4" />} />
            <Kpi label={t("d_unread")} value={s.unread} />
            <Kpi label={t("d_read_rate")} value={s.read_rate === null ? "-" : `${s.read_rate}%`} />
          </div>
          <SectionCard title={t("d_by_type")}>
            {s.by_type.length === 0 ? <EmptyState /> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {s.by_type.map((x) => <li key={x.type} className="flex justify-between py-2 text-sm"><Badge>{x.type}</Badge><span className="tabular-nums">{x.total} <span className="text-slate-500 dark:text-slate-400">({x.unread} {t("d_unread").toLowerCase()})</span></span></li>)}
              </ul>
            )}
          </SectionCard>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("d_notif_hint")}</p>
        </div>
      )}
    </Async>
  );
}
