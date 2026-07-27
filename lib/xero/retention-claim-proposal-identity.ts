export function resolveRetentionClaimProposalInvoiceNumber(input: {
  operation: string;
  claimNumber: string;
  activeInvoiceNumber?: string | null;
  replacementNumber?: string | null;
}) {
  if (input.operation === "UPDATE_EXISTING_INVOICE") {
    const activeInvoiceNumber = input.activeInvoiceNumber?.trim();
    if (!activeInvoiceNumber) {
      throw new Error(
        "The active Xero invoice number is required for a cumulative Retention update.",
      );
    }
    return activeInvoiceNumber;
  }
  return input.replacementNumber?.trim() || input.claimNumber;
}
