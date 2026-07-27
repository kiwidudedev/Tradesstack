export type RetentionClaimAccountingOperation =
  | "INITIAL_EXPORT"
  | "UPDATE_EXISTING_INVOICE"
  | "REPLACEMENT_EXPORT"
  | "LEGACY_ADOPTION_REQUIRED"
  | "BLOCKED";

export type RetentionClaimAccountingBlockerCode =
  | "feature_disabled"
  | "permission_denied"
  | "not_ready"
  | "retention_ownership_invalid"
  | "active_work"
  | "uncertain_result"
  | "identity_incomplete"
  | "wrong_tenant"
  | "missing_scope"
  | "provider_unavailable"
  | "provider_unknown"
  | "missing_unconfirmed"
  | "already_exported"
  | "payments_exist"
  | "partial_payment_exists"
  | "credits_exist"
  | "financial_divergence"
  | "content_divergence"
  | "accounting_update_not_available";

export type RetentionClaimProviderState =
  | "not_exported"
  | "authorised"
  | "voided"
  | "deleted"
  | "paid"
  | "partially_paid"
  | "missing_unconfirmed"
  | "missing_confirmed"
  | "unknown";

export type RetentionClaimAccountingDecisionInput = {
  featureEnabled: boolean;
  hasPushPermission: boolean;
  readinessReady: boolean;
  readinessMessage?: string | null;
  retentionOwnershipValid: boolean;
  retentionOwnershipMessage?: string | null;
  hasActiveFinancialWork: boolean;
  hasUncertainFinancialResult: boolean;
  hasStableDocument: boolean;
  hasActiveRevision: boolean;
  legacyAdoptionEligible: boolean;
  activeInvoiceId?: string | null;
  activeInvoiceNumber?: string | null;
  replacementNumber?: string | null;
  connectionMatches: boolean;
  tenantMatches: boolean;
  hasInvoiceScope: boolean;
  providerAvailable: boolean;
  providerState: RetentionClaimProviderState;
  amountPaidMinor: number;
  amountDueMinor: number;
  amountCreditedMinor: number;
  hasPayments: boolean;
  hasCredits: boolean;
  financialDivergence: boolean;
  contentDivergence: boolean;
  claimChangedAfterExport: boolean;
  canRefresh: boolean;
};

export type RetentionClaimAccountingDecision = {
  operation: RetentionClaimAccountingOperation;
  canPush: boolean;
  canRefresh: boolean;
  accountingState: string;
  proposalType: "initial" | "update" | "replacement" | "legacy_adoption" | null;
  confirmationTitle: string | null;
  confirmationMessage: string | null;
  workerKind:
    | "xero.retention_claim.initial_push"
    | "xero.retention_claim.update"
    | "xero.retention_claim.replacement"
    | null;
  replacementNumber: string | null;
  blockers: Array<{ code: RetentionClaimAccountingBlockerCode; message: string }>;
  warnings: string[];
};

const INITIAL_MESSAGE =
  "This will create an authorised sales invoice in Xero.";
const REPLACEMENT_MESSAGE =
  "A previous Xero invoice for this Retention Claim is voided. Continuing will create a new authorised invoice.";
const UPDATE_MESSAGE =
  "Retention values or dates have changed since the last Xero sync. Continuing will update the existing authorised Xero invoice.";

function blocked(
  input: RetentionClaimAccountingDecisionInput,
  code: RetentionClaimAccountingBlockerCode,
  message: string,
  accountingState: string,
): RetentionClaimAccountingDecision {
  return {
    operation: "BLOCKED",
    canPush: false,
    canRefresh: input.canRefresh,
    accountingState,
    proposalType: null,
    confirmationTitle: null,
    confirmationMessage: null,
    workerKind: null,
    replacementNumber: null,
    blockers: [{ code, message }],
    warnings: [],
  };
}

