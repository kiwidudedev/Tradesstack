import type {
  UniversalLearningBusinessRecord,
  UniversalLearningLinkedContext,
  UniversalLearningPayload,
  UniversalLearningRoutingContext,
} from "@/lib/universal-learning/types";
import { isValidSupplierBillUclTimestamp } from "@/lib/universal-learning/supplier-bill-timestamps";

export const PAYMENT_CLAIM_UCL_PRODUCT_NAME = "Payment Claim UCL Container" as const;
export const PAYMENT_CLAIM_UCL_CONTAINER_TYPE = "project_claim" as const;
export const PAYMENT_CLAIM_UCL_SCHEMA_VERSION = "payment_claim.v2" as const;
export const PAYMENT_CLAIM_UCL_BUILDER_VERSION = "payment_claim.contract.v2" as const;

export const PAYMENT_CLAIM_UCL_LIMITS = Object.freeze({
  sections: 100,
  claimLines: 100,
  variations: 100,
  retentionReferences: 100,
  supportingDocuments: 50,
  workflowEvents: 20,
  paymentObservations: 20,
  linkedIds: 500,
  serializedPayloadBytes: 128 * 1024,
});

export type PaymentClaimUclLine = {
  lineId: string;
  lineUid: string | null;
  sortOrder: number;
  section: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  rate: number | null;
  contractValue: number | null;
  previouslyClaimed: number;
  thisClaim: number;
  claimedToDate: number;
  remaining: number | null;
  claimPercentage: number | null;
  retentionImpact: number | null;
  variationId: string | null;
  sourceScheduleId: string | null;
  sourceScheduleLineId: string | null;
  sourceKind: string | null;
};

export type PaymentClaimUclPayload = UniversalLearningPayload & {
  schemaVersion: typeof PAYMENT_CLAIM_UCL_SCHEMA_VERSION;
  sourceEvidence: {
    claim: {
      paymentClaimId: string;
      claimNumber: string | null;
      title: string | null;
      claimType: string | null;
      claimPeriodStart: string | null;
      claimPeriodEnd: string | null;
      claimDate: string | null;
      dueDate: string | null;
      currency: string | null;
      sourceVersion: number;
      canonicalStatus: string | null;
      workflowState: string;
      submissionState: string;
      approvalState: string | null;
      certificationState: string | null;
    };
    project: {
      projectId: string | null;
      name: string | null;
      code: string | null;
      status: string | null;
      currency: string | null;
    };
    client: {
      clientId: string | null;
      displayName: string | null;
    };
    contract: {
      contractReference: string | null;
      sourceQuoteIds: string[];
      originalContractAmount: number | null;
      approvedVariationAmount: number | null;
      revisedContractAmount: number | null;
    };
    financialSummary: {
      stored: {
        originalContractAmount: number | null;
        approvedVariations: number | null;
        revisedContractAmount: number | null;
        workCompletedToDate: number | null;
        materialsOnSite: number | null;
        grossClaimedToDate: number | null;
        previouslyClaimed: number | null;
        thisClaim: number | null;
        retentionHeldThisClaim: number | null;
        retentionReleasedThisClaim: number | null;
        otherDeductions: number | null;
        tax: number | null;
        totalClaimed: number | null;
        certifiedAmount: number | null;
        paidAmount: number | null;
        outstandingAmount: number | null;
        remainingContractValue: number | null;
      };
      calculated: {
        lineThisClaim: number;
        lineClaimedToDate: number;
        outstandingAmount: number | null;
        remainingContractValue: number | null;
      };
      variance: {
        headerToLineThisClaim: number | null;
        storedToCalculatedOutstanding: number | null;
        storedToCalculatedRemaining: number | null;
      };
    };
    sections: Array<{
      sectionId: string;
      name: string | null;
      sortOrder: number;
      lineCount: number;
      thisClaim: number;
      claimedToDate: number;
    }>;
    claimLines: PaymentClaimUclLine[];
    variations: Array<{
      variationId: string;
      variationNumber: string | null;
      title: string | null;
      approvalStatus: string | null;
      approvedValue: number | null;
      claimedThisPeriod: number;
      claimedToDate: number;
      remainingValue: number | null;
      includedBeforeApproval: boolean | null;
    }>;
    retention: {
      basis: string | null;
      rate: number | null;
      heldThisClaim: number | null;
      heldToDate: number | null;
      releasedThisClaim: number | null;
      releasedToDate: number | null;
      remainingRetention: number | null;
      linkedRetentionClaims: Array<{
        retentionClaimId: string;
        allocationId: string;
        allocationAmount: number;
        statusSnapshot: string | null;
      }>;
    };
    workflow: {
      draft: boolean;
      submitted: boolean;
      submittedAt: string | null;
      submittedBy: string | null;
      reviewStatus: string | null;
      approvalStatus: string | null;
      certificationStatus: string | null;
      certifiedAt: string | null;
      certifiedBy: string | null;
      rejectedOrRevised: boolean;
      latestMaterialTransitions: Array<{
        state: string;
        occurredAt: string;
        actorId: string | null;
      }>;
    };
    supportingEvidence: {
      totalDocumentCount: number;
      documents: Array<{
        documentId: string;
        documentType: string | null;
        fileName: string | null;
        attachmentStatus: string | null;
        exportedAt: string | null;
      }>;
    };
    accountingAndPayment: {
      observations: Array<{
        accountingDocumentId: string;
        provider: string | null;
        exportStatus: string | null;
        externalDocumentReference: string | null;
        invoiceState: string | null;
        syncStatus: string | null;
        paymentStatus: string | null;
        paidAmount: number | null;
        outstandingAmount: number | null;
        lastObservedAt: string | null;
        attentionCode: string | null;
      }>;
    };
  };
  operationalContext: {
    lifecycleStage: string;
    evidenceStrength: "weak" | "normal" | "strong";
    truncated: boolean;
    totalCounts: {
      sections: number;
      claimLines: number;
      variations: number;
      retentionReferences: number;
      supportingDocuments: number;
      workflowEvents: number;
      paymentObservations: number;
    };
    omittedCounts: {
      sections: number;
      claimLines: number;
      variations: number;
      retentionReferences: number;
      supportingDocuments: number;
      workflowEvents: number;
      paymentObservations: number;
    };
  };
  lineage: {
    organizationId: string;
    projectId: string | null;
    clientId: string | null;
    paymentClaimId: string;
    claimLineIds: string[];
    sourceQuoteIds: string[];
    sourceQuoteLineIds: string[];
    variationIds: string[];
    variationLineIds: string[];
    retentionClaimIds: string[];
    supportingDocumentIds: string[];
    accountingDocumentIds: string[];
  };
  provenance: {
    assembledAt: string;
    canonicalOwnerUpdatedAt: string;
    latestDependencyUpdatedAt: string;
    builderVersion: typeof PAYMENT_CLAIM_UCL_BUILDER_VERSION;
    queriedSourceTables: string[];
    contentHash: string;
  };
  visibility: {
    organizationId: string;
    projectId: string | null;
    requiresProjectClaimView: true;
    requiresAccountingVisibility: boolean;
  };
};

