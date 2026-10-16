"use client";

import { BoundaryCard } from "@/components/layout/BoundaryCard";

/** Keeps the admin shell around a failing page. */
export default function PanelError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <BoundaryCard kind="error" home="/admin" error={error} onRetry={retry ?? reset} />;
}
