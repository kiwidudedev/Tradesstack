import type {
  UniversalLearningBusinessRecord,
  UniversalLearningLinkedContext,
  UniversalLearningPayload,
  UniversalLearningRoutingContext,
} from "@/lib/universal-learning/types";
import { isValidSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";

/**
 * Product name: Supplier Bill UCL Container.
 * Internal UCL key: supplier_invoice.
 *
 * This version identifies the payload contract. It is deliberately independent
 * from source row versions, prompt versions, AI model versions, and migrations.
 */
export const SUPPLIER_BILL_UCL_PRODUCT_NAME = "Supplier Bill UCL Container" as const;
export const SUPPLIER_BILL_UCL_CONTAINER_TYPE = "supplier_invoice" as const;
export const SUPPLIER_BILL_UCL_SCHEMA_VERSION = "supplier_bill.v2" as const;
export const SUPPLIER_BILL_UCL_BUILDER_VERSION = "supplier_bill.contract.v2" as const;

export const SUPPLIER_BILL_UCL_LIMITS = Object.freeze({
  billLines: 100,
  poMatches: 20,
  attachmentReferences: 25,
  structuredExceptions: 20,
  recentMaterialStateTransitions: 5,
  allocationSummaries: 100,
  linkedProjects: 100,
  linkedPurchaseOrders: 20,
  purchaseOrderLineReferences: 100,
  commercialSnapshotReferences: 100,
  actualCostEventReferences: 100,
  serializedPayloadBytes: 64 * 1024,
});

export const SUPPLIER_BILL_UCL_COUNTED_COLLECTIONS = [
  "billLines",
  "poMatches",
  "attachmentReferences",
  "structuredExceptions",
  "recentMaterialStateTransitions",
  "allocationSummaries",
  "linkedProjects",
  "linkedPurchaseOrders",
  "purchaseOrderLineReferences",
  "commercialSnapshotReferences",
  "actualCostEventReferences",
] as const;

export const SUPPLIER_BILL_UCL_FORBIDDEN_FIELD_CATEGORIES = Object.freeze([
  "raw database rows and arbitrary source blobs",
  "raw OCR payloads and full extracted document text",
  "PDF or image bytes",
  "storage bucket paths and signed or temporary URLs",
  "Xero credentials, tokens, and raw request or response payloads",
  "AI reasoning, classification internals, and suggestion metadata",
  "device identifiers",
  "private contact and banking details",
  "unrestricted audit history",
]);

export type SupplierBillUclCountedCollection =
  (typeof SUPPLIER_BILL_UCL_COUNTED_COLLECTIONS)[number];

export type SupplierBillUclCollectionCounts = Record<SupplierBillUclCountedCollection, number>;

/**
 * Field-classification vocabulary used by this contract:
 * - required: must always be present, although a value may explicitly be nullable;
 * - nullable: absence is represented as null, never by omitting the field;
 * - server-derived: calculated from canonical server-side records;
 * - authoritative snapshot: copied from an authoritative stored domain record;
 * - live reference: stable identity of a related canonical record;
 * - permission-sensitive: may only be assembled/retrieved after server authorization;
 * - bounded: subject to a deterministic collection or string limit.
 */
export type SupplierBillUclFieldClassification =
  | "required"
  | "nullable"
  | "server-derived"
  | "authoritative-snapshot"
  | "live-reference"
  | "permission-sensitive"
  | "bounded";

export type SupplierBillUclLine = {
  lineId: string; // required, live-reference
  lineUid: string | null; // required, nullable, authoritative-snapshot
  sortOrder: number; // required, authoritative-snapshot
  supplierItemCode: string | null; // required, nullable, authoritative-snapshot
  description: string | null; // required, nullable, authoritative-snapshot, bounded
  quantity: number | null; // required, nullable, authoritative-snapshot
  unitPrice: number | null; // required, nullable, authoritative-snapshot
  lineTotal: number; // required, authoritative-snapshot
  taxAmount: number; // required, authoritative-snapshot
  projectId: string | null; // required, nullable, live-reference
  allocationSummary: {
    allocatedQuantity: number; // required, server-derived
    allocatedAmount: number; // required, server-derived
    allocationStatus: string | null; // required, nullable, server-derived
    costCodeReferenceCount: number; // required, server-derived
  };
  poMatchSummary: {
    purchaseOrderId: string; // required, live-reference
    purchaseOrderLineItemId: string | null; // required, nullable, live-reference
    matchedQuantity: number | null; // required, nullable, server-derived
    matchedAmount: number | null; // required, nullable, server-derived
    previouslyApprovedQuantity: number; // required, server-derived
    cumulativeQuantity: number; // required, server-derived
    remainingQuantity: number | null; // required, nullable, server-derived
  } | null; // required, nullable
  exceptionCodes: string[]; // required, server-derived, bounded
};

export type SupplierBillUclPoMatch = {
  matchId: string; // required, live-reference
  purchaseOrderId: string; // required, live-reference
  projectId: string | null; // required, nullable, live-reference
  matchedAmount: number | null; // required, nullable, authoritative-snapshot
  matchBasis: string | null; // required, nullable, authoritative-snapshot
  matchStatus: string | null; // required, nullable, authoritative-snapshot
  approvalStatus: string | null; // required, nullable, authoritative-snapshot
  passedCheckCount: number; // required, server-derived
  failedCheckCount: number; // required, server-derived
  unresolvedCheckCount: number; // required, server-derived
};

export type SupplierBillUclAllocation = {
  allocationId: string; // required, live-reference
  billLineId: string; // required, live-reference
  projectId: string | null; // required, nullable, live-reference
  purchaseOrderId: string | null; // required, nullable, live-reference
  purchaseOrderLineItemId: string | null; // required, nullable, live-reference
  allocatedQuantity: number; // required, authoritative-snapshot
  allocatedAmount: number; // required, authoritative-snapshot
  allocationStatus: string | null; // required, nullable, authoritative-snapshot
  approvalStatus: string | null; // required, nullable, authoritative-snapshot
};

export type SupplierBillUclAttachmentReference = {
  documentId: string; // required, live-reference, permission-sensitive
  documentType: string | null; // required, nullable, authoritative-snapshot
  fileName: string | null; // required, nullable, authoritative-snapshot, permission-sensitive, bounded
  isCurrent: boolean; // required, authoritative-snapshot
  extractionStatus: string | null; // required, nullable, authoritative-snapshot
};

export type SupplierBillUclStructuredException = {
  code: string; // required, server-derived
  severity: "info" | "warning" | "error"; // required, server-derived
  summary: string; // required, server-derived, bounded
  relatedLineId: string | null; // required, nullable, live-reference
};

export type SupplierBillUclStateTransition = {
  eventId: string; // required, live-reference
  state: string; // required, authoritative-snapshot
  occurredAt: string; // required, authoritative-snapshot
  source: string; // required, authoritative-snapshot
};

export type SupplierBillUclPayload = UniversalLearningPayload & {
  schemaVersion: typeof SUPPLIER_BILL_UCL_SCHEMA_VERSION; // required
  sourceEvidence: {
    bill: {
      billNumber: string | null; // required, nullable, authoritative-snapshot
      billDate: string | null; // required, nullable, authoritative-snapshot
      dueDate: string | null; // required, nullable, authoritative-snapshot
      currency: string; // required, authoritative-snapshot
      canonicalStatus: string; // required, authoritative-snapshot
      source: string; // required, authoritative-snapshot
      supplierPoReference: string | null; // required, nullable, authoritative-snapshot
      notesSummary: string | null; // required, nullable, authoritative-snapshot, bounded
    };
    supplier: {
      supplierId: string | null; // required, nullable, live-reference
      displayName: string | null; // required, nullable, authoritative-snapshot
    };
    financialTotals: {
      subtotal: number; // required, authoritative-snapshot; represents every canonical line
      taxTotal: number; // required, authoritative-snapshot; represents every canonical line
      total: number; // required, authoritative-snapshot; represents every canonical line
      calculatedLineSubtotal: number; // required, server-derived; represents every canonical line
      calculatedLineTax: number; // required, server-derived; represents every canonical line
      calculatedLineTotal: number; // required, server-derived; represents every canonical line
      headerVariance: number; // required, server-derived
    };
    taxSummary: {
      amountMode: string | null; // required, nullable, authoritative-snapshot
      evidencePresent: boolean; // required, server-derived
      treatmentCounts: {
        taxable: number; // required, server-derived
        zeroRated: number; // required, server-derived
        exempt: number; // required, server-derived
        unresolved: number; // required, server-derived
      };
    };
    billLines: SupplierBillUclLine[]; // required, bounded
    poMatches: SupplierBillUclPoMatch[]; // required, bounded
    commercialApproval: {
      approvalState: string | null; // required, nullable, authoritative-snapshot
      commercialApprovalId: string | null; // required, nullable, live-reference
      siteReviewState: string | null; // required, nullable, authoritative-snapshot
      accountsApprovalState: string | null; // required, nullable, authoritative-snapshot
      approvedAt: string | null; // required, nullable, authoritative-snapshot
      approvedByRole: string | null; // required, nullable, permission-sensitive snapshot
      varianceCount: number; // required, server-derived
      varianceCodes: string[]; // required, server-derived, bounded
      invalidationReasonCode: string | null; // required, nullable, authoritative-snapshot
    };
    allocationSummary: {
      totalAllocationCount: number; // required, server-derived; complete canonical count
      allocatedLineCount: number; // required, server-derived
      allocatedAmount: number; // required, server-derived; complete canonical total
      unallocatedAmount: number; // required, server-derived; complete canonical total
      codedLineCount: number; // required, server-derived
      uncodedLineCount: number; // required, server-derived
      allocations: SupplierBillUclAllocation[]; // required, bounded
    };
    actualCostPostingSummary: {
      postingEventCount: number; // required, server-derived; complete canonical count
      postedAmount: number; // required, server-derived; complete canonical total
      postedTax: number; // required, server-derived; complete canonical total
      postedTotal: number; // required, server-derived; complete canonical total
      reversalAmount: number; // required, server-derived; complete canonical total
      netPostedAmount: number; // required, server-derived; complete canonical total
    };
    xeroSummary: {
      accountingDocumentId: string | null; // required, nullable, live-reference, permission-sensitive
      externalBillReference: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
      exportStatus: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
      attachmentStatus: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
      lastExportedAt: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
      lastSyncedAt: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
      lastErrorCode: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
      retryable: boolean | null; // required, nullable, server-derived, permission-sensitive
    };
    paymentSummary: {
      paymentStatus: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
      amountPaid: number | null; // required, nullable, authoritative-snapshot, permission-sensitive
      amountDue: number | null; // required, nullable, server-derived, permission-sensitive
      fullyPaidAt: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
      lastRefreshedAt: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
    };
    attachmentSummary: {
      totalAttachmentCount: number; // required, server-derived; complete canonical count
      references: SupplierBillUclAttachmentReference[]; // required, bounded, permission-sensitive
      extractionState: string | null; // required, nullable, server-derived
      extractionSchemaVersion: string | null; // required, nullable, authoritative-snapshot
      warningCount: number; // required, server-derived
      errorCount: number; // required, server-derived
    };
  };
  operationalContext: {
    lifecycleStage: string; // required, server-derived
    workflowState: string; // required, server-derived
    approvalState: string; // required, server-derived
    poMatchingCompleteness: string; // required, server-derived
    allocationCompleteness: string; // required, server-derived
    accountingReadiness: string; // required, server-derived
    xeroReadiness: string; // required, server-derived, permission-sensitive
    paymentState: string | null; // required, nullable, server-derived, permission-sensitive
    unresolvedExceptionCount: number; // required, server-derived
    evidenceStrength: "weak" | "normal" | "strong"; // required, server-derived
    structuredExceptions: SupplierBillUclStructuredException[]; // required, bounded
    recentMaterialStateTransitions: SupplierBillUclStateTransition[]; // required, bounded
    truncated: boolean; // required, server-derived
    omittedCounts: SupplierBillUclCollectionCounts; // required, server-derived
    totalCounts: SupplierBillUclCollectionCounts; // required, server-derived; complete canonical counts
  };
  lineage: {
    supplierBillId: string; // required, live-reference
    supplierId: string | null; // required, nullable, live-reference
    projectIds: string[]; // required, live-reference, bounded
    purchaseOrderIds: string[]; // required, live-reference, bounded
    purchaseOrderLineItemIds: string[]; // required, live-reference, bounded
    billLineIds: string[]; // required, live-reference, bounded
    allocationIds: string[]; // required, live-reference, bounded
    commercialSnapshotIds: string[]; // required, live-reference, bounded
    actualCostEventIds: string[]; // required, live-reference, bounded
    accountingDocumentId: string | null; // required, nullable, live-reference, permission-sensitive
    currentDocumentIds: string[]; // required, live-reference, permission-sensitive, bounded
  };
  provenance: {
    assembledAt: string; // required, server-derived
    canonicalRecordUpdatedAt: string; // required, authoritative-snapshot
    latestDependencyUpdatedAt: string; // required, server-derived
    builderVersion: string; // required, server-derived
    queriedSourceTables: string[]; // required, server-derived, bounded
    contentHash: string | null; // required, nullable, server-derived
  };
  visibility: {
    organizationId: string; // required, server-derived, permission-sensitive
    projectIds: string[]; // required, server-derived, permission-sensitive
    requiresSupplierInvoiceView: true; // required, server-derived, permission-sensitive
    requiresAccountingVisibility: boolean; // required, server-derived, permission-sensitive
  };
};

export type SupplierBillUclLinkedContext = UniversalLearningLinkedContext & {
  projects: Array<{
    projectId: string; // required, live-reference, permission-sensitive
    displayName: string | null; // required, nullable, authoritative-snapshot, permission-sensitive
    status: string | null; // required, nullable, authoritative-snapshot
  }>; // required, bounded
  purchaseOrders: Array<{
    purchaseOrderId: string; // required, live-reference
    purchaseOrderNumber: string | null; // required, nullable, authoritative-snapshot
    projectId: string | null; // required, nullable, live-reference
    status: string | null; // required, nullable, authoritative-snapshot
    committedTotal: number | null; // required, nullable, authoritative-snapshot, permission-sensitive
  }>; // required, bounded
};

export type SupplierBillUclRoutingContext = UniversalLearningRoutingContext & {
  readOnly: true; // required, server-derived
  organizationCostCodeIds: string[]; // required, live-reference, permission-sensitive, bounded
  accountingMappingIds: string[]; // required, live-reference, permission-sensitive, bounded
  tradesstackCostCodes: string[]; // required, authoritative-snapshot, permission-sensitive, bounded
  xeroAccountCodes: string[]; // required, authoritative-snapshot, permission-sensitive, bounded
  xeroTaxTypes: string[]; // required, authoritative-snapshot, permission-sensitive, bounded
};

export type SupplierBillUclStatus = {
  canonicalStatus: string; // required, authoritative-snapshot
  workflowState: string; // required, server-derived
  approvalState: string; // required, server-derived
};

export type SupplierBillUclSupplierIdentity = {
  supplierId: string | null; // required, nullable, canonical live-reference
  displayName: string | null; // required, nullable, authoritative supplier name
};

export type SupplierBillUclBusinessRecord = UniversalLearningBusinessRecord & {
  containerType: "supplier_invoice";
  supplier: SupplierBillUclSupplierIdentity;
  status: SupplierBillUclStatus;
  payload: SupplierBillUclPayload;
  linkedContext: SupplierBillUclLinkedContext;
  routingContext: SupplierBillUclRoutingContext;
};

export type SupplierBillUclValidationIssue = {
  path: string;
  message: string;
};

export type SupplierBillUclValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues: SupplierBillUclValidationIssue[] };