export function nextRetentionClaimReplacementNumber(
  commercialClaimNumber: string,
  historicalInvoiceNumbers: readonly string[],
) {
  const base = commercialClaimNumber.trim();
  if (!base) return null;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-R([1-9][0-9]*)$`);
  const sequence = historicalInvoiceNumbers.reduce((highest, number) => {
    const match = number.match(pattern);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return `${base}-R${sequence}`;
}

export function resolveRetentionClaimAccountingOperation(
  input: RetentionClaimAccountingDecisionInput,
): RetentionClaimAccountingDecision {
  if (!input.featureEnabled) {
    return blocked(input, "feature_disabled", "Push to Xero is not enabled for this organisation.", "feature_disabled");
  }
  if (!input.hasPushPermission) {
    return blocked(input, "permission_denied", "You do not have permission to Push Retention Claims to Xero.", "permission_denied");
  }
  if (!input.readinessReady) {
    return blocked(input, "not_ready", input.readinessMessage ?? "The Retention Claim is not ready to Push to Xero.", "not_ready");
  }
  if (!input.retentionOwnershipValid) {
    return blocked(
      input,
      "retention_ownership_invalid",
      input.retentionOwnershipMessage ?? "Retention ownership changed. Review the Retention Claim before pushing.",
      "retention_ownership_invalid",
    );
  }
  if (input.hasActiveFinancialWork) {
    return blocked(input, "active_work", "An accounting operation is already in progress.", "active_work");
  }
  if (input.hasUncertainFinancialResult) {
    return blocked(input, "uncertain_result", "A previous Xero result is uncertain. Do not push again until it is resolved.", "uncertain_result");
  }

  const neverExported = !input.hasStableDocument
    || (!input.hasActiveRevision && !input.activeInvoiceId && input.providerState === "not_exported");
  if (neverExported) {
    return {
      operation: "INITIAL_EXPORT",
      canPush: true,
      canRefresh: false,
      accountingState: "ready_for_initial_export",
      proposalType: "initial",
      confirmationTitle: "Review authorised Xero invoice",
      confirmationMessage: INITIAL_MESSAGE,
      workerKind: "xero.retention_claim.initial_push",
      replacementNumber: null,
      blockers: [],
      warnings: [],
    };
  }

  if (input.legacyAdoptionEligible) {
    return {
      operation: "LEGACY_ADOPTION_REQUIRED",
      canPush: true,
      canRefresh: input.canRefresh,
      accountingState: "legacy_adoption_required",
      proposalType: "legacy_adoption",
      confirmationTitle: "Review authorised Xero invoice",
      confirmationMessage: REPLACEMENT_MESSAGE,
      workerKind: null,
      replacementNumber: input.replacementNumber ?? null,
      blockers: [],
      warnings: ["The historical Xero invoice must first be preserved in immutable accounting history."],
    };
  }

  if (!input.hasActiveRevision || !input.activeInvoiceId || !input.activeInvoiceNumber) {
    return blocked(input, "identity_incomplete", "The immutable Xero accounting identity could not be confirmed.", "identity_incomplete");
  }
  if (!input.connectionMatches || !input.tenantMatches) {
    return blocked(input, "wrong_tenant", "The linked Xero organisation could not be confirmed.", "wrong_tenant");
  }
  if (!input.hasInvoiceScope) {
    return blocked(input, "missing_scope", "Reconnect Xero with invoice access before pushing this Retention Claim.", "missing_scope");
  }
  if (!input.providerAvailable) {
    return blocked(input, "provider_unavailable", "Xero accounting status could not be confirmed.", "provider_unavailable");
  }
  if (input.amountCreditedMinor > 0 || input.hasCredits) {
    return blocked(input, "credits_exist", "This Retention Claim cannot be pushed because credits exist.", "credited");
  }
  if (input.amountPaidMinor > 0 || input.hasPayments) {
    const partial = input.amountDueMinor > 0 || input.providerState === "partially_paid";
    return blocked(
      input,
      partial ? "partial_payment_exists" : "payments_exist",
      partial
        ? "This Retention Claim cannot be pushed because the Xero invoice is partially paid."
        : "This Retention Claim cannot be pushed because payments already exist.",
      partial ? "partially_paid" : "paid",
    );
  }
  if (input.financialDivergence) {
    return blocked(input, "financial_divergence", "Xero financial values differ from the confirmed TradesStack export.", "financial_divergence");
  }
  if (input.contentDivergence) {
    return blocked(input, "content_divergence", "Xero accounting values differ from the confirmed TradesStack export.", "content_divergence");
  }
  if (input.providerState === "missing_unconfirmed") {
    return blocked(input, "missing_unconfirmed", "The linked Xero invoice is missing, but permanent loss has not been confirmed.", "missing_unconfirmed");
  }
  if (input.providerState === "unknown") {
    return blocked(input, "provider_unknown", "Accounting status could not be confirmed.", "provider_unknown");
  }
  if (
    input.providerState === "voided"
    || input.providerState === "deleted"
    || input.providerState === "missing_confirmed"
  ) {
    if (!input.replacementNumber) {
      return blocked(input, "identity_incomplete", "A replacement Xero invoice number could not be allocated.", "replacement_number_unavailable");
    }
    return {
      operation: "REPLACEMENT_EXPORT",
      canPush: true,
      canRefresh: input.canRefresh,
      accountingState: input.providerState === "missing_confirmed"
        ? "ready_for_replacement_after_confirmed_loss"
        : "ready_for_replacement_after_void",
      proposalType: "replacement",
      confirmationTitle: "Review authorised Xero invoice",
      confirmationMessage: REPLACEMENT_MESSAGE,
      workerKind: "xero.retention_claim.replacement",
      replacementNumber: input.replacementNumber,
      blockers: [],
      warnings: ["The previous Xero invoice remains part of the immutable accounting history."],
    };
  }
  if (input.claimChangedAfterExport) {
    return {
      operation: "UPDATE_EXISTING_INVOICE",
      canPush: true,
      canRefresh: input.canRefresh,
      accountingState: "update_required",
      proposalType: "update",
      confirmationTitle: "Review cumulative Xero invoice update",
      confirmationMessage: UPDATE_MESSAGE,
      workerKind: "xero.retention_claim.update",
      replacementNumber: null,
      blockers: [],
      warnings: ["Retention values or dates have changed since the last Xero sync."],
    };
  }
  return blocked(input, "already_exported", "The current Retention Claim is already authorised in Xero.", "authorised");
}
