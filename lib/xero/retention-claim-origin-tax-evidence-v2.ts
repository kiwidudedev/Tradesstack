export type RetentionOriginTaxEvidenceKindV2 =
  | "immutable_revision"
  | "exact_legacy_adoption"
  | "submission_snapshot"
  | "reviewed_classification";

export type RetentionOriginTaxEvidenceBlockerV2 =
  | "origin_revision_missing"
  | "origin_revision_ambiguous"
  | "origin_retention_line_missing"
  | "origin_retention_line_ambiguous"
  | "origin_retention_line_invalid"
  | "origin_tax_evidence_missing"
  | "origin_tax_type_unavailable"
  | "origin_tax_identity_ambiguous"
  | "origin_amount_mismatch"
  | "legacy_tax_classification_ambiguous";

export type RetentionOriginLineageV2 = {
  effectiveOriginAccountingDocumentId: string | null;
  effectiveOriginRevisionId: string | null;
  originRevisionSequence: number | null;
  originRetentionRevisionLineId: string | null;
  originProviderInvoiceId: string | null;
  originPredecessorRevisionId: string | null;
  replacementRootAccountingDocumentId: string | null;
  legacyTaxClassificationId: string | null;
};

export type RetentionOriginBalancesV2 = {
  releasedToDateAmountMinor: number;
  releasedToDateTaxMinor: number;
  reservedAmountMinor: number;
  reservedTaxMinor: number;
};

export type RetentionOriginTaxIdentityV2 = {
  taxType: string;
  taxRateSnapshotId: string | null;
  taxRateNameSnapshot: string | null;
  effectiveRateBasisPoints: number;
};

export type RetentionOriginResolvedEvidenceV2 =
  & RetentionOriginLineageV2
  & RetentionOriginBalancesV2
  & RetentionOriginTaxIdentityV2
  & {
    schemaVersion: 2;
    status: "resolved";
    blockerCode?: never;
    originatingPaymentClaimId: string;
    evidenceKind: RetentionOriginTaxEvidenceKindV2;
    originAmountMinor: number;
    originTaxMinor: number;
    originTotalMinor: number;
    originAccountCodeSnapshot: string;
    originAccountIdSnapshot: string | null;
    currencyCode: string;
    xeroConnectionId: string;
    tenantId: string;
    evidenceHash: string;
  };

export type RetentionOriginBlockedEvidenceV2 =
  & Partial<RetentionOriginLineageV2>
  & Partial<RetentionOriginTaxIdentityV2>
  & RetentionOriginBalancesV2
  & {
    schemaVersion: 2;
    status: "blocked";
    blockerCode: RetentionOriginTaxEvidenceBlockerV2;
    originatingPaymentClaimId: string;
    evidenceKind?: RetentionOriginTaxEvidenceKindV2;
    originAmountMinor?: number;
    originTaxMinor?: number;
    originTotalMinor?: number;
    originAccountCodeSnapshot?: string;
    originAccountIdSnapshot?: string | null;
    currencyCode?: string;
    xeroConnectionId?: string;
    tenantId?: string;
    evidenceHash: string;
  };

export type RetentionOriginTaxEvidenceV2 =
  | RetentionOriginResolvedEvidenceV2
  | RetentionOriginBlockedEvidenceV2;

export type MasterRetentionClaimSourceV2 = {
  schemaVersion: 2;
  readOnly: true;
  claim: Record<string, unknown>;
  allocations: Array<Record<string, unknown> & RetentionOriginTaxEvidenceV2>;
};