const COUNT_LIMITS: SupplierBillUclCollectionCounts = {
  billLines: SUPPLIER_BILL_UCL_LIMITS.billLines,
  poMatches: SUPPLIER_BILL_UCL_LIMITS.poMatches,
  attachmentReferences: SUPPLIER_BILL_UCL_LIMITS.attachmentReferences,
  structuredExceptions: SUPPLIER_BILL_UCL_LIMITS.structuredExceptions,
  recentMaterialStateTransitions: SUPPLIER_BILL_UCL_LIMITS.recentMaterialStateTransitions,
  allocationSummaries: SUPPLIER_BILL_UCL_LIMITS.allocationSummaries,
  linkedProjects: SUPPLIER_BILL_UCL_LIMITS.linkedProjects,
  linkedPurchaseOrders: SUPPLIER_BILL_UCL_LIMITS.linkedPurchaseOrders,
  purchaseOrderLineReferences: SUPPLIER_BILL_UCL_LIMITS.purchaseOrderLineReferences,
  commercialSnapshotReferences: SUPPLIER_BILL_UCL_LIMITS.commercialSnapshotReferences,
  actualCostEventReferences: SUPPLIER_BILL_UCL_LIMITS.actualCostEventReferences,
};

const FORBIDDEN_FIELD_NAMES = new Set([
  "row",
  "rawrow",
  "rawdatabaserow",
  "rawocr",
  "rawocrpayload",
  "ocrpayload",
  "extractedpayload",
  "extractedtext",
  "fullextractedtext",
  "pdfbytes",
  "imagebytes",
  "storagepath",
  "storagebucket",
  "bucketpath",
  "signedurl",
  "temporaryurl",
  "tempurl",
  "xerocredentials",
  "accesstoken",
  "refreshtoken",
  "xerorequest",
  "xeroresponse",
  "rawxerorequest",
  "rawxeroresponse",
  "rawxerorequestpayload",
  "rawxeroresponsepayload",
  "aireasoning",
  "aireasoningsummary",
  "aiclassification",
  "aiconstructionintelligence",
  "aisuggestionmetadata",
  "aisuggestionmetadatajson",
  "deviceid",
  "deviceidentifier",
  "bankaccount",
  "bankingdetails",
  "privatecontact",
  "privatecontactdetails",
  "audithistory",
]);

