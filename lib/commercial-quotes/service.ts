import type { CommercialItemsClient } from "@/lib/commercial-items/types";

export interface CommercialQuoteSummary {
  id: string;
  quoteNumber: string;
  quoteTitle: string;
  status: string | null;
  updatedAt: string | null;
  originatingOpportunityId: string | null;
  projectId: string | null;
  lineItemCount: number;
}

export interface CommercialQuoteLineItem {
  id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  isOptional: boolean;
  sortOrder?: number | null;
  sourceOpportunityQuoteId?: string | null;
  sourceOpportunityQuoteLineItemId?: string | null;
  sourceOpportunityQuoteNumber?: string | null;
}

export interface CommercialQuoteDetail extends CommercialQuoteSummary {
  clientName: string | null;
  companyName: string | null;
  contactPerson: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  siteAddress: string | null;
  projectName: string | null;
  quoteDate: string | null;
  expiryDate: string | null;
  optionalItemsNotes: string | null;
  scopeExclusions: string | null;
  assumptions: string | null;
  scopeNotes: string | null;
  marginPercent: number | null;
  discountAmount: number | null;
  contingencyAmount: number | null;
  gstPercent: number | null;
  validityPeriod: string | null;
  paymentTerms: string | null;
  leadTime: string | null;
  termsInclusions: string | null;
  termsExclusions: string | null;
  clarifications: string | null;
  acceptanceNotes: string | null;
}

function toSummary(row: Record<string, unknown>): CommercialQuoteSummary {
  return {
    id: String(row.id),
    quoteNumber: typeof row.quote_number === "string" ? row.quote_number : "",
    quoteTitle: typeof row.quote_title === "string" ? row.quote_title : "",
    status: typeof row.status === "string" ? row.status : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    originatingOpportunityId: typeof row.originating_opportunity_id === "string" ? row.originating_opportunity_id : null,
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    lineItemCount: 0,
  };
}

