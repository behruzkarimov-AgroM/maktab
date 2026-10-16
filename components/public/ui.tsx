"use client";

import { animate, m as motion, useInView, type HTMLMotionProps } from "framer-motion";
import clsx from "clsx";
import {
  Award, Bot, BookOpen, Code2, Cpu, FlaskConical, Globe, GraduationCap, Heart, Languages,
  Palette, Rocket, ShieldCheck, Sprout, Trophy, Users, Sparkles, type LucideIcon,
} from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/types";
import { makeT } from "./i18n";

export function usePublic() {
  const locale = useLocale() as Locale;
  const t = makeT(locale);
  const href = (p: string) => p; // locale prefix is added by the locale-aware Link
  return { locale, t, href };
}

const ICONS: Record<string, LucideIcon> = {
  sprout: Sprout, rocket: Rocket, graduation: GraduationCap, users: Users, globe: Globe, cpu: Cpu,
  shield: ShieldCheck, heart: Heart, award: Award, book: BookOpen, flask: FlaskConical, code: Code2,
  languages: Languages, bot: Bot, palette: Palette, trophy: Trophy, sparkles: Sparkles,
};
export function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Sparkles;
  return <C className={className} aria-hidden />;
}

export function Glass({ className, children, hover = true, ...rest }: { hover?: boolean } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      whileHover={hover ? { y: -4 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={clsx(
        "relative overflow-hidden rounded-3xl border border-white/50 bg-white/60 p-6 shadow-[0_8px_32px_rgba(29,53,87,0.09)] backdrop-blur-xl",
        "dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
        hover && "transition-shadow hover:shadow-[0_16px_48px_rgba(29,53,87,0.2)]",
        className
      )}
      {...rest}
    >
      {children as ReactNode}
    </motion.div>
  );
}

export function FadeIn({ children, delay = 0, className, y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Counter({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration: 1.8, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, value]);
  return (
    <span ref={ref} className={className}>
      {formatNumber("ru", n)}
      {suffix}
    </span>
  );
}

export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx("bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-fuchsia-300", className)}>
      {children}
    </span>
  );
}

/** Soft animated page background blobs. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -left-24 top-10 h-96 w-96 rounded-full bg-indigo-400/25 blur-3xl dark:bg-indigo-500/20"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-24 top-64 h-96 w-96 rounded-full bg-fuchsia-400/20 blur-3xl dark:bg-fuchsia-500/15"
        animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export function PageHero({ title, subtitle, badge, children }: { title: string; subtitle?: string; badge?: string; children?: ReactNode }) {
  return (
    <section className="relative px-4 pb-10 pt-32 sm:px-6 sm:pt-36">
      <Backdrop />
      <div className="mx-auto max-w-5xl text-center">
        {badge && (
          <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {badge}
          </motion.span>
        )}
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl">
          <GradientText>{title}</GradientText>
        </motion.h1>
        {subtitle && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
            {subtitle}
          </motion.p>
        )}
        {children}
      </div>
    </section>
  );
}

export function SectionTitle({ title, sub, id }: { title: string; sub?: string; id?: string }) {
  return (
    <FadeIn className="mb-8 text-center" >
      <h2 id={id} className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">{title}</h2>
      {sub && <p className="mx-auto mt-2 max-w-2xl text-slate-600 dark:text-slate-300">{sub}</p>}
    </FadeIn>
  );
}

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("mx-auto max-w-6xl px-4 py-12 sm:px-6", className)}>{children}</section>;
}

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 ring-1 ring-white/10 dark:from-indigo-600 dark:to-violet-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:scale-[1.03] hover:shadow-indigo-500/50 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-full border border-slate-300/70 bg-white/50 px-6 py-3 text-sm font-semibold text-slate-800 backdrop-blur transition hover:scale-[1.03] hover:bg-white/80 active:scale-95 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20";

export function LinkButton({ href, children, ghost }: { href: string; children: ReactNode; ghost?: boolean }) {
  return <Button href={href} variant={ghost ? "glass" : "primary"} size="lg">{children}</Button>;
}

/** Initials avatar used when a photo is missing. */
export function Avatar({ name, src, size = 72 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const AVATAR_GRADIENTS = [
    "linear-gradient(135deg, #1d3557, #457b9d)",
    "linear-gradient(135deg, #264f77, #4f8fb0)",
    "linear-gradient(135deg, #14253f, #2f5f87)",
    "linear-gradient(135deg, #335d7a, #5a8fae)",
    "linear-gradient(135deg, #8a5a00, #c98a12)",
  ];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} loading="lazy" decoding="async" className="rounded-2xl object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold text-white shadow-md"
      style={{ width: size, height: size, fontSize: size / 3, background: AVATAR_GRADIENTS[seed % AVATAR_GRADIENTS.length] }}
    >
      {initials}
    </div>
  );
}

/** Generic modal: Esc to close, scroll lock, backdrop click. */
export function Modal({ open, onClose, children, label, wide }: { open: boolean; onClose: () => void; children: ReactNode; label: string; wide?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const first = items[0];
      const last = items[items.length - 1];
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
    const prev = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      prevFocus?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={clsx(
          "relative max-h-[92vh] w-full overflow-y-auto rounded-3xl outline-none border border-white/30 bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/90",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body
  );
}

