import "server-only";

import { randomUUID } from "node:crypto";
import {
  hashAccountingEvidence,
  hashAccountingLines,
} from "@/lib/accounting/accounting-evidence";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  findXeroInvoicesByNumber,
  getXeroInvoice,
  XeroRequestError,
} from "@/lib/xero/client";
import {
  buildPaymentClaimXeroCurrentStateHashFromPayload,
} from "@/lib/xero/payment-claim-sales-invoice-hash";
import {
  buildPaymentClaimXeroPayloadFromResolvedSnapshot,
  type PaymentClaimXeroSalesInvoicePayload,
} from "@/lib/xero/payment-claim-sales-invoice-payload";
import {
  evaluatePaymentClaimXeroReadinessSnapshot,
  resolvePaymentClaimXeroReadinessContext,
} from "@/lib/xero/payment-claim-readiness";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type RpcError = {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
};
type Admin = {
  // The adoption RPC intentionally precedes generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: RpcError | null }>;
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => PromiseLike<{ error: RpcError | null }>;
  };
};

const LEGACY_ADOPTION_SCHEMA =
  "accounting-evidence-v1:payment-claim-legacy-adoption-v1";

export class PaymentClaimLegacyAdoptionError extends Error {
  constructor(
    readonly code:
      | "not_legacy"
      | "xero_connection_unavailable"
      | "remote_invoice_not_found"
      | "remote_identity_mismatch"
      | "predecessor_not_voided"
      | "payments_exist"
      | "credits_exist"
      | "LEGACY_ADOPTION_RPC_UNAVAILABLE"
      | "LEGACY_ADOPTION_PERMISSION_DENIED"
      | "LEGACY_ADOPTION_CONSTRAINT_FAILED"
      | "LEGACY_ADOPTION_STALE_EVIDENCE"
      | "LEGACY_ADOPTION_IDENTITY_MISMATCH"
      | "LEGACY_ADOPTION_ALREADY_EXISTS"
      | "LEGACY_ADOPTION_PARTIAL_STATE"
      | "LEGACY_ADOPTION_UNEXPECTED_ERROR",
    message: string,
    readonly supportReference: string | null = null,
  ) {
    super(message);
    this.name = "PaymentClaimLegacyAdoptionError";
  }
}

function classifyAdoptionRpcError(error: RpcError) {
  const message = error.message.toLowerCase();
  if (
    error.code === "PGRST202"
    || error.code === "42883"
    || /function .* does not exist|schema cache/.test(message)
  ) {
    return {
      code: "LEGACY_ADOPTION_RPC_UNAVAILABLE" as const,
      message: "The historical invoice adoption service is temporarily unavailable.",
    };
  }
  if (error.code === "42501" || /permission denied/.test(message)) {
    return {
      code: "LEGACY_ADOPTION_PERMISSION_DENIED" as const,
      message: "TradesStack is not authorised to adopt this historical invoice.",
    };
  }
  if (error.code === "23505" || /already exists|duplicate key/.test(message)) {
    return {
      code: "LEGACY_ADOPTION_ALREADY_EXISTS" as const,
      message: "An immutable accounting baseline already exists for this Payment Claim.",
    };
  }
  if (error.code?.startsWith("23")) {
    return {
      code: "LEGACY_ADOPTION_CONSTRAINT_FAILED" as const,
      message: "The historical invoice could not satisfy the immutable accounting constraints.",
    };
  }
  if (/changed|stale|optimistic revision/.test(message)) {
    return {
      code: "LEGACY_ADOPTION_STALE_EVIDENCE" as const,
      message: "The Payment Claim or its Xero evidence changed before adoption.",
    };
  }
  if (/identity|tenant|connection|invoice scope/.test(message)) {
    return {
      code: "LEGACY_ADOPTION_IDENTITY_MISMATCH" as const,
      message: "The historical Xero invoice identity no longer matches TradesStack.",
    };
  }
  if (/partial|orphan|without lines/.test(message)) {
    return {
      code: "LEGACY_ADOPTION_PARTIAL_STATE" as const,
      message: "TradesStack found an incomplete historical adoption that requires support review.",
    };
  }
  return {
    code: "LEGACY_ADOPTION_UNEXPECTED_ERROR" as const,
    message: "TradesStack could not safely adopt the historical Xero invoice.",
  };
}

