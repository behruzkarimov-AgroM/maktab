"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Columns3, Download, Eraser, ExternalLink, FileUp, Pencil, Plus, Search, Table2, Trash2 } from "lucide-react";
import { api } from "@/lib/admin/api";
import { cn } from "@/lib/admin/cn";
import { exportCsv, exportXlsx } from "@/lib/admin/export";
import { canDeleteRow, canWrite, getResource } from "@/lib/admin/resources";
import { UI, type UIKey } from "@/lib/admin/ui-i18n";
import { moveItem } from "@/lib/admin/reorder";
import { formatDate, formatDateTime } from "@/lib/format";
import { tr } from "@/lib/types";
import type { Column, Option, ResourceDef, Row } from "@/lib/admin/types";
import { useAdmin } from "./AdminProvider";
import { DataTable, type DTColumn } from "./DataTable";
import { ImportDialog } from "./ImportDialog";
import { ResourceForm } from "./ResourceForm";
import { Badge, Button, ConfirmDialog, inputCls, Modal, PageHeader, Switch, type Tone } from "./ui";

interface Props {
  res: ResourceDef;
  /** filters always applied (e.g. olympiad_id for registrations) */
  fixed?: Record<string, string>;
  embedded?: boolean;
  /** extra buttons next to the header actions */
  extraActions?: ReactNode;
}

