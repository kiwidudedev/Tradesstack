import "server-only";

import {
  buildProjectActualCostEventPayload,
  type ProjectActualCostEventRow,
} from "@/lib/actual-cost-events";
import type {
  OrganizationCostCodeMappingRuleRow,
  OrganizationCostCodeRow,
  ResolvedOrganizationAccountingCode,
} from "@/lib/accounting/types";
import {
  buildAccountingResolutionInput,
  resolveInheritedAccountingCode,
  resolvePurchaseOrderLineLineage,
  type CostItemRow,
  type PurchaseOrderLineItemRow,
  type SupplierInvoiceLineRow,
  validateSupplierInvoiceOrgConsistency,
} from "@/lib/supplier-invoice-lineage";
import {
  createSupplierInvoiceLineAllocationDraft,
  createUnmatchedSupplierInvoiceLineAllocationDraft,
  type SupplierInvoiceLineAllocationRow,
} from "@/lib/supplier-invoice-allocations";
import {
  buildSupplierInvoiceIntelligenceEvent,
  createSupplierInvoiceAiInteraction,
  createSupplierInvoiceValidationCase,
  hasAiSupplierInvoiceAllocationSuggestion,
  logSupplierInvoiceIntelligenceFailure,
  summarizeSupplierInvoiceAllocation,
  summarizeSupplierInvoiceActualCostEvent,
  writeSupplierInvoiceIntelligenceEvents,
} from "@/lib/supplier-invoice-intelligence";
import type { Database, Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServerSupabase = SupabaseClient<Database>;
type SupplierInvoiceRow = Database["public"]["Tables"]["supplier_invoices"]["Row"];
type SupplierInvoiceActivityEventInsert =
  Database["public"]["Tables"]["supplier_invoice_activity_events"]["Insert"];
type OrganizationProjectRow = Database["public"]["Tables"]["organization_projects"]["Row"];

export type SupplierInvoiceDraftAllocationCandidateInput = {
  invoiceLineId: string;
  purchaseOrderLineItemId: string;
};

type AcceptedDraftContext = {
  invoice: SupplierInvoiceRow;
  invoiceLine: SupplierInvoiceLineRow;
  purchaseOrderLine: PurchaseOrderLineItemRow;
  lineage: ReturnType<typeof resolvePurchaseOrderLineLineage>;
  accountingResolution: ResolvedOrganizationAccountingCode | null;
};

type AllocationReviewContext = {
  invoice: SupplierInvoiceRow;
  invoiceLine: SupplierInvoiceLineRow;
  allocation: SupplierInvoiceLineAllocationRow;
  purchaseOrderLine: PurchaseOrderLineItemRow | null;
  costItem: CostItemRow | null;
  sourceCostItem: CostItemRow | null;
  project: OrganizationProjectRow | null;
};

export type SupplierInvoiceActualCostPostingResult = {
  postedEvents: ProjectActualCostEventRow[];
  postedCount: number;
  postedAmount: number;
  skippedCount: number;
  skippedMessages: string[];
};

export type SupplierInvoiceActualCostReversalResult = {
  originalEvent: ProjectActualCostEventRow;
  reversalEvent: ProjectActualCostEventRow;
  successorAllocation: SupplierInvoiceLineAllocationRow;
  supplierInvoiceId: string;
  projectId: string;
};

type ReverseSupplierInvoiceActualCostEventRpcRow =
  Database["public"]["Functions"]["reverse_supplier_invoice_actual_cost_event"]["Returns"][number];

function toNumber(value: number | null | undefined) {
  return Number(value ?? 0);
}

async function fetchInvoiceDraftAllocations(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
}) {
  const { data, error } = await params.supabase
    .from("supplier_invoice_line_allocations")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .order("supplier_invoice_line_id", { ascending: true })
    .order("allocation_sequence", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SupplierInvoiceLineAllocationRow[];
}

async function insertSupplierInvoiceActivityEvents(params: {
  supabase: ServerSupabase;
  events: SupplierInvoiceActivityEventInsert[];
}) {
  if (params.events.length === 0) {
    return;
  }

  const { error } = await params.supabase
    .from("supplier_invoice_activity_events")
    .insert(params.events);

  if (error) {
    throw new Error(error.message);
  }
}

async function fetchActualCostEventsForInvoice(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
}) {
  const { data, error } = await params.supabase
    .from("project_actual_cost_events")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProjectActualCostEventRow[];
}

async function loadActualCostEventRow(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  eventId: string;
}) {
  const { data, error } = await params.supabase
    .from("project_actual_cost_events")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .eq("id", params.eventId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Actual cost event not found.");
  }

  return data as ProjectActualCostEventRow;
}

async function fetchPostedActualCostEventsByAllocationIds(params: {
  supabase: ServerSupabase;
  organizationId: string;
  allocationIds: string[];
}) {
  if (params.allocationIds.length === 0) {
    return [] as ProjectActualCostEventRow[];
  }

  const { data, error } = await params.supabase
    .from("project_actual_cost_events")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("event_status", "posted")
    .in("source_invoice_allocation_id", params.allocationIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProjectActualCostEventRow[];
}

async function loadInvoiceRow(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
}) {
  const { data, error } = await params.supabase
    .from("supplier_invoices")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.supplierInvoiceId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Supplier invoice not found.");
  }

  return data as SupplierInvoiceRow;
}

async function loadMatchedPurchaseOrderIds(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
}) {
  const { data, error } = await params.supabase
    .from("supplier_invoice_purchase_order_matches")
    .select("purchase_order_id")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .in("match_status", ["accepted", "adjusted"]);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data ?? [])
      .map((row) => row.purchase_order_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
}

async function loadInvoiceLinesById(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  invoiceLineIds: string[];
}) {
  const { data, error } = await params.supabase
    .from("supplier_invoice_lines")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .in("id", params.invoiceLineIds);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as SupplierInvoiceLineRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadAllocationRow(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  allocationId: string;
}) {
  const { data, error } = await params.supabase
    .from("supplier_invoice_line_allocations")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .eq("id", params.allocationId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Supplier invoice line allocation not found.");
  }

  return data as SupplierInvoiceLineAllocationRow;
}

