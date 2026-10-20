"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, Download, GripVertical, Plus, Trash2, Upload } from "lucide-react";
import { moveItem } from "@/lib/admin/reorder";
import { api } from "@/lib/admin/api";
import { cn } from "@/lib/admin/cn";
import { exportCsv } from "@/lib/admin/export";
import { canWrite, RESOURCE_MAP } from "@/lib/admin/resources";
import { checkScales, scoreRange } from "@/lib/admin/scales";
import type { Row } from "@/lib/admin/types";
import { parseCsv } from "@/lib/admin/validation";
import { tr } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { ResourceForm } from "./ResourceForm";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Spinner } from "./ui";

interface ChildEditorProps {
  resKey: string;
  parentId: string | number;
  summary?: (row: Row) => ReactNode;
  onItems?: (items: Row[]) => void;
  actions?: (reload: () => void, items: Row[]) => ReactNode;
  addLabel?: string;
  reloadKey?: number;
}

export function ChildEditor({ resKey, parentId, summary, onItems, actions, addLabel, reloadKey }: ChildEditorProps) {
  const res = RESOURCE_MAP[resKey];
  const { t, lang, session, toast } = useAdmin();
  const writable = !!session && canWrite(res, session.role);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | number | "new" | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const hasOrder = res.fields.some((f) => f.name === "sort_order");
  const cb = useRef(onItems);
  useEffect(() => {
    cb.current = onItems;
  });

  // reload() only bumps the nonce; the effect below does the fetch (the spinner is shown for the first load only)
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    api
      .list(resKey, { all: true, filters: { [res.parent!.field]: String(parentId) } })
      .then(
        (out) => {
          if (!live) return;
          setItems(out.rows);
          cb.current?.(out.rows);
        },
        (e) => live && toast(e instanceof Error ? e.message : t("networkError"), "error"),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resKey, parentId, reloadKey, nonce]);

  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  async function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    await applyOrder(moveItem(items, i, j));
  }

  async function applyOrder(next: Row[]) {
    setItems(next.map((r, k) => ({ ...r, sort_order: k + 1 }))); // optimistic
    try {
      await Promise.all(next.map((r, k) => (r.sort_order !== k + 1 ? api.update(resKey, r.id, { sort_order: k + 1 }) : null)));
    } catch {
      toast(t("networkError"), "error");
    }
    reload();
  }

  async function del() {
    if (!deleting) return;
    try {
      await api.remove(resKey, deleting.id);
      toast(t("deleted"));
      setDeleting(null);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {actions?.(reload, items)}
        {writable && (
          <Button variant="primary" onClick={() => setOpen("new")}>
            <Plus className="size-4" /> {addLabel ?? t("addQuestion")}
          </Button>
        )}
      </div>
      {items.length === 0 && open !== "new" && (
        <Card>
          <EmptyState>{t("noQuestions")}</EmptyState>
        </Card>
      )}
      {items.map((row, i) => {
        const isOpen = open === row.id;
        return (
          <Card key={row.id} className={cn("overflow-hidden", overIdx === i && "ring-2 ring-indigo-400")}>
            <div
              className="flex items-center gap-2 px-3 py-2.5"
              draggable={writable && hasOrder}
              onDragStart={(e) => {
                dragIdx.current = i;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(row.id));
              }}
              onDragOver={(e) => {
                if (dragIdx.current === null) return;
                e.preventDefault();
                setOverIdx(i);
              }}
              onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
              onDragEnd={() => {
                dragIdx.current = null;
                setOverIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIdx.current;
                dragIdx.current = null;
                setOverIdx(null);
                if (from !== null && from !== i) void applyOrder(moveItem(items, from, i));
              }}
            >
              {writable && hasOrder && <GripVertical className="size-4 shrink-0 cursor-grab text-slate-400" aria-label={t("dragHint")} />}
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : row.id)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                {hasOrder && <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">{i + 1}</span>}
                <span className="line-clamp-1 flex-1 text-sm font-medium">{tr(row[res.titleField] as never, lang) || "—"}</span>
                {summary?.(row)}
              </button>
              {writable && hasOrder && (
                <>
                  <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("moveUp")}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={t("moveDown")}>
                    <ArrowDown className="size-4" />
                  </Button>
                </>
              )}
              {writable && (
                <Button size="icon" variant="ghost" onClick={() => setDeleting(row)} aria-label={t("delete")}>
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              )}
            </div>
            {isOpen && (
              <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                <ResourceForm
                  res={res}
                  initial={row}
                  readOnly={!writable}
                  bleed="-mx-4 -mb-4"
                  onSaved={() => {
                    setOpen(null);
                    reload();
                  }}
                  onCancel={() => setOpen(null)}
                />
              </div>
            )}
          </Card>
        );
      })}
      {open === "new" && (
        <Card className="border-indigo-300 p-4 dark:border-indigo-700">
          <ResourceForm
            res={res}
            initial={null}
            parent={{ field: res.parent!.field, id: parentId }}
            defaults={hasOrder ? { sort_order: items.length + 1 } : undefined}
            bleed="-mx-4 -mb-4"
            onSaved={() => {
              setOpen(null);
              reload();
            }}
            onCancel={() => setOpen(null)}
          />
        </Card>
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} />
    </div>
  );
}

