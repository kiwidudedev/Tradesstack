import { buildQuoteCommercialItemLink, type QuoteLineCommercialItemShape } from "@/lib/commercial-items/quote-linking";
import type { WorksheetPublishDestinationAdapter } from "@/lib/commercial-items/destination-adapter";
import { resolveEffectiveCommercialLineValues } from "@/lib/commercial-items/commercial-line-effective-values";
import { buildWorksheetPublishSummaryMessage, type PublishedWorksheetCommercialRowWithItem } from "@/lib/commercial-items/published-worksheet-selection";
import type { CommercialItemsClient } from "@/lib/commercial-items/types";
import type { CommercialItemPayload } from "@/lib/commercial-items/types";
import { getCommercialQuoteDetail, listCommercialQuotesForOpportunity } from "@/lib/commercial-quotes/service";

export type QuotePublishTarget =
  | { mode: "existing"; quoteIds: string[]; quoteId?: never }
  | { mode: "existing"; quoteId: string; quoteIds?: never }
  | { mode: "new" };

export function getQuotePublishTargetIds(target: QuotePublishTarget) {
  if (target.mode !== "existing") return [];
  return Array.from(new Set((target.quoteIds ?? [target.quoteId]).filter((quoteId): quoteId is string => Boolean(quoteId)))).sort();
}

export function buildQuotePublicationRequestKey(params: {
  organizationId: string;
  target: QuotePublishTarget;
  commercialItemIds: string[];
  sourceKind?: "worksheet" | "takeoff";
}) {
  return [
    `${params.sourceKind ?? "worksheet"}-quote-v1`,
    params.organizationId,
    params.target.mode === "existing" ? getQuotePublishTargetIds(params.target).join(",") : "new",
    ...[...params.commercialItemIds].sort(),
  ].join(":");
}

export interface QuotePublishOption {
  id: string;
  quoteNumber: string;
  quoteTitle: string;
  status: string | null;
  updatedAt: string | null;
  lineItemCount: number;
  recipientName?: string;
  revisionNumber?: number;
}

export type QuotePublishTargetResolution =
  | { kind: "blocked"; message: string }
  | { kind: "ready"; target: QuotePublishTarget }
  | { kind: "choose"; quotes: QuotePublishOption[] };

export function resolveInitialQuotePublishTargetId(resolution: QuotePublishTargetResolution) {
  return resolution.kind === "ready" && resolution.target.mode === "existing"
    ? resolution.target.quoteId
    : "";
}

export function resolveInitialQuotePublishTargetIds(resolution: QuotePublishTargetResolution) {
  const quoteId = resolveInitialQuotePublishTargetId(resolution);
  return quoteId ? [quoteId] : [];
}

export function resolveInitialQuotePublishTargetMode(resolution: QuotePublishTargetResolution): QuotePublishTarget["mode"] {
  return resolution.kind === "ready" && resolution.target.mode === "new" ? "new" : "existing";
}

type ProjectQuoteRow = {
  id: string;
  updated_at: string | null;
  status: string | null;
  quote_title: string;
  quote_number: string;
  client_name: string | null;
  company_name: string | null;
  contact_person: string | null;
  client_email: string | null;
  client_phone: string | null;
  site_address: string | null;
  project_name: string | null;
  quote_date: string | null;
  expiry_date: string | null;
  optional_items_notes: string | null;
  scope_exclusions: string | null;
  assumptions: string | null;
  scope_notes: string | null;
  source_opportunity_id: string | null;
  margin_percent: number | null;
  discount_amount: number | null;
  contingency_amount: number | null;
  gst_percent: number | null;
  validity_period: string | null;
  payment_terms: string | null;
  lead_time: string | null;
  terms_inclusions: string | null;
  terms_exclusions: string | null;
  clarifications: string | null;
  acceptance_notes: string | null;
  originating_opportunity_id: string | null;
  project_id: string | null;
};

type ProjectQuoteLineItemRow = {
  id: string;
  section: QuoteLineCommercialItemShape["section"];
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  is_optional: boolean;
  source_opportunity_quote_id: string | null;
  source_opportunity_quote_line_item_id: string | null;
  source_opportunity_quote_number: string | null;
};

type QuoteSaveRpcRow = {
  id: string;
  updated_at: string;
  status: string;
};

function addDays(value: string, days: number) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function numberOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function deriveOpportunityCodeFromSlug(slug: string | null | undefined) {
  const normalized = (slug ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);

  return normalized || "OPP";
}

