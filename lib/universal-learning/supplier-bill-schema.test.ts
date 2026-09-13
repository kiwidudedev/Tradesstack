import { describe, expect, it } from "vitest";
import { UNIVERSAL_LEARNING_CONTAINER_TYPES } from "@/lib/universal-learning/types";
import type { UniversalLearningBusinessRecord } from "@/lib/universal-learning/types";
import {
  assertValidSupplierBillUclBusinessRecord,
  createSupplierBillUclTruncationMetadata,
  SUPPLIER_BILL_UCL_BUILDER_VERSION,
  SUPPLIER_BILL_UCL_CONTAINER_TYPE,
  SUPPLIER_BILL_UCL_LIMITS,
  SUPPLIER_BILL_UCL_PRODUCT_NAME,
  SUPPLIER_BILL_UCL_SCHEMA_VERSION,
  type SupplierBillUclBusinessRecord,
  type SupplierBillUclCollectionCounts,
  type SupplierBillUclLine,
  validateSupplierBillUclBusinessRecord,
  validateSupplierBillUclPayload,
} from "@/lib/universal-learning/supplier-bill-schema";
import { getUniversalLearningContainerDefinition } from "@/lib/universal-learning/container-catalog";

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";

function emptyCounts(): SupplierBillUclCollectionCounts {
  return {
    billLines: 0,
    poMatches: 0,
    attachmentReferences: 0,
    structuredExceptions: 0,
    recentMaterialStateTransitions: 0,
    allocationSummaries: 0,
    linkedProjects: 0,
    linkedPurchaseOrders: 0,
    purchaseOrderLineReferences: 0,
    commercialSnapshotReferences: 0,
    actualCostEventReferences: 0,
  };
}

function buildLine(index = 1): SupplierBillUclLine {
  return {
    lineId: `line-${index}`,
    lineUid: `line-uid-${index}`,
    sortOrder: index,
    supplierItemCode: `ITEM-${index}`,
    description: `Supply item ${index}`,
    quantity: 2,
    unitPrice: 50,
    lineTotal: 100,
    taxAmount: 15,
    projectId: "project-1",
    allocationSummary: {
      allocatedQuantity: 2,
      allocatedAmount: 100,
      allocationStatus: "approved",
      costCodeReferenceCount: 1,
    },
    poMatchSummary: {
      purchaseOrderId: "po-1",
      purchaseOrderLineItemId: "po-line-1",
      matchedQuantity: 2,
      matchedAmount: 100,
      previouslyApprovedQuantity: 4,
      cumulativeQuantity: 6,
      remainingQuantity: 4,
    },
    exceptionCodes: [],
  };
}