export type PaymentClaimUclLinkedContext = UniversalLearningLinkedContext & {
  project: {
    projectId: string | null;
    displayName: string | null;
    code: string | null;
  };
  client: {
    clientId: string | null;
    displayName: string | null;
  };
};

export type PaymentClaimUclRoutingContext = UniversalLearningRoutingContext & {
  readOnly: true;
  tradesstackCostCodes: string[];
  accountingMappingIds: string[];
  organizationCostCodeIds: string[];
};

export type PaymentClaimUclBusinessRecord = UniversalLearningBusinessRecord & {
  containerType: "project_claim";
  payload: PaymentClaimUclPayload;
  linkedContext: PaymentClaimUclLinkedContext;
  routingContext: PaymentClaimUclRoutingContext;
};

export type PaymentClaimUclValidationResult =
  | { success: true; data: PaymentClaimUclBusinessRecord }
  | { success: false; error: string; issues: Array<{ path: string; message: string }> };

const FORBIDDEN_KEYS = new Set([
  "rawocr",
  "ocrtext",
  "pdfbytes",
  "imagebytes",
  "signedurl",
  "storagepath",
  "storagekey",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "bankaccount",
  "bankingdetails",
  "notes",
  "rawrow",
  "row",
]);

function normalizedKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateForbidden(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>,
) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateForbidden(entry, `${path}[${index}]`, issues));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizedKey(key))) {
      issues.push({ path: `${path}.${key}`, message: "is forbidden in the Payment Claim UCL contract." });
    }
    validateForbidden(child, `${path}.${key}`, issues);
  }
}

function requireObject(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>,
) {
  if (!isObject(value)) {
    issues.push({ path, message: "must be an object." });
    return null;
  }
  return value;
}

function requireString(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>,
  nullable = false,
) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: nullable ? "must be a non-empty string or null." : "must be a non-empty string." });
  }
}

