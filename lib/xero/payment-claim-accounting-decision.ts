export type PaymentClaimAccountingOperation =
  | "INITIAL_EXPORT"
  | "REPLACEMENT_EXPORT"
  | "ACCOUNTING_UPDATE"
  | "BLOCKED";

export type PaymentClaimAccountingBlockerCode =
  | "feature_disabled"
  | "permission_denied"
  | "not_ready"
  | "active_work"
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
  | "future_operation_not_supported";

export type PaymentClaimAccountingDecisionInput = {
  featureEnabled: boolean;
  hasPushPermission: boolean;
  readinessReady: boolean;
  readinessMessage?: string | null;
  hasActiveWork: boolean;
  hasStableDocument: boolean;
  hasActiveRevision: boolean;
  legacyAdoptionEligible?: boolean;
  activeRevisionIntent?: "initial_push" | "replacement" | "other" | null;
  activeInvoiceId?: string | null;
  activeInvoiceNumber?: string | null;
  replacementNumber?: string | null;
  connectionMatches: boolean;
  tenantMatches: boolean;
  hasInvoiceScope: boolean;
  providerAvailable: boolean;
  providerState:
    | "not_exported"
    | "authorised"
    | "voided"
    | "deleted"
    | "paid"
    | "partially_paid"
    | "missing_unconfirmed"
    | "missing_confirmed"
    | "unknown";
  amountPaidMinor: number;
  amountDueMinor: number;
  amountCreditedMinor: number;
  hasPayments: boolean;
  hasCredits: boolean;
  financialDivergence: boolean;
  contentDivergence: boolean;
  claimChangedAfterExport: boolean;
  futureAccountingUpdateEnabled?: boolean;
};

export type PaymentClaimAccountingDecision = {
  operation: PaymentClaimAccountingOperation;
  canPush: boolean;
  proposalType: "initial" | "replacement" | "future_update" | null;
  confirmationTitle: string | null;
  confirmationMessage: string | null;
  workerKind:
    | "xero.payment_claim.initial_push"
    | "xero.payment_claim.replacement"
    | "xero.payment_claim.accounting_update"
    | null;
  replacementNumber: string | null;
  blockers: Array<{ code: PaymentClaimAccountingBlockerCode; message: string }>;
  warnings: string[];
  accountingState: string;
  predecessorObservationHash?: string | null;
  latestObservationId?: string | null;
};

