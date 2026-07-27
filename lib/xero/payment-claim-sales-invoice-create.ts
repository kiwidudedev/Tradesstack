import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  createXeroInvoices,
  findXeroInvoicesByNumber,
  getXeroInvoice,
  XeroRequestError,
} from "@/lib/xero/client";
import {
  buildPaymentClaimXeroPayloadFromResolvedSnapshot,
  PaymentClaimXeroPayloadError,
} from "@/lib/xero/payment-claim-sales-invoice-payload";
import { buildPaymentClaimXeroCurrentStateHashFromPayload } from "@/lib/xero/payment-claim-sales-invoice-hash";
import {
  evaluatePaymentClaimXeroReadinessSnapshot,
  resolvePaymentClaimXeroReadinessContext,
} from "@/lib/xero/payment-claim-readiness";
import { hasXeroInvoiceScope, XERO_INVOICE_SCOPE_RECONNECT_MESSAGE } from "@/lib/xero/scopes";
import { getFreshXeroAccessToken } from "@/lib/xero/service";
import type { XeroInvoice } from "@/lib/xero/types";

type Row = Record<string, unknown>;
type UntypedAdmin = {
  // Stage 1 polymorphic accounting-document fields are not present in every
  // generated-client build used by this workspace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type InitialXeroSalesInvoiceCreateResult = {
  invoiceId: string;
  invoiceNumber: string;
  rawStatus: string;
  normalizedStatus: string;
  recovered: boolean;
  idempotencyKey: string;
};

export class InitialXeroSalesInvoiceCreateError extends Error {
  readonly code:
    | "document_not_found"
    | "invalid_document"
    | "invoice_already_exists"
    | "stale_job"
    | "not_ready"
    | "connection_mismatch"
    | "missing_invoice_identity"
    | "ambiguous_recovery"
    | "invalid_xero_invoice";
  readonly isRetryable: boolean;

  constructor(
    code: InitialXeroSalesInvoiceCreateError["code"],
    message: string,
    options?: { isRetryable?: boolean },
  ) {
    super(message);
    this.name = "InitialXeroSalesInvoiceCreateError";
    this.code = code;
    this.isRetryable = options?.isRetryable ?? false;
  }
}

function adminDb(client: Awaited<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as UntypedAdmin;
}

function readString(value: Row, ...keys: string[]) {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return null;
}

function readMoney(value: Row, ...keys: string[]) {
  for (const key of keys) {
    const numeric = Number(value[key]);
    if (Number.isFinite(numeric)) return Math.round(numeric * 100) / 100;
  }
  return null;
}

function normalizeInitialProviderStatus(rawStatus: string) {
  switch (rawStatus.toUpperCase()) {
    case "DRAFT": return "draft";
    case "SUBMITTED": return "awaiting_approval";
    case "AUTHORISED": return "awaiting_payment";
    case "VOIDED": return "voided";
    case "DELETED": return "deleted";
    default: return "unknown";
  }
}

export function buildInitialXeroSalesInvoiceIdempotencyKey(params: {
  organizationId: string;
  accountingDocumentId: string;
}) {
  return createHash("sha256")
    .update(`xero:accrec:create:${params.organizationId}:${params.accountingDocumentId}`)
    .digest("hex");
}

function isUncertainCreateError(error: unknown) {
  return !(error instanceof XeroRequestError)
    || error.isRetryable
    || error.status === 408;
}

function validateReturnedInvoice(params: {
  invoice: XeroInvoice;
  expectedInvoiceNumber: string;
  expectedInvoiceId?: string | null;
}) {
  const row = params.invoice as Row;
  const invoiceId = readString(row, "InvoiceID", "invoiceID");
  const invoiceNumber = readString(row, "InvoiceNumber", "invoiceNumber");
  const type = readString(row, "Type", "type");
  if (
    !invoiceId
    || invoiceNumber !== params.expectedInvoiceNumber
    || type !== "ACCREC"
    || (params.expectedInvoiceId && invoiceId !== params.expectedInvoiceId)
  ) {
    throw new InitialXeroSalesInvoiceCreateError(
      "invalid_xero_invoice",
      "Xero returned an invoice that does not match the Payment Claim create request.",
    );
  }
  return { row, invoiceId, invoiceNumber };
}

