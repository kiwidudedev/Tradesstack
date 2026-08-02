import type {
  RetentionClaimXeroAllocationSource,
} from "./retention-claim-sales-invoice-payload";

type Row = Record<string, unknown>;

export type DirectRetentionOriginEvidenceBlockerCode =
  | "multiple_origins_unsupported"
  | "origin_revision_missing"
  | "origin_revision_ambiguous"
  | "origin_retention_line_missing"
  | "origin_retention_line_ambiguous"
  | "origin_tax_evidence_missing"
  | "origin_tax_type_unavailable"
  | "origin_amount_mismatch"
  | "origin_identity_mismatch"
  | "origin_retention_line_invalid";

export type DirectRetentionOriginEvidence = {
  contract: "direct_immutable_retention_v1";
  allocationId: string;
  originatingPaymentClaimId: string;
  originClaimNumber: string;
  originAccountingDocumentId: string;
  originAccountingRevisionId: string;
  originAccountingRevisionLineId: string;
  originRevisionSequence: number;
  originPreviousRevisionId: string | null;
  connectionId: string;
  tenantId: string;
  currencyCode: string;
  accountCode: string;
  accountId: string | null;
  taxType: string;
  taxRateSnapshotId: string;
  effectiveRate: number;
  originAmountMinor: number;
  originTaxMinor: number;
  originTotalMinor: number;
  releaseAmountMinor: number;
  releaseTaxMinor: number;
  releaseTotalMinor: number;
  originTaxSnapshot: Record<string, unknown>;
};

export type DirectRetentionOriginEvidenceInput = {
  organizationId: string;
  projectId: string;
  connectionId: string;
  tenantId: string;
  currencyCode: string;
  routeAccountCode: string;
  allocations: RetentionClaimXeroAllocationSource[];
  originDocuments: Row[];
  originRevisions: Row[];
  originLines: Row[];
  activeTaxTypes: string[];
};

export type DirectRetentionOriginEvidenceResolution =
  | { ok: true; evidence: DirectRetentionOriginEvidence }
  | {
    ok: false;
    blocker: {
      code: DirectRetentionOriginEvidenceBlockerCode;
      message: string;
    };
  };

const MESSAGES: Record<DirectRetentionOriginEvidenceBlockerCode, string> = {
  multiple_origins_unsupported:
    "This Retention Claim requires a single originating Payment Claim.",
  origin_revision_missing:
    "The originating Payment Claim does not have one effective succeeded accounting revision.",
  origin_revision_ambiguous:
    "The originating Payment Claim has ambiguous effective accounting revisions.",
  origin_retention_line_missing:
    "The effective originating Payment Claim revision has no immutable retention line.",
  origin_retention_line_ambiguous:
    "The effective originating Payment Claim revision has ambiguous immutable retention lines.",
  origin_tax_evidence_missing:
    "The originating Payment Claim retention line does not contain complete immutable tax evidence.",
  origin_tax_type_unavailable:
    "The originating Payment Claim TaxType is not available for the selected Xero tenant.",
  origin_amount_mismatch:
    "The Retention Claim must release the full immutable originating retention amount.",
  origin_identity_mismatch:
    "The originating Payment Claim accounting identity does not match this Retention Claim.",
  origin_retention_line_invalid:
    "The immutable originating Payment Claim retention line is invalid.",
};

