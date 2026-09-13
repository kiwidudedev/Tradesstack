import { TakeoffMeasureRoutePage } from "@/components/app/TakeoffMeasureRoutePage";
import type { TakeoffPageSearchParams } from "@/lib/takeoff/page-data-server";

export default async function OpportunityTakeoffMeasurePage({
  params,
  searchParams,
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<TakeoffPageSearchParams>;
}) {
  const { opportunityId } = await params;
  return TakeoffMeasureRoutePage({ owner: { kind: "opportunity", slug: opportunityId }, searchParams });
}
