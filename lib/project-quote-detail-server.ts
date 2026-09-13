import "server-only";

import { cache } from "react";
import { canManageCommercialData, type AppRole } from "@/lib/role-permissions";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";

export type ProjectQuoteDetailStatus = "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired";

export interface ProjectQuoteDetailLine {
  id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  isOptional: boolean;
  sortOrder: number;
  sourceOpportunityQuoteId: string | null;
  sourceOpportunityQuoteLineItemId: string | null;
  sourceOpportunityQuoteNumber: string | null;
}

export interface ProjectQuoteDetailQuote {
  id: string | null;
  updatedAt: string | null;
  status: ProjectQuoteDetailStatus;
  title: string;
  number: string;
  clientName: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  siteAddress: string;
  projectName: string;
  quoteDate: string;
  expiryDate: string;
  optionalItemsNotes: string;
  scopeExclusions: string;
  assumptions: string;
  scopeNotes: string;
  marginPercent: number;
  discountAmount: number;
  contingencyAmount: number;
  gstPercent: number;
  validityPeriod: string;
  paymentTerms: string;
  leadTime: string;
  termsInclusions: string;
  termsExclusions: string;
  clarifications: string;
  acceptanceNotes: string;
  awardLockedAt: string | null;
  revisionKind: string | null;
  revisionNumber: number | null;
  predecessorQuoteId: string | null;
  pricingBasisStatus: string | null;
}

export interface ProjectQuoteDetailInitialData {
  kind: "existing" | "new";
  organizationId: string;
  projectId: string;
  projectSlug: string;
  projectCode: string;
  projectName: string;
  projectLocation: string;
  sourceOpportunityId: string | null;
  canManageQuote: boolean;
  canViewMaterials: boolean;
  canWriteQuote: boolean;
  quote: ProjectQuoteDetailQuote;
  lines: ProjectQuoteDetailLine[];
}

type ProjectQuoteRow = Database["public"]["Tables"]["project_quotes"]["Row"];
type ProjectQuoteLineRow = Database["public"]["Tables"]["project_quote_line_items"]["Row"];

const QUOTE_DETAIL_SELECT = [
  "id",
  "updated_at",
  "status",
  "quote_title",
  "quote_number",
  "client_name",
  "company_name",
  "contact_person",
  "client_email",
  "client_phone",
  "site_address",
  "project_name",
  "quote_date",
  "expiry_date",
  "optional_items_notes",
  "scope_exclusions",
  "assumptions",
  "scope_notes",
  "source_opportunity_id",
  "margin_percent",
  "discount_amount",
  "contingency_amount",
  "gst_percent",
  "validity_period",
  "payment_terms",
  "lead_time",
  "terms_inclusions",
  "terms_exclusions",
  "clarifications",
  "acceptance_notes",
  "award_locked_at",
  "revision_kind",
  "revision_number",
  "predecessor_quote_id",
  "pricing_basis_status",
].join(", ");

const QUOTE_LINE_SELECT = [
  "id",
  "section",
  "description",
  "quantity",
  "unit",
  "rate",
  "is_optional",
  "sort_order",
  "source_opportunity_quote_id",
  "source_opportunity_quote_line_item_id",
  "source_opportunity_quote_number",
].join(", ");

function projectCodeFromSlug(slug: string) {
  const normalized = slug.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
  return normalized || "PRJ";
}

function normalizeStatus(status: string): ProjectQuoteDetailStatus {
  if (status === "Draft" || status === "Sent" || status === "Accepted" || status === "Rejected" || status === "Expired") {
    return status;
  }
  return "Sent";
}

async function resolveNextQuoteNumber(organizationId: string, projectCode: string) {
  const supabase = await createServerSupabaseClient();
  const prefix = `Q-${projectCode}-`;
  const { data } = await supabase
    .from("project_quotes")
    .select("quote_number")
    .eq("organization_id", organizationId)
    .like("quote_number", `${prefix}%`);

  let maxSuffix = 0;
  const matcher = new RegExp(`^${prefix}(\\d+)$`);
  for (const row of data ?? []) {
    const match = matcher.exec(row.quote_number);
    const suffix = match ? Number.parseInt(match[1], 10) : 0;
    if (Number.isFinite(suffix)) maxSuffix = Math.max(maxSuffix, suffix);
  }
  return `${prefix}${maxSuffix + 1}`;
}

