import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getCurrentOrganizationMember,
  getOrganizationProjectBySlugForCurrentUser,
} from "@/lib/projects-server";
import type { Database } from "@/lib/supabase/types";

type ProjectQuoteRow = Database["public"]["Tables"]["project_quotes"]["Row"];
type ProjectVariationRow = Database["public"]["Tables"]["project_variations"]["Row"];
type CostItemRow = Database["public"]["Tables"]["cost_items"]["Row"];
type PurchaseOrderRow = Database["public"]["Tables"]["project_purchase_orders"]["Row"];
type PurchaseOrderLineRow = Database["public"]["Tables"]["project_purchase_order_line_items"]["Row"];
type ActualCostEventRow = Database["public"]["Tables"]["project_actual_cost_events"]["Row"];
type SupplierInvoiceRow = Database["public"]["Tables"]["supplier_invoices"]["Row"];
type SupplierRow = Database["public"]["Tables"]["organization_suppliers"]["Row"];

type ClassificationKey = string;

export interface ProjectCostReportEstimateLine {
  id: string;
  description: string;
  section: string | null;
  quantity: number;
  unit: string | null;
  unitRate: number;
  lineTotal: number;
  sourceType: "quote" | "variation" | "adjustment";
  sourceDocumentId: string | null;
  sourceReference: string | null;
}

export interface ProjectCostReportCommittedLine {
  id: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  purchaseOrderTitle: string | null;
  purchaseOrderStatus: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  rate: number;
  total: number;
  costItemId: string | null;
  sourceCostItemId: string | null;
}

export interface ProjectCostReportActualEvent {
  id: string;
  eventDate: string;
  createdAt: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  eventType: "posting" | "reversal";
  ledgerLabel: "Posting" | "Reversal" | "Repost";
  correctionRootEventId: string | null;
  reversesEventId: string | null;
  reversalReason: string | null;
  reversalNote: string | null;
  isCorrectionChain: boolean;
  supplierInvoiceId: string | null;
  supplierInvoiceNumber: string | null;
  supplierReference: string | null;
  supplierName: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  purchaseOrderLineItemId: string | null;
  matchLabel: "Matched" | "Unmatched";
  costItemId: string | null;
  sourceCostItemId: string | null;
}

export interface ProjectCostReportRowDrilldown {
  estimatedSubtotal: number;
  committedSubtotal: number;
  actualSubtotal: number;
  estimatedLines: ProjectCostReportEstimateLine[];
  committedLines: ProjectCostReportCommittedLine[];
  actualEvents: ProjectCostReportActualEvent[];
}

export interface ProjectCostReportRow {
  key: string;
  classificationLabel: string;
  internalCostCode: string | null;
  workType: string | null;
  costType: string | null;
  estimated: number;
  committed: number;
  actual: number;
  varianceAmount: number;
  variancePercent: number | null;
  isUnmatchedActual: boolean;
  isBudgetAdjustment: boolean;
  drilldown: ProjectCostReportRowDrilldown;
}

export interface ProjectCostReportData {
  organizationId: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  taxBasisLabel: "Excl. GST";
  baselineQuote: {
    id: string;
    quoteNumber: string;
    status: string;
  } | null;
  summary: {
    originalBudget: number;
    approvedVariations: number;
    currentBudget: number;
    estimated: number;
    committed: number;
    actual: number;
    varianceAmount: number;
    variancePercent: number | null;
  };
  rows: ProjectCostReportRow[];
  states: {
    hasBaselineQuote: boolean;
    hasCommittedCosts: boolean;
    hasPostedActuals: boolean;
    hasReportRows: boolean;
  };
}

const INCLUDED_COMMITTED_STATUSES = new Set(["Approved", "Issued", "Received", "Invoiced"]);
const INCLUDED_APPROVED_VARIATION_STATUSES = new Set(["Approved"]);

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function firstPresentText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function pickPreferredQuote(quotes: ProjectQuoteRow[]) {
  const sortedQuotes = [...quotes].sort((left, right) => {
    const leftAt = new Date(left.updated_at ?? left.created_at).getTime();
    const rightAt = new Date(right.updated_at ?? right.created_at).getTime();
    return rightAt - leftAt;
  });

  const accepted = sortedQuotes.find((quote) => quote.status === "Accepted");
  if (accepted) {
    return accepted;
  }

  const sent = sortedQuotes.find((quote) => quote.status === "Sent");
  if (sent) {
    return sent;
  }

  return sortedQuotes[0] ?? null;
}

