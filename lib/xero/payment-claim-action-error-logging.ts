import "server-only";

import { randomUUID } from "node:crypto";

import type { PaymentClaimXeroPayloadError } from "@/lib/xero/payment-claim-sales-invoice-payload";

export function logPaymentClaimProposalValidationError(params: {
  error: PaymentClaimXeroPayloadError;
  supportReference: string | null;
  identity?: { organizationId: string | null; claimId: string };
}) {
  const reference = params.supportReference ?? randomUUID();
  console.error("Payment Claim Xero proposal validation failed.", {
    errorClass: params.error.name,
    errorCode: params.error.code,
    organizationId:
      params.identity?.organizationId
      ?? params.error.diagnostics?.organizationId
      ?? null,
    claimId: params.identity?.claimId ?? params.error.diagnostics?.claimId ?? null,
    resolvedAccountTaxType: params.error.diagnostics?.accountTaxType ?? null,
    selectedTaxType: params.error.diagnostics?.selectedTaxType ?? null,
    selectedTaxRateId: params.error.diagnostics?.selectedTaxRateId ?? null,
    selectedEffectiveRate: params.error.diagnostics?.selectedEffectiveRate ?? null,
    supportReference: reference,
  });
  return reference;
}
