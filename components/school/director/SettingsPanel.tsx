"use client";

import { useState } from "react";
import { spatch } from "@/lib/school/client";
import { GRADE_KINDS, type GradeKind } from "@/lib/school/types";
import { Badge, Button } from "@/components/school/ui/kit";
import { AccountPanel } from "@/components/school/ui/AccountPanel";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { Async, ConfirmDialog, DirPage, Field, Input, SectionCard, useErrText, useMe, useToast, type MeInfo } from "./common";

function RulesForm({ me, reload }: { me: MeInfo; reload: () => void }) {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const r = me.rules;
  const [f, setF] = useState({ minEntries: r.minEntries, attendanceRiskPct: r.attendanceRiskPct, averageRisk: r.averageRisk, absenceStreak: r.absenceStreak, defaultWeights: { ...r.defaultWeights } });
  const [confirm, setConfirm] = useState(false);
  const year = me.year!;
  const num = (k: "minEntries" | "attendanceRiskPct" | "averageRisk" | "absenceStreak", label: string, min: number, max: number, step = 1) => (
    <Field label={label}><Input type="number" min={min} max={max} step={step} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></Field>
  );
  const valid = f.minEntries >= 1 && f.minEntries <= 20 && f.attendanceRiskPct >= 0 && f.attendanceRiskPct <= 100 && f.averageRisk >= 1 && f.averageRisk <= 5 && f.absenceStreak >= 1 && f.absenceStreak <= 20;
  return (
    <SectionCard title={t("d_grading_rules")}>
      <dl className="mb-4 grid gap-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-slate-500 dark:text-slate-400">{t("d_scale")}: </dt><dd className="inline font-medium">1-5</dd></div>
        <div><dt className="inline text-slate-500 dark:text-slate-400">{t("d_rounding")}: </dt><dd className="inline font-medium">{t("d_half_up")}</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-slate-500 dark:text-slate-400">{t("d_excluded_kinds")}: </dt><dd className="inline">{r.excludeKinds.map((k) => <Badge key={k} className="mr-1">{k}</Badge>)}</dd></div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {num("minEntries", t("d_min_entries"), 1, 20)}
        {num("attendanceRiskPct", t("d_att_risk_pct"), 0, 100)}
        {num("averageRisk", t("d_avg_risk"), 1, 5, 0.1)}
        {num("absenceStreak", t("d_absence_streak"), 1, 20)}
      </div>
      <p className="mb-1 mt-4 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("d_default_weights")}</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {(GRADE_KINDS.filter((k) => !r.excludeKinds.includes(k)) as GradeKind[]).map((k) => (
          <Field key={k} label={k}><Input type="number" min={0.1} max={10} step={0.5} value={f.defaultWeights[k]} onChange={(e) => setF({ ...f, defaultWeights: { ...f.defaultWeights, [k]: Number(e.target.value) } })} /></Field>
        ))}
      </div>
      <div className="mt-4"><Button variant="primary" disabled={!valid} onClick={() => setConfirm(true)}>{t("save")}</Button></div>
      <ConfirmDialog
        open={confirm} title={t("d_grading_rules")} text={t("d_rules_confirm")} onClose={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await spatch(`/years-terms/${year.id}`, { kind: "year", name: year.name, start_date: year.start_date, end_date: year.end_date, is_current: year.is_current, grading_rules: f });
            toast("ok", t("d_saved"));
            reload();
          } catch (e) {
            toast("err", errText(e));
          }
          setConfirm(false);
        }}
      />
    </SectionCard>
  );
}

export function SettingsPanel() {
  const { t, session } = useSchool();
  const me = useMe();
  const d = me.data;
  return (
    <DirPage title={t("navSettings")} wide={false}>
      <Async state={me} rows={4}>
        {d && (
          <div className="space-y-4">
            {d.year && <RulesForm key={JSON.stringify(d.rules)} me={d} reload={me.reload} />}
            <SectionCard title={t("d_notifications_settings")}>
              <p className="text-sm text-slate-600 dark:text-slate-300">{t("d_absence_notify_info")}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">SCHOOL_NOTIFY_ABSENCE=on · TELEGRAM_BOT_TOKEN</p>
            </SectionCard>
            <SectionCard title={t("a_security")}>
              <AccountPanel />
            </SectionCard>
            <SectionCard title={t("d_system")}>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">{t("d_mode")}</dt><dd>{d.demo ? <Badge tone="amber">DEMO</Badge> : <Badge tone="green">Supabase</Badge>}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">{t("d_year")}</dt><dd>{d.year?.name}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">{t("d_signed_in")}</dt><dd>{session?.email}</dd></div>
              </dl>
            </SectionCard>
          </div>
        )}
      </Async>
    </DirPage>
  );
}
