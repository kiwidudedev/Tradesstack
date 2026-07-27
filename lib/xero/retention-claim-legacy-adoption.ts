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
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { RetentionClaimXeroPayload } from "@/lib/xero/retention-claim-sales-invoice-payload";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 2C adoption objects intentionally precede generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { code?: string; message: string } | null }>;
};

const SCHEMA = "accounting-evidence-v1:retention-claim-legacy-adoption-v1";

export class RetentionClaimLegacyAdoptionError extends Error {
  constructor(
    readonly code:
      | "not_legacy"
      | "connection_unavailable"
      | "remote_invoice_not_found"
      | "remote_identity_mismatch"
      | "predecessor_not_voided"
      | "payments_exist"
      | "credits_exist"
      | "legacy_adoption_failed",
    message: string,
    readonly supportReference: string | null = null,
  ) {
    super(message);
    this.name = "RetentionClaimLegacyAdoptionError";
  }
}

function admin() {
  return createAdminSupabaseClient() as unknown as Admin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function minor(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RetentionClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "Xero returned invalid historical Retention Claim totals.",
    );
  }
  return Math.round(number * 100);
}

function date(value: unknown) {
  if (typeof value !== "string") return "";
  const iso = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const xero = value.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  return xero ? new Date(Number(xero[1])).toISOString().slice(0, 10) : "";
}

function timestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const xero = value.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  if (xero) return new Date(Number(xero[1])).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function validate(invoice: XeroInvoice, invoiceId: string, invoiceNumber: string) {
  const row = invoice as Row;
  if (
    invoice.InvoiceID !== invoiceId
    || invoice.InvoiceNumber !== invoiceNumber
    || invoice.Type !== "ACCREC"
    || text(invoice.CurrencyCode) !== "NZD"
    || text(row.LineAmountTypes) !== "Exclusive"
  ) {
    throw new RetentionClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The historical Xero invoice identity does not match the linked Retention Claim.",
    );
  }
  if (invoice.Status !== "VOIDED") {
    throw new RetentionClaimLegacyAdoptionError(
      "predecessor_not_voided",
      "The historical Retention Claim invoice is no longer confirmed as voided.",
    );
  }
  if (minor(invoice.AmountPaid ?? 0) !== 0 || array(invoice.Payments).length > 0) {
    throw new RetentionClaimLegacyAdoptionError(
      "payments_exist",
      "Payments prevent replacement of the historical Retention Claim invoice.",
    );
  }
  if (
    minor(invoice.AmountCredited ?? 0) !== 0
    || array(row.CreditNotes).length > 0
  ) {
    throw new RetentionClaimLegacyAdoptionError(
      "credits_exist",
      "Credits prevent replacement of the historical Retention Claim invoice.",
    );
  }
}

