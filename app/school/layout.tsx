import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootHtml } from "@/components/layout/RootHtml";

export const metadata: Metadata = {
  title: "Children's Academy · Maktab tizimi",
  robots: { index: false, follow: false },
};

// Own root layout (like /admin): the public Header/Footer live in app/[locale]/layout.tsx and are NOT rendered here.
// UZ/RU/EN switch and navy theme tokens: see components/school/ui/SchoolProvider.tsx and docs/SIS.md.
export default function SchoolRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootHtml lang="uz">
      <div className="min-h-screen">{children}</div>
    </RootHtml>
  );
}
