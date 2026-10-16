"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/admin/cn";
import { useAdmin } from "./AdminProvider";
import { Button, EmptyState, Spinner } from "./ui";

export interface DTColumn<T> {
  key: string;
  header: ReactNode;
  sortable?: boolean;
  className?: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  loading,
  sort,
  dir,
  onSort,
  page,
  pageSize,
  total,
  onPage,
  onRowClick,
  actions,
  onReorder,
}: {
  /** when set, rows can be dragged (native HTML5 DnD) */
  onReorder?: (fromId: string | number, toId: string | number) => void;
  columns: DTColumn<T>[];
  rows: T[];
  loading?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
  onSort?: (key: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => ReactNode;
}) {
  const { t } = useAdmin();
  const dragId = useRef<string | number | null>(null);
  const [over, setOver] = useState<string | number | null>(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="relative overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              {onReorder && <th className="w-8 px-2"><span className="sr-only">{t("reorder")}</span></th>}
              {columns.map((c) => (
                <th key={c.key} className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", c.className)} aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.sortable && onSort ? (
                    <button className="inline-flex items-center gap-1 uppercase hover:text-slate-900 dark:hover:text-slate-100" onClick={() => onSort(c.key)}>
                      {c.header}
                      {sort === c.key ? dir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-40" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {actions && <th className="px-3 py-2.5 text-right font-semibold">{t("actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                draggable={!!onReorder}
                onDragStart={onReorder ? (e) => { dragId.current = row.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(row.id)); } : undefined}
                onDragOver={onReorder ? (e) => { e.preventDefault(); setOver(row.id); } : undefined}
                onDragLeave={onReorder ? () => setOver((o) => (o === row.id ? null : o)) : undefined}
                onDragEnd={onReorder ? () => { dragId.current = null; setOver(null); } : undefined}
                onDrop={onReorder ? (e) => { e.preventDefault(); const f = dragId.current; dragId.current = null; setOver(null); if (f !== null && f !== row.id) onReorder(f, row.id); } : undefined}
                className={cn("transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40", onRowClick && "cursor-pointer", over === row.id && "bg-indigo-50 outline outline-1 -outline-offset-1 outline-indigo-400 dark:bg-indigo-950/40")}
              >
                {onReorder && (
                  <td className="w-8 cursor-grab px-2 text-slate-400 active:cursor-grabbing" title={t("dragHint")}>
                    <GripVertical className="size-4" />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2.5 align-middle text-slate-700 dark:text-slate-200", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <EmptyState>{t("noData")}</EmptyState>}
        {loading && (
          <div className={cn("flex items-center justify-center gap-2 py-8 text-sm text-slate-500", rows.length > 0 && "absolute inset-0 bg-white/60 dark:bg-slate-900/60")}>
            <Spinner /> {rows.length === 0 && t("loading")}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>
          {total} {t("rows")}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("prev")}>
            <ChevronLeft className="size-4" />
          </Button>
          <span>
            {t("page")} {page} {t("of")} {pages}
          </span>
          <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("next")}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