function buildMinimumRecord(): SupplierBillUclBusinessRecord {
  const counts = emptyCounts();
  return {
    containerType: "supplier_invoice",
    source: {
      table: "supplier_invoices",
      sourceId: "invoice-1",
      sourceVersion: 1,
    },
    organizationId: "org-1",
    projectId: null,
    opportunityId: null,
    supplierId: SUPPLIER_ID,
    supplier: {
      supplierId: SUPPLIER_ID,
      displayName: null,
    },
    clientId: null,
    actorUserId: null,
    updatedAt: "2026-07-27T01:00:00.000Z",
    status: {
      canonicalStatus: "Captured",
      workflowState: "captured",
      approvalState: "pending",
    },
    payload: {
      schemaVersion: SUPPLIER_BILL_UCL_SCHEMA_VERSION,
      sourceEvidence: {
        bill: {
          billNumber: null,
          billDate: null,
          dueDate: null,
          currency: "NZD",
          canonicalStatus: "Captured",
          source: "manual",
          supplierPoReference: null,
          notesSummary: null,
        },
        supplier: {
          supplierId: SUPPLIER_ID,
          displayName: null,
        },
        financialTotals: {
          subtotal: 0,
          taxTotal: 0,
          total: 0,
          calculatedLineSubtotal: 0,
          calculatedLineTax: 0,
          calculatedLineTotal: 0,
          headerVariance: 0,
        },
        taxSummary: {
          amountMode: null,
          evidencePresent: false,
          treatmentCounts: {
            taxable: 0,
            zeroRated: 0,
            exempt: 0,
            unresolved: 0,
          },
        },
        billLines: [],
        poMatches: [],
        commercialApproval: {
          approvalState: null,
          commercialApprovalId: null,
          siteReviewState: null,
          accountsApprovalState: null,
          approvedAt: null,
          approvedByRole: null,
          varianceCount: 0,
          varianceCodes: [],
          invalidationReasonCode: null,
        },
        allocationSummary: {
          totalAllocationCount: 0,
          allocatedLineCount: 0,
          allocatedAmount: 0,
          unallocatedAmount: 0,
          codedLineCount: 0,
          uncodedLineCount: 0,
          allocations: [],
        },
        actualCostPostingSummary: {
          postingEventCount: 0,
          postedAmount: 0,
          postedTax: 0,
          postedTotal: 0,
          reversalAmount: 0,
          netPostedAmount: 0,
        },
        xeroSummary: {
          accountingDocumentId: null,
          externalBillReference: null,
          exportStatus: null,
          attachmentStatus: null,
          lastExportedAt: null,
          lastSyncedAt: null,
          lastErrorCode: null,
          retryable: null,
        },
        paymentSummary: {
          paymentStatus: null,
          amountPaid: null,
          amountDue: null,
          fullyPaidAt: null,
          lastRefreshedAt: null,
        },
        attachmentSummary: {
          totalAttachmentCount: 0,
          references: [],
          extractionState: null,
          extractionSchemaVersion: null,
          warningCount: 0,
          errorCount: 0,
        },
      },
      operationalContext: {
        lifecycleStage: "captured",
        workflowState: "captured",
        approvalState: "pending",
        poMatchingCompleteness: "not_started",
        allocationCompleteness: "not_started",
        accountingReadiness: "not_ready",
        xeroReadiness: "not_ready",
        paymentState: null,
        unresolvedExceptionCount: 0,
        evidenceStrength: "weak",
        structuredExceptions: [],
        recentMaterialStateTransitions: [],
        truncated: false,
        omittedCounts: { ...counts },
        totalCounts: { ...counts },
      },
      lineage: {
        supplierBillId: "invoice-1",
        supplierId: SUPPLIER_ID,
        projectIds: [],
        purchaseOrderIds: [],
        purchaseOrderLineItemIds: [],
        billLineIds: [],
        allocationIds: [],
        commercialSnapshotIds: [],
        actualCostEventIds: [],
        accountingDocumentId: null,
        currentDocumentIds: [],
      },
      provenance: {
        assembledAt: "2026-07-27T01:01:00.000Z",
        canonicalRecordUpdatedAt: "2026-07-27T01:00:00.000Z",
        latestDependencyUpdatedAt: "2026-07-27T01:00:00.000Z",
        builderVersion: SUPPLIER_BILL_UCL_BUILDER_VERSION,
        queriedSourceTables: ["supplier_invoices"],
        contentHash: null,
      },
      visibility: {
        organizationId: "org-1",
        projectIds: [],
        requiresSupplierInvoiceView: true,
        requiresAccountingVisibility: false,
      },
    },
    linkedContext: {
      projects: [],
      purchaseOrders: [],
    },
    routingContext: {
      readOnly: true,
      organizationCostCodeIds: [],
      accountingMappingIds: [],
      tradesstackCostCodes: [],
      xeroAccountCodes: [],
      xeroTaxTypes: [],
    },
    signalStrength: "weak",
  };
}