// ------------------------------------------------------------------ Quiz questions
const CSV_HEADER = [
  "question_uz", "question_ru", "question_en",
  "A_uz", "A_ru", "A_en", "B_uz", "B_ru", "B_en", "C_uz", "C_ru", "C_en", "D_uz", "D_ru", "D_en",
  "correct", "points", "explanation_uz", "explanation_ru", "explanation_en",
];

export function QuizQuestions({ quizId }: { quizId: string | number }) {
  const { t, toast } = useAdmin();
  const fileRef = useRef<HTMLInputElement>(null);

  async function importCsv(file: File | undefined, reload: () => void, count: number) {
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("CSV is empty");
      const head = rows[0].map((h) => h.trim().toLowerCase());
      const col = (r: string[], n: string) => (r[head.indexOf(n.toLowerCase())] ?? "").trim();
      const items = rows.slice(1).map((r, i) => {
        const where = `${t("importRow")} ${i + 2}`;
        const all = ["A", "B", "C", "D"].map((id) => ({ id, text: { uz: col(r, `${id}_uz`), ru: col(r, `${id}_ru`), en: col(r, `${id}_en`) } }));
        const filled = all.map((o) => !!(o.text.uz || o.text.ru || o.text.en));
        const n = filled.lastIndexOf(true) + 1; // trailing empty options are dropped
        if (n < 2) throw new Error(`${where}: ${t("importNeedOptions")}`);
        if (filled.slice(0, n).some((x) => !x)) throw new Error(`${where}: ${t("importGap")}`);
        const options = all.slice(0, n).map((o) => ({ ...o, text: { ...o.text, uz: o.text.uz || o.text.ru || o.text.en } }));
        const correct = (col(r, "correct") || "A").toUpperCase().slice(0, 1);
        if (!options.some((o) => o.id === correct)) throw new Error(`${where}: ${t("importBadCorrect")}`);
        return { ...buildItem(r, i), options, correct_option_id: correct };
      });
      function buildItem(r: string[], i: number) {
        return {
        quiz_id: quizId,
        question_text: { uz: col(r, "question_uz"), ru: col(r, "question_ru"), en: col(r, "question_en") },
        points: Math.max(1, Math.round(Number(col(r, "points")) || 1)),
        explanation: col(r, "explanation_uz") || col(r, "explanation_ru") || col(r, "explanation_en") ? { uz: col(r, "explanation_uz"), ru: col(r, "explanation_ru"), en: col(r, "explanation_en") } : null,
        sort_order: count + i + 1,
        };
      }
      await api.bulkCreate("academic_questions", items);
      toast(`${t("imported")}: ${items.length}`);
      reload();
    } catch (e) {
      const issues = (e as { issues?: { path: string; message: string }[] }).issues;
      toast(issues?.length ? `CSV: ${issues[0].path} — ${issues[0].message}` : e instanceof Error ? e.message : t("networkError"), "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <ChildEditor
      resKey="academic_questions"
      parentId={quizId}
      summary={(r) => (
        <span className="hidden items-center gap-1.5 sm:flex">
          <Badge tone="green">✓ {String(r.correct_option_id)}</Badge>
          <Badge>{String(r.points)} pt</Badge>
        </span>
      )}
      actions={(reload, items) => (
        <>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0], reload, items.length)} />
          <Button size="sm" onClick={() => exportCsv("questions-template", CSV_HEADER, [["2+2=?", "2+2=?", "2+2=?", "3", "3", "3", "4", "4", "4", "5", "5", "5", "6", "6", "6", "B", 1, "Oddiy qo'shish", "Простое сложение", "Simple addition"]])}>
            <Download className="size-4" /> {t("importTemplate")}
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()} title={t("importHelp")}>
            <Upload className="size-4" /> {t("importCsv")}
          </Button>
        </>
      )}
    />
  );
}