async function persistCreatedInvoiceState(params: {
  db: UntypedAdmin;
  documentId: string;
  invoice: XeroInvoice;
  expectedInvoiceNumber: string;
  expectedInvoiceId?: string | null;
  exportedAt: string;
}) {
  const validated = validateReturnedInvoice(params);
  const rawStatus = readString(validated.row, "Status", "status") ?? "UNKNOWN";
  const total = readMoney(validated.row, "Total", "total");
  const totalTax = readMoney(validated.row, "TotalTax", "totalTax");
  if (total === null || totalTax === null) {
    throw new InitialXeroSalesInvoiceCreateError(
      "invalid_xero_invoice",
      "Xero returned an invoice without valid exported totals.",
    );
  }
  const normalizedStatus = normalizeInitialProviderStatus(rawStatus);
  let updateQuery = params.db
    .from("organization_accounting_documents")
    .update({
      external_document_id: validated.invoiceId,
      external_document_number: validated.invoiceNumber,
      amount_exported: total,
      tax_exported: totalTax,
      exported_at: params.exportedAt,
      raw_external_status: rawStatus,
      normalized_external_status: normalizedStatus,
    })
    .eq("id", params.documentId);
  updateQuery = params.expectedInvoiceId
    ? updateQuery.eq("external_document_id", params.expectedInvoiceId)
    : updateQuery.is("external_document_id", null);
  const updateResult = await updateQuery.select("id").maybeSingle();
  if (updateResult.error) throw new Error(updateResult.error.message);
  if (!updateResult.data) {
    throw new InitialXeroSalesInvoiceCreateError(
      "invoice_already_exists",
      "The accounting document InvoiceID changed while the Xero create result was being persisted.",
    );
  }
  return {
    invoiceId: validated.invoiceId,
    invoiceNumber: validated.invoiceNumber,
    rawStatus,
    normalizedStatus,
  };
}

