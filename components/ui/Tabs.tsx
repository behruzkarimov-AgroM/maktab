"use client";

import { m as motion } from "framer-motion";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  label: ReactNode;
  /** Optional panel content; omit if you render the panel yourself based on `value`. */
  content?: ReactNode;
};

type TabsProps = {
  items: TabItem[];
  /** Controlled value. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
  ariaLabel?: string;
};

/** Accessible tabs (roving tabindex, arrow/Home/End keys) with an animated pill. */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  listClassName,
  panelClassName,
  ariaLabel,
}: TabsProps) {
  const uid = useId();
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id);
  const active = value ?? inner;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onValueChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = items[next].id;
    select(id);
    refs.current[id]?.focus();
  };

  const activeItem = items.find((i) => i.id === active);

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn("glass no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1", listClassName)}
      >
        {items.map((item, i) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              role="tab"
              type="button"
              id={`${uid}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "relative shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:px-5",
                selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {selected && (
                <motion.span
                  layoutId={`${uid}-pill`}
                  className="absolute inset-0 -z-0 rounded-full bg-primary shadow-md shadow-primary/30"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </button>
          );
        })}
      </div>
      {activeItem?.content !== undefined && (
        <div
          role="tabpanel"
          id={`${uid}-panel-${activeItem.id}`}
          aria-labelledby={`${uid}-tab-${activeItem.id}`}
          tabIndex={0}
          className={cn("mt-5 outline-none", panelClassName)}
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
