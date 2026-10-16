"use client";

import { AccountPanel } from "@/components/school/ui/AccountPanel";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { PageHead } from "./common";

/** Teacher profile: notification preferences + password change */
export function AccountPage() {
  const { t, session } = useSchool();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead title={t("a_account")} sub={session ? `${session.name} · ${session.email}` : undefined} />
      <AccountPanel />
    </div>
  );
}
