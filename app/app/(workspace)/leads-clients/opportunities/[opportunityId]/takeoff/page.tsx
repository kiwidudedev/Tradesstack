import { redirect } from "next/navigation";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";

export default async function OpportunityTakeoffRedirectPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;

  redirect(buildTakeoffHref(opportunityId, "measure", {}));
}