// ------------------------------------------------------------------ Psych test builder
export function PsychBuilder({ testId }: { testId: string | number }) {
  const { t, L, lang } = useAdmin();
  const [questions, setQuestions] = useState<Row[]>([]);
  const [scales, setScales] = useState<Row[]>([]);
  const [tab, setTab] = useState<"q" | "s">("q");

  const range = useMemo(() => scoreRange(questions as never), [questions]);
  const issues = useMemo(
    () => checkScales(scales.map((s) => ({ id: s.id, min_score: Number(s.min_score), max_score: Number(s.max_score) })), questions.length ? range : undefined),
    [scales, questions.length, range],
  );
  const title = (id: string | number) => tr(scales.find((s) => s.id === id)?.result_title as never, lang) || String(id);

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {([["q", t("questions"), questions.length], ["s", t("scales"), scales.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium", tab === k ? "bg-white shadow-sm dark:bg-slate-950" : "text-slate-500")}>
            {label} <Badge tone={k === "s" && issues.length ? "red" : "gray"}>{n}</Badge>
          </button>
        ))}
      </div>
      <div className={tab === "q" ? "" : "hidden"}>
        <ChildEditor
          resKey="psych_questions"
          parentId={testId}
          onItems={setQuestions}
          summary={(r) => <Badge>{(r.options as unknown[] | undefined)?.length ?? 0} opt</Badge>}
        />
      </div>
      <div className={tab === "s" ? "space-y-4" : "hidden"}>
        <Card className={cn("p-4", issues.length ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30")}>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            {issues.length ? <AlertTriangle className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
            {t("scaleCoverage")}
            {questions.length > 0 && (
              <span className="font-normal text-slate-500">
                · {t("scaleRange")}: {range.lo}–{range.hi}
              </span>
            )}
          </div>
          {issues.length === 0 ? (
            <p className="text-sm text-emerald-800 dark:text-emerald-300">{t("scaleOk")}</p>
          ) : (
            <ul className="list-inside list-disc space-y-0.5 text-sm text-amber-900 dark:text-amber-200">
              {issues.map((s, i) => (
                <li key={i}>
                  {s.kind === "gap" && `${t("scaleGap")}: ${s.from}${s.to !== s.from ? `–${s.to}` : ""}`}
                  {s.kind === "overlap" && `${t("scaleOverlap")}: «${title(s.a.id)}» ∩ «${title(s.b.id)}»`}
                  {s.kind === "bad" && `${t("scaleBad")}: «${title(s.a.id)}»`}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <ChildEditor
          resKey="psych_result_scales"
          parentId={testId}
          onItems={setScales}
          addLabel={L({ uz: "Shkala qo'shish", ru: "Добавить шкалу", en: "Add scale" })}
          summary={(r) => (
            <span className="flex items-center gap-1.5">
              <Badge tone="blue">
                {String(r.min_score)}–{String(r.max_score)}
              </Badge>
            </span>
          )}
        />
      </div>
    </div>
  );
}