async function loadPurchaseOrderLinesById(params: {
  supabase: ServerSupabase;
  organizationId: string;
  purchaseOrderLineItemIds: string[];
}) {
  const { data, error } = await params.supabase
    .from("project_purchase_order_line_items")
    .select("*")
    .eq("organization_id", params.organizationId)
    .in("id", params.purchaseOrderLineItemIds);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as PurchaseOrderLineItemRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadCostItemsById(params: {
  supabase: ServerSupabase;
  organizationId: string;
  costItemIds: string[];
}) {
  if (params.costItemIds.length === 0) {
    return new Map<string, CostItemRow>();
  }

  const { data, error } = await params.supabase
    .from("cost_items")
    .select("*")
    .eq("organization_id", params.organizationId)
    .in("id", params.costItemIds);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as CostItemRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadProjectsById(params: {
  supabase: ServerSupabase;
  organizationId: string;
  projectIds: string[];
}) {
  if (params.projectIds.length === 0) {
    return new Map<string, OrganizationProjectRow>();
  }

  const { data, error } = await params.supabase
    .from("organization_projects")
    .select("*")
    .eq("organization_id", params.organizationId)
    .in("id", params.projectIds);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as OrganizationProjectRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadAccountingMappings(params: {
  supabase: ServerSupabase;
  organizationId: string;
}) {
  const [{ data: costCodes, error: costCodesError }, { data: mappingRules, error: mappingRulesError }] =
    await Promise.all([
      params.supabase
        .from("organization_cost_codes")
        .select("*")
        .eq("organization_id", params.organizationId),
      params.supabase
        .from("organization_cost_code_mapping_rules")
        .select("*")
        .eq("organization_id", params.organizationId),
    ]);

  if (costCodesError) {
    throw new Error(costCodesError.message);
  }
  if (mappingRulesError) {
    throw new Error(mappingRulesError.message);
  }

  return {
    costCodes: (costCodes ?? []) as OrganizationCostCodeRow[],
    mappingRules: (mappingRules ?? []) as OrganizationCostCodeMappingRuleRow[],
  };
}

function assertWritePermissions(params: {
  canWrite: boolean;
  canReview: boolean;
  reviewStatus: string | null | undefined;
}) {
  if (!params.canWrite) {
    throw new Error("You do not have permission to save draft invoice allocations.");
  }

  if (
    (params.reviewStatus === "needs_cost_review" || params.reviewStatus === "needs_accounting_review") &&
    !params.canReview
  ) {
    throw new Error("You do not have permission to save draft allocations that require review.");
  }
}

function assertReviewPermissions(params: {
  canReview: boolean;
}) {
  if (!params.canReview) {
    throw new Error("You do not have permission to review supplier invoice line allocations.");
  }
}

function formatInvoiceLineLabel(line: SupplierInvoiceLineRow) {
  return line.description?.trim() || "supplier invoice line";
}

function formatLineAllocationActivityMessage(params: {
  action: "approved" | "disputed" | "reset";
  invoiceLine: SupplierInvoiceLineRow;
  purchaseOrderLine: PurchaseOrderLineItemRow | null;
  note?: string | null;
}) {
  const lineLabel = formatInvoiceLineLabel(params.invoiceLine);
  const poLabel = params.purchaseOrderLine?.description?.trim() || "unmatched allocation";

  switch (params.action) {
    case "approved":
      return `Approved line allocation for ${lineLabel} against ${poLabel}.`;
    case "disputed":
      return params.note?.trim()
        ? `Disputed line allocation for ${lineLabel}: ${params.note.trim()}`
        : `Disputed line allocation for ${lineLabel}.`;
    case "reset":
    default:
      return `Line allocation review reset after updating ${lineLabel}.`;
  }
}

function formatActualCostPostingMessage(params: {
  postedCount: number;
  postedAmount: number;
}) {
  const label = params.postedCount === 1 ? "actual cost event" : "actual cost events";
  return `Posted ${params.postedCount} ${label} totalling $${params.postedAmount.toFixed(2)}.`;
}

function formatActualCostPostingSkippedMessage(params: {
  skippedCount: number;
}) {
  return params.skippedCount === 1
    ? "Skipped 1 allocation during actual cost posting."
    : `Skipped ${params.skippedCount} allocations during actual cost posting.`;
}

async function emitSupplierInvoiceIntelligenceEvents(params: {
  supabase: ServerSupabase;
  events: Array<ReturnType<typeof buildSupplierInvoiceIntelligenceEvent>>;
  action: string;
}) {
  if (params.events.length === 0) {
    return;
  }

  try {
    await writeSupplierInvoiceIntelligenceEvents(params.supabase, params.events);
  } catch (error) {
    logSupplierInvoiceIntelligenceFailure(params.action, error);
  }
}

async function prepareAcceptedDraftContexts(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  candidates: SupplierInvoiceDraftAllocationCandidateInput[];
}) {
  const invoice = await loadInvoiceRow(params);
  const matchedPurchaseOrderIds = await loadMatchedPurchaseOrderIds(params);

  if (matchedPurchaseOrderIds.size === 0) {
    throw new Error("Match this invoice to at least one purchase order before saving draft allocations.");
  }

  const uniqueInvoiceLineIds = Array.from(new Set(params.candidates.map((candidate) => candidate.invoiceLineId)));
  if (uniqueInvoiceLineIds.length !== params.candidates.length) {
    throw new Error("Only one draft allocation can be saved per invoice line in this phase.");
  }

  const uniquePurchaseOrderLineIds = Array.from(
    new Set(params.candidates.map((candidate) => candidate.purchaseOrderLineItemId))
  );
  const [invoiceLineById, purchaseOrderLineById, accountingMappings] = await Promise.all([
    loadInvoiceLinesById({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      invoiceLineIds: uniqueInvoiceLineIds,
    }),
    loadPurchaseOrderLinesById({
      supabase: params.supabase,
      organizationId: params.organizationId,
      purchaseOrderLineItemIds: uniquePurchaseOrderLineIds,
    }),
    loadAccountingMappings({
      supabase: params.supabase,
      organizationId: params.organizationId,
    }),
  ]);

  const costItemIds = Array.from(
    new Set(
      Array.from(purchaseOrderLineById.values())
        .flatMap((line) => [line.cost_item_id, line.source_cost_item_id])
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const projectIds = Array.from(
    new Set(
      Array.from(purchaseOrderLineById.values())
        .map((line) => line.project_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const [costItemById, projectById] = await Promise.all([
    loadCostItemsById({
      supabase: params.supabase,
      organizationId: params.organizationId,
      costItemIds,
    }),
    loadProjectsById({
      supabase: params.supabase,
      organizationId: params.organizationId,
      projectIds,
    }),
  ]);

  return params.candidates.map((candidate) => {
    const invoiceLine = invoiceLineById.get(candidate.invoiceLineId) ?? null;
    if (!invoiceLine) {
      throw new Error("One or more supplier invoice lines no longer exist. Save and reload the invoice, then try again.");
    }

    const purchaseOrderLine = purchaseOrderLineById.get(candidate.purchaseOrderLineItemId) ?? null;
    if (!purchaseOrderLine) {
      throw new Error("One or more purchase order lines could not be found.");
    }

    if (!matchedPurchaseOrderIds.has(purchaseOrderLine.purchase_order_id)) {
      throw new Error("Draft allocations can only use purchase order lines from already matched purchase orders.");
    }

    const costItem = purchaseOrderLine.cost_item_id
      ? costItemById.get(purchaseOrderLine.cost_item_id) ?? null
      : null;
    const sourceCostItem = purchaseOrderLine.source_cost_item_id
      ? costItemById.get(purchaseOrderLine.source_cost_item_id) ?? null
      : null;
    const project = projectById.get(purchaseOrderLine.project_id) ?? null;

    validateSupplierInvoiceOrgConsistency(params.organizationId, {
      invoiceOrganizationId: invoice.organization_id,
      invoiceLineOrganizationId: invoiceLine.organization_id,
      purchaseOrderLineOrganizationId: purchaseOrderLine.organization_id,
      projectOrganizationId: project?.organization_id ?? null,
      costItemOrganizationId: costItem?.organization_id ?? null,
      sourceCostItemOrganizationId: sourceCostItem?.organization_id ?? null,
    });

    const lineage = resolvePurchaseOrderLineLineage({
      purchaseOrderLine,
      costItem,
      sourceCostItem,
    });
    const accountingResolution = resolveInheritedAccountingCode({
      costCodes: accountingMappings.costCodes,
      mappingRules: accountingMappings.mappingRules,
      input: buildAccountingResolutionInput({
        costItemId: lineage.costItemId ?? lineage.sourceCostItemId,
        projectId: lineage.projectId,
        title: invoiceLine.description ?? "Supplier invoice line",
        description: invoiceLine.description ?? "",
        lineage,
      }),
    });

    return {
      invoice,
      invoiceLine,
      purchaseOrderLine,
      lineage,
      accountingResolution,
    } satisfies AcceptedDraftContext;
  });
}

async function loadAllocationReviewContext(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  allocationId: string;
}) {
  const allocation = await loadAllocationRow(params);
  const invoice = await loadInvoiceRow(params);
  const invoiceLineById = await loadInvoiceLinesById({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    invoiceLineIds: [allocation.supplier_invoice_line_id],
  });
  const invoiceLine = invoiceLineById.get(allocation.supplier_invoice_line_id) ?? null;

  if (!invoiceLine) {
    throw new Error("The supplier invoice line for this allocation could not be found.");
  }

  const purchaseOrderLineById = allocation.purchase_order_line_item_id
    ? await loadPurchaseOrderLinesById({
        supabase: params.supabase,
        organizationId: params.organizationId,
        purchaseOrderLineItemIds: [allocation.purchase_order_line_item_id],
      })
    : new Map<string, PurchaseOrderLineItemRow>();
  const purchaseOrderLine = allocation.purchase_order_line_item_id
    ? purchaseOrderLineById.get(allocation.purchase_order_line_item_id) ?? null
    : null;

  const costItemIds = [allocation.cost_item_id, allocation.source_cost_item_id].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  const costItemById = await loadCostItemsById({
    supabase: params.supabase,
    organizationId: params.organizationId,
    costItemIds,
  });
  const costItem = allocation.cost_item_id
    ? costItemById.get(allocation.cost_item_id) ?? null
    : null;
  const sourceCostItem = allocation.source_cost_item_id
    ? costItemById.get(allocation.source_cost_item_id) ?? null
    : null;

  const projectById = await loadProjectsById({
    supabase: params.supabase,
    organizationId: params.organizationId,
    projectIds: allocation.project_id ? [allocation.project_id] : [],
  });
  const project = allocation.project_id ? projectById.get(allocation.project_id) ?? null : null;

  validateSupplierInvoiceOrgConsistency(params.organizationId, {
    invoiceOrganizationId: invoice.organization_id,
    invoiceLineOrganizationId: invoiceLine.organization_id,
    purchaseOrderLineOrganizationId: purchaseOrderLine?.organization_id ?? null,
    projectOrganizationId: project?.organization_id ?? null,
    costItemOrganizationId: costItem?.organization_id ?? null,
    sourceCostItemOrganizationId: sourceCostItem?.organization_id ?? null,
  });

  return {
    invoice,
    invoiceLine,
    allocation,
    purchaseOrderLine,
    costItem,
    sourceCostItem,
    project,
  } satisfies AllocationReviewContext;
}

async function replaceDraftAllocationsForLines(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  invoiceLineIds: string[];
  payloads: Database["public"]["Tables"]["supplier_invoice_line_allocations"]["Insert"][];
  actorUserId: string;
  existingInvoiceLines?: Map<string, SupplierInvoiceLineRow>;
}) {
  const existingAllocations = await fetchInvoiceDraftAllocations({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });
  const allocationsToReplace = existingAllocations.filter((allocation) =>
    params.invoiceLineIds.includes(allocation.supplier_invoice_line_id)
  );
  const postedActualCostEvents = await fetchPostedActualCostEventsByAllocationIds({
    supabase: params.supabase,
    organizationId: params.organizationId,
    allocationIds: allocationsToReplace.map((allocation) => allocation.id),
  });
  if (postedActualCostEvents.length > 0) {
    throw new Error(
      "One or more allocations on this invoice already have posted actual costs and cannot be replaced."
    );
  }
  const reviewedAllocationsToReset = existingAllocations.filter(
    (allocation) =>
      params.invoiceLineIds.includes(allocation.supplier_invoice_line_id) &&
      (allocation.approval_status === "approved" ||
        allocation.approval_status === "disputed" ||
        allocation.review_status === "reviewed" ||
        allocation.review_status === "disputed")
  );

  const { error: deleteError } = await params.supabase
    .from("supplier_invoice_line_allocations")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .in("supplier_invoice_line_id", params.invoiceLineIds);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (params.payloads.length > 0) {
    const { error: insertError } = await params.supabase
      .from("supplier_invoice_line_allocations")
      .insert(params.payloads);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  if (reviewedAllocationsToReset.length > 0) {
    const invoiceLineIdsToLoad = Array.from(
      new Set(reviewedAllocationsToReset.map((allocation) => allocation.supplier_invoice_line_id))
    );
    const invoiceLineById =
      params.existingInvoiceLines ??
      (await loadInvoiceLinesById({
        supabase: params.supabase,
        organizationId: params.organizationId,
        supplierInvoiceId: params.supplierInvoiceId,
        invoiceLineIds: invoiceLineIdsToLoad,
      }));

    await insertSupplierInvoiceActivityEvents({
      supabase: params.supabase,
      events: reviewedAllocationsToReset.map((allocation) => ({
        organization_id: params.organizationId,
        supplier_invoice_id: params.supplierInvoiceId,
        event_type: "allocation_approval_changed",
        message: formatLineAllocationActivityMessage({
          action: "reset",
          invoiceLine:
            invoiceLineById.get(allocation.supplier_invoice_line_id) ?? {
              id: allocation.supplier_invoice_line_id,
              description: "supplier invoice line",
            } as SupplierInvoiceLineRow,
          purchaseOrderLine: null,
        }),
        metadata: {
          allocation_id: allocation.id,
          supplier_invoice_line_id: allocation.supplier_invoice_line_id,
          previous_approval_status: allocation.approval_status,
          previous_review_status: allocation.review_status,
          reason: "allocation_changed",
        },
        created_by: params.actorUserId,
      })),
    });
  }

  try {
    const refreshedAllocations = await fetchInvoiceDraftAllocations({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
    });
    const currentAllocationByInvoiceLineId = new Map(
      refreshedAllocations
        .filter((allocation) => params.invoiceLineIds.includes(allocation.supplier_invoice_line_id))
        .map((allocation) => [allocation.supplier_invoice_line_id, allocation])
    );
    const intelligenceEvents: Array<ReturnType<typeof buildSupplierInvoiceIntelligenceEvent>> = [];

    allocationsToReplace.forEach((previousAllocation) => {
      const nextAllocation = currentAllocationByInvoiceLineId.get(previousAllocation.supplier_invoice_line_id) ?? null;
      if (!nextAllocation) {
        return;
      }

      const changedPurchaseOrderLine =
        previousAllocation.purchase_order_line_item_id !== nextAllocation.purchase_order_line_item_id;
      const changedAmount =
        Number(previousAllocation.allocated_amount ?? 0) !== Number(nextAllocation.allocated_amount ?? 0);
      const changedCostCode =
        previousAllocation.organization_cost_code_id !== nextAllocation.organization_cost_code_id;

      if (changedPurchaseOrderLine || changedAmount || changedCostCode) {
        intelligenceEvents.push(
          buildSupplierInvoiceIntelligenceEvent({
            organizationId: params.organizationId,
            projectId: nextAllocation.project_id,
            module: "supplier_invoices",
            eventFamily: "correction",
            eventType: "supplier_invoice_allocation_corrected",
            action: "corrected",
            entityType: "supplier_invoice_line_allocation",
            entityId: nextAllocation.id,
            beforeData: summarizeSupplierInvoiceAllocation({
              supplierInvoiceId: previousAllocation.supplier_invoice_id,
              supplierInvoiceLineId: previousAllocation.supplier_invoice_line_id,
              purchaseOrderId: previousAllocation.purchase_order_id,
              purchaseOrderLineItemId: previousAllocation.purchase_order_line_item_id,
              projectId: previousAllocation.project_id,
              allocatedAmount: previousAllocation.allocated_amount,
              allocationStatus: previousAllocation.allocation_status,
              reviewStatus: previousAllocation.review_status,
              approvalStatus: previousAllocation.approval_status,
              classificationStatus: previousAllocation.classification_status,
              accountingResolutionStatus: previousAllocation.accounting_resolution_status,
              organizationCostCodeId: previousAllocation.organization_cost_code_id,
              aiConfidenceScore: previousAllocation.ai_confidence_score,
              aiSuggestedPurchaseOrderLineItemId: previousAllocation.ai_suggested_purchase_order_line_item_id,
            }),
            afterData: summarizeSupplierInvoiceAllocation({
              supplierInvoiceId: nextAllocation.supplier_invoice_id,
              supplierInvoiceLineId: nextAllocation.supplier_invoice_line_id,
              purchaseOrderId: nextAllocation.purchase_order_id,
              purchaseOrderLineItemId: nextAllocation.purchase_order_line_item_id,
              projectId: nextAllocation.project_id,
              allocatedAmount: nextAllocation.allocated_amount,
              allocationStatus: nextAllocation.allocation_status,
              reviewStatus: nextAllocation.review_status,
              approvalStatus: nextAllocation.approval_status,
              classificationStatus: nextAllocation.classification_status,
              accountingResolutionStatus: nextAllocation.accounting_resolution_status,
              organizationCostCodeId: nextAllocation.organization_cost_code_id,
              aiConfidenceScore: nextAllocation.ai_confidence_score,
              aiSuggestedPurchaseOrderLineItemId: nextAllocation.ai_suggested_purchase_order_line_item_id,
            }),
            metadata: {
              supplierInvoiceLineId: nextAllocation.supplier_invoice_line_id,
            },
            reason: "Supplier invoice draft allocation changed after review or correction.",
          })
        );
      }

      if (reviewedAllocationsToReset.some((allocation) => allocation.id === previousAllocation.id)) {
        intelligenceEvents.push(
          buildSupplierInvoiceIntelligenceEvent({
            organizationId: params.organizationId,
            projectId: nextAllocation.project_id,
            module: "supplier_invoices",
            eventFamily: "validation",
            eventType: "supplier_invoice_approval_requested",
            action: "requested",
            entityType: "supplier_invoice_line_allocation",
            entityId: nextAllocation.id,
            beforeData: { approvalStatus: previousAllocation.approval_status, reviewStatus: previousAllocation.review_status },
            afterData: { approvalStatus: nextAllocation.approval_status, reviewStatus: nextAllocation.review_status },
            metadata: {
              supplierInvoiceLineId: nextAllocation.supplier_invoice_line_id,
            },
            reason: "Allocation review reopened after a material allocation change.",
          })
        );
      }
    });

    currentAllocationByInvoiceLineId.forEach((allocation) => {
      if (!hasAiSupplierInvoiceAllocationSuggestion(allocation)) {
        return;
      }

      intelligenceEvents.push(
        buildSupplierInvoiceIntelligenceEvent({
          organizationId: params.organizationId,
          projectId: allocation.project_id,
          module: "supplier_invoices",
          eventFamily: "ai_interaction",
          eventType: "supplier_invoice_allocation_suggested",
          action: "suggested",
          entityType: "supplier_invoice_line_allocation",
          entityId: allocation.id,
          afterData: summarizeSupplierInvoiceAllocation({
            supplierInvoiceId: allocation.supplier_invoice_id,
            supplierInvoiceLineId: allocation.supplier_invoice_line_id,
            purchaseOrderId: allocation.purchase_order_id,
            purchaseOrderLineItemId: allocation.purchase_order_line_item_id,
            projectId: allocation.project_id,
            allocatedAmount: allocation.allocated_amount,
            allocationStatus: allocation.allocation_status,
            reviewStatus: allocation.review_status,
            approvalStatus: allocation.approval_status,
            classificationStatus: allocation.classification_status,
            accountingResolutionStatus: allocation.accounting_resolution_status,
            organizationCostCodeId: allocation.organization_cost_code_id,
            aiConfidenceScore: allocation.ai_confidence_score,
            aiSuggestedPurchaseOrderLineItemId: allocation.ai_suggested_purchase_order_line_item_id,
          }),
          metadata: {
            supplierInvoiceLineId: allocation.supplier_invoice_line_id,
            confidenceScore: allocation.ai_confidence_score,
          },
          reason: "AI-assisted supplier invoice allocation suggestion saved as the current draft.",
        })
      );
    });

    await emitSupplierInvoiceIntelligenceEvents({
      supabase: params.supabase,
      events: intelligenceEvents,
      action: "supplier-invoice-allocation-replace",
    });
  } catch (error) {
    logSupplierInvoiceIntelligenceFailure("supplier-invoice-allocation-replace", error);
  }
}

export async function saveAcceptedSupplierInvoiceDraftAllocations(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  candidates: SupplierInvoiceDraftAllocationCandidateInput[];
  canWrite: boolean;
  canReview: boolean;
  actorUserId: string;
}) {
  const contexts = await prepareAcceptedDraftContexts(params);

  const payloads = contexts.map((context) => {
    const payload = createSupplierInvoiceLineAllocationDraft({
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      supplierInvoiceLineId: context.invoiceLine.id,
      allocatedAmount: toNumber(context.invoiceLine.line_total),
      allocatedQuantity: context.invoiceLine.quantity ?? null,
      lineage: context.lineage,
      accountingResolution: context.accountingResolution,
      allocationSequence: 1,
      orgConsistency: {
        invoiceOrganizationId: context.invoice.organization_id,
        invoiceLineOrganizationId: context.invoiceLine.organization_id,
        purchaseOrderLineOrganizationId: context.purchaseOrderLine.organization_id,
        projectOrganizationId: context.lineage.projectId ? context.invoice.organization_id : null,
        costItemOrganizationId: context.lineage.costItemId ? context.invoice.organization_id : null,
        sourceCostItemOrganizationId: context.lineage.sourceCostItemId
          ? context.invoice.organization_id
          : null,
      },
    });

    assertWritePermissions({
      canWrite: params.canWrite,
      canReview: params.canReview,
      reviewStatus: payload.review_status,
    });

    return payload;
  });

  await replaceDraftAllocationsForLines({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    invoiceLineIds: contexts.map((context) => context.invoiceLine.id),
    payloads,
    actorUserId: params.actorUserId,
    existingInvoiceLines: new Map(contexts.map((context) => [context.invoiceLine.id, context.invoiceLine])),
  });

  return fetchInvoiceDraftAllocations({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });
}

export async function markSupplierInvoiceLineAllocationUnmatched(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  invoiceLineId: string;
  canWrite: boolean;
  canReview: boolean;
  actorUserId: string;
}) {
  const invoice = await loadInvoiceRow(params);
  const invoiceLineById = await loadInvoiceLinesById({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    invoiceLineIds: [params.invoiceLineId],
  });
  const invoiceLine = invoiceLineById.get(params.invoiceLineId) ?? null;

  if (!invoiceLine) {
    throw new Error("The selected supplier invoice line could not be found.");
  }

  const projectById = await loadProjectsById({
    supabase: params.supabase,
    organizationId: params.organizationId,
    projectIds: invoiceLine.project_id ? [invoiceLine.project_id] : [],
  });
  const project = invoiceLine.project_id ? projectById.get(invoiceLine.project_id) ?? null : null;

  validateSupplierInvoiceOrgConsistency(params.organizationId, {
    invoiceOrganizationId: invoice.organization_id,
    invoiceLineOrganizationId: invoiceLine.organization_id,
    projectOrganizationId: project?.organization_id ?? null,
  });

  const payload = createUnmatchedSupplierInvoiceLineAllocationDraft({
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    supplierInvoiceLineId: invoiceLine.id,
    allocatedAmount: toNumber(invoiceLine.line_total),
    allocatedQuantity: invoiceLine.quantity ?? null,
    projectId: invoiceLine.project_id ?? null,
    organizationCostCodeId: invoiceLine.cost_code_id ?? null,
  });

  assertWritePermissions({
    canWrite: params.canWrite,
    canReview: params.canReview,
    reviewStatus: payload.review_status,
  });

  await replaceDraftAllocationsForLines({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    invoiceLineIds: [invoiceLine.id],
    payloads: [payload],
    actorUserId: params.actorUserId,
    existingInvoiceLines: new Map([[invoiceLine.id, invoiceLine]]),
  });

  return fetchInvoiceDraftAllocations({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });
}

function canApproveAllocation(allocation: SupplierInvoiceLineAllocationRow) {
  if (allocation.allocation_status === "unmatched") {
    return true;
  }

  return (
    allocation.review_status === "pending" &&
    allocation.classification_status !== "needs_review" &&
    allocation.accounting_resolution_status !== "unresolved" &&
    allocation.accounting_resolution_status !== "classification_review_required"
  );
}

function canPostActualCostAllocation(allocation: SupplierInvoiceLineAllocationRow) {
  if (allocation.approval_status !== "approved") {
    return false;
  }

  if (!allocation.project_id) {
    return false;
  }

  if (allocation.allocation_status === "unmatched") {
    return true;
  }

  return Boolean(
    allocation.purchase_order_id &&
      allocation.purchase_order_line_item_id &&
      allocation.work_type &&
      allocation.cost_type &&
      allocation.internal_cost_code &&
      allocation.organization_cost_code_id
  );
}

export async function approveSupplierInvoiceDraftAllocation(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  allocationId: string;
  actorUserId: string;
  canReview: boolean;
  note?: string | null;
}) {
  assertReviewPermissions({ canReview: params.canReview });

  const context = await loadAllocationReviewContext(params);
  const postedActualCostEvents = await fetchPostedActualCostEventsByAllocationIds({
    supabase: params.supabase,
    organizationId: params.organizationId,
    allocationIds: [context.allocation.id],
  });
  const note = params.note?.trim() ?? "";

  if (postedActualCostEvents.length > 0) {
    throw new Error("Posted actual costs must be corrected with reversal entries before this allocation can be changed.");
  }

  if (!canApproveAllocation(context.allocation)) {
    throw new Error("This allocation still needs cost review or accounting mapping before it can be approved.");
  }

  if (context.allocation.allocation_status === "unmatched" && note.length === 0) {
    throw new Error("Add a reason before approving an unmatched allocation.");
  }

  const { error } = await params.supabase
    .from("supplier_invoice_line_allocations")
    .update({
      approval_status: "approved",
      review_status: "reviewed",
      approval_notes: note,
      reviewed_by_user_id: params.actorUserId,
      reviewed_at: new Date().toISOString(),
      approved_by_user_id: params.actorUserId,
      approved_at: new Date().toISOString(),
    })
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .eq("id", params.allocationId);

  if (error) {
    throw new Error(error.message);
  }

  await insertSupplierInvoiceActivityEvents({
    supabase: params.supabase,
    events: [
      {
        organization_id: params.organizationId,
        supplier_invoice_id: params.supplierInvoiceId,
        event_type: "allocation_approved",
        message: formatLineAllocationActivityMessage({
          action: "approved",
          invoiceLine: context.invoiceLine,
          purchaseOrderLine: context.purchaseOrderLine,
          note,
        }),
        metadata: {
          allocation_id: context.allocation.id,
          supplier_invoice_line_id: context.invoiceLine.id,
          purchase_order_line_item_id: context.purchaseOrderLine?.id ?? null,
          allocation_status: context.allocation.allocation_status,
          note,
        },
        created_by: params.actorUserId,
      },
    ],
  });

  const approvedAt = new Date().toISOString();
  const updatedAllocationSummary = summarizeSupplierInvoiceAllocation({
    supplierInvoiceId: context.allocation.supplier_invoice_id,
    supplierInvoiceLineId: context.allocation.supplier_invoice_line_id,
    purchaseOrderId: context.allocation.purchase_order_id,
    purchaseOrderLineItemId: context.allocation.purchase_order_line_item_id,
    projectId: context.allocation.project_id,
    allocatedAmount: context.allocation.allocated_amount,
    allocationStatus: context.allocation.allocation_status,
    reviewStatus: "reviewed",
    approvalStatus: "approved",
    classificationStatus: context.allocation.classification_status,
    accountingResolutionStatus: context.allocation.accounting_resolution_status,
    organizationCostCodeId: context.allocation.organization_cost_code_id,
    aiConfidenceScore: context.allocation.ai_confidence_score,
    aiSuggestedPurchaseOrderLineItemId: context.allocation.ai_suggested_purchase_order_line_item_id,
  });
  const approvalEvents = [
    buildSupplierInvoiceIntelligenceEvent({
      organizationId: params.organizationId,
      projectId: context.allocation.project_id,
      module: "supplier_invoices",
      eventFamily: "approval",
      eventType: "supplier_invoice_allocation_approved",
      action: "approved",
      entityType: "supplier_invoice_line_allocation",
      entityId: context.allocation.id,
      beforeData: summarizeSupplierInvoiceAllocation({
        supplierInvoiceId: context.allocation.supplier_invoice_id,
        supplierInvoiceLineId: context.allocation.supplier_invoice_line_id,
        purchaseOrderId: context.allocation.purchase_order_id,
        purchaseOrderLineItemId: context.allocation.purchase_order_line_item_id,
        projectId: context.allocation.project_id,
        allocatedAmount: context.allocation.allocated_amount,
        allocationStatus: context.allocation.allocation_status,
        reviewStatus: context.allocation.review_status,
        approvalStatus: context.allocation.approval_status,
        classificationStatus: context.allocation.classification_status,
        accountingResolutionStatus: context.allocation.accounting_resolution_status,
        organizationCostCodeId: context.allocation.organization_cost_code_id,
        aiConfidenceScore: context.allocation.ai_confidence_score,
        aiSuggestedPurchaseOrderLineItemId: context.allocation.ai_suggested_purchase_order_line_item_id,
      }),
      afterData: updatedAllocationSummary,
      metadata: {
        supplierInvoiceLineId: context.invoiceLine.id,
        notePresent: note.length > 0,
      },
      reason: "Supplier invoice draft allocation approved.",
      occurredAt: approvedAt,
    }),
  ];

  if (hasAiSupplierInvoiceAllocationSuggestion(context.allocation)) {
    approvalEvents.push(
      buildSupplierInvoiceIntelligenceEvent({
        organizationId: params.organizationId,
        projectId: context.allocation.project_id,
        module: "supplier_invoices",
        eventFamily: "ai_interaction",
        eventType: "ai_supplier_invoice_match_accepted",
        action: "accepted",
        entityType: "supplier_invoice_line_allocation",
        entityId: context.allocation.id,
        beforeData: summarizeSupplierInvoiceAllocation({
          supplierInvoiceId: context.allocation.supplier_invoice_id,
          supplierInvoiceLineId: context.allocation.supplier_invoice_line_id,
          purchaseOrderId: context.allocation.purchase_order_id,
          purchaseOrderLineItemId: context.allocation.purchase_order_line_item_id,
          projectId: context.allocation.project_id,
          allocatedAmount: context.allocation.allocated_amount,
          allocationStatus: context.allocation.allocation_status,
          reviewStatus: context.allocation.review_status,
          approvalStatus: context.allocation.approval_status,
          classificationStatus: context.allocation.classification_status,
          accountingResolutionStatus: context.allocation.accounting_resolution_status,
          organizationCostCodeId: context.allocation.organization_cost_code_id,
          aiConfidenceScore: context.allocation.ai_confidence_score,
          aiSuggestedPurchaseOrderLineItemId: context.allocation.ai_suggested_purchase_order_line_item_id,
        }),
        afterData: updatedAllocationSummary,
        metadata: {
          supplierInvoiceLineId: context.invoiceLine.id,
          confidenceScore: context.allocation.ai_confidence_score,
        },
        reason: "AI-assisted allocation suggestion approved.",
        occurredAt: approvedAt,
      })
    );
  }

  await emitSupplierInvoiceIntelligenceEvents({
    supabase: params.supabase,
    events: approvalEvents,
    action: "supplier-invoice-allocation-approve",
  });

  if (hasAiSupplierInvoiceAllocationSuggestion(context.allocation)) {
    try {
      await createSupplierInvoiceAiInteraction(params.supabase, {
        organizationId: params.organizationId,
        projectId: context.allocation.project_id,
        subjectEntityType: "supplier_invoice_line_allocation",
        subjectEntityId: context.allocation.id,
        confidence: context.allocation.ai_confidence_score,
        humanDisposition: "accepted",
        humanFeedbackSummary: "User approved an AI-assisted supplier invoice allocation.",
        outputStructured: summarizeSupplierInvoiceAllocation({
          supplierInvoiceId: context.allocation.supplier_invoice_id,
          supplierInvoiceLineId: context.allocation.supplier_invoice_line_id,
          purchaseOrderId: context.allocation.purchase_order_id,
          purchaseOrderLineItemId: context.allocation.purchase_order_line_item_id,
          projectId: context.allocation.project_id,
          allocatedAmount: context.allocation.allocated_amount,
          allocationStatus: context.allocation.allocation_status,
          reviewStatus: context.allocation.review_status,
          approvalStatus: context.allocation.approval_status,
          classificationStatus: context.allocation.classification_status,
          accountingResolutionStatus: context.allocation.accounting_resolution_status,
          organizationCostCodeId: context.allocation.organization_cost_code_id,
          aiConfidenceScore: context.allocation.ai_confidence_score,
          aiSuggestedPurchaseOrderLineItemId: context.allocation.ai_suggested_purchase_order_line_item_id,
        }) as unknown as Json,
        editedOutput: updatedAllocationSummary as unknown as Json,
      });
    } catch (error) {
      logSupplierInvoiceIntelligenceFailure("supplier-invoice-allocation-approve-ai", error);
    }
  }

  return fetchInvoiceDraftAllocations({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });
}

export async function disputeSupplierInvoiceDraftAllocation(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  allocationId: string;
  actorUserId: string;
  canReview: boolean;
  note: string;
}) {
  assertReviewPermissions({ canReview: params.canReview });

  const context = await loadAllocationReviewContext(params);
  const postedActualCostEvents = await fetchPostedActualCostEventsByAllocationIds({
    supabase: params.supabase,
    organizationId: params.organizationId,
    allocationIds: [context.allocation.id],
  });
  const note = params.note.trim();

  if (postedActualCostEvents.length > 0) {
    throw new Error("Posted actual costs must be corrected with reversal entries before this allocation can be changed.");
  }

  if (note.length === 0) {
    throw new Error("Add a dispute reason before marking an allocation as disputed.");
  }

  const { error } = await params.supabase
    .from("supplier_invoice_line_allocations")
    .update({
      approval_status: "disputed",
      review_status: "disputed",
      approval_notes: note,
      reviewed_by_user_id: params.actorUserId,
      reviewed_at: new Date().toISOString(),
      approved_by_user_id: params.actorUserId,
      approved_at: new Date().toISOString(),
    })
    .eq("organization_id", params.organizationId)
    .eq("supplier_invoice_id", params.supplierInvoiceId)
    .eq("id", params.allocationId);

  if (error) {
    throw new Error(error.message);
  }

  await insertSupplierInvoiceActivityEvents({
    supabase: params.supabase,
    events: [
      {
        organization_id: params.organizationId,
        supplier_invoice_id: params.supplierInvoiceId,
        event_type: "allocation_disputed",
        message: formatLineAllocationActivityMessage({
          action: "disputed",
          invoiceLine: context.invoiceLine,
          purchaseOrderLine: context.purchaseOrderLine,
          note,
        }),
        metadata: {
          allocation_id: context.allocation.id,
          supplier_invoice_line_id: context.invoiceLine.id,
          purchase_order_line_item_id: context.purchaseOrderLine?.id ?? null,
          allocation_status: context.allocation.allocation_status,
          note,
        },
        created_by: params.actorUserId,
      },
    ],
  });

  const disputedAt = new Date().toISOString();
  const beforeAllocationSummary = summarizeSupplierInvoiceAllocation({
    supplierInvoiceId: context.allocation.supplier_invoice_id,
    supplierInvoiceLineId: context.allocation.supplier_invoice_line_id,
    purchaseOrderId: context.allocation.purchase_order_id,
    purchaseOrderLineItemId: context.allocation.purchase_order_line_item_id,
    projectId: context.allocation.project_id,
    allocatedAmount: context.allocation.allocated_amount,
    allocationStatus: context.allocation.allocation_status,
    reviewStatus: context.allocation.review_status,
    approvalStatus: context.allocation.approval_status,
    classificationStatus: context.allocation.classification_status,
    accountingResolutionStatus: context.allocation.accounting_resolution_status,
    organizationCostCodeId: context.allocation.organization_cost_code_id,
    aiConfidenceScore: context.allocation.ai_confidence_score,
    aiSuggestedPurchaseOrderLineItemId: context.allocation.ai_suggested_purchase_order_line_item_id,
  });
  const afterAllocationSummary = {
    ...beforeAllocationSummary,
    reviewStatus: "disputed",
    approvalStatus: "disputed",
  };

  await emitSupplierInvoiceIntelligenceEvents({
    supabase: params.supabase,
    events: [
      buildSupplierInvoiceIntelligenceEvent({
        organizationId: params.organizationId,
        projectId: context.allocation.project_id,
        module: "supplier_invoices",
        eventFamily: "approval",
        eventType: "supplier_invoice_rejected",
        action: "rejected",
        entityType: "supplier_invoice_line_allocation",
        entityId: context.allocation.id,
        beforeData: beforeAllocationSummary,
        afterData: afterAllocationSummary,
        metadata: {
          supplierInvoiceLineId: context.invoiceLine.id,
          notePresent: note.length > 0,
        },
        reason: "Supplier invoice draft allocation disputed.",
        occurredAt: disputedAt,
      }),
      ...(hasAiSupplierInvoiceAllocationSuggestion(context.allocation)
        ? [
            buildSupplierInvoiceIntelligenceEvent({
              organizationId: params.organizationId,
              projectId: context.allocation.project_id,
              module: "supplier_invoices",
              eventFamily: "ai_interaction",
              eventType: "ai_supplier_invoice_match_rejected",
              action: "rejected",
              entityType: "supplier_invoice_line_allocation",
              entityId: context.allocation.id,
              beforeData: beforeAllocationSummary,
              afterData: afterAllocationSummary,
              metadata: {
                supplierInvoiceLineId: context.invoiceLine.id,
                confidenceScore: context.allocation.ai_confidence_score,
              },
              reason: "AI-assisted allocation suggestion rejected during review.",
              occurredAt: disputedAt,
            }),
          ]
        : []),
    ],
    action: "supplier-invoice-allocation-dispute",
  });

  try {
    await createSupplierInvoiceValidationCase(params.supabase, {
      organizationId: params.organizationId,
      projectId: context.allocation.project_id,
      scopeEntityType: "supplier_invoice_line_allocation",
      scopeEntityId: context.allocation.id,
      ruleKey: "supplier_invoice_allocation_disputed",
      expectedValue: { approvalStatus: "approved" },
      observedValue: { approvalStatus: "disputed" },
      details: {
        supplierInvoiceLineId: context.invoiceLine.id,
        allocationStatus: context.allocation.allocation_status,
      },
      approvalNote: note,
    });
  } catch (error) {
    logSupplierInvoiceIntelligenceFailure("supplier-invoice-allocation-dispute-validation", error);
  }

  if (hasAiSupplierInvoiceAllocationSuggestion(context.allocation)) {
    try {
      await createSupplierInvoiceAiInteraction(params.supabase, {
        organizationId: params.organizationId,
        projectId: context.allocation.project_id,
        subjectEntityType: "supplier_invoice_line_allocation",
        subjectEntityId: context.allocation.id,
        confidence: context.allocation.ai_confidence_score,
        humanDisposition: "rejected",
        humanFeedbackSummary: "User rejected an AI-assisted supplier invoice allocation.",
        outputStructured: beforeAllocationSummary as unknown as Json,
        editedOutput: afterAllocationSummary as unknown as Json,
      });
    } catch (error) {
      logSupplierInvoiceIntelligenceFailure("supplier-invoice-allocation-dispute-ai", error);
    }
  }

  return fetchInvoiceDraftAllocations({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
  });
}

export async function postApprovedSupplierInvoiceActualCosts(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  actorUserId: string;
  canReview: boolean;
}) {
  assertReviewPermissions({ canReview: params.canReview });

  const [invoice, allocations, existingEvents] = await Promise.all([
    loadInvoiceRow(params),
    fetchInvoiceDraftAllocations({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
    }),
    fetchActualCostEventsForInvoice({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
    }),
  ]);

  const postedAllocationIds = new Set(
    existingEvents
      .filter((event) => event.event_status === "posted")
      .map((event) => event.source_invoice_allocation_id ?? event.supplier_invoice_line_allocation_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
  const approvedAllocations = allocations.filter((allocation) => allocation.approval_status === "approved");

  if (approvedAllocations.length === 0) {
    throw new Error("There are no approved allocations ready to post.");
  }

  const invoiceLineIds = Array.from(new Set(approvedAllocations.map((allocation) => allocation.supplier_invoice_line_id)));
  const purchaseOrderLineIds = Array.from(
    new Set(
      approvedAllocations
        .map((allocation) => allocation.purchase_order_line_item_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const projectIds = Array.from(
    new Set(
      approvedAllocations
        .map((allocation) => allocation.project_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const costItemIds = Array.from(
    new Set(
      approvedAllocations
        .flatMap((allocation) => [allocation.cost_item_id, allocation.source_cost_item_id])
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const [invoiceLineById, purchaseOrderLineById, projectById, costItemById] = await Promise.all([
    loadInvoiceLinesById({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      invoiceLineIds,
    }),
    loadPurchaseOrderLinesById({
      supabase: params.supabase,
      organizationId: params.organizationId,
      purchaseOrderLineItemIds: purchaseOrderLineIds,
    }),
    loadProjectsById({
      supabase: params.supabase,
      organizationId: params.organizationId,
      projectIds,
    }),
    loadCostItemsById({
      supabase: params.supabase,
      organizationId: params.organizationId,
      costItemIds,
    }),
  ]);

  const payloads: Database["public"]["Tables"]["project_actual_cost_events"]["Insert"][] = [];
  const skippedMessages: string[] = [];

  for (const allocation of approvedAllocations) {
    if (postedAllocationIds.has(allocation.id)) {
      skippedMessages.push(
        `Skipped ${allocation.supplier_invoice_line_id} because actual costs were already posted for that allocation.`
      );
      continue;
    }

    const invoiceLine = invoiceLineById.get(allocation.supplier_invoice_line_id) ?? null;
    if (!invoiceLine) {
      skippedMessages.push(
        `Skipped allocation ${allocation.id} because the supplier invoice line could not be found.`
      );
      continue;
    }

    const purchaseOrderLine = allocation.purchase_order_line_item_id
      ? purchaseOrderLineById.get(allocation.purchase_order_line_item_id) ?? null
      : null;
    const project = allocation.project_id ? projectById.get(allocation.project_id) ?? null : null;
    const costItem = allocation.cost_item_id ? costItemById.get(allocation.cost_item_id) ?? null : null;
    const sourceCostItem = allocation.source_cost_item_id
      ? costItemById.get(allocation.source_cost_item_id) ?? null
      : null;

    validateSupplierInvoiceOrgConsistency(params.organizationId, {
      invoiceOrganizationId: invoice.organization_id,
      invoiceLineOrganizationId: invoiceLine.organization_id,
      purchaseOrderLineOrganizationId: purchaseOrderLine?.organization_id ?? null,
      projectOrganizationId: project?.organization_id ?? null,
      costItemOrganizationId: costItem?.organization_id ?? null,
      sourceCostItemOrganizationId: sourceCostItem?.organization_id ?? null,
    });

    if (!canPostActualCostAllocation(allocation)) {
      skippedMessages.push(
        allocation.allocation_status === "unmatched"
          ? `Skipped ${formatInvoiceLineLabel(invoiceLine)} because unmatched allocations require a project before posting actual costs.`
          : `Skipped ${formatInvoiceLineLabel(invoiceLine)} because the approved allocation is missing required lineage or accounting mapping.`
      );
      continue;
    }

    const payload = buildProjectActualCostEventPayload({
      organizationId: params.organizationId,
      createdByUserId: params.actorUserId,
      supplierId: invoice.supplier_id ?? null,
      invoice,
      invoiceLine,
      allocation,
    });

    if (!payload) {
      skippedMessages.push(
        `Skipped ${formatInvoiceLineLabel(invoiceLine)} because the actual cost event payload could not be built.`
      );
      continue;
    }

    payloads.push(payload);
  }

  if (payloads.length === 0) {
    throw new Error(
      skippedMessages[0] ??
        "There are no approved allocations ready to post as actual costs."
    );
  }

  const { data: insertedEvents, error: insertError } = await params.supabase
    .from("project_actual_cost_events")
    .insert(payloads)
    .select("*");

  if (insertError) {
    throw new Error(insertError.message);
  }

  const postedEvents = (insertedEvents ?? []) as ProjectActualCostEventRow[];
  const postedAmount = postedEvents.reduce(
    (sum, event) => sum + Number(event.total_amount ?? 0),
    0
  );

  await insertSupplierInvoiceActivityEvents({
    supabase: params.supabase,
    events: [
      {
        organization_id: params.organizationId,
        supplier_invoice_id: params.supplierInvoiceId,
        event_type: "actual_costs_posted",
        message: formatActualCostPostingMessage({
          postedCount: postedEvents.length,
          postedAmount,
        }),
        metadata: {
          posted_event_ids: postedEvents.map((event) => event.id),
          posted_allocation_ids: postedEvents
            .map((event) => event.source_invoice_allocation_id ?? event.supplier_invoice_line_allocation_id)
            .filter((value): value is string => typeof value === "string" && value.length > 0),
          posted_count: postedEvents.length,
          posted_amount: postedAmount,
        },
        created_by: params.actorUserId,
      },
      ...(skippedMessages.length > 0
        ? [
            {
              organization_id: params.organizationId,
              supplier_invoice_id: params.supplierInvoiceId,
              event_type: "actual_cost_posting_skipped",
              message: formatActualCostPostingSkippedMessage({
                skippedCount: skippedMessages.length,
              }),
              metadata: {
                skipped_count: skippedMessages.length,
                skipped_messages: skippedMessages,
              },
              created_by: params.actorUserId,
            } satisfies SupplierInvoiceActivityEventInsert,
          ]
        : []),
    ],
  });

  await emitSupplierInvoiceIntelligenceEvents({
    supabase: params.supabase,
    events: postedEvents.map((event) =>
      buildSupplierInvoiceIntelligenceEvent({
        organizationId: params.organizationId,
        projectId: event.project_id,
        module: "supplier_invoices",
        eventFamily: "lineage",
        eventType: "supplier_invoice_actual_cost_posted",
        action: "posted",
        entityType: "project_actual_cost_event",
        entityId: event.id,
        afterData: summarizeSupplierInvoiceActualCostEvent({
          supplierInvoiceId: params.supplierInvoiceId,
          allocationId:
            event.source_invoice_allocation_id ?? event.supplier_invoice_line_allocation_id,
          projectId: event.project_id,
          totalAmount: Number(event.total_amount ?? 0),
          eventType: event.event_type,
          eventStatus: event.event_status,
          reversesEventId: event.reverses_event_id,
        }),
        metadata: {
          supplierId: invoice.supplier_id ?? null,
        },
        reason: "Approved supplier invoice allocation posted to actual costs.",
      })
    ),
    action: "supplier-invoice-actual-cost-posted",
  });

  return {
    postedEvents,
    postedCount: postedEvents.length,
    postedAmount,
    skippedCount: skippedMessages.length,
    skippedMessages,
  } satisfies SupplierInvoiceActualCostPostingResult;
}

export async function reverseSupplierInvoiceActualCostEvent(params: {
  supabase: ServerSupabase;
  organizationId: string;
  supplierInvoiceId: string;
  eventId: string;
  reversalReason: string;
  reversalNote?: string | null;
  canReverse: boolean;
}) {
  if (!params.canReverse) {
    throw new Error("You do not have permission to reverse actual costs.");
  }

  const reversalReason = params.reversalReason.trim();
  const reversalNote = params.reversalNote?.trim() ?? "";

  if (reversalReason.length === 0) {
    throw new Error("Add a reversal reason before reversing an actual cost.");
  }

  const originalEvent = await loadActualCostEventRow({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    eventId: params.eventId,
  });

  if (originalEvent.event_type !== "posting") {
    throw new Error("Only posting actual cost events can be reversed.");
  }

  if (originalEvent.event_status !== "posted") {
    throw new Error("Only posted actual cost events can be reversed.");
  }

  const { data, error } = await params.supabase.rpc(
    "reverse_supplier_invoice_actual_cost_event" as never,
    {
      p_organization_id: params.organizationId,
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_event_id: params.eventId,
      p_reversal_reason: reversalReason,
      p_reversal_note: reversalNote.length > 0 ? reversalNote : null,
    } as never
  );

  if (error) {
    throw new Error(error.message);
  }

  const resultRow = (Array.isArray(data) ? data[0] : null) as ReverseSupplierInvoiceActualCostEventRpcRow | null;
  if (!resultRow?.reversal_event_id || !resultRow?.successor_allocation_id) {
    throw new Error("The actual cost reversal did not return the expected result.");
  }

  const [reversalEvent, successorAllocation] = await Promise.all([
    loadActualCostEventRow({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      eventId: resultRow.reversal_event_id,
    }),
    loadAllocationRow({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      allocationId: resultRow.successor_allocation_id,
    }),
  ]);

  await emitSupplierInvoiceIntelligenceEvents({
    supabase: params.supabase,
    events: [
      buildSupplierInvoiceIntelligenceEvent({
        organizationId: params.organizationId,
        projectId: reversalEvent.project_id,
        module: "supplier_invoices",
        eventFamily: "lineage",
        eventType: "supplier_invoice_actual_cost_reversed",
        action: "reversed",
        entityType: "project_actual_cost_event",
        entityId: reversalEvent.id,
        beforeData: summarizeSupplierInvoiceActualCostEvent({
          supplierInvoiceId: params.supplierInvoiceId,
          allocationId:
            originalEvent.source_invoice_allocation_id ?? originalEvent.supplier_invoice_line_allocation_id,
          projectId: originalEvent.project_id,
          totalAmount: Number(originalEvent.total_amount ?? 0),
          eventType: originalEvent.event_type,
          eventStatus: originalEvent.event_status,
          reversesEventId: originalEvent.reverses_event_id,
        }),
        afterData: summarizeSupplierInvoiceActualCostEvent({
          supplierInvoiceId: params.supplierInvoiceId,
          allocationId:
            reversalEvent.source_invoice_allocation_id ?? reversalEvent.supplier_invoice_line_allocation_id,
          projectId: reversalEvent.project_id,
          totalAmount: Number(reversalEvent.total_amount ?? 0),
          eventType: reversalEvent.event_type,
          eventStatus: reversalEvent.event_status,
          reversesEventId: reversalEvent.reverses_event_id,
        }),
        metadata: {
          successorAllocationId: successorAllocation.id,
          reversalReason,
          notePresent: reversalNote.length > 0,
        },
        reason: "Supplier invoice actual cost event reversed.",
      }),
      buildSupplierInvoiceIntelligenceEvent({
        organizationId: params.organizationId,
        projectId: successorAllocation.project_id,
        module: "supplier_invoices",
        eventFamily: "correction",
        eventType: "supplier_invoice_allocation_corrected",
        action: "corrected",
        entityType: "supplier_invoice_line_allocation",
        entityId: successorAllocation.id,
        afterData: summarizeSupplierInvoiceAllocation({
          supplierInvoiceId: successorAllocation.supplier_invoice_id,
          supplierInvoiceLineId: successorAllocation.supplier_invoice_line_id,
          purchaseOrderId: successorAllocation.purchase_order_id,
          purchaseOrderLineItemId: successorAllocation.purchase_order_line_item_id,
          projectId: successorAllocation.project_id,
          allocatedAmount: successorAllocation.allocated_amount,
          allocationStatus: successorAllocation.allocation_status,
          reviewStatus: successorAllocation.review_status,
          approvalStatus: successorAllocation.approval_status,
          classificationStatus: successorAllocation.classification_status,
          accountingResolutionStatus: successorAllocation.accounting_resolution_status,
          organizationCostCodeId: successorAllocation.organization_cost_code_id,
          aiConfidenceScore: successorAllocation.ai_confidence_score,
          aiSuggestedPurchaseOrderLineItemId: successorAllocation.ai_suggested_purchase_order_line_item_id,
        }),
        metadata: {
          reversalEventId: reversalEvent.id,
          originalEventId: originalEvent.id,
          reversalReason,
        },
        reason: "Actual cost reversal created a successor allocation that requires correction review.",
      }),
    ],
    action: "supplier-invoice-actual-cost-reversed",
  });

  return {
    originalEvent,
    reversalEvent,
    successorAllocation,
    supplierInvoiceId: params.supplierInvoiceId,
    projectId: resultRow.project_id,
  } satisfies SupplierInvoiceActualCostReversalResult;
}