function requireTimestamp(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>,
  nullable = false,
) {
  if (nullable && value === null) return;
  if (!isValidSupplierBillUclTimestamp(value)) {
    issues.push({ path, message: nullable ? "must be a timezone-aware ISO timestamp or null." : "must be a timezone-aware ISO timestamp." });
  }
}

function requireNumber(
  value: unknown,
  path: string,
  issues: Array<{ path: string; message: string }>,
  nullable = false,
) {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message: nullable ? "must be a finite number or null." : "must be a finite number." });
  }
}

export function validatePaymentClaimUclBusinessRecord(
  value: unknown,
): PaymentClaimUclValidationResult {
  const issues: Array<{ path: string; message: string }> = [];
  const record = requireObject(value, "record", issues);
  if (!record) return { success: false, error: issues[0].message, issues };

  if (record.containerType !== PAYMENT_CLAIM_UCL_CONTAINER_TYPE) {
    issues.push({ path: "record.containerType", message: `must equal ${PAYMENT_CLAIM_UCL_CONTAINER_TYPE}.` });
  }
  requireString(record.organizationId, "record.organizationId", issues);
  requireString(record.updatedAt, "record.updatedAt", issues);
  requireTimestamp(record.updatedAt, "record.updatedAt", issues);

  const source = requireObject(record.source, "record.source", issues);
  if (source) {
    if (source.table !== "project_claims") {
      issues.push({ path: "record.source.table", message: "must equal project_claims." });
    }
    requireString(source.sourceId, "record.source.sourceId", issues);
    requireNumber(source.sourceVersion, "record.source.sourceVersion", issues);
  }

  const payload = requireObject(record.payload, "record.payload", issues);
  if (payload) {
    if (payload.schemaVersion !== PAYMENT_CLAIM_UCL_SCHEMA_VERSION) {
      issues.push({ path: "record.payload.schemaVersion", message: `must equal ${PAYMENT_CLAIM_UCL_SCHEMA_VERSION}.` });
    }
    const evidence = requireObject(payload.sourceEvidence, "record.payload.sourceEvidence", issues);
    const claim = evidence
      ? requireObject(evidence.claim, "record.payload.sourceEvidence.claim", issues)
      : null;
    if (claim) {
      requireString(claim.paymentClaimId, "record.payload.sourceEvidence.claim.paymentClaimId", issues);
      requireNumber(claim.sourceVersion, "record.payload.sourceEvidence.claim.sourceVersion", issues);
      requireString(claim.workflowState, "record.payload.sourceEvidence.claim.workflowState", issues);
      requireString(claim.submissionState, "record.payload.sourceEvidence.claim.submissionState", issues);
    }
    for (const collection of ["sections", "claimLines", "variations"] as const) {
      if (evidence && !Array.isArray(evidence[collection])) {
        issues.push({ path: `record.payload.sourceEvidence.${collection}`, message: "must be an array." });
      }
    }
    const provenance = requireObject(payload.provenance, "record.payload.provenance", issues);
    if (provenance) {
      requireTimestamp(provenance.assembledAt, "record.payload.provenance.assembledAt", issues);
      requireTimestamp(provenance.canonicalOwnerUpdatedAt, "record.payload.provenance.canonicalOwnerUpdatedAt", issues);
      requireTimestamp(provenance.latestDependencyUpdatedAt, "record.payload.provenance.latestDependencyUpdatedAt", issues);
      if (provenance.latestDependencyUpdatedAt !== record.updatedAt) {
        issues.push({
          path: "record.payload.provenance.latestDependencyUpdatedAt",
          message: "must equal record.updatedAt.",
        });
      }
      if (provenance.builderVersion !== PAYMENT_CLAIM_UCL_BUILDER_VERSION) {
        issues.push({ path: "record.payload.provenance.builderVersion", message: "has an unsupported builder version." });
      }
      requireString(provenance.contentHash, "record.payload.provenance.contentHash", issues);
    }
  }

  validateForbidden(value, "record", issues);
  if (issues.length > 0) {
    const first = issues[0];
    return { success: false, error: `${first.path}: ${first.message}`, issues };
  }
  return { success: true, data: value as PaymentClaimUclBusinessRecord };
}

export function assertValidPaymentClaimUclBusinessRecord(
  value: unknown,
): asserts value is PaymentClaimUclBusinessRecord {
  const result = validatePaymentClaimUclBusinessRecord(value);
  if (!result.success) throw new Error(result.error);
}
