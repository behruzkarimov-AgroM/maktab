import { Suspense } from "react";
import { ResetPasswordScreen } from "@/components/school/ui/AuthScreens";
import { demoModeActive } from "@/lib/school/auth";

export const dynamic = "force-dynamic";

/** Redirect target of the Supabase recovery e-mail (`?token_hash=` or `?code=`). In demo mode a simulated code flow is shown. */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordScreen demo={demoModeActive()} />
    </Suspense>
  );
}
