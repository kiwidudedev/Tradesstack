import {
  assertValidSupplierBillUclBusinessRecord,
  SUPPLIER_BILL_UCL_SCHEMA_VERSION,
  type SupplierBillUclAllocation,
  type SupplierBillUclBusinessRecord,
  type SupplierBillUclLine,
  type SupplierBillUclPoMatch,
} from "@/lib/universal-learning/supplier-bill-schema";
import { normalizeSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";
import type {
  UniversalLearningBusinessRecord,
  UniversalLearningCursor,
} from "@/lib/universal-learning/types";

export const SUPPLIER_BILL_PROMPT_MAX_BYTES = 16 * 1024;
export const SUPPLIER_BILL_PROMPT_MAX_ESTIMATED_TOKENS = 4_096;
export const SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET = 12;
export const SUPPLIER_BILL_PROMPT_PACKET_MAX_BYTES = 96 * 1024;

const MAX_PROMPT_LINES = 12;
const MAX_PROMPT_MATCHES = 8;
const MAX_PROMPT_ALLOCATIONS = 12;
const MAX_PROMPT_TRANSITIONS = 3;
const MAX_PROMPT_PROJECT_REFERENCES = 20;
const MAX_PROMPT_PURCHASE_ORDER_REFERENCES = 12;
const MAX_PROMPT_PURCHASE_ORDER_LINE_REFERENCES = 40;

export type SupplierBillPromptDiagnostics = {
  sourceId: string;
  schemaVersion: "supplier_bill.v2";
  builderVersion: string;
  compactionState: "compacted";
  canonicalBytes: number;
  promptBytes: number;
  estimatedTokens: number;
  canonicalLineCount: number;
  promptLineCount: number;
  canonicalAllocationCount: number;
  promptAllocationCount: number;
  canonicalMatchCount: number;
  promptMatchCount: number;
  canonicalTruncated: boolean;
};

export type SupplierBillPromptSelection = {
  records: UniversalLearningBusinessRecord[];
  nextCursorCandidate: UniversalLearningCursor;
  sourceNextCursorCandidate: UniversalLearningCursor;
  deferredRecordCount: number;
  deferredReason: "record_count_limit" | "packet_byte_limit" | null;
  packetBytes: number;
  estimatedTokens: number;
  diagnostics: SupplierBillPromptDiagnostics[];
};

function compareSupplierBillCursors(
  left: UniversalLearningCursor,
  right: UniversalLearningCursor,
) {
  const leftUpdatedAt = normalizeSupplierBillUclTimestamp(
    left.updatedAt,
    "Supplier Bill left cursor",
  ) ?? "";
  const rightUpdatedAt = normalizeSupplierBillUclTimestamp(
    right.updatedAt,
    "Supplier Bill right cursor",
  ) ?? "";
  const timestampComparison = leftUpdatedAt.localeCompare(rightUpdatedAt);
  if (timestampComparison !== 0) {
    return timestampComparison;
  }
  return (left.id ?? "").localeCompare(right.id ?? "");
}

export function getSupplierBillEffectiveCursor(
  record: UniversalLearningBusinessRecord,
): UniversalLearningCursor {
  return {
    updatedAt: record.updatedAt,
    id: record.source.sourceId,
  };
}

export function compareSupplierBillEffectiveCursor(
  left: UniversalLearningBusinessRecord,
  right: UniversalLearningBusinessRecord,
) {
  return compareSupplierBillCursors(
    getSupplierBillEffectiveCursor(left),
    getSupplierBillEffectiveCursor(right),
  );
}

function serializedBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function estimateSupplierBillPromptTokens(bytes: number) {
  return Math.ceil(Math.max(0, bytes) / 4);
}

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function linePriority(line: SupplierBillUclLine) {
  const codes = line.exceptionCodes.map(normalized);
  const unresolved = codes.length > 0;
  const incomplete =
    !line.poMatchSummary
    || !["approved", "resolved", "auto_approved"].includes(normalized(line.allocationSummary.allocationStatus));
  const taxIssue = codes.some((code) => code.includes("tax") || code.includes("gst"));
  return {
    unresolved,
    incomplete,
    taxIssue,
    materiality: Math.abs(line.lineTotal) + Math.abs(line.taxAmount),
  };
}

function compareLines(left: SupplierBillUclLine, right: SupplierBillUclLine) {
  const a = linePriority(left);
  const b = linePriority(right);
  return (
    Number(b.unresolved) - Number(a.unresolved)
    || Number(b.incomplete) - Number(a.incomplete)
    || Number(b.taxIssue) - Number(a.taxIssue)
    || b.materiality - a.materiality
    || left.sortOrder - right.sortOrder
    || left.lineId.localeCompare(right.lineId)
  );
}

function matchPriority(match: SupplierBillUclPoMatch) {
  const status = normalized(match.matchStatus);
  const approval = normalized(match.approvalStatus);
  return {
    unresolved:
      !["accepted", "adjusted", "approved", "resolved"].includes(status)
      || ["rejected", "disputed", "unresolved"].includes(approval),
    variance: match.failedCheckCount > 0 || match.unresolvedCheckCount > 0,
    materiality: Math.abs(match.matchedAmount ?? 0),
  };
}

function compareMatches(left: SupplierBillUclPoMatch, right: SupplierBillUclPoMatch) {
  const a = matchPriority(left);
  const b = matchPriority(right);
  return (
    Number(b.unresolved) - Number(a.unresolved)
    || Number(b.variance) - Number(a.variance)
    || b.materiality - a.materiality
    || left.purchaseOrderId.localeCompare(right.purchaseOrderId)
    || left.matchId.localeCompare(right.matchId)
  );
}

function compareAllocations(
  left: SupplierBillUclAllocation,
  right: SupplierBillUclAllocation,
  lineById: Map<string, SupplierBillUclLine>,
  allocationsPerLine: Map<string, number>,
  projectsPerLine: Map<string, Set<string>>,
) {
  const priority = (allocation: SupplierBillUclAllocation) => {
    const line = lineById.get(allocation.billLineId);
    const codes = line?.exceptionCodes.map(normalized) ?? [];
    const unresolved =
      codes.some((code) => code.includes("uncoded") || code.includes("unresolved") || code.includes("allocation"))
      || !["approved", "resolved", "auto_approved"].includes(normalized(allocation.approvalStatus))
      || !["matched", "allocated", "approved", "resolved"].includes(normalized(allocation.allocationStatus));
    const variance = codes.some((code) => code.includes("variance") || code.includes("mismatch"));
    const split =
      (allocationsPerLine.get(allocation.billLineId) ?? 0) > 1
      || (projectsPerLine.get(allocation.billLineId)?.size ?? 0) > 1;
    return { unresolved, variance, split, materiality: Math.abs(allocation.allocatedAmount) };
  };
  const a = priority(left);
  const b = priority(right);
  return (
    Number(b.unresolved) - Number(a.unresolved)
    || Number(b.variance) - Number(a.variance)
    || Number(b.split) - Number(a.split)
    || b.materiality - a.materiality
    || left.billLineId.localeCompare(right.billLineId)
    || left.allocationId.localeCompare(right.allocationId)
  );
}

function projectLine(line: SupplierBillUclLine) {
  return {
    lineId: line.lineId,
    sortOrder: line.sortOrder,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    taxAmount: line.taxAmount,
    projectId: line.projectId,
    allocationSummary: line.allocationSummary,
    poMatchSummary: line.poMatchSummary,
    exceptionCodes: line.exceptionCodes,
  };
}

function projectMatch(match: SupplierBillUclPoMatch) {
  return { ...match };
}

function projectAllocation(allocation: SupplierBillUclAllocation) {
  return { ...allocation };
}

function buildProjection(record: SupplierBillUclBusinessRecord) {
  const evidence = record.payload.sourceEvidence;
  const operational = record.payload.operationalContext;
  const lineById = new Map(evidence.billLines.map((line) => [line.lineId, line]));
  const allocationsPerLine = new Map<string, number>();
  const projectsPerLine = new Map<string, Set<string>>();
  for (const allocation of evidence.allocationSummary.allocations) {
    allocationsPerLine.set(
      allocation.billLineId,
      (allocationsPerLine.get(allocation.billLineId) ?? 0) + 1,
    );
    if (allocation.projectId) {
      const projects = projectsPerLine.get(allocation.billLineId) ?? new Set<string>();
      projects.add(allocation.projectId);
      projectsPerLine.set(allocation.billLineId, projects);
    }
  }

  const representativeLines = [...evidence.billLines]
    .sort(compareLines)
    .slice(0, MAX_PROMPT_LINES)
    .map(projectLine);
  const representativeMatches = [...evidence.poMatches]
    .sort(compareMatches)
    .slice(0, MAX_PROMPT_MATCHES)
    .map(projectMatch);
  const representativeAllocations = [...evidence.allocationSummary.allocations]
    .sort((left, right) =>
      compareAllocations(left, right, lineById, allocationsPerLine, projectsPerLine))
    .slice(0, MAX_PROMPT_ALLOCATIONS)
    .map(projectAllocation);
  const transitions = [...operational.recentMaterialStateTransitions]
    .sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt)
      || left.eventId.localeCompare(right.eventId))
    .slice(0, MAX_PROMPT_TRANSITIONS)
    .map(({ state, occurredAt, source }) => ({ state, occurredAt, source }));
  const attachmentReferences = evidence.attachmentSummary.references;
  const documentTypes = [...new Set(
    attachmentReferences
      .map((attachment) => attachment.documentType)
      .filter((value): value is string => Boolean(value)),
  )].sort();

  return {
    containerType: record.containerType,
    source: record.source,
    organizationId: record.organizationId,
    projectId: record.projectId,
    supplierId: record.supplierId,
    supplier: { ...record.supplier },
    updatedAt: record.updatedAt,
    status: record.status,
    signalStrength: record.signalStrength,
    schemaVersion: record.payload.schemaVersion,
    sourceEvidence: {
      bill: {
        billNumber: evidence.bill.billNumber,
        billDate: evidence.bill.billDate,
        dueDate: evidence.bill.dueDate,
        currency: evidence.bill.currency,
        canonicalStatus: evidence.bill.canonicalStatus,
        source: evidence.bill.source,
        supplierPoReference: evidence.bill.supplierPoReference,
      },
      supplier: evidence.supplier,
      financialTotals: evidence.financialTotals,
      taxSummary: evidence.taxSummary,
      commercialApproval: evidence.commercialApproval,
      lines: {
        totalCount: operational.totalCounts.billLines,
        canonicalSerializedCount: evidence.billLines.length,
        promptSerializedCount: representativeLines.length,
        omittedFromCanonicalCount: operational.omittedCounts.billLines,
        omittedFromPromptCount: Math.max(0, evidence.billLines.length - representativeLines.length),
        representativeLines,
      },
      poMatches: {
        totalCount: operational.totalCounts.poMatches,
        canonicalSerializedCount: evidence.poMatches.length,
        promptSerializedCount: representativeMatches.length,
        omittedFromCanonicalCount: operational.omittedCounts.poMatches,
        omittedFromPromptCount: Math.max(0, evidence.poMatches.length - representativeMatches.length),
        representativeMatches,
      },
      allocations: {
        totalAllocationCount: evidence.allocationSummary.totalAllocationCount,
        allocatedLineCount: evidence.allocationSummary.allocatedLineCount,
        allocatedAmount: evidence.allocationSummary.allocatedAmount,
        unallocatedAmount: evidence.allocationSummary.unallocatedAmount,
        codedLineCount: evidence.allocationSummary.codedLineCount,
        uncodedLineCount: evidence.allocationSummary.uncodedLineCount,
        canonicalSerializedCount: evidence.allocationSummary.allocations.length,
        promptSerializedCount: representativeAllocations.length,
        omittedFromCanonicalCount: operational.omittedCounts.allocationSummaries,
        omittedFromPromptCount: Math.max(
          0,
          evidence.allocationSummary.allocations.length - representativeAllocations.length,
        ),
        representativeAllocations,
      },
      actualCostPostingSummary: evidence.actualCostPostingSummary,
      xeroSummary: {
        exportStatus: evidence.xeroSummary.exportStatus,
        attachmentStatus: evidence.xeroSummary.attachmentStatus,
        lastExportedAt: evidence.xeroSummary.lastExportedAt,
        lastSyncedAt: evidence.xeroSummary.lastSyncedAt,
        lastErrorCode: evidence.xeroSummary.lastErrorCode,
        retryable: evidence.xeroSummary.retryable,
      },
      paymentSummary: evidence.paymentSummary,
      attachmentSummary: {
        totalAttachmentCount: evidence.attachmentSummary.totalAttachmentCount,
        currentDocumentCount: evidence.attachmentSummary.totalAttachmentCount,
        serializedAttachmentReferenceCount: attachmentReferences.length,
        documentTypes,
        extractionState: evidence.attachmentSummary.extractionState,
        extractionSchemaVersion: evidence.attachmentSummary.extractionSchemaVersion,
        warningCount: evidence.attachmentSummary.warningCount,
        errorCount: evidence.attachmentSummary.errorCount,
      },
    },
    operationalContext: {
      lifecycleStage: operational.lifecycleStage,
      workflowState: operational.workflowState,
      approvalState: operational.approvalState,
      poMatchingCompleteness: operational.poMatchingCompleteness,
      allocationCompleteness: operational.allocationCompleteness,
      accountingReadiness: operational.accountingReadiness,
      xeroReadiness: operational.xeroReadiness,
      paymentState: operational.paymentState,
      unresolvedExceptionCount: operational.unresolvedExceptionCount,
      evidenceStrength: operational.evidenceStrength,
      structuredExceptions: operational.structuredExceptions.map((exception) => ({
        code: exception.code,
        severity: exception.severity,
        relatedLineId: exception.relatedLineId,
      })),
      recentMaterialStateTransitions: transitions,
      canonicalTruncated: operational.truncated,
      omittedCounts: operational.omittedCounts,
      totalCounts: operational.totalCounts,
    },
    linkedContext: {
      projects: record.linkedContext.projects.slice(0, MAX_PROMPT_PROJECT_REFERENCES),
      purchaseOrders: record.linkedContext.purchaseOrders.slice(
        0,
        MAX_PROMPT_PURCHASE_ORDER_REFERENCES,
      ),
    },
    lineage: {
      supplierBillId: record.payload.lineage.supplierBillId,
      supplierId: record.payload.lineage.supplierId,
      projectIds: record.payload.lineage.projectIds.slice(0, MAX_PROMPT_PROJECT_REFERENCES),
      purchaseOrderIds: record.payload.lineage.purchaseOrderIds.slice(
        0,
        MAX_PROMPT_PURCHASE_ORDER_REFERENCES,
      ),
      purchaseOrderLineItemIds: record.payload.lineage.purchaseOrderLineItemIds.slice(
        0,
        MAX_PROMPT_PURCHASE_ORDER_LINE_REFERENCES,
      ),
    },
    provenance: record.payload.provenance,
    visibility: {
      organizationId: record.payload.visibility.organizationId,
      projectIds: record.payload.visibility.projectIds.slice(0, MAX_PROMPT_PROJECT_REFERENCES),
      requiresSupplierInvoiceView: record.payload.visibility.requiresSupplierInvoiceView,
      requiresAccountingVisibility: record.payload.visibility.requiresAccountingVisibility,
    },
    routingContext: {
      readOnly: true,
      organizationCostCodeCount: record.routingContext.organizationCostCodeIds.length,
      accountingMappingCount: record.routingContext.accountingMappingIds.length,
      tradesstackCostCodeCount: record.routingContext.tradesstackCostCodes.length,
      xeroAccountCodeCount: record.routingContext.xeroAccountCodes.length,
      xeroTaxTypeCount: record.routingContext.xeroTaxTypes.length,
    },
  };
}

