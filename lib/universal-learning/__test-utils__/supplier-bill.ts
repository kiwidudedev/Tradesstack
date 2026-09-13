import { buildSupplierBillUclV2Sections } from "@/lib/universal-learning/supplier-bill-builder";
import {
  assertValidSupplierBillUclBusinessRecord,
  type SupplierBillUclBusinessRecord,
} from "@/lib/universal-learning/supplier-bill-schema";

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";

export function buildSupplierBillTestRecord(input: {
  index?: number;
  lineCount?: number;
  updatedAt?: string;
} = {}): SupplierBillUclBusinessRecord {
  const index = input.index ?? 1;
  const invoiceId = `invoice-${index}`;
  const updatedAt = input.updatedAt ?? `2026-07-27T01:${String(index).padStart(2, "0")}:00.000Z`;
  const lines = Array.from({ length: input.lineCount ?? 0 }, (_, lineIndex) => ({
    id: `${invoiceId}-line-${lineIndex + 1}`,
    organization_id: "org-1",
    supplier_invoice_id: invoiceId,
    sort_order: lineIndex + 1,
    description: `Canonical private line description ${lineIndex + 1}`,
    quantity: 1,
    unit_price: 100 + lineIndex,
    line_total: 100 + lineIndex,
    tax_amount: 15,
    updated_at: updatedAt,
  }));
  const sections = buildSupplierBillUclV2Sections({
    organizationId: "org-1",
    row: {
      id: invoiceId,
      organization_id: "org-1",
      supplier_id: SUPPLIER_ID,
      invoice_number: `BILL-${index}`,
      invoice_date: "2026-07-01",
      due_date: "2026-07-31",
      currency: "NZD",
      status: "Captured",
      source: "upload",
      subtotal: lines.reduce((sum, line) => sum + line.line_total, 0),
      tax_total: lines.reduce((sum, line) => sum + line.tax_amount, 0),
      total: lines.reduce((sum, line) => sum + line.line_total + line.tax_amount, 0),
      updated_at: updatedAt,
      created_at: updatedAt,
    },
    lines,
    documents: [],
    matches: [],
    allocations: [],
    actualCostEvents: [],
    supplier: {
      id: SUPPLIER_ID,
      organization_id: "org-1",
      name: "Test Supplier",
      updated_at: updatedAt,
    },
    purchaseOrdersById: new Map(),
    purchaseOrderLinesById: new Map(),
    projectsById: new Map(),
    extractions: [],
    commercialApprovals: [],
    commercialSnapshots: [],
    historicalApprovedSnapshots: [],
    commercialVariances: [],
    siteReviewSubmissions: [],
    siteReviewDecisions: [],
    accountsApprovals: [],
    activityEvents: [],
    accountingDocuments: [],
    accountingDocumentLines: [],
    assembledAt: updatedAt,
    updatedAt,
  });
  const record: SupplierBillUclBusinessRecord = {
    containerType: "supplier_invoice",
    source: {
      table: "supplier_invoices",
      sourceId: invoiceId,
      sourceVersion: 1,
    },
    organizationId: "org-1",
    projectId: sections.projectIds[0] ?? null,
    opportunityId: null,
    supplierId: SUPPLIER_ID,
    supplier: { ...sections.payload.sourceEvidence.supplier },
    clientId: null,
    actorUserId: null,
    updatedAt,
    status: {
      canonicalStatus: "Captured",
      workflowState: sections.workflowState,
      approvalState: sections.approvalState,
    },
    payload: sections.payload,
    linkedContext: sections.linkedContext,
    routingContext: sections.routingContext,
    signalStrength: sections.evidenceStrength,
  };
  assertValidSupplierBillUclBusinessRecord(record);
  return record;
}

export function buildSupplierBillPromptCompactionFailureRecord() {
  const record = buildSupplierBillTestRecord();
  const projectIds = Array.from({ length: 100 }, (_, index) => `project-${index + 1}`);
  const purchaseOrderIds = Array.from({ length: 20 }, (_, index) => `po-${index + 1}`);
  record.payload.lineage.projectIds = projectIds;
  record.payload.visibility.projectIds = projectIds;
  record.payload.lineage.purchaseOrderIds = purchaseOrderIds;
  record.payload.operationalContext.totalCounts.linkedProjects = projectIds.length;
  record.payload.operationalContext.totalCounts.linkedPurchaseOrders = purchaseOrderIds.length;
  record.linkedContext.projects = projectIds.map((projectId) => ({
    projectId,
    displayName: `Project ${projectId} ${"x".repeat(430)}`,
    status: "Active",
  }));
  record.linkedContext.purchaseOrders = purchaseOrderIds.map((purchaseOrderId) => ({
    purchaseOrderId,
    purchaseOrderNumber: `PO ${purchaseOrderId} ${"y".repeat(170)}`,
    projectId: null,
    status: "Approved",
    committedTotal: 1_000,
  }));
  assertValidSupplierBillUclBusinessRecord(record);
  return record;
}