function failedConstraint(error: RpcError) {
  return error.message.match(/constraint ["']([^"']+)["']/i)?.[1] ?? null;
}

async function persistAdoptionRpcFailure(params: {
  admin: Admin;
  organizationId: string;
  claimId: string;
  accountingDocumentId: string;
  supportReference: string;
  safeCode: string;
  error: RpcError;
}) {
  const result = await params.admin
    .from("organization_accounting_operation_errors")
    .insert({
      support_reference: params.supportReference,
      organization_id: params.organizationId,
      source_document_type: "project_claim",
      source_document_id: params.claimId,
      accounting_document_id: params.accountingDocumentId,
      operation: "legacy_payment_claim_adoption",
      safe_code: params.safeCode,
      internal_sqlstate: params.error.code ?? null,
      internal_message: params.error.message,
      internal_details: params.error.details ?? null,
      internal_hint: params.error.hint ?? null,
      failed_constraint: failedConstraint(params.error),
    });
  if (result.error) {
    console.error("Failed to persist legacy adoption support evidence.", {
      supportReference: params.supportReference,
      persistenceCode: result.error.code ?? null,
      adoptionCode: params.error.code ?? null,
    });
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function moneyMinor(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    throw new PaymentClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "Xero returned invalid predecessor invoice totals.",
    );
  }
  return Math.round(amount * 100);
}

function xeroDate(value: unknown) {
  if (typeof value !== "string") return "";
  const iso = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const serialized = value.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  return serialized ? new Date(Number(serialized[1])).toISOString().slice(0, 10) : "";
}

