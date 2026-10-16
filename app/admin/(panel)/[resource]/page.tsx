import { notFound } from "next/navigation";
import { ResourcePage } from "@/components/admin/ResourcePage";
import { getResource } from "@/lib/admin/resources";

export default async function ResourceListPage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const res = getResource(resource);
  if (!res || res.nav === false) notFound();
  return <ResourcePage resKey={resource} />;
}
