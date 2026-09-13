import { notFound } from "next/navigation";
import { SharedPricingWorksheetRegisterPage } from "@/components/app/PricingWorksheetRegisterPage";
import { resolveProjectPricingWorksheetRouteContext } from "@/lib/project-pricing-worksheet-route-server";

export async function ProjectPricingWorksheetRoutePage({
  projectSlug,
  quoteId,
  worksheetId,
}: {
  projectSlug: string;
  quoteId: string;
  worksheetId?: string;
}) {
  const context = await resolveProjectPricingWorksheetRouteContext(
    projectSlug,
    quoteId,
    worksheetId,
  );
  if (!context) {
    notFound();
  }

  return (
    <SharedPricingWorksheetRegisterPage
      owner={context.owner}
      registerPath={context.registerPath}
      contextLabel="project"
    />
  );
}