function xeroUpdatedAt(value: unknown) {
  if (typeof value !== "string") return null;
  const serialized = value.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  if (serialized) return new Date(Number(serialized[1])).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function reconstructedPayload(invoice: XeroInvoice): PaymentClaimXeroSalesInvoicePayload {
  const invoiceRow = invoice as Row;
  const contact = row(invoice.Contact);
  const lineItems = array(invoice.LineItems).map((value) => {
    const line = row(value);
    if (Number(line.Quantity) !== 1) {
      throw new PaymentClaimLegacyAdoptionError(
        "remote_identity_mismatch",
        "The legacy Xero invoice contains an unsupported Payment Claim line quantity.",
      );
    }
    return {
      Description: text(line.Description),
      Quantity: 1 as const,
      UnitAmount: Number(line.UnitAmount),
      AccountCode: text(line.AccountCode),
      TaxType: text(line.TaxType),
    };
  });
  return {
    Type: "ACCREC",
    Status: "AUTHORISED",
    Contact: { ContactID: text(contact.ContactID) },
    Date: xeroDate(invoice.Date),
    DueDate: xeroDate(invoice.DueDate),
    LineAmountTypes: "Exclusive",
    LineItems: lineItems,
    Reference: text(invoiceRow.Reference),
    CurrencyCode: "NZD",
    InvoiceNumber: text(invoice.InvoiceNumber),
  };
}

function adoptionLines(invoice: XeroInvoice, claimId: string) {
  return array(invoice.LineItems).map((value, index) => {
    const line = row(value);
    const lineAmountMinor = moneyMinor(line.LineAmount);
    const taxMinor = moneyMinor(line.TaxAmount);
    return {
      sequence: index + 1,
      lineKind: lineAmountMinor < 0 ? "retention" : "claim",
      sourceLineType: "legacy_xero_invoice",
      sourceLineId: null,
      originatingPaymentClaimId: claimId,
      description: text(line.Description) || `Historical Xero invoice line ${index + 1}`,
      quantity: Number(line.Quantity),
      unitAmountMinor: moneyMinor(line.UnitAmount),
      lineAmountMinor,
      taxMinor,
      totalMinor: lineAmountMinor + taxMinor,
      accountSnapshot: {
        accountCode: text(line.AccountCode),
        accountId: text(line.AccountID) || null,
      },
      taxSnapshot: { taxType: text(line.TaxType) },
      trackingSnapshot: { tracking: array(line.Tracking) },
      sourceSnapshot: {
        provenance: "legacy_adoption",
        evidenceQuality: "reconstructed_from_current_xero_and_tradesstack",
        xeroLineItemId: text(line.LineItemID) || null,
      },
    };
  });
}

function validateEligiblePredecessor(params: {
  invoice: XeroInvoice;
  invoiceId: string;
  invoiceNumber: string;
}) {
  const invoice = params.invoice;
  if (
    invoice.Type !== "ACCREC"
    || invoice.InvoiceID !== params.invoiceId
    || invoice.InvoiceNumber !== params.invoiceNumber
  ) {
    throw new PaymentClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The Xero Sales Invoice does not match the linked legacy identity.",
    );
  }
  const invoiceRow = invoice as Row;
  if (
    text(invoice.CurrencyCode) !== "NZD"
    || text(invoiceRow.LineAmountTypes) !== "Exclusive"
  ) {
    throw new PaymentClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The legacy Xero invoice currency or line amount type is not supported.",
    );
  }
  if (invoice.Status !== "VOIDED") {
    throw new PaymentClaimLegacyAdoptionError(
      "predecessor_not_voided",
      "The previous Xero invoice is no longer confirmed as voided.",
    );
  }
  if (moneyMinor(invoice.AmountPaid ?? 0) !== 0 || array(invoice.Payments).length > 0) {
    throw new PaymentClaimLegacyAdoptionError(
      "payments_exist",
      "The previous Xero invoice has payments and cannot be replaced.",
    );
  }
  if (
    moneyMinor(invoice.AmountCredited ?? 0) !== 0
    || array(invoiceRow.CreditNotes).length > 0
  ) {
    throw new PaymentClaimLegacyAdoptionError(
      "credits_exist",
      "The previous Xero invoice has credits and cannot be replaced.",
    );
  }
}

