import "server-only";

import { getProjectFinancialSummary } from "@/lib/project-financial-summary-server";
import { getCurrentOrganizationMember, getProjectDashboardMetricsForCurrentUser } from "@/lib/projects-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { getProjectRetentionPosition } from "@/lib/retention/phase2-retention-position";
import { getProjectFilesEntry } from "@/lib/documents/files-context-server";
import { listDocumentWorkspace } from "@/lib/documents/workspace-server";
import { listPurchaseOrders } from "@/lib/purchase-orders/service";
import { calculatePurchaseOrderPreGstTotal } from "@/lib/purchase-orders/normalization";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssistantCitation, AssistantContext, AssistantReadToolDefinition, AssistantToolResult } from "./types";
import { buildProjectBriefing } from "./briefing";

export const ASSISTANT_MAX_ROWS = 20;

export const ASSISTANT_READ_REGISTRY: Record<string, AssistantReadToolDefinition> = {
  project_briefing: { name: "project_briefing", description: "Cross-module deterministic project briefing and priority signals.", domain: "project intelligence", sourceService: "buildProjectBriefing + permission-aware read registry", requiredPermission: null, projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  project_overview: { name: "project_overview", description: "Deterministic project dashboard and financial summary.", domain: "project and financials", sourceService: "getProjectDashboardMetricsForCurrentUser + getProjectFinancialSummary", requiredPermission: null, projectScoped: true, organizationScoped: true, readOnly: true, maxRows: 1 },
  project_activity: { name: "project_activity", description: "Recent project creation and drawing activity.", domain: "activity", sourceService: "organization_projects + project_drawing_sets", requiredPermission: null, projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  quotes: { name: "quotes", description: "Project quote register records.", domain: "quotes", sourceService: "project_quotes", requiredPermission: null, projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  purchase_orders: { name: "purchase_orders", description: "Purchase order register, status and commitment eligibility.", domain: "procurement", sourceService: "listPurchaseOrders", requiredPermission: null, projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  purchase_order_details: { name: "purchase_order_details", description: "Purchase order pricing lines with structured cost sections and commitment state.", domain: "procurement detail", sourceService: "project_purchase_orders + project_purchase_order_line_items", requiredPermission: null, projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  variations: { name: "variations", description: "Variation register with approval state and value.", domain: "variations", sourceService: "project_variations + project_variation_line_items", requiredPermission: null, projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  variation_details: { name: "variation_details", description: "Variation pricing lines with structured cost sections, totals and source lineage.", domain: "variation pricing", sourceService: "project_variations + project_variation_line_items", requiredPermission: null, projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  payment_claims: { name: "payment_claims", description: "Payment claim register and retention withheld values.", domain: "claims", sourceService: "project_claims", requiredPermission: "accounting.sales_invoices.view", projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  claim_details: { name: "claim_details", description: "Payment claim lines, source lineage and claimed amounts.", domain: "claim detail", sourceService: "project_claims + project_claim_line_items", requiredPermission: "accounting.sales_invoices.view", projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  retentions: { name: "retentions", description: "Deterministic retention position and origins.", domain: "retention", sourceService: "getProjectRetentionPosition", requiredPermission: "accounting.sales_invoices.view", projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  contacts: { name: "contacts", description: "Organization client and supplier directory records.", domain: "CRM and suppliers", sourceService: "organization_clients + organization_suppliers", requiredPermission: null, projectScoped: false, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  qa: { name: "qa", description: "Current project QA definitions; legacy quality records are not included in V1.", domain: "quality assurance", sourceService: "project_qas", requiredPermission: "qa.view", projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
  documents: { name: "documents", description: "Authorized shared Files metadata only; no file contents or signed URLs.", domain: "Files", sourceService: "getProjectFilesEntry + listDocumentWorkspace", requiredPermission: "files.view", projectScoped: true, organizationScoped: true, readOnly: true, maxRows: ASSISTANT_MAX_ROWS },
};

function now() { return new Date().toISOString(); }
function diagnosticId() { return `ast_${crypto.randomUUID()}`; }

function citation(context: AssistantContext, entityType: string, entityId: string, label: string, suffix: string): AssistantCitation {
  return { entityType, entityId, label, projectId: context.projectId, href: `/app/projects/${context.projectSlug}/${suffix}` };
}

function emptyResult(toolName: string, sourceService: string): AssistantToolResult {
  return { toolName, sourceService, status: "empty", data: [], citations: [], truncated: false, returnedRows: 0, totalRows: 0, asOf: now() };
}

function failedResult(toolName: string, sourceService: string, error: unknown): AssistantToolResult {
  const message = error instanceof Error ? error.message : "Unknown tool failure";
  return { toolName, sourceService, status: "failed", errorCode: /column|schema cache|relation|does not exist/i.test(message) ? "SCHEMA_OR_QUERY_ERROR" : "READ_SERVICE_ERROR", safeMessage: "TradesStack could not retrieve this module right now.", diagnosticId: diagnosticId() };
}

function okResult(toolName: string, sourceService: string, data: unknown, citations: AssistantCitation[], returnedRows: number, totalRows: number | null, truncated: boolean): AssistantToolResult {
  return { toolName, sourceService, status: "ok", data, citations, returnedRows, totalRows, truncated, asOf: now() };
}

function deniedResult(toolName: string, sourceService: string, reasonCode: string, safeMessage: string): AssistantToolResult {
  return { toolName, sourceService, status: "denied", reasonCode, safeMessage };
}

async function assertProjectVisible(context: AssistantContext) {
  const visibleProject = await getTradePackWorkspaceBySlugForCurrentUser(context.projectSlug);
  if (!visibleProject || visibleProject.id !== context.projectId || visibleProject.organization_id !== context.organizationId) return false;
  const member = await getCurrentOrganizationMember();
  return Boolean(member && member.organization_id === context.organizationId);
}

async function hasToolPermission(context: AssistantContext, toolName: string) {
  const permission = ASSISTANT_READ_REGISTRY[toolName]?.requiredPermission;
  return !permission || await hasOrganizationPermission(context.organizationId, permission);
}

export async function runAssistantTool(context: AssistantContext, toolName: string, options: { includeFinancial?: boolean; search?: string; mode?: AssistantContext["mode"] } = {}): Promise<AssistantToolResult> {
  const definition = ASSISTANT_READ_REGISTRY[toolName];
  if (!definition) return { toolName, sourceService: "assistant read registry", status: "unavailable", reasonCode: "UNSUPPORTED_TOOL", safeMessage: "TradesStack Assistant does not have access to that data yet." };
  if (!(await assertProjectVisible(context))) return deniedResult(toolName, definition.sourceService, "PROJECT_NOT_VISIBLE", "You do not have access to this project's records.");
  if (!(await hasToolPermission(context, toolName))) return deniedResult(toolName, definition.sourceService, "MODULE_PERMISSION_DENIED", "You do not have permission to view this module.");

  try {
    const supabase = await createServerSupabaseClient();

    if (toolName === "project_briefing") {
      const briefing = await buildProjectBriefing(context, (nestedTool) => runAssistantTool(context, nestedTool, options), options.mode ?? "auto");
      return okResult(toolName, definition.sourceService, briefing, briefing.sources as AssistantCitation[], briefing.sources.length, briefing.sources.length, false);
    }

    if (toolName === "project_overview") {
      const metrics = await getProjectDashboardMetricsForCurrentUser(context.projectId);
      const canViewFinancials = options.includeFinancial !== false && await hasOrganizationPermission(context.organizationId, "accounting.sales_invoices.view");
      const financial = canViewFinancials ? await getProjectFinancialSummary({ organizationId: context.organizationId, projectId: context.projectId }) : null;
      return okResult(toolName, definition.sourceService, {
        project: { id: context.projectId, name: context.projectName, slug: context.projectSlug },
        drawingMetrics: metrics,
        financial: financial ? {
          taxBasisLabel: financial.taxBasisLabel,
          originalBudget: financial.originalBudget,
          approvedVariations: financial.approvedVariations,
          currentBudget: financial.currentBudget,
          committed: financial.committed,
          actual: financial.actual,
          revenue: financial.revenue,
          retention: financial.retention,
          profitability: { status: "unsupported", safeMessage: "Profitability cannot be determined from this summary alone; authoritative cost and margin data are required." },
        } : null,
      }, [citation(context, "project", context.projectId, context.projectName, "dashboard")], 1, 1, false);
    }

    if (toolName === "project_activity") {
      const [projects, drawings] = await Promise.all([
        supabase.from("organization_projects").select("id,name,slug,created_at").eq("organization_id", context.organizationId).eq("id", context.projectId).limit(1),
        supabase.from("project_drawing_sets").select("id,file_name,uploaded_at").eq("organization_id", context.organizationId).eq("project_id", context.projectId).order("uploaded_at", { ascending: false }).limit(ASSISTANT_MAX_ROWS),
      ]);
      if (projects.error) throw projects.error;
      if (drawings.error) throw drawings.error;
      const events = [
        ...(projects.data ?? []).map((row) => ({ id: row.id, label: `Project created: ${row.name}`, occurredAt: row.created_at, href: `/app/projects/${row.slug}/dashboard` })),
        ...(drawings.data ?? []).map((row) => ({ id: row.id, label: `Drawing uploaded: ${row.file_name}`, occurredAt: row.uploaded_at, href: `/app/projects/${context.projectSlug}/files` })),
      ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, ASSISTANT_MAX_ROWS);
      if (!events.length) return emptyResult(toolName, definition.sourceService);
      return okResult(toolName, definition.sourceService, { events }, events.map((event) => ({ entityType: "project_activity", entityId: event.id, label: event.label, projectId: context.projectId, href: event.href })), events.length, null, events.length === ASSISTANT_MAX_ROWS);
    }

    if (toolName === "purchase_orders") {
      const rows = await listPurchaseOrders(supabase as never, { organizationId: context.organizationId, projectId: context.projectId });
      if (!rows.length) return emptyResult(toolName, definition.sourceService);
      const visibleRows = rows.slice(0, ASSISTANT_MAX_ROWS);
      const records = visibleRows.map((row) => ({ id: row.id, number: row.purchaseOrderNumber, title: row.purchaseOrderTitle, supplier: row.issuedToLabel || null, status: row.status, total: calculatePurchaseOrderPreGstTotal(row), commitmentEligible: ["Approved", "Issued", "Received", "Invoiced"].includes(row.status), updatedAt: row.updatedAt }));
      return okResult(toolName, definition.sourceService, { records, registerTotal: records.reduce((sum, row) => sum + row.total, 0), taxBasis: "excl. GST", note: "Draft purchase orders are register records and are not included in committed cost until they reach a commitment-eligible status." }, records.map((row) => citation(context, "purchase_order", row.id, `${row.number}: ${row.title}`, `preconstruction/purchase-orders/${row.id}`)), records.length, rows.length, rows.length > visibleRows.length);
    }

    if (toolName === "purchase_order_details") {
      // Purchase-order sections are constrained by the database to the same
      // canonical cost categories used by variation pricing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ordersResult = await (supabase as any)
        .from("project_purchase_orders")
        .select("id,purchase_order_number,purchase_order_title,status,subtotal,labour_total,materials_total,subcontractors_total,plant_total,margin_total,gst_total,total_purchase_order_price,updated_at", { count: "exact" })
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId)
        .order("updated_at", { ascending: false })
        .limit(ASSISTANT_MAX_ROWS);
      if (ordersResult.error) throw ordersResult.error;
      const orderRows = (ordersResult.data ?? []) as Array<Record<string, unknown>>;
      if (!orderRows.length) return emptyResult(toolName, definition.sourceService);
      const orderIds = orderRows.map((row) => String(row.id));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linesResult = await (supabase as any)
        .from("project_purchase_order_line_items")
        .select("id,purchase_order_id,section,description,quantity,unit,rate,total,sort_order,cost_item_id,source_cost_item_id,source_time_sheet_entry_id")
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId)
        .in("purchase_order_id", orderIds)
        .order("sort_order", { ascending: true });
      if (linesResult.error) throw linesResult.error;
      const linesByOrder = new Map<string, Array<Record<string, unknown>>>();
      for (const line of (linesResult.data ?? []) as Array<Record<string, unknown>>) {
        const orderId = String(line.purchase_order_id);
        linesByOrder.set(orderId, [...(linesByOrder.get(orderId) ?? []), line]);
      }
      const sections = ["Materials", "Labour", "Subcontractors", "Plant", "Margin"] as const;
      const records = orderRows.map((order) => {
        const lines = linesByOrder.get(String(order.id)) ?? [];
        const components = Object.fromEntries(sections.map((section) => [section, lines.reduce((sum, line) => sum + (line.section === section ? Number(line.total) || 0 : 0), 0)]));
        return {
          id: order.id,
          number: order.purchase_order_number,
          title: order.purchase_order_title,
          status: order.status,
          commitmentEligible: ["Approved", "Issued", "Received", "Invoiced"].includes(String(order.status)),
          taxBasis: "excl. GST",
          valueBasis: "purchase order pricing line value before margin and GST",
          components,
          lines: lines.map((line) => ({ id: line.id, section: line.section, description: line.description, quantity: line.quantity, unit: line.unit, rate: line.rate, total: line.total, costItemId: line.cost_item_id, sourceCostItemId: line.source_cost_item_id, sourceTimeSheetEntryId: line.source_time_sheet_entry_id })),
          headerTotals: { subtotal: order.subtotal, labour: order.labour_total, materials: order.materials_total, subcontractors: order.subcontractors_total, plant: order.plant_total, margin: order.margin_total, gst: order.gst_total, total: order.total_purchase_order_price },
          evidence: { classificationAuthority: "project_purchase_order_line_items.section", unsupportedInference: "PO title, supplier and description are not used to classify cost type." },
          updatedAt: order.updated_at,
        };
      });
      const citations = records.flatMap((record) => [
        citation(context, "purchase_order", String(record.id), `${record.number}: ${record.title}`, `preconstruction/purchase-orders/${record.id}`),
        ...record.lines.map((line) => citation(context, "purchase_order_line_item", String(line.id), `${record.number}: ${line.description || "Pricing line"}`, `preconstruction/purchase-orders/${record.id}`)),
      ]);
      const materialValueByStatus = records.reduce<Record<string, number>>((totals, record) => {
        const materialValue = Number(record.components.Materials) || 0;
        const status = String(record.status);
        totals[status] = (totals[status] ?? 0) + materialValue;
        return totals;
      }, {});
      const commitmentEligibleMaterialValue = records.reduce((sum, record) => sum + (record.commitmentEligible ? Number(record.components.Materials) || 0 : 0), 0);
      return okResult(toolName, definition.sourceService, {
        records,
        taxBasis: "excl. GST",
        classificationAuthority: "project_purchase_order_line_items.section",
        summary: {
          materialValueByStatus,
          commitmentEligibleMaterialValue,
          nonCommittedMaterialValue: records.reduce((sum, record) => sum + (!record.commitmentEligible ? Number(record.components.Materials) || 0 : 0), 0),
          note: "A purchase order is treated as commitment-eligible only when its status is Approved, Issued, Received or Invoiced. Draft values are not ordered or committed values.",
        },
      }, citations, records.length, ordersResult.count ?? null, (ordersResult.count ?? records.length) > records.length);
    }

    const tableByTool: Record<string, { table: string; select: string; suffix: string }> = {
      quotes: { table: "project_quotes", select: "id,status,subtotal,updated_at", suffix: "preconstruction/quote" },
      payment_claims: { table: "project_claims", select: "id,claim_number,status,claim_amount,retention_withheld_amount,updated_at", suffix: "preconstruction/claims" },
    };
    const config = tableByTool[toolName];
    if (config) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase as any).from(config.table).select(config.select, { count: "exact" }).eq("organization_id", context.organizationId).eq("project_id", context.projectId).order("updated_at", { ascending: false }).limit(ASSISTANT_MAX_ROWS);
      if (result.error) throw result.error;
      const rawRows = result.data ?? [];
      if (!rawRows.length) return emptyResult(toolName, definition.sourceService);
      const rows = rawRows.map((row: Record<string, unknown>) => toolName === "quotes" ? { id: row.id, status: row.status, subtotal: row.subtotal, updatedAt: row.updated_at } : { id: row.id, number: row.claim_number, status: row.status, amount: row.claim_amount, retentionWithheld: row.retention_withheld_amount, updatedAt: row.updated_at });
      return okResult(toolName, definition.sourceService, { records: rows }, rows.map((row: Record<string, unknown>) => citation(context, toolName === "quotes" ? "quote" : "payment_claim", String(row.id), String(row.number ?? `${toolName} ${row.id}`), `${config.suffix}/${row.id}`)), rows.length, result.count ?? null, (result.count ?? rows.length) > rows.length);
    }

    if (toolName === "claim_details") {
      // Claim line source_kind/source_line_item_id is the authoritative bridge
      // for answering what variation work has actually been claimed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claimsResult = await (supabase as any)
        .from("project_claims")
        .select("id,claim_number,status,claim_amount,retention_withheld_amount,updated_at", { count: "exact" })
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId)
        .order("updated_at", { ascending: false })
        .limit(ASSISTANT_MAX_ROWS);
      if (claimsResult.error) throw claimsResult.error;
      const claims = (claimsResult.data ?? []) as Array<Record<string, unknown>>;
      if (!claims.length) return emptyResult(toolName, definition.sourceService);
      const claimIds = claims.map((claim) => String(claim.id));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linesResult = await (supabase as any)
        .from("project_claim_line_items")
        .select("id,claim_id,section,description,quantity,unit,rate,claim_amount,previously_claimed_amount,cumulative_claimed_amount,source_kind,source_document_id,source_line_item_id,source_number,source_title,source_total,sort_order")
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId)
        .in("claim_id", claimIds)
        .order("sort_order", { ascending: true });
      if (linesResult.error) throw linesResult.error;
      const linesByClaim = new Map<string, Array<Record<string, unknown>>>();
      for (const line of (linesResult.data ?? []) as Array<Record<string, unknown>>) {
        const claimId = String(line.claim_id);
        linesByClaim.set(claimId, [...(linesByClaim.get(claimId) ?? []), line]);
      }
      const records = claims.map((claim) => ({
        id: claim.id,
        number: claim.claim_number,
        status: claim.status,
        claimAmount: claim.claim_amount,
        retentionWithheld: claim.retention_withheld_amount,
        lines: (linesByClaim.get(String(claim.id)) ?? []).map((line) => ({
          id: line.id,
          section: line.section,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          rate: line.rate,
          claimAmount: line.claim_amount,
          previouslyClaimedAmount: line.previously_claimed_amount,
          cumulativeClaimedAmount: line.cumulative_claimed_amount,
          sourceKind: line.source_kind,
          sourceDocumentId: line.source_document_id,
          sourceLineItemId: line.source_line_item_id,
          sourceNumber: line.source_number,
          sourceTitle: line.source_title,
          sourceTotal: line.source_total,
        })),
        evidence: { sourceAuthority: "project_claim_line_items.source_kind/source_line_item_id", taxBasis: "claim values follow the stored claim line amounts; GST treatment remains claim-record specific" },
        updatedAt: claim.updated_at,
      }));
      const citations = records.flatMap((record) => [
        citation(context, "payment_claim", String(record.id), String(record.number), `preconstruction/claims/${record.id}`),
        ...record.lines.map((line) => citation(context, "claim_line_item", String(line.id), `${record.number}: ${line.description || "Claim line"}`, `preconstruction/claims/${record.id}`)),
      ]);
      return okResult(toolName, definition.sourceService, { records, variationClaimLines: records.flatMap((record) => record.lines.filter((line) => String(line.sourceKind).toLowerCase().includes("variation"))) }, citations, records.length, claimsResult.count ?? null, (claimsResult.count ?? records.length) > records.length);
    }

    if (toolName === "variations") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase as any).from("project_variations").select("id,variation_number,variation_title,status,requested_by,requested_date,sent_to_client_at,approved_at,total_variation_price,updated_at", { count: "exact" }).eq("organization_id", context.organizationId).eq("project_id", context.projectId).order("updated_at", { ascending: false }).limit(ASSISTANT_MAX_ROWS);
      if (result.error) throw result.error;
      const rawRows = result.data ?? [];
      if (!rawRows.length) return emptyResult(toolName, definition.sourceService);
      const rows = rawRows.map((row: Record<string, unknown>) => ({ id: row.id, number: row.variation_number, title: row.variation_title, status: row.status, requestedBy: row.requested_by, requestedDate: row.requested_date, sentToClientAt: row.sent_to_client_at, approvedAt: row.approved_at, value: row.total_variation_price, approvalState: row.status === "Approved" ? "approved" : row.status === "Rejected" ? "rejected" : "pending", updatedAt: row.updated_at }));
      return okResult(toolName, definition.sourceService, { records: rows }, rows.map((row: Record<string, unknown>) => citation(context, "variation", String(row.id), `${row.number}: ${row.title}`, `preconstruction/variations/${row.id}`)), rows.length, result.count ?? null, (result.count ?? rows.length) > rows.length);
    }

    if (toolName === "variation_details") {
      // The application variation editor and save RPC use these canonical sections.
      // A line is never classified from its description or variation title.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variationsResult = await (supabase as any)
        .from("project_variations")
        .select("id,variation_number,variation_title,status,subtotal,labour_total,materials_total,subcontractors_total,plant_total,margin_total,gst_total,total_variation_price,updated_at", { count: "exact" })
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId)
        .order("updated_at", { ascending: false })
        .limit(ASSISTANT_MAX_ROWS);
      if (variationsResult.error) throw variationsResult.error;
      const variationRows = (variationsResult.data ?? []) as Array<Record<string, unknown>>;
      if (!variationRows.length) return emptyResult(toolName, definition.sourceService);

      const variationIds = variationRows.map((row) => String(row.id));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linesResult = await (supabase as any)
        .from("project_variation_line_items")
        .select("id,variation_id,section,description,quantity,unit,rate,total,sort_order,source_project_quote_id,source_project_quote_line_item_id,source_purchase_order_id,source_purchase_order_line_item_id")
        .eq("organization_id", context.organizationId)
        .eq("project_id", context.projectId)
        .in("variation_id", variationIds)
        .order("sort_order", { ascending: true });
      if (linesResult.error) throw linesResult.error;

      const linesByVariation = new Map<string, Array<Record<string, unknown>>>();
      for (const line of (linesResult.data ?? []) as Array<Record<string, unknown>>) {
        const variationId = String(line.variation_id);
        const current = linesByVariation.get(variationId) ?? [];
        current.push(line);
        linesByVariation.set(variationId, current);
      }

      const canonicalSections = new Set(["Materials", "Labour", "Subcontractors", "Plant", "Margin"]);
      const numericValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
      const records = variationRows.map((variation) => {
        const lines = linesByVariation.get(String(variation.id)) ?? [];
        const lineRecords = lines.map((line) => ({
          id: line.id,
          section: line.section,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          rate: line.rate,
          total: line.total,
          sortOrder: line.sort_order,
          sourceProjectQuoteId: line.source_project_quote_id,
          sourceProjectQuoteLineItemId: line.source_project_quote_line_item_id,
          sourcePurchaseOrderId: line.source_purchase_order_id,
          sourcePurchaseOrderLineItemId: line.source_purchase_order_line_item_id,
        }));
        const componentTotals = Object.fromEntries([...canonicalSections].map((section) => [section, lines.reduce((sum, line) => sum + (line.section === section ? numericValue(line.total) ?? 0 : 0), 0)]));
        const unclassifiedLines = lines.filter((line) => !canonicalSections.has(String(line.section))).length;
        const linesMissingTotals = lines.filter((line) => numericValue(line.total) === null).length;
        const complete = lines.length > 0 && unclassifiedLines === 0 && linesMissingTotals === 0;
        return {
          id: variation.id,
          number: variation.variation_number,
          title: variation.variation_title,
          status: variation.status,
          taxBasis: "excl. GST",
          lineCount: lines.length,
          lines: lineRecords,
          components: componentTotals,
          evidence: {
            status: complete ? "complete" : lines.length === 0 ? "missing_line_detail" : "partial",
            linesMissingTotals,
            unclassifiedLines,
            calculation: "sum(project_variation_line_items.total) grouped by project_variation_line_items.section",
          },
          headerTotals: {
            subtotal: variation.subtotal,
            labour: variation.labour_total,
            materials: variation.materials_total,
            subcontractors: variation.subcontractors_total,
            plant: variation.plant_total,
            margin: variation.margin_total,
            gst: variation.gst_total,
            total: variation.total_variation_price,
          },
          updatedAt: variation.updated_at,
        };
      });
      const citations = records.flatMap((record) => [
        citation(context, "variation", String(record.id), `${record.number}: ${record.title}`, `preconstruction/variations/${record.id}`),
        ...record.lines.map((line) => citation(context, "variation_line_item", String(line.id), `${record.number}: ${line.description || "Pricing line"}`, `preconstruction/variations/${record.id}`)),
      ]);
      return okResult(toolName, definition.sourceService, {
        records,
        valueBasis: "variation pricing line value before variation margin and GST",
        taxBasis: "excl. GST",
        classificationAuthority: "project_variation_line_items.section",
        unsupportedInference: "Line descriptions, variation titles and supplier names are not used to classify cost type.",
      }, citations, records.length, variationsResult.count ?? null, (variationsResult.count ?? records.length) > records.length);
    }

    if (toolName === "contacts") {
      const [clients, suppliers] = await Promise.all([
        supabase.from("organization_clients").select("id,company_name,created_at").eq("organization_id", context.organizationId).limit(ASSISTANT_MAX_ROWS),
        supabase.from("organization_suppliers").select("id,name,created_at").eq("organization_id", context.organizationId).eq("is_active", true).limit(ASSISTANT_MAX_ROWS),
      ]);
      if (clients.error) throw clients.error;
      if (suppliers.error) throw suppliers.error;
      const records = [...(clients.data ?? []).map((row) => ({ id: row.id, name: row.company_name, entityType: "client" as const, createdAt: row.created_at })), ...(suppliers.data ?? []).map((row) => ({ id: row.id, name: row.name, entityType: "supplier" as const, createdAt: row.created_at }))].slice(0, ASSISTANT_MAX_ROWS);
      if (!records.length) return emptyResult(toolName, definition.sourceService);
      return okResult(toolName, definition.sourceService, { records, note: "These are organization directory records; project-specific contact assignment is not available in Assistant V1." }, records.map((row) => ({ entityType: row.entityType, entityId: row.id, label: row.name, projectId: context.projectId, href: row.entityType === "client" ? "/app/leads-clients/clients" : "/app/company/suppliers" })), records.length, null, records.length === ASSISTANT_MAX_ROWS);
    }

    if (toolName === "retentions") {
      const result = await getProjectRetentionPosition({ projectId: context.projectId, pageSize: ASSISTANT_MAX_ROWS });
      const records = result.page.origins ?? [];
      if (!records.length) return emptyResult(toolName, definition.sourceService);
      return okResult(toolName, definition.sourceService, { summary: result.summary, records }, [citation(context, "retention_position", context.projectId, `${context.projectName} retention position`, "preconstruction/retention")], records.length, null, result.page.hasMore);
    }

    if (toolName === "qa") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase as any).from("project_qas").select("id,name,status,updated_at", { count: "exact" }).eq("organization_id", context.organizationId).eq("project_id", context.projectId).limit(ASSISTANT_MAX_ROWS);
      if (result.error) throw result.error;
      const records = (result.data ?? []).map((row: Record<string, unknown>) => ({ id: row.id, name: row.name, status: row.status, updatedAt: row.updated_at }));
      if (!records.length) return emptyResult(toolName, definition.sourceService);
      return okResult(toolName, definition.sourceService, { records, note: "This is the current structured QA engine. Legacy Existing QA Activity is a separate source and is not included in Assistant V1." }, records.map((row: Record<string, unknown>) => citation(context, "qa", String(row.id), String(row.name), `job-management/quality-assurance/${row.id}`)), records.length, result.count ?? null, (result.count ?? records.length) > records.length);
    }

    if (toolName === "documents") {
      const entry = await getProjectFilesEntry(context.projectSlug, async ({ client, workspaceId }) => listDocumentWorkspace({ client, workspaceId, query: { view: "active", page: 1, search: (options.search ?? "").slice(0, 120), fileType: "all", sort: "modified", direction: "desc", folderId: null } }));
      const records = entry?.data?.nodes.filter((node) => node.kind === "file").slice(0, ASSISTANT_MAX_ROWS) ?? [];
      if (!records.length) return emptyResult(toolName, definition.sourceService);
      return okResult(toolName, definition.sourceService, { sourceType: "document_metadata", note: "Only authorized document metadata is available; file contents and signed URLs are not sent to the provider.", records: records.map((node) => ({ nodeId: node.nodeId, displayName: node.displayName, mimeType: node.mimeType, fileExtension: node.fileExtension, versionNumber: node.versionNumber, uploadState: node.uploadState, updatedAt: node.updatedAt })) }, records.map((node) => citation(context, "document", node.nodeId, `Document: ${node.displayName}`, "files")), records.length, null, records.length === ASSISTANT_MAX_ROWS);
    }

    return { toolName, sourceService: definition.sourceService, status: "unavailable", reasonCode: "UNIMPLEMENTED_READ_ADAPTER", safeMessage: "TradesStack Assistant does not yet have access to that data." };
  } catch (error) {
    return failedResult(toolName, definition.sourceService, error);
  }
}

export function selectAssistantTools(message: string, enabledModules: string[]) {
  const text = message.toLowerCase();
  const selected = new Set<string>(["project_overview"]);
  if (/how are we looking|briefing|pm view|qs view|estimator view|procurement view|qa view|commercial position|commercially exposed|what should i chase|what needs my attention|construction brain/.test(text)) selected.add("project_briefing");
  if (/activity|recent|uploaded|latest|what changed|timeline|today|attention|worry|chase/.test(text)) selected.add("project_activity");
  if (/quote|tender|price|pricing|estimate/.test(text)) selected.add("quotes");
  if (/purchase order|\bpos?\b|procurement|supplier commitment|bought|buy/.test(text)) selected.add("purchase_orders");
  if (/material|labour|labor|component|breakdown|committed|ordered|bought|purchased|line item/.test(text) && /purchase order|\bpos?\b|procurement|bought|buy|ordered|purchased/.test(text)) selected.add("purchase_order_details");
  if (/variation|change order|\bvos?\b|extra|signed off/.test(text)) selected.add("variations");
  if (/material|labour|labor|component|breakdown|highest|percentage|cost type|line item/.test(text) && /variation|change order|\bvos?\b|extra/.test(text)) selected.add("variation_details");
  if (/claim|invoice|payment/.test(text)) selected.add("payment_claims");
  if (/claim|claimed|claimed to date|variation.*claim|claim.*variation|claim line/.test(text)) selected.add("claim_details");
  if (/retention/.test(text)) selected.add("retentions");
  if (/contact|client|supplier/.test(text)) selected.add("contacts");
  if (/qa|quality|inspection|defect|hold point/.test(text)) selected.add("qa");
  if (/document|file|drawing|spec/.test(text)) selected.add("documents");
  return [...selected].filter((tool) => enabledModules.includes(tool)).slice(0, 4);
}
