"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/admin/cn";
import { MAX_ITEMS, MAX_OPTIONS, MIN_ITEMS, MIN_OPTIONS, type GameContentType, type QuizOption } from "@/lib/admin/game-content-types";
import { l } from "@/lib/admin/types";
import type { LocalizedText } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import type { Errors } from "./FieldInput";
import { TrilingualField } from "./TrilingualField";
import { Button } from "./ui";

type Item = Record<string, unknown>;
const EMPTY = (): LocalizedText => ({ uz: "", ru: "", en: "" });
const LETTERS = "ABCDEFGHIJ";

const TXT = {
  item: l("Element", "Элемент", "Item"),
  add: l("Element qo'shish", "Добавить элемент", "Add item"),
  min: l("kamida", "минимум", "min"),
  term: l("Chap tomon (atama / so'z / savol)", "Левая сторона (термин / слово / вопрос)", "Left side (term / word / question)"),
  def: l("O'ng tomon (ta'rif / tarjima / javob)", "Правая сторона (определение / перевод / ответ)", "Right side (definition / translation / answer)"),
  statement: l("Tasdiq", "Утверждение", "Statement"),
  isTrue: l("Tasdiq to'g'rimi?", "Утверждение верно?", "Is the statement true?"),
  yes: l("To'g'ri", "Верно", "True"),
  no: l("Noto'g'ri", "Неверно", "False"),
  explanation: l("Izoh (xato javobdan keyin ko'rsatiladi)", "Пояснение (показывается после ошибки)", "Explanation (shown after a wrong answer)"),
  question: l("Savol", "Вопрос", "Question"),
  option: l("Variant", "Вариант", "Option"),
  correct: l("To'g'ri javob", "Правильный ответ", "Correct answer"),
  addOption: l("Variant qo'shish", "Добавить вариант", "Add option"),
  pickType: l("Avval o'yin turini tanlang", "Сначала выберите тип игры", "Choose the game type first"),
  up: l("Yuqoriga", "Вверх", "Move up"),
  down: l("Pastga", "Вниз", "Move down"),
  del: l("O'chirish", "Удалить", "Remove"),
};

