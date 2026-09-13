import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("Phase 9 Retention Claim Xero application boundary", () => {
  it("uses immutable accounting snapshots in the create worker", () => {
    const source = read("lib/xero/retention-claim-sales-invoice-create.ts");
    expect(source).toContain('from("retention_claim_accounting_snapshots")');
    expect(source).toContain("payload_snapshot");
    expect(source).toContain("hashRetentionClaimXeroPayload");
    expect(source).toContain("idempotency_key");
    expect(source).not.toContain('from("project_claims")');
    expect(source).not.toContain('from("retention_claim_allocations")');
    expect(source).not.toContain("amount_paid");
  });

  it("keeps the historical attachment reader immutable for legacy records", () => {
    const source = read("lib/xero/retention-claim-sales-invoice-attachment.ts");
    expect(source).toContain('from("retention_claim_documents")');
    expect(source).toContain(".download(String(pdf.storage_path))");
    expect(source).toContain('createHash("sha256")');
    expect(source).toContain("bytes.byteLength !== Number(pdf.byte_length)");
    expect(source).toContain("putXeroInvoiceAttachment");
    expect(source).not.toContain(".upload(");
    expect(source).not.toContain("composeRetentionClaimPdf");
  });

  it("adds isolated worker branches without altering Payment Claim handlers", () => {
    const source = read("lib/xero/sync.ts");
    expect(source).toContain('job.job_kind === "xero.retention_claim.sync"');
    expect(source).toContain('job.job_kind === "xero.retention_claim.attachment"');
    expect(source).toContain('job.job_kind === "xero.retention_claim.update"');
    expect(source).toContain("createInitialXeroSalesInvoice");
    expect(source).toContain("updateExistingXeroSalesInvoice");
    expect(source).toContain("refreshXeroSalesInvoiceStatus");
    expect(source).toContain("attachPaymentClaimPdfToXeroSalesInvoice");
  });

  it("keeps accounting gated, cumulative, and separate from reconciliation", () => {
    const server = read("lib/xero/retention-claim-sales-invoice.ts");
    const page = read(
      "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
    );
    expect(server).toContain("get_retention_claim_xero_access");
    expect(server).toContain("get_retention_claim_xero_source");
    expect(page).toContain("<RetentionClaimXeroPanel");
    expect(page).toContain('title="Payment Reconciliation"');
    expect(page).toContain("getRetentionClaimImmutableXeroPanel");
    expect(page).toContain("getRetentionClaimPaymentState");
    expect(page).toContain("getMasterRetentionSource");
    expect(page).toContain("Current Retention incl. GST");
    expect(page).not.toContain("Download PDF");
    expect(page).not.toContain("This PDF is not a tax invoice");
  });
});