async function resolveNextQuoteNumber(client: CommercialItemsClient, organizationId: string, quoteCode: string) {
  const prefix = `Q-${quoteCode}-`;
  const { data, error } = await client
    .from("project_quotes")
    .select("quote_number")
    .eq("organization_id", organizationId)
    .like("quote_number", `${prefix}%`);

  if (error) {
    return `${prefix}1`;
  }

  let maxSuffix = 0;
  const matcher = new RegExp(`^${prefix}(\\d+)$`);

  for (const row of data ?? []) {
    const quoteNumber = typeof row.quote_number === "string" ? row.quote_number : "";
    const match = matcher.exec(quoteNumber);
    if (!match) {
      continue;
    }

    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > maxSuffix) {
      maxSuffix = parsed;
    }
  }

  return `${prefix}${maxSuffix + 1}`;
}

async function loadQuotePublishOptions(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
}) {
  const quotes = await listCommercialQuotesForOpportunity({
    client: params.client,
    organizationId: params.organizationId,
    opportunityId: params.opportunityId,
  });

  return quotes.map((row) => ({
    id: row.id,
    quoteNumber: row.quoteNumber,
    quoteTitle: row.quoteTitle,
    status: row.status,
    updatedAt: row.updatedAt,
    lineItemCount: row.lineItemCount,
    recipientName: row.clientName ?? "Recipient",
    revisionNumber: row.revisionNumber,
  }));
}

export async function resolveQuotePublishOptions(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
}) {
  const quotes = await loadQuotePublishOptions(params);
  return selectEligibleDraftQuoteTargets(quotes).pickerQuotes;
}

function compareQuotePublishOptionsByUpdatedAt(left: QuotePublishOption, right: QuotePublishOption) {
  const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
  const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.quoteNumber.localeCompare(right.quoteNumber);
}

function selectEligibleDraftQuoteTargets(quotes: QuotePublishOption[]) {
  const draftQuotes = quotes
    .filter((quote) => (quote.status ?? "Draft") === "Draft")
    .sort(compareQuotePublishOptionsByUpdatedAt);

  if (draftQuotes.length === 0) {
    return {
      autoSelectedQuoteId: null,
      pickerQuotes: [] as QuotePublishOption[],
    };
  }

  if (draftQuotes.length === 1) {
    return {
      autoSelectedQuoteId: draftQuotes[0].id,
      pickerQuotes: draftQuotes,
    };
  }

  return {
    autoSelectedQuoteId: null,
    pickerQuotes: draftQuotes,
  };
}

