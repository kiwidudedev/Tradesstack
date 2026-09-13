import { TakeoffMeasureRoutePage } from "@/components/app/TakeoffMeasureRoutePage";
import type { TakeoffPageSearchParams } from "@/lib/takeoff/page-data-server";

export default async function ProjectTakeoffMeasurePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<TakeoffPageSearchParams>;
}) {
  const { projectId } = await params;
  return TakeoffMeasureRoutePage({ owner: { kind: "project", slug: projectId }, searchParams });
}
