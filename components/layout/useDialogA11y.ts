"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal behaviour for dialogs/drawers: Escape closes, Tab/Shift+Tab stay inside the panel,
 * focus moves into the panel on open and returns to the opener on close, background scroll is locked.
 * `ref` must point at the dialog panel (give it tabIndex={-1} so it can take focus when it has no focusable child).
 */
export function useDialogA11y(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void, opts: { lockScroll?: boolean; escape?: boolean } = {}) {
  const { lockScroll = true, escape = true } = opts;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      const root = ref.current;
      if (root && !root.contains(document.activeElement)) root.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && escape) {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active) || active === root) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      if (lockScroll) document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open, ref, lockScroll, escape]);
}
