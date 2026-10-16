"use client";

import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "accent" | "outline" | "ghost" | "glass";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none " +
  "transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 " +
  "focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40",
  secondary:
    "bg-secondary text-secondary-foreground shadow-lg shadow-secondary/30 hover:-translate-y-0.5 hover:shadow-xl",
  accent:
    "bg-accent text-accent-foreground shadow-lg shadow-accent/40 hover:-translate-y-0.5 hover:shadow-xl",
  outline:
    "border-2 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary",
  ghost: "text-foreground hover:bg-muted",
  glass: "glass text-foreground hover:bg-surface/80",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-base",
  lg: "h-14 px-8 text-lg",
  icon: "h-10 w-10 p-0",
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { href?: undefined };
type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps | "href"> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

const isExternal = (href: string) => /^(https?:|mailto:|tel:|#)/.test(href);

/**
 * Button. Pass `href` to render a link: internal paths use the locale-aware Link
 * (so "/about" becomes "/uz/about"), external/mailto/tel/# use a plain <a>.
 */
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(
  props,
  ref,
) {
  const { variant = "primary", size = "md", className, children, ...rest } = props;
  const classes = buttonClasses(variant, size, className);

  if (typeof (rest as { href?: string }).href === "string") {
    const { href, ...anchorProps } = rest as ButtonAsLink;
    if (isExternal(href)) {
      const external = /^https?:/.test(href);
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={classes}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          {...anchorProps}
        >
          {children}
        </a>
      );
    }
    return (
      <Link ref={ref as React.Ref<HTMLAnchorElement>} href={href} className={classes} {...anchorProps}>
        {children}
      </Link>
    );
  }

  const { type = "button", ...buttonProps } = rest as ButtonAsButton;
  return (
    <button ref={ref as React.Ref<HTMLButtonElement>} type={type} className={classes} {...buttonProps}>
      {children}
    </button>
  );
});
