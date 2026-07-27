import "server-only";

import { createHash } from "node:crypto";
import {
  buildPaymentClaimXeroPayloadFromResolvedSnapshot,
  type PaymentClaimXeroPayloadResult,
} from "@/lib/xero/payment-claim-sales-invoice-payload";
import type { PaymentClaimXeroReadinessSnapshot } from "@/lib/xero/payment-claim-readiness";

type Row = Record<string, unknown>;

function requiredIdentity(row: Row | null, field: string) {
  const value = row?.[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Cannot hash Payment Claim Xero state without ${field}.`);
  }
  return value.trim();
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function persistedCents(row: Row, field: string) {
  const value = Number(row[field]);
  if (!Number.isFinite(value)) throw new Error(`Cannot hash Payment Claim Xero state without ${field}.`);
  return Math.round(value * 100);
}

export function buildPaymentClaimXeroCurrentStateHashFromPayload(params: {
  snapshot: PaymentClaimXeroReadinessSnapshot;
  payloadResult: PaymentClaimXeroPayloadResult;
}) {
  const { snapshot, payloadResult } = params;
  const { payload, reconciliation } = payloadResult;
  const revenueLine = payload.LineItems[0];
  const retentionLine = payload.LineItems[1] ?? null;
  if (!revenueLine) throw new Error("Cannot hash a Payment Claim payload without its revenue line.");

  // Keep this intentionally narrow: it represents only values that can alter
  // the authoritative ACCREC payload, plus the local identities behind it.
  const canonicalState = {
    version: 1,
    claimId: requiredIdentity(snapshot.claim, "id"),
    projectId: requiredIdentity(snapshot.project, "id"),
    clientId: requiredIdentity(snapshot.client, "id"),
    claimNumber: payload.InvoiceNumber,
    claimTitle: String(snapshot.claim.claim_title ?? "").trim(),
    reference: payload.Reference,
    invoiceDate: payload.Date,
    dueDate: payload.DueDate,
    currencyCode: payload.CurrencyCode,
    claimStatus: String(snapshot.claim.status ?? "").trim(),
    financialsInCents: {
      claimAmount: persistedCents(snapshot.claim, "claim_amount"),
      retentionWithheld: persistedCents(snapshot.claim, "retention_withheld_amount"),
      retentionReleased: persistedCents(snapshot.claim, "retention_released_amount"),
      signedRetention: toCents(reconciliation.signedRetentionAmount),
      netClaimExcludingTax: persistedCents(snapshot.claim, "net_claim_excl_gst"),
      tax: persistedCents(snapshot.claim, "gst_amount"),
      totalPayable: persistedCents(snapshot.claim, "total_payable"),
    },
    contactId: payload.Contact.ContactID,
    salesAccountCode: revenueLine.AccountCode,
    retentionAccountCode: retentionLine ? retentionLine.AccountCode : null,
    taxType: revenueLine.TaxType,
    lineAmountTypes: payload.LineAmountTypes,
    status: payload.Status,
  };
  const hash = createHash("sha256").update(JSON.stringify(canonicalState)).digest("hex");
  return { hash, canonicalState };
}

export function buildPaymentClaimXeroCurrentStateHash(
  snapshot: PaymentClaimXeroReadinessSnapshot,
) {
  return buildPaymentClaimXeroCurrentStateHashFromPayload({
    snapshot,
    payloadResult: buildPaymentClaimXeroPayloadFromResolvedSnapshot(snapshot),
  });
}
