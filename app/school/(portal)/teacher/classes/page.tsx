import { Suspense } from "react";
import { LazyTeacherClasses } from "@/components/layout/LazyViews";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LazyTeacherClasses />
    </Suspense>
  );
}
