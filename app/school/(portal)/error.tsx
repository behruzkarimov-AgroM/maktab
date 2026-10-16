"use client";

import { BoundaryCard } from "@/components/layout/BoundaryCard";

/** Page-level errors keep the portal shell (sidebar, top bar) because this boundary sits inside (portal)/layout. */
export default function PortalError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <BoundaryCard kind="error" home="/school" error={error} onRetry={retry ?? reset} />;
}
