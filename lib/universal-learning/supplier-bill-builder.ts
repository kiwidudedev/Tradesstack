import { calculatePurchaseOrderLineInvoicingProgress } from "@/lib/procurement-commercial";
import { deriveSupplierInvoiceWorkflowStage } from "@/lib/supplier-invoice-workflow-state";
import { buildUniversalLearningRunPromptHash } from "@/lib/universal-learning/idempotency";
import {
  createSupplierBillUclTruncationMetadata,
  SUPPLIER_BILL_UCL_BUILDER_VERSION,
  SUPPLIER_BILL_UCL_LIMITS,
  SUPPLIER_BILL_UCL_SCHEMA_VERSION,
  type SupplierBillUclLinkedContext,
  type SupplierBillUclPayload,
  type SupplierBillUclRoutingContext,
  type SupplierBillUclStructuredException,
} from "@/lib/universal-learning/supplier-bill-schema";
import { SUPPLIER_BILL_UCL_SOURCE_TABLES } from "@/lib/universal-learning/supplier-bill-dependencies";
import { normalizeSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";
import type { UniversalLearningRecordStrength } from "@/lib/universal-learning/types";

export type SupplierBillBuilderRow = Record<string, unknown>;

export type SupplierBillV2BuilderInput = {
  organizationId: string;
  row: SupplierBillBuilderRow;
  lines: SupplierBillBuilderRow[];
  documents: SupplierBillBuilderRow[];
  matches: SupplierBillBuilderRow[];
  allocations: SupplierBillBuilderRow[];
  actualCostEvents: SupplierBillBuilderRow[];
  supplier: SupplierBillBuilderRow | null;
  purchaseOrdersById: Map<string, SupplierBillBuilderRow>;
  purchaseOrderLinesById: Map<string, SupplierBillBuilderRow>;
  projectsById: Map<string, SupplierBillBuilderRow>;
  extractions: SupplierBillBuilderRow[];
  commercialApprovals: SupplierBillBuilderRow[];
  commercialSnapshots: SupplierBillBuilderRow[];
  historicalApprovedSnapshots: SupplierBillBuilderRow[];
  commercialVariances: SupplierBillBuilderRow[];
  siteReviewSubmissions: SupplierBillBuilderRow[];
  siteReviewDecisions: SupplierBillBuilderRow[];
  accountsApprovals: SupplierBillBuilderRow[];
  activityEvents: SupplierBillBuilderRow[];
  accountingDocuments: SupplierBillBuilderRow[];
  accountingDocumentLines: SupplierBillBuilderRow[];
  assembledAt: string;
  updatedAt: string;
};

export type SupplierBillV2BuilderResult = {
  payload: SupplierBillUclPayload;
  linkedContext: SupplierBillUclLinkedContext;
  routingContext: SupplierBillUclRoutingContext;
  projectIds: string[];
  workflowState: string;
  approvalState: string;
  evidenceStrength: UniversalLearningRecordStrength;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value: unknown) {
  return Math.max(0, Math.trunc(number(value)));
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value: unknown, sourceField = "Supplier Bill timestamp") {
  return normalizeSupplierBillUclTimestamp(value, sourceField);
}

function date(value: unknown) {
  const candidate = text(value);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function safeSummary(value: unknown, maximumLength: number) {
  const candidate = text(value);
  if (!candidate) return null;
  return candidate.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").slice(0, maximumLength);
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function rowId(row: SupplierBillBuilderRow) {
  return text(row.id) ?? "";
}

function sortByTimestampAndId(
  rows: SupplierBillBuilderRow[],
  timestampColumn: string,
  descending = false,
) {
  return [...rows].sort((left, right) => {
    const leftTimestamp = text(left[timestampColumn]) ?? "";
    const rightTimestamp = text(right[timestampColumn]) ?? "";
    const timestampOrder = leftTimestamp.localeCompare(rightTimestamp);
    return (descending ? -timestampOrder : timestampOrder) || rowId(left).localeCompare(rowId(right));
  });
}

function sortLines(rows: SupplierBillBuilderRow[]) {
  return [...rows].sort(
    (left, right) =>
      integer(left.sort_order) - integer(right.sort_order)
      || rowId(left).localeCompare(rowId(right)),
  );
}

function sortMatches(rows: SupplierBillBuilderRow[]) {
  const priority = (row: SupplierBillBuilderRow) => {
    const status = text(row.match_status)?.toLowerCase();
    if (status === "accepted" || status === "adjusted") return 0;
    if (status === "suggested" || status === "pending") return 1;
    if (status === "disputed" || status === "rejected") return 2;
    return 3;
  };
  return [...rows].sort(
    (left, right) =>
      priority(left) - priority(right)
      || (text(left.created_at) ?? "").localeCompare(text(right.created_at) ?? "")
      || rowId(left).localeCompare(rowId(right)),
  );
}

function activeAllocations(rows: SupplierBillBuilderRow[]) {
  const supersededIds = new Set(
    rows.map((row) => text(row.supersedes_allocation_id)).filter((value): value is string => Boolean(value)),
  );
  return rows.filter((row) => {
    const status = text(row.allocation_status)?.toLowerCase();
    return !supersededIds.has(rowId(row)) && status !== "superseded" && status !== "cancelled";
  });
}

function sortAllocations(
  rows: SupplierBillBuilderRow[],
  lineOrderById: ReadonlyMap<string, number>,
) {
  return [...rows].sort(
    (left, right) =>
      (lineOrderById.get(text(left.supplier_invoice_line_id) ?? "") ?? Number.MAX_SAFE_INTEGER)
        - (lineOrderById.get(text(right.supplier_invoice_line_id) ?? "") ?? Number.MAX_SAFE_INTEGER)
      || integer(left.allocation_sequence) - integer(right.allocation_sequence)
      || rowId(left).localeCompare(rowId(right)),
  );
}

function latestCurrent(rows: SupplierBillBuilderRow[], timestampColumns: string[]) {
  return [...rows]
    .filter((row) => !timestamp(row.invalidated_at))
    .sort((left, right) => {
      const latest = (row: SupplierBillBuilderRow) =>
        timestampColumns.map((column) => text(row[column]) ?? "").find(Boolean) ?? "";
      return latest(right).localeCompare(latest(left)) || rowId(right).localeCompare(rowId(left));
    })[0] ?? null;
}

function checksSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { passed: 0, failed: 0, unresolved: 0 };
  }
  const values = Object.values(value as Record<string, unknown>);
  return {
    passed: values.filter((entry) => entry === true).length,
    failed: values.filter((entry) => entry === false).length,
    unresolved: values.filter((entry) => entry !== true && entry !== false).length,
  };
}

function jsonEvidencePresent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0);
}

function warningCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length;
  return 0;
}

function latestExtractionByDocumentId(rows: SupplierBillBuilderRow[]) {
  const byDocumentId = new Map<string, SupplierBillBuilderRow>();
  for (const row of [...rows].sort(
    (left, right) =>
      integer(right.attempt_number) - integer(left.attempt_number)
      || (text(right.updated_at) ?? "").localeCompare(text(left.updated_at) ?? "")
      || rowId(right).localeCompare(rowId(left)),
  )) {
    const documentId = text(row.supplier_invoice_document_id);
    if (documentId && !byDocumentId.has(documentId)) byDocumentId.set(documentId, row);
  }
  return byDocumentId;
}

function deriveTaxTreatmentCounts(input: {
  lines: SupplierBillBuilderRow[];
  allocations: SupplierBillBuilderRow[];
  amountMode: string | null;
}) {
  const allocationsByLineId = new Map<string, SupplierBillBuilderRow[]>();
  for (const allocation of input.allocations) {
    const lineId = text(allocation.supplier_invoice_line_id);
    if (lineId) allocationsByLineId.set(lineId, [...(allocationsByLineId.get(lineId) ?? []), allocation]);
  }
  const counts = { taxable: 0, zeroRated: 0, exempt: 0, unresolved: 0 };
  for (const line of input.lines) {
    const lineAllocations = allocationsByLineId.get(rowId(line)) ?? [];
    const statuses = uniqueSorted(lineAllocations.map((allocation) => text(allocation.tax_resolution_status)));
    if (statuses.includes("unresolved")) {
      counts.unresolved += 1;
    } else if (statuses.length > 0 && statuses.every((status) => status === "not_applicable")) {
      counts.exempt += 1;
    } else if (input.amountMode === "no_tax") {
      counts.exempt += 1;
    } else if (input.amountMode === "exclusive" || input.amountMode === "inclusive" || statuses.includes("resolved")) {
      if (number(line.tax_amount) > 0) counts.taxable += 1;
      else counts.zeroRated += 1;
    } else {
      counts.unresolved += 1;
    }
  }
  return counts;
}

function deriveEvidenceStrength(input: {
  supplierId: string | null;
  lineCount: number;
  total: number;
  commercialApproval: SupplierBillBuilderRow | null;
  postedEventCount: number;
}): UniversalLearningRecordStrength {
  if (!input.supplierId || input.lineCount === 0 || input.total <= 0) return "weak";
  if (
    text(input.commercialApproval?.status)?.toLowerCase() === "approved"
    && input.postedEventCount > 0
  ) {
    return "strong";
  }
  return "normal";
}

function exceptionSeverity(value: unknown): "info" | "warning" | "error" {
  const normalized = text(value)?.toLowerCase();
  if (normalized === "blocking" || normalized === "error") return "error";
  if (normalized === "warning") return "warning";
  return "info";
}

function serializedBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function buildSupplierBillUclV2Sections(
  input: SupplierBillV2BuilderInput,
): SupplierBillV2BuilderResult {
  const belongsToOrganization = (row: SupplierBillBuilderRow | null | undefined) =>
    Boolean(row)
    && (!text(row?.organization_id) || text(row?.organization_id) === input.organizationId);
  const organizationRow = (
    rows: Map<string, SupplierBillBuilderRow>,
    id: string | null,
  ) => id && belongsToOrganization(rows.get(id)) ? rows.get(id)! : null;
  const invoiceId = text(input.row.id) ?? "";
  if (text(input.row.organization_id) && text(input.row.organization_id) !== input.organizationId) {
    throw new Error(`Supplier Bill UCL ${invoiceId} does not belong to organization ${input.organizationId}.`);
  }
  const belongsToInvoice = (row: SupplierBillBuilderRow) =>
    belongsToOrganization(row)
    && (!text(row.supplier_invoice_id) || text(row.supplier_invoice_id) === invoiceId);
  const supplier = belongsToOrganization(input.supplier) ? input.supplier : null;
  const storedSupplierId = text(input.row.supplier_id);
  const supplierId = storedSupplierId && text(supplier?.id) === storedSupplierId ? storedSupplierId : null;
  const canonicalStatus = text(input.row.status) ?? "";
  const source = text(input.row.source) ?? "";
  const currency = text(input.row.currency) ?? "";
  const sortedLines = sortLines(input.lines.filter(belongsToInvoice));
  const lineOrderById = new Map(sortedLines.map((line, index) => [rowId(line), index]));
  const allocations = sortAllocations(
    activeAllocations(input.allocations.filter(belongsToInvoice)),
    lineOrderById,
  );
  const matches = sortMatches(input.matches.filter(
    (match) =>
      belongsToInvoice(match)
      && Boolean(organizationRow(input.purchaseOrdersById, text(match.purchase_order_id))),
  ));
  const currentDocuments = input.documents
    .filter(belongsToInvoice)
    .filter((document) => document.is_current !== false && !timestamp(document.superseded_at))
    .sort(
      (left, right) =>
        Number(right.is_current === true) - Number(left.is_current === true)
        || (text(left.created_at) ?? "").localeCompare(text(right.created_at) ?? "")
        || rowId(left).localeCompare(rowId(right)),
    );
  const extractions = input.extractions.filter(belongsToInvoice);
  const extractionByDocumentId = latestExtractionByDocumentId(extractions);
  const currentExtractions = currentDocuments
    .map((document) => extractionByDocumentId.get(rowId(document)) ?? null)
    .filter((row): row is SupplierBillBuilderRow => Boolean(row));
  const latestExtraction = sortByTimestampAndId(currentExtractions, "updated_at", true)[0] ?? null;

  const commercialApprovals = input.commercialApprovals.filter(belongsToInvoice);
  const commercialSnapshots = input.commercialSnapshots.filter(belongsToInvoice);
  const commercialVariances = input.commercialVariances.filter(belongsToInvoice);
  const siteReviewSubmissions = input.siteReviewSubmissions.filter(belongsToInvoice);
  const siteReviewDecisions = input.siteReviewDecisions.filter(belongsToInvoice);
  const accountsApprovals = input.accountsApprovals.filter(belongsToInvoice);
  const activityEvents = input.activityEvents.filter(belongsToInvoice);
  const actualCostEvents = input.actualCostEvents.filter(belongsToInvoice);
  const latestCommercialApprovalRecord =
    sortByTimestampAndId(commercialApprovals, "reviewed_at", true)[0] ?? null;
  const commercialApproval = latestCurrent(commercialApprovals, ["reviewed_at", "created_at"]);
  const siteSubmission = latestCurrent(siteReviewSubmissions, ["submitted_at", "created_at"]);
  const accountsApproval = latestCurrent(accountsApprovals, ["approved_at", "created_at"]);
  const relevantSiteDecisions = siteSubmission
    ? siteReviewDecisions.filter((decision) => text(decision.submission_id) === text(siteSubmission.id))
    : [];
  const decisionCounts = {
    pending: relevantSiteDecisions.filter((decision) => text(decision.decision)?.toLowerCase() === "pending").length,
    approved: relevantSiteDecisions.filter((decision) => text(decision.decision)?.toLowerCase() === "approved").length,
    disputed: relevantSiteDecisions.filter((decision) => text(decision.decision)?.toLowerCase() === "disputed").length,
  };

  const accountingDocuments = input.accountingDocuments.filter(
    (document) =>
      belongsToOrganization(document)
      && (!text(document.local_document_id) || text(document.local_document_id) === invoiceId)
      && (!text(document.local_document_type) || text(document.local_document_type) === "supplier_invoice"),
  );
  const accountingDocument = accountingDocuments.sort(
    (left, right) =>
      (text(right.updated_at) ?? "").localeCompare(text(left.updated_at) ?? "")
      || rowId(right).localeCompare(rowId(left)),
  )[0] ?? null;
  const currentAccountingVersionId = text(accountingDocument?.current_version_id);
  const accountingLines = currentAccountingVersionId
    ? input.accountingDocumentLines.filter(
      (line) => belongsToOrganization(line) && text(line.version_id) === currentAccountingVersionId,
    )
    : [];

  const projectIds = uniqueSorted([
    ...sortedLines.map((line) => text(line.project_id)),
    ...allocations.map((allocation) => text(allocation.project_id)),
    ...actualCostEvents.map((event) => text(event.project_id)),
    ...matches.map((match) => {
      const purchaseOrderId = text(match.purchase_order_id);
      return text(organizationRow(input.purchaseOrdersById, purchaseOrderId)?.project_id);
    }),
  ]).filter((projectId) => Boolean(organizationRow(input.projectsById, projectId)));

  const purchaseOrderIds = uniqueSorted([
    ...matches.map((match) => text(match.purchase_order_id)),
    ...allocations.map((allocation) => text(allocation.purchase_order_id)),
    ...actualCostEvents.map((event) => text(event.purchase_order_id)),
  ]).filter((purchaseOrderId) => Boolean(organizationRow(input.purchaseOrdersById, purchaseOrderId)));
  const purchaseOrderLineItemIds = uniqueSorted([
    ...allocations.map((allocation) => text(allocation.purchase_order_line_item_id)),
    ...actualCostEvents.map((event) => text(event.purchase_order_line_item_id)),
  ]).filter((lineId) => Boolean(organizationRow(input.purchaseOrderLinesById, lineId)));

  const historicalSnapshotsByPoLineId = new Map<string, SupplierBillBuilderRow[]>();
  for (const snapshot of input.historicalApprovedSnapshots.filter(belongsToOrganization)) {
    const poLineId = text(snapshot.purchase_order_line_item_id);
    if (!poLineId || text(snapshot.supplier_invoice_id) === invoiceId) continue;
    historicalSnapshotsByPoLineId.set(poLineId, [
      ...(historicalSnapshotsByPoLineId.get(poLineId) ?? []),
      snapshot,
    ]);
  }
  const allocationsByLineId = new Map<string, SupplierBillBuilderRow[]>();
  for (const allocation of allocations) {
    const lineId = text(allocation.supplier_invoice_line_id);
    if (lineId) allocationsByLineId.set(lineId, [...(allocationsByLineId.get(lineId) ?? []), allocation]);
  }

  const taxAmountMode = safeSummary(input.row.tax_amount_mode, 100);
  const treatmentCounts = deriveTaxTreatmentCounts({
    lines: sortedLines,
    allocations,
    amountMode: taxAmountMode,
  });
  const calculatedLineSubtotal = sortedLines.reduce((sum, line) => sum + number(line.line_total), 0);
  const calculatedLineTax = sortedLines.reduce((sum, line) => sum + number(line.tax_amount), 0);
  const calculatedLineTotal = calculatedLineSubtotal + calculatedLineTax;

  const activeSnapshotRows = commercialApproval
    ? commercialSnapshots.filter(
      (snapshot) => text(snapshot.commercial_approval_id) === text(commercialApproval.id),
    )
    : [];
  const varianceCodes = uniqueSorted(
    commercialVariances.map((variance) =>
      safeSummary(variance.variance_key, 100) ?? safeSummary(variance.variance_type, 100)),
  );

  const exceptions: SupplierBillUclStructuredException[] = commercialVariances.map((variance) => ({
    code: safeSummary(variance.variance_key, 100)
      ?? safeSummary(variance.variance_type, 100)
      ?? "commercial_variance",
    severity: exceptionSeverity(variance.severity),
    summary: `Commercial variance: ${text(variance.variance_type) ?? "unspecified"}.`,
    relatedLineId: null,
  }));
  for (const allocation of allocations) {
    const lineId = text(allocation.supplier_invoice_line_id);
    if (text(allocation.tax_resolution_status)?.toLowerCase() === "unresolved") {
      exceptions.push({
        code: `unresolved_tax:${lineId ?? "unknown"}`,
        severity: "warning",
        summary: "Tax routing is unresolved for a bill allocation.",
        relatedLineId: lineId,
      });
    }
    if (!text(allocation.accounting_mapping_id) || !text(allocation.organization_cost_code_id)) {
      exceptions.push({
        code: `uncoded_allocation:${rowId(allocation)}`,
        severity: "warning",
        summary: "Accounting or cost-code routing is incomplete.",
        relatedLineId: lineId,
      });
    }
  }
  for (const match of matches) {
    const status = text(match.match_status)?.toLowerCase();
    if (status !== "accepted" && status !== "adjusted") {
      exceptions.push({
        code: `unresolved_po_match:${rowId(match)}`,
        severity: "warning",
        summary: "A Purchase Order match remains unresolved.",
        relatedLineId: null,
      });
    }
  }
  if (latestExtraction && text(latestExtraction.status)?.toLowerCase() === "failed") {
    exceptions.push({
      code: safeSummary(`extraction_failed:${text(latestExtraction.error_code) ?? "unknown"}`, 100)!,
      severity: "warning",
      summary: "The current source-document extraction failed.",
      relatedLineId: null,
    });
  }
  if (text(accountingDocument?.last_error_code)) {
    exceptions.push({
      code: safeSummary(`xero:${text(accountingDocument?.last_error_code)}`, 100)!,
      severity: "error",
      summary: "The accounting document has a safe export or synchronization error.",
      relatedLineId: null,
    });
  }
  const sortedExceptions = [...exceptions].sort(
    (left, right) =>
      ({ error: 0, warning: 1, info: 2 }[left.severity] - { error: 0, warning: 1, info: 2 }[right.severity])
      || left.code.localeCompare(right.code)
      || (left.relatedLineId ?? "").localeCompare(right.relatedLineId ?? ""),
  );

  const materialStateTransitions = sortByTimestampAndId(
    activityEvents.filter((event) => Boolean(text(event.event_type))),
    "created_at",
    true,
  ).map((event) => ({
    eventId: rowId(event),
    state: safeSummary(event.event_type, 100) ?? "unknown",
    occurredAt: timestamp(event.created_at) ?? input.updatedAt,
    source: "supplier_invoice_activity",
  }));

  const serializedLines = sortedLines.slice(0, SUPPLIER_BILL_UCL_LIMITS.billLines);
  const serializedMatches = matches.slice(0, SUPPLIER_BILL_UCL_LIMITS.poMatches);
  const serializedAllocations = allocations.slice(0, SUPPLIER_BILL_UCL_LIMITS.allocationSummaries);
  const serializedDocuments = currentDocuments.slice(0, SUPPLIER_BILL_UCL_LIMITS.attachmentReferences);
  const serializedExceptions = sortedExceptions.slice(0, SUPPLIER_BILL_UCL_LIMITS.structuredExceptions);
  const serializedTransitions = materialStateTransitions.slice(
    0,
    SUPPLIER_BILL_UCL_LIMITS.recentMaterialStateTransitions,
  );
  const linkedProjectIds = projectIds.slice(0, SUPPLIER_BILL_UCL_LIMITS.linkedProjects);
  const linkedPurchaseOrderIds = purchaseOrderIds.slice(0, SUPPLIER_BILL_UCL_LIMITS.linkedPurchaseOrders);

  const truncation = createSupplierBillUclTruncationMetadata({
    totalCounts: {
      billLines: sortedLines.length,
      poMatches: matches.length,
      attachmentReferences: currentDocuments.length,
      structuredExceptions: sortedExceptions.length,
      recentMaterialStateTransitions: materialStateTransitions.length,
      allocationSummaries: allocations.length,
      linkedProjects: projectIds.length,
      linkedPurchaseOrders: purchaseOrderIds.length,
      purchaseOrderLineReferences: purchaseOrderLineItemIds.length,
      commercialSnapshotReferences: activeSnapshotRows.length,
      actualCostEventReferences: actualCostEvents.length,
    },
    serializedCounts: {
      billLines: serializedLines.length,
      poMatches: serializedMatches.length,
      attachmentReferences: serializedDocuments.length,
      structuredExceptions: serializedExceptions.length,
      recentMaterialStateTransitions: serializedTransitions.length,
      allocationSummaries: serializedAllocations.length,
      linkedProjects: linkedProjectIds.length,
      linkedPurchaseOrders: linkedPurchaseOrderIds.length,
      purchaseOrderLineReferences: Math.min(
        purchaseOrderLineItemIds.length,
        SUPPLIER_BILL_UCL_LIMITS.purchaseOrderLineReferences,
      ),
      commercialSnapshotReferences: Math.min(
        activeSnapshotRows.length,
        SUPPLIER_BILL_UCL_LIMITS.commercialSnapshotReferences,
      ),
      actualCostEventReferences: Math.min(
        actualCostEvents.length,
        SUPPLIER_BILL_UCL_LIMITS.actualCostEventReferences,
      ),
    },
  });

  const allocatedLineIds = new Set(allocations.map((allocation) => text(allocation.supplier_invoice_line_id)));
  const captureComplete = Boolean(
    supplierId
    && text(input.row.invoice_number)
    && date(input.row.invoice_date)
    && sortedLines.length > 0,
  );
  const allocationsComplete = sortedLines.length > 0
    && sortedLines.every((line) => allocatedLineIds.has(rowId(line)));
  const exportStatus = safeSummary(accountingDocument?.export_status, 100);
  const workflowState = deriveSupplierInvoiceWorkflowStage({
    exportStatus,
    hasExternalDocument: Boolean(text(accountingDocument?.external_document_id)),
    normalizedExternalStatus: text(accountingDocument?.normalized_external_status),
    hasStatusSyncError: Boolean(text(accountingDocument?.last_status_sync_error)),
    hasCurrentAccountsApproval: Boolean(accountsApproval),
    hasCurrentSubmission: Boolean(siteSubmission),
    pendingDecisions: decisionCounts.pending,
    approvedDecisions: decisionCounts.approved,
    disputedDecisions: decisionCounts.disputed,
    captureComplete,
    allocationsComplete,
  });
  const approvalState =
    safeSummary(commercialApproval?.status, 100)
    ?? safeSummary(accountsApproval?.status, 100)
    ?? (latestCommercialApprovalRecord && timestamp(latestCommercialApprovalRecord.invalidated_at)
      ? "invalidated"
      : null)
    ?? (decisionCounts.disputed > 0
      ? "disputed"
      : decisionCounts.pending > 0
        ? "pending"
        : decisionCounts.approved > 0
          ? "approved"
          : "not_started");
  const matchingCompleteness = matches.length === 0
    ? "not_matched"
    : matches.every((match) => ["accepted", "adjusted"].includes(text(match.match_status)?.toLowerCase() ?? ""))
      ? "complete"
      : matches.some((match) => ["accepted", "adjusted"].includes(text(match.match_status)?.toLowerCase() ?? ""))
        ? "partial"
        : "unresolved";
  const allocationCompleteness = allocationsComplete
    ? "complete"
    : allocations.length > 0
      ? "partial"
      : "not_started";
  const codedLineIds = new Set(
    allocations
      .filter((allocation) =>
        Boolean(text(allocation.accounting_mapping_id) && text(allocation.organization_cost_code_id)),
      )
      .map((allocation) => text(allocation.supplier_invoice_line_id))
      .filter((value): value is string => Boolean(value)),
  );
  const accountingReadiness = allocationsComplete
    && codedLineIds.size >= sortedLines.length
    && treatmentCounts.unresolved === 0
    ? "ready"
    : "not_ready";
  const xeroReadiness = exportStatus
    ? exportStatus
    : accountsApproval && accountingReadiness === "ready"
      ? "ready"
      : "not_ready";
  const paymentState = safeSummary(accountingDocument?.normalized_external_status, 100);

  const postedEvents = actualCostEvents.filter(
    (event) =>
      (text(event.event_type)?.toLowerCase() ?? "posting") === "posting"
      && text(event.event_status)?.toLowerCase() === "posted",
  );
  const reversalEvents = actualCostEvents.filter(
    (event) => text(event.event_type)?.toLowerCase() === "reversal",
  );
  const postedAmount = postedEvents.reduce((sum, event) => sum + number(event.amount), 0);
  const postedTax = postedEvents.reduce((sum, event) => sum + number(event.tax_amount), 0);
  const postedTotal = postedEvents.reduce((sum, event) => sum + number(event.total_amount), 0);
  const reversalAmount = reversalEvents.reduce((sum, event) => sum + Math.abs(number(event.total_amount)), 0);

  const evidenceStrength = deriveEvidenceStrength({
    supplierId,
    lineCount: sortedLines.length,
    total: number(input.row.total),
    commercialApproval,
    postedEventCount: postedEvents.length,
  });

  const billLines = serializedLines.map((line) => {
    const lineAllocations = allocationsByLineId.get(rowId(line)) ?? [];
    const primaryAllocation = lineAllocations[0] ?? null;
    const poLineId = text(primaryAllocation?.purchase_order_line_item_id);
    const poLine = organizationRow(input.purchaseOrderLinesById, poLineId);
    const history = poLineId ? historicalSnapshotsByPoLineId.get(poLineId) ?? [] : [];
    const previouslyApprovedQuantity = history.reduce((sum, snapshot) => sum + number(snapshot.quantity), 0);
    const previouslyApprovedValue = history.reduce((sum, snapshot) => sum + number(snapshot.amount), 0);
    const currentQuantity = nullableNumber(primaryAllocation?.allocated_quantity) ?? number(line.quantity);
    const currentValue = number(primaryAllocation?.allocated_amount);
    const progress = poLine && primaryAllocation
      ? calculatePurchaseOrderLineInvoicingProgress({
        id: rowId(poLine),
        purchaseOrderId: text(poLine.purchase_order_id) ?? "",
        description: text(poLine.description) ?? "",
        orderedQuantity: number(poLine.quantity),
        orderedRate: number(poLine.rate),
        orderedValue: number(poLine.total),
        previouslyApprovedQuantity,
        previouslyApprovedValue,
        currentQuantity,
        currentValue,
        currentUnitRate: nullableNumber(line.unit_price),
      })
      : null;
    const lineExceptionCodes = sortedExceptions
      .filter((exception) => exception.relatedLineId === rowId(line))
      .map((exception) => exception.code)
      .slice(0, SUPPLIER_BILL_UCL_LIMITS.structuredExceptions);

    return {
      lineId: rowId(line),
      lineUid: safeSummary(line.line_uid, 200),
      sortOrder: integer(line.sort_order),
      supplierItemCode: safeSummary(line.supplier_item_code, 200),
      description: safeSummary(line.description, 2_000),
      quantity: nullableNumber(line.quantity),
      unitPrice: nullableNumber(line.unit_price),
      lineTotal: number(line.line_total),
      taxAmount: number(line.tax_amount),
      projectId: text(line.project_id) && organizationRow(input.projectsById, text(line.project_id))
        ? text(line.project_id)
        : null,
      allocationSummary: {
        allocatedQuantity: lineAllocations.reduce((sum, allocation) => sum + number(allocation.allocated_quantity), 0),
        allocatedAmount: lineAllocations.reduce((sum, allocation) => sum + number(allocation.allocated_amount), 0),
        allocationStatus: lineAllocations.length === 0
          ? null
          : lineAllocations.every((allocation) => text(allocation.approval_status)?.toLowerCase() === "approved")
            ? "approved"
            : "pending",
        costCodeReferenceCount: uniqueSorted(
          lineAllocations.map((allocation) => text(allocation.organization_cost_code_id)),
        ).length,
      },
      poMatchSummary: primaryAllocation && text(primaryAllocation.purchase_order_id)
        ? {
          purchaseOrderId: text(primaryAllocation.purchase_order_id)!,
          purchaseOrderLineItemId: poLineId,
          matchedQuantity: nullableNumber(primaryAllocation.allocated_quantity),
          matchedAmount: nullableNumber(primaryAllocation.matched_amount),
          previouslyApprovedQuantity,
          cumulativeQuantity: progress
            ? previouslyApprovedQuantity + progress.currentQuantity
            : previouslyApprovedQuantity + currentQuantity,
          remainingQuantity: progress ? progress.projectedRemainingQuantity : null,
        }
        : null,
      exceptionCodes: lineExceptionCodes,
    };
  });

  const linkedContext: SupplierBillUclLinkedContext = {
    projects: linkedProjectIds.map((projectId) => {
      const project = organizationRow(input.projectsById, projectId)!;
      return {
        projectId,
        displayName: safeSummary(project.name, 500),
        status: safeSummary(project.stage, 100),
      };
    }),
    purchaseOrders: linkedPurchaseOrderIds.map((purchaseOrderId) => {
      const purchaseOrder = organizationRow(input.purchaseOrdersById, purchaseOrderId)!;
      return {
        purchaseOrderId,
        purchaseOrderNumber: safeSummary(purchaseOrder.purchase_order_number, 200),
        projectId: text(purchaseOrder.project_id) && organizationRow(input.projectsById, text(purchaseOrder.project_id))
          ? text(purchaseOrder.project_id)
          : null,
        status: safeSummary(purchaseOrder.status, 100),
        committedTotal: nullableNumber(purchaseOrder.total_purchase_order_price),
      };
    }),
  };

  const routingContext: SupplierBillUclRoutingContext = {
    readOnly: true,
    organizationCostCodeIds: uniqueSorted(
      allocations.map((allocation) => text(allocation.organization_cost_code_id)),
    ).slice(0, SUPPLIER_BILL_UCL_LIMITS.allocationSummaries),
    accountingMappingIds: uniqueSorted(
      allocations.map((allocation) => text(allocation.accounting_mapping_id)),
    ).slice(0, SUPPLIER_BILL_UCL_LIMITS.allocationSummaries),
    tradesstackCostCodes: uniqueSorted(
      allocations.map((allocation) => {
        const code = allocation.tradesstack_cost_code;
        return code === null || code === undefined ? null : safeSummary(String(code), 100);
      }),
    ).slice(0, SUPPLIER_BILL_UCL_LIMITS.allocationSummaries),
    xeroAccountCodes: uniqueSorted(
      accountingLines.map((line) => safeSummary(line.xero_account_code, 100)),
    ).slice(0, SUPPLIER_BILL_UCL_LIMITS.allocationSummaries),
    xeroTaxTypes: uniqueSorted(
      accountingLines.map((line) => safeSummary(line.xero_tax_type, 100)),
    ).slice(0, SUPPLIER_BILL_UCL_LIMITS.allocationSummaries),
  };

  const payloadWithoutProvenance = {
    schemaVersion: SUPPLIER_BILL_UCL_SCHEMA_VERSION,
    sourceEvidence: {
      bill: {
        billNumber: safeSummary(input.row.invoice_number, 200),
        billDate: date(input.row.invoice_date),
        dueDate: date(input.row.due_date),
        currency,
        canonicalStatus: safeSummary(canonicalStatus, 100) ?? "",
        source: safeSummary(source, 100) ?? "",
        supplierPoReference: safeSummary(input.row.supplier_po_reference, 200),
        notesSummary: safeSummary(input.row.notes, 2_000),
      },
      supplier: {
        supplierId,
        displayName: safeSummary(supplier?.company_name, 500) ?? safeSummary(supplier?.name, 500),
      },
      financialTotals: {
        subtotal: number(input.row.subtotal),
        taxTotal: number(input.row.tax_total),
        total: number(input.row.total),
        calculatedLineSubtotal,
        calculatedLineTax,
        calculatedLineTotal,
        headerVariance: number(input.row.total) - calculatedLineTotal,
      },
      taxSummary: {
        amountMode: taxAmountMode,
        evidencePresent: jsonEvidencePresent(input.row.tax_evidence_json),
        treatmentCounts,
      },
      billLines,
      poMatches: serializedMatches.map((match) => {
        const checks = checksSummary(match.approval_checks_json);
        const purchaseOrderId = text(match.purchase_order_id) ?? "";
        const purchaseOrder = organizationRow(input.purchaseOrdersById, purchaseOrderId);
        return {
          matchId: rowId(match),
          purchaseOrderId,
          projectId: purchaseOrder && text(purchaseOrder.project_id) && organizationRow(input.projectsById, text(purchaseOrder.project_id))
            ? text(purchaseOrder.project_id)
            : null,
          matchedAmount: nullableNumber(match.matched_amount),
          matchBasis: safeSummary(match.match_basis, 100),
          matchStatus: safeSummary(match.match_status, 100),
          approvalStatus: safeSummary(match.approval_status, 100),
          passedCheckCount: checks.passed,
          failedCheckCount: checks.failed,
          unresolvedCheckCount: checks.unresolved,
        };
      }),
      commercialApproval: {
        approvalState: safeSummary(commercialApproval?.status, 100),
        commercialApprovalId: text(commercialApproval?.id),
        siteReviewState: safeSummary(siteSubmission?.status, 100),
        accountsApprovalState: safeSummary(accountsApproval?.status, 100),
        approvedAt: timestamp(commercialApproval?.reviewed_at),
        approvedByRole: commercialApproval ? "commercial_reviewer" : null,
        varianceCount: commercialVariances.length,
        varianceCodes: varianceCodes.slice(0, SUPPLIER_BILL_UCL_LIMITS.structuredExceptions),
        invalidationReasonCode: commercialApproval
          ? null
          : safeSummary(latestCommercialApprovalRecord?.invalidation_source, 200),
      },
      allocationSummary: {
        totalAllocationCount: allocations.length,
        allocatedLineCount: allocatedLineIds.size,
        allocatedAmount: allocations.reduce((sum, allocation) => sum + number(allocation.allocated_amount), 0),
        unallocatedAmount: Math.max(
          0,
          number(input.row.subtotal)
            - allocations.reduce((sum, allocation) => sum + number(allocation.allocated_amount), 0),
        ),
        codedLineCount: codedLineIds.size,
        uncodedLineCount: Math.max(0, sortedLines.length - codedLineIds.size),
        allocations: serializedAllocations.map((allocation) => ({
          allocationId: rowId(allocation),
          billLineId: text(allocation.supplier_invoice_line_id) ?? "",
          projectId: text(allocation.project_id) && organizationRow(input.projectsById, text(allocation.project_id))
            ? text(allocation.project_id)
            : null,
          purchaseOrderId: text(allocation.purchase_order_id)
            && organizationRow(input.purchaseOrdersById, text(allocation.purchase_order_id))
            ? text(allocation.purchase_order_id)
            : null,
          purchaseOrderLineItemId: text(allocation.purchase_order_line_item_id)
            && organizationRow(input.purchaseOrderLinesById, text(allocation.purchase_order_line_item_id))
            ? text(allocation.purchase_order_line_item_id)
            : null,
          allocatedQuantity: number(allocation.allocated_quantity),
          allocatedAmount: number(allocation.allocated_amount),
          allocationStatus: safeSummary(allocation.allocation_status, 100),
          approvalStatus: safeSummary(allocation.approval_status, 100),
        })),
      },
      actualCostPostingSummary: {
        postingEventCount: actualCostEvents.length,
        postedAmount,
        postedTax,
        postedTotal,
        reversalAmount,
        netPostedAmount: postedTotal - reversalAmount,
      },
      xeroSummary: {
        accountingDocumentId: text(accountingDocument?.id),
        externalBillReference: text(accountingDocument?.external_document_number)
          ?? text(accountingDocument?.external_document_id),
        exportStatus: safeSummary(exportStatus, 100),
        attachmentStatus: safeSummary(accountingDocument?.attachment_status, 100),
        lastExportedAt: timestamp(accountingDocument?.exported_at),
        lastSyncedAt: timestamp(accountingDocument?.last_status_synced_at)
          ?? timestamp(accountingDocument?.last_synced_at),
        lastErrorCode: safeSummary(accountingDocument?.last_error_code, 500),
        retryable: accountingDocument
          ? exportStatus === "failed" && !text(accountingDocument.external_document_id)
          : null,
      },
      paymentSummary: {
        paymentStatus: safeSummary(paymentState, 100),
        amountPaid: nullableNumber(accountingDocument?.amount_paid),
        amountDue: nullableNumber(accountingDocument?.amount_due),
        fullyPaidAt: timestamp(accountingDocument?.fully_paid_at),
        lastRefreshedAt: timestamp(accountingDocument?.last_status_synced_at),
      },
      attachmentSummary: {
        totalAttachmentCount: currentDocuments.length,
        references: serializedDocuments.map((document) => {
          const extraction = extractionByDocumentId.get(rowId(document)) ?? null;
          return {
            documentId: rowId(document),
            documentType: safeSummary(document.document_type, 100),
            fileName: safeSummary(document.file_name, 500),
            isCurrent: true,
            extractionStatus: safeSummary(extraction?.status, 100),
          };
        }),
        extractionState: safeSummary(latestExtraction?.status, 100),
        extractionSchemaVersion: safeSummary(latestExtraction?.schema_version, 100),
        warningCount: currentExtractions.reduce((sum, extraction) => sum + warningCount(extraction.warnings_json), 0),
        errorCount: currentExtractions.filter(
          (extraction) =>
            Boolean(text(extraction.error_code))
            || text(extraction.status)?.toLowerCase() === "failed",
        ).length,
      },
    },
    operationalContext: {
      lifecycleStage: workflowState.toLowerCase().replace(/\s+/g, "_"),
      workflowState,
      approvalState,
      poMatchingCompleteness: matchingCompleteness,
      allocationCompleteness,
      accountingReadiness,
      xeroReadiness,
      paymentState,
      unresolvedExceptionCount: sortedExceptions.length,
      evidenceStrength,
      structuredExceptions: serializedExceptions,
      recentMaterialStateTransitions: serializedTransitions,
      ...truncation,
    },
    lineage: {
      supplierBillId: invoiceId,
      supplierId,
      projectIds: linkedProjectIds,
      purchaseOrderIds: linkedPurchaseOrderIds,
      purchaseOrderLineItemIds: purchaseOrderLineItemIds.slice(
        0,
        SUPPLIER_BILL_UCL_LIMITS.purchaseOrderLineReferences,
      ),
      billLineIds: sortedLines.slice(0, SUPPLIER_BILL_UCL_LIMITS.billLines).map(rowId),
      allocationIds: allocations.slice(0, SUPPLIER_BILL_UCL_LIMITS.allocationSummaries).map(rowId),
      commercialSnapshotIds: activeSnapshotRows
        .map(rowId)
        .sort()
        .slice(0, SUPPLIER_BILL_UCL_LIMITS.commercialSnapshotReferences),
      actualCostEventIds: actualCostEvents
        .map(rowId)
        .sort()
        .slice(0, SUPPLIER_BILL_UCL_LIMITS.actualCostEventReferences),
      accountingDocumentId: text(accountingDocument?.id),
      currentDocumentIds: currentDocuments
        .slice(0, SUPPLIER_BILL_UCL_LIMITS.attachmentReferences)
        .map(rowId),
    },
    visibility: {
      organizationId: input.organizationId,
      projectIds: linkedProjectIds,
      requiresSupplierInvoiceView: true,
      requiresAccountingVisibility: Boolean(accountingDocument || accountingLines.length > 0),
    },
  } satisfies Omit<SupplierBillUclPayload, "provenance">;

  const refreshPayloadTruncationMetadata = () => {
    const metadata = createSupplierBillUclTruncationMetadata({
      totalCounts: truncation.totalCounts,
      serializedCounts: {
        billLines: payloadWithoutProvenance.sourceEvidence.billLines.length,
        poMatches: payloadWithoutProvenance.sourceEvidence.poMatches.length,
        attachmentReferences:
          payloadWithoutProvenance.sourceEvidence.attachmentSummary.references.length,
        structuredExceptions:
          payloadWithoutProvenance.operationalContext.structuredExceptions.length,
        recentMaterialStateTransitions:
          payloadWithoutProvenance.operationalContext.recentMaterialStateTransitions.length,
        allocationSummaries:
          payloadWithoutProvenance.sourceEvidence.allocationSummary.allocations.length,
        linkedProjects: linkedContext.projects.length,
        linkedPurchaseOrders: linkedContext.purchaseOrders.length,
        purchaseOrderLineReferences:
          payloadWithoutProvenance.lineage.purchaseOrderLineItemIds.length,
        commercialSnapshotReferences:
          payloadWithoutProvenance.lineage.commercialSnapshotIds.length,
        actualCostEventReferences:
          payloadWithoutProvenance.lineage.actualCostEventIds.length,
      },
    });
    payloadWithoutProvenance.operationalContext.truncated = metadata.truncated;
    payloadWithoutProvenance.operationalContext.omittedCounts = metadata.omittedCounts;
    payloadWithoutProvenance.operationalContext.totalCounts = metadata.totalCounts;
  };
  const boundedDetailReducers = [
    {
      length: () => payloadWithoutProvenance.operationalContext.recentMaterialStateTransitions.length,
      remove: (count: number) =>
        payloadWithoutProvenance.operationalContext.recentMaterialStateTransitions.splice(-count),
    },
    {
      length: () => payloadWithoutProvenance.lineage.actualCostEventIds.length,
      remove: (count: number) => payloadWithoutProvenance.lineage.actualCostEventIds.splice(-count),
    },
    {
      length: () => payloadWithoutProvenance.lineage.commercialSnapshotIds.length,
      remove: (count: number) => payloadWithoutProvenance.lineage.commercialSnapshotIds.splice(-count),
    },
    {
      length: () => payloadWithoutProvenance.lineage.purchaseOrderLineItemIds.length,
      remove: (count: number) => payloadWithoutProvenance.lineage.purchaseOrderLineItemIds.splice(-count),
    },
    {
      length: () => payloadWithoutProvenance.sourceEvidence.attachmentSummary.references.length,
      remove: (count: number) => {
        payloadWithoutProvenance.sourceEvidence.attachmentSummary.references.splice(-count);
        payloadWithoutProvenance.lineage.currentDocumentIds.splice(-count);
      },
    },
    {
      length: () => payloadWithoutProvenance.sourceEvidence.poMatches.length,
      remove: (count: number) => payloadWithoutProvenance.sourceEvidence.poMatches.splice(-count),
    },
    {
      length: () => payloadWithoutProvenance.sourceEvidence.allocationSummary.allocations.length,
      remove: (count: number) => {
        payloadWithoutProvenance.sourceEvidence.allocationSummary.allocations.splice(-count);
        payloadWithoutProvenance.lineage.allocationIds.splice(-count);
      },
    },
    {
      length: () => payloadWithoutProvenance.operationalContext.structuredExceptions.length,
      remove: (count: number) =>
        payloadWithoutProvenance.operationalContext.structuredExceptions.splice(-count),
    },
    {
      length: () => payloadWithoutProvenance.sourceEvidence.billLines.length,
      remove: (count: number) => {
        payloadWithoutProvenance.sourceEvidence.billLines.splice(-count);
        payloadWithoutProvenance.lineage.billLineIds.splice(-count);
      },
    },
    {
      length: () => linkedContext.purchaseOrders.length,
      remove: (count: number) => {
        linkedContext.purchaseOrders.splice(-count);
        payloadWithoutProvenance.lineage.purchaseOrderIds.splice(-count);
      },
    },
    {
      length: () => linkedContext.projects.length,
      remove: (count: number) => {
        linkedContext.projects.splice(-count);
        payloadWithoutProvenance.lineage.projectIds.splice(-count);
        payloadWithoutProvenance.visibility.projectIds.splice(-count);
      },
    },
  ];
  const payloadBudgetBeforeProvenance =
    SUPPLIER_BILL_UCL_LIMITS.serializedPayloadBytes - 4_096;
  let currentPayloadBytes = serializedBytes(payloadWithoutProvenance);
  while (currentPayloadBytes > payloadBudgetBeforeProvenance) {
    const reducer = boundedDetailReducers.find((candidate) => candidate.length() > 0);
    if (!reducer) {
      throw new Error(
        `Supplier Bill UCL ${invoiceId} cannot fit the ${SUPPLIER_BILL_UCL_LIMITS.serializedPayloadBytes}-byte payload limit.`,
      );
    }
    const excessRatio = (currentPayloadBytes - payloadBudgetBeforeProvenance) / currentPayloadBytes;
    const removalCount = Math.max(
      1,
      Math.ceil(reducer.length() * Math.min(0.5, Math.max(0.05, excessRatio))),
    );
    reducer.remove(removalCount);
    refreshPayloadTruncationMetadata();
    currentPayloadBytes = serializedBytes(payloadWithoutProvenance);
  }
  refreshPayloadTruncationMetadata();

  const canonicalUpdatedAt =
    timestamp(input.row.updated_at, "supplier_invoices.updated_at")
    ?? timestamp(input.updatedAt, "Supplier Bill effective cursor");
  if (!canonicalUpdatedAt) {
    throw new Error("Supplier Bill canonical timestamp is required.");
  }
  const dependencyTimestamps = [
    canonicalUpdatedAt,
    ...[
      ...input.lines,
      ...input.documents,
      ...input.matches,
      ...input.allocations,
      ...actualCostEvents,
      ...extractions,
      ...commercialApprovals,
      ...commercialSnapshots,
      ...commercialVariances,
      ...siteReviewSubmissions,
      ...siteReviewDecisions,
      ...accountsApprovals,
      ...activityEvents,
      ...accountingDocuments,
      ...accountingLines,
      ...(supplier ? [supplier] : []),
      ...projectIds.map((projectId) => organizationRow(input.projectsById, projectId)).filter(
        (row): row is SupplierBillBuilderRow => Boolean(row),
      ),
      ...purchaseOrderIds.map(
        (purchaseOrderId) => organizationRow(input.purchaseOrdersById, purchaseOrderId),
      ).filter((row): row is SupplierBillBuilderRow => Boolean(row)),
      ...purchaseOrderLineItemIds.map(
        (lineId) => organizationRow(input.purchaseOrderLinesById, lineId),
      ).filter((row): row is SupplierBillBuilderRow => Boolean(row)),
      ...input.historicalApprovedSnapshots.filter(belongsToOrganization),
    ].flatMap((row) => {
      const rowId = text(row.id) ?? "unknown";
      return [
        timestamp(row.updated_at, `Supplier Bill dependency ${rowId}.updated_at`),
        timestamp(row.created_at, `Supplier Bill dependency ${rowId}.created_at`),
        timestamp(row.reviewed_at, `Supplier Bill dependency ${rowId}.reviewed_at`),
        timestamp(row.approved_at, `Supplier Bill dependency ${rowId}.approved_at`),
        timestamp(row.completed_at, `Supplier Bill dependency ${rowId}.completed_at`),
      ];
    }),
  ].filter((value): value is string => Boolean(value));
  const latestDependencyUpdatedAt = [...dependencyTimestamps].sort().at(-1) ?? canonicalUpdatedAt;
  const hashInput = {
    ...payloadWithoutProvenance,
    linkedContext,
    routingContext,
    provenance: {
      canonicalRecordUpdatedAt: canonicalUpdatedAt,
      latestDependencyUpdatedAt,
      builderVersion: SUPPLIER_BILL_UCL_BUILDER_VERSION,
      queriedSourceTables: SUPPLIER_BILL_UCL_SOURCE_TABLES,
    },
  };
  const contentHash = buildUniversalLearningRunPromptHash(hashInput);
  const payload = {
    ...payloadWithoutProvenance,
    provenance: {
      assembledAt: input.assembledAt,
      canonicalRecordUpdatedAt: canonicalUpdatedAt,
      latestDependencyUpdatedAt,
      builderVersion: SUPPLIER_BILL_UCL_BUILDER_VERSION,
      queriedSourceTables: [...SUPPLIER_BILL_UCL_SOURCE_TABLES],
      contentHash,
    },
  } as SupplierBillUclPayload;

  return {
    payload,
    linkedContext,
    routingContext,
    projectIds,
    workflowState,
    approvalState,
    evidenceStrength,
  };
}
