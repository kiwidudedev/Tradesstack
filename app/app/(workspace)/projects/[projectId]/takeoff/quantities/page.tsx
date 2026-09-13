import { TakeoffQuantitiesRoutePage } from "@/components/app/TakeoffQuantitiesRoutePage";
import type { TakeoffPageSearchParams } from "@/lib/takeoff/page-data-server";

export default async function ProjectTakeoffQuantitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<TakeoffPageSearchParams>;
}) {
  const { projectId } = await params;
  return TakeoffQuantitiesRoutePage({ owner: { kind: "project", slug: projectId }, searchParams });
}