const FORBIDDEN_PROMPT_KEYS = new Set([
  "documentid",
  "currentdocumentids",
  "filename",
  "storagepath",
  "storagekey",
  "signedurl",
  "rawocr",
  "ocrtext",
  "sourcebytes",
  "accountingdocumentid",
  "externalbillreference",
]);

function assertNoForbiddenPromptKeys(value: unknown, path = "projection") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenPromptKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PROMPT_KEYS.has(key.toLowerCase())) {
      throw new Error(`Supplier Bill prompt projection contains forbidden field ${path}.${key}.`);
    }
    assertNoForbiddenPromptKeys(child, `${path}.${key}`);
  }
}

export function assertValidSupplierBillPromptProjection(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Supplier Bill prompt projection must be an object.");
  }
  const projection = value as Record<string, unknown>;
  if (projection.containerType !== "supplier_invoice") {
    throw new Error("Supplier Bill prompt projection must retain containerType supplier_invoice.");
  }
  if (projection.schemaVersion !== SUPPLIER_BILL_UCL_SCHEMA_VERSION) {
    throw new Error("Supplier Bill prompt projection must retain schemaVersion supplier_bill.v2.");
  }
  const supplier = projection.supplier;
  if (
    !supplier
    || typeof supplier !== "object"
    || Array.isArray(supplier)
    || !Object.prototype.hasOwnProperty.call(supplier, "supplierId")
    || !Object.prototype.hasOwnProperty.call(supplier, "displayName")
  ) {
    throw new Error("Supplier Bill prompt projection must retain canonical supplier identity.");
  }
  const supplierRecord = supplier as Record<string, unknown>;
  if (
    Object.keys(supplierRecord).some(
      (key) => key !== "supplierId" && key !== "displayName",
    )
  ) {
    throw new Error("Supplier Bill prompt supplier identity contains an unsupported field.");
  }
  if (
    supplierRecord.supplierId !== null
    && (
      typeof supplierRecord.supplierId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        supplierRecord.supplierId,
      )
    )
  ) {
    throw new Error("Supplier Bill prompt supplierId must be a UUID or null.");
  }
  if (
    supplierRecord.displayName !== null
    && (
      typeof supplierRecord.displayName !== "string"
      || supplierRecord.displayName.trim().length === 0
      || supplierRecord.displayName.length > 500
    )
  ) {
    throw new Error("Supplier Bill prompt supplier displayName must be a non-empty string or null.");
  }
  assertNoForbiddenPromptKeys(value);
  const bytes = serializedBytes(value);
  if (bytes > SUPPLIER_BILL_PROMPT_MAX_BYTES) {
    const error = new Error(
      `Supplier Bill prompt projection is ${bytes} bytes; maximum is ${SUPPLIER_BILL_PROMPT_MAX_BYTES}.`,
    ) as Error & { code?: string };
    error.code = "supplier_bill_prompt_compaction_failed";
    throw error;
  }
  if (estimateSupplierBillPromptTokens(bytes) > SUPPLIER_BILL_PROMPT_MAX_ESTIMATED_TOKENS) {
    const error = new Error("Supplier Bill prompt projection exceeds its estimated token budget.") as Error & {
      code?: string;
    };
    error.code = "supplier_bill_prompt_compaction_failed";
    throw error;
  }
}

