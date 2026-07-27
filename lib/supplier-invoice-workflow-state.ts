export type SupplierInvoiceWorkflowStageInput = {
  exportStatus: string | null;
  hasExternalDocument: boolean;
  normalizedExternalStatus?: string | null;
  hasStatusSyncError?: boolean;
  hasCurrentAccountsApproval: boolean;
  hasCurrentSubmission: boolean;
  pendingDecisions: number;
  approvedDecisions: number;
  disputedDecisions: number;
  captureComplete: boolean;
  allocationsComplete: boolean;
};

export function deriveSupplierInvoiceWorkflowStage(input: SupplierInvoiceWorkflowStageInput) {
  if (input.exportStatus === "exported" && input.hasExternalDocument) {
    if (input.hasStatusSyncError && (!input.normalizedExternalStatus || input.normalizedExternalStatus === "unknown")) {
      return "Attention Required" as const;
    }
    if (input.normalizedExternalStatus === "awaiting_approval") return "Awaiting Xero Approval" as const;
    if (input.normalizedExternalStatus === "awaiting_payment") return "Awaiting Payment" as const;
    if (input.normalizedExternalStatus === "partially_paid") return "Partially Paid" as const;
    if (input.normalizedExternalStatus === "paid") return "Paid" as const;
    if (input.normalizedExternalStatus === "voided") return "Voided" as const;
    if (input.normalizedExternalStatus === "deleted") return "Attention Required" as const;
    return "Draft Bill Created" as const;
  }
  if (input.exportStatus === "queued" || input.exportStatus === "exporting") return "Xero Export Queued" as const;
  if (input.exportStatus === "failed") return "Xero Export Failed" as const;
  if (input.exportStatus === "attention_required") return "Attention Required" as const;
  if (input.hasCurrentAccountsApproval) return "Ready for Xero" as const;
  if (input.hasCurrentSubmission) {
    if (input.disputedDecisions > 0) return "Disputed" as const;
    if (input.pendingDecisions > 0 && input.approvedDecisions > 0) return "Partially Site Approved" as const;
    if (input.pendingDecisions === 0 && input.approvedDecisions > 0) return "Ready for Accounts" as const;
    return "Awaiting Site Approval" as const;
  }
  if (!input.captureComplete) return "Draft" as const;
  if (!input.allocationsComplete) return "Awaiting Allocation" as const;
  return "Draft" as const;
}
