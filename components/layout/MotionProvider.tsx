"use client";

import { LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

/**
 * Honors prefers-reduced-motion for every framer-motion animation (transforms/layout are skipped).
 * Components use the lightweight `m` element; the animation engine (domMax) is fetched after hydration
 * so it does not count towards first-load JS.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
