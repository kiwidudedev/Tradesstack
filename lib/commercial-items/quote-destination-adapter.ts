import { buildQuoteCommercialItemLink, persistCommercialItemQuoteLinksSafely, type QuoteLineCommercialItemShape } from "@/lib/commercial-items/quote-linking";
import type { WorksheetPublishDestinationAdapter } from "@/lib/commercial-items/destination-adapter";
import { buildWorksheetPublishSummaryMessage, type PublishedWorksheetCommercialRowWithItem } from "@/lib/commercial-items/published-worksheet-selection";
import type { CommercialItemsClient } from "@/lib/commercial-items/types";
import { getCommercialQuoteDetail, listCommercialQuotesForOpportunity } from "@/lib/commercial-quotes/service";

export type QuotePublishTarget =
  | { mode: "existing"; quoteId: string }
  | { mode: "new" };

export interface QuotePublishOption {
  id: string;
  quoteNumber: string;
  quoteTitle: string;
  status: string | null;
  updatedAt: string | null;
  lineItemCount: number;
}

export type QuotePublishTargetResolution =
  | { kind: "blocked"; message: string }
  | { kind: "ready"; target: QuotePublishTarget }
  | { kind: "choose"; quotes: QuotePublishOption[] };

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
  }));
}

export async function resolveQuotePublishOptions(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
}) {
  const quotes = await loadQuotePublishOptions(params);
  return selectMeaningfulDraftQuoteTargets(quotes).pickerQuotes;
}

function compareQuotePublishOptionsByUpdatedAt(left: QuotePublishOption, right: QuotePublishOption) {
  const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
  const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.quoteNumber.localeCompare(right.quoteNumber);
}

