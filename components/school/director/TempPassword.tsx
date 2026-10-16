"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { Button } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { escapeHtml, Modal, printHtml } from "./common";

/** A temporary password is shown ONCE: copy button with feedback, "must change at first login" note, printable slip. */
export function TempPasswordBox({ email, password, demo, name }: { email: string; password: string | null; demo: boolean; name?: string }) {
  const { t } = useSchool();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the password stays selectable on screen */
    }
  }
  function print() {
    if (!password) return;
    const site = typeof window !== "undefined" ? `${window.location.origin}/school/login` : "/school/login";
    printHtml(
      t("a_slip_title"),
      `<div style="max-width:420px;border:2px solid #1d3557;border-radius:10px;padding:18px">
<h1>${escapeHtml(t("a_slip_title"))}</h1><p class="muted">${escapeHtml(t("schoolName"))}</p>
${name ? `<h2>${escapeHtml(name)}</h2>` : ""}
<table><tr><th>${escapeHtml(t("a_slip_url"))}</th><td>${escapeHtml(site)}</td></tr>
<tr><th>${escapeHtml(t("a_slip_login"))}</th><td>${escapeHtml(email)}</td></tr>
<tr><th>${escapeHtml(t("a_tmp_title"))}</th><td style="font:700 16px Consolas,monospace">${escapeHtml(password)}</td></tr></table>
<p class="muted">${escapeHtml(t("a_slip_note"))}</p></div>`,
    );
  }

  return (
    <div className="space-y-3 text-sm" data-testid="temp-password-box">
      <p><span className="text-slate-600 dark:text-slate-400">{t("email")}:</span> <b>{email}</b></p>
      {password ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{t("a_tmp_title")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code data-testid="temp-password" className="select-all rounded bg-white px-2 py-1.5 font-mono text-base dark:bg-slate-900">{password}</code>
            <Button className="min-h-11" onClick={() => void copy()}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? t("a_copied") : t("a_copy")}
            </Button>
            <Button className="min-h-11" onClick={print}><Printer className="size-4" aria-hidden />{t("a_print")}</Button>
          </div>
          <p className="mt-2 text-xs font-medium text-amber-900 dark:text-amber-200">{t("a_tmp_once")}</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{t("a_tmp_must_change")}</p>
          <span role="status" aria-live="polite" className="sr-only">{copied ? t("a_copied") : ""}</span>
        </div>
      ) : (
        <p className="text-xs text-slate-600 dark:text-slate-400">{demo ? t("a_tmp_demo") : t("d_demo_no_password")}</p>
      )}
    </div>
  );
}

/** Modal wrapper (reset password result, account creation result) */
export function TempPasswordModal({ open, title, onClose, ...box }: { open: boolean; title: string; onClose: () => void; email: string; password: string | null; demo: boolean; name?: string }) {
  const { t } = useSchool();
  return (
    <Modal open={open} onClose={onClose} size="sm" title={title} footer={<Button variant="primary" className="min-h-11" onClick={onClose}>{t("close")}</Button>}>
      <TempPasswordBox {...box} />
    </Modal>
  );
}
