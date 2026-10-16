"use client";

import { BoundaryCard } from "@/components/layout/BoundaryCard";

export default function SchoolError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <BoundaryCard asMain kind="error" home="/school" error={error} onRetry={retry ?? reset} />;
}
