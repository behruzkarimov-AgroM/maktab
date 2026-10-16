import { notFound } from "next/navigation";
import { ResourcePage } from "@/components/admin/ResourcePage";
import { getResource } from "@/lib/admin/resources";

export default async function ResourceDetailPage({ params }: { params: Promise<{ resource: string; id: string }> }) {
  const { resource, id } = await params;
  const res = getResource(resource);
  if (!res || !res.detail) notFound();
  return <ResourcePage resKey={resource} id={id} />;
}
