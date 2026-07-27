export type ProjectClaimPaymentStatus = "Draft" | "Submitted" | "Unpaid" | "Paid" | "Overdue" | "Cancelled";

export type ProjectClaimPaymentProjectionInput = {
  currentStatus: ProjectClaimPaymentStatus;
  dueDate: string | null;
  claimAmount: number;
  totalPayable: number;
  invoiceTotal: number;
  amountPaid: number;
  amountDue: number;
  hasValidPaidEvidence: boolean;
  attentionRequired: boolean;
  asOfDate: string;
};

export type ProjectClaimPaymentProjection = {
  shouldApply: boolean;
  status: ProjectClaimPaymentStatus;
  paidAmount: number | null;
  reason: "protected_status" | "attention_required" | "valid_payment_state";
};

const PAYMENT_ELIGIBLE_STATUSES = new Set<ProjectClaimPaymentStatus>([
  "Submitted",
  "Unpaid",
  "Paid",
  "Overdue",
]);

function moneyCents(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative amount.`);
  return Math.round(value * 100);
}

function centsToMoney(value: number) {
  return Math.round(value) / 100;
}

export function projectXeroPaidAmountToClaimBasis(input: {
  claimAmount: number;
  totalPayable: number;
  invoiceTotal: number;
  amountPaid: number;
}) {
  const claimCents = moneyCents(input.claimAmount, "claimAmount");
  const totalPayableCents = moneyCents(input.totalPayable, "totalPayable");
  const invoiceTotalCents = moneyCents(input.invoiceTotal, "invoiceTotal");
  const paidCents = moneyCents(input.amountPaid, "amountPaid");

  if (totalPayableCents !== invoiceTotalCents) {
    throw new Error("The Xero invoice total does not match the authoritative Payment Claim total.");
  }
  if (invoiceTotalCents === 0) return 0;

  const numerator = BigInt(paidCents) * BigInt(claimCents);
  const roundedClaimBasisCents = Number(
    (numerator + BigInt(Math.floor(invoiceTotalCents / 2))) / BigInt(invoiceTotalCents),
  );
  return centsToMoney(Math.min(claimCents, roundedClaimBasisCents));
}

export function deriveProjectClaimPaymentProjection(
  input: ProjectClaimPaymentProjectionInput,
): ProjectClaimPaymentProjection {
  if (!PAYMENT_ELIGIBLE_STATUSES.has(input.currentStatus)) {
    return { shouldApply: false, status: input.currentStatus, paidAmount: null, reason: "protected_status" };
  }
  if (input.attentionRequired) {
    return { shouldApply: false, status: input.currentStatus, paidAmount: null, reason: "attention_required" };
  }

  const amountDueCents = moneyCents(input.amountDue, "amountDue");
  moneyCents(input.amountPaid, "amountPaid");
  let status: ProjectClaimPaymentStatus;
  if (amountDueCents > 0) {
    status = input.dueDate && input.dueDate < input.asOfDate ? "Overdue" : "Unpaid";
  } else if (input.hasValidPaidEvidence) {
    status = "Paid";
  } else {
    return { shouldApply: false, status: input.currentStatus, paidAmount: null, reason: "attention_required" };
  }

  return {
    shouldApply: true,
    status,
    paidAmount: projectXeroPaidAmountToClaimBasis(input),
    reason: "valid_payment_state",
  };
}