async function loadProjectQuoteDetailUncached(
  projectSlug: string,
  quoteId: string,
): Promise<ProjectQuoteDetailInitialData | null> {
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectSlug);
  if (!project) return null;

  const member = await getCurrentOrganizationMember();
  if (!member || member.organization_id !== project.organization_id) return null;

  const canManageQuote = canManageCommercialData(member.role as AppRole);
  const permissions = await getOrganizationPermissionsBatch({
    organizationId: project.organization_id,
    permissions: ["materials.view", "quotes.write"],
  });
  const canViewMaterials = permissions["materials.view"] === true;
  const canWriteQuote = permissions["quotes.write"] === true;
  const projectCode = project.project_code ?? projectCodeFromSlug(project.slug);
  const supabase = await createServerSupabaseClient();

  if (quoteId === "new") {
    const [number, clientResult] = await Promise.all([
      resolveNextQuoteNumber(project.organization_id, projectCode),
      project.client_id
        ? supabase
            .from("organization_clients")
            .select("name, company_name, email, phone")
            .eq("organization_id", project.organization_id)
            .eq("id", project.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const client = clientResult.data;
    const today = new Date().toISOString().slice(0, 10);

    return {
      kind: "new",
      organizationId: project.organization_id,
      projectId: project.id,
      projectSlug: project.slug,
      projectCode,
      projectName: project.name,
      projectLocation: project.location,
      sourceOpportunityId: project.source_opportunity_id,
      canManageQuote,
      canViewMaterials,
      canWriteQuote,
      quote: {
        id: null,
        updatedAt: null,
        status: "Draft",
        title: "",
        number,
        clientName: client?.name ?? "",
        companyName: client?.company_name ?? "",
        contactPerson: client?.name ?? "",
        email: client?.email ?? "",
        phone: client?.phone ?? "",
        siteAddress: project.location,
        projectName: project.name,
        quoteDate: today,
        expiryDate: "",
        optionalItemsNotes: "",
        scopeExclusions: "",
        assumptions: "",
        scopeNotes: "",
        marginPercent: 0,
        discountAmount: 0,
        contingencyAmount: 0,
        gstPercent: 15,
        validityPeriod: "30 days",
        paymentTerms: "",
        leadTime: "",
        termsInclusions: "",
        termsExclusions: "",
        clarifications: "",
        acceptanceNotes: "",
        awardLockedAt: null,
        revisionKind: null,
        revisionNumber: null,
        predecessorQuoteId: null,
        pricingBasisStatus: null,
      },
      lines: [],
    };
  }

  const { data: quoteData, error: quoteError } = await supabase
    .from("project_quotes")
    .select(QUOTE_DETAIL_SELECT)
    .eq("organization_id", project.organization_id)
    .eq("project_id", project.id)
    .eq("id", quoteId)
    .maybeSingle();

  const quote = quoteData as unknown as ProjectQuoteRow | null;
  if (quoteError || !quote) return null;

  // Ownership is established above before quote-line data is requested.
  const { data: lineData, error: linesError } = await supabase
    .from("project_quote_line_items")
    .select(QUOTE_LINE_SELECT)
    .eq("organization_id", project.organization_id)
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true });
  if (linesError) throw new Error(`Unable to load quote lines: ${linesError.message}`);
  const lines = (lineData ?? []) as unknown as ProjectQuoteLineRow[];

  return {
    kind: "existing",
    organizationId: project.organization_id,
    projectId: project.id,
    projectSlug: project.slug,
    projectCode,
    projectName: project.name,
    projectLocation: project.location,
    sourceOpportunityId: quote.source_opportunity_id ?? project.source_opportunity_id,
    canManageQuote,
    canViewMaterials,
    canWriteQuote,
    quote: {
      id: quote.id,
      updatedAt: quote.updated_at,
      status: normalizeStatus(quote.status),
      title: quote.quote_title,
      number: quote.quote_number,
      clientName: quote.client_name ?? "",
      companyName: quote.company_name ?? "",
      contactPerson: quote.contact_person ?? "",
      email: quote.client_email ?? "",
      phone: quote.client_phone ?? "",
      siteAddress: quote.site_address || project.location,
      projectName: quote.project_name || project.name,
      quoteDate: quote.quote_date ?? "",
      expiryDate: quote.expiry_date ?? "",
      optionalItemsNotes: quote.optional_items_notes ?? "",
      scopeExclusions: quote.scope_exclusions || quote.terms_exclusions || "",
      assumptions: quote.assumptions ?? "",
      scopeNotes: quote.scope_notes || quote.clarifications || "",
      marginPercent: Number(quote.margin_percent ?? 0),
      discountAmount: Number(quote.discount_amount ?? 0),
      contingencyAmount: Number(quote.contingency_amount ?? 0),
      gstPercent: Number(quote.gst_percent ?? 15),
      validityPeriod: quote.validity_period ?? "30 days",
      paymentTerms: quote.payment_terms ?? "",
      leadTime: quote.lead_time ?? "",
      termsInclusions: quote.terms_inclusions ?? "",
      termsExclusions: quote.terms_exclusions || quote.scope_exclusions || "",
      clarifications: quote.clarifications || quote.scope_notes || "",
      acceptanceNotes: quote.acceptance_notes ?? "",
      awardLockedAt: quote.award_locked_at ?? null,
      revisionKind: quote.revision_kind ?? null,
      revisionNumber: quote.revision_number ?? null,
      predecessorQuoteId: quote.predecessor_quote_id ?? null,
      pricingBasisStatus: quote.pricing_basis_status ?? null,
    },
    lines: (lines ?? []).map((line) => ({
      id: line.id,
      section: line.section,
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      rate: Number(line.rate),
      isOptional: line.is_optional,
      sortOrder: line.sort_order,
      sourceOpportunityQuoteId: line.source_opportunity_quote_id,
      sourceOpportunityQuoteLineItemId: line.source_opportunity_quote_line_item_id,
      sourceOpportunityQuoteNumber: line.source_opportunity_quote_number,
    })),
  };
}

export const loadProjectQuoteDetail = cache(loadProjectQuoteDetailUncached);
