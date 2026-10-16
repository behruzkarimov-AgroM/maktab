import { Suspense } from "react";
import { JournalPage } from "@/components/school/teacher/JournalPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <JournalPage />
    </Suspense>
  );
}