export async function adoptLegacyVoidedPaymentClaimIfNeeded(params: {
  organizationId: string;
  claimId: string;
  actorUserId: string;
}) {
  const resolution = await resolvePaymentClaimXeroReadinessContext({
    organizationId: params.organizationId,
    claimId: params.claimId,
  });
  if (!resolution.snapshot) return { adopted: false, applicable: false };
  const readiness = evaluatePaymentClaimXeroReadinessSnapshot(resolution.snapshot);
  if (!readiness.ready) {
    throw new PaymentClaimLegacyAdoptionError(
      "not_legacy",
      readiness.blockers[0]?.message ?? "The Payment Claim is not ready.",
    );
  }
  const document = resolution.snapshot.accountingDocuments[0] as Row | undefined;
  if (
    !document
    || document.integration_contract === "payment_claim_revision_v1"
    || !text(document.external_document_id)
  ) {
    return { adopted: false, applicable: false };
  }
  if (text(document.normalized_external_status) !== "voided") {
    throw new PaymentClaimLegacyAdoptionError(
      "predecessor_not_voided",
      "The previous Xero invoice is not locally classified as voided. Refresh it first.",
    );
  }

  const invoiceId = text(document.external_document_id);
  const invoiceNumber = text(document.external_document_number);
  if (!invoiceNumber) {
    throw new PaymentClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The linked legacy Xero invoice number is missing.",
    );
  }

  let tokenState;
  try {
    tokenState = await getFreshXeroAccessToken(params.organizationId);
  } catch {
    throw new PaymentClaimLegacyAdoptionError(
      "xero_connection_unavailable",
      "Reconnect Xero before pushing this Payment Claim.",
    );
  }
  const tenantId = text(tokenState.connection.tenant_id);
  if (
    tokenState.connection.id !== document.accounting_connection_id
    || tenantId !== document.tenant_id
  ) {
    throw new PaymentClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The linked Xero organisation does not match the legacy invoice.",
    );
  }

  let invoices: XeroInvoice[];
  try {
    invoices = await getXeroInvoice(
      tokenState.tokenSet.access_token,
      tenantId,
      invoiceId,
    );
  } catch (error) {
    if (error instanceof XeroRequestError && error.status === 404) {
      throw new PaymentClaimLegacyAdoptionError(
        "remote_invoice_not_found",
        "The linked Xero Sales Invoice could not be found. Its predecessor state is not proven.",
      );
    }
    throw new PaymentClaimLegacyAdoptionError(
      "xero_connection_unavailable",
      "Xero could not verify the previous Sales Invoice.",
    );
  }
  if (invoices.length !== 1) {
    throw new PaymentClaimLegacyAdoptionError(
      "remote_invoice_not_found",
      "The linked Xero Sales Invoice could not be conclusively retrieved.",
    );
  }
  const invoice = invoices[0];
  validateEligiblePredecessor({ invoice, invoiceId, invoiceNumber });

  const exactMatches = await findXeroInvoicesByNumber({
    accessToken: tokenState.tokenSet.access_token,
    tenantId,
    invoiceNumber,
    type: "ACCREC",
  });
  if (
    exactMatches.length !== 1
    || exactMatches[0].InvoiceID !== invoiceId
  ) {
    throw new PaymentClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The legacy Xero invoice number is missing or ambiguous in the configured organisation.",
    );
  }

  const payloadSnapshot = reconstructedPayload(invoice);
  const lines = adoptionLines(invoice, params.claimId);
  const snapshotPayload = buildPaymentClaimXeroPayloadFromResolvedSnapshot(resolution.snapshot);
  const currentStateHash = buildPaymentClaimXeroCurrentStateHashFromPayload({
    snapshot: resolution.snapshot,
    payloadResult: snapshotPayload,
  }).hash;
  const subtotalMinor = moneyMinor(invoice.SubTotal);
  const taxMinor = moneyMinor(invoice.TotalTax);
  const totalMinor = moneyMinor(invoice.Total);
  const claim = resolution.snapshot.claim;
  if (
    Number.isFinite(Number(claim.total_payable))
    && moneyMinor(claim.total_payable) !== totalMinor
  ) {
    throw new PaymentClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The legacy Xero invoice total does not match the Payment Claim.",
    );
  }
  const sourceEvidence = {
    provenance: "legacy_adoption",
    evidenceQuality: "reconstructed_from_current_xero_and_tradesstack",
    claim: {
      id: claim.id,
      claimNumber: claim.claim_number,
      updatedAt: claim.updated_at,
    },
    xero: invoice,
  };
  const commercialSnapshot = {
    provenance: "legacy_adoption",
    evidenceQuality: "reconstructed_from_current_xero_and_tradesstack",
    commercialClaimNumber: claim.claim_number,
    invoiceDate: payloadSnapshot.Date,
    dueDate: payloadSnapshot.DueDate,
    subtotalMinor,
    taxMinor,
    totalMinor,
    currentStateHash,
  };
  const contact = row(invoice.Contact);
  const contactSnapshot = {
    provenance: "legacy_adoption",
    contactId: text(contact.ContactID),
    name: text(contact.Name),
    tenantId,
  };
  const routingSnapshot = {
    provenance: "legacy_adoption",
    lines: lines.map((line) => line.accountSnapshot),
  };
  const taxSnapshot = {
    provenance: "legacy_adoption",
    lines: lines.map((line) => line.taxSnapshot),
  };
  const sourceEvidenceHash = hashAccountingEvidence(sourceEvidence, LEGACY_ADOPTION_SCHEMA);
  const commercialHash = hashAccountingEvidence(commercialSnapshot, LEGACY_ADOPTION_SCHEMA);
  const linesHash = hashAccountingLines(lines);
  const payloadHash = hashAccountingEvidence(payloadSnapshot, LEGACY_ADOPTION_SCHEMA);
  const providerContentHash = payloadHash;
  const settlementHash = hashAccountingEvidence({
    amountPaid: invoice.AmountPaid ?? 0,
    amountCredited: invoice.AmountCredited ?? 0,
    payments: invoice.Payments ?? [],
    creditNotes: array((invoice as Row).CreditNotes),
  });
  const confirmationPreviewHash = hashAccountingEvidence({
    sourceEvidenceHash,
    commercialHash,
    linesHash,
    payloadHash,
    providerContentHash,
    settlementHash,
  }, LEGACY_ADOPTION_SCHEMA);
  const admin = createAdminSupabaseClient() as unknown as Admin;
  const result = await admin.rpc(
    "adopt_legacy_voided_payment_claim_phase2c",
    {
      p_input: {
        organizationId: params.organizationId,
        projectId: resolution.snapshot.project.id,
        claimId: params.claimId,
        adoptedBy: params.actorUserId,
        sourceOptimisticRevision: claim.updated_at,
        connectionId: tokenState.connection.id,
        tenantId,
        accountingDocumentId: document.id,
        externalDocumentId: invoiceId,
        externalDocumentNumber: invoiceNumber,
        providerUpdatedAt: xeroUpdatedAt(invoice.UpdatedDateUTC),
        correlationId: randomUUID(),
        evidenceQuality: "reconstructed_from_current_xero_and_tradesstack",
        canonicalSchemaVersion: LEGACY_ADOPTION_SCHEMA,
        currencyCode: payloadSnapshot.CurrencyCode,
        lineAmountType: payloadSnapshot.LineAmountTypes,
        subtotalMinor,
        taxMinor,
        totalMinor,
        sourceEvidenceHash,
        commercialHash,
        linesHash,
        payloadHash,
        providerContentHash,
        settlementHash,
        confirmationPreviewHash,
        commercialSnapshot,
        contactSnapshot,
        routingSnapshot,
        taxSnapshot,
        payloadSnapshot,
        lines,
        rawObservation: invoice,
      },
    },
  );
  if (result.error) {
    const supportReference = randomUUID();
    const safe = classifyAdoptionRpcError(result.error);
    console.error("Legacy Payment Claim adoption RPC failed.", {
      supportReference,
      organizationId: params.organizationId,
      claimId: params.claimId,
      accountingDocumentId: text(document.id),
      safeCode: safe.code,
      sqlstate: result.error.code ?? null,
      failedConstraint: failedConstraint(result.error),
    });
    await persistAdoptionRpcFailure({
      admin,
      organizationId: params.organizationId,
      claimId: params.claimId,
      accountingDocumentId: text(document.id),
      supportReference,
      safeCode: safe.code,
      error: result.error,
    });
    throw new PaymentClaimLegacyAdoptionError(
      safe.code,
      safe.message,
      supportReference,
    );
  }
  if (!result.data?.accountingRevisionId) {
    const supportReference = randomUUID();
    const rpcError: RpcError = {
      code: "PGRST_UNEXPECTED_RESULT",
      message: "Legacy adoption RPC returned no accountingRevisionId.",
    };
    const safe = classifyAdoptionRpcError(rpcError);
    await persistAdoptionRpcFailure({
      admin,
      organizationId: params.organizationId,
      claimId: params.claimId,
      accountingDocumentId: text(document.id),
      supportReference,
      safeCode: safe.code,
      error: rpcError,
    });
    throw new PaymentClaimLegacyAdoptionError(
      safe.code,
      safe.message,
      supportReference,
    );
  }
  return {
    applicable: true,
    adopted: result.data.adopted === true,
    accountingDocumentId: String(result.data.accountingDocumentId),
    accountingRevisionId: String(result.data.accountingRevisionId),
  };
}
