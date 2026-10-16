"use client";

import { useEffect } from "react";

/** Mounts Lenis smooth scrolling (disabled for prefers-reduced-motion). Renders nothing; the library is fetched on idle. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let raf = 0;
    let destroy: (() => void) | undefined;
    const start = () => {
      void import("lenis").then(({ default: Lenis }) => {
        if (cancelled) return;
        const lenis = new Lenis({ duration: 1.05, smoothWheel: true, anchors: true });
        const loop = (time: number) => {
          lenis.raf(time);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        destroy = () => lenis.destroy();
      });
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle ? idle(start, { timeout: 2000 }) : window.setTimeout(start, 800);
    return () => {
      cancelled = true;
      if (idle) (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
      cancelAnimationFrame(raf);
      destroy?.();
    };
  }, []);
  return null;
}
