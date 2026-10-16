"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import { api, ApiError } from "@/lib/admin/api";
import { cn } from "@/lib/admin/cn";
import { defaultsFor, fieldsFor } from "@/lib/admin/resources";
import type { ResourceDef, Row } from "@/lib/admin/types";
import { buildSchema } from "@/lib/admin/validation";
import { useAdmin } from "./AdminProvider";
import { FieldInput, FieldLabel, type Errors } from "./FieldInput";
import { Button } from "./ui";

export function ResourceForm({
  res,
  initial,
  parent,
  onSaved,
  onCancel,
  readOnly,
  bleed = "-mx-5 -mb-4",
  defaults,
}: {
  res: ResourceDef;
  initial: Row | null;
  parent?: { field: string; id: string | number };
  onSaved?: (row: Row) => void;
  onCancel?: () => void;
  readOnly?: boolean;
  bleed?: string;
  defaults?: Record<string, unknown>;
}) {
  const { t, L, toast } = useAdmin();
  const creating = !initial;
  const defaultsKey = JSON.stringify(defaults ?? {});
  const base = useMemo(() => {
    const d = { ...defaultsFor(res.fields), ...(initial ? {} : (JSON.parse(defaultsKey) as Record<string, unknown>)) };
    return initial ? { ...d, ...pickKnown(initial, res) } : d;
  }, [res, initial, defaultsKey]);
  const [values, setValues] = useState<Record<string, unknown>>(base);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Reset only when a different record (or resource/defaults) is loaded. A new object identity for the SAME
  // row (list reload, reorder, optimistic update) must not wipe the user's unsaved edits.
  const identity = `${res.key}|${initial ? String(initial.id) : "new"}|${defaultsKey}`;
  const lastIdentity = useRef(identity);
  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    setValues(base);
    setDirty(false);
    setErrors({});
  }, [identity, base]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (name: string, v: unknown) => {
    // option ids are re-lettered when options are moved/removed: keep `correct_option_id` pointing at the same option
    if (name === "options" && Array.isArray(v) && v.some((x) => x && typeof x === "object" && "_from" in x)) {
      const items = v as { id?: string; _from?: string }[];
      const map = new Map(items.map((x) => [x._from, x.id]));
      const clean = items.map(({ _from, ...rest }) => (void _from, rest));
      setValues((s) => {
        const cur = String(s.correct_option_id ?? "");
        const next = map.get(cur) ?? clean[0]?.id ?? "A";
        if (cur && !map.has(cur)) toast(t("correctReset"), "info");
        return { ...s, options: clean, ...("correct_option_id" in s ? { correct_option_id: next } : {}) };
      });
      setDirty(true);
      return;
    }
    // content sets: item shapes differ per game type, so switching the type starts with an empty item list
    setValues((s) => ({ ...s, [name]: v, ...(name === "game_type" && res.key === "game_content_sets" ? { items: [] } : {}) }));
    setDirty(true);
    setErrors((e) => {
      if (!e[name]) return e;
      const rest = { ...e };
      delete rest[name];
      return rest;
    });
  };

  async function submit(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (readOnly) return;
    const payload = Object.fromEntries(
      res.fields
        .filter((f) => !f.readOnly && (creating || !f.createOnly))
        .map((f) => [f.name, values[f.name]]),
    );
    const parsed = buildSchema(res, creating ? "create" : "update").safeParse(parent ? { ...payload, [parent.field]: parent.id } : payload);
    if (!parsed.success) {
      const e: Errors = {};
      for (const i of parsed.error.issues) {
        const key = i.path.join(".").replace(/\.(uz|ru|en)$/, "");
        e[key] ??= i.code === "too_small" || /expected (string|number)/.test(i.message) ? t("requiredField") : i.message;
      }
      setErrors(e);
      toast(t("validationFailed"), "error");
      return;
    }
    setSaving(true);
    try {
      const row = creating ? await api.create(res.key, parsed.data) : await api.update(res.key, res.singleton ? 1 : initial!.id, parsed.data);
      toast(creating ? t("created") : t("saved"));
      setDirty(false);
      onSaved?.(row);
    } catch (e) {
      if (e instanceof ApiError && e.issues) {
        const m: Errors = {};
        for (const i of e.issues) m[i.path.replace(/\.(uz|ru|en)$/, "")] = i.message;
        setErrors(m);
      }
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    } finally {
      setSaving(false);
    }
  }

  const optionIds = Array.isArray(values.options) ? (values.options as { id?: string }[]).map((o) => String(o.id ?? "")).filter(Boolean) : null;
  const visible = fieldsFor(res, { ...(initial ?? {}), ...values })
    .filter((f) => !(f.createOnly && f.virtual && !creating))
    .map((f) => (f.name === "correct_option_id" && optionIds?.length ? { ...f, options: f.options?.filter((o) => optionIds.includes(o.value)) } : f));

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2">
        {visible.map((f) => (
          <Fragment key={f.name}>
            {f.section && (
              <h3 className="mt-2 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600 md:col-span-2 dark:border-slate-800 dark:text-indigo-400">
                {L(f.section)}
              </h3>
            )}
            <div className={cn("min-w-0", f.half ? "" : "md:col-span-2")}>
              <FieldLabel field={f} htmlFor={`f-${f.name}`} />
              <FieldInput field={f} value={values[f.name]} onChange={(v) => set(f.name, v)} errors={errors} path={f.name} disabled={readOnly} creating={creating} siblings={values} />
            </div>
          </Fragment>
        ))}
      </div>
      {!readOnly && (
        <div className={cn("sticky bottom-0 mt-6 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95", bleed)}>
          {dirty && <span className="mr-auto text-xs text-amber-600 dark:text-amber-400">● {t("unsaved")}</span>}
          {onCancel && (
            <Button type="button" onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
          <Button type="submit" variant="primary" loading={saving}>
            <Save className="size-4" /> {saving ? t("saving") : t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}

function pickKnown(row: Row, res: ResourceDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of res.fields) if (f.name in row) out[f.name] = row[f.name];
  return out;
}