function blocked(
  code: DirectRetentionOriginEvidenceBlockerCode,
): DirectRetentionOriginEvidenceResolution {
  return { ok: false, blocker: { code, message: MESSAGES[code] } };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : {};
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function allocationMinor(value: number | string) {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const minor = BigInt(whole) * BigInt(100)
    + BigInt(`${fraction}00`.slice(0, 2));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

export function resolveDirectRetentionOriginEvidence(
  input: DirectRetentionOriginEvidenceInput,
): DirectRetentionOriginEvidenceResolution {
  if (input.allocations.length !== 1) {
    return blocked("multiple_origins_unsupported");
  }
  const allocation = input.allocations[0]!;
  const originId = allocation.originatingPaymentClaimId;
  const candidates = input.originDocuments.flatMap((document) => {
    const revision = input.originRevisions.find((row) =>
      text(row.id) === text(document.active_accounting_revision_id)
      && text(row.accounting_document_id) === text(document.id)
    );
    if (
      text(document.organization_id) !== input.organizationId
      || text(document.provider).toLowerCase() !== "xero"
      || text(document.local_document_type) !== "project_claim"
      || text(document.project_claim_id) !== originId
      || text(document.integration_contract) !== "payment_claim_revision_v1"
      || !revision
      || text(revision.organization_id) !== input.organizationId
      || text(revision.project_id) !== input.projectId
      || text(revision.source_document_type) !== "project_claim"
      || text(revision.source_document_id) !== originId
      || text(revision.lifecycle_state) !== "succeeded"
    ) return [];
    return [{ document, revision }];
  });
  if (candidates.length === 0) return blocked("origin_revision_missing");
  if (candidates.length > 1) return blocked("origin_revision_ambiguous");
  const { document, revision } = candidates[0]!;
  if (
    text(revision.connection_id) !== input.connectionId
    || text(revision.tenant_id) !== input.tenantId
    || text(revision.currency_code).toUpperCase()
      !== input.currencyCode.toUpperCase()
  ) return blocked("origin_identity_mismatch");

  const lines = input.originLines.filter((line) =>
    text(line.organization_id) === input.organizationId
    && text(line.accounting_revision_id) === text(revision.id)
    && text(line.line_kind) === "retention"
    && text(line.originating_payment_claim_id) === originId
  );
  if (lines.length === 0) return blocked("origin_retention_line_missing");
  if (lines.length > 1) return blocked("origin_retention_line_ambiguous");
  const line = lines[0]!;
  const originAmountMinor = integer(line.line_amount_minor);
  const originTaxMinor = integer(line.tax_minor);
  const originTotalMinor = integer(line.total_minor);
  const accountSnapshot = object(line.account_snapshot);
  const lineTaxSnapshot = object(line.tax_snapshot);
  const revisionTaxSnapshot = object(revision.tax_snapshot);
  const accountCode = text(accountSnapshot.accountCode);
  const taxType = text(lineTaxSnapshot.taxType).toUpperCase();
  const revisionTaxType = text(revisionTaxSnapshot.taxType).toUpperCase();
  const taxRateSnapshotId = text(revisionTaxSnapshot.taxRateId);
  const effectiveRate = Number(revisionTaxSnapshot.effectiveRate);
  if (
    originAmountMinor == null
    || originTaxMinor == null
    || originTotalMinor == null
    || originAmountMinor >= 0
    || originTotalMinor !== originAmountMinor + originTaxMinor
    || (originTaxMinor !== 0 && Math.sign(originAmountMinor) !== Math.sign(originTaxMinor))
    || accountCode !== input.routeAccountCode
  ) return blocked("origin_retention_line_invalid");
  const expectedAmountMinor = allocationMinor(allocation.allocationAmount);
  if (
    expectedAmountMinor == null
    || expectedAmountMinor !== Math.abs(originAmountMinor)
  ) return blocked("origin_amount_mismatch");
  if (
    !taxType
    || revisionTaxType !== taxType
    || !taxRateSnapshotId
    || !Number.isFinite(effectiveRate)
    || effectiveRate < 0
  ) return blocked("origin_tax_evidence_missing");
  const matchingTaxTypes = input.activeTaxTypes.filter((candidate) =>
    candidate.trim().toUpperCase() === taxType
  );
  if (matchingTaxTypes.length !== 1) {
    return blocked("origin_tax_type_unavailable");
  }

  return {
    ok: true,
    evidence: {
      contract: "direct_immutable_retention_v1",
      allocationId: allocation.id,
      originatingPaymentClaimId: originId,
      originClaimNumber: allocation.originClaimNumberSnapshot,
      originAccountingDocumentId: text(document.id),
      originAccountingRevisionId: text(revision.id),
      originAccountingRevisionLineId: text(line.id),
      originRevisionSequence: integer(revision.revision_sequence) ?? 0,
      originPreviousRevisionId: text(revision.previous_revision_id) || null,
      connectionId: input.connectionId,
      tenantId: input.tenantId,
      currencyCode: input.currencyCode.toUpperCase(),
      accountCode,
      accountId: text(accountSnapshot.accountId) || null,
      taxType,
      taxRateSnapshotId,
      effectiveRate,
      originAmountMinor,
      originTaxMinor,
      originTotalMinor,
      releaseAmountMinor: -originAmountMinor,
      releaseTaxMinor: originTaxMinor === 0 ? 0 : -originTaxMinor,
      releaseTotalMinor: -originTotalMinor,
      originTaxSnapshot: {
        ...revisionTaxSnapshot,
        ...lineTaxSnapshot,
      },
    },
  };
}