function buildCompleteRecord(): SupplierBillUclBusinessRecord {
  const record = structuredClone(buildMinimumRecord());
  const line = buildLine();

  record.projectId = "project-1";
  record.actorUserId = "user-1";
  record.status = {
    canonicalStatus: "Approved",
    workflowState: "paid",
    approvalState: "approved",
  };
  record.signalStrength = "strong";
  record.payload.sourceEvidence.bill = {
    billNumber: "INV-1001",
    billDate: "2026-07-01",
    dueDate: "2026-07-31",
    currency: "NZD",
    canonicalStatus: "Approved",
    source: "upload",
    supplierPoReference: "PO-100",
    notesSummary: "Approved electrical materials.",
  };
  record.payload.sourceEvidence.supplier.displayName = "Example Electrical Limited";
  record.supplier.displayName = "Example Electrical Limited";
  record.payload.sourceEvidence.financialTotals = {
    subtotal: 100,
    taxTotal: 15,
    total: 115,
    calculatedLineSubtotal: 100,
    calculatedLineTax: 15,
    calculatedLineTotal: 115,
    headerVariance: 0,
  };
  record.payload.sourceEvidence.taxSummary = {
    amountMode: "exclusive",
    evidencePresent: true,
    treatmentCounts: {
      taxable: 1,
      zeroRated: 0,
      exempt: 0,
      unresolved: 0,
    },
  };
  record.payload.sourceEvidence.billLines = [line];
  record.payload.sourceEvidence.poMatches = [{
    matchId: "match-1",
    purchaseOrderId: "po-1",
    projectId: "project-1",
    matchedAmount: 100,
    matchBasis: "purchase_order_reference",
    matchStatus: "matched",
    approvalStatus: "approved",
    passedCheckCount: 3,
    failedCheckCount: 0,
    unresolvedCheckCount: 0,
  }];
  record.payload.sourceEvidence.commercialApproval = {
    approvalState: "approved",
    commercialApprovalId: "commercial-approval-1",
    siteReviewState: "approved",
    accountsApprovalState: "approved",
    approvedAt: "2026-07-03T03:00:00.000Z",
    approvedByRole: "quantity_surveyor",
    varianceCount: 0,
    varianceCodes: [],
    invalidationReasonCode: null,
  };
  record.payload.sourceEvidence.allocationSummary = {
    totalAllocationCount: 1,
    allocatedLineCount: 1,
    allocatedAmount: 100,
    unallocatedAmount: 0,
    codedLineCount: 1,
    uncodedLineCount: 0,
    allocations: [{
      allocationId: "allocation-1",
      billLineId: "line-1",
      projectId: "project-1",
      purchaseOrderId: "po-1",
      purchaseOrderLineItemId: "po-line-1",
      allocatedQuantity: 2,
      allocatedAmount: 100,
      allocationStatus: "approved",
      approvalStatus: "approved",
    }],
  };
  record.payload.sourceEvidence.actualCostPostingSummary = {
    postingEventCount: 1,
    postedAmount: 100,
    postedTax: 15,
    postedTotal: 115,
    reversalAmount: 0,
    netPostedAmount: 115,
  };
  record.payload.sourceEvidence.xeroSummary = {
    accountingDocumentId: "accounting-document-1",
    externalBillReference: "xero-bill-1",
    exportStatus: "exported",
    attachmentStatus: "attached",
    lastExportedAt: "2026-07-04T04:00:00.000Z",
    lastSyncedAt: "2026-07-05T05:00:00.000Z",
    lastErrorCode: null,
    retryable: false,
  };
  record.payload.sourceEvidence.paymentSummary = {
    paymentStatus: "paid",
    amountPaid: 115,
    amountDue: 0,
    fullyPaidAt: "2026-07-20T05:00:00.000Z",
    lastRefreshedAt: "2026-07-21T05:00:00.000Z",
  };
  record.payload.sourceEvidence.attachmentSummary = {
    totalAttachmentCount: 1,
    references: [{
      documentId: "document-1",
      documentType: "supplier_invoice",
      fileName: "INV-1001.pdf",
      isCurrent: true,
      extractionStatus: "completed",
    }],
    extractionState: "completed",
    extractionSchemaVersion: "supplier_invoice_extraction.v2",
    warningCount: 0,
    errorCount: 0,
  };
  record.payload.operationalContext = {
    lifecycleStage: "paid",
    workflowState: "paid",
    approvalState: "approved",
    poMatchingCompleteness: "complete",
    allocationCompleteness: "complete",
    accountingReadiness: "ready",
    xeroReadiness: "exported",
    paymentState: "paid",
    unresolvedExceptionCount: 1,
    evidenceStrength: "strong",
    structuredExceptions: [{
      code: "progressive_invoice",
      severity: "info",
      summary: "This bill progresses an existing Purchase Order line.",
      relatedLineId: "line-1",
    }],
    recentMaterialStateTransitions: [{
      eventId: "activity-1",
      state: "paid",
      occurredAt: "2026-07-20T05:00:00.000Z",
      source: "xero_payment_sync",
    }],
    ...createSupplierBillUclTruncationMetadata({
      totalCounts: {
        billLines: 1,
        poMatches: 1,
        attachmentReferences: 1,
        structuredExceptions: 1,
        recentMaterialStateTransitions: 1,
        allocationSummaries: 1,
        linkedProjects: 1,
        linkedPurchaseOrders: 1,
        purchaseOrderLineReferences: 1,
        commercialSnapshotReferences: 1,
        actualCostEventReferences: 1,
      },
      serializedCounts: {
        billLines: 1,
        poMatches: 1,
        attachmentReferences: 1,
        structuredExceptions: 1,
        recentMaterialStateTransitions: 1,
        allocationSummaries: 1,
        linkedProjects: 1,
        linkedPurchaseOrders: 1,
        purchaseOrderLineReferences: 1,
        commercialSnapshotReferences: 1,
        actualCostEventReferences: 1,
      },
    }),
  };
  record.payload.lineage = {
    supplierBillId: "invoice-1",
    supplierId: SUPPLIER_ID,
    projectIds: ["project-1"],
    purchaseOrderIds: ["po-1"],
    purchaseOrderLineItemIds: ["po-line-1"],
    billLineIds: ["line-1"],
    allocationIds: ["allocation-1"],
    commercialSnapshotIds: ["snapshot-1"],
    actualCostEventIds: ["cost-event-1"],
    accountingDocumentId: "accounting-document-1",
    currentDocumentIds: ["document-1"],
  };
  record.payload.provenance = {
    assembledAt: "2026-07-27T01:01:00.000Z",
    canonicalRecordUpdatedAt: "2026-07-27T01:00:00.000Z",
    latestDependencyUpdatedAt: "2026-07-21T05:00:00.000Z",
    builderVersion: SUPPLIER_BILL_UCL_BUILDER_VERSION,
    queriedSourceTables: [
      "supplier_invoices",
      "supplier_invoice_lines",
      "supplier_invoice_documents",
      "supplier_invoice_line_allocations",
      "supplier_invoice_purchase_order_matches",
      "project_actual_cost_events",
      "accounting_documents",
    ],
    contentHash: "sha256:fixture",
  };
  record.payload.visibility = {
    organizationId: "org-1",
    projectIds: ["project-1"],
    requiresSupplierInvoiceView: true,
    requiresAccountingVisibility: true,
  };
  record.linkedContext = {
    projects: [{
      projectId: "project-1",
      displayName: "Auckland Fitout",
      status: "Active",
    }],
    purchaseOrders: [{
      purchaseOrderId: "po-1",
      purchaseOrderNumber: "PO-100",
      projectId: "project-1",
      status: "Approved",
      committedTotal: 500,
    }],
  };
  record.routingContext = {
    readOnly: true,
    organizationCostCodeIds: ["cost-code-1"],
    accountingMappingIds: ["mapping-1"],
    tradesstackCostCodes: ["ELEC"],
    xeroAccountCodes: ["310"],
    xeroTaxTypes: ["INPUT2"],
  };
  return record;
}

