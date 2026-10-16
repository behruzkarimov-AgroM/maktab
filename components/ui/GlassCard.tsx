import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlassCardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  hover?: boolean;
  strong?: boolean;
  padded?: boolean;
  children?: ReactNode;
};

/** Frosted-glass surface. Works in light and dark mode. */
export function GlassCard({
  as: Tag = "div",
  hover = false,
  strong = false,
  padded = true,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <Tag
      className={cn(
        strong ? "glass-strong" : "glass",
        "rounded-2xl text-foreground",
        padded && "p-5 sm:p-6",
        hover && "transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