function buildClassificationKey(parts: {
  internalCostCode: string | null;
  workType: string | null;
  costType: string | null;
  unmatchedActual?: boolean;
}) {
  if (parts.unmatchedActual) {
    return "__unmatched_actual__";
  }

  return [parts.internalCostCode ?? "", parts.workType ?? "", parts.costType ?? ""].join("|");
}

function toClassificationLabel(params: {
  internalCostCode: string | null;
  workType: string | null;
  costType: string | null;
  isUnmatchedActual: boolean;
}) {
  if (params.isUnmatchedActual) {
    return "Unmatched actuals";
  }

  if (params.internalCostCode) {
    return params.internalCostCode;
  }

  if (params.workType || params.costType) {
    return [params.workType, params.costType].filter(Boolean).join(" / ");
  }

  return "Unclassified";
}

function calculateRemainingPercent(remaining: number, budget: number) {
  if (budget === 0) {
    return null;
  }

  return (remaining / budget) * 100;
}

function calculateCommercialPreGstTotal(params: {
  subtotal: number | null | undefined;
  marginPercent: number | null | undefined;
  discountAmount: number | null | undefined;
  contingencyAmount: number | null | undefined;
}) {
  const subtotal = Number(params.subtotal ?? 0);
  const marginPercent = Number(params.marginPercent ?? 0);
  const discountAmount = Number(params.discountAmount ?? 0);
  const contingencyAmount = Number(params.contingencyAmount ?? 0);

  return roundMoney(
    Math.max(0, subtotal + subtotal * (marginPercent / 100) + contingencyAmount - discountAmount)
  );
}

function resolveCommittedLineClassification(params: {
  line: Pick<PurchaseOrderLineRow, "cost_item_id" | "source_cost_item_id">;
  costItemById: Map<string, Pick<CostItemRow, "id" | "cost_code" | "work_type" | "cost_type">>;
}) {
  const sourceCostItem = params.line.source_cost_item_id
    ? params.costItemById.get(params.line.source_cost_item_id) ?? null
    : null;
  const costItem = params.line.cost_item_id
    ? params.costItemById.get(params.line.cost_item_id) ?? null
    : null;

  const internalCostCode = firstPresentText(sourceCostItem?.cost_code, costItem?.cost_code);
  const workType = firstPresentText(sourceCostItem?.work_type, costItem?.work_type);
  const costType = firstPresentText(sourceCostItem?.cost_type, costItem?.cost_type);

  return {
    internalCostCode,
    workType,
    costType,
  };
}

function resolveActualEventClassification(event: Pick<
  ActualCostEventRow,
  "internal_cost_code" | "work_type" | "cost_type" | "cost_item_id" | "source_cost_item_id"
>) {
  const internalCostCode = normalizeText(event.internal_cost_code);
  const workType = normalizeText(event.work_type);
  const costType = normalizeText(event.cost_type);
  const isUnmatchedActual =
    !internalCostCode &&
    !workType &&
    !costType &&
    !event.cost_item_id &&
    !event.source_cost_item_id;

  return {
    internalCostCode,
    workType,
    costType,
    isUnmatchedActual,
  };
}

function deriveActualLedgerLabel(event: Pick<
  ActualCostEventRow,
  "id" | "event_type" | "correction_root_event_id"
>): "Posting" | "Reversal" | "Repost" {
  if (event.event_type === "reversal") {
    return "Reversal";
  }

  if (event.correction_root_event_id && event.correction_root_event_id !== event.id) {
    return "Repost";
  }

  return "Posting";
}

