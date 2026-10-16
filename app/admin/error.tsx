"use client";

import { BoundaryCard } from "@/components/layout/BoundaryCard";

export default function AdminError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <BoundaryCard asMain kind="error" home="/admin" error={error} onRetry={retry ?? reset} />;
}