function normalizeFieldName(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function formatValidationError(issues: SupplierBillUclValidationIssue[]) {
  const first = issues[0];
  return first ? `${first.path}: ${first.message}` : "Invalid Supplier Bill UCL contract.";
}

class Validator {
  readonly issues: SupplierBillUclValidationIssue[] = [];

  issue(path: string, message: string) {
    this.issues.push({ path, message });
  }

  object(
    value: unknown,
    path: string,
    allowedKeys: readonly string[],
  ): Record<string, unknown> | null {
    if (!isRecord(value)) {
      this.issue(path, "must be an object.");
      return null;
    }

    const allowed = new Set(allowedKeys);
    for (const key of Object.keys(value).sort()) {
      if (!allowed.has(key)) {
        this.issue(`${path}.${key}`, "is not a permitted field.");
      }
    }
    for (const key of allowedKeys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        this.issue(`${path}.${key}`, "is required.");
      }
    }
    return value;
  }

  string(value: unknown, path: string, options?: { nullable?: boolean; maxLength?: number }) {
    if (options?.nullable && value === null) {
      return;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      this.issue(path, options?.nullable ? "must be a non-empty string or null." : "must be a non-empty string.");
      return;
    }
    if (options?.maxLength !== undefined && value.length > options.maxLength) {
      this.issue(path, `must not exceed ${options.maxLength} characters.`);
    }
  }

  identifier(value: unknown, path: string, nullable = false) {
    if (nullable && value === null) {
      return;
    }
    this.string(value, path, { maxLength: 200 });
  }

  uuid(value: unknown, path: string, nullable = false) {
    if (nullable && value === null) {
      return;
    }
    if (
      typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
      this.issue(path, nullable ? "must be a UUID or null." : "must be a UUID.");
    }
  }

  number(value: unknown, path: string, options?: { nullable?: boolean; integer?: boolean; minimum?: number }) {
    if (options?.nullable && value === null) {
      return;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.issue(path, options?.nullable ? "must be a finite number or null." : "must be a finite number.");
      return;
    }
    if (options?.integer && !Number.isSafeInteger(value)) {
      this.issue(path, "must be a safe integer.");
    }
    if (options?.minimum !== undefined && value < options.minimum) {
      this.issue(path, `must be at least ${options.minimum}.`);
    }
  }

  boolean(value: unknown, path: string) {
    if (typeof value !== "boolean") {
      this.issue(path, "must be a boolean.");
    }
  }

  literal(value: unknown, path: string, expected: string | boolean) {
    if (value !== expected) {
      this.issue(path, `must equal ${JSON.stringify(expected)}.`);
    }
  }

  timestamp(value: unknown, path: string, nullable = false) {
    if (nullable && value === null) {
      return;
    }
    if (!isValidSupplierBillUclTimestamp(value)) {
      this.issue(path, nullable ? "must be an ISO timestamp or null." : "must be an ISO timestamp.");
    }
  }

  date(value: unknown, path: string, nullable = false) {
    if (nullable && value === null) {
      return;
    }
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
    ) {
      this.issue(path, nullable ? "must be an ISO date or null." : "must be an ISO date.");
    }
  }

  array<T>(
    value: unknown,
    path: string,
    limit: number,
    validateItem: (item: unknown, itemPath: string, index: number) => T | void,
  ): unknown[] {
    if (!Array.isArray(value)) {
      this.issue(path, "must be an array.");
      return [];
    }
    if (value.length > limit) {
      this.issue(path, `must contain at most ${limit} items.`);
    }
    value.forEach((item, index) => validateItem(item, `${path}[${index}]`, index));
    return value;
  }

  stringArray(value: unknown, path: string, limit: number) {
    return this.array(value, path, limit, (item, itemPath) => this.identifier(item, itemPath));
  }
}

function scanForbiddenFields(
  value: unknown,
  path: string,
  issues: SupplierBillUclValidationIssue[],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenFields(item, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  for (const key of Object.keys(value).sort()) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_FIELD_NAMES.has(normalizeFieldName(key))) {
      issues.push({ path: childPath, message: "is explicitly forbidden in the Supplier Bill UCL contract." });
    }
    scanForbiddenFields(value[key], childPath, issues);
  }
}

function validateCounts(
  validator: Validator,
  value: unknown,
  path: string,
): SupplierBillUclCollectionCounts | null {
  const object = validator.object(value, path, SUPPLIER_BILL_UCL_COUNTED_COLLECTIONS);
  if (!object) {
    return null;
  }
  for (const key of SUPPLIER_BILL_UCL_COUNTED_COLLECTIONS) {
    validator.number(object[key], `${path}.${key}`, { integer: true, minimum: 0 });
  }
  return object as SupplierBillUclCollectionCounts;
}