async function loadCommercialQuoteContext(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
}) {
  const { data: opportunityRow, error: opportunityError } = await params.client
    .from("organization_opportunities")
    .select("id, name, opportunity_code, location, client_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.opportunityId)
    .maybeSingle();

  if (opportunityError) {
    throw new Error(opportunityError.message);
  }

  if (!opportunityRow) {
    throw new Error("Opportunity not found for worksheet publishing.");
  }

  let projectRow: {
    id: string;
    name: string;
    project_code: string | null;
    location: string | null;
    source_opportunity_id: string | null;
  } | null = null;

  if (params.projectId) {
    const { data, error } = await params.client
      .from("organization_projects")
      .select("id, name, project_code, location, source_opportunity_id")
      .eq("organization_id", params.organizationId)
      .eq("id", params.projectId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Project not found for worksheet publishing.");
    }

    if (data.source_opportunity_id && data.source_opportunity_id !== params.opportunityId) {
      throw new Error("This quote belongs to a different opportunity.");
    }

    projectRow = data as NonNullable<typeof projectRow>;
  }

  let clientRow: {
    name: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
  } | null = null;

  if (opportunityRow.client_id) {
    const { data, error } = await params.client
      .from("organization_clients")
      .select("name, company_name, email, phone")
      .eq("organization_id", params.organizationId)
      .eq("id", opportunityRow.client_id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    clientRow = data ?? null;
  }

  return {
    opportunity: opportunityRow as {
      id: string;
      name: string;
      opportunity_code: string | null;
      location: string | null;
      client_id: string | null;
    },
    project: projectRow,
    client: clientRow,
  };
}

async function loadExistingQuote(params: {
  client: CommercialItemsClient;
  organizationId: string;
  quoteId: string;
  opportunityId: string;
}) {
  const detail = await getCommercialQuoteDetail({
    client: params.client,
    organizationId: params.organizationId,
    quoteId: params.quoteId,
    opportunityId: params.opportunityId,
  });

  if (!detail) {
    throw new Error("Selected quote no longer exists.");
  }

  return {
    quote: {
      id: detail.quote.id,
      updated_at: detail.quote.updatedAt,
      status: detail.quote.status,
      quote_title: detail.quote.quoteTitle,
      quote_number: detail.quote.quoteNumber,
      client_name: detail.quote.clientName,
      company_name: detail.quote.companyName,
      contact_person: detail.quote.contactPerson,
      client_email: detail.quote.clientEmail,
      client_phone: detail.quote.clientPhone,
      site_address: detail.quote.siteAddress,
      project_name: detail.quote.projectName,
      quote_date: detail.quote.quoteDate,
      expiry_date: detail.quote.expiryDate,
      optional_items_notes: detail.quote.optionalItemsNotes,
      scope_exclusions: detail.quote.scopeExclusions,
      assumptions: detail.quote.assumptions,
      scope_notes: detail.quote.scopeNotes,
      source_opportunity_id: detail.quote.originatingOpportunityId,
      margin_percent: detail.quote.marginPercent,
      discount_amount: detail.quote.discountAmount,
      contingency_amount: detail.quote.contingencyAmount,
      gst_percent: detail.quote.gstPercent,
      validity_period: detail.quote.validityPeriod,
      payment_terms: detail.quote.paymentTerms,
      lead_time: detail.quote.leadTime,
      terms_inclusions: detail.quote.termsInclusions,
      terms_exclusions: detail.quote.termsExclusions,
      clarifications: detail.quote.clarifications,
      acceptance_notes: detail.quote.acceptanceNotes,
      originating_opportunity_id: detail.quote.originatingOpportunityId,
      project_id: detail.quote.projectId,
    } satisfies ProjectQuoteRow,
    lineItems: detail.lineItems.map((item) => ({
      id: item.id,
      section: item.section as QuoteLineCommercialItemShape["section"],
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
      is_optional: item.isOptional,
      source_opportunity_quote_id: item.sourceOpportunityQuoteId ?? null,
      source_opportunity_quote_line_item_id: item.sourceOpportunityQuoteLineItemId ?? null,
      source_opportunity_quote_number: item.sourceOpportunityQuoteNumber ?? null,
    })) as ProjectQuoteLineItemRow[],
  };
}

export async function resolveQuotePublishTarget(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
}) : Promise<QuotePublishTargetResolution> {
  const quotes = await loadQuotePublishOptions({
    client: params.client,
    organizationId: params.organizationId,
    opportunityId: params.opportunityId,
  });

  const draftResolution = selectEligibleDraftQuoteTargets(quotes);

  if (draftResolution.autoSelectedQuoteId) {
    return {
      kind: "ready",
      target: { mode: "existing", quoteId: draftResolution.autoSelectedQuoteId },
    };
  }

  if (draftResolution.pickerQuotes.length > 1) {
    return {
      kind: "choose",
      quotes: draftResolution.pickerQuotes,
    };
  }

  return {
    kind: "ready",
    target: { mode: "new" },
  };
}

export interface CommercialQuotePublishRow {
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  commercialItem: CommercialItemPayload;
}

export function buildQuoteLineDraftFromCommercialRow(row: CommercialQuotePublishRow): QuoteLineCommercialItemShape {
  const effective = resolveEffectiveCommercialLineValues("quote", row);

  return {
    id: crypto.randomUUID(),
    section: "Item",
    description: row.description,
    quantity: effective.quantity,
    unit: row.unit ?? "Item",
    rate: effective.rate,
    isOptional: false,
    commercialItemLink: buildQuoteCommercialItemLink(row.commercialItem),
  };
}

export const buildQuoteLineDraftFromPublishedRow = buildQuoteLineDraftFromCommercialRow;

export interface QuoteDestinationPublishResult {
  quoteId: string;
  quoteNumber: string;
  quoteIds?: string[];
  quoteNumbers?: string[];
  targetMode: QuotePublishTarget["mode"];
  addedLineCount: number;
  skippedRowCount: number;
  partialLinkFailureMessage: string | null;
  message: string;
}

export async function publishCommercialRowsToQuotes(input: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
  publishedRows: CommercialQuotePublishRow[];
  target: QuotePublishTarget;
  skippedRowCount?: number;
  sourceLabel: string;
  rpcNames?: { single: string; multi: string };
}): Promise<QuoteDestinationPublishResult> {
    const context = await loadCommercialQuoteContext({
      client: input.client,
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      projectId: input.projectId,
    });
    const opportunity = context.opportunity;
    const project = context.project as {
      id: string;
      name: string;
      project_code: string | null;
      location: string | null;
      source_opportunity_id: string | null;
    } | null;
    const client = context.client;

    const targetQuoteIds = getQuotePublishTargetIds(input.target);
    const destinations: Array<{ quote: ProjectQuoteRow; lineItems: ProjectQuoteLineItemRow[] }> = [];

    if (input.target.mode === "existing") {
      if (targetQuoteIds.length === 0) {
        throw new Error("Select at least one draft Quote.");
      }
      for (const quoteId of targetQuoteIds) {
        destinations.push(await loadExistingQuote({
          client: input.client,
          organizationId: input.organizationId,
          quoteId,
          opportunityId: input.opportunityId,
        }));
      }
    } else {
      const rpc = input.client as unknown as {
        rpc(name: "initialize_primary_opportunity_quote_v1", args: {
          p_organization_id: string;
          p_opportunity_id: string;
        }): Promise<{ data: Array<{ revision_id: string }> | null; error: { message: string } | null }>;
      };
      const initialized = await rpc.rpc("initialize_primary_opportunity_quote_v1", {
        p_organization_id: input.organizationId,
        p_opportunity_id: input.opportunityId,
      });
      const revisionId = initialized.data?.[0]?.revision_id;
      if (initialized.error || !revisionId) {
        throw new Error(initialized.error?.message ?? "Unable to initialize the Primary Client quote.");
      }
      const loaded = await loadExistingQuote({
        client: input.client,
        organizationId: input.organizationId,
        quoteId: revisionId,
        opportunityId: input.opportunityId,
      });
      destinations.push(loaded);
    }

    const publicationInputs: Array<{ quoteNumber: string; input: Record<string, unknown> }> = [];
    for (const destination of destinations) {
      const existingQuote = destination.quote;
      const appendedLineDrafts = input.publishedRows.map(buildQuoteLineDraftFromCommercialRow);
      const combinedLineItems = [
        ...destination.lineItems.map((item) => ({
          id: item.id,
          section: item.section,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          isOptional: item.is_optional,
          sourceOpportunityQuoteId: item.source_opportunity_quote_id,
          sourceOpportunityQuoteLineItemId: item.source_opportunity_quote_line_item_id,
          sourceOpportunityQuoteNumber: item.source_opportunity_quote_number,
        })),
        ...appendedLineDrafts.map((item) => ({
          id: item.id,
          section: item.section,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          isOptional: item.isOptional,
          sourceOpportunityQuoteId: null,
          sourceOpportunityQuoteLineItemId: null,
          sourceOpportunityQuoteNumber: null,
        })),
      ];
      const quoteDate = existingQuote.quote_date ?? new Date().toISOString().slice(0, 10);
      const quoteNumber = existingQuote.quote_number || await resolveNextQuoteNumber(
        input.client,
        input.organizationId,
        project?.project_code ?? opportunity.opportunity_code ?? deriveOpportunityCodeFromSlug(opportunity.name),
      );
      const requestKey = buildQuotePublicationRequestKey({
        organizationId: input.organizationId,
        target: input.target.mode === "new" ? input.target : { mode: "existing", quoteId: existingQuote.id },
        commercialItemIds: appendedLineDrafts.map((line) => line.commercialItemLink!.commercialItemId),
        sourceKind: input.sourceLabel === "worksheet" ? "worksheet" : "takeoff",
      });
      publicationInputs.push({
        quoteNumber,
        input: {
          requestKey,
          organizationId: input.organizationId,
          originatingOpportunityId: input.opportunityId,
          projectId: input.projectId,
          quoteId: existingQuote.id,
          expectedUpdatedAt: existingQuote.updated_at,
          quoteTitle: existingQuote.quote_title || `${opportunity.name} Quote`,
          quoteNumber,
          clientName: existingQuote.client_name ?? client?.name ?? "",
          companyName: existingQuote.company_name ?? client?.company_name ?? "",
          contactPerson: existingQuote.contact_person ?? client?.name ?? "",
          clientEmail: existingQuote.client_email ?? client?.email ?? "",
          clientPhone: existingQuote.client_phone ?? client?.phone ?? "",
          siteAddress: existingQuote.site_address ?? project?.location ?? opportunity.location ?? "",
          projectName: existingQuote.project_name ?? project?.name ?? opportunity.name,
          quoteDate,
          expiryDate: existingQuote.expiry_date ?? (addDays(quoteDate, 30) || null),
          status: existingQuote.status ?? "Draft",
          optionalItemsNotes: existingQuote.optional_items_notes ?? "",
          scopeExclusions: existingQuote.scope_exclusions ?? "",
          assumptions: existingQuote.assumptions ?? "",
          scopeNotes: existingQuote.scope_notes ?? "",
          marginPercent: Number(numberOrZero(existingQuote.margin_percent).toFixed(3)),
          discountAmount: Number(numberOrZero(existingQuote.discount_amount).toFixed(2)),
          contingencyAmount: Number(numberOrZero(existingQuote.contingency_amount).toFixed(2)),
          gstPercent: Number(numberOrZero(existingQuote.gst_percent).toFixed(3)),
          validityPeriod: existingQuote.validity_period ?? "30 days",
          paymentTerms: existingQuote.payment_terms ?? "",
          retentionPercentDefault: 0,
          leadTime: existingQuote.lead_time ?? "",
          termsInclusions: existingQuote.terms_inclusions ?? "",
          termsExclusions: existingQuote.terms_exclusions ?? "",
          clarifications: existingQuote.clarifications ?? "",
          acceptanceNotes: existingQuote.acceptance_notes ?? "",
          lineItems: combinedLineItems,
          commercialItemLinks: appendedLineDrafts.map((line) => ({
            commercialItemId: line.commercialItemLink!.commercialItemId,
            quoteLineId: line.id,
            snapshotAtLinkJson: line.commercialItemLink!.snapshotAtLinkJson,
          })),
        },
      });
    }

    const isMultiDestination = publicationInputs.length > 1;
    const rpcResponse = isMultiDestination
      ? await input.client.rpc((input.rpcNames?.multi ?? "publish_commercial_quotes_v1") as never, {
          p_input: {
            organizationId: input.organizationId,
            originatingOpportunityId: input.opportunityId,
            destinations: publicationInputs.map((publication) => publication.input),
          },
        } as never)
      : await input.client.rpc((input.rpcNames?.single ?? "publish_commercial_quote_v1") as never, {
          p_input: publicationInputs[0].input,
        } as never);

    if (rpcResponse.error) {
      throw new Error(rpcResponse.error.message);
    }

    const savedRows = (Array.isArray(rpcResponse.data) ? rpcResponse.data : []) as QuoteSaveRpcRow[];
    if (savedRows.length !== publicationInputs.length || savedRows.some((row) => !row.id || !row.updated_at)) {
      throw new Error("Quote publication did not return every selected destination.");
    }

    const quoteIds = savedRows.map((row) => row.id);
    const quoteNumbers = publicationInputs.map((publication) => publication.quoteNumber);
    const addedLineCount = input.publishedRows.length * publicationInputs.length;

    return {
      quoteId: quoteIds[0],
      quoteNumber: quoteNumbers[0],
      quoteIds,
      quoteNumbers,
      targetMode: input.target.mode,
      addedLineCount,
      skippedRowCount: input.skippedRowCount ?? 0,
      partialLinkFailureMessage: null,
      message: isMultiDestination
        ? `Added ${input.publishedRows.length} ${input.sourceLabel} ${input.publishedRows.length === 1 ? "item" : "items"} to ${publicationInputs.length} Quotes.`
        : input.sourceLabel === "worksheet"
          ? `${buildWorksheetPublishSummaryMessage({
              destinationLabel: "quote",
              addedCount: input.publishedRows.length,
              skippedCount: input.skippedRowCount ?? 0,
            })} Updated quote ${quoteNumbers[0]}.`
          : `Added ${input.publishedRows.length} ${input.sourceLabel} ${input.publishedRows.length === 1 ? "item" : "items"} to quote ${quoteNumbers[0]}.`,
    };
}

export const quoteDestinationAdapter: WorksheetPublishDestinationAdapter<QuotePublishTarget, QuoteDestinationPublishResult> = {
  destination: "quote",
  publish(input) {
    return publishCommercialRowsToQuotes({
      client: input.client,
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      projectId: input.projectId,
      publishedRows: input.publishedRows as PublishedWorksheetCommercialRowWithItem[],
      target: input.target,
      skippedRowCount: input.publishedSelection.skippedRows.length,
      sourceLabel: "worksheet",
      // Preserve the established worksheet RPC contract and its regression tests.
      rpcNames: {
        single: "publish_worksheet_commercial_quote_v1",
        multi: "publish_worksheet_commercial_quotes_v1",
      },
    });
  },
};