function addForbiddenPayloadField(
  record: SupplierBillUclBusinessRecord,
  key: string,
  value: unknown,
) {
  const evidence = record.payload.sourceEvidence as unknown as Record<string, unknown>;
  evidence[key] = value;
}

function expectInvalidAt(result: ReturnType<typeof validateSupplierBillUclBusinessRecord>, path: string) {
  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.issues.some((issue) => issue.path.includes(path))).toBe(true);
}

describe("Supplier Bill UCL Container contract", () => {
  it("accepts a valid minimum Supplier Bill payload", () => {
    expect(validateSupplierBillUclPayload(buildMinimumRecord().payload)).toEqual({
      success: true,
      data: buildMinimumRecord().payload,
    });
  });

  it("accepts a valid complete Supplier Bill business record", () => {
    expect(validateSupplierBillUclBusinessRecord(buildCompleteRecord()).success).toBe(true);
  });

  it("requires the supplier_bill.v2 schema version", () => {
    const record = buildMinimumRecord();
    (record.payload as { schemaVersion: string }).schemaVersion = "supplier_bill.v1";
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "schemaVersion");
  });

  it("rejects a missing required field", () => {
    const record = buildMinimumRecord();
    delete (record.payload.sourceEvidence.bill as unknown as Record<string, unknown>).currency;
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "bill.currency");
  });

  it("requires the canonical top-level supplier object", () => {
    const record = buildMinimumRecord();
    delete (record as unknown as Record<string, unknown>).supplier;

    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "record.supplier");
  });

  it("requires a UUID when canonical supplier identity is present", () => {
    const record = buildMinimumRecord();
    record.supplier.supplierId = "supplier-1";

    expectInvalidAt(
      validateSupplierBillUclBusinessRecord(record),
      "record.supplier.supplierId",
    );
  });

  it("allows an explicitly absent canonical supplier relationship", () => {
    const record = buildMinimumRecord();
    record.supplierId = null;
    record.supplier = { supplierId: null, displayName: null };
    record.payload.sourceEvidence.supplier = {
      supplierId: null,
      displayName: null,
    };
    record.payload.lineage.supplierId = null;

    expect(validateSupplierBillUclBusinessRecord(record).success).toBe(true);
  });

  it("accepts Postgres microsecond timestamps with explicit UTC or offset zones", () => {
    const record = buildMinimumRecord();
    record.updatedAt = "2026-07-16T08:01:47.138918Z";
    record.payload.provenance.canonicalRecordUpdatedAt =
      "2026-07-16T20:01:47.592353+12:00";
    record.payload.provenance.latestDependencyUpdatedAt =
      "2026-07-16T08:01:47.138918+00:00";

    expect(validateSupplierBillUclBusinessRecord(record).success).toBe(true);
  });

  it.each([
    "2026-07-16",
    "2026-07-16T08:01:47",
    "2026-02-30T08:01:47Z",
  ])("rejects an ambiguous or invalid record.updatedAt value %s", (updatedAt) => {
    const record = buildMinimumRecord();
    record.updatedAt = updatedAt;
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "updatedAt");
  });

  it("rejects an unknown field through the explicit allowlist", () => {
    const record = buildMinimumRecord();
    addForbiddenPayloadField(record, "unexpectedMetadata", { arbitrary: true });
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "unexpectedMetadata");
  });

  it("rejects non-finite financial values", () => {
    const record = buildMinimumRecord();
    record.payload.sourceEvidence.financialTotals.total = Number.POSITIVE_INFINITY;
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "financialTotals.total");
  });

  it("rejects more than the allowed bill lines", () => {
    const record = buildMinimumRecord();
    record.payload.sourceEvidence.billLines = Array.from(
      { length: SUPPLIER_BILL_UCL_LIMITS.billLines + 1 },
      (_, index) => buildLine(index),
    );
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "billLines");
  });

  it("rejects more than the allowed PO matches", () => {
    const record = buildCompleteRecord();
    record.payload.sourceEvidence.poMatches = Array.from(
      { length: SUPPLIER_BILL_UCL_LIMITS.poMatches + 1 },
      (_, index) => ({
        ...record.payload.sourceEvidence.poMatches[0]!,
        matchId: `match-${index}`,
      }),
    );
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "poMatches");
  });

  it("rejects more than the allowed attachment references", () => {
    const record = buildCompleteRecord();
    record.payload.sourceEvidence.attachmentSummary.references = Array.from(
      { length: SUPPLIER_BILL_UCL_LIMITS.attachmentReferences + 1 },
      (_, index) => ({
        ...record.payload.sourceEvidence.attachmentSummary.references[0]!,
        documentId: `document-${index}`,
      }),
    );
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "attachmentSummary.references");
  });

  it("rejects a serialized payload above the 64 KB contract target", () => {
    const record = buildMinimumRecord();
    record.payload.sourceEvidence.billLines = Array.from({ length: 40 }, (_, index) => ({
      ...buildLine(index),
      description: `Line ${index} ${"x".repeat(1_900)}`,
    }));
    record.payload.lineage.billLineIds = record.payload.sourceEvidence.billLines.map((line) => line.lineId);
    record.payload.operationalContext = {
      ...record.payload.operationalContext,
      ...createSupplierBillUclTruncationMetadata({
        totalCounts: {
          ...emptyCounts(),
          billLines: 40,
        },
        serializedCounts: {
          ...emptyCounts(),
          billLines: 40,
        },
      }),
    };

    const result = validateSupplierBillUclBusinessRecord(record);
    expectInvalidAt(result, "payload");
    if (!result.success) {
      expect(result.issues.some((issue) => issue.message.includes("serialized size"))).toBe(true);
    }
  });

  it("rejects omitted counts that do not match complete and serialized counts", () => {
    const record = buildCompleteRecord();
    record.payload.operationalContext.omittedCounts.billLines = 1;
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "omittedCounts.billLines");
  });

  it("requires routing context to remain read-only", () => {
    const record = buildMinimumRecord();
    (record.routingContext as { readOnly: boolean }).readOnly = false;
    expectInvalidAt(validateSupplierBillUclBusinessRecord(record), "routingContext.readOnly");
  });

  it.each([
    ["raw OCR payload", "rawOcrPayload", { text: "private OCR text" }],
    ["storage path", "storagePath", "org-1/invoices/private.pdf"],
    ["signed URL", "signedUrl", "https://example.test/private"],
    ["AI reasoning", "aiReasoning", "model chain of thought"],
    ["Xero secret", "accessToken", "secret-token"],
  ])("rejects excluded %s fields", (_label, key, value) => {
    const record = buildMinimumRecord();
    addForbiddenPayloadField(record, key, value);
    const result = validateSupplierBillUclBusinessRecord(record);
    expectInvalidAt(result, key);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.message.includes("explicitly forbidden"))).toBe(true);
    }
  });

  it("validates deterministically without mutating the candidate", () => {
    const record = buildCompleteRecord();
    const before = JSON.stringify(record);
    const first = validateSupplierBillUclBusinessRecord(record);
    const second = validateSupplierBillUclBusinessRecord(record);

    expect(second).toEqual(first);
    expect(JSON.stringify(record)).toBe(before);
  });

  it("throws a clear server-side assertion error for an invalid record", () => {
    const record = buildMinimumRecord();
    (record.payload as { schemaVersion: string }).schemaVersion = "invalid";

    expect(() => assertValidSupplierBillUclBusinessRecord(record)).toThrow(
      "Invalid Supplier Bill UCL Container: payload.schemaVersion",
    );
  });

  it("creates deterministic truncation metadata without silently discarding counts", () => {
    const metadata = createSupplierBillUclTruncationMetadata({
      totalCounts: {
        ...emptyCounts(),
        billLines: 125,
        attachmentReferences: 30,
      },
      serializedCounts: {
        ...emptyCounts(),
        billLines: 100,
        attachmentReferences: 25,
      },
    });

    expect(metadata.truncated).toBe(true);
    expect(metadata.omittedCounts.billLines).toBe(25);
    expect(metadata.omittedCounts.attachmentReferences).toBe(5);
    expect(metadata.totalCounts.billLines).toBe(125);
  });

  it("is compatible with the shared UniversalLearningBusinessRecord envelope", () => {
    const supplierBillRecord = buildCompleteRecord();
    const sharedRecord: UniversalLearningBusinessRecord = supplierBillRecord;

    expect(sharedRecord.containerType).toBe("supplier_invoice");
    expect(validateSupplierBillUclBusinessRecord(sharedRecord).success).toBe(true);
  });

  it("preserves the existing supplier_invoice registry entry", () => {
    const definition = getUniversalLearningContainerDefinition("supplier_invoice");

    expect(definition.containerType).toBe("supplier_invoice");
    expect(definition.displayName).toBe("Supplier Bill");
    expect(definition.module).toBe("supplier_invoices");
    expect(SUPPLIER_BILL_UCL_PRODUCT_NAME).toBe("Supplier Bill UCL Container");
    expect(SUPPLIER_BILL_UCL_CONTAINER_TYPE).toBe("supplier_invoice");
  });

  it("does not add a competing supplier_bill container type", () => {
    expect(UNIVERSAL_LEARNING_CONTAINER_TYPES).toContain("supplier_invoice");
    expect(UNIVERSAL_LEARNING_CONTAINER_TYPES).not.toContain("supplier_bill");
  });
});
