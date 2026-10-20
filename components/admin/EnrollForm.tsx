"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Printer, UserPlus } from "lucide-react";
import { cn } from "@/lib/admin/cn";
import type { UIKey } from "@/lib/admin/ui-i18n";
import { useAdmin } from "./AdminProvider";
import { Badge, Button, Card, inputCls, PageHeader } from "./ui";

interface Account {
  email: string;
  temp_password: string | null;
  demo: boolean;
}
interface EnrollOk {
  student: { id: string; last_name: string; first_name: string; student_code: string };
  guardian: { id: string; full_name: string };
  guardian_reused: boolean;
  student_account: Account;
  guardian_account: Account | null;
}
interface Meta {
  classes: { id: string; name: string }[];
  domain: string;
  demo: boolean;
}

const EMPTY = {
  last_name: "", first_name: "", middle_name: "", birth_date: "", gender: "", class_id: "",
  g_full_name: "", g_relation: "mother", g_phone: "", g_email: "",
};
type Form = typeof EMPTY;

const RELATIONS = ["mother", "father", "guardian", "parent", "other"] as const;

async function post(body: unknown): Promise<{ ok: true; data: EnrollOk } | { ok: false; code: string; fields: string[] }> {
  const r = await fetch("/api/admin/enroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as Partial<EnrollOk> & { error?: string; code?: string; fields?: string[] };
  if (r.ok) return { ok: true, data: j as EnrollOk };
  return { ok: false, code: j.code ?? j.error ?? "server_error", fields: Array.isArray(j.fields) ? j.fields : [] };
}

/** Super admin: enrol a student together with a parent; both logins are created by the server and shown once. */
export function EnrollForm() {
  const { t, toast } = useAdmin();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string[]>([]);
  const [done, setDone] = useState<EnrollOk | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/enroll", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Meta) => live && setMeta(j))
      .catch(() => live && toast(t("networkError"), "error"));
    return () => {
      live = false;
    };
  }, [t, toast]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const invalid = (k: string) => bad.some((b) => b === k || b.endsWith(`.${k}`));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBad([]);
    const r = await post({
      student: { last_name: f.last_name, first_name: f.first_name, middle_name: f.middle_name, birth_date: f.birth_date, gender: f.gender, class_id: f.class_id },
      guardian: { full_name: f.g_full_name, relation: f.g_relation, phone: f.g_phone, email: f.g_email },
    }).catch(() => ({ ok: false as const, code: "network", fields: [] }));
    setBusy(false);
    if (r.ok) {
      setDone(r.data);
      setF(EMPTY);
      toast(t("en_done"));
      return;
    }
    if (r.code === "validation") {
      setBad(r.fields.map((x) => x.replace(/^guardian\./, "guardian.g_")));
      toast(t("en_err_validation"), "error");
    } else if (r.code === "email_taken") {
      setBad(["guardian.g_email"]);
      toast(t("en_err_email_taken"), "error");
    } else toast(r.code === "network" ? t("networkError") : `${t("networkError")} (${r.code})`, "error");
  }

  if (done) return <Credentials r={done} onAgain={() => setDone(null)} />;

  const label = "mb-1 block text-sm font-medium";
  const err = (k: string) => (invalid(k) ? "border-red-500 focus:border-red-500 focus:ring-red-500/25" : "");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("en_title")} subtitle={t("en_intro")} />
      {meta?.demo && (
        <p role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
          {t("en_demo")}
        </p>
      )}
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Card className="p-5">
          <h2 className="mb-4 text-base font-bold">{t("en_student")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="en-last" className={label}>{t("en_last_name")} *</label>
              <input id="en-last" required maxLength={80} autoComplete="off" className={cn(inputCls, err("last_name"))} value={f.last_name} onChange={set("last_name")} aria-invalid={invalid("last_name")} />
            </div>
            <div>
              <label htmlFor="en-first" className={label}>{t("en_first_name")} *</label>
              <input id="en-first" required maxLength={80} autoComplete="off" className={cn(inputCls, err("first_name"))} value={f.first_name} onChange={set("first_name")} aria-invalid={invalid("first_name")} />
            </div>
            <div>
              <label htmlFor="en-middle" className={label}>{t("en_middle_name")}</label>
              <input id="en-middle" maxLength={80} autoComplete="off" className={inputCls} value={f.middle_name} onChange={set("middle_name")} />
            </div>
            <div>
              <label htmlFor="en-birth" className={label}>{t("en_birth_date")}</label>
              <input id="en-birth" type="date" className={cn(inputCls, err("birth_date"))} value={f.birth_date} onChange={set("birth_date")} aria-invalid={invalid("birth_date")} />
            </div>
            <div>
              <label htmlFor="en-gender" className={label}>{t("en_gender")}</label>
              <select id="en-gender" className={inputCls} value={f.gender} onChange={set("gender")}>
                <option value="">-</option>
                <option value="m">{t("en_gender_m")}</option>
                <option value="f">{t("en_gender_f")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="en-class" className={label}>{t("en_class")}</label>
              <select id="en-class" className={inputCls} value={f.class_id} onChange={set("class_id")} disabled={!meta}>
                <option value="">{t("en_class_none")}</option>
                {meta?.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-base font-bold">{t("en_guardian")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="en-gname" className={label}>{t("en_full_name")} *</label>
              <input id="en-gname" required maxLength={120} autoComplete="off" className={cn(inputCls, err("g_full_name"))} value={f.g_full_name} onChange={set("g_full_name")} aria-invalid={invalid("g_full_name")} />
            </div>
            <div>
              <label htmlFor="en-rel" className={label}>{t("en_relation")}</label>
              <select id="en-rel" className={inputCls} value={f.g_relation} onChange={set("g_relation")}>
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>{t(`en_rel_${r}` as UIKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="en-phone" className={label}>{t("en_phone")}</label>
              <input id="en-phone" type="tel" inputMode="tel" placeholder="+998 90 123 45 67" maxLength={20} className={cn(inputCls, err("g_phone"))} value={f.g_phone} onChange={set("g_phone")} aria-invalid={invalid("g_phone")} aria-describedby="en-phone-hint" />
              <p id="en-phone-hint" className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("en_phone_hint")}</p>
            </div>
            <div>
              <label htmlFor="en-email" className={label}>{t("en_email")}</label>
              <input id="en-email" type="email" maxLength={320} autoComplete="off" className={cn(inputCls, err("g_email"))} value={f.g_email} onChange={set("g_email")} aria-invalid={invalid("g_email")} aria-describedby="en-email-hint" />
              <p id="en-email-hint" className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("en_email_hint").replace("{domain}", meta ? `@${meta.domain}` : "")}</p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={busy} disabled={!meta} className="px-5 py-2.5">
            <UserPlus className="size-4" /> {t("en_submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Credentials({ r, onAgain }: { r: EnrollOk; onAgain: () => void }) {
  const { t } = useAdmin();
  const portal = typeof window === "undefined" ? "/school/login" : `${window.location.origin}/school/login`;
  const rows: { who: string; name: string; acc: Account | null }[] = [
    { who: t("en_student"), name: `${r.student.last_name} ${r.student.first_name}`, acc: r.student_account },
    { who: t("en_guardian"), name: r.guardian.full_name, acc: r.guardian_account },
  ];

  function print() {
    const w = window.open("", "_blank", "width=720,height=640");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const body = rows
      .map((x) => `<h2>${esc(x.who)}: ${esc(x.name)}</h2>${x.acc ? `<p>${esc(t("en_login"))}: <b>${esc(x.acc.email)}</b></p><p>${esc(t("en_password"))}: <b>${esc(x.acc.temp_password ?? "-")}</b></p>` : `<p>${esc(t("en_has_login"))}</p>`}`)
      .join("");
    w.document.write(
      `<!doctype html><meta charset="utf-8"><title>${esc(t("en_creds"))}</title><style>body{font:15px system-ui,sans-serif;margin:32px}h2{font-size:17px;margin:24px 0 6px}b{font-family:ui-monospace,monospace;font-size:16px}</style>` +
        `<h1>${esc(t("appName"))}</h1>${body}<p style="margin-top:28px">${esc(t("en_portal"))}: ${esc(portal)}</p>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("en_done")} subtitle={`${r.student.last_name} ${r.student.first_name} · ${r.student.student_code}`} />
      {r.guardian_reused && <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/60 dark:text-sky-200">{t("en_reused")}</p>}
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold"><KeyRound className="size-4" /> {t("en_creds")}</h2>
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-300">{t("en_creds_warn")}</p>
        <div className="space-y-4">
          {rows.map((x) => (
            <div key={x.who} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="mb-2 text-sm font-semibold">
                {x.who}: {x.name} {x.acc?.demo && <Badge tone="amber">DEMO</Badge>}
              </p>
              {x.acc ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt className="text-slate-500 dark:text-slate-400">{t("en_login")}</dt>
                  <dd><CopyText text={x.acc.email} /></dd>
                  <dt className="text-slate-500 dark:text-slate-400">{t("en_password")}</dt>
                  <dd>{x.acc.temp_password ? <CopyText text={x.acc.temp_password} /> : <span className="text-slate-500">{t("en_demo")}</span>}</dd>
                </dl>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">{t("en_has_login")}</p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{t("en_portal")}: <span className="font-mono">{portal}</span></p>
      </Card>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button onClick={print}><Printer className="size-4" /> {t("en_print")}</Button>
        <Button variant="primary" onClick={onAgain}><UserPlus className="size-4" /> {t("en_another")}</Button>
      </div>
    </div>
  );
}

function CopyText({ text }: { text: string }) {
  const { t } = useAdmin();
  const [ok, setOk] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[15px] dark:bg-slate-800">{text}</code>
      <button
        type="button"
        aria-label={ok ? t("en_copied") : t("en_copy")}
        title={ok ? t("en_copied") : t("en_copy")}
        className="grid size-7 place-items-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        onClick={() => void navigator.clipboard?.writeText(text).then(() => setOk(true), () => undefined)}
      >
        {ok ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
      </button>
    </span>
  );
}