function validateLine(validator: Validator, value: unknown, path: string) {
  const object = validator.object(value, path, [
    "lineId",
    "lineUid",
    "sortOrder",
    "supplierItemCode",
    "description",
    "quantity",
    "unitPrice",
    "lineTotal",
    "taxAmount",
    "projectId",
    "allocationSummary",
    "poMatchSummary",
    "exceptionCodes",
  ]);
  if (!object) return;

  validator.identifier(object.lineId, `${path}.lineId`);
  validator.identifier(object.lineUid, `${path}.lineUid`, true);
  validator.number(object.sortOrder, `${path}.sortOrder`, { integer: true, minimum: 0 });
  validator.string(object.supplierItemCode, `${path}.supplierItemCode`, { nullable: true, maxLength: 200 });
  validator.string(object.description, `${path}.description`, { nullable: true, maxLength: 2_000 });
  validator.number(object.quantity, `${path}.quantity`, { nullable: true });
  validator.number(object.unitPrice, `${path}.unitPrice`, { nullable: true });
  validator.number(object.lineTotal, `${path}.lineTotal`);
  validator.number(object.taxAmount, `${path}.taxAmount`);
  validator.identifier(object.projectId, `${path}.projectId`, true);

  const allocation = validator.object(object.allocationSummary, `${path}.allocationSummary`, [
    "allocatedQuantity",
    "allocatedAmount",
    "allocationStatus",
    "costCodeReferenceCount",
  ]);
  if (allocation) {
    validator.number(allocation.allocatedQuantity, `${path}.allocationSummary.allocatedQuantity`);
    validator.number(allocation.allocatedAmount, `${path}.allocationSummary.allocatedAmount`);
    validator.string(allocation.allocationStatus, `${path}.allocationSummary.allocationStatus`, {
      nullable: true,
      maxLength: 100,
    });
    validator.number(allocation.costCodeReferenceCount, `${path}.allocationSummary.costCodeReferenceCount`, {
      integer: true,
      minimum: 0,
    });
  }

  if (object.poMatchSummary !== null) {
    const match = validator.object(object.poMatchSummary, `${path}.poMatchSummary`, [
      "purchaseOrderId",
      "purchaseOrderLineItemId",
      "matchedQuantity",
      "matchedAmount",
      "previouslyApprovedQuantity",
      "cumulativeQuantity",
      "remainingQuantity",
    ]);
    if (match) {
      validator.identifier(match.purchaseOrderId, `${path}.poMatchSummary.purchaseOrderId`);
      validator.identifier(match.purchaseOrderLineItemId, `${path}.poMatchSummary.purchaseOrderLineItemId`, true);
      validator.number(match.matchedQuantity, `${path}.poMatchSummary.matchedQuantity`, { nullable: true });
      validator.number(match.matchedAmount, `${path}.poMatchSummary.matchedAmount`, { nullable: true });
      validator.number(match.previouslyApprovedQuantity, `${path}.poMatchSummary.previouslyApprovedQuantity`);
      validator.number(match.cumulativeQuantity, `${path}.poMatchSummary.cumulativeQuantity`);
      validator.number(match.remainingQuantity, `${path}.poMatchSummary.remainingQuantity`, { nullable: true });
    }
  }

  validator.stringArray(object.exceptionCodes, `${path}.exceptionCodes`, SUPPLIER_BILL_UCL_LIMITS.structuredExceptions);
}

function validatePoMatch(validator: Validator, value: unknown, path: string) {
  const object = validator.object(value, path, [
    "matchId",
    "purchaseOrderId",
    "projectId",
    "matchedAmount",
    "matchBasis",
    "matchStatus",
    "approvalStatus",
    "passedCheckCount",
    "failedCheckCount",
    "unresolvedCheckCount",
  ]);
  if (!object) return;

  validator.identifier(object.matchId, `${path}.matchId`);
  validator.identifier(object.purchaseOrderId, `${path}.purchaseOrderId`);
  validator.identifier(object.projectId, `${path}.projectId`, true);
  validator.number(object.matchedAmount, `${path}.matchedAmount`, { nullable: true });
  validator.string(object.matchBasis, `${path}.matchBasis`, { nullable: true, maxLength: 100 });
  validator.string(object.matchStatus, `${path}.matchStatus`, { nullable: true, maxLength: 100 });
  validator.string(object.approvalStatus, `${path}.approvalStatus`, { nullable: true, maxLength: 100 });
  for (const key of ["passedCheckCount", "failedCheckCount", "unresolvedCheckCount"] as const) {
    validator.number(object[key], `${path}.${key}`, { integer: true, minimum: 0 });
  }
}

function validateAllocation(validator: Validator, value: unknown, path: string) {
  const object = validator.object(value, path, [
    "allocationId",
    "billLineId",
    "projectId",
    "purchaseOrderId",
    "purchaseOrderLineItemId",
    "allocatedQuantity",
    "allocatedAmount",
    "allocationStatus",
    "approvalStatus",
  ]);
  if (!object) return;

  validator.identifier(object.allocationId, `${path}.allocationId`);
  validator.identifier(object.billLineId, `${path}.billLineId`);
  validator.identifier(object.projectId, `${path}.projectId`, true);
  validator.identifier(object.purchaseOrderId, `${path}.purchaseOrderId`, true);
  validator.identifier(object.purchaseOrderLineItemId, `${path}.purchaseOrderLineItemId`, true);
  validator.number(object.allocatedQuantity, `${path}.allocatedQuantity`);
  validator.number(object.allocatedAmount, `${path}.allocatedAmount`);
  validator.string(object.allocationStatus, `${path}.allocationStatus`, { nullable: true, maxLength: 100 });
  validator.string(object.approvalStatus, `${path}.approvalStatus`, { nullable: true, maxLength: 100 });
}

function validateAttachment(validator: Validator, value: unknown, path: string) {
  const object = validator.object(value, path, [
    "documentId",
    "documentType",
    "fileName",
    "isCurrent",
    "extractionStatus",
  ]);
  if (!object) return;

  validator.identifier(object.documentId, `${path}.documentId`);
  validator.string(object.documentType, `${path}.documentType`, { nullable: true, maxLength: 100 });
  validator.string(object.fileName, `${path}.fileName`, { nullable: true, maxLength: 500 });
  validator.boolean(object.isCurrent, `${path}.isCurrent`);
  validator.string(object.extractionStatus, `${path}.extractionStatus`, { nullable: true, maxLength: 100 });
}