export function compactSupplierBillBusinessRecordForPrompt(
  value: UniversalLearningBusinessRecord,
): { projection: Record<string, unknown>; diagnostics: SupplierBillPromptDiagnostics } {
  assertValidSupplierBillUclBusinessRecord(value);
  const projection = buildProjection(value);

  const shrinkableCollections = [
    projection.sourceEvidence.allocations.representativeAllocations,
    projection.sourceEvidence.poMatches.representativeMatches,
    projection.sourceEvidence.lines.representativeLines,
    projection.operationalContext.recentMaterialStateTransitions,
  ];
  let shrinkIndex = 0;
  while (
    serializedBytes(projection) > SUPPLIER_BILL_PROMPT_MAX_BYTES
    && shrinkableCollections.some((collection) => collection.length > 0)
  ) {
    const collection = shrinkableCollections[shrinkIndex % shrinkableCollections.length];
    if (collection.length > 0) collection.pop();
    shrinkIndex += 1;
  }

  const sourceEvidence = projection.sourceEvidence;
  sourceEvidence.lines.promptSerializedCount = sourceEvidence.lines.representativeLines.length;
  sourceEvidence.lines.omittedFromPromptCount =
    value.payload.sourceEvidence.billLines.length - sourceEvidence.lines.promptSerializedCount;
  sourceEvidence.poMatches.promptSerializedCount = sourceEvidence.poMatches.representativeMatches.length;
  sourceEvidence.poMatches.omittedFromPromptCount =
    value.payload.sourceEvidence.poMatches.length - sourceEvidence.poMatches.promptSerializedCount;
  sourceEvidence.allocations.promptSerializedCount =
    sourceEvidence.allocations.representativeAllocations.length;
  sourceEvidence.allocations.omittedFromPromptCount =
    value.payload.sourceEvidence.allocationSummary.allocations.length
    - sourceEvidence.allocations.promptSerializedCount;

  assertValidSupplierBillPromptProjection(projection);
  const promptBytes = serializedBytes(projection);
  return {
    projection,
    diagnostics: {
      sourceId: value.source.sourceId,
      schemaVersion: value.payload.schemaVersion,
      builderVersion: value.payload.provenance.builderVersion,
      compactionState: "compacted",
      canonicalBytes: serializedBytes(value),
      promptBytes,
      estimatedTokens: estimateSupplierBillPromptTokens(promptBytes),
      canonicalLineCount: value.payload.sourceEvidence.billLines.length,
      promptLineCount: sourceEvidence.lines.promptSerializedCount,
      canonicalAllocationCount: value.payload.sourceEvidence.allocationSummary.allocations.length,
      promptAllocationCount: sourceEvidence.allocations.promptSerializedCount,
      canonicalMatchCount: value.payload.sourceEvidence.poMatches.length,
      promptMatchCount: sourceEvidence.poMatches.promptSerializedCount,
      canonicalTruncated: value.payload.operationalContext.truncated,
    },
  };
}

