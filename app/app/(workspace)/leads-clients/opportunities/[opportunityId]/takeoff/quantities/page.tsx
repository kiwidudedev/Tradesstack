import { TakeoffQuantitiesRoutePage } from "@/components/app/TakeoffQuantitiesRoutePage";
import type { TakeoffPageSearchParams } from "@/lib/takeoff/page-data-server";

export default async function OpportunityTakeoffQuantitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<TakeoffPageSearchParams>;
}) {
  const { opportunityId } = await params;
  return TakeoffQuantitiesRoutePage({ owner: { kind: "opportunity", slug: opportunityId }, searchParams });
}