function selectMeaningfulDraftQuoteTargets(quotes: QuotePublishOption[]) {
  const draftQuotes = quotes
    .filter((quote) => (quote.status ?? "Draft") === "Draft")
    .sort(compareQuotePublishOptionsByUpdatedAt);

  if (draftQuotes.length === 0) {
    return {
      autoSelectedQuoteId: null,
      pickerQuotes: [] as QuotePublishOption[],
    };
  }

  const nonEmptyDrafts = draftQuotes.filter((quote) => quote.lineItemCount > 0);
  if (nonEmptyDrafts.length === 1) {
    return {
      autoSelectedQuoteId: nonEmptyDrafts[0].id,
      pickerQuotes: nonEmptyDrafts,
    };
  }

  if (nonEmptyDrafts.length > 1) {
    return {
      autoSelectedQuoteId: null,
      pickerQuotes: nonEmptyDrafts,
    };
  }

  return {
    autoSelectedQuoteId: draftQuotes[0].id,
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

  const draftResolution = selectMeaningfulDraftQuoteTargets(quotes);

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

export function buildQuoteLineDraftFromPublishedRow(row: PublishedWorksheetCommercialRowWithItem): QuoteLineCommercialItemShape {
  const quantity = row.quantity ?? 1;
  const safeRate = row.rate ?? (row.total !== null ? row.total / Math.max(quantity, 1) : 0);

  return {
    id: crypto.randomUUID(),
    section: "Item",
    description: row.description,
    quantity,
    unit: row.unit ?? "Item",
    rate: Number.isFinite(safeRate) ? safeRate : 0,
    isOptional: false,
    commercialItemLink: buildQuoteCommercialItemLink(row.commercialItem),
  };
}

export interface QuoteDestinationPublishResult {
  quoteId: string;
  quoteNumber: string;
  targetMode: QuotePublishTarget["mode"];
  addedLineCount: number;
  skippedRowCount: number;
  partialLinkFailureMessage: string | null;
  message: string;
}

export const quoteDestinationAdapter: WorksheetPublishDestinationAdapter<QuotePublishTarget, QuoteDestinationPublishResult> = {
  destination: "quote",
  async publish(input) {
    const { opportunity, project, client } = await loadCommercialQuoteContext({
      client: input.client,
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      projectId: input.projectId,
    });

    const appendedLineDrafts = input.publishedRows.map(buildQuoteLineDraftFromPublishedRow);

    let existingQuote: ProjectQuoteRow | null = null;
    let existingLineItems: ProjectQuoteLineItemRow[] = [];

    if (input.target.mode === "existing") {
      const loaded = await loadExistingQuote({
        client: input.client,
        organizationId: input.organizationId,
        quoteId: input.target.quoteId,
        opportunityId: input.opportunityId,
      });
      existingQuote = loaded.quote;
      existingLineItems = loaded.lineItems;
    }

    const combinedLineItems = [
      ...existingLineItems.map((item) => ({
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

    const quoteDate = existingQuote?.quote_date ?? new Date().toISOString().slice(0, 10);
    const quoteNumber = existingQuote?.quote_number ?? await resolveNextQuoteNumber(
      input.client,
      input.organizationId,
      project?.project_code ?? opportunity.opportunity_code ?? deriveOpportunityCodeFromSlug(opportunity.name),
    );
    const quoteTitle = existingQuote?.quote_title ?? `${opportunity.name} Quote`;

    const rpcResponse = await input.client.rpc("save_commercial_quote_draft" as never, {
      p_organization_id: input.organizationId,
      p_originating_opportunity_id: input.opportunityId,
      p_project_id: input.projectId,
      p_quote_id: existingQuote?.id ?? null,
      p_expected_updated_at: existingQuote?.updated_at ?? null,
      p_quote_title: quoteTitle,
      p_quote_number: quoteNumber,
      p_client_name: existingQuote?.client_name ?? client?.name ?? "",
      p_company_name: existingQuote?.company_name ?? client?.company_name ?? "",
      p_contact_person: existingQuote?.contact_person ?? client?.name ?? "",
      p_client_email: existingQuote?.client_email ?? client?.email ?? "",
      p_client_phone: existingQuote?.client_phone ?? client?.phone ?? "",
      p_site_address: existingQuote?.site_address ?? project?.location ?? opportunity.location ?? "",
      p_project_name: existingQuote?.project_name ?? project?.name ?? opportunity.name,
      p_quote_date: quoteDate,
      p_expiry_date: existingQuote?.expiry_date ?? (addDays(quoteDate, 30) || null),
      p_status: existingQuote?.status ?? "Draft",
      p_optional_items_notes: existingQuote?.optional_items_notes ?? "",
      p_scope_exclusions: existingQuote?.scope_exclusions ?? "",
      p_assumptions: existingQuote?.assumptions ?? "",
      p_scope_notes: existingQuote?.scope_notes ?? "",
      p_margin_percent: Number(numberOrZero(existingQuote?.margin_percent).toFixed(3)),
      p_discount_amount: Number(numberOrZero(existingQuote?.discount_amount).toFixed(2)),
      p_contingency_amount: Number(numberOrZero(existingQuote?.contingency_amount).toFixed(2)),
      p_gst_percent: Number(numberOrZero(existingQuote?.gst_percent).toFixed(3)),
      p_validity_period: existingQuote?.validity_period ?? "30 days",
      p_payment_terms: existingQuote?.payment_terms ?? "",
      p_retention_percent_default: 0,
      p_lead_time: existingQuote?.lead_time ?? "",
      p_terms_inclusions: existingQuote?.terms_inclusions ?? "",
      p_terms_exclusions: existingQuote?.terms_exclusions ?? "",
      p_clarifications: existingQuote?.clarifications ?? "",
      p_acceptance_notes: existingQuote?.acceptance_notes ?? "",
      p_line_items: combinedLineItems,
    } as never);

    if (rpcResponse.error) {
      throw new Error(rpcResponse.error.message);
    }

    const savedRow = (Array.isArray(rpcResponse.data) ? rpcResponse.data[0] : null) as QuoteSaveRpcRow | null;
    if (!savedRow?.id || !savedRow.updated_at) {
      throw new Error("Quote was saved but no identifier was returned.");
    }

    const linkResult = await persistCommercialItemQuoteLinksSafely({
      client: input.client,
      organizationId: input.organizationId,
      quoteId: savedRow.id,
      quoteSourceOpportunityId: input.opportunityId,
      lineItems: appendedLineDrafts,
    });

    return {
      quoteId: savedRow.id,
      quoteNumber,
      targetMode: input.target.mode,
      addedLineCount: appendedLineDrafts.length,
      skippedRowCount: input.publishedSelection.skippedRows.length,
      partialLinkFailureMessage: linkResult.ok ? null : linkResult.errorMessage,
      message: `${buildWorksheetPublishSummaryMessage({
        destinationLabel: "quote",
        addedCount: appendedLineDrafts.length,
        skippedCount: input.publishedSelection.skippedRows.length,
      })} ${
        input.target.mode === "new"
          ? `Draft quote ${quoteNumber} created.`
          : `Updated quote ${quoteNumber}.`
      }`,
    };
  },
};