function validateOperationalContext(
  validator: Validator,
  value: unknown,
  payload: Record<string, unknown>,
  linkedContext?: SupplierBillUclLinkedContext,
) {
  const path = "payload.operationalContext";
  const object = validator.object(value, path, [
    "lifecycleStage",
    "workflowState",
    "approvalState",
    "poMatchingCompleteness",
    "allocationCompleteness",
    "accountingReadiness",
    "xeroReadiness",
    "paymentState",
    "unresolvedExceptionCount",
    "evidenceStrength",
    "structuredExceptions",
    "recentMaterialStateTransitions",
    "truncated",
    "omittedCounts",
    "totalCounts",
  ]);
  if (!object) return;

  for (const key of [
    "lifecycleStage",
    "workflowState",
    "approvalState",
    "poMatchingCompleteness",
    "allocationCompleteness",
    "accountingReadiness",
    "xeroReadiness",
  ] as const) {
    validator.string(object[key], `${path}.${key}`, { maxLength: 100 });
  }
  validator.string(object.paymentState, `${path}.paymentState`, { nullable: true, maxLength: 100 });
  validator.number(object.unresolvedExceptionCount, `${path}.unresolvedExceptionCount`, {
    integer: true,
    minimum: 0,
  });
  if (!["weak", "normal", "strong"].includes(String(object.evidenceStrength))) {
    validator.issue(`${path}.evidenceStrength`, "must be weak, normal, or strong.");
  }

  const exceptions = validator.array(
    object.structuredExceptions,
    `${path}.structuredExceptions`,
    SUPPLIER_BILL_UCL_LIMITS.structuredExceptions,
    (item, itemPath) => {
      const exception = validator.object(item, itemPath, ["code", "severity", "summary", "relatedLineId"]);
      if (!exception) return;
      validator.string(exception.code, `${itemPath}.code`, { maxLength: 100 });
      if (!["info", "warning", "error"].includes(String(exception.severity))) {
        validator.issue(`${itemPath}.severity`, "must be info, warning, or error.");
      }
      validator.string(exception.summary, `${itemPath}.summary`, { maxLength: 1_000 });
      validator.identifier(exception.relatedLineId, `${itemPath}.relatedLineId`, true);
    },
  );
  const transitions = validator.array(
    object.recentMaterialStateTransitions,
    `${path}.recentMaterialStateTransitions`,
    SUPPLIER_BILL_UCL_LIMITS.recentMaterialStateTransitions,
    (item, itemPath) => {
      const transition = validator.object(item, itemPath, ["eventId", "state", "occurredAt", "source"]);
      if (!transition) return;
      validator.identifier(transition.eventId, `${itemPath}.eventId`);
      validator.string(transition.state, `${itemPath}.state`, { maxLength: 100 });
      validator.timestamp(transition.occurredAt, `${itemPath}.occurredAt`);
      validator.string(transition.source, `${itemPath}.source`, { maxLength: 100 });
    },
  );

  validator.boolean(object.truncated, `${path}.truncated`);
  const omitted = validateCounts(validator, object.omittedCounts, `${path}.omittedCounts`);
  const totals = validateCounts(validator, object.totalCounts, `${path}.totalCounts`);
  if (!omitted || !totals) return;

  const sourceEvidence = isRecord(payload.sourceEvidence) ? payload.sourceEvidence : {};
  const attachmentSummary = isRecord(sourceEvidence.attachmentSummary) ? sourceEvidence.attachmentSummary : {};
  const allocationSummary = isRecord(sourceEvidence.allocationSummary) ? sourceEvidence.allocationSummary : {};
  const lineage = isRecord(payload.lineage) ? payload.lineage : {};
  const serializedCounts: SupplierBillUclCollectionCounts = {
    billLines: Array.isArray(sourceEvidence.billLines) ? sourceEvidence.billLines.length : 0,
    poMatches: Array.isArray(sourceEvidence.poMatches) ? sourceEvidence.poMatches.length : 0,
    attachmentReferences: Array.isArray(attachmentSummary.references) ? attachmentSummary.references.length : 0,
    structuredExceptions: exceptions.length,
    recentMaterialStateTransitions: transitions.length,
    allocationSummaries: Array.isArray(allocationSummary.allocations) ? allocationSummary.allocations.length : 0,
    linkedProjects: linkedContext?.projects.length ?? totals.linkedProjects,
    linkedPurchaseOrders: linkedContext?.purchaseOrders.length ?? totals.linkedPurchaseOrders,
    purchaseOrderLineReferences: Array.isArray(lineage.purchaseOrderLineItemIds)
      ? lineage.purchaseOrderLineItemIds.length
      : 0,
    commercialSnapshotReferences: Array.isArray(lineage.commercialSnapshotIds)
      ? lineage.commercialSnapshotIds.length
      : 0,
    actualCostEventReferences: Array.isArray(lineage.actualCostEventIds)
      ? lineage.actualCostEventIds.length
      : 0,
  };

  let anyOmitted = false;
  for (const key of SUPPLIER_BILL_UCL_COUNTED_COLLECTIONS) {
    if (totals[key] < serializedCounts[key]) {
      validator.issue(`${path}.totalCounts.${key}`, "must be at least the serialized collection length.");
      continue;
    }
    const expectedOmitted = totals[key] - serializedCounts[key];
    if (omitted[key] !== expectedOmitted) {
      validator.issue(
        `${path}.omittedCounts.${key}`,
        `must equal total count (${totals[key]}) minus serialized count (${serializedCounts[key]}).`,
      );
    }
    anyOmitted ||= omitted[key] > 0;
  }
  if (object.truncated !== anyOmitted) {
    validator.issue(`${path}.truncated`, `must be ${anyOmitted} when derived from omitted counts.`);
  }

  if (
    object.unresolvedExceptionCount !== totals.structuredExceptions
  ) {
    validator.issue(
      `${path}.unresolvedExceptionCount`,
      "must equal totalCounts.structuredExceptions.",
    );
  }
  if (
    isRecord(attachmentSummary) &&
    attachmentSummary.totalAttachmentCount !== totals.attachmentReferences
  ) {
    validator.issue(
      "payload.sourceEvidence.attachmentSummary.totalAttachmentCount",
      "must equal operationalContext.totalCounts.attachmentReferences.",
    );
  }
  if (
    isRecord(allocationSummary) &&
    allocationSummary.totalAllocationCount !== totals.allocationSummaries
  ) {
    validator.issue(
      "payload.sourceEvidence.allocationSummary.totalAllocationCount",
      "must equal operationalContext.totalCounts.allocationSummaries.",
    );
  }
}