export async function adoptLegacyVoidedRetentionClaimIfNeeded(params: {
  organizationId: string;
  retentionClaimId: string;
  actorUserId: string;
}) {
  const db = admin();
  const [claimResult, documentResult] = await Promise.all([
    db.from("retention_claims").select("*")
      .eq("organization_id", params.organizationId)
      .eq("id", params.retentionClaimId)
      .maybeSingle(),
    db.from("organization_accounting_documents").select("*")
      .eq("organization_id", params.organizationId)
      .eq("provider", "xero")
      .eq("local_document_type", "retention_claim")
      .eq("retention_claim_id", params.retentionClaimId)
      .maybeSingle(),
  ]);
  if (claimResult.error || !claimResult.data) {
    throw new RetentionClaimLegacyAdoptionError(
      "not_legacy",
      "The Retention Claim was not found.",
    );
  }
  if (documentResult.error) throw new Error(documentResult.error.message);
  const claim = claimResult.data as Row;
  const document = documentResult.data as Row | null;
  if (
    !document
    || document.integration_contract === "retention_claim_revision_v1"
    || !text(document.external_document_id)
  ) {
    return { applicable: false, adopted: false };
  }
  if (!["voided", "deleted"].includes(text(document.normalized_external_status))) {
    throw new RetentionClaimLegacyAdoptionError(
      "predecessor_not_voided",
      "Refresh the historical Retention Claim invoice before pushing it again.",
    );
  }
  const invoiceId = text(document.external_document_id);
  const invoiceNumber = text(document.external_document_number);
  if (!invoiceNumber) {
    throw new RetentionClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The historical Retention Claim invoice number is missing.",
    );
  }
  let token;
  try {
    token = await getFreshXeroAccessToken(params.organizationId);
  } catch {
    throw new RetentionClaimLegacyAdoptionError(
      "connection_unavailable",
      "Reconnect Xero before pushing this Retention Claim.",
    );
  }
  if (
    token.connection.id !== document.accounting_connection_id
    || token.connection.tenant_id !== document.tenant_id
  ) {
    throw new RetentionClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The selected Xero organisation does not match the historical Retention Claim invoice.",
    );
  }
  let invoice: XeroInvoice | undefined;
  try {
    invoice = (await getXeroInvoice(
      token.tokenSet.access_token,
      String(document.tenant_id),
      invoiceId,
    ))[0];
  } catch (error) {
    if (error instanceof XeroRequestError && error.status === 404) {
      throw new RetentionClaimLegacyAdoptionError(
        "remote_invoice_not_found",
        "The historical Retention Claim invoice could not be found. Permanent loss is not proven.",
      );
    }
    throw new RetentionClaimLegacyAdoptionError(
      "connection_unavailable",
      "Xero could not verify the historical Retention Claim invoice.",
    );
  }
  if (!invoice) {
    throw new RetentionClaimLegacyAdoptionError(
      "remote_invoice_not_found",
      "The historical Retention Claim invoice could not be conclusively retrieved.",
    );
  }
  validate(invoice, invoiceId, invoiceNumber);
  const matches = await findXeroInvoicesByNumber({
    accessToken: token.tokenSet.access_token,
    tenantId: String(document.tenant_id),
    invoiceNumber,
    type: "ACCREC",
  });
  if (matches.length !== 1 || matches[0].InvoiceID !== invoiceId) {
    throw new RetentionClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The historical Retention Claim invoice number is missing or ambiguous in Xero.",
    );
  }

  const contact = object(invoice.Contact);
  const payload: RetentionClaimXeroPayload = {
    Type: "ACCREC",
    Status: "AUTHORISED",
    Contact: { ContactID: text(contact.ContactID) },
    Date: date(invoice.Date),
    DueDate: date(invoice.DueDate),
    LineAmountTypes: "Exclusive",
    LineItems: array(invoice.LineItems).map((value) => {
      const line = object(value);
      if (Number(line.Quantity) !== 1) {
        throw new RetentionClaimLegacyAdoptionError(
          "remote_identity_mismatch",
          "The historical Retention Claim invoice contains an unsupported line quantity.",
        );
      }
      return {
        Description: text(line.Description),
        Quantity: 1 as const,
        UnitAmount: Number(line.UnitAmount),
        AccountCode: text(line.AccountCode),
        TaxType: text(line.TaxType),
      };
    }),
    Reference: text((invoice as Row).Reference),
    CurrencyCode: "NZD",
    InvoiceNumber: invoiceNumber,
  };
  const lines = array(invoice.LineItems).map((value, index) => {
    const line = object(value);
    const lineAmountMinor = minor(line.LineAmount);
    const taxMinor = minor(line.TaxAmount);
    return {
      sequence: index + 1,
      lineKind: "retention",
      sourceLineType: "legacy_xero_invoice",
      sourceLineId: null,
      originatingPaymentClaimId: null,
      description: text(line.Description)
        || `Historical Retention Claim line ${index + 1}`,
      quantity: Number(line.Quantity),
      unitAmountMinor: minor(line.UnitAmount),
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
  const subtotalMinor = minor(invoice.SubTotal);
  const taxMinor = minor(invoice.TotalTax);
  const totalMinor = minor(invoice.Total);
  if (
    minor(claim.subtotal_excl_tax) !== subtotalMinor
    || subtotalMinor + taxMinor !== totalMinor
  ) {
    throw new RetentionClaimLegacyAdoptionError(
      "remote_identity_mismatch",
      "The historical Xero invoice total does not match the submitted Retention Claim.",
    );
  }
  const sourceEvidence = {
    provenance: "legacy_adoption",
    evidenceQuality: "reconstructed_from_current_xero_and_tradesstack",
    retentionClaim: {
      id: claim.id,
      claimNumber: claim.claim_number,
      submittedAt: claim.submitted_at,
      submissionStateHash: claim.submission_state_hash,
    },
    xero: invoice,
  };
  const commercialSnapshot = {
    provenance: "legacy_adoption",
    evidenceQuality: "reconstructed_from_current_xero_and_tradesstack",
    commercialClaimNumber: claim.claim_number,
    issueDate: payload.Date,
    dueDate: payload.DueDate,
    subtotalMinor,
    taxMinor,
    totalMinor,
    currentStateHash: claim.submission_state_hash,
  };
  const sourceEvidenceHash = hashAccountingEvidence(sourceEvidence, SCHEMA);
  const commercialHash = hashAccountingEvidence(commercialSnapshot, SCHEMA);
  const linesHash = hashAccountingLines(lines);
  const payloadHash = hashAccountingEvidence(payload, SCHEMA);
  const settlementHash = hashAccountingEvidence({
    amountPaid: invoice.AmountPaid ?? 0,
    amountCredited: invoice.AmountCredited ?? 0,
    payments: invoice.Payments ?? [],
    creditNotes: array((invoice as Row).CreditNotes),
  });
  const previewHash = hashAccountingEvidence({
    sourceEvidenceHash,
    commercialHash,
    linesHash,
    payloadHash,
    settlementHash,
  }, SCHEMA);
  const result = await db.rpc("adopt_legacy_voided_retention_claim_phase2c", {
    p_input: {
      organizationId: params.organizationId,
      projectId: claim.project_id,
      retentionClaimId: claim.id,
      adoptedBy: params.actorUserId,
      sourceOptimisticRevision: claim.submitted_at,
      connectionId: token.connection.id,
      tenantId: document.tenant_id,
      accountingDocumentId: document.id,
      externalDocumentId: invoiceId,
      externalDocumentNumber: invoiceNumber,
      providerUpdatedAt: timestamp(invoice.UpdatedDateUTC),
      correlationId: randomUUID(),
      canonicalSchemaVersion: SCHEMA,
      evidenceQuality: "reconstructed_from_current_xero_and_tradesstack",
      sourceEvidenceHash,
      commercialHash,
      linesHash,
      payloadHash,
      providerContentHash: payloadHash,
      settlementHash,
      confirmationPreviewHash: previewHash,
      commercialSnapshot,
      contactSnapshot: {
        provenance: "legacy_adoption",
        contactId: text(contact.ContactID),
        name: text(contact.Name),
        tenantId: document.tenant_id,
      },
      routingSnapshot: {
        provenance: "legacy_adoption",
        lines: lines.map((line) => line.accountSnapshot),
      },
      taxSnapshot: {
        provenance: "legacy_adoption",
        lines: lines.map((line) => line.taxSnapshot),
      },
      payloadSnapshot: payload,
      lines,
      subtotalMinor,
      taxMinor,
      totalMinor,
      rawObservation: invoice,
    },
  });
  if (result.error || !result.data?.accountingRevisionId) {
    const reference = randomUUID();
    try {
      await db.from("organization_accounting_operation_errors").insert({
        support_reference: reference,
        organization_id: params.organizationId,
        source_document_type: "retention_claim",
        source_document_id: params.retentionClaimId,
        accounting_document_id: document.id,
        operation: "legacy_retention_claim_adoption",
        safe_code: "legacy_adoption_failed",
        internal_sqlstate: result.error?.code ?? null,
        internal_message: result.error?.message
          ?? "Legacy Retention Claim adoption returned no revision identity.",
        internal_details: null,
        internal_hint: null,
        failed_constraint: result.error?.message
          .match(/constraint ["']([^"']+)["']/i)?.[1] ?? null,
      });
    } catch {
      // Preserve the safe support reference even if secondary evidence
      // persistence is unavailable.
    }
    throw new RetentionClaimLegacyAdoptionError(
      "legacy_adoption_failed",
      "TradesStack could not safely preserve the historical Retention Claim invoice.",
      reference,
    );
  }
  return {
    applicable: true,
    adopted: result.data.adopted === true,
    accountingDocumentId: String(result.data.accountingDocumentId),
    accountingRevisionId: String(result.data.accountingRevisionId),
  };
}
