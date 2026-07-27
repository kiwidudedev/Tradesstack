import { isNewZealandCountry } from "@/lib/jurisdiction/country";

export type PaymentClaimStatutoryJurisdiction = "NZ";

export type StatutoryDocument = {
  id: string;
  displayName: string;
  publicPath: string;
  jurisdiction: PaymentClaimStatutoryJurisdiction;
  version: string;
};

const NZ_PAYMENT_CLAIM_FORM_1: StatutoryDocument = {
  id: "nz-payment-claim-form-1",
  displayName: "Form 1 - Information that must accompany all payment claims",
  publicPath: "/legal/nz/payment-claims/form-1-information-that-must-accompany-all-payment-claims-v2026-07.pdf",
  jurisdiction: "NZ",
  version: "2026-07",
};

export function getPaymentClaimStatutoryDocuments(input: {
  organisationCountry: string | null | undefined;
}): StatutoryDocument[] {
  if (!isNewZealandCountry(input.organisationCountry)) {
    return [];
  }

  return [NZ_PAYMENT_CLAIM_FORM_1];
}
