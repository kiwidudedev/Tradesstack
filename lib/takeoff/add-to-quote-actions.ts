"use server";

import { createTakeoffCommercialItem } from "@/lib/commercial-items/service";
import {
  publishCommercialRowsToQuotes,
  resolveQuotePublishOptions,
  type QuotePublishTarget,
} from "@/lib/commercial-items/quote-destination-adapter";
import { normalizeCommercialMoney, normalizeCommercialRate } from "@/lib/commercial-items/precision";
import { resolveWorksheetQuotePublishContextForCurrentUser } from "@/lib/commercial-items/worksheet-quote-publish-context-server";
import { getTakeoffCommercialQuantity } from "@/lib/takeoff/commercial-measurement";
import { resolveTakeoffCommercialMeasurementAuthority } from "@/lib/takeoff/commercial-authority-server";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

export type TakeoffAddToQuoteContextResult =
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
      quoteOptions: Awaited<ReturnType<typeof resolveQuotePublishOptions>>;
      initialMode: "new" | "existing";
      initialQuoteIds: string[];
    };

async function resolveMeasurementAuthority(owner: TakeoffRouteOwner, measurementId: string) {
  const sourceAuthority = await resolveTakeoffCommercialMeasurementAuthority({
    owner,
    measurementId,
    destinationLabel: "Quote",
  });

  const commercialContext = await resolveWorksheetQuotePublishContextForCurrentUser({
    organizationId: sourceAuthority.context.organizationId,
    opportunityId: sourceAuthority.context.lineageOpportunityId!,
  });

  return { ...sourceAuthority, commercialContext };
}

export async function loadTakeoffAddToQuoteContext(input: {
  owner: TakeoffRouteOwner;
  measurementId: string;
}): Promise<TakeoffAddToQuoteContextResult> {
  try {
    const authority = await resolveMeasurementAuthority(input.owner, input.measurementId);
    const quantity = getTakeoffCommercialQuantity(authority.measurement);
    const unit = authority.measurement.display_unit?.trim();
    if (!unit) throw new Error("This measurement does not have a committed display unit.");
    const quoteOptions = await resolveQuotePublishOptions({
      client: authority.supabase,
      organizationId: authority.context.organizationId,
      opportunityId: authority.context.lineageOpportunityId!,
    });

    return {
      ok: true,
      measurement: {
        id: authority.measurement.id,
        name: authority.measurement.name,
        description: authority.commercialMeasurement.description,
        quantity,
        unit,
        kind: authority.measurement.measurement_kind,
      },
      quoteOptions,
      initialMode: quoteOptions.length === 0 ? "new" : "existing",
      initialQuoteIds: quoteOptions.length === 1 ? [quoteOptions[0].id] : [],
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to load Quote destinations." };
  }
}

export async function publishTakeoffMeasurementToQuotes(input: {
  owner: TakeoffRouteOwner;
  measurementId: string;
  description: string;
  rate: number;
  target: QuotePublishTarget;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const authority = await resolveMeasurementAuthority(input.owner, input.measurementId);
    const description = input.description.trim();
    if (!description) throw new Error("Description is required.");
    const rate = normalizeCommercialRate(Number(input.rate));
    if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be a non-negative number.");
    const quantity = getTakeoffCommercialQuantity(authority.measurement);
    const unit = authority.measurement.display_unit?.trim();
    if (!unit) throw new Error("This measurement does not have a committed display unit.");

    const commercialItem = await createTakeoffCommercialItem(authority.supabase, {
      organizationId: authority.context.organizationId,
      opportunityId: authority.context.lineageOpportunityId!,
      projectId: authority.commercialContext.projectId,
      dataProjectId: authority.context.dataProjectId,
      measurementId: authority.measurement.id,
      description,
      rate,
    });

    const result = await publishCommercialRowsToQuotes({
      client: authority.supabase,
      organizationId: authority.context.organizationId,
      opportunityId: authority.context.lineageOpportunityId!,
      projectId: authority.commercialContext.projectId,
      publishedRows: [{
        description,
        quantity,
        unit,
        rate,
        total: normalizeCommercialMoney(quantity * rate),
        commercialItem,
      }],
      target: input.target,
      sourceLabel: "Takeoff",
    });
    return { ok: true, message: result.message };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add this measurement to the Quote." };
  }
}
