import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function Logo({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      aria-label="Children's Academy"
      className={cn("group inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap font-display", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-96.png"
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 shrink-0 rounded-full object-cover shadow-lg shadow-primary/30 ring-2 ring-background transition-transform group-hover:rotate-6"
      />
      <span className="text-lg font-extrabold leading-none tracking-tight">
        Children&apos;s<span className="gradient-text"> Academy</span>
      </span>
    </Link>
  );
}