export async function createInitialXeroSalesInvoice(params: {
  organizationId: string;
  accountingDocumentId: string;
  workerJobId: string;
  queuedHash?: string;
}): Promise<InitialXeroSalesInvoiceCreateResult> {
  const db = adminDb(await createAdminSupabaseClient());
  const documentResult = await db
    .from("organization_accounting_documents")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.accountingDocumentId)
    .maybeSingle();
  if (documentResult.error) throw new Error(documentResult.error.message);
  const document = documentResult.data as Row | null;
  if (!document) {
    throw new InitialXeroSalesInvoiceCreateError("document_not_found", "Accounting document not found.");
  }
  if (
    document.provider !== "xero"
    || document.local_document_type !== "project_claim"
    || !readString(document, "project_claim_id")
    || document.local_document_id != null
    || document.current_version_id != null
  ) {
    throw new InitialXeroSalesInvoiceCreateError(
      "invalid_document",
      "The accounting document does not represent a Payment Claim.",
    );
  }
  if (readString(document, "external_document_id")) {
    throw new InitialXeroSalesInvoiceCreateError(
      "invoice_already_exists",
      "This Payment Claim already has a Xero InvoiceID. Initial creation is permanently disabled.",
    );
  }

  const claimId = readString(document, "project_claim_id")!;
  const resolution = await resolvePaymentClaimXeroReadinessContext({
    organizationId: params.organizationId,
    claimId,
  });
  if (!resolution.snapshot) {
    throw new InitialXeroSalesInvoiceCreateError("not_ready", "Payment Claim is not ready for Xero.");
  }
  const readiness = evaluatePaymentClaimXeroReadinessSnapshot(resolution.snapshot);
  if (!readiness.ready) {
    throw new InitialXeroSalesInvoiceCreateError("not_ready", "Payment Claim is not ready for Xero.");
  }

  let payloadResult;
  try {
    payloadResult = buildPaymentClaimXeroPayloadFromResolvedSnapshot(resolution.snapshot);
  } catch (error) {
    if (error instanceof PaymentClaimXeroPayloadError) {
      throw new InitialXeroSalesInvoiceCreateError("not_ready", error.message);
    }
    throw error;
  }
  if (params.queuedHash != null) {
    const { hash: currentHash } = buildPaymentClaimXeroCurrentStateHashFromPayload({
      snapshot: resolution.snapshot,
      payloadResult,
    });
    if (!params.queuedHash.trim() || params.queuedHash !== currentHash) {
      throw new InitialXeroSalesInvoiceCreateError(
        "stale_job",
        "The queued Payment Claim state is stale; no Xero invoice was created.",
      );
    }
  }

  const tokenState = await getFreshXeroAccessToken(params.organizationId);
  if (
    tokenState.connection.id !== document.accounting_connection_id
    || tokenState.connection.tenant_id !== document.tenant_id
    || !hasXeroInvoiceScope(tokenState.connection.scope)
  ) {
    throw new InitialXeroSalesInvoiceCreateError(
      "connection_mismatch",
      !hasXeroInvoiceScope(tokenState.connection.scope)
        ? XERO_INVOICE_SCOPE_RECONNECT_MESSAGE
        : "The Xero connection or tenant no longer matches the accounting document.",
    );
  }

  const idempotencyKey = buildInitialXeroSalesInvoiceIdempotencyKey({
    organizationId: params.organizationId,
    accountingDocumentId: params.accountingDocumentId,
  });
  const invoiceNumber = payloadResult.payload.InvoiceNumber;
  let created: XeroInvoice;
  let recovered = false;
  try {
    const rows = await createXeroInvoices({
      accessToken: tokenState.tokenSet.access_token,
      tenantId: document.tenant_id as string,
      invoices: [payloadResult.payload],
      idempotencyKey,
      fallbackMessage: "Unable to create the Xero Sales Invoice.",
    });
    if (!rows[0] || !readString(rows[0] as Row, "InvoiceID", "invoiceID")) {
      throw new InitialXeroSalesInvoiceCreateError(
        "missing_invoice_identity",
        "Xero did not return a verifiable Sales Invoice identity.",
        { isRetryable: true },
      );
    }
    created = rows[0];
  } catch (error) {
    if (!isUncertainCreateError(error)) throw error;
    const candidates = await findXeroInvoicesByNumber({
      accessToken: tokenState.tokenSet.access_token,
      tenantId: document.tenant_id as string,
      invoiceNumber,
      type: "ACCREC",
    });
    const matches = candidates.filter((invoice) =>
      invoice.Type === "ACCREC" && invoice.InvoiceNumber === invoiceNumber && Boolean(invoice.InvoiceID),
    );
    if (matches.length !== 1) {
      throw new InitialXeroSalesInvoiceCreateError(
        matches.length > 1 ? "ambiguous_recovery" : "missing_invoice_identity",
        matches.length > 1
          ? "More than one Xero ACCREC invoice matched the Payment Claim number."
          : "The Xero create result is uncertain and no matching ACCREC invoice is currently visible.",
        { isRetryable: matches.length === 0 },
      );
    }
    created = matches[0];
    recovered = true;
  }

  const exportedAt = new Date().toISOString();
  const initialState = await persistCreatedInvoiceState({
    db,
    documentId: params.accountingDocumentId,
    invoice: created,
    expectedInvoiceNumber: invoiceNumber,
    exportedAt,
  });
  const refreshedRows = await getXeroInvoice(
    tokenState.tokenSet.access_token,
    document.tenant_id as string,
    initialState.invoiceId,
  );
  if (!refreshedRows[0]) {
    throw new InitialXeroSalesInvoiceCreateError(
      "invalid_xero_invoice",
      "The created Xero Sales Invoice could not be refreshed.",
    );
  }
  const refreshedState = await persistCreatedInvoiceState({
    db,
    documentId: params.accountingDocumentId,
    invoice: refreshedRows[0],
    expectedInvoiceNumber: invoiceNumber,
    expectedInvoiceId: initialState.invoiceId,
    exportedAt,
  });

  return { ...refreshedState, recovered, idempotencyKey };
}
