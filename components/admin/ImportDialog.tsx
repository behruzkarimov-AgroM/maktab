"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDialogA11y } from "@/components/layout/useDialogA11y";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, FileText, FileUp, HelpCircle, Loader2, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/lib/admin/api";
import { cn } from "@/lib/admin/cn";
import { scaleWarnings } from "@/lib/admin/import/checks";
import { psychPayload, psychQuestionsPayload, quizPayload, quizQuestionsPayload, scalesPayload } from "@/lib/admin/import/payload";
import { gameDraftPayload, surveyDraftPayload } from "@/lib/admin/import/payload-extra";
import { parseText } from "@/lib/admin/import/pipeline";
import { templateLines } from "@/lib/admin/import/template-data";
import { GAME_TYPES, itemsOf, KIND_RESOURCE, LOCALES, MAX_FILE_BYTES, type GameType, type GameTypeChoice, type ImportDraft, type ImportKind, type ImportMeta, type LText, type Warning } from "@/lib/admin/import/types";
import { audienceOptions, difficultyOptions, getResource, gradeOptions, topicOptions } from "@/lib/admin/resources";
import { surveyAudienceOptions, surveyQuestionTypeOptions } from "@/lib/admin/survey-resources";
import type { UIKey } from "@/lib/admin/ui-i18n";
import type { Locale } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { Badge, Button, inputCls, Switch } from "./ui";

type Phase = "queued" | "analyzing" | "ready" | "error" | "creating" | "created" | "failed";

interface Item {
  id: string;
  file: File;
  phase: Phase;
  error?: string;
  draft?: ImportDraft;
  meta?: ImportMeta;
  qSel: boolean[];
  sSel: boolean[];
  include: boolean;
  open: boolean;
  resultId?: string | number;
  note?: string;
  /** extracted text (editable in the manual builder) */
  rawText?: string;
  /** parts of a zip batch show their archive name */
  from?: string;
}

interface Props {
  kind: ImportKind;
  open: boolean;
  onClose: () => void;
  /** called after at least one record was created (list reload) */
  onDone?: () => void;
}

const ACCEPT = ".docx,.doc,.pdf,.rtf,.odt,.ods,.odp,.xlsx,.xls,.pptx,.epub,.html,.htm,.xml,.md,.json,.txt,.csv,.tsv,.log,.zip,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp,.gif";
let uid = 0;

type Analyzed =
  | { ok: true; draft: ImportDraft; meta: ImportMeta }
  | { ok: true; batch: ({ name: string; ok: true; draft: ImportDraft; meta: ImportMeta } | { name: string; ok: false; error: string })[] }
  | { ok: false; code: string; text?: string };