export async function listCommercialQuotesForOpportunity(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
}): Promise<CommercialQuoteSummary[]> {
  const { data, error } = await params.client
    .from("project_quotes")
    .select("id, quote_number, quote_title, status, updated_at, originating_opportunity_id, project_id")
    .eq("organization_id", params.organizationId)
    .eq("originating_opportunity_id", params.opportunityId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const summaries = ((data ?? []) as Record<string, unknown>[]).map(toSummary);

  if (summaries.length === 0) {
    return summaries;
  }

  const quoteIds = summaries.map((row) => row.id);
  const { data: lineRows, error: linesError } = await params.client
    .from("project_quote_line_items")
    .select("quote_id")
    .eq("organization_id", params.organizationId)
    .in("quote_id", quoteIds);

  if (linesError) {
    throw new Error(linesError.message);
  }

  const lineCounts = new Map<string, number>();
  for (const row of (lineRows ?? []) as Array<{ quote_id: string | null }>) {
    if (typeof row.quote_id !== "string" || row.quote_id.length === 0) {
      continue;
    }

    lineCounts.set(row.quote_id, (lineCounts.get(row.quote_id) ?? 0) + 1);
  }

  return summaries.map((summary) => ({
    ...summary,
    lineItemCount: lineCounts.get(summary.id) ?? 0,
  }));
}

export async function getCommercialQuoteDetail(params: {
  client: CommercialItemsClient;
  organizationId: string;
  quoteId: string;
  opportunityId?: string;
}): Promise<{ quote: CommercialQuoteDetail; lineItems: CommercialQuoteLineItem[] } | null> {
  const quoteFilter = params.client
    .from("project_quotes")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.quoteId);

  const { data: quoteRow, error: quoteError } = await quoteFilter.maybeSingle();

  if (quoteError) {
    throw new Error(quoteError.message);
  }

  if (!quoteRow) {
    return null;
  }

  if (
    params.opportunityId &&
    typeof quoteRow.originating_opportunity_id === "string" &&
    quoteRow.originating_opportunity_id !== params.opportunityId
  ) {
    throw new Error("This quote belongs to a different opportunity.");
  }

  const { data: lineRows, error: linesError } = await params.client
    .from("project_quote_line_items")
    .select("id, section, description, quantity, unit, rate, is_optional, sort_order, source_opportunity_quote_id, source_opportunity_quote_line_item_id, source_opportunity_quote_number")
    .eq("organization_id", params.organizationId)
    .eq("quote_id", params.quoteId)
    .order("sort_order", { ascending: true });

  if (linesError) {
    throw new Error(linesError.message);
  }

  return {
    quote: {
      ...toSummary(quoteRow as Record<string, unknown>),
      clientName: typeof quoteRow.client_name === "string" ? quoteRow.client_name : null,
      companyName: typeof quoteRow.company_name === "string" ? quoteRow.company_name : null,
      contactPerson: typeof quoteRow.contact_person === "string" ? quoteRow.contact_person : null,
      clientEmail: typeof quoteRow.client_email === "string" ? quoteRow.client_email : null,
      clientPhone: typeof quoteRow.client_phone === "string" ? quoteRow.client_phone : null,
      siteAddress: typeof quoteRow.site_address === "string" ? quoteRow.site_address : null,
      projectName: typeof quoteRow.project_name === "string" ? quoteRow.project_name : null,
      quoteDate: typeof quoteRow.quote_date === "string" ? quoteRow.quote_date : null,
      expiryDate: typeof quoteRow.expiry_date === "string" ? quoteRow.expiry_date : null,
      optionalItemsNotes: typeof quoteRow.optional_items_notes === "string" ? quoteRow.optional_items_notes : null,
      scopeExclusions: typeof quoteRow.scope_exclusions === "string" ? quoteRow.scope_exclusions : null,
      assumptions: typeof quoteRow.assumptions === "string" ? quoteRow.assumptions : null,
      scopeNotes: typeof quoteRow.scope_notes === "string" ? quoteRow.scope_notes : null,
      marginPercent: typeof quoteRow.margin_percent === "number" ? quoteRow.margin_percent : null,
      discountAmount: typeof quoteRow.discount_amount === "number" ? quoteRow.discount_amount : null,
      contingencyAmount: typeof quoteRow.contingency_amount === "number" ? quoteRow.contingency_amount : null,
      gstPercent: typeof quoteRow.gst_percent === "number" ? quoteRow.gst_percent : null,
      validityPeriod: typeof quoteRow.validity_period === "string" ? quoteRow.validity_period : null,
      paymentTerms: typeof quoteRow.payment_terms === "string" ? quoteRow.payment_terms : null,
      leadTime: typeof quoteRow.lead_time === "string" ? quoteRow.lead_time : null,
      termsInclusions: typeof quoteRow.terms_inclusions === "string" ? quoteRow.terms_inclusions : null,
      termsExclusions: typeof quoteRow.terms_exclusions === "string" ? quoteRow.terms_exclusions : null,
      clarifications: typeof quoteRow.clarifications === "string" ? quoteRow.clarifications : null,
      acceptanceNotes: typeof quoteRow.acceptance_notes === "string" ? quoteRow.acceptance_notes : null,
    },
    lineItems: ((lineRows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      section: typeof row.section === "string" ? row.section : "Labour",
      description: typeof row.description === "string" ? row.description : "",
      quantity: typeof row.quantity === "number" ? row.quantity : 0,
      unit: typeof row.unit === "string" ? row.unit : "",
      rate: typeof row.rate === "number" ? row.rate : 0,
      isOptional: Boolean(row.is_optional),
      sortOrder: typeof row.sort_order === "number" ? row.sort_order : null,
      sourceOpportunityQuoteId: typeof row.source_opportunity_quote_id === "string" ? row.source_opportunity_quote_id : null,
      sourceOpportunityQuoteLineItemId:
        typeof row.source_opportunity_quote_line_item_id === "string" ? row.source_opportunity_quote_line_item_id : null,
      sourceOpportunityQuoteNumber: typeof row.source_opportunity_quote_number === "string" ? row.source_opportunity_quote_number : null,
    })),
  };
}