export function selectSupplierBillRecordsForPrompt(input: {
  records: UniversalLearningBusinessRecord[];
  previousCursor: UniversalLearningCursor;
  sourceNextCursorCandidate: UniversalLearningCursor;
  maxRecords?: number;
}): SupplierBillPromptSelection {
  const orderedRecords = [...input.records].sort(compareSupplierBillEffectiveCursor);
  const sourceSequenceCursor = orderedRecords.at(-1)
    ? getSupplierBillEffectiveCursor(orderedRecords.at(-1)!)
    : input.previousCursor;
  if (compareSupplierBillCursors(sourceSequenceCursor, input.sourceNextCursorCandidate) !== 0) {
    throw new Error(
      "Supplier Bill UCL cursor contract violation: the source cursor does not equal the final effective record cursor.",
    );
  }
  if (
    orderedRecords.length > 0
    && compareSupplierBillCursors(
      getSupplierBillEffectiveCursor(orderedRecords[0]),
      input.previousCursor,
    ) <= 0
  ) {
    throw new Error(
      "Supplier Bill UCL cursor contract violation: a candidate record does not follow the previous cursor.",
    );
  }

  const selected: UniversalLearningBusinessRecord[] = [];
  const projections: Record<string, unknown>[] = [];
  const diagnostics: SupplierBillPromptDiagnostics[] = [];
  let packetBytes = 0;
  let deferredReason: SupplierBillPromptSelection["deferredReason"] = null;
  const maxRecords = Math.max(
    1,
    Math.min(
      SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET,
      Number.isInteger(input.maxRecords)
        ? input.maxRecords!
        : SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET,
    ),
  );

  for (const record of orderedRecords) {
    if (selected.length >= maxRecords) {
      deferredReason = "record_count_limit";
      break;
    }
    const compacted = compactSupplierBillBusinessRecordForPrompt(record);
    const candidatePacketBytes = serializedBytes([...projections, compacted.projection]);
    if (
      selected.length > 0
      && candidatePacketBytes > SUPPLIER_BILL_PROMPT_PACKET_MAX_BYTES
    ) {
      deferredReason = "packet_byte_limit";
      break;
    }
    selected.push(record);
    projections.push(compacted.projection);
    diagnostics.push(compacted.diagnostics);
    packetBytes = candidatePacketBytes;
  }

  const last = selected.at(-1);
  const deferredRecordCount = orderedRecords.length - selected.length;
  if (deferredRecordCount > 0 && !deferredReason) deferredReason = "packet_byte_limit";
  return {
    records: selected,
    nextCursorCandidate: last
      ? { updatedAt: last.updatedAt, id: last.source.sourceId }
      : input.previousCursor,
    sourceNextCursorCandidate: input.sourceNextCursorCandidate,
    deferredRecordCount,
    deferredReason,
    packetBytes,
    estimatedTokens: diagnostics.reduce((sum, entry) => sum + entry.estimatedTokens, 0),
    diagnostics,
  };
}