async function analyzeFile(file: File, kind: ImportKind, lang: string, gameType: GameTypeChoice, flags: { translit: boolean; ai: boolean }): Promise<Analyzed> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("lang", lang);
  fd.append("game_type", gameType);
  if (flags.translit) fd.append("translit", "1");
  if (flags.ai) fd.append("ai", "1");
  try {
    const r = await fetch(`/api/admin/import?kind=${kind}`, { method: "POST", body: fd, cache: "no-store" });
    const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; text?: string; draft?: ImportDraft; meta?: ImportMeta; batch?: Extract<Analyzed, { batch: unknown }>["batch"] };
    if (r.ok && body.ok && body.batch) return { ok: true, batch: body.batch };
    if (r.ok && body.ok && body.draft && body.meta) return { ok: true, draft: body.draft, meta: body.meta };
    if (r.status === 401) return { ok: false, code: "unauthorized" };
    if (r.status === 403) return { ok: false, code: "forbidden" };
    if (r.status === 413) return { ok: false, code: body.error && body.error !== "Payload too large" ? body.error : "file_too_large" };
    return { ok: false, code: body.error && /^[a-z_]+$/.test(body.error) ? body.error : "server_error", text: body.text };
  } catch {
    return { ok: false, code: "network" };
  }
}
export function ImportDialog({ kind, open, onClose, onDone }: Props) {
  const { t, L, lang: uiLang, toast } = useAdmin();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [docLang, setDocLang] = useState<"auto" | Locale>("auto");
  const [gameType, setGameType] = useState<GameTypeChoice>("auto");
  const [translit, setTranslit] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [caps, setCaps] = useState<{ ai: boolean; ocr: boolean }>({ ai: false, ocr: true });
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState<"" | "analyze" | "create">("");
  const [done, setDone] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resKey = KIND_RESOURCE[kind];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/import/capabilities", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ai?: boolean; ocr?: boolean } | null) => j && setCaps({ ai: !!j.ai, ocr: j.ocr !== false }))
      .catch(() => undefined);
  }, [open]);

  const tx = useCallback((k: string) => t(k as UIKey), [t]);
  const pick = useCallback((v: LText | null | undefined) => (v ? v[uiLang] || v.uz || v.ru || v.en || "" : ""), [uiLang]);
  const warnText = useCallback(
    (w: Warning) => {
      let s = tx(`imp_w_${w.code}`);
      for (const [k, v] of Object.entries(w.params ?? {})) s = s.replace(`{${k}}`, k === "lang" ? String(v).toUpperCase() : String(v));
      return s;
    },
    [tx],
  );

  const patch = (id: string, fn: (it: Item) => Item) => setItems((list) => list.map((it) => (it.id === id ? fn(it) : it)));
  const patchDraft = (id: string, fn: (d: ImportDraft) => void) =>
    patch(id, (it) => {
      if (!it.draft) return it;
      const d = structuredClone(it.draft);
      fn(d);
      return { ...it, draft: d };
    });

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const add: Item[] = Array.from(files).map((file) => ({
      id: `f${++uid}`,
      file,
      phase: file.size > MAX_FILE_BYTES ? "error" : "queued",
      error: file.size > MAX_FILE_BYTES ? "file_too_large" : undefined,
      qSel: [],
      sSel: [],
      include: true,
      open: false,
    }));
    setItems((l) => [...l, ...add].slice(0, 20));
    setDone(false);
  }

  const readyItem = (out: { draft: ImportDraft; meta: ImportMeta }, open: boolean): Partial<Item> => ({
    phase: "ready",
    draft: out.draft,
    meta: out.meta,
    rawText: out.meta.text,
    qSel: itemsOf(out.draft).map(() => true),
    sSel: out.draft.kind === "psych" ? out.draft.scales.map(() => true) : [],
    include: true,
    open,
    error: undefined,
  });

  async function analyzeQueued(all = false) {
    setBusy("analyze");
    const targets = (all ? items.filter((i) => i.phase !== "created" && !i.from) : items.filter((i) => i.phase === "queued")).map((i) => i.id);
    if (all) setItems((l) => l.filter((x) => !x.from)); // batch parts are regenerated from their archive
    if (all) targets.forEach((id) => patch(id, (it) => ({ ...it, phase: it.file.size > MAX_FILE_BYTES ? "error" : "queued" })));
    for (const id of targets) {
      const it = items.find((x) => x.id === id);
      if (!it || it.file.size > MAX_FILE_BYTES) continue;
      patch(id, (x) => ({ ...x, phase: "analyzing", error: undefined }));
      const out = await analyzeFile(it.file, kind, docLang, gameType, { translit, ai: useAi && caps.ai });
      if ("batch" in out) {
        // an archive: every entry becomes its own reviewable item
        const parts: Item[] = out.batch.map((b) => ({
          id: `f${++uid}`,
          file: new File([], b.name),
          phase: b.ok ? "ready" : "error",
          error: b.ok ? undefined : b.error,
          qSel: [],
          sSel: [],
          include: true,
          open: false,
          from: it.file.name,
          ...(b.ok ? readyItem(b, false) : {}),
        }));
        setItems((l) => [...l.filter((x) => x.id !== id), ...parts]);
      } else if (out.ok) {
        patch(id, (x) => ({ ...x, ...readyItem(out, targets.length === 1) }));
      } else {
        patch(id, (x) => ({ ...x, phase: "error", error: out.code, draft: undefined, rawText: out.text, open: !!out.text }));
        if (out.code === "unauthorized") router.push("/admin/login");
      }
    }
    setBusy("");
  }

  /** Manual builder: parse the (hand-edited) extracted text again, in the browser. */
  function reparse(id: string, text: string) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const r = parseText(text, { kind, lang: docLang, gameType, filename: it.file.name });
    if (!r) {
      toast(tx("imp_err_no_questions"), "error");
      return;
    }
    const meta: ImportMeta = { ...(it.meta ?? { filename: it.file.name, format: "text", chars: text.length }), detectedLang: r.detectedLang, langs: r.langs, parser: r.parser, text, chars: text.length };
    patch(id, (x) => ({ ...x, ...readyItem({ draft: r.draft, meta }, true), file: x.file }));
  }
  /** Reasons why an item cannot be created yet (empty = ok). */
  function problems(it: Item): UIKey[] {
    const d = it.draft;
    if (!d || it.phase === "created") return [];
    const out: UIKey[] = [];
    const sel = itemsOf(d).filter((_, i) => it.qSel[i]);
    if (!sel.length) out.push("imp_blocked_none");
    if (!LOCALES.some((l) => d.title[l].trim())) out.push("imp_blocked_title");
    if (d.kind === "quiz" || d.kind === "psych") {
      const qs = d.questions.filter((_, i) => it.qSel[i]);
      if (d.kind === "quiz" && qs.some((q) => q.correct === null || !q.options.some((o) => o.id === q.correct))) out.push("imp_blocked_correct");
      if (qs.some((q) => q.options.length < 2)) out.push("imp_blocked_options");
      if (d.kind === "psych") {
        const sc = d.scales.filter((_, i) => it.sSel[i]);
        if (sc.length && scaleWarnings(sc, qs).some((w) => w.code === "scale_overlap")) out.push("imp_blocked_scales");
      }
    } else if (d.kind === "survey") {
      const qs = d.questions.filter((_, i) => it.qSel[i]);
      if (qs.some((q) => ((q.type === "single" || q.type === "multiple") && q.options.length < 2) || q.warnings.some((w) => w.code === "bad_scale"))) out.push("imp_blocked_survey");
    } else {
      const min = d.gameType === "matching" ? 4 : 5;
      if (sel.length < min) out.push("imp_blocked_items");
      if (d.gameType === "true_false" && d.statements.some((s, i) => it.qSel[i] && s.isTrue === null)) out.push("imp_blocked_tf");
      if (d.gameType === "quiz_race" && d.questions.some((q, i) => it.qSel[i] && (q.correct === null || q.options.length < 2))) out.push("imp_blocked_correct");
    }    return out;
  }

  const ready = items.filter((i) => i.phase === "ready" && i.include);
  const blocked = ready.filter((i) => problems(i).length);
  const canCreate = ready.length > 0 && blocked.length === 0 && !busy;

  async function createAll() {
    setBusy("create");
    let ok = 0;
    for (const it of ready) {
      patch(it.id, (x) => ({ ...x, phase: "creating", note: undefined, error: undefined }));
      try {
        const res = await createOne(it);
        ok++;
        patch(it.id, (x) => ({ ...x, phase: "created", resultId: res.id, note: res.note }));
      } catch (e) {
        const issue = e instanceof ApiError && e.issues?.[0] ? ` (${e.issues[0].path}: ${e.issues[0].message})` : "";
        patch(it.id, (x) => ({ ...x, phase: "failed", error: `${tx("imp_create_failed")}${issue}` }));
      }
    }
    setBusy("");
    if (ok > 0) {
      onDone?.();
      toast(`${t("imp_created")}: ${ok}`);
    }
    setDone(true);
  }

  async function createOne(it: Item): Promise<{ id: string | number; note?: string }> {
    const d = it.draft!;
    // always created inactive first, so a half-imported record is never visible to the public
    let id: string | number;
    if (d.kind === "survey" || d.kind === "game") {
      const draft = d.kind === "survey" ? surveyDraftPayload(d, it.qSel) : gameDraftPayload(d, it.qSel);
      const r = await fetch("/api/admin/import/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: d.kind, draft }), cache: "no-store" });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: string | number; issues?: { path: string; message: string }[]; error?: string };
      if (!r.ok || !body.ok || body.id === undefined) throw new ApiError(body.error ?? "error", r.status, body.issues);
      id = body.id;
    } else {
      const qs = d.questions.filter((_, i) => it.qSel[i]);
      const row = await api.create(resKey, d.kind === "quiz" ? quizPayload(d, false) : psychPayload(d, false));
      id = row.id;
      try {
        if (d.kind === "quiz") await api.bulkCreate("academic_questions", quizQuestionsPayload(qs, row.id));
        else {
          await api.bulkCreate("psych_questions", psychQuestionsPayload(qs, row.id));
          const sc = d.scales.filter((_, i) => it.sSel[i]);
          if (sc.length) await api.bulkCreate("psych_result_scales", scalesPayload(sc, row.id));
        }
      } catch (e) {
        await api.remove(resKey, row.id).catch(() => undefined); // roll back: no half-created record
        throw e;
      }
    }
    if (publish) {
      try {
        await api.update(resKey, id, { is_active: true });
      } catch {
        return { id, note: tx("imp_publish_failed") };
      }
    }
    return { id, note: publish ? undefined : tx("imp_draft_note") };
  }
  const created = items.filter((i) => i.phase === "created");
  const hasDetail = !!getResource(resKey)?.detail;
  useEffect(() => {
    // exactly one file imported and nothing else pending: go straight to the new record
    if (done && created.length === 1 && items.length === 1 && created[0].resultId !== undefined) {
      onClose();
      router.push(hasDetail ? `/admin/${resKey}/${created[0].resultId}` : `/admin/${resKey}`);
    }
  }, [done, created, items.length, onClose, router, resKey, hasDetail]);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, panelRef, () => { if (!busy) onClose(); });
  const sample = useMemo(() => templateLines(kind, uiLang, gameType === "auto" ? "matching" : gameType).join("\n"), [kind, uiLang, gameType]);
  if (!open) return null;
  const tplLang = docLang === "auto" ? uiLang : docLang;
  const tplHref = (format: "docx" | "txt") => `/api/admin/import/template?kind=${kind}&lang=${tplLang}&format=${format}${kind === "game" ? `&type=${gameType === "auto" ? "matching" : gameType}` : ""}`;
  const hasAnalyzed = items.some((i) => i.phase !== "queued");
  const queued = items.some((i) => i.phase === "queued");

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={t(`imp_title_${kind}` as UIKey)} data-testid="import-dialog">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => !busy && onClose()} />
      <div ref={panelRef} tabIndex={-1} className="relative m-auto flex max-h-[96vh] w-[calc(100%-1rem)] max-w-5xl flex-col rounded-2xl bg-white shadow-2xl outline-none dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <FileUp className="size-5 text-indigo-500" /> {t(`imp_title_${kind}` as UIKey)}
          </h2>
          <button onClick={() => !busy && onClose()} aria-label={t("close")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* upload */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition",
              drag ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-300 hover:border-indigo-400 dark:border-slate-700",
            )}
          >
            <FileUp className="size-7 text-slate-400" />
            <span className="font-medium text-slate-700 dark:text-slate-200">{t("imp_drop")}</span>
            <span className="text-xs text-slate-500">{t("imp_formats")}</span>
            <input
              ref={fileRef}
              data-testid="import-file-input"
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => {
                addFiles(e.target.files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="imp-lang">
                {t("imp_lang")}
              </label>
              <select id="imp-lang" className={cn(inputCls, "w-auto min-w-44")} value={docLang} onChange={(e) => setDocLang(e.target.value as "auto" | Locale)}>
                <option value="auto">{t("imp_lang_auto")}</option>
                <option value="uz">O&apos;zbekcha (uz)</option>
                <option value="ru">Русский (ru)</option>
                <option value="en">English (en)</option>
              </select>
            </div>
            {kind === "game" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="imp-gt">
                  {t("imp_game_type")}
                </label>
                <select id="imp-gt" className={cn(inputCls, "w-auto min-w-44")} value={gameType} onChange={(e) => setGameType(e.target.value as GameTypeChoice)}>
                  <option value="auto">{t("imp_game_auto")}</option>
                  {GAME_TYPES.map((g: GameType) => (
                    <option key={g} value={g}>
                      {tx(`imp_gt_${g}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button variant="primary" data-testid="import-analyze" onClick={() => analyzeQueued(false)} disabled={!queued || !!busy} loading={busy === "analyze"}>
              {busy === "analyze" ? t("imp_analyzing") : t("imp_analyze")}
            </Button>
            {hasAnalyzed && (
              <Button size="sm" onClick={() => analyzeQueued(true)} disabled={!!busy}>
                {t("imp_reanalyze")}
              </Button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">{t("imp_download_template")}:</span>
              <a className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" href={tplHref("docx")} download>
                <Download className="size-3.5" /> {t("imp_template_docx")}
              </a>
              <a className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" href={tplHref("txt")} download>
                <Download className="size-3.5" /> {t("imp_template_txt")}
              </a>
            </div>
          </div>
          <p className="text-xs text-slate-500">{t("imp_lang_hint")}</p>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4 accent-indigo-600" checked={translit} onChange={(e) => setTranslit(e.target.checked)} data-testid="import-translit" />
              <span>{t("imp_translit")}</span>
            </label>
            {caps.ai && (
              <label className="flex max-w-xl items-start gap-1.5">
                <input type="checkbox" className="mt-0.5 size-4 accent-indigo-600" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} data-testid="import-ai" />
                <span>
                  <span className="font-medium">{t("imp_ai")}</span>
                  <span className="block text-amber-700 dark:text-amber-400">{t("imp_ai_privacy")}</span>
                </span>
              </label>
            )}
          </div>
          {!caps.ocr && <p className="text-xs text-slate-500">{t("imp_ocr_off")}</p>}

          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
              <HelpCircle className="size-4" /> {t("imp_help_title")}
            </summary>
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">{t(`imp_help_${kind}` as UIKey)}</p>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-white p-2 text-[11px] leading-snug text-slate-700 dark:bg-slate-950 dark:text-slate-300">{sample}</pre>
            <p className="mt-2 text-xs text-slate-500">{t("imp_scanned_hint")}</p>
            <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {t("imp_games_note")}
            </p>
          </details>

          {/* files / preview */}
          {items.length > 0 && (
            <div className="space-y-3" data-testid="import-preview">
              {hasAnalyzed && <p className="text-xs text-slate-500">{t("imp_preview_hint")}</p>}
              {items.map((it) => (
                <ItemCard
                  key={it.id}
                  it={it}
                  tx={tx}
                  pick={pick}
                  warnText={warnText}
                  L={L}
                  problems={problems(it)}
                  disabled={!!busy}
                  onPatch={(fn) => patch(it.id, fn)}
                  onDraft={(fn) => patchDraft(it.id, fn)}
                  onRemove={() => setItems((l) => l.filter((x) => x.id !== it.id))}
                  onReparse={(text) => reparse(it.id, text)}
                />
              ))}
            </div>
          )}
          {done && created.length > 1 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="mb-1 font-semibold">{t("imp_done_title")}</p>
              <ul className="space-y-1">
                {created.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <Link href={hasDetail ? `/admin/${resKey}/${c.resultId}` : `/admin/${resKey}`} className="font-medium text-indigo-600 underline" onClick={onClose}>
                      {pick(c.draft?.title) || c.file.name}
                    </Link>
                    {c.note && <span className="text-xs text-slate-500">{c.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Switch checked={publish} onChange={setPublish} label={t("imp_publish")} disabled={!!busy} />
            <div>
              <div className="text-sm font-medium">{t("imp_publish")}</div>
              <div className="text-[11px] text-slate-500">{t("imp_publish_hint")}</div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {blocked.length > 0 && <span className="text-xs text-red-600">{t("imp_blocked")}</span>}
            <Button onClick={onClose} disabled={!!busy}>
              {done ? t("close") : t("cancel")}
            </Button>
            <Button variant="primary" data-testid="import-create" disabled={!canCreate} loading={busy === "create"} onClick={createAll}>
              {busy === "create" ? t("imp_creating") : `${t("imp_create")}${ready.length ? ` (${ready.length})` : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ per-file card */

function ItemCard({
  it,
  tx,
  pick,
  warnText,
  L,
  problems,
  disabled,
  onPatch,
  onDraft,
  onRemove,
  onReparse,
}: {
  it: Item;
  tx: (k: string) => string;
  pick: (v: LText | null | undefined) => string;
  warnText: (w: Warning) => string;
  L: (v: LText) => string;
  problems: UIKey[];
  disabled: boolean;
  onPatch: (fn: (it: Item) => Item) => void;
  onDraft: (fn: (d: ImportDraft) => void) => void;
  onRemove: () => void;
  onReparse: (text: string) => void;
}) {
  const d = it.draft;
  const list = d ? itemsOf(d) : [];
  const selected = it.qSel.filter(Boolean).length;
  const warnCount = d ? d.warnings.length + list.reduce((n, q, i) => n + (it.qSel[i] ? q.warnings.length : 0), 0) : 0;  const draftWarnings = useMemo(() => {
    if (!d) return [] as Warning[];
    if (d.kind !== "psych") return d.warnings;
    const base = d.warnings.filter((w) => !["no_scales", "scale_overlap", "scale_gap"].includes(w.code));
    return [...base, ...scaleWarnings(d.scales.filter((_, i) => it.sSel[i]), d.questions.filter((_, i) => it.qSel[i]))];
  }, [d, it.qSel, it.sSel]);

  return (
    <div className={cn("rounded-xl border bg-white dark:bg-slate-900", it.phase === "error" || it.phase === "failed" ? "border-red-300 dark:border-red-900" : "border-slate-200 dark:border-slate-800")}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {it.phase === "ready" && (
          <input type="checkbox" className="size-4 accent-indigo-600" checked={it.include} onChange={(e) => onPatch((x) => ({ ...x, include: e.target.checked }))} aria-label={tx("imp_include")} disabled={disabled} />
        )}
        <FileText className="size-4 text-slate-400" />
        <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => onPatch((x) => ({ ...x, open: !x.open }))} disabled={it.phase !== "ready"}>
          {it.file.name}
        </button>
        {it.from && <Badge tone="gray">{it.from}</Badge>}
        {it.meta && <Badge>{it.meta.format.toUpperCase()}</Badge>}
        {it.meta?.units && (
          <Badge tone="gray">
            {[it.meta.units.pages && `${it.meta.units.pages} ${tx("imp_u_pages")}`, it.meta.units.sheets && `${it.meta.units.sheets} ${tx("imp_u_sheets")}`, it.meta.units.slides && `${it.meta.units.slides} ${tx("imp_u_slides")}`].filter(Boolean).join(" · ")}
          </Badge>
        )}
        {it.meta && <Badge tone="gray">{it.meta.chars.toLocaleString()} {tx("imp_u_chars")}</Badge>}
        {it.meta?.ocr && <Badge tone="amber">OCR {it.meta.ocrConfidence ?? "?"}%</Badge>}
        {it.meta?.parser && <Badge tone={it.meta.parser === "ai" ? "violet" : it.meta.parser === "generic" ? "amber" : "green"}>{tx(`imp_parser_${it.meta.parser}`)}</Badge>}
        {it.meta?.transliterated && <Badge tone="gray">кирил → lotin</Badge>}
        {it.meta && (
          <Badge tone="blue">
            {tx("imp_lang_found")}: {it.meta.langs.join("/").toUpperCase() || it.meta.detectedLang.toUpperCase()}
          </Badge>
        )}
        {it.phase === "analyzing" && <Loader2 className="size-4 animate-spin text-indigo-500" />}
        {it.phase === "queued" && <Badge>…</Badge>}
        {it.phase === "creating" && <Loader2 className="size-4 animate-spin text-indigo-500" />}
        {it.phase === "created" && (
          <Badge tone="green">
            <CheckCircle2 className="mr-1 size-3" /> {tx("imp_created")}
          </Badge>
        )}
        {d && it.phase === "ready" && (
          <>
            <Badge tone="violet">
              {selected}/{list.length} {tx("imp_selected")}
            </Badge>
            {warnCount > 0 && (
              <Badge tone="amber">
                <AlertTriangle className="mr-1 size-3" /> {warnCount}
              </Badge>
            )}
            <button type="button" aria-label={tx("imp_toggle")} aria-expanded={it.open} onClick={() => onPatch((x) => ({ ...x, open: !x.open }))}>
              <ChevronDown className={cn("size-4 transition", it.open && "rotate-180")} />
            </button>
          </>
        )}
        {it.phase !== "creating" && it.phase !== "created" && (
          <button type="button" onClick={onRemove} disabled={disabled} aria-label={tx("imp_remove_file")} title={tx("imp_remove_file")} className="rounded p-1 text-slate-400 hover:text-red-500">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {(it.phase === "error" || it.phase === "failed") && (
        <p className="border-t border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300" role="alert">
          {it.phase === "error" ? tx(`imp_err_${it.error}`) : it.error}
          {it.error === "no_selectable_text" && <span className="mt-1 block text-xs">{tx("imp_scanned_hint")}</span>}
        </p>
      )}
      {(it.phase === "error" || (it.phase === "ready" && it.open)) && it.rawText && (
        <RawPanel text={it.rawText} tx={tx} disabled={disabled} showByDefault={it.phase === "error"} onReparse={onReparse} />
      )}
      {it.note && <p className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">{it.note}</p>}

      {d && it.phase === "ready" && it.open && (
        <div className="space-y-3 border-t border-slate-200 px-3 py-3 dark:border-slate-800">
          {/* metadata */}
          <div className="grid gap-2 sm:grid-cols-3">
            {LOCALES.map((l) => (
              <label key={l} className="block text-xs">
                <span className="mb-0.5 block font-medium text-slate-500">
                  {tx("imp_f_title")} · {l.toUpperCase()}
                </span>
                <input className={inputCls} value={d.title[l]} maxLength={300} onChange={(e) => onDraft((x) => (x.title[l] = e.target.value))} />
              </label>
            ))}
          </div>
          {d.kind === "quiz" && (
            <div className="grid gap-2 sm:grid-cols-6">
              <label className="block text-xs sm:col-span-2">
                <span className="mb-0.5 block font-medium text-slate-500">{tx("imp_f_subject")}</span>
                <input className={inputCls} value={d.subject_key} maxLength={60} onChange={(e) => onDraft((x) => x.kind === "quiz" && (x.subject_key = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")))} />
              </label>
              <Sel label={tx("imp_f_grade")} value={String(d.grade)} options={gradeOptions.map((o) => [o.value, L(o.label)])} onChange={(v) => onDraft((x) => x.kind === "quiz" && (x.grade = Number(v)))} />
              <Sel label={tx("imp_f_difficulty")} value={d.difficulty} options={difficultyOptions.map((o) => [o.value, L(o.label)])} onChange={(v) => onDraft((x) => x.kind === "quiz" && (x.difficulty = v as "easy"))} />
              <Num label={tx("imp_f_duration")} value={d.duration_minutes} min={1} max={240} onChange={(n) => onDraft((x) => x.kind === "quiz" && (x.duration_minutes = n))} />
              <Num label={tx("imp_f_pass")} value={d.passing_score_percent} min={0} max={100} onChange={(n) => onDraft((x) => x.kind === "quiz" && (x.passing_score_percent = n))} />
            </div>
          )}
          {d.kind === "psych" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Sel label={tx("imp_f_topic")} value={d.topic} options={topicOptions.map((o) => [o.value, L(o.label)])} onChange={(v) => onDraft((x) => x.kind === "psych" && (x.topic = v as "interests"))} />
              <Sel label={tx("imp_f_audience")} value={d.target_audience} options={audienceOptions.map((o) => [o.value, L(o.label)])} onChange={(v) => onDraft((x) => x.kind === "psych" && (x.target_audience = v as "kids"))} />
            </div>
          )}
          {d.kind === "survey" && (
            <div className="grid gap-2 sm:grid-cols-4">
              <Sel label={tx("imp_f_audience")} value={d.audience} options={surveyAudienceOptions.map((o) => [o.value, L(o.label)])} onChange={(v) => onDraft((x) => x.kind === "survey" && (x.audience = v as "all"))} />
              <DateIn label={tx("imp_f_start")} value={d.startsAt} onChange={(v) => onDraft((x) => x.kind === "survey" && (x.startsAt = v))} />
              <DateIn label={tx("imp_f_end")} value={d.endsAt} onChange={(v) => onDraft((x) => x.kind === "survey" && (x.endsAt = v))} />
              <div className="flex flex-col justify-end gap-1 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="size-4 accent-indigo-600" checked={d.isAnonymous} onChange={(e) => onDraft((x) => x.kind === "survey" && (x.isAnonymous = e.target.checked))} /> {tx("imp_f_anon")}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="size-4 accent-indigo-600" checked={d.allowMultiple} onChange={(e) => onDraft((x) => x.kind === "survey" && (x.allowMultiple = e.target.checked))} /> {tx("imp_f_multi_resp")}
                </label>
              </div>
              <p className="text-xs text-slate-500 sm:col-span-4">{tx("imp_survey_copy")}</p>
            </div>
          )}
          {d.kind === "game" && (
            <div className="grid gap-2 sm:grid-cols-5">
              <div className="flex flex-col justify-end pb-1.5">
                <Badge tone="violet">{tx(`imp_gt_${d.gameType}`)}</Badge>
              </div>
              <label className="block text-xs sm:col-span-2">
                <span className="mb-0.5 block font-medium text-slate-500">{tx("imp_f_subject")}</span>
                <input className={inputCls} value={d.subject_key} maxLength={40} onChange={(e) => onDraft((x) => x.kind === "game" && (x.subject_key = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")))} />
              </label>
              <Sel label={tx("imp_f_grade")} value={d.grade ? String(d.grade) : ""} options={[["", "—"], ...gradeOptions.map((o) => [o.value, L(o.label)] as const)]} onChange={(v) => onDraft((x) => x.kind === "game" && (x.grade = v ? Number(v) : null))} />
              <Sel label={tx("imp_f_difficulty")} value={d.difficulty} options={difficultyOptions.map((o) => [o.value, L(o.label)])} onChange={(v) => onDraft((x) => x.kind === "game" && (x.difficulty = v as "easy"))} />
            </div>
          )}
          {it.meta && !it.meta.langs.includes("uz") && <p className="text-xs text-slate-500">{tx("imp_uz_copy")}</p>}
          {draftWarnings.length > 0 && (
            <ul className="space-y-1 text-xs">
              {draftWarnings.map((w, i) => (
                <li key={i} className={cn("flex items-start gap-1.5", w.level === "error" ? "text-red-600" : "text-amber-700 dark:text-amber-400")}>
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {warnText(w)}
                </li>
              ))}
            </ul>
          )}
          {problems.length > 0 && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {tx("imp_blocked")}: {problems.map((p) => tx(p)).join("; ")}
            </p>
          )}

          {/* items */}
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="size-4 accent-indigo-600"
                checked={selected === list.length}
                onChange={(e) => onPatch((x) => ({ ...x, qSel: x.qSel.map(() => e.target.checked) }))}
                aria-label={tx("imp_questions")}
              />
              {d.kind === "game" && d.gameType === "matching" ? tx("imp_pairs") : d.kind === "game" && d.gameType === "true_false" ? tx("imp_statements") : tx("imp_questions")} ({selected}/{list.length})
            </div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {list.map((q, qi) => (
                <div key={qi} className={cn("flex gap-2 px-2.5 py-2 text-sm", !it.qSel[qi] && "opacity-50")} data-testid="import-question">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-indigo-600"
                    checked={!!it.qSel[qi]}
                    onChange={(e) => onPatch((x) => ({ ...x, qSel: x.qSel.map((v, k) => (k === qi ? e.target.checked : v)) }))}
                    aria-label={`${tx("imp_include")} ${qi + 1}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-xs text-slate-400">{qi + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <ItemBody d={d} qi={qi} id={it.id} tx={tx} pick={pick} L={L} onDraft={onDraft} />
                      </div>
                      <Badge tone={q.confidence >= 0.85 ? "green" : q.confidence >= 0.5 ? "amber" : "red"} className="shrink-0">
                        {Math.round(q.confidence * 100)}%
                      </Badge>
                    </div>
                    {q.warnings.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {q.warnings.map((w, wi) => (
                          <Badge key={wi} tone={w.level === "error" ? "red" : "amber"} className="whitespace-normal">
                            {warnText(w)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* scales */}
          {d.kind === "psych" && d.scales.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {tx("imp_scales")} ({it.sSel.filter(Boolean).length}/{d.scales.length})
              </div>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {d.scales.map((s, si) => (
                  <div key={si} className={cn("flex items-start gap-2 px-2.5 py-2 text-sm", !it.sSel[si] && "opacity-50")}>
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-indigo-600"
                      checked={!!it.sSel[si]}
                      onChange={(e) => onPatch((x) => ({ ...x, sSel: x.sSel.map((v, k) => (k === si ? e.target.checked : v)) }))}
                      aria-label={`${tx("imp_include")} ${s.min}-${s.max}`}
                    />
                    <Badge tone="violet">
                      {s.min}–{s.max}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{pick(s.title)}</p>
                      <p className="text-xs text-slate-500">{pick(s.analysis)}</p>
                      <p className="text-xs text-slate-400">{pick(s.recommendations)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sel({ label, value, options, onChange }: { label: string; value: string; options: (readonly [string, string])[]; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-slate-500">{label}</span>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-slate-500">{label}</span>
      <input type="number" className={inputCls} value={value} min={min} max={max} onChange={(e) => onChange(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || min))))} />
    </label>
  );
}

/* ------------------------------------------------------------------ one reviewable item */

function OptionList({ opts, mode, correct, name, onCorrect, onScore, tx, pick }: { opts: { id: string; text: LText; score?: number }[]; mode: "correct" | "score" | "none"; correct?: string | null; name: string; onCorrect?: (id: string) => void; onScore?: (id: string, n: number) => void; tx: (k: string) => string; pick: (v: LText) => string }) {
  return (
    <div className="mt-1 grid gap-1 sm:grid-cols-2">
      {opts.map((o) => (
        <div key={o.id} className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs", mode === "correct" && correct === o.id && "bg-emerald-50 dark:bg-emerald-950/40")}>
          {mode === "correct" && <input type="radio" className="size-3.5 accent-emerald-600" name={name} checked={correct === o.id} onChange={() => onCorrect?.(o.id)} aria-label={`${tx("imp_correct")} ${o.id}`} />}
          {mode === "score" && (
            <input type="number" className="w-14 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900" value={o.score ?? 0} onChange={(e) => onScore?.(o.id, Number(e.target.value) || 0)} aria-label={`${tx("imp_score")} ${o.id}`} />
          )}
          <span className="font-semibold text-slate-500">{o.id}</span>
          <span className="min-w-0 flex-1 break-words">{pick(o.text)}</span>
        </div>
      ))}
    </div>
  );
}

function ItemBody({ d, qi, id, tx, pick, L, onDraft }: { d: ImportDraft; qi: number; id: string; tx: (k: string) => string; pick: (v: LText) => string; L: (v: LText) => string; onDraft: (fn: (d: ImportDraft) => void) => void }) {
  if (d.kind === "survey") {
    const q = d.questions[qi];
    return (
      <div>
        <p className="break-words font-medium">{pick(q.text)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label={tx("imp_f_type")}
            className={cn(inputCls, "w-auto py-0.5 text-xs")}
            value={q.type}
            onChange={(e) => onDraft((x) => x.kind === "survey" && (x.questions[qi].type = e.target.value as typeof q.type))}
          >
            {surveyQuestionTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {L(o.label)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            <input type="checkbox" className="size-3.5 accent-indigo-600" checked={q.required} onChange={(e) => onDraft((x) => x.kind === "survey" && (x.questions[qi].required = e.target.checked))} /> {tx("imp_f_required")}
          </label>
          {q.type === "scale" && (
            <span className="text-slate-500">
              {tx("imp_f_scale")}: {q.scaleMin}–{q.scaleMax} {pick(q.scaleMinLabel) && `(${pick(q.scaleMinLabel)} → ${pick(q.scaleMaxLabel)})`}
            </span>
          )}
        </div>
        {(q.type === "single" || q.type === "multiple") && <OptionList opts={q.options} mode="none" name="" tx={tx} pick={pick} />}
      </div>
    );
  }
  if (d.kind === "game" && d.gameType === "matching") {
    const p = d.pairs[qi];
    return (
      <p className="break-words">
        <span className="font-medium">{pick(p.left)}</span> <span className="text-slate-400">↔</span> {pick(p.right)}
      </p>
    );
  }
  if (d.kind === "game" && d.gameType === "true_false") {
    const s = d.statements[qi];
    return (
      <div>
        <p className="break-words font-medium">{pick(s.text)}</p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <select
            aria-label={tx("imp_correct")}
            className={cn(inputCls, "w-auto py-0.5 text-xs")}
            value={s.isTrue === null ? "" : s.isTrue ? "1" : "0"}
            onChange={(e) => onDraft((x) => x.kind === "game" && (x.statements[qi].isTrue = e.target.value === "" ? null : e.target.value === "1"))}
          >
            <option value="">?</option>
            <option value="1">{tx("imp_true")}</option>
            <option value="0">{tx("imp_false")}</option>
          </select>
          {s.explanation && <span className="text-slate-500">{pick(s.explanation)}</span>}
        </div>
      </div>
    );
  }
  const q = d.kind === "quiz" || d.kind === "psych" || d.kind === "game" ? d.questions[qi] : null;
  if (!q) return null;
  const quizLike = d.kind !== "psych";
  return (
    <div>
      <p className="break-words font-medium">{pick(q.text)}</p>
      <OptionList
        opts={q.options}
        mode={quizLike ? "correct" : "score"}
        correct={q.correct}
        name={`c-${id}-${qi}`}
        onCorrect={(oid) => onDraft((x) => (x.kind === "quiz" || x.kind === "game") && (x.questions[qi].correct = oid))}
        onScore={(oid, n) => onDraft((x) => x.kind === "psych" && (x.questions[qi].options.find((p) => p.id === oid)!.score = n))}
        tx={tx}
        pick={pick}
      />
    </div>
  );
}

function DateIn({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-slate-500">{label}</span>
      <input type="date" className={inputCls} value={value ? value.slice(0, 10) : ""} onChange={(e) => onChange(e.target.value ? `${e.target.value}T00:00:00.000Z` : null)} />
    </label>
  );
}
/* ------------------------------------------------------------------ extracted text + manual builder */

function RawPanel({ text, tx, disabled, showByDefault, onReparse }: { text: string; tx: (k: string) => string; disabled: boolean; showByDefault: boolean; onReparse: (text: string) => void }) {
  const [value, setValue] = useState(text);
  return (
    <details open={showByDefault} className="border-t border-slate-200 px-3 py-2 text-xs dark:border-slate-800" data-testid="import-rawtext">
      <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">{tx("imp_raw_title")}</summary>
      <p className="mt-1 text-slate-500">{tx("imp_raw_help")}</p>
      <textarea
        className={cn(inputCls, "mt-1.5 h-48 font-mono text-[11px] leading-snug")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        aria-label={tx("imp_raw_title")}
        data-testid="import-rawtext-input"
      />
      <div className="mt-1.5 flex justify-end">
        <Button size="sm" onClick={() => onReparse(value)} disabled={disabled || !value.trim()} data-testid="import-reparse">
          {tx("imp_reparse")}
        </Button>
      </div>
    </details>
  );
}