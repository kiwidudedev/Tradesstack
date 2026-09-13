import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { resolveAuthorizedTakeoffContext } from "@/lib/takeoff-owner-server";
import {
  getTakeoffCommercialDescription,
  getTakeoffCommercialQuantity,
  isTakeoffMeasurementCommerciallyEligible,
  type CommercialTakeoffMeasurement,
} from "@/lib/takeoff/commercial-measurement";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

type TakeoffCommercialClient = SupabaseClient<Database>;

export type AuthoritativeCommercialTakeoffMeasurement = CommercialTakeoffMeasurement & {
  organization_id: string;
  project_id: string;
  opportunity_id: string | null;
  drawing_set_id: string;
  page_id: string;
  version: number;
  updated_at: string;
};

export async function resolveTakeoffCommercialMeasurementAuthority(params: {
  owner: TakeoffRouteOwner;
  measurementId: string;
  destinationLabel: "Quote" | "Purchase Order" | "Variation";
  supabase?: TakeoffCommercialClient;
}) {
  if (!params.measurementId || params.measurementId.startsWith("temp-")) {
    throw new Error(`Only committed Takeoff measurements can be added to a ${params.destinationLabel}.`);
  }

  const supabase = params.supabase ?? await createServerSupabaseClient({ requestTimeoutMs: 12_000 });
  const context = await resolveAuthorizedTakeoffContext({ owner: params.owner, supabase });
  if (!context) throw new Error("Takeoff owner was not found or is not authorized.");
  if (!context.lineageOpportunityId) {
    throw new Error(`Add to ${params.destinationLabel} is available only for Takeoff with Opportunity commercial lineage.`);
  }

  const measurementResult = await supabase
    .from("takeoff_measurements")
    .select("id, organization_id, project_id, opportunity_id, drawing_set_id, page_id, measurement_kind, status, name, description, display_value, display_unit, count_value, version, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.dataProjectId)
    .eq("id", params.measurementId)
    .maybeSingle();
  if (measurementResult.error) throw new Error(measurementResult.error.message);
  if (!measurementResult.data) throw new Error("Measurement was not found for this Takeoff owner.");

  const measurement = measurementResult.data as AuthoritativeCommercialTakeoffMeasurement;
  if (!isTakeoffMeasurementCommerciallyEligible(measurement)) {
    throw new Error(`Only active committed line, area, or count measurements can be added to a ${params.destinationLabel}.`);
  }

  const [drawingResult, pageResult] = await Promise.all([
    supabase.from("project_drawing_sets").select("id, organization_id, project_id").eq("id", measurement.drawing_set_id).maybeSingle(),
    supabase.from("takeoff_pages").select("id, organization_id, project_id, drawing_set_id").eq("id", measurement.page_id).maybeSingle(),
  ]);
  if (drawingResult.error || pageResult.error || !drawingResult.data || !pageResult.data) {
    throw new Error("The measurement drawing/page authority could not be verified.");
  }
  if (
    drawingResult.data.organization_id !== context.organizationId
    || drawingResult.data.project_id !== context.dataProjectId
    || pageResult.data.organization_id !== context.organizationId
    || pageResult.data.project_id !== context.dataProjectId
    || pageResult.data.drawing_set_id !== measurement.drawing_set_id
  ) {
    throw new Error("Measurement drawing/page ownership does not match the authorized Takeoff owner.");
  }

  const quantity = getTakeoffCommercialQuantity(measurement);
  const unit = measurement.display_unit?.trim();
  if (!unit) throw new Error("This measurement does not have a committed display unit.");

  return {
    supabase,
    context,
    measurement,
    commercialMeasurement: {
      id: measurement.id,
      name: measurement.name,
      description: getTakeoffCommercialDescription(measurement),
      quantity,
      unit,
      kind: measurement.measurement_kind,
    },
  };
}

export async function resolveTakeoffCommercialProjectAuthority(params: {
  supabase: TakeoffCommercialClient;
  organizationId: string;
  opportunityId: string;
  dataProjectId: string;
}) {
  const opportunityResult = await params.supabase
    .from("organization_opportunities")
    .select("id, workspace_project_id, converted_project_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.opportunityId)
    .maybeSingle();
  if (opportunityResult.error) throw new Error(opportunityResult.error.message);
  if (!opportunityResult.data) throw new Error("Opportunity not found.");
  if (opportunityResult.data.workspace_project_id !== params.dataProjectId) {
    throw new Error("Takeoff data Project does not belong to the Opportunity lineage.");
  }
  if (!opportunityResult.data.converted_project_id) {
    throw new Error("Project-stage commercial destinations are available after this opportunity is converted to a Project.");
  }

  const projectResult = await params.supabase
    .from("organization_projects")
    .select("id, slug, source_opportunity_id")
    .eq("organization_id", params.organizationId)
    .eq("id", opportunityResult.data.converted_project_id)
    .maybeSingle();
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (!projectResult.data || projectResult.data.source_opportunity_id !== params.opportunityId) {
    throw new Error("Canonical commercial Project does not match the Takeoff Opportunity lineage.");
  }

  return { id: projectResult.data.id, slug: projectResult.data.slug };
}

export const resolveTakeoffPurchaseOrderProjectAuthority = resolveTakeoffCommercialProjectAuthority;
