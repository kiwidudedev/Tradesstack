"use server";

import { normalizeCommercialRate } from "@/lib/commercial-items/precision";
import {
  publishTakeoffCommercialVariation,
  type TakeoffVariationPublishTarget,
} from "@/lib/commercial-items/takeoff-variation-destination";
import { VARIATION_COST_SECTIONS } from "@/lib/commercial-items/variation-sections";
import {
  resolveTakeoffCommercialMeasurementAuthority,
  resolveTakeoffCommercialProjectAuthority,
} from "@/lib/takeoff/commercial-authority-server";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

export interface TakeoffVariationOption {
  id: string;
  variationNumber: string;
  variationTitle: string;
  status: "Draft" | "Priced";
  updatedAt: string;
}

export type TakeoffAddToVariationContextResult =
  | { ok: false; error: string }
  | {
      ok: true;
      measurement: {
        id: string;
        name: string;
        description: string;
        quantity: number;
        unit: string;
        kind: "line" | "area" | "count";
      };
      variations: TakeoffVariationOption[];
      initialMode: "new" | "existing";
      initialVariationId: string;
      initialVariationTitle: string;
    };

async function resolveVariationAuthority(owner: TakeoffRouteOwner, measurementId: string) {
  const sourceAuthority = await resolveTakeoffCommercialMeasurementAuthority({
    owner,
    measurementId,
    destinationLabel: "Variation",
  });
  const project = await resolveTakeoffCommercialProjectAuthority({
    supabase: sourceAuthority.supabase,
    organizationId: sourceAuthority.context.organizationId,
    opportunityId: sourceAuthority.context.lineageOpportunityId!,
    dataProjectId: sourceAuthority.context.dataProjectId,
  });
  return { ...sourceAuthority, project };
}

export async function loadTakeoffAddToVariationContext(input: {
  owner: TakeoffRouteOwner;
  measurementId: string;
}): Promise<TakeoffAddToVariationContextResult> {
  try {
    const authority = await resolveVariationAuthority(input.owner, input.measurementId);
    const { data, error } = await authority.supabase
      .from("project_variations")
      .select("id, variation_number, variation_title, status, updated_at")
      .eq("organization_id", authority.context.organizationId)
      .eq("project_id", authority.project.id)
      .in("status", ["Draft", "Priced"])
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const variations = (data ?? []).map((row) => ({
      id: row.id,
      variationNumber: row.variation_number,
      variationTitle: row.variation_title,
      status: row.status as "Draft" | "Priced",
      updatedAt: row.updated_at,
    }));
    return {
      ok: true,
      measurement: authority.commercialMeasurement,
      variations,
      initialMode: variations.length === 0 ? "new" : "existing",
      initialVariationId: variations.length === 1 ? variations[0].id : "",
      initialVariationTitle: authority.commercialMeasurement.description,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to load Variation destinations." };
  }
}

export async function publishTakeoffMeasurementToVariation(input: {
  owner: TakeoffRouteOwner;
  measurementId: string;
  description: string;
  rate: number;
  target: TakeoffVariationPublishTarget;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const authority = await resolveVariationAuthority(input.owner, input.measurementId);
    const description = input.description.trim();
    if (!description) throw new Error("Description is required.");
    const rate = normalizeCommercialRate(Number(input.rate));
    if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be a non-negative number.");
    if (!VARIATION_COST_SECTIONS.includes(input.target.section)) throw new Error("Select a valid Variation section.");
    if (input.target.mode === "new" && !input.target.variationTitle.trim()) throw new Error("Variation title is required.");
    if (!input.target.requestKey.trim()) throw new Error("Variation publication request identity is missing.");
    const result = await publishTakeoffCommercialVariation({
      client: authority.supabase,
      organizationId: authority.context.organizationId,
      opportunityId: authority.context.lineageOpportunityId!,
      projectId: authority.project.id,
      dataProjectId: authority.context.dataProjectId,
      measurementId: authority.measurement.id,
      description,
      rate,
      target: input.target,
    });
    return { ok: true, message: `Measurement added to ${result.variationNumber}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add this measurement to the Variation." };
  }
}