function createEmptyDrilldown(): ProjectCostReportRowDrilldown {
  return {
    estimatedSubtotal: 0,
    committedSubtotal: 0,
    actualSubtotal: 0,
    estimatedLines: [],
    committedLines: [],
    actualEvents: [],
  };
}

function upsertRowMetric(
  rowMap: Map<ClassificationKey, ProjectCostReportRow>,
  params: {
    key: ClassificationKey;
    internalCostCode: string | null;
    workType: string | null;
    costType: string | null;
    estimated?: number;
    committed?: number;
    actual?: number;
    isUnmatchedActual?: boolean;
  }
) {
  const current =
    rowMap.get(params.key) ??
    {
      key: params.key,
      classificationLabel: toClassificationLabel({
        internalCostCode: params.internalCostCode,
        workType: params.workType,
        costType: params.costType,
        isUnmatchedActual: params.isUnmatchedActual === true,
      }),
      internalCostCode: params.internalCostCode,
      workType: params.workType,
      costType: params.costType,
      estimated: 0,
      committed: 0,
      actual: 0,
      varianceAmount: 0,
      variancePercent: null,
      isUnmatchedActual: params.isUnmatchedActual === true,
      isBudgetAdjustment: false,
      drilldown: createEmptyDrilldown(),
    } satisfies ProjectCostReportRow;

  current.estimated = roundMoney(current.estimated + (params.estimated ?? 0));
  current.committed = roundMoney(current.committed + (params.committed ?? 0));
  current.actual = roundMoney(current.actual + (params.actual ?? 0));
  current.varianceAmount = roundMoney(current.estimated - current.actual);
  current.variancePercent = calculateRemainingPercent(current.varianceAmount, current.estimated);

  rowMap.set(params.key, current);
}

