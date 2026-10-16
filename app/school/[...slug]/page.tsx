import { notFound } from "next/navigation";

/** Catch-all so unknown /school/... URLs render app/school/not-found.tsx (localized, with a way back) instead of the bare default 404. */
export default function SchoolCatchAll() {
  notFound();
}
