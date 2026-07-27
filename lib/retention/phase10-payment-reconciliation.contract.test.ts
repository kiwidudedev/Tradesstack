import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("Phase 10 Retention Claim payment application boundary", () => {
  it("uses one shared deterministic attribution calculator for manual and Xero observations", () => {
    const manual = read("lib/retention/phase10-payment-reconciliation.ts");
    const xero = read("lib/xero/retention-claim-payment-refresh.ts");
    expect(manual).toContain("allocatePaidRetentionByLargestRemainder");
    expect(xero).toContain("allocatePaidRetentionByLargestRemainder");
    expect(xero).toContain("projectGrossPaidToRetentionBasis");
    expect(manual).toContain("record_retention_claim_payment_reconciliation");
    expect(xero).toContain("record_retention_claim_payment_reconciliation");
  });

  it("records Xero credit, void, total-divergence, and overpayment states as attention", () => {
    const source = read("lib/xero/retention-claim-payment-refresh.ts");
    expect(source).toContain('"invoice_voided_or_deleted"');
    expect(source).toContain('"credit_detected"');
    expect(source).toContain('"invoice_total_divergence"');
    expect(source).toContain('"paid_over_allocation"');
    expect(source).toContain("projectionApplied: !attentionCode");
  });

  it("extends the worker with an isolated Retention Claim refresh branch", () => {
    const source = read("lib/xero/sync.ts");
    expect(source).toContain('job.job_kind === "xero.retention_claim.refresh"');
    expect(source).toContain("refreshRetentionClaimPaymentFromXero");
    expect(source).toContain("refreshXeroSalesInvoiceStatus");
    expect(source).toContain("createInitialXeroSalesInvoice");
  });

  it("exposes payment state without altering the immutable Phase 9 invoice or Phase 8 document", () => {
    const page = read(
      "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
    );
    const server = read("lib/retention/phase10-payment-reconciliation.ts");
    expect(page).toContain("Payment Reconciliation");
    expect(page).toContain("Record manual payment");
    expect(page).toContain("Refresh payment from Xero");
    expect(server).not.toContain('from("project_claims").update');
    expect(server).not.toContain('from("retention_claim_documents").update');
    expect(server).not.toContain('from("retention_claim_accounting_snapshots").update');
  });

  it("keeps scheduled refresh in a separate authenticated cron boundary", () => {
    const route = read(
      "app/api/cron/xero-retention-claim-status/run/route.ts",
    );
    expect(route).toContain('request.headers.get("authorization")');
    expect(route).toContain("enqueueScheduledRetentionClaimPaymentRefreshes");
    expect(route).toContain("runXeroSyncWorker");
  });
});