export function ResourceList({ res, fixed, embedded, extraActions }: Props) {
  const { t, L, lang, session, toast } = useAdmin();
  const router = useRouter();
  const writable = !!session && canWrite(res, session.role);
  const pageSize = res.pageSize ?? 15;

  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [sort, setSort] = useState(res.sort.field);
  const [dir, setDir] = useState<"asc" | "desc">(res.sort.dir);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [data, setData] = useState<{ rows: Row[]; total: number }>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busyDel, setBusyDel] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refs, setRefs] = useState<Record<string, Record<string, string>>>({});
  const reqId = useRef(0);

  const fixedKey = JSON.stringify(fixed ?? {});

  useEffect(() => {
    const h = setTimeout(() => {
      setDq(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  // relation lookups (ids -> titles) for ref columns and ref filters
  useEffect(() => {
    const keys = new Set<string>();
    res.columns.forEach((c) => c.ref && keys.add(c.ref));
    res.filters?.forEach((f) => f.ref && keys.add(f.ref));
    keys.forEach(async (k) => {
      const rr = getResource(k);
      if (!rr) return;
      try {
        const out = await api.list(k, { all: true });
        setRefs((s) => ({ ...s, [k]: Object.fromEntries(out.rows.map((r) => [String(r.id), tr(r[rr.titleField] as never, lang) || String(r.id)])) }));
      } catch {
        /* ignore */
      }
    });
  }, [res, lang]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const out = await api.list(res.key, {
        q: dq,
        sort,
        dir,
        page: view === "kanban" ? 1 : page,
        pageSize: view === "kanban" ? 200 : pageSize,
        filters: { ...filters, ...(fixed ?? {}) },
      });
      if (id === reqId.current) setData(out);
    } catch (e) {
      if (id === reqId.current) toast(e instanceof Error ? e.message : t("networkError"), "error");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.key, dq, sort, dir, page, pageSize, filters, fixedKey, view]);

  useEffect(() => {
    load();
  }, [load]);

  const fieldOf = (name: string) => res.fields.find((f) => f.name === name);
  const optionsOf = (name: string): Option[] | undefined => fieldOf(name)?.options ?? res.filters?.find((f) => f.name === name)?.options;

  function toggleSort(key: string) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
    setPage(1);
  }

  /** optimistic single-field update (active toggle, kanban move) */
  async function patchField(row: Row, field: string, v: unknown) {
    const prev = data.rows;
    setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, [field]: v } : r)) }));
    try {
      await api.update(res.key, row.id, { [field]: v });
      toast(t("saved"));
    } catch (e) {
      setData((d) => ({ ...d, rows: prev }));
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    }
  }

  const hasFilter = Object.values(filters).some(Boolean);
  const reorderable = writable && res.fields.some((f) => f.name === "sort_order") && sort === "sort_order" && dir === "asc" && !dq && !hasFilter;
  async function reorder(fromId: string | number, toId: string | number) {
    const rows = data.rows;
    const from = rows.findIndex((r) => r.id === fromId);
    const to = rows.findIndex((r) => r.id === toId);
    const next = moveItem(rows, from, to);
    if (next === rows) return;
    const base = (page - 1) * pageSize;
    const updated = next.map((r, i) => ({ ...r, sort_order: base + i + 1 }));
    setData((d) => ({ ...d, rows: updated }));
    try {
      await Promise.all(updated.map((r, i) => (rows.find((x) => x.id === r.id)?.sort_order !== r.sort_order ? api.update(res.key, r.id, { sort_order: base + i + 1 }) : null)));
      toast(t("reordered"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("networkError"), "error");
      load();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyDel(true);
    try {
      await api.remove(res.key, deleting.id);
      toast(t("deleted"));
      setDeleting(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    } finally {
      setBusyDel(false);
    }
  }

  const colLabel = (c: Column) => {
    const own = c.label ?? fieldOf(c.name)?.label;
    if (own) return L(own);
    const k = `col_${c.name}` as UIKey;
    return k in UI ? t(k) : c.name;
  };
  const fmtDate = (v: unknown, withTime: boolean) => {
    if (!v) return "—";
    const d = new Date(String(v));
    if (isNaN(+d)) return String(v);
    return withTime ? formatDateTime(lang, d, { month: "short" }) : formatDate(lang, d, { month: "short" });
  };

  function cell(c: Column, row: Row): ReactNode {
    const v = row[c.name];
    switch (c.kind) {
      case "loc":
        return <span className="line-clamp-2 max-w-xs font-medium">{tr(v as never, lang) || "—"}</span>;
      case "bool":
        if (c.name === res.activeField && writable) return <Switch checked={!!v} onChange={(x) => patchField(row, c.name, x)} label={colLabel(c)} />;
        return <Badge tone={v ? "green" : "gray"}>{v ? t("yes") : t("no")}</Badge>;
      case "date":
        return fmtDate(v, false);
      case "datetime":
        return <span className="whitespace-nowrap">{fmtDate(v, true)}</span>;
      case "image":
        // eslint-disable-next-line @next/next/no-img-element
        return v ? <img src={String(v)} alt="" className="size-9 rounded-lg object-cover" /> : <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-300 dark:bg-slate-800">—</span>;
      case "badge": {
        const o = optionsOf(c.name)?.find((x) => x.value === String(v));
        return v ? <Badge tone={(o?.tone as Tone) ?? "gray"}>{o ? L(o.label) : String(v)}</Badge> : "—";
      }
      case "num":
        return v === null || v === undefined || v === "" ? "—" : String(v);
      case "score":
        return v === null || v === undefined ? "—" : `${v}${row.max_score ? ` / ${row.max_score}` : ""}`;
      case "json": {
        const s = v ? JSON.stringify(v) : "";
        return s ? <code className="line-clamp-2 max-w-xs break-all text-[11px] text-slate-500" title={s}>{s}</code> : "—";
      }
      case "list":
        return Array.isArray(v) ? v.join(", ") : "—";
      case "ref":
        return refs[c.ref!]?.[String(v)] ?? "…";
      default:
        return <span className="max-w-xs truncate">{v === null || v === undefined || v === "" ? "—" : String(v)}</span>;
    }
  }

  const columns: DTColumn<Row>[] = res.columns.map((c) => ({
    key: c.name,
    header: c.kind === "image" ? "" : colLabel(c),
    sortable: c.sortable,
    render: (row) => cell(c, row),
  }));

  const openRow = (row: Row) => {
    if (res.detail) router.push(`/admin/${res.key}/${row.id}`);
    else setEditing(row);
  };

  async function runExport(kind: "csv" | "xlsx") {
    try {
      const out = await api.list(res.key, { q: dq, sort, dir, all: true, filters: { ...filters, ...(fixed ?? {}) } });
      if (out.total > out.rows.length) toast(t("exportTruncated"), "info");
      const cols = res.columns.filter((c) => c.kind !== "image");
      const text = (c: Column, r: Row): string | number => {
        const v = r[c.name];
        if (v === null || v === undefined) return "";
        if (c.kind === "loc") return tr(v as never, "uz");
        if (c.kind === "badge") {
          const o = optionsOf(c.name)?.find((x) => x.value === String(v));
          return o ? o.label.uz : String(v);
        }
        if (c.kind === "ref") return refs[c.ref!]?.[String(v)] ?? String(v);
        if (c.kind === "bool") return v ? "yes" : "no";
        if (typeof v === "number") return v;
        return String(v);
      };
      // include every read-only detail field (birth date, school, extra phone...) in the export too
      const extra = res.fields.filter(
        (f) => f.readOnly && !cols.some((c) => c.name === f.name) && !["localized", "localizedArea", "image", "imageList", "repeater", "group"].includes(f.type),
      );
      const header = [...cols.map((c) => L(c.label ?? fieldOf(c.name)?.label) || c.name), ...extra.map((f) => L(f.label))];
      const rows = out.rows.map((r) => [...cols.map((c) => text(c, r)), ...extra.map((f) => (r[f.name] == null ? "" : String(r[f.name])))]);
      const name = `${res.key}-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "csv") exportCsv(name, header, rows);
      else await exportXlsx(name, header, rows, res.key);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    }
  }

  const clearValue = res.clearBy ? filters[res.clearBy] : undefined;
  async function clearAll() {
    if (!res.clearBy || !clearValue) return;
    try {
      const r = await api.clear(res.key, res.clearBy, clearValue);
      toast(`${t("cleared")}: ${r.deleted}`);
      setClearOpen(false);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    }
  }

  const canCreate = writable && res.canCreate !== false && !res.singleton;
  // Word/PDF import: quizzes (super_admin + methodist) and psych tests (super_admin + psychologist) = their write roles
  const importKind = !embedded && canCreate ? (res.key === "academic_quizzes" ? "quiz" : res.key === "psych_tests" ? "psych" : res.key === "surveys" ? "survey" : res.key === "game_content_sets" ? "game" : null) : null;
  const canEdit = res.canEdit !== false;
  const canDelete = !!session && canDeleteRow(res, session.role) && res.canDelete !== false;

  const filterBar = useMemo(
    () =>
      res.filters?.map((f) => {
        const opts: { value: string; label: string }[] = f.ref
          ? Object.entries(refs[f.ref] ?? {}).map(([value, label]) => ({ value, label }))
          : (f.options ?? []).map((o) => ({ value: o.value, label: L(o.label) }));
        return (
          <select
            key={f.name}
            aria-label={L(f.label)}
            className={cn(inputCls, "w-auto min-w-32 max-w-56 py-1.5")}
            value={filters[f.name] ?? ""}
            onChange={(e) => {
              setFilters((s) => ({ ...s, [f.name]: e.target.value }));
              setPage(1);
            }}
          >
            <option value="">
              {L(f.label)}: {t("all")}
            </option>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [res, refs, filters, lang],
  );

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input className={cn(inputCls, "pl-9")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("search")} />
      </div>
      {filterBar}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {res.kanban && (
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
            <button className={cn("rounded-md p-1.5", view === "table" ? "bg-indigo-600 text-white" : "text-slate-500")} onClick={() => setView("table")} title={t("table")} aria-label={t("table")}>
              <Table2 className="size-4" />
            </button>
            <button className={cn("rounded-md p-1.5", view === "kanban" ? "bg-indigo-600 text-white" : "text-slate-500")} onClick={() => setView("kanban")} title={t("kanban")} aria-label={t("kanban")}>
              <Columns3 className="size-4" />
            </button>
          </div>
        )}
        {res.exportable && (
          <>
            <Button size="sm" onClick={() => runExport("csv")}>
              <Download className="size-4" /> CSV
            </Button>
            <Button size="sm" onClick={() => runExport("xlsx")}>
              <Download className="size-4" /> XLSX
            </Button>
          </>
        )}
        {res.clearBy && writable && (
          <Button size="sm" variant="danger" disabled={!clearValue} title={!clearValue ? t("selectGameFirst") : undefined} onClick={() => setClearOpen(true)}>
            <Eraser className="size-4" /> {t("clearBoard")}
          </Button>
        )}
        {extraActions}
      </div>
    </div>
  );

  const actions = (row: Row) => (
    <>
      {res.detail === "survey" && (
        <Link href={`/admin/surveys/${row.id}/results`} className="inline-flex size-8 items-center justify-center rounded-lg text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("surveyResultsLink")} title={t("surveyResultsLink")}>
          <BarChart3 className="size-4" />
        </Link>
      )}
      {res.detail && (
        <Link href={`/admin/${res.key}/${row.id}`} className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("edit")}>
          <ExternalLink className="size-4" />
        </Link>
      )}
      {!res.detail && canEdit && (
        <Button size="icon" variant="ghost" onClick={() => setEditing(row)} aria-label={t("edit")}>
          <Pencil className="size-4" />
        </Button>
      )}
      {canDelete && (
        <Button size="icon" variant="ghost" onClick={() => setDeleting(row)} aria-label={t("delete")}>
          <Trash2 className="size-4 text-red-500" />
        </Button>
      )}
    </>
  );

  const editorReadOnly = !writable || res.canEdit === false;

  return (
    <div>
      {!embedded && (
        <PageHeader
          title={L(res.label)}
          subtitle={!writable ? t("readOnly") : undefined}
          actions={
            canCreate && (
              <>
                {importKind && (
                  <Button onClick={() => setImportOpen(true)}>
                    <FileUp className="size-4" /> {t("imp_button")}
                  </Button>
                )}
                <Button variant="primary" onClick={() => (res.detail ? router.push(`/admin/${res.key}/new`) : setEditing("new"))}>
                  <Plus className="size-4" /> {t("create")}
                </Button>
              </>
            )
          }
        />
      )}
      {embedded && canCreate && (
        <div className="mb-3 flex justify-end">
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> {t("create")}
          </Button>
        </div>
      )}
      {toolbar}

      {view === "kanban" && res.kanban ? (
        <Kanban
          rows={data.rows}
          field={res.kanban.field}
          loading={loading}
          writable={writable}
          onOpen={(r) => setEditing(r)}
          onMove={(r, v) => patchField(r, res.kanban!.field, v)}
          optionsOf={optionsOf}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={data.rows}
          loading={loading}
          sort={sort}
          dir={dir}
          onSort={toggleSort}
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPage={setPage}
          onReorder={reorderable ? reorder : undefined}
          onRowClick={res.canEdit === false ? undefined : openRow}
          actions={canDelete || canEdit || res.detail ? actions : undefined}
        />
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} side wide title={editing === "new" ? `${t("create")}: ${L(res.singular)}` : L(res.singular)}>
        {editing !== null && (
          <ResourceForm
            res={res}
            initial={editing === "new" ? null : editing}
            parent={fixed && res.parent && fixed[res.parent.field] ? { field: res.parent.field, id: fixed[res.parent.field] } : undefined}
            readOnly={editorReadOnly}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busyDel}
        text={deleting ? `${tr(deleting[res.titleField] as never, lang) || String(deleting[res.titleField] ?? deleting.id)} — ${t("confirmDeleteText")}` : undefined}
      />
      <ConfirmDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={clearAll} text={t("clearBoardConfirm")} confirmLabel={t("clearBoard")} />
      {importKind && importOpen && <ImportDialog kind={importKind} open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />}
    </div>
  );
}

function Kanban({
  rows,
  field,
  loading,
  writable,
  onOpen,
  onMove,
  optionsOf,
}: {
  rows: Row[];
  field: string;
  loading: boolean;
  writable: boolean;
  onOpen: (r: Row) => void;
  onMove: (r: Row, v: string) => void;
  optionsOf: (n: string) => Option[] | undefined;
}) {
  const { L, t, lang } = useAdmin();
  const opts = optionsOf(field) ?? [];
  const [overCol, setOverCol] = useState<string | null>(null);
  const border: Record<string, string> = {
    blue: "border-t-sky-500",
    amber: "border-t-amber-500",
    violet: "border-t-violet-500",
    green: "border-t-emerald-500",
    red: "border-t-red-500",
    gray: "border-t-slate-400",
  };
  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-3", loading && "opacity-60")}>
      {opts.map((o) => {
        const items = rows.filter((r) => r[field] === o.value);
        return (
          <div
            key={o.value}
            onDragOver={writable ? (e) => { e.preventDefault(); setOverCol(o.value); } : undefined}
            onDragLeave={() => setOverCol((c) => (c === o.value ? null : c))}
            onDrop={
              writable
                ? (e) => {
                    e.preventDefault();
                    setOverCol(null);
                    const id = e.dataTransfer.getData("text/plain");
                    const r = rows.find((x) => String(x.id) === id);
                    if (r && r[field] !== o.value) onMove(r, o.value);
                  }
                : undefined
            }
            className={cn("w-72 shrink-0 rounded-2xl border border-t-4 border-slate-200 bg-slate-50 p-2.5 transition dark:border-slate-800 dark:bg-slate-900/60", border[o.tone ?? "gray"], overCol === o.value && "ring-2 ring-indigo-400")}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold">{L(o.label)}</span>
              <Badge>{items.length}</Badge>
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <div
                  key={r.id}
                  draggable={writable}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(r.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <button className="block w-full text-left" onClick={() => onOpen(r)}>
                    <div className="font-medium">{String(r.parent_name)}</div>
                    <div className="text-xs text-slate-500">
                      {String(r.child_name ?? "")} · {String(r.target_grade ?? "")} · {String(r.phone)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{formatDate(lang, String(r.created_at), { month: "short" })}</div>
                  </button>
                  {writable && (
                    <select className={cn(inputCls, "mt-2 py-1 text-xs")} value={String(r[field])} aria-label={t("status")} onChange={(e) => onMove(r, e.target.value)}>
                      {opts.map((x) => (
                        <option key={x.value} value={x.value}>
                          {L(x.label)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-400">{t("noData")}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
