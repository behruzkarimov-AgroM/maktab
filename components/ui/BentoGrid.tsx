import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Responsive bento layout: 1 col (mobile) / 2 (tablet) / 4 (desktop). */
export function BentoGrid({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bento", className)} {...props}>
      {children}
    </div>
  );
}

type BentoItemProps = HTMLAttributes<HTMLDivElement> & {
  /** Column span on tablet/desktop. */
  span?: 1 | 2 | 3;
  /** Spans two rows from tablet up. */
  tall?: boolean;
  /** Glass background (default true). */
  glass?: boolean;
  children?: ReactNode;
};

export function BentoItem({ span = 1, tall = false, glass = true, className, children, ...props }: BentoItemProps) {
  return (
    <div
      className={cn(
        "bento-item",
        glass && "glass",
        span === 2 && "bento-span-2",
        span === 3 && "bento-span-3",
        tall && "bento-row-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