function nextId(items: Item[], prefix: string): string {
  let max = 0;
  for (const it of items) {
    const m = /^[a-z]+(\d+)$/.exec(String(it.id ?? ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${Math.max(max + 1, items.length + 1)}`;
}

function blank(type: GameContentType, items: Item[]): Item {
  const id = nextId(items, type === "matching" ? "p" : type === "true_false" ? "s" : "q");
  if (type === "matching") return { id, left: EMPTY(), right: EMPTY() };
  if (type === "true_false") return { id, statement: EMPTY(), is_true: true, explanation: null };
  return {
    id,
    question: EMPTY(),
    options: ["A", "B", "C", "D"].map((o) => ({ id: o, text: EMPTY() })),
    correct_option_id: "A",
    explanation: null,
  };
}

export function GameItemsEditor({
  type,
  value,
  onChange,
  errors,
  path,
  disabled,
}: {
  type: unknown;
  value: Item[];
  onChange: (v: Item[]) => void;
  errors: Errors;
  path: string;
  disabled?: boolean;
}) {
  const { L } = useAdmin();
  const gt = (["matching", "true_false", "quiz_race"] as const).find((x) => x === type);
  if (!gt) return <p className="text-sm text-slate-500">{L(TXT.pickType)}</p>;
  const items = Array.isArray(value) ? value : [];
  const set = (arr: Item[]) => onChange(arr);
  const patch = (i: number, p: Item) => set(items.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const a = [...items];
    [a[i], a[j]] = [a[j], a[i]];
    set(a);
  };
  const err = (k: string) => errors[`${path}.${k}`];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {items.length} / {MAX_ITEMS} ({L(TXT.min)} {MIN_ITEMS[gt]})
      </p>
      {items.map((it, i) => (
        <div key={String(it.id) + i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {L(TXT.item)} #{i + 1}
            </span>
            {!disabled && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={L(TXT.up)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={L(TXT.down)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => set(items.filter((_, k) => k !== i))} aria-label={L(TXT.del)}>
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </div>
            )}
          </div>
          <fieldset disabled={disabled} className="space-y-3">
            {gt === "matching" && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Labeled label={L(TXT.term)} error={err(`${i}.left`)}>
                  <TrilingualField value={it.left as LocalizedText} onChange={(v) => patch(i, { left: v })} required error={err(`${i}.left`)} />
                </Labeled>
                <Labeled label={L(TXT.def)} error={err(`${i}.right`)}>
                  <TrilingualField value={it.right as LocalizedText} onChange={(v) => patch(i, { right: v })} required error={err(`${i}.right`)} />
                </Labeled>
              </div>
            )}
            {gt === "true_false" && (
              <>
                <Labeled label={L(TXT.statement)} error={err(`${i}.statement`)}>
                  <TrilingualField multiline rows={2} value={it.statement as LocalizedText} onChange={(v) => patch(i, { statement: v })} required error={err(`${i}.statement`)} />
                </Labeled>
                <div role="radiogroup" aria-label={L(TXT.isTrue)} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{L(TXT.isTrue)}</span>
                  {([true, false] as const).map((b) => (
                    <button
                      key={String(b)}
                      type="button"
                      role="radio"
                      aria-checked={it.is_true === b}
                      onClick={() => patch(i, { is_true: b })}
                      className={cn(
                        "rounded-lg border px-3 py-1 text-sm font-medium transition",
                        it.is_true === b
                          ? b
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-red-600 bg-red-600 text-white"
                          : "border-slate-300 text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:text-slate-300",
                      )}
                    >
                      {L(b ? TXT.yes : TXT.no)}
                    </button>
                  ))}
                </div>
                <Labeled label={L(TXT.explanation)}>
                  <TrilingualField multiline rows={2} value={(it.explanation as LocalizedText | null) ?? null} onChange={(v) => patch(i, { explanation: v })} />
                </Labeled>
              </>
            )}
            {gt === "quiz_race" && <QuizBody item={it} index={i} onPatch={(p) => patch(i, p)} err={err} />}
          </fieldset>
        </div>
      ))}
      {!disabled && items.length < MAX_ITEMS && (
        <Button size="sm" onClick={() => set([...items, blank(gt, items)])}>
          <Plus className="size-4" /> {L(TXT.add)}
        </Button>
      )}
    </div>
  );
}

function Labeled({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function QuizBody({ item, index, onPatch, err }: { item: Item; index: number; onPatch: (p: Item) => void; err: (k: string) => string | undefined }) {
  const { L } = useAdmin();
  const options = (Array.isArray(item.options) ? item.options : []) as QuizOption[];
  const correct = String(item.correct_option_id ?? "");
  const setOptions = (next: QuizOption[], nextCorrect = correct) =>
    onPatch({ options: next, correct_option_id: next.some((o) => o.id === nextCorrect) ? nextCorrect : (next[0]?.id ?? "") });
  const freeLetter = () => LETTERS.split("").find((c) => !options.some((o) => o.id === c)) ?? `X${options.length}`;
  return (
    <>
      <Labeled label={L(TXT.question)} error={err(`${index}.question`)}>
        <TrilingualField multiline rows={2} value={item.question as LocalizedText} onChange={(v) => onPatch({ question: v })} required error={err(`${index}.question`)} />
      </Labeled>
      <div className="space-y-2">
        {options.map((o, k) => (
          <div key={o.id} className={cn("rounded-lg border p-2", o.id === correct ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-slate-200 dark:border-slate-800")}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <input type="radio" name={`correct-${index}`} checked={o.id === correct} onChange={() => onPatch({ correct_option_id: o.id })} className="size-4 accent-emerald-600" />
                {L(TXT.option)} {o.id}
                {o.id === correct && <span className="text-xs text-emerald-700 dark:text-emerald-400">({L(TXT.correct)})</span>}
              </label>
              {options.length > MIN_OPTIONS && (
                <Button size="icon" variant="ghost" onClick={() => setOptions(options.filter((_, q) => q !== k))} aria-label={L(TXT.del)}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
            <TrilingualField value={o.text} onChange={(v) => setOptions(options.map((x, q) => (q === k ? { ...x, text: v } : x)))} required error={err(`${index}.options.${k}.text`)} />
          </div>
        ))}
        {err(`${index}.correct_option_id`) && <p className="text-xs text-red-600">{err(`${index}.correct_option_id`)}</p>}
        {options.length < MAX_OPTIONS && (
          <Button size="sm" onClick={() => setOptions([...options, { id: freeLetter(), text: EMPTY() }])}>
            <Plus className="size-4" /> {L(TXT.addOption)}
          </Button>
        )}
      </div>
      <Labeled label={L(TXT.explanation)}>
        <TrilingualField multiline rows={2} value={(item.explanation as LocalizedText | null) ?? null} onChange={(v) => onPatch({ explanation: v })} />
      </Labeled>
    </>
  );
}