function validateSourceEvidence(validator: Validator, value: unknown) {
  const path = "payload.sourceEvidence";
  const object = validator.object(value, path, [
    "bill",
    "supplier",
    "financialTotals",
    "taxSummary",
    "billLines",
    "poMatches",
    "commercialApproval",
    "allocationSummary",
    "actualCostPostingSummary",
    "xeroSummary",
    "paymentSummary",
    "attachmentSummary",
  ]);
  if (!object) return;

  const bill = validator.object(object.bill, `${path}.bill`, [
    "billNumber",
    "billDate",
    "dueDate",
    "currency",
    "canonicalStatus",
    "source",
    "supplierPoReference",
    "notesSummary",
  ]);
  if (bill) {
    validator.string(bill.billNumber, `${path}.bill.billNumber`, { nullable: true, maxLength: 200 });
    validator.date(bill.billDate, `${path}.bill.billDate`, true);
    validator.date(bill.dueDate, `${path}.bill.dueDate`, true);
    if (typeof bill.currency !== "string" || !/^[A-Z]{3}$/.test(bill.currency)) {
      validator.issue(`${path}.bill.currency`, "must be a three-letter uppercase currency code.");
    }
    validator.string(bill.canonicalStatus, `${path}.bill.canonicalStatus`, { maxLength: 100 });
    validator.string(bill.source, `${path}.bill.source`, { maxLength: 100 });
    validator.string(bill.supplierPoReference, `${path}.bill.supplierPoReference`, {
      nullable: true,
      maxLength: 200,
    });
    validator.string(bill.notesSummary, `${path}.bill.notesSummary`, { nullable: true, maxLength: 2_000 });
  }

  const supplier = validator.object(object.supplier, `${path}.supplier`, ["supplierId", "displayName"]);
  if (supplier) {
    validator.identifier(supplier.supplierId, `${path}.supplier.supplierId`, true);
    validator.string(supplier.displayName, `${path}.supplier.displayName`, { nullable: true, maxLength: 500 });
  }

  const financials = validator.object(object.financialTotals, `${path}.financialTotals`, [
    "subtotal",
    "taxTotal",
    "total",
    "calculatedLineSubtotal",
    "calculatedLineTax",
    "calculatedLineTotal",
    "headerVariance",
  ]);
  if (financials) {
    for (const key of Object.keys(financials).sort()) {
      validator.number(financials[key], `${path}.financialTotals.${key}`);
    }
  }

  const tax = validator.object(object.taxSummary, `${path}.taxSummary`, [
    "amountMode",
    "evidencePresent",
    "treatmentCounts",
  ]);
  if (tax) {
    validator.string(tax.amountMode, `${path}.taxSummary.amountMode`, { nullable: true, maxLength: 100 });
    validator.boolean(tax.evidencePresent, `${path}.taxSummary.evidencePresent`);
    const treatmentCounts = validator.object(tax.treatmentCounts, `${path}.taxSummary.treatmentCounts`, [
      "taxable",
      "zeroRated",
      "exempt",
      "unresolved",
    ]);
    if (treatmentCounts) {
      for (const key of Object.keys(treatmentCounts).sort()) {
        validator.number(treatmentCounts[key], `${path}.taxSummary.treatmentCounts.${key}`, {
          integer: true,
          minimum: 0,
        });
      }
    }
  }

  validator.array(object.billLines, `${path}.billLines`, SUPPLIER_BILL_UCL_LIMITS.billLines, (item, itemPath) =>
    validateLine(validator, item, itemPath),
  );
  validator.array(object.poMatches, `${path}.poMatches`, SUPPLIER_BILL_UCL_LIMITS.poMatches, (item, itemPath) =>
    validatePoMatch(validator, item, itemPath),
  );

  const commercial = validator.object(object.commercialApproval, `${path}.commercialApproval`, [
    "approvalState",
    "commercialApprovalId",
    "siteReviewState",
    "accountsApprovalState",
    "approvedAt",
    "approvedByRole",
    "varianceCount",
    "varianceCodes",
    "invalidationReasonCode",
  ]);
  if (commercial) {
    validator.string(commercial.approvalState, `${path}.commercialApproval.approvalState`, {
      nullable: true,
      maxLength: 100,
    });
    validator.identifier(commercial.commercialApprovalId, `${path}.commercialApproval.commercialApprovalId`, true);
    validator.string(commercial.siteReviewState, `${path}.commercialApproval.siteReviewState`, {
      nullable: true,
      maxLength: 100,
    });
    validator.string(commercial.accountsApprovalState, `${path}.commercialApproval.accountsApprovalState`, {
      nullable: true,
      maxLength: 100,
    });
    validator.timestamp(commercial.approvedAt, `${path}.commercialApproval.approvedAt`, true);
    validator.string(commercial.approvedByRole, `${path}.commercialApproval.approvedByRole`, {
      nullable: true,
      maxLength: 100,
    });
    validator.number(commercial.varianceCount, `${path}.commercialApproval.varianceCount`, {
      integer: true,
      minimum: 0,
    });
    validator.stringArray(
      commercial.varianceCodes,
      `${path}.commercialApproval.varianceCodes`,
      SUPPLIER_BILL_UCL_LIMITS.structuredExceptions,
    );
    validator.string(commercial.invalidationReasonCode, `${path}.commercialApproval.invalidationReasonCode`, {
      nullable: true,
      maxLength: 200,
    });
  }

  const allocation = validator.object(object.allocationSummary, `${path}.allocationSummary`, [
    "totalAllocationCount",
    "allocatedLineCount",
    "allocatedAmount",
    "unallocatedAmount",
    "codedLineCount",
    "uncodedLineCount",
    "allocations",
  ]);
  if (allocation) {
    validator.number(allocation.totalAllocationCount, `${path}.allocationSummary.totalAllocationCount`, {
      integer: true,
      minimum: 0,
    });
    validator.number(allocation.allocatedLineCount, `${path}.allocationSummary.allocatedLineCount`, {
      integer: true,
      minimum: 0,
    });
    validator.number(allocation.allocatedAmount, `${path}.allocationSummary.allocatedAmount`);
    validator.number(allocation.unallocatedAmount, `${path}.allocationSummary.unallocatedAmount`);
    validator.number(allocation.codedLineCount, `${path}.allocationSummary.codedLineCount`, {
      integer: true,
      minimum: 0,
    });
    validator.number(allocation.uncodedLineCount, `${path}.allocationSummary.uncodedLineCount`, {
      integer: true,
      minimum: 0,
    });
    validator.array(
      allocation.allocations,
      `${path}.allocationSummary.allocations`,
      SUPPLIER_BILL_UCL_LIMITS.allocationSummaries,
      (item, itemPath) => validateAllocation(validator, item, itemPath),
    );
  }

  const posting = validator.object(object.actualCostPostingSummary, `${path}.actualCostPostingSummary`, [
    "postingEventCount",
    "postedAmount",
    "postedTax",
    "postedTotal",
    "reversalAmount",
    "netPostedAmount",
  ]);
  if (posting) {
    validator.number(posting.postingEventCount, `${path}.actualCostPostingSummary.postingEventCount`, {
      integer: true,
      minimum: 0,
    });
    for (const key of ["postedAmount", "postedTax", "postedTotal", "reversalAmount", "netPostedAmount"] as const) {
      validator.number(posting[key], `${path}.actualCostPostingSummary.${key}`);
    }
  }

  const xero = validator.object(object.xeroSummary, `${path}.xeroSummary`, [
    "accountingDocumentId",
    "externalBillReference",
    "exportStatus",
    "attachmentStatus",
    "lastExportedAt",
    "lastSyncedAt",
    "lastErrorCode",
    "retryable",
  ]);
  if (xero) {
    for (const key of [
      "accountingDocumentId",
      "externalBillReference",
      "exportStatus",
      "attachmentStatus",
      "lastErrorCode",
    ] as const) {
      validator.string(xero[key], `${path}.xeroSummary.${key}`, { nullable: true, maxLength: 500 });
    }
    validator.timestamp(xero.lastExportedAt, `${path}.xeroSummary.lastExportedAt`, true);
    validator.timestamp(xero.lastSyncedAt, `${path}.xeroSummary.lastSyncedAt`, true);
    if (xero.retryable !== null) {
      validator.boolean(xero.retryable, `${path}.xeroSummary.retryable`);
    }
  }

  const payment = validator.object(object.paymentSummary, `${path}.paymentSummary`, [
    "paymentStatus",
    "amountPaid",
    "amountDue",
    "fullyPaidAt",
    "lastRefreshedAt",
  ]);
  if (payment) {
    validator.string(payment.paymentStatus, `${path}.paymentSummary.paymentStatus`, {
      nullable: true,
      maxLength: 100,
    });
    validator.number(payment.amountPaid, `${path}.paymentSummary.amountPaid`, { nullable: true });
    validator.number(payment.amountDue, `${path}.paymentSummary.amountDue`, { nullable: true });
    validator.timestamp(payment.fullyPaidAt, `${path}.paymentSummary.fullyPaidAt`, true);
    validator.timestamp(payment.lastRefreshedAt, `${path}.paymentSummary.lastRefreshedAt`, true);
  }

  const attachments = validator.object(object.attachmentSummary, `${path}.attachmentSummary`, [
    "totalAttachmentCount",
    "references",
    "extractionState",
    "extractionSchemaVersion",
    "warningCount",
    "errorCount",
  ]);
  if (attachments) {
    validator.number(attachments.totalAttachmentCount, `${path}.attachmentSummary.totalAttachmentCount`, {
      integer: true,
      minimum: 0,
    });
    validator.array(
      attachments.references,
      `${path}.attachmentSummary.references`,
      SUPPLIER_BILL_UCL_LIMITS.attachmentReferences,
      (item, itemPath) => validateAttachment(validator, item, itemPath),
    );
    validator.string(attachments.extractionState, `${path}.attachmentSummary.extractionState`, {
      nullable: true,
      maxLength: 100,
    });
    validator.string(attachments.extractionSchemaVersion, `${path}.attachmentSummary.extractionSchemaVersion`, {
      nullable: true,
      maxLength: 100,
    });
    validator.number(attachments.warningCount, `${path}.attachmentSummary.warningCount`, {
      integer: true,
      minimum: 0,
    });
    validator.number(attachments.errorCount, `${path}.attachmentSummary.errorCount`, {
      integer: true,
      minimum: 0,
    });
  }
}

