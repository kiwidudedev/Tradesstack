export type PaymentClaimRegisterRow = {
  status: string;
  claim_amount: number | null;
  paid_amount: number | null;
};

export function derivePaymentClaimRegisterMetrics(claims: PaymentClaimRegisterRow[]) {
  const activeClaims = claims.filter((claim) => claim.status !== "Cancelled");
  const outstandingClaims = activeClaims.filter((claim) =>
    claim.status === "Submitted" || claim.status === "Unpaid" || claim.status === "Overdue");
  const dueClaims = activeClaims.filter((claim) => claim.status === "Submitted" || claim.status === "Unpaid");
  const paidClaims = activeClaims.filter((claim) => claim.status === "Paid");
  const overdueClaims = activeClaims.filter((claim) => claim.status === "Overdue");

  return {
    receivedToDate: activeClaims.reduce((sum, claim) => sum + Number(claim.paid_amount ?? 0), 0),
    outstanding: outstandingClaims.reduce(
      (sum, claim) => sum + Math.max(0, Number(claim.claim_amount ?? 0) - Number(claim.paid_amount ?? 0)),
      0,
    ),
    paidValue: paidClaims.reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0),
    dueValue: dueClaims.reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0),
    overdueValue: overdueClaims.reduce((sum, claim) => sum + Number(claim.claim_amount ?? 0), 0),
    paidClaimsCount: paidClaims.length,
    dueClaimsCount: dueClaims.length,
    overdueClaimsCount: overdueClaims.length,
    unpaidClaimsCount: outstandingClaims.length,
  };
}