export async function getProjectCostReport(projectSlug: string): Promise<ProjectCostReportData | null> {
  const member = await getCurrentOrganizationMember();
  const project = await getOrganizationProjectBySlugForCurrentUser(projectSlug);

  if (!member || !project) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const organizationId = member.organization_id;
  const projectId = project.id;

  const [{ data: quoteRows, error: quoteError }, { data: actualCostRows, error: actualCostError }] = await Promise.all([
    supabase
      .from("project_quotes")
      .select("id, quote_number, status, updated_at, created_at, subtotal, margin_percent, discount_amount, contingency_amount")
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("project_actual_cost_events")
      .select(
        [
          "id",
          "created_at",
          "project_id",
          "event_date",
          "amount",
          "tax_amount",
          "total_amount",
          "event_status",
          "event_type",
          "reverses_event_id",
          "correction_root_event_id",
          "reversal_reason",
          "reversal_note",
          "work_type",
          "cost_type",
          "internal_cost_code",
          "cost_item_id",
          "source_cost_item_id",
          "supplier_invoice_id",
          "supplier_id",
          "purchase_order_id",
          "purchase_order_line_item_id",
          "source_reference",
          "supplier_invoice_line_allocation_id",
        ].join(", ")
      )
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .in("event_type", ["posting", "reversal"])
      .eq("event_status", "posted"),
  ]);

  if (quoteError) {
    throw new Error(quoteError.message);
  }

  if (actualCostError) {
    throw new Error(actualCostError.message);
  }

  const baselineQuote = pickPreferredQuote((quoteRows ?? []) as ProjectQuoteRow[]);
  const originalBudget = baselineQuote
    ? calculateCommercialPreGstTotal({
        subtotal: baselineQuote.subtotal,
        marginPercent: baselineQuote.margin_percent,
        discountAmount: baselineQuote.discount_amount,
        contingencyAmount: baselineQuote.contingency_amount,
      })
    : 0;

  const [
    { data: purchaseOrders, error: purchaseOrdersError },
    { data: estimateCostItems, error: estimateCostItemsError },
    { data: approvedVariationRowsRaw, error: approvedVariationRowsError },
  ] = await Promise.all([
    supabase
      .from("project_purchase_orders")
      .select("id, status, purchase_order_number, purchase_order_title")
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .in("status", Array.from(INCLUDED_COMMITTED_STATUSES)),
    baselineQuote
      ? supabase
          .from("cost_items")
          .select(
            "id, cost_code, work_type, cost_type, line_total, status, is_current, is_optional, title, description, section, quantity, unit, unit_rate"
          )
          .eq("organization_id", organizationId)
          .eq("project_id", projectId)
          .eq("source_document_kind", "project_quote")
          .eq("source_document_id", baselineQuote.id)
          .eq("is_current", true)
          .eq("is_optional", false)
          .neq("status", "deleted")
          .neq("status", "superseded")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("project_variations")
      .select(
        "id, variation_number, variation_title, status, subtotal, margin_percent, discount_amount, contingency_amount, approved_at, updated_at"
      )
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .in("status", Array.from(INCLUDED_APPROVED_VARIATION_STATUSES))
      .order("approved_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false }),
  ]);

  if (purchaseOrdersError) {
    throw new Error(purchaseOrdersError.message);
  }

  if (estimateCostItemsError) {
    throw new Error(estimateCostItemsError.message);
  }
  if (approvedVariationRowsError) {
    throw new Error(approvedVariationRowsError.message);
  }

  const approvedVariationRows = (approvedVariationRowsRaw ?? []) as Pick<
    ProjectVariationRow,
    | "id"
    | "variation_number"
    | "variation_title"
    | "status"
    | "subtotal"
    | "margin_percent"
    | "discount_amount"
    | "contingency_amount"
  >[];
  const approvedVariationById = new Map(approvedVariationRows.map((row) => [row.id, row]));
  const approvedVariationIds = approvedVariationRows.map((row) => row.id);
  const approvedVariations = roundMoney(
    approvedVariationRows.reduce(
      (sum, row) =>
        sum +
        calculateCommercialPreGstTotal({
          subtotal: row.subtotal,
          marginPercent: row.margin_percent,
          discountAmount: row.discount_amount,
          contingencyAmount: row.contingency_amount,
        }),
      0
    )
  );
  const currentBudget = roundMoney(originalBudget + approvedVariations);

  const { data: approvedVariationCostItemsRaw, error: approvedVariationCostItemsError } =
    approvedVariationIds.length > 0
      ? await supabase
          .from("cost_items")
          .select(
            "id, source_document_id, cost_code, work_type, cost_type, line_total, status, is_current, is_optional, title, description, section, quantity, unit, unit_rate"
          )
          .eq("organization_id", organizationId)
          .eq("project_id", projectId)
          .eq("source_document_kind", "project_variation")
          .eq("is_current", true)
          .in("source_document_id", approvedVariationIds)
          .neq("status", "deleted")
          .neq("status", "superseded")
      : { data: [], error: null };

  if (approvedVariationCostItemsError) {
    throw new Error(approvedVariationCostItemsError.message);
  }

  const purchaseOrderRows = (purchaseOrders ?? []) as Pick<
    PurchaseOrderRow,
    "id" | "status" | "purchase_order_number" | "purchase_order_title"
  >[];
  const purchaseOrderById = new Map(purchaseOrderRows.map((row) => [row.id, row]));
  const committedPurchaseOrderIds = purchaseOrderRows.map((row) => row.id);

  const { data: committedLineRows, error: committedLinesError } =
    committedPurchaseOrderIds.length > 0
      ? await supabase
          .from("project_purchase_order_line_items")
          .select("id, purchase_order_id, description, quantity, unit, rate, total, cost_item_id, source_cost_item_id")
          .eq("organization_id", organizationId)
          .eq("project_id", projectId)
          .in("purchase_order_id", committedPurchaseOrderIds)
      : { data: [], error: null };

  if (committedLinesError) {
    throw new Error(committedLinesError.message);
  }

  const committedLines = (committedLineRows ?? []) as Pick<
    PurchaseOrderLineRow,
    | "id"
    | "purchase_order_id"
    | "description"
    | "quantity"
    | "unit"
    | "rate"
    | "total"
    | "cost_item_id"
    | "source_cost_item_id"
  >[];

  const committedCostItemIds = Array.from(
    new Set(
      committedLines
        .flatMap((line) => [line.cost_item_id, line.source_cost_item_id])
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const { data: committedCostItemsRaw, error: committedCostItemsError } =
    committedCostItemIds.length > 0
      ? await supabase
          .from("cost_items")
          .select("id, cost_code, work_type, cost_type")
          .eq("organization_id", organizationId)
          .in("id", committedCostItemIds)
      : { data: [], error: null };

  if (committedCostItemsError) {
    throw new Error(committedCostItemsError.message);
  }

  const committedCostItemById = new Map(
    ((committedCostItemsRaw ?? []) as Pick<CostItemRow, "id" | "cost_code" | "work_type" | "cost_type">[]).map((row) => [
      row.id,
      row,
    ])
  );

  const actualEvents = ((actualCostRows ?? []) as unknown) as Pick<
    ActualCostEventRow,
    | "id"
    | "created_at"
    | "event_date"
    | "amount"
    | "tax_amount"
    | "total_amount"
    | "event_type"
    | "reverses_event_id"
    | "correction_root_event_id"
    | "reversal_reason"
    | "reversal_note"
    | "internal_cost_code"
    | "work_type"
    | "cost_type"
    | "cost_item_id"
    | "source_cost_item_id"
    | "supplier_invoice_id"
    | "supplier_id"
    | "purchase_order_id"
    | "purchase_order_line_item_id"
    | "source_reference"
  >[];

  const supplierInvoiceIds = Array.from(
    new Set(actualEvents.map((event) => event.supplier_invoice_id).filter((value): value is string => Boolean(value)))
  );
  const supplierIds = Array.from(
    new Set(actualEvents.map((event) => event.supplier_id).filter((value): value is string => Boolean(value)))
  );
  const actualPurchaseOrderIds = Array.from(
    new Set(actualEvents.map((event) => event.purchase_order_id).filter((value): value is string => Boolean(value)))
  );

  const [
    { data: supplierInvoicesRaw, error: supplierInvoicesError },
    { data: suppliersRaw, error: suppliersError },
    { data: actualPurchaseOrdersRaw, error: actualPurchaseOrdersError },
  ] = await Promise.all([
    supplierInvoiceIds.length > 0
      ? supabase
          .from("supplier_invoices")
          .select("id, invoice_number")
          .eq("organization_id", organizationId)
          .in("id", supplierInvoiceIds)
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length > 0
      ? supabase
          .from("organization_suppliers")
          .select("id, company_name, name")
          .eq("organization_id", organizationId)
          .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    actualPurchaseOrderIds.length > 0
      ? supabase
          .from("project_purchase_orders")
          .select("id, purchase_order_number, purchase_order_title, status")
          .eq("organization_id", organizationId)
          .in("id", actualPurchaseOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (supplierInvoicesError) {
    throw new Error(supplierInvoicesError.message);
  }
  if (suppliersError) {
    throw new Error(suppliersError.message);
  }
  if (actualPurchaseOrdersError) {
    throw new Error(actualPurchaseOrdersError.message);
  }

  const supplierInvoiceById = new Map(
    ((supplierInvoicesRaw ?? []) as Pick<SupplierInvoiceRow, "id" | "invoice_number">[]).map((row) => [row.id, row])
  );
  const supplierById = new Map(
    ((suppliersRaw ?? []) as Pick<SupplierRow, "id" | "company_name" | "name">[]).map((row) => [row.id, row])
  );
  const actualPurchaseOrderById = new Map(
    ((actualPurchaseOrdersRaw ?? []) as Pick<
      PurchaseOrderRow,
      "id" | "purchase_order_number" | "purchase_order_title" | "status"
    >[]).map((row) => [row.id, row])
  );

  const rowMap = new Map<ClassificationKey, ProjectCostReportRow>();

  for (const item of (estimateCostItems ?? []) as Pick<
    CostItemRow,
    "id" | "cost_code" | "work_type" | "cost_type" | "line_total" | "title" | "description" | "section" | "quantity" | "unit" | "unit_rate"
  >[]) {
    const internalCostCode = normalizeText(item.cost_code);
    const workType = normalizeText(item.work_type);
    const costType = normalizeText(item.cost_type);
    const key = buildClassificationKey({ internalCostCode, workType, costType });

    upsertRowMetric(rowMap, {
      key,
      internalCostCode,
      workType,
      costType,
      estimated: Number(item.line_total ?? 0),
    });

    const row = rowMap.get(key);
    if (row) {
      row.drilldown.estimatedLines.push({
        id: item.id,
        description: normalizeText(item.description) ?? normalizeText(item.title) ?? "Estimate line",
        section: normalizeText(item.section),
        quantity: Number(item.quantity ?? 0),
        unit: normalizeText(item.unit),
        unitRate: Number(item.unit_rate ?? 0),
        lineTotal: roundMoney(Number(item.line_total ?? 0)),
        sourceType: "quote",
        sourceDocumentId: baselineQuote?.id ?? null,
        sourceReference: baselineQuote?.quote_number ?? null,
      });
      row.drilldown.estimatedSubtotal = roundMoney(
        row.drilldown.estimatedLines.reduce((sum, line) => sum + line.lineTotal, 0)
      );
    }
  }

  for (const item of (approvedVariationCostItemsRaw ?? []) as Pick<
    CostItemRow,
    | "id"
    | "source_document_id"
    | "cost_code"
    | "work_type"
    | "cost_type"
    | "line_total"
    | "title"
    | "description"
    | "section"
    | "quantity"
    | "unit"
    | "unit_rate"
  >[]) {
    const internalCostCode = normalizeText(item.cost_code);
    const workType = normalizeText(item.work_type);
    const costType = normalizeText(item.cost_type);
    const key = buildClassificationKey({ internalCostCode, workType, costType });

    upsertRowMetric(rowMap, {
      key,
      internalCostCode,
      workType,
      costType,
      estimated: Number(item.line_total ?? 0),
    });

    const variation = item.source_document_id ? approvedVariationById.get(item.source_document_id) ?? null : null;
    const row = rowMap.get(key);
    if (row) {
      row.drilldown.estimatedLines.push({
        id: item.id,
        description: normalizeText(item.description) ?? normalizeText(item.title) ?? "Variation line",
        section: normalizeText(item.section),
        quantity: Number(item.quantity ?? 0),
        unit: normalizeText(item.unit),
        unitRate: Number(item.unit_rate ?? 0),
        lineTotal: roundMoney(Number(item.line_total ?? 0)),
        sourceType: "variation",
        sourceDocumentId: variation?.id ?? item.source_document_id ?? null,
        sourceReference: variation?.variation_number ?? variation?.variation_title ?? "Approved variation",
      });
      row.drilldown.estimatedSubtotal = roundMoney(
        row.drilldown.estimatedLines.reduce((sum, line) => sum + line.lineTotal, 0)
      );
    }
  }

  for (const line of committedLines) {
    const classification = resolveCommittedLineClassification({
      line,
      costItemById: committedCostItemById,
    });
    const key = buildClassificationKey(classification);

    upsertRowMetric(rowMap, {
      key,
      internalCostCode: classification.internalCostCode,
      workType: classification.workType,
      costType: classification.costType,
      committed: Number(line.total ?? 0),
    });

    const row = rowMap.get(key);
    const purchaseOrder = line.purchase_order_id ? purchaseOrderById.get(line.purchase_order_id) ?? null : null;
    if (row) {
      row.drilldown.committedLines.push({
        id: line.id,
        purchaseOrderId: purchaseOrder?.id ?? line.purchase_order_id ?? null,
        purchaseOrderNumber: purchaseOrder?.purchase_order_number ?? null,
        purchaseOrderTitle: purchaseOrder?.purchase_order_title ?? null,
        purchaseOrderStatus: purchaseOrder?.status ?? null,
        description: normalizeText(line.description) ?? "PO line",
        quantity: Number(line.quantity ?? 0),
        unit: normalizeText(line.unit),
        rate: Number(line.rate ?? 0),
        total: roundMoney(Number(line.total ?? 0)),
        costItemId: line.cost_item_id ?? null,
        sourceCostItemId: line.source_cost_item_id ?? null,
      });
      row.drilldown.committedSubtotal = roundMoney(
        row.drilldown.committedLines.reduce((sum, committedLine) => sum + committedLine.total, 0)
      );
    }
  }

  for (const event of actualEvents) {
    const classification = resolveActualEventClassification(event);
    const ledgerLabel = deriveActualLedgerLabel(event);
    const isCorrectionChain = Boolean(
      event.event_type === "reversal" ||
      (event.correction_root_event_id && event.correction_root_event_id !== event.id)
    );
    const key = buildClassificationKey({
      internalCostCode: classification.internalCostCode,
      workType: classification.workType,
      costType: classification.costType,
      unmatchedActual: classification.isUnmatchedActual,
    });

    upsertRowMetric(rowMap, {
      key,
      internalCostCode: classification.internalCostCode,
      workType: classification.workType,
      costType: classification.costType,
      actual: Number(event.amount ?? 0),
      isUnmatchedActual: classification.isUnmatchedActual,
    });

    const row = rowMap.get(key);
    const supplierInvoice = event.supplier_invoice_id
      ? supplierInvoiceById.get(event.supplier_invoice_id) ?? null
      : null;
    const supplier = event.supplier_id ? supplierById.get(event.supplier_id) ?? null : null;
    const purchaseOrder = event.purchase_order_id
      ? actualPurchaseOrderById.get(event.purchase_order_id) ?? null
      : null;

    if (row) {
      row.drilldown.actualEvents.push({
        id: event.id,
        eventDate: event.event_date,
        createdAt: event.created_at,
        amount: roundMoney(Number(event.amount ?? 0)),
        taxAmount: roundMoney(Number(event.tax_amount ?? 0)),
        totalAmount: roundMoney(Number(event.total_amount ?? 0)),
        eventType: event.event_type as "posting" | "reversal",
        ledgerLabel,
        correctionRootEventId: event.correction_root_event_id ?? null,
        reversesEventId: event.reverses_event_id ?? null,
        reversalReason: normalizeText(event.reversal_reason),
        reversalNote: normalizeText(event.reversal_note),
        isCorrectionChain,
        supplierInvoiceId: event.supplier_invoice_id ?? null,
        supplierInvoiceNumber: supplierInvoice?.invoice_number ?? null,
        supplierReference: normalizeText(event.source_reference),
        supplierName: firstPresentText(supplier?.company_name, supplier?.name),
        purchaseOrderId: purchaseOrder?.id ?? event.purchase_order_id ?? null,
        purchaseOrderNumber: purchaseOrder?.purchase_order_number ?? null,
        purchaseOrderLineItemId: event.purchase_order_line_item_id ?? null,
        matchLabel: classification.isUnmatchedActual ? "Unmatched" : "Matched",
        costItemId: event.cost_item_id ?? null,
        sourceCostItemId: event.source_cost_item_id ?? null,
      });
      row.drilldown.actualSubtotal = roundMoney(
        row.drilldown.actualEvents.reduce((sum, actualEvent) => sum + actualEvent.amount, 0)
      );
    }
  }

  const rows = Array.from(rowMap.values())
    .map((row) => ({
      ...row,
      estimated: roundMoney(row.estimated),
      committed: roundMoney(row.committed),
      actual: roundMoney(row.actual),
      varianceAmount: roundMoney(row.estimated - row.actual),
      variancePercent: calculateRemainingPercent(roundMoney(row.estimated - row.actual), row.estimated),
      drilldown: {
        ...row.drilldown,
        estimatedLines: [...row.drilldown.estimatedLines].sort((left, right) => left.description.localeCompare(right.description)),
        committedLines: [...row.drilldown.committedLines].sort((left, right) => {
          const poCompare = (left.purchaseOrderNumber ?? "").localeCompare(right.purchaseOrderNumber ?? "");
          if (poCompare !== 0) return poCompare;
          return left.description.localeCompare(right.description);
        }),
        actualEvents: [...row.drilldown.actualEvents].sort((left, right) => {
          const leftAt = new Date(left.eventDate).getTime();
          const rightAt = new Date(right.eventDate).getTime();
          if (rightAt !== leftAt) {
            return rightAt - leftAt;
          }

          const leftCreatedAt = new Date(left.createdAt).getTime();
          const rightCreatedAt = new Date(right.createdAt).getTime();
          if (rightCreatedAt !== leftCreatedAt) {
            return rightCreatedAt - leftCreatedAt;
          }

          return right.id.localeCompare(left.id);
        }),
      },
    }))
    .sort((left, right) => {
      if (left.isUnmatchedActual !== right.isUnmatchedActual) {
        return left.isUnmatchedActual ? 1 : -1;
      }

      return (
        (left.internalCostCode ?? left.classificationLabel).localeCompare(right.internalCostCode ?? right.classificationLabel) ||
        (left.workType ?? "").localeCompare(right.workType ?? "") ||
        (left.costType ?? "").localeCompare(right.costType ?? "")
      );
    });

  const classifiedBudget = roundMoney(rows.reduce((sum, row) => sum + row.estimated, 0));
  const budgetAdjustment = roundMoney(currentBudget - classifiedBudget);
  if (budgetAdjustment !== 0) {
    const adjustmentKey = "__budget_adjustments__";
    const adjustmentRow: ProjectCostReportRow = {
      key: adjustmentKey,
      classificationLabel: "Budget adjustments",
      internalCostCode: null,
      workType: "Budget adjustments",
      costType: null,
      estimated: budgetAdjustment,
      committed: 0,
      actual: 0,
      varianceAmount: budgetAdjustment,
      variancePercent: calculateRemainingPercent(budgetAdjustment, budgetAdjustment),
      isUnmatchedActual: false,
      isBudgetAdjustment: true,
      drilldown: {
        estimatedSubtotal: budgetAdjustment,
        committedSubtotal: 0,
        actualSubtotal: 0,
        estimatedLines: [
          {
            id: adjustmentKey,
            description: "Commercial adjustments not represented in classified line items",
            section: null,
            quantity: 1,
            unit: null,
            unitRate: budgetAdjustment,
            lineTotal: budgetAdjustment,
            sourceType: "adjustment",
            sourceDocumentId: null,
            sourceReference: "Commercial adjustments",
          },
        ],
        committedLines: [],
        actualEvents: [],
      },
    };

    rows.push(adjustmentRow);
  }

  rows.sort((left, right) => {
    if (left.isUnmatchedActual !== right.isUnmatchedActual) {
      return left.isUnmatchedActual ? 1 : -1;
    }
    if (left.isBudgetAdjustment !== right.isBudgetAdjustment) {
      return left.isBudgetAdjustment ? 1 : -1;
    }
    return (
      (left.internalCostCode ?? left.classificationLabel).localeCompare(right.internalCostCode ?? right.classificationLabel) ||
      (left.workType ?? "").localeCompare(right.workType ?? "") ||
      (left.costType ?? "").localeCompare(right.costType ?? "")
    );
  });

  const estimated = roundMoney(rows.reduce((sum, row) => sum + row.estimated, 0));
  const committed = roundMoney(rows.reduce((sum, row) => sum + row.committed, 0));
  const actual = roundMoney(rows.reduce((sum, row) => sum + row.actual, 0));
  const remaining = roundMoney(estimated - actual);

  return {
    organizationId,
    projectId,
    projectSlug,
    projectName: project.name,
    taxBasisLabel: "Excl. GST",
    baselineQuote: baselineQuote
      ? {
          id: baselineQuote.id,
          quoteNumber: baselineQuote.quote_number,
          status: baselineQuote.status,
        }
      : null,
    summary: {
      originalBudget,
      approvedVariations,
      currentBudget: estimated,
      estimated,
      committed,
      actual,
      varianceAmount: remaining,
      variancePercent: calculateRemainingPercent(remaining, estimated),
    },
    rows,
    states: {
      hasBaselineQuote: baselineQuote !== null,
      hasCommittedCosts: committed > 0,
      hasPostedActuals: actualEvents.length > 0,
      hasReportRows: rows.length > 0,
    },
  };
}
