"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { spost, supload } from "@/lib/school/client";
import { IMPORT_COLUMNS, IMPORT_TEMPLATE_ROWS, previewToCommitRows } from "@/lib/school/director-logic";
import type { ImportPreview } from "@/lib/school/types";
import { Badge, Button, Card, cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { DirPage, Kpi, TableWrap, exportXlsx, tableCls, tdCls, thCls, useErrText, useToast } from "./common";

type Filter = "all" | "valid" | "dup" | "invalid";
interface Result { created: number; updated: number; skipped: number; invalid: number; errors: { row: number; errors: string[] }[] }

export function ImportWizard() {
  const { t } = useSchool();
  const errText = useErrText();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [onDup, setOnDup] = useState<"skip" | "update">("skip");
  const [result, setResult] = useState<Result | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast("err", t("d_err_unsupported"));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await supload<{ preview: ImportPreview }>("/import/students", fd);
      setPreview(r.preview);
      setFileName(file.name);
      setExcluded(new Set());
      setFilter("all");
      setStep(2);
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  const rows = (preview?.rows ?? []).filter((r) => filter === "all" || (filter === "valid" && r.ok && r.duplicate === "none") || (filter === "dup" && r.duplicate !== "none") || (filter === "invalid" && !r.ok));
  const commitRows = preview ? previewToCommitRows(preview, { includeDuplicates: onDup === "update", excluded }) : [];

  async function commit() {
    setBusy(true);
    try {
      const r = await spost<{ result: Result }>("/import/students", { rows: commitRows, on_duplicate: onDup });
      setResult(r.result);
      setStep(3);
    } catch (e) {
      toast("err", errText(e));
    } finally {
      setBusy(false);
    }
  }
  const reset = () => { setStep(1); setPreview(null); setResult(null); setFileName(""); if (input.current) input.current.value = ""; };
  const steps = [t("d_imp_upload"), t("d_imp_preview"), t("d_imp_done")];

  return (
    <DirPage
      title={t("navImport")} wide={false}
      actions={<Button onClick={() => exportXlsx("students_template", [{ name: "students", rows: [[...IMPORT_COLUMNS], ...IMPORT_TEMPLATE_ROWS.map((r) => IMPORT_COLUMNS.map((c) => r[c]))] }])}><Download className="size-4" /> {t("d_template")}</Button>}
    >
      <ol className="flex gap-2 text-sm" aria-label={t("d_imp_steps")}>
        {steps.map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? "step" : undefined} className={cn("flex-1 rounded-lg px-3 py-1.5 text-center font-medium", step === i + 1 ? "bg-indigo-600 text-white" : step > i + 1 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-slate-100 text-slate-500 dark:text-slate-400 dark:bg-slate-800")}>{i + 1}. {s}</li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}
            className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center", drag ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-300 dark:border-slate-700")}
          >
            <FileSpreadsheet className="size-10 text-slate-500 dark:text-slate-400" />
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("d_imp_drop")}</p>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="sr-only" id="imp-file" aria-label={t("d_choose_file")} tabIndex={-1} onChange={(e) => upload(e.target.files?.[0])} />
            <Button variant="primary" loading={busy} onClick={() => input.current?.click()}><Upload className="size-4" /> {t("d_choose_file")}</Button>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("d_imp_limits")}</p>
          </div>
        </Card>
      )}

      {step === 2 && preview && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">{fileName}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={t("d_total")} value={preview.total} />
            <Kpi label={t("d_imp_valid")} value={preview.valid} tone="good" />
            <Kpi label={t("d_imp_dups")} value={preview.duplicates} tone={preview.duplicates ? "warn" : "default"} />
            <Kpi label={t("d_imp_invalid")} value={preview.invalid} tone={preview.invalid ? "bad" : "default"} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
              {(["all", "valid", "dup", "invalid"] as Filter[]).map((k) => (
                <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-md px-3 py-1 text-sm max-sm:min-h-11", filter === k ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300")}>{t(`d_imp_f_${k}` as "d_imp_f_all")}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">{t("d_on_duplicate")}
              <select value={onDup} onChange={(e) => setOnDup(e.target.value as "skip" | "update")} className="rounded-lg border border-slate-300 bg-white px-2 py-1 max-sm:min-h-11 dark:border-slate-700 dark:bg-slate-900">
                <option value="skip">{t("d_dup_skip")}</option><option value="update">{t("d_dup_update")}</option>
              </select>
            </label>
          </div>
          <TableWrap className="max-h-[28rem] overflow-y-auto">
            <table className={tableCls}>
              <thead><tr><th className={thCls}><span className="sr-only">{t("d_include")}</span></th><th className={thCls}>#</th><th className={thCls}>{t("d_full_name")}</th><th className={thCls}>{t("class")}</th><th className={thCls}>{t("d_birth_date")}</th><th className={thCls}>{t("d_status")}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={cn(!r.ok && "bg-red-50/60 dark:bg-red-950/20")}>
                    <td className={tdCls}><input type="checkbox" aria-label={`${t("d_include")} ${r.row}`} disabled={!r.ok} checked={r.ok && !excluded.has(r.row) && (r.duplicate === "none" || onDup === "update")} onChange={() => setExcluded((s) => { const n = new Set(s); if (n.has(r.row)) n.delete(r.row); else n.add(r.row); return n; })} /></td>
                    <td className={tdCls}>{r.row}</td>
                    <td className={tdCls}>{r.data?.last_name} {r.data?.first_name} {r.data?.middle_name}</td>
                    <td className={tdCls}>{r.data?.class_name ?? ""}</td>
                    <td className={tdCls}>{r.data?.birth_date ?? ""}</td>
                    <td className={tdCls}>
                      {!r.ok ? <span className="text-xs text-red-700 dark:text-red-300">{r.errors.join("; ")}</span> : r.duplicate !== "none" ? <Badge tone="amber">{t(`d_dup_${r.duplicate}` as "d_dup_student_code")}</Badge> : <Badge tone="green">{t("d_imp_new")}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="flex flex-wrap justify-between gap-2">
            <Button onClick={reset}>{t("d_back")}</Button>
            <Button variant="primary" loading={busy} disabled={!commitRows.length} onClick={commit}>{t("d_imp_commit")} ({commitRows.length})</Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <Card className="space-y-4">
          <p className="flex items-center gap-2 text-lg font-bold text-emerald-600"><CheckCircle2 className="size-6" /> {t("d_imp_done")}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={t("d_imp_created")} value={result.created} tone="good" /><Kpi label={t("d_imp_updated")} value={result.updated} />
            <Kpi label={t("d_imp_skipped")} value={result.skipped} /><Kpi label={t("d_imp_invalid")} value={result.invalid} tone={result.invalid ? "bad" : "default"} />
          </div>
          {result.errors.length > 0 && <ul className="text-xs text-red-700 dark:text-red-300">{result.errors.slice(0, 20).map((e) => <li key={e.row}>#{e.row}: {e.errors.join("; ")}</li>)}</ul>}
          <div className="flex gap-2"><Button onClick={reset}>{t("d_imp_another")}</Button><Link href="/school/director/students" className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500">{t("navStudents")}</Link></div>
        </Card>
      )}
    </DirPage>
  );
}