export function nextPaymentClaimReplacementNumber(
  claimNumber: string,
  priorInvoiceNumbers: string[],
) {
  const base = claimNumber.trim();
  if (!base) return null;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`^${escaped}-R([1-9][0-9]*)$`);
  const nextSequence = priorInvoiceNumbers.reduce((maximum, invoiceNumber) => {
    const match = invoiceNumber.match(expression);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
  return `${base}-R${nextSequence}`;
}

const INITIAL_MESSAGE = "This will create an authorised sales invoice in Xero.";
const REPLACEMENT_MESSAGE =
  "A previous Xero invoice for this Payment Claim has been voided.\n\nContinuing will create a new authorised replacement invoice.";

function blocked(
  code: PaymentClaimAccountingBlockerCode,
  message: string,
  accountingState: string,
): PaymentClaimAccountingDecision {
  return {
    operation: "BLOCKED",
    canPush: false,
    proposalType: null,
    confirmationTitle: null,
    confirmationMessage: null,
    workerKind: null,
    replacementNumber: null,
    blockers: [{ code, message }],
    warnings: [],
    accountingState,
  };
}

export function resolvePaymentClaimAccountingOperation(
  input: PaymentClaimAccountingDecisionInput,
): PaymentClaimAccountingDecision {
  if (!input.featureEnabled) {
    return blocked("feature_disabled", "Push to Xero is not enabled for this organisation.", "feature_disabled");
  }
  if (!input.hasPushPermission) {
    return blocked("permission_denied", "You do not have permission to Push Payment Claims to Xero.", "permission_denied");
  }
  if (!input.readinessReady) {
    return blocked("not_ready", input.readinessMessage ?? "The Payment Claim is not ready to Push to Xero.", "not_ready");
  }
  if (input.hasActiveWork) {
    return blocked("active_work", "An accounting operation is already in progress.", "active_work");
  }

  const neverExported = !input.hasStableDocument
    || (!input.hasActiveRevision && !input.activeInvoiceId && input.providerState === "not_exported");
  if (neverExported) {
    return {
      operation: "INITIAL_EXPORT",
      canPush: true,
      proposalType: "initial",
      confirmationTitle: "Review authorised Xero invoice",
      confirmationMessage: INITIAL_MESSAGE,
      workerKind: "xero.payment_claim.initial_push",
      replacementNumber: null,
      blockers: [],
      warnings: [],
      accountingState: "ready_for_initial_export",
    };
  }

  if (input.legacyAdoptionEligible) {
    if (!input.connectionMatches || !input.tenantMatches) {
      return blocked("wrong_tenant", "The linked Xero organisation could not be confirmed.", "wrong_tenant");
    }
    if (!input.hasInvoiceScope) {
      return blocked("missing_scope", "Reconnect Xero with invoice access before pushing this Payment Claim.", "missing_scope");
    }
    if (input.amountCreditedMinor > 0 || input.hasCredits) {
      return blocked("credits_exist", "This Payment Claim cannot be pushed because credits exist.", "credited");
    }
    if (input.amountPaidMinor > 0 || input.hasPayments) {
      return blocked(
        input.amountDueMinor > 0 ? "partial_payment_exists" : "payments_exist",
        input.amountDueMinor > 0
          ? "This Payment Claim cannot be pushed because the Xero invoice is partially paid."
          : "This Payment Claim cannot be pushed because payments already exist.",
        input.amountDueMinor > 0 ? "partially_paid" : "paid",
      );
    }
    if (!input.replacementNumber) {
      return blocked(
        "identity_incomplete",
        "A replacement Xero invoice number could not be reserved.",
        "replacement_number_unavailable",
      );
    }
    return {
      operation: "REPLACEMENT_EXPORT",
      canPush: true,
      proposalType: "replacement",
      confirmationTitle: "Review authorised Xero invoice",
      confirmationMessage: REPLACEMENT_MESSAGE,
      workerKind: "xero.payment_claim.replacement",
      replacementNumber: input.replacementNumber,
      blockers: [],
      warnings: ["The historical Xero invoice will first be adopted into immutable accounting history."],
      accountingState: "ready_for_legacy_adoption_after_void",
    };
  }

  if (!input.hasActiveRevision || !input.activeInvoiceId || !input.activeInvoiceNumber) {
    return blocked(
      "identity_incomplete",
      "The immutable Xero accounting identity could not be confirmed.",
      "identity_incomplete",
    );
  }
  if (!input.connectionMatches || !input.tenantMatches) {
    return blocked("wrong_tenant", "The linked Xero organisation could not be confirmed.", "wrong_tenant");
  }
  if (!input.hasInvoiceScope) {
    return blocked("missing_scope", "Reconnect Xero with invoice access before pushing this Payment Claim.", "missing_scope");
  }
  if (!input.providerAvailable) {
    return blocked("provider_unavailable", "Xero accounting status could not be confirmed.", "provider_unavailable");
  }
  if (input.amountCreditedMinor > 0 || input.hasCredits) {
    return blocked("credits_exist", "This Payment Claim cannot be pushed because credits exist.", "credited");
  }
  if (input.amountPaidMinor > 0 || input.hasPayments) {
    const partial = input.amountDueMinor > 0 || input.providerState === "partially_paid";
    return blocked(
      partial ? "partial_payment_exists" : "payments_exist",
      partial
        ? "This Payment Claim cannot be pushed because the Xero invoice is partially paid."
        : "This Payment Claim cannot be pushed because payments already exist.",
      partial ? "partially_paid" : "paid",
    );
  }
  if (input.financialDivergence) {
    return blocked(
      "financial_divergence",
      "Xero financial values differ from the confirmed TradesStack export.",
      "financial_divergence",
    );
  }
  if (input.contentDivergence) {
    return blocked(
      "content_divergence",
      "Xero accounting values differ from the confirmed TradesStack export.",
      "content_divergence",
    );
  }
  if (input.providerState === "missing_unconfirmed") {
    return blocked(
      "missing_unconfirmed",
      "The linked Xero invoice is missing, but permanent loss has not been confirmed.",
      "missing_unconfirmed",
    );
  }
  if (input.providerState === "unknown") {
    return blocked("provider_unknown", "Accounting status could not be confirmed.", "provider_unknown");
  }
  if (input.providerState === "voided" || input.providerState === "deleted" || input.providerState === "missing_confirmed") {
    if (!input.replacementNumber) {
      return blocked(
        "identity_incomplete",
        "A replacement Xero invoice number could not be reserved.",
        "replacement_number_unavailable",
      );
    }
    return {
      operation: "REPLACEMENT_EXPORT",
      canPush: true,
      proposalType: "replacement",
      confirmationTitle: "Review authorised Xero invoice",
      confirmationMessage: REPLACEMENT_MESSAGE,
      workerKind: "xero.payment_claim.replacement",
      replacementNumber: input.replacementNumber,
      blockers: [],
      warnings: ["The previous Xero invoice remains part of the immutable accounting history."],
      accountingState: input.providerState === "missing_confirmed"
        ? "ready_for_replacement_after_confirmed_loss"
        : "ready_for_replacement_after_void",
    };
  }
  if (input.claimChangedAfterExport) {
    if (!input.futureAccountingUpdateEnabled) {
      return blocked(
        "future_operation_not_supported",
        "The Payment Claim changed after export. The required accounting update workflow is not available yet.",
        "accounting_update_not_supported",
      );
    }
    return {
      operation: "ACCOUNTING_UPDATE",
      canPush: true,
      proposalType: "future_update",
      confirmationTitle: "Update authorised Xero invoice",
      confirmationMessage:
        "This will update the existing authorised Xero invoice using a new immutable accounting revision.",
      workerKind: "xero.payment_claim.accounting_update",
      replacementNumber: null,
      blockers: [],
      warnings: [],
      accountingState: "ready_for_accounting_update",
    };
  }
  return blocked("already_exported", "This Payment Claim is already active in Xero.", "already_exported");
}
