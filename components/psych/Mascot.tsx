"use client";
import { m as motion } from "framer-motion";

/** Lottie-like animated SVG: floating blob with blinking eyes and twinkling stars (pure SVG + framer-motion). */
export function Mascot({ mood = "happy", size = 120 }: { mood?: "happy" | "think" | "celebrate"; size?: number }) {
  const stars = [
    { x: 14, y: 22, d: 0 },
    { x: 104, y: 18, d: 0.6 },
    { x: 110, y: 78, d: 1.1 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-hidden className="overflow-visible">
      {stars.map((s, i) => (
        <motion.path
          key={i}
          d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z"
          fill="#f4b942"
          transform={`translate(${s.x} ${s.y})`}
          animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.5, 1, 0.5], rotate: [0, 40, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: s.d, ease: "easeInOut" }}
          style={{ transformOrigin: `${s.x}px ${s.y}px`, transformBox: "fill-box" }}
        />
      ))}
      <motion.g animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        <motion.ellipse
          cx="60"
          cy="64"
          rx="36"
          ry="34"
          fill="#7fb0dc"
          animate={{ rx: [36, 38, 36], ry: [34, 32, 34] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <ellipse cx="46" cy="50" rx="9" ry="5" fill="#fff" opacity="0.35" />
        {[48, 72].map((cx) => (
          <motion.ellipse
            key={cx}
            cx={cx}
            cy="62"
            rx="5"
            ry="7"
            fill="#1d3557"
            animate={{ ry: [7, 7, 0.8, 7] }}
            transition={{ duration: 4, repeat: Infinity, times: [0, 0.9, 0.95, 1] }}
          />
        ))}
        <circle cx="38" cy="76" r="5" fill="#f8cf63" opacity="0.8" />
        <circle cx="82" cy="76" r="5" fill="#f8cf63" opacity="0.8" />
        {mood === "think" ? (
          <path d="M52 80 Q60 78 68 80" stroke="#1d3557" strokeWidth="3" strokeLinecap="round" fill="none" />
        ) : mood === "celebrate" ? (
          <path d="M48 76 Q60 94 72 76 Z" fill="#1d3557" />
        ) : (
          <path d="M50 77 Q60 88 70 77" stroke="#1d3557" strokeWidth="3" strokeLinecap="round" fill="none" />
        )}
      </motion.g>
    </svg>
  );
}
