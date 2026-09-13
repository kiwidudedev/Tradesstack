import { createHash } from "node:crypto";
import {
  PAYMENT_CLAIM_UCL_BUILDER_VERSION,
  PAYMENT_CLAIM_UCL_LIMITS,
  PAYMENT_CLAIM_UCL_SCHEMA_VERSION,
  type PaymentClaimUclLine,
  type PaymentClaimUclPayload,
} from "@/lib/universal-learning/payment-claim-schema";
import { normalizeSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";
import type {
  UniversalLearningLinkedContext,
  UniversalLearningRecordStrength,
  UniversalLearningRoutingContext,
} from "@/lib/universal-learning/types";

type Row = Record<string, unknown>;

export type PaymentClaimV2BuilderInput = {
  organizationId: string;
  row: Row;
  lines: Row[];
  project: Row | null;
  client: Row | null;
  quotesById: Map<string, Row>;
  variationsById: Map<string, Row>;
  retentionAllocations: Row[];
  accountingDocuments: Row[];
  routingContext: Record<string, unknown>;
  assembledAt: string;
  updatedAt: string;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function amount(value: unknown) {
  return number(value) ?? 0;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function limited<T>(values: T[], limit: number) {
  return values.slice(0, limit);
}

function normalizedStatus(value: unknown) {
  return text(value)?.toLowerCase() ?? "";
}

function sectionId(name: string | null, order: number) {
  return `${order}:${name ?? "unsectioned"}`;
}

function safeFileName(value: unknown) {
  const candidate = text(value);
  if (!candidate || candidate.includes("/") || candidate.includes("\\")) return null;
  return candidate.slice(0, 240);
}

function paymentStatus(document: Row) {
  if (amount(document.amount_due) <= 0 && amount(document.amount_paid) > 0) return "paid";
  if (amount(document.amount_paid) > 0) return "partially_paid";
  return text(document.normalized_external_status) ?? text(document.raw_external_status);
}

function lifecycle(status: string, paidAmount: number) {
  if (paidAmount > 0 && ["paid", "fully_paid"].includes(status)) return "paid";
  if (["cancelled", "voided"].includes(status)) return "cancelled";
  if (["rejected", "revision_required", "revised"].includes(status)) return "rejected_or_revised";
  if (["submitted", "approved", "certified", "unpaid", "overdue"].includes(status)) {
    if (status === "overdue" && paidAmount <= 0) return "submitted_overdue";
    return status === "unpaid" ? "submitted_unpaid" : "submitted";
  }
  return status || "draft";
}

function evidenceStrength(input: {
  projectId: string | null;
  clientId: string | null;
  lineCount: number;
  status: string;
}): UniversalLearningRecordStrength {
  if (!input.projectId || !input.clientId || input.lineCount === 0) return "weak";
  if (["submitted", "approved", "certified", "paid", "unpaid", "overdue"].includes(input.status)) {
    return "strong";
  }
  return "normal";
}

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildPaymentClaimUclV2Sections(input: PaymentClaimV2BuilderInput): {
  payload: PaymentClaimUclPayload;
  linkedContext: UniversalLearningLinkedContext;
  routingContext: UniversalLearningRoutingContext;
  signalStrength: UniversalLearningRecordStrength;
  workflowState: string;
  approvalState: string | null;
} {
  const claimId = text(input.row.id);
  if (!claimId) throw new Error("project_claims.id must be a non-empty string.");
  const ownerUpdatedAt = normalizeSupplierBillUclTimestamp(
    input.row.updated_at ?? input.row.created_at,
    `project_claims.updated_at for ${claimId}`,
  );
  const effectiveUpdatedAt = normalizeSupplierBillUclTimestamp(
    input.updatedAt,
    `Payment Claim UCL effective updatedAt for ${claimId}`,
  );
  const assembledAt = normalizeSupplierBillUclTimestamp(
    input.assembledAt,
    `Payment Claim UCL assembledAt for ${claimId}`,
  );
  if (!ownerUpdatedAt || !effectiveUpdatedAt || !assembledAt) {
    throw new Error(`Payment Claim UCL ${claimId} is missing a canonical timestamp.`);
  }

  const orderedLines = [...input.lines].sort((left, right) =>
    amount(left.sort_order) - amount(right.sort_order)
    || (text(left.section) ?? "").localeCompare(text(right.section) ?? "")
    || (text(left.id) ?? "").localeCompare(text(right.id) ?? ""));
  const canonicalLines: PaymentClaimUclLine[] = orderedLines.map((line, index) => {
    const contractValue = number(line.source_total);
    const claimedToDate = amount(line.cumulative_claimed_amount);
    return {
      lineId: text(line.id) ?? `${claimId}:line:${index}`,
      lineUid: text(line.line_uid),
      sortOrder: number(line.sort_order) ?? index,
      section: text(line.section),
      description: text(line.description)?.slice(0, 500) ?? null,
      unit: text(line.unit),
      quantity: number(line.quantity),
      rate: number(line.rate),
      contractValue,
      previouslyClaimed: amount(line.previously_claimed_amount),
      thisClaim: amount(line.claim_amount),
      claimedToDate,
      remaining: contractValue === null ? null : money(contractValue - claimedToDate),
      claimPercentage: number(line.claim_percent),
      retentionImpact: null,
      variationId: normalizedStatus(line.source_kind) === "variation"
        ? text(line.source_document_id)
        : null,
      sourceScheduleId: text(line.source_document_id),
      sourceScheduleLineId: text(line.source_line_item_id),
      sourceKind: text(line.source_kind),
    };
  });

  const groupedSections = new Map<string, PaymentClaimUclLine[]>();
  for (const line of canonicalLines) {
    const name = line.section ?? null;
    const key = name ?? "";
    groupedSections.set(key, [...(groupedSections.get(key) ?? []), line]);
  }
  const sections = [...groupedSections.entries()].map(([key, lines], index) => ({
    sectionId: sectionId(key || null, index),
    name: key || null,
    sortOrder: index,
    lineCount: lines.length,
    thisClaim: money(lines.reduce((sum, line) => sum + line.thisClaim, 0)),
    claimedToDate: money(lines.reduce((sum, line) => sum + line.claimedToDate, 0)),
  }));

  const variationGroups = new Map<string, PaymentClaimUclLine[]>();
  for (const line of canonicalLines) {
    if (!line.variationId) continue;
    variationGroups.set(line.variationId, [...(variationGroups.get(line.variationId) ?? []), line]);
  }
  const variations = [...variationGroups.entries()]
    .map(([variationId, lines]) => {
      const variation = input.variationsById.get(variationId) ?? null;
      const approvedValue = number(variation?.total_variation_price);
      const claimedToDate = money(lines.reduce((sum, line) => sum + line.claimedToDate, 0));
      const approvalStatus = text(variation?.status);
      const normalizedApproval = normalizedStatus(approvalStatus);
      return {
        variationId,
        variationNumber: text(variation?.variation_number),
        title: text(variation?.variation_title),
        approvalStatus,
        approvedValue,
        claimedThisPeriod: money(lines.reduce((sum, line) => sum + line.thisClaim, 0)),
        claimedToDate,
        remainingValue: approvedValue === null ? null : money(approvedValue - claimedToDate),
        includedBeforeApproval: approvalStatus === null
          ? null
          : !["approved", "accepted", "invoiced"].includes(normalizedApproval),
      };
    })
    .sort((left, right) =>
      (left.variationNumber ?? "").localeCompare(right.variationNumber ?? "")
      || left.variationId.localeCompare(right.variationId));

  const retentionLinks = [...input.retentionAllocations]
    .sort((left, right) =>
      amount(left.allocation_sequence) - amount(right.allocation_sequence)
      || (text(left.id) ?? "").localeCompare(text(right.id) ?? ""))
    .map((allocation) => ({
      retentionClaimId: text(allocation.retention_claim_id) ?? "",
      allocationId: text(allocation.id) ?? "",
      allocationAmount: amount(allocation.allocation_amount),
      statusSnapshot: text(allocation.origin_claim_status_snapshot),
    }))
    .filter((allocation) => allocation.retentionClaimId && allocation.allocationId);

  const accountingObservations = [...input.accountingDocuments]
    .sort((left, right) =>
      (text(left.updated_at) ?? "").localeCompare(text(right.updated_at) ?? "")
      || (text(left.id) ?? "").localeCompare(text(right.id) ?? ""))
    .map((document) => ({
      accountingDocumentId: text(document.id) ?? "",
      provider: text(document.provider),
      exportStatus: text(document.export_status),
      externalDocumentReference: text(document.external_document_number),
      invoiceState: text(document.normalized_external_status),
      syncStatus: text(document.last_status_sync_error) ? "attention" : text(document.export_status),
      paymentStatus: paymentStatus(document),
      paidAmount: number(document.amount_paid),
      outstandingAmount: number(document.amount_due),
      lastObservedAt: normalizeSupplierBillUclTimestamp(
        document.last_status_synced_at ?? document.last_synced_at ?? document.updated_at,
        `organization_accounting_documents.updated_at for ${text(document.id) ?? claimId}`,
      ),
      attentionCode:
        text(document.last_error_code)
        ?? (text(document.last_status_sync_error) ? "status_sync_error" : null),
    }))
    .filter((document) => document.accountingDocumentId);

  const supportDocuments = input.accountingDocuments
    .filter((document) => text(document.attachment_filename) || text(document.attachment_status))
    .map((document) => ({
      documentId: text(document.id) ?? "",
      documentType: text(document.local_document_type),
      fileName: safeFileName(document.attachment_filename),
      attachmentStatus: text(document.attachment_status),
      exportedAt: normalizeSupplierBillUclTimestamp(
        document.attachment_uploaded_at ?? document.exported_at,
        `organization_accounting_documents attachment timestamp for ${text(document.id) ?? claimId}`,
      ),
    }))
    .filter((document) => document.documentId);

  const sourceQuoteIds = unique(canonicalLines
    .filter((line) => normalizedStatus(line.sourceKind) === "quote")
    .map((line) => line.sourceScheduleId));
  const status = normalizedStatus(input.row.status);
  const workflowState = status || "draft";
  const submitted = ["submitted", "approved", "certified", "unpaid", "overdue", "paid"].includes(status);
  const paidAmount = number(input.row.paid_amount);
  const thisClaim = number(input.row.claim_amount);
  const previouslyClaimed = number(input.row.previous_claims_total);
  const revisedContract = number(input.row.revised_contract_value);
  const totalClaimed = number(input.row.total_payable);
  const calculatedThisClaim = money(canonicalLines.reduce((sum, line) => sum + line.thisClaim, 0));
  const calculatedClaimedToDate = money(
    canonicalLines.reduce((sum, line) => sum + line.claimedToDate, 0),
  );
  const calculatedOutstanding = totalClaimed === null || paidAmount === null
    ? null
    : money(totalClaimed - paidAmount);
  const storedRemaining = revisedContract === null || previouslyClaimed === null || thisClaim === null
    ? null
    : money(revisedContract - previouslyClaimed - thisClaim);
  const calculatedRemaining = revisedContract === null
    ? null
    : money(revisedContract - calculatedClaimedToDate);
  const projectId = text(input.row.project_id);
  const clientId = text(input.project?.client_id);

  const totalCounts = {
    sections: sections.length,
    claimLines: canonicalLines.length,
    variations: variations.length,
    retentionReferences: retentionLinks.length,
    supportingDocuments: supportDocuments.length,
    workflowEvents: 0,
    paymentObservations: accountingObservations.length,
  };
  const cappedSections = limited(sections, PAYMENT_CLAIM_UCL_LIMITS.sections);
  const cappedLines = limited(canonicalLines, PAYMENT_CLAIM_UCL_LIMITS.claimLines);
  const cappedVariations = limited(variations, PAYMENT_CLAIM_UCL_LIMITS.variations);
  const cappedRetention = limited(retentionLinks, PAYMENT_CLAIM_UCL_LIMITS.retentionReferences);
  const cappedDocuments = limited(supportDocuments, PAYMENT_CLAIM_UCL_LIMITS.supportingDocuments);
  const cappedObservations = limited(accountingObservations, PAYMENT_CLAIM_UCL_LIMITS.paymentObservations);
  const omittedCounts = {
    sections: totalCounts.sections - cappedSections.length,
    claimLines: totalCounts.claimLines - cappedLines.length,
    variations: totalCounts.variations - cappedVariations.length,
    retentionReferences: totalCounts.retentionReferences - cappedRetention.length,
    supportingDocuments: totalCounts.supportingDocuments - cappedDocuments.length,
    workflowEvents: 0,
    paymentObservations: totalCounts.paymentObservations - cappedObservations.length,
  };
  const claimLifecycle = lifecycle(status, paidAmount ?? 0);
  const strength = evidenceStrength({
    projectId,
    clientId,
    lineCount: canonicalLines.length,
    status,
  });
  const queriedSourceTables = [
    "project_claims",
    "project_claim_line_items",
    "organization_projects",
    "organization_clients",
    "project_quotes",
    "project_variations",
    "retention_claim_allocations",
    "organization_accounting_documents",
  ];

  const sourceEvidence: PaymentClaimUclPayload["sourceEvidence"] = {
    claim: {
      paymentClaimId: claimId,
      claimNumber: text(input.row.claim_number),
      title: text(input.row.claim_title),
      claimType: text(input.row.claim_type),
      claimPeriodStart: text(input.row.period_start),
      claimPeriodEnd: text(input.row.period_end),
      claimDate: text(input.row.claim_date),
      dueDate: text(input.row.due_date),
      currency: text(input.accountingDocuments[0]?.currency_code),
      sourceVersion: 1,
      canonicalStatus: text(input.row.status),
      workflowState,
      submissionState: submitted ? "submitted" : "draft",
      approvalState: ["approved", "certified", "paid"].includes(status) ? status : null,
      certificationState: ["certified", "paid"].includes(status) ? status : null,
    },
    project: {
      projectId,
      name: text(input.project?.name),
      code: text(input.project?.project_code),
      status: text(input.project?.stage),
      currency: text(input.accountingDocuments[0]?.currency_code),
    },
    client: {
      clientId,
      displayName: text(input.client?.company_name) ?? text(input.client?.name),
    },
    contract: {
      contractReference: sourceQuoteIds.length === 1
        ? text(input.quotesById.get(sourceQuoteIds[0])?.quote_number)
        : null,
      sourceQuoteIds,
      originalContractAmount: number(input.row.linked_quote_value),
      approvedVariationAmount: number(input.row.linked_approved_variations),
      revisedContractAmount: revisedContract,
    },
    financialSummary: {
      stored: {
        originalContractAmount: number(input.row.linked_quote_value),
        approvedVariations: number(input.row.linked_approved_variations),
        revisedContractAmount: revisedContract,
        workCompletedToDate: calculatedClaimedToDate,
        materialsOnSite: null,
        grossClaimedToDate: previouslyClaimed === null || thisClaim === null
          ? null
          : previouslyClaimed + thisClaim,
        previouslyClaimed,
        thisClaim,
        retentionHeldThisClaim: number(input.row.retention_withheld_amount),
        retentionReleasedThisClaim: number(input.row.retention_released_amount),
        otherDeductions: null,
        tax: number(input.row.gst_amount),
        totalClaimed,
        certifiedAmount: null,
        paidAmount,
        outstandingAmount: calculatedOutstanding,
        remainingContractValue: storedRemaining,
      },
      calculated: {
        lineThisClaim: calculatedThisClaim,
        lineClaimedToDate: calculatedClaimedToDate,
        outstandingAmount: calculatedOutstanding,
        remainingContractValue: calculatedRemaining,
      },
      variance: {
        headerToLineThisClaim: thisClaim === null ? null : money(thisClaim - calculatedThisClaim),
        storedToCalculatedOutstanding: null,
        storedToCalculatedRemaining:
          storedRemaining === null || calculatedRemaining === null
            ? null
            : money(storedRemaining - calculatedRemaining),
      },
    },
    sections: cappedSections,
    claimLines: cappedLines,
    variations: cappedVariations,
    retention: {
      basis: text(input.row.retention_method),
      rate: number(input.row.retention_percent),
      heldThisClaim: number(input.row.retention_withheld_amount),
      heldToDate: number(input.row.retention_held_to_date),
      releasedThisClaim: number(input.row.retention_released_amount),
      releasedToDate: number(input.row.retention_released_to_date),
      remainingRetention: number(input.row.retention_balance),
      linkedRetentionClaims: cappedRetention,
    },
    workflow: {
      draft: status === "draft" || !submitted,
      submitted,
      submittedAt: null,
      submittedBy: null,
      reviewStatus: text(input.row.status),
      approvalStatus: ["approved", "certified", "paid"].includes(status) ? status : null,
      certificationStatus: ["certified", "paid"].includes(status) ? status : null,
      certifiedAt: null,
      certifiedBy: null,
      rejectedOrRevised: ["rejected", "revision_required", "revised"].includes(status),
      latestMaterialTransitions: [],
    },
    supportingEvidence: {
      totalDocumentCount: supportDocuments.length,
      documents: cappedDocuments,
    },
    accountingAndPayment: {
      observations: cappedObservations,
    },
  };

  const payloadWithoutHash = {
    schemaVersion: PAYMENT_CLAIM_UCL_SCHEMA_VERSION,
    sourceEvidence,
    operationalContext: {
      lifecycleStage: claimLifecycle,
      evidenceStrength: strength,
      truncated: Object.values(omittedCounts).some((count) => count > 0),
      totalCounts,
      omittedCounts,
    },
    lineage: {
      organizationId: input.organizationId,
      projectId,
      clientId,
      paymentClaimId: claimId,
      claimLineIds: limited(unique(canonicalLines.map((line) => line.lineId)), PAYMENT_CLAIM_UCL_LIMITS.linkedIds),
      sourceQuoteIds: limited(sourceQuoteIds, PAYMENT_CLAIM_UCL_LIMITS.linkedIds),
      sourceQuoteLineIds: limited(unique(canonicalLines
        .filter((line) => normalizedStatus(line.sourceKind) === "quote")
        .map((line) => line.sourceScheduleLineId)), PAYMENT_CLAIM_UCL_LIMITS.linkedIds),
      variationIds: limited(unique(canonicalLines.map((line) => line.variationId)), PAYMENT_CLAIM_UCL_LIMITS.linkedIds),
      variationLineIds: limited(unique(canonicalLines
        .filter((line) => line.variationId)
        .map((line) => line.sourceScheduleLineId)), PAYMENT_CLAIM_UCL_LIMITS.linkedIds),
      retentionClaimIds: limited(unique(retentionLinks.map((link) => link.retentionClaimId)), PAYMENT_CLAIM_UCL_LIMITS.linkedIds),
      supportingDocumentIds: limited(unique(supportDocuments.map((document) => document.documentId)), PAYMENT_CLAIM_UCL_LIMITS.linkedIds),
      accountingDocumentIds: limited(unique(accountingObservations.map((observation) => observation.accountingDocumentId)), PAYMENT_CLAIM_UCL_LIMITS.linkedIds),
    },
    provenance: {
      assembledAt,
      canonicalOwnerUpdatedAt: ownerUpdatedAt,
      latestDependencyUpdatedAt: effectiveUpdatedAt,
      builderVersion: PAYMENT_CLAIM_UCL_BUILDER_VERSION,
      queriedSourceTables,
      contentHash: "",
    },
    visibility: {
      organizationId: input.organizationId,
      projectId,
      requiresProjectClaimView: true as const,
      requiresAccountingVisibility: accountingObservations.length > 0,
    },
  };
  const contentHash = hashPayload({
    ...payloadWithoutHash,
    provenance: {
      ...payloadWithoutHash.provenance,
      assembledAt: null,
      contentHash: null,
    },
  });
  const payload = {
    ...payloadWithoutHash,
    provenance: { ...payloadWithoutHash.provenance, contentHash },
  } as PaymentClaimUclPayload;
  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (payloadBytes > PAYMENT_CLAIM_UCL_LIMITS.serializedPayloadBytes) {
    throw new Error(
      `Payment Claim UCL ${claimId} payload is ${payloadBytes} bytes; limit is ${PAYMENT_CLAIM_UCL_LIMITS.serializedPayloadBytes}.`,
    );
  }

  const normalizedRouting = input.routingContext as Record<string, unknown>;
  const values = (key: string) => {
    const value = normalizedRouting[key];
    if (Array.isArray(value)) return unique(value.map(text));
    return text(value) ? [text(value)!] : [];
  };

  return {
    payload,
    linkedContext: {
      project: {
        projectId,
        displayName: text(input.project?.name),
        code: text(input.project?.project_code),
      },
      client: {
        clientId,
        displayName: text(input.client?.company_name) ?? text(input.client?.name),
      },
    },
    routingContext: {
      ...normalizedRouting,
      readOnly: true,
      tradesstackCostCodes: unique([
        ...values("tradesstack_cost_code"),
        ...values("tradesstack_cost_codeValues"),
      ]),
      accountingMappingIds: unique([
        ...values("accounting_mapping_id"),
        ...values("accounting_mapping_idValues"),
      ]),
      organizationCostCodeIds: unique([
        ...values("organization_cost_code_id"),
        ...values("organization_cost_code_idValues"),
      ]),
    },
    signalStrength: strength,
    workflowState,
    approvalState: sourceEvidence.claim.approvalState,
  };
}
