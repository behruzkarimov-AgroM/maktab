"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/admin/cn";
import { defaultForField } from "@/lib/admin/resources";
import type { Field } from "@/lib/admin/types";
import type { LocalizedText } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { GameItemsEditor } from "./GameItemsEditor";
import { ImageListField, MediaField } from "./MediaField";
import { TrilingualField } from "./TrilingualField";
import { Button, inputCls, Switch } from "./ui";

export type Errors = Record<string, string>;

const pad = (n: number) => String(n).padStart(2, "0");
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  // always Asia/Tashkent wall-clock time (UTC+5, no DST), independent of the admin's browser timezone
  const t = new Date(d.getTime() + 5 * 3600_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
export function localInputToIso(v: string): string {
  return new Date(`${v}:00+05:00`).toISOString();
}

export function FieldLabel({ field, htmlFor }: { field: Field; htmlFor?: string }) {
  const { L } = useAdmin();
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
      {L(field.label)}
      {field.required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
  errors,
  path,
  disabled,
  creating,
  siblings,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  errors: Errors;
  path: string;
  disabled?: boolean;
  creating?: boolean;
  /** Top-level form values (needed by fields that depend on another field, e.g. gameItems). */
  siblings?: Record<string, unknown>;
}) {
  const { L, t } = useAdmin();
  const id = `f-${path}`;
  const error = errors[path];
  const ro = disabled || field.readOnly || (field.createOnly && !creating);
  const errCls = error && "border-red-400 focus:border-red-500 focus:ring-red-500/25";

  let input: React.ReactNode;
  switch (field.type) {
    case "localized":
    case "localizedArea":
      input = ro ? (
        <div className="text-sm text-slate-700 dark:text-slate-200">{(value as LocalizedText | null)?.uz}</div>
      ) : (
        <TrilingualField
          id={id}
          value={value as LocalizedText | null}
          onChange={onChange}
          multiline={field.type === "localizedArea"}
          required={field.required}
          error={error}
          placeholder={field.placeholder}
        />
      );
      break;
    case "textarea":
      input = <textarea id={id} rows={4} disabled={ro} className={cn(inputCls, "resize-y", errCls)} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "boolean":
      input = (
        <div className="flex items-center gap-3 py-1">
          <Switch checked={!!value} onChange={onChange} disabled={ro} label={L(field.label)} />
          <span className="text-sm text-slate-600 dark:text-slate-300">{value ? t("yes") : t("no")}</span>
        </div>
      );
      break;
    case "number":
      input = (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          disabled={ro}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          className={cn(inputCls, errCls)}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
      break;
    case "select":
      input = (
        <select id={id} disabled={ro} className={cn(inputCls, errCls)} value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {L(o.label)}
            </option>
          ))}
        </select>
      );
      break;
    case "date":
      input = <input id={id} type="date" disabled={ro} className={cn(inputCls, errCls)} value={(value as string)?.slice(0, 10) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case "datetime":
      input = (
        <input
          id={id}
          type="datetime-local"
          disabled={ro}
          className={cn(inputCls, errCls)}
          value={isoToLocalInput(value as string)}
          onChange={(e) => onChange(e.target.value ? localInputToIso(e.target.value) : null)}
        />
      );
      break;
    case "color":
      input = <input id={id} type="color" disabled={ro} className="h-9 w-16 rounded border border-slate-300 dark:border-slate-700" value={(value as string) || "#1d3557"} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "image":
      input = ro ? <div className="text-sm text-slate-500">{(value as string) || "—"}</div> : <MediaField value={value as string} onChange={onChange} bucket={field.bucket} />;
      break;
    case "imageList":
      input = <ImageListField value={value as string[]} onChange={onChange} bucket={field.bucket} />;
      break;
    case "stringList":
      input = <StringList value={(value as string[]) ?? []} onChange={onChange} placeholder={field.placeholder} />;
      break;
    case "grades":
      input = <GradePicker value={(value as number[]) ?? []} onChange={onChange} />;
      break;
    case "repeater":
      input = <Repeater field={field} value={(value as Record<string, unknown>[]) ?? []} onChange={onChange} errors={errors} path={path} disabled={ro} />;
      break;
    case "gameItems":
      input = <GameItemsEditor type={siblings?.game_type} value={(value as Record<string, unknown>[]) ?? []} onChange={onChange} errors={errors} path={path} disabled={ro} />;
      break;
    case "group":
      input = (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2 dark:border-slate-800">
          {field.fields?.map((sub) => (
            <div key={sub.name} className={cn(sub.half && sub.type !== "group" ? "" : "md:col-span-2")}>
              <FieldLabel field={sub} htmlFor={`f-${path}.${sub.name}`} />
              <FieldInput
                field={sub}
                value={(value as Record<string, unknown> | null)?.[sub.name]}
                onChange={(v) => onChange({ ...((value as object) ?? {}), [sub.name]: v })}
                errors={errors}
                path={`${path}.${sub.name}`}
                disabled={ro}
                creating={creating}
              />
            </div>
          ))}
        </div>
      );
      break;
    default:
      input = (
        <input
          id={id}
          type={field.type === "password" ? "password" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "url" ? "url" : "text"}
          autoComplete={field.type === "password" ? "new-password" : "off"}
          disabled={ro}
          placeholder={field.placeholder}
          className={cn(inputCls, errCls)}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div>
      {input}
      {field.help && <p className="mt-1 text-xs text-slate-500">{L(field.help)}</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function StringList({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const { t } = useAdmin();
  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={i} className="flex gap-2">
          <input className={inputCls} value={s} placeholder={placeholder} onChange={(e) => onChange(value.map((x, k) => (k === i ? e.target.value : x)))} />
          <Button size="icon" variant="ghost" onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label={t("remove")}>
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" onClick={() => onChange([...value, ""])}>
        <Plus className="size-4" /> {t("addItem")}
      </Button>
    </div>
  );
}

function GradePicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { lang } = useAdmin();
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => {
        const on = value.includes(g);
        return (
          <button
            key={g}
            type="button"
            aria-pressed={on}
            title={lang === "ru" ? `${g} класс` : lang === "en" ? `Grade ${g}` : `${g}-sinf`}
            onClick={() => onChange(on ? value.filter((x) => x !== g) : [...value, g].sort((a, b) => a - b))}
            className={cn(
              "size-9 rounded-lg border text-sm font-medium transition",
              on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:text-slate-300",
            )}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}

const LETTERS = "ABCDEFGHIJ";

function Repeater({
  field,
  value,
  onChange,
  errors,
  path,
  disabled,
}: {
  field: Field;
  value: Record<string, unknown>[];
  onChange: (v: unknown) => void;
  errors: Errors;
  path: string;
  disabled?: boolean;
}) {
  const { t, L } = useAdmin();
  const fix = (arr: Record<string, unknown>[]) => (field.autoId === "letter" ? arr.map((it, i) => ({ ...it, _from: it.id, id: LETTERS[i] })) : arr);
  const set = (arr: Record<string, unknown>[]) => onChange(fix(arr));
  const blank = () => {
    const o: Record<string, unknown> = {};
    for (const f of field.fields ?? []) o[f.name] = defaultForField(f);
    return o;
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const a = [...value];
    [a[i], a[j]] = [a[j], a[i]];
    set(a);
  };
  const canAdd = !disabled && value.length < (field.maxItems ?? 200);
  const canRemove = !disabled && value.length > (field.minItems ?? 0);

  return (
    <div className="space-y-3">
      {value.map((item, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {field.itemLabel ? L(field.itemLabel) : ""} {field.autoId === "letter" ? LETTERS[i] : `#${i + 1}`}
            </span>
            {!disabled && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("moveUp")}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={t("moveDown")}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => set(value.filter((_, k) => k !== i))} disabled={!canRemove} aria-label={t("remove")}>
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {field.fields
              ?.filter((f) => !(field.autoId && f.name === "id"))
              .map((sub) => (
                <div key={sub.name} className={sub.half ? "" : "md:col-span-2"}>
                  <FieldLabel field={sub} htmlFor={`f-${path}.${i}.${sub.name}`} />
                  <FieldInput
                    field={sub}
                    value={item[sub.name]}
                    onChange={(v) => set(value.map((x, k) => (k === i ? { ...x, [sub.name]: v } : x)))}
                    errors={errors}
                    path={`${path}.${i}.${sub.name}`}
                    disabled={disabled}
                  />
                </div>
              ))}
          </div>
        </div>
      ))}
      {canAdd && (
        <Button size="sm" onClick={() => set([...value, blank()])}>
          <Plus className="size-4" /> {t("addItem")}
        </Button>
      )}
    </div>
  );
}
