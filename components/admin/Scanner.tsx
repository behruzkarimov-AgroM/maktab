"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, ShieldOff, XCircle } from "lucide-react";
import { cn } from "@/lib/admin/cn";
import { api } from "@/lib/admin/api";
import { tr } from "@/lib/types";
import { useAdmin } from "./AdminProvider";
import { Button, Card, inputCls, PageHeader } from "./ui";

interface Detector {
  detect(src: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (o: { formats: string[] }) => Detector;

interface Participant {
  ticket: string;
  name: string;
  subject: string;
  grade: number | string;
  olympiad: string | null;
}
interface Result {
  kind: "ok" | "duplicate" | "unknown" | "disqualified" | "error";
  participant?: Participant;
  ticket?: string;
  at: number;
}

export function Scanner() {
  const { t, session } = useAdmin();
  const [manual, setManual] = useState("");
  const [cam, setCam] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const seen = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [olys, setOlys] = useState<{ id: string; title: string }[]>([]);
  const [olyId, setOlyId] = useState("");
  const olyRef = useRef("");
  const { lang } = useAdmin();

  useEffect(() => {
    api
      .list("olympiads", { all: true })
      .then((r) => setOlys(r.rows.map((o) => ({ id: String(o.id), title: tr(o.title as never, lang) || String(o.id) }))))
      .catch(() => setOlys([]));
  }, [lang]);

  const submit = useCallback(async (ticket: string) => {
    if (!olyRef.current) return;
    setBusy(true);
    let r: Result;
    try {
      const res = await fetch("/api/admin/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket, olympiad_id: olyRef.current }) });
      const b = (await res.json().catch(() => ({}))) as { participant?: Participant; code?: string; ticket?: string };
      r = res.ok
        ? { kind: "ok", participant: b.participant, at: Date.now() }
        : { kind: b.code === "duplicate" || b.code === "disqualified" || b.code === "unknown" ? b.code : "error", participant: b.participant, ticket: b.ticket ?? ticket, at: Date.now() };
    } catch {
      r = { kind: "error", ticket, at: Date.now() };
    }
    setLast(r);
    setHistory((h) => [r, ...h].slice(0, 10));
    setBusy(false);
  }, []);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((x) => x.stop());
    stream.current = null;
    setCam(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      stream.current = s;
      setCam(true);
      const det = new Ctor({ formats: ["qr_code"] });
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      });
      const tick = async () => {
        if (!stream.current) return;
        try {
          if (video.current && video.current.readyState >= 2) {
            const codes = await det.detect(video.current);
            const v = codes[0]?.rawValue;
            if (v && !(seen.current.code === v && Date.now() - seen.current.at < 4000)) {
              seen.current = { code: v, at: Date.now() };
              await submit(v);
            }
          }
        } catch {
          /* ignore frame errors */
        }
        setTimeout(tick, 350);
      };
      tick();
    } catch {
      setSupported(false);
    }
  }

  if (!session || (session.role !== "super_admin" && session.role !== "methodist"))
    return (
      <Card className="p-10 text-center text-sm">
        <ShieldOff className="mx-auto mb-2 size-8 text-slate-400" />
        {t("noAccessText")}
      </Card>
    );

  const meta = {
    ok: { icon: CheckCircle2, cls: "border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100", label: t("scanOk") },
    duplicate: { icon: AlertTriangle, cls: "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100", label: t("scanDuplicate") },
    disqualified: { icon: XCircle, cls: "border-red-400 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100", label: t("scanDisq") },
    unknown: { icon: XCircle, cls: "border-red-400 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100", label: t("scanUnknown") },
    error: { icon: XCircle, cls: "border-red-400 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100", label: t("networkError") },
  } as const;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("scanTitle")} />
      <label className="mb-3 block text-sm font-medium">
        {t("scanOlympiad")}
        <select
          className={cn(inputCls, "mt-1")}
          value={olyId}
          onChange={(e) => {
            setOlyId(e.target.value);
            olyRef.current = e.target.value;
          }}
        >
          <option value="">{t("scanPickOlympiad")}</option>
          {olys.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </label>
      <Card className="mb-4 overflow-hidden">
        <div className={cn("relative aspect-video bg-slate-900", !cam && "flex items-center justify-center")}>
          {cam ? (
            <>
              <video ref={video} playsInline muted className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80" />
            </>
          ) : (
            <CameraOff className="size-10 text-slate-600" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          {cam ? (
            <Button onClick={stop}>
              <CameraOff className="size-4" /> {t("scanStop")}
            </Button>
          ) : (
            <Button variant="primary" onClick={start}>
              <Camera className="size-4" /> {t("scanStart")}
            </Button>
          )}
          {!supported && <p className="text-xs text-amber-600">{t("scanNoCamera")}</p>}
        </div>
      </Card>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void submit(manual.trim()).then(() => setManual(""));
        }}
      >
        <input className={cn(inputCls, "font-mono uppercase")} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("scanManual")} aria-label={t("scanManual")} />
        <Button type="submit" variant="primary" loading={busy}>
          {t("scanCheckin")}
        </Button>
      </form>

      {last && (
        <div className={cn("mb-4 rounded-2xl border-2 p-4", meta[last.kind].cls)} role="status">
          <div className="flex items-center gap-2 text-lg font-bold">
            {(() => {
              const I = meta[last.kind].icon;
              return <I className="size-6" />;
            })()}
            {meta[last.kind].label}
          </div>
          {last.participant ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="opacity-70">{t("scanFullName")}</dt>
              <dd className="font-semibold">{last.participant.name}</dd>
              <dt className="opacity-70">{t("ticket")}</dt>
              <dd className="font-mono">{last.participant.ticket}</dd>
              <dt className="opacity-70">{t("scanSubject")}</dt>
              <dd>{last.participant.subject}</dd>
              <dt className="opacity-70">{t("scanGrade")}</dt>
              <dd>{last.participant.grade}</dd>
              {last.participant.olympiad && (
                <>
                  <dt className="opacity-70">{t("scanOlympiad")}</dt>
                  <dd>{last.participant.olympiad}</dd>
                </>
              )}
            </dl>
          ) : (
            last.ticket && <p className="mt-1 font-mono text-sm">{last.ticket}</p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">{t("scanHistory")}</h3>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                <span className="truncate">{h.participant?.name ?? h.ticket}</span>
                <span className="shrink-0 text-xs text-slate-500">{meta[h.kind].label}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
