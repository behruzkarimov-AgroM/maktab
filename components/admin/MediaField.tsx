"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, FileText } from "lucide-react";
import { cn } from "@/lib/admin/cn";
import { useAdmin } from "./AdminProvider";
import { Button, inputCls } from "./ui";

type Bucket = "school-media" | "test-assets" | "certificates";

async function uploadFile(file: File, bucket: Bucket): Promise<{ url: string; local: boolean }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bucket", bucket);
  const r = await fetch("/api/admin/upload", { method: "POST", body: fd });
  if (r.ok) return { url: ((await r.json()) as { url: string }).url, local: false };
  if (r.status === 501) return { url: URL.createObjectURL(file), local: true }; // demo mode
  const b = (await r.json().catch(() => ({}))) as { error?: string };
  throw new Error(b.error ?? r.statusText);
}

const isPdf = (u: string) => /\.pdf($|\?)/i.test(u);

function Preview({ url, className }: { url: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return isPdf(url) ? (
    <div className={cn("flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800", className)}>
      <FileText className="size-6" />
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn("object-cover", className)} />
  );
}

export function MediaField({
  value,
  onChange,
  bucket = "school-media",
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  bucket?: Bucket;
}) {
  const { t, toast } = useAdmin();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadFile(file, bucket);
      onChange(r.url);
      if (r.local) toast(t("uploadDemo"), "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/50">
        {value ? <Preview url={value} className="size-full" /> : <ImagePlus className="size-6" />}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button size="sm" onClick={() => ref.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {t("upload")}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label={t("remove")}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
        <input className={inputCls} value={value && !value.startsWith("blob:") ? value : ""} placeholder={t("pasteUrl")} onChange={(e) => onChange(e.target.value || null)} />
      </div>
    </div>
  );
}

export function ImageListField({ value, onChange, bucket = "school-media" }: { value: string[] | undefined; onChange: (v: string[]) => void; bucket?: Bucket }) {
  const { t, toast } = useAdmin();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const list = value ?? [];

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      let local = false;
      for (const f of Array.from(files)) {
        const r = await uploadFile(f, bucket);
        urls.push(r.url);
        local ||= r.local;
      }
      onChange([...list, ...urls]);
      if (local) toast(t("uploadDemo"), "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("networkError"), "error");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {list.map((u, i) => (
        <div key={u + i} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <Preview url={u} className="size-full" />
          <button
            type="button"
            onClick={() => onChange(list.filter((_, k) => k !== i))}
            aria-label={t("remove")}
            className="absolute right-1 top-1 rounded-md bg-slate-900/70 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="hidden" onChange={(e) => add(e.target.files)} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
        {t("addImage")}
      </button>
    </div>
  );
}
