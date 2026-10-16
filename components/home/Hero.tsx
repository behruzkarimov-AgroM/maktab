"use client";

import { m as motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";
import type { SiteSettingsData } from "@/lib/demo-data";
import { tr } from "@/lib/types";
import { AdmissionDialog } from "@/components/public/AdmissionDialog";
import { GradientText, usePublic } from "@/components/public/ui";

function Scene() {
  const stars = Array.from({ length: 28 }, (_, i) => ({ x: (i * 97) % 1000, y: (i * 53) % 420, d: 2 + (i % 5), r: 1 + (i % 3) }));
  return (
    <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#457b9d" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f4b942" stopOpacity="0.10" className="dark:[stop-opacity:0.03]" />
        </linearGradient>
        <linearGradient id="bld" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d3557" />
          <stop offset="1" stopColor="#457b9d" />
        </linearGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#sky)" />
      {stars.map((s, i) => (
        <motion.circle key={i} cx={s.x} cy={s.y} r={s.r} fill="currentColor" className="text-indigo-400 dark:text-white"
          animate={{ opacity: [0.15, 0.9, 0.15] }} transition={{ duration: s.d, repeat: Infinity, delay: i * 0.13 }} />
      ))}
      <motion.circle cx="840" cy="130" r="54" fill="#f4b942" opacity="0.9" animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 6, repeat: Infinity }} style={{ transformOrigin: "840px 130px" }} />
      {/* hills */}
      <path d="M0 480 Q250 400 500 470 T1000 440 V600 H0Z" fill="#8fbbd4" opacity="0.4" />
      <path d="M0 520 Q300 460 600 515 T1000 500 V600 H0Z" fill="#457b9d" opacity="0.4" />
      {/* floating learning icons: kept to the side gutters so they never sit behind the headline */}
      {[
        { t: "π", x: 90, y: 230, c: "#e0a22a" }, { t: "∑", x: 860, y: 300, c: "#2fb98f" },
        { t: "A+", x: 120, y: 400, c: "#f4b942" }, { t: "</>", x: 800, y: 440, c: "#5fa8d3" },
        { t: "E=mc²", x: 700, y: 190, c: "#457b9d" },
      ].map((f, i) => (
        <motion.text key={f.t} x={f.x} y={f.y} fill={f.c} fontSize="34" fontWeight="700" opacity="0.8"
          animate={{ y: [f.y, f.y - 24, f.y], rotate: [-4, 4, -4] }} transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}>
          {f.t}
        </motion.text>
      ))}
    </svg>
  );
}

/** The school building lives in its own bottom-anchored box so it can never slide under the headline. */
function School() {
  return (
    <svg viewBox="-10 -40 420 320" preserveAspectRatio="xMidYMax meet" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[clamp(140px,24svh,240px)] w-full" aria-hidden>
      <defs>
        <linearGradient id="bld" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d3557" />
          <stop offset="1" stopColor="#457b9d" />
        </linearGradient>
      </defs>
      <rect x="0" y="80" width="400" height="190" rx="10" fill="url(#bld)" opacity="0.92" />
      <polygon points="130,80 200,10 270,80" fill="#14253f" />
      <rect x="170" y="130" width="60" height="140" rx="6" fill="#f8cf63" opacity="0.9" />
      {[30, 90, 270, 330].map((x) => (
        <motion.rect key={x} x={x} y="120" width="38" height="46" rx="5" fill="#fef3c7"
          animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 3 + (x % 4), repeat: Infinity }} />
      ))}
      {[30, 90, 270, 330].map((x) => <rect key={"b" + x} x={x} y="195" width="38" height="46" rx="5" fill="#fef3c7" opacity="0.7" />)}
      <circle cx="200" cy="50" r="14" fill="#fff" opacity="0.9" />
      <line x1="200" y1="10" x2="200" y2="-30" stroke="#fff" strokeWidth="3" />
      <motion.polygon points="200,-30 240,-18 200,-6" fill="#f4b942" animate={{ skewY: [0, 6, 0] }} transition={{ duration: 2, repeat: Infinity }} />
    </svg>
  );
}

export function Hero({ settings }: { settings: SiteSettingsData }) {
  const { locale, t } = usePublic();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const op = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative isolate flex min-h-[100svh] items-center overflow-hidden px-4 pb-[calc(clamp(140px,24svh,240px)+2.5rem)] pt-28 sm:px-6 sm:pt-32">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50 via-white to-white dark:from-background dark:via-background dark:to-surface" />
      {settings.hero_video_url ? (
        <>
          <video className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40 dark:opacity-30" src={settings.hero_video_url} autoPlay muted loop playsInline poster={settings.hero_image_url ?? undefined} />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/60 to-white dark:from-background/70 dark:to-background" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 -z-10 text-indigo-300"><Scene /></div>
          <School />
        </>
      )}
      <motion.div style={{ y, opacity: op }} className="mx-auto w-full max-w-5xl text-center">
        <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="inline-block rounded-full border border-indigo-500/30 bg-white/60 px-4 py-1.5 text-sm font-medium text-indigo-700 backdrop-blur dark:bg-white/10 dark:text-indigo-200">
          {t("heroBadge")}
        </motion.span>
        <motion.h1 initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7 }}
          className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 dark:text-white sm:text-7xl">
          <GradientText>{tr(settings.hero_title, locale)}</GradientText>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-slate-700 dark:text-slate-300 sm:text-xl">
          {tr(settings.hero_subtitle, locale)}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-3 text-sm font-semibold uppercase tracking-[0.25em] text-violet-600 dark:text-violet-300">
          {t("heroSlogan")}
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <AdmissionDialog type="admission" />
          <AdmissionDialog type="campus_tour" ghost />
        </motion.div>
      </motion.div>
      <motion.div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-indigo-500" animate={{ y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity }} aria-hidden>
        <ChevronDown className="h-7 w-7" />
      </motion.div>
    </section>
  );
}
