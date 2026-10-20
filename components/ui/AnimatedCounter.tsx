"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type AnimatedCounterProps = {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
  className?: string;
};

/** Counts from 0 to `value` the first time it scrolls into view. */
export function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 1.8,
  decimals = 0,
  className,
}: AnimatedCounterProps) {
  const locale = useLocale();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setCurrent(v),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  // reduced motion: jump straight to the final number once visible (derived, no animation state)
  const shown = reduce && inView ? value : current;
  const formatted = formatNumber(locale, shown, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={cn("tabular-nums", className)} aria-label={`${prefix}${value}${suffix}`}>
      <span aria-hidden="true">
        {prefix}
        {formatted}
        {suffix}
      </span>
    </span>
  );
}
