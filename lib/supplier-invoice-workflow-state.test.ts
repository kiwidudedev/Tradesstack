import { describe, expect, it } from "vitest";
import { deriveSupplierInvoiceWorkflowStage } from "./supplier-invoice-workflow-state";

const readyCapture = {
  exportStatus: null,
  hasExternalDocument: false,
  hasCurrentAccountsApproval: false,
  hasCurrentSubmission: false,
  pendingDecisions: 0,
  approvedDecisions: 0,
  disputedDecisions: 0,
  captureComplete: true,
  allocationsComplete: true,
};

describe("Supplier Invoice workflow stage", () => {
  it.each([
    [{ ...readyCapture, captureComplete: false }, "Draft"],
    [{ ...readyCapture, allocationsComplete: false }, "Awaiting Allocation"],
    [{ ...readyCapture, hasCurrentSubmission: true, pendingDecisions: 2 }, "Awaiting Site Approval"],
    [{ ...readyCapture, hasCurrentSubmission: true, pendingDecisions: 1, approvedDecisions: 1 }, "Partially Site Approved"],
    [{ ...readyCapture, hasCurrentSubmission: true, disputedDecisions: 1 }, "Disputed"],
    [{ ...readyCapture, hasCurrentSubmission: true, approvedDecisions: 2 }, "Ready for Accounts"],
    [{ ...readyCapture, hasCurrentAccountsApproval: true }, "Ready for Xero"],
    [{ ...readyCapture, exportStatus: "queued" }, "Xero Export Queued"],
    [{ ...readyCapture, exportStatus: "exported", hasExternalDocument: true }, "Draft Bill Created"],
    [{ ...readyCapture, exportStatus: "exported", hasExternalDocument: true, normalizedExternalStatus: "awaiting_approval" }, "Awaiting Xero Approval"],
    [{ ...readyCapture, exportStatus: "exported", hasExternalDocument: true, normalizedExternalStatus: "awaiting_payment" }, "Awaiting Payment"],
    [{ ...readyCapture, exportStatus: "exported", hasExternalDocument: true, normalizedExternalStatus: "partially_paid" }, "Partially Paid"],
    [{ ...readyCapture, exportStatus: "exported", hasExternalDocument: true, normalizedExternalStatus: "paid" }, "Paid"],
    [{ ...readyCapture, exportStatus: "exported", hasExternalDocument: true, normalizedExternalStatus: "voided" }, "Voided"],
    [{ ...readyCapture, exportStatus: "exported", hasExternalDocument: true, normalizedExternalStatus: "unknown", hasStatusSyncError: true }, "Attention Required"],
    [{ ...readyCapture, exportStatus: "attention_required" }, "Attention Required"],
  ])("derives %s", (input, expected) => {
    expect(deriveSupplierInvoiceWorkflowStage(input)).toBe(expected);
  });
});
