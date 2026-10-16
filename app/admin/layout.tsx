import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootHtml } from "@/components/layout/RootHtml";

export const metadata: Metadata = {
  title: "Children's Academy · Admin",
  robots: { index: false, follow: false },
};

// Nested layout under the root layout owned by "core". The public Header/Footer live in app/[locale]/layout.tsx
// and are therefore NOT rendered for /admin.
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootHtml lang="en">
      <div className="min-h-screen">{children}</div>
    </RootHtml>
  );
}