function validateLineage(validator: Validator, value: unknown) {
  const path = "payload.lineage";
  const object = validator.object(value, path, [
    "supplierBillId",
    "supplierId",
    "projectIds",
    "purchaseOrderIds",
    "purchaseOrderLineItemIds",
    "billLineIds",
    "allocationIds",
    "commercialSnapshotIds",
    "actualCostEventIds",
    "accountingDocumentId",
    "currentDocumentIds",
  ]);
  if (!object) return;

  validator.identifier(object.supplierBillId, `${path}.supplierBillId`);
  validator.identifier(object.supplierId, `${path}.supplierId`, true);
  validator.stringArray(object.projectIds, `${path}.projectIds`, SUPPLIER_BILL_UCL_LIMITS.linkedProjects);
  validator.stringArray(object.purchaseOrderIds, `${path}.purchaseOrderIds`, SUPPLIER_BILL_UCL_LIMITS.linkedPurchaseOrders);
  validator.stringArray(
    object.purchaseOrderLineItemIds,
    `${path}.purchaseOrderLineItemIds`,
    SUPPLIER_BILL_UCL_LIMITS.purchaseOrderLineReferences,
  );
  validator.stringArray(object.billLineIds, `${path}.billLineIds`, SUPPLIER_BILL_UCL_LIMITS.billLines);
  validator.stringArray(object.allocationIds, `${path}.allocationIds`, SUPPLIER_BILL_UCL_LIMITS.allocationSummaries);
  validator.stringArray(
    object.commercialSnapshotIds,
    `${path}.commercialSnapshotIds`,
    SUPPLIER_BILL_UCL_LIMITS.commercialSnapshotReferences,
  );
  validator.stringArray(
    object.actualCostEventIds,
    `${path}.actualCostEventIds`,
    SUPPLIER_BILL_UCL_LIMITS.actualCostEventReferences,
  );
  validator.identifier(object.accountingDocumentId, `${path}.accountingDocumentId`, true);
  validator.stringArray(
    object.currentDocumentIds,
    `${path}.currentDocumentIds`,
    SUPPLIER_BILL_UCL_LIMITS.attachmentReferences,
  );
}

function validateProvenance(validator: Validator, value: unknown) {
  const path = "payload.provenance";
  const object = validator.object(value, path, [
    "assembledAt",
    "canonicalRecordUpdatedAt",
    "latestDependencyUpdatedAt",
    "builderVersion",
    "queriedSourceTables",
    "contentHash",
  ]);
  if (!object) return;

  validator.timestamp(object.assembledAt, `${path}.assembledAt`);
  validator.timestamp(object.canonicalRecordUpdatedAt, `${path}.canonicalRecordUpdatedAt`);
  validator.timestamp(object.latestDependencyUpdatedAt, `${path}.latestDependencyUpdatedAt`);
  validator.literal(object.builderVersion, `${path}.builderVersion`, SUPPLIER_BILL_UCL_BUILDER_VERSION);
  validator.stringArray(object.queriedSourceTables, `${path}.queriedSourceTables`, 50);
  validator.string(object.contentHash, `${path}.contentHash`, { nullable: true, maxLength: 200 });
}

function validateVisibility(validator: Validator, value: unknown) {
  const path = "payload.visibility";
  const object = validator.object(value, path, [
    "organizationId",
    "projectIds",
    "requiresSupplierInvoiceView",
    "requiresAccountingVisibility",
  ]);
  if (!object) return;

  validator.identifier(object.organizationId, `${path}.organizationId`);
  validator.stringArray(object.projectIds, `${path}.projectIds`, SUPPLIER_BILL_UCL_LIMITS.linkedProjects);
  validator.literal(object.requiresSupplierInvoiceView, `${path}.requiresSupplierInvoiceView`, true);
  validator.boolean(object.requiresAccountingVisibility, `${path}.requiresAccountingVisibility`);
}

function validateLinkedContext(
  validator: Validator,
  value: unknown,
): SupplierBillUclLinkedContext | undefined {
  const path = "linkedContext";
  const object = validator.object(value, path, ["projects", "purchaseOrders"]);
  if (!object) return undefined;

  const projects = validator.array(
    object.projects,
    `${path}.projects`,
    SUPPLIER_BILL_UCL_LIMITS.linkedProjects,
    (item, itemPath) => {
      const project = validator.object(item, itemPath, ["projectId", "displayName", "status"]);
      if (!project) return;
      validator.identifier(project.projectId, `${itemPath}.projectId`);
      validator.string(project.displayName, `${itemPath}.displayName`, { nullable: true, maxLength: 500 });
      validator.string(project.status, `${itemPath}.status`, { nullable: true, maxLength: 100 });
    },
  );
  const purchaseOrders = validator.array(
    object.purchaseOrders,
    `${path}.purchaseOrders`,
    SUPPLIER_BILL_UCL_LIMITS.linkedPurchaseOrders,
    (item, itemPath) => {
      const po = validator.object(item, itemPath, [
        "purchaseOrderId",
        "purchaseOrderNumber",
        "projectId",
        "status",
        "committedTotal",
      ]);
      if (!po) return;
      validator.identifier(po.purchaseOrderId, `${itemPath}.purchaseOrderId`);
      validator.string(po.purchaseOrderNumber, `${itemPath}.purchaseOrderNumber`, {
        nullable: true,
        maxLength: 200,
      });
      validator.identifier(po.projectId, `${itemPath}.projectId`, true);
      validator.string(po.status, `${itemPath}.status`, { nullable: true, maxLength: 100 });
      validator.number(po.committedTotal, `${itemPath}.committedTotal`, { nullable: true });
    },
  );

  return { projects, purchaseOrders } as SupplierBillUclLinkedContext;
}

function validateRoutingContext(validator: Validator, value: unknown) {
  const path = "routingContext";
  const object = validator.object(value, path, [
    "readOnly",
    "organizationCostCodeIds",
    "accountingMappingIds",
    "tradesstackCostCodes",
    "xeroAccountCodes",
    "xeroTaxTypes",
  ]);
  if (!object) return;

  validator.literal(object.readOnly, `${path}.readOnly`, true);
  validator.stringArray(
    object.organizationCostCodeIds,
    `${path}.organizationCostCodeIds`,
    SUPPLIER_BILL_UCL_LIMITS.allocationSummaries,
  );
  validator.stringArray(
    object.accountingMappingIds,
    `${path}.accountingMappingIds`,
    SUPPLIER_BILL_UCL_LIMITS.allocationSummaries,
  );
  validator.stringArray(
    object.tradesstackCostCodes,
    `${path}.tradesstackCostCodes`,
    SUPPLIER_BILL_UCL_LIMITS.allocationSummaries,
  );
  validator.stringArray(
    object.xeroAccountCodes,
    `${path}.xeroAccountCodes`,
    SUPPLIER_BILL_UCL_LIMITS.allocationSummaries,
  );
  validator.stringArray(
    object.xeroTaxTypes,
    `${path}.xeroTaxTypes`,
    SUPPLIER_BILL_UCL_LIMITS.allocationSummaries,
  );
}

