import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";
import { demoAllowed, isConfigured } from "@/lib/admin/supabase";
import { localEnabled } from "@/lib/localdb/server";

// the sign-in mode depends on runtime env (DATABASE_URL / Supabase keys / ALLOW_ADMIN_DEMO): never bake it in at build time
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const mode = localEnabled() ? "local" : isConfigured() ? "supabase" : demoAllowed() ? "demo" : "off";
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginForm mode={mode} />
    </Suspense>
  );
}