function validatePayloadWithContext(
  value: unknown,
  linkedContext?: SupplierBillUclLinkedContext,
  scanForbidden = true,
): SupplierBillUclValidationResult<SupplierBillUclPayload> {
  const validator = new Validator();
  if (scanForbidden) {
    scanForbiddenFields(value, "payload", validator.issues);
  }

  const payload = validator.object(value, "payload", [
    "schemaVersion",
    "sourceEvidence",
    "operationalContext",
    "lineage",
    "provenance",
    "visibility",
  ]);
  if (payload) {
    validator.literal(payload.schemaVersion, "payload.schemaVersion", SUPPLIER_BILL_UCL_SCHEMA_VERSION);
    validateSourceEvidence(validator, payload.sourceEvidence);
    validateOperationalContext(validator, payload.operationalContext, payload, linkedContext);
    validateLineage(validator, payload.lineage);
    validateProvenance(validator, payload.provenance);
    validateVisibility(validator, payload.visibility);

    try {
      const size = byteLength(JSON.stringify(value));
      if (size > SUPPLIER_BILL_UCL_LIMITS.serializedPayloadBytes) {
        validator.issue(
          "payload",
          `serialized size ${size} bytes exceeds ${SUPPLIER_BILL_UCL_LIMITS.serializedPayloadBytes} bytes.`,
        );
      }
    } catch {
      validator.issue("payload", "must be JSON serializable.");
    }
  }

  if (validator.issues.length > 0) {
    return {
      success: false,
      error: formatValidationError(validator.issues),
      issues: validator.issues,
    };
  }
  return { success: true, data: value as SupplierBillUclPayload };
}

export function validateSupplierBillUclPayload(
  value: unknown,
): SupplierBillUclValidationResult<SupplierBillUclPayload> {
  return validatePayloadWithContext(value);
}

export function validateSupplierBillUclBusinessRecord(
  value: unknown,
): SupplierBillUclValidationResult<SupplierBillUclBusinessRecord> {
  const validator = new Validator();
  scanForbiddenFields(value, "record", validator.issues);
  const record = validator.object(value, "record", [
    "containerType",
    "source",
    "organizationId",
    "projectId",
    "opportunityId",
    "supplierId",
    "supplier",
    "clientId",
    "actorUserId",
    "updatedAt",
    "status",
    "payload",
    "linkedContext",
    "routingContext",
    "signalStrength",
  ]);

  if (record) {
    validator.literal(record.containerType, "record.containerType", SUPPLIER_BILL_UCL_CONTAINER_TYPE);
    const source = validator.object(record.source, "record.source", ["table", "sourceId", "sourceVersion"]);
    if (source) {
      validator.literal(source.table, "record.source.table", "supplier_invoices");
      validator.identifier(source.sourceId, "record.source.sourceId");
      validator.number(source.sourceVersion, "record.source.sourceVersion", { integer: true, minimum: 1 });
    }
    validator.identifier(record.organizationId, "record.organizationId");
    validator.identifier(record.projectId, "record.projectId", true);
    if (record.opportunityId !== null) validator.issue("record.opportunityId", "must be null.");
    validator.identifier(record.supplierId, "record.supplierId", true);
    const recordSupplier = validator.object(record.supplier, "record.supplier", [
      "supplierId",
      "displayName",
    ]);
    if (recordSupplier) {
      validator.uuid(recordSupplier.supplierId, "record.supplier.supplierId", true);
      validator.string(recordSupplier.displayName, "record.supplier.displayName", {
        nullable: true,
        maxLength: 500,
      });
    }
    if (record.clientId !== null) validator.issue("record.clientId", "must be null.");
    validator.identifier(record.actorUserId, "record.actorUserId", true);
    validator.timestamp(record.updatedAt, "record.updatedAt");

    const status = validator.object(record.status, "record.status", [
      "canonicalStatus",
      "workflowState",
      "approvalState",
    ]);
    if (status) {
      validator.string(status.canonicalStatus, "record.status.canonicalStatus", { maxLength: 100 });
      validator.string(status.workflowState, "record.status.workflowState", { maxLength: 100 });
      validator.string(status.approvalState, "record.status.approvalState", { maxLength: 100 });
    }

    const linkedContext = validateLinkedContext(validator, record.linkedContext);
    validateRoutingContext(validator, record.routingContext);
    const payloadValidation = validatePayloadWithContext(record.payload, linkedContext, false);
    if (!payloadValidation.success) {
      validator.issues.push(...payloadValidation.issues);
    }

    if (!["weak", "normal", "strong"].includes(String(record.signalStrength))) {
      validator.issue("record.signalStrength", "must be weak, normal, or strong.");
    }

    if (isRecord(record.payload)) {
      const visibility = isRecord(record.payload.visibility) ? record.payload.visibility : {};
      const lineage = isRecord(record.payload.lineage) ? record.payload.lineage : {};
      const sourceEvidence = isRecord(record.payload.sourceEvidence)
        ? record.payload.sourceEvidence
        : {};
      const evidenceSupplier = isRecord(sourceEvidence.supplier) ? sourceEvidence.supplier : {};
      const canonicalSupplier = isRecord(record.supplier) ? record.supplier : {};
      if (record.organizationId !== visibility.organizationId) {
        validator.issue("record.organizationId", "must match payload.visibility.organizationId.");
      }
      if (
        record.supplierId !== lineage.supplierId
        || record.supplierId !== evidenceSupplier.supplierId
        || record.supplierId !== canonicalSupplier.supplierId
      ) {
        validator.issue("record.supplierId", "must match payload supplier and lineage identities.");
      }
      if (canonicalSupplier.displayName !== evidenceSupplier.displayName) {
        validator.issue(
          "record.supplier.displayName",
          "must match payload source-evidence supplier displayName.",
        );
      }
      if (source && source.sourceId !== lineage.supplierBillId) {
        validator.issue("record.source.sourceId", "must match payload.lineage.supplierBillId.");
      }
      if (
        record.projectId !== null &&
        (
          !Array.isArray(lineage.projectIds) ||
          !lineage.projectIds.includes(record.projectId) ||
          !Array.isArray(visibility.projectIds) ||
          !visibility.projectIds.includes(record.projectId)
        )
      ) {
        validator.issue(
          "record.projectId",
          "must be present in payload lineage and visibility project identities.",
        );
      }
    }
  }

  if (validator.issues.length > 0) {
    return {
      success: false,
      error: formatValidationError(validator.issues),
      issues: validator.issues,
    };
  }
  return { success: true, data: value as SupplierBillUclBusinessRecord };
}

export function assertValidSupplierBillUclBusinessRecord(
  value: unknown,
): asserts value is SupplierBillUclBusinessRecord {
  const result = validateSupplierBillUclBusinessRecord(value);
  if (!result.success) {
    throw new Error(`Invalid Supplier Bill UCL Container: ${result.error}`);
  }
}

export function createSupplierBillUclTruncationMetadata(input: {
  totalCounts: SupplierBillUclCollectionCounts;
  serializedCounts: SupplierBillUclCollectionCounts;
}): Pick<
  SupplierBillUclPayload["operationalContext"],
  "truncated" | "omittedCounts" | "totalCounts"
> {
  const omittedCounts = {} as SupplierBillUclCollectionCounts;
  let truncated = false;

  for (const key of SUPPLIER_BILL_UCL_COUNTED_COLLECTIONS) {
    const total = input.totalCounts[key];
    const serialized = input.serializedCounts[key];
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error(`Supplier Bill UCL totalCounts.${key} must be a non-negative safe integer.`);
    }
    if (!Number.isSafeInteger(serialized) || serialized < 0) {
      throw new Error(`Supplier Bill UCL serializedCounts.${key} must be a non-negative safe integer.`);
    }
    if (serialized > total) {
      throw new Error(`Supplier Bill UCL serializedCounts.${key} cannot exceed totalCounts.${key}.`);
    }
    if (serialized > COUNT_LIMITS[key]) {
      throw new Error(`Supplier Bill UCL serializedCounts.${key} exceeds its contract limit.`);
    }
    omittedCounts[key] = total - serialized;
    truncated ||= omittedCounts[key] > 0;
  }

  return {
    truncated,
    omittedCounts,
    totalCounts: { ...input.totalCounts },
  };
}
