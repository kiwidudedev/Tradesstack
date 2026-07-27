import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("revision-backed voided Payment Claim replacement regression", () => {
  it("does not classify refresh or attachment jobs as active invoice mutation work", () => {
    const decisionServer = read("lib/xero/payment-claim-accounting-decision-server.ts");
    const panelServer = read("lib/xero/payment-claim-sales-invoice-panel.ts");
    const panel = read("components/app/PaymentClaimXeroPanel.tsx");

    expect(decisionServer).toContain('.in("job_kind", [');
    expect(decisionServer).toContain('"xero.payment_claim.initial_push"');
    expect(decisionServer).toContain('"xero.payment_claim.replacement"');
    expect(decisionServer).not.toMatch(
      /\.in\("job_kind", \[[\s\S]{0,250}xero\.payment_claim\.attachment/,
    );
    expect(panelServer).toContain("hasActiveWork: Boolean(jobs.activeJob)");
    expect(panelServer).not.toContain(
      "hasActiveWork: Boolean(jobs.activeJob || jobs.activeRefreshJob || jobs.activeAttachmentJob)",
    );
    expect(panel).not.toMatch(/disabled=\{[^}]*state\.attachmentInProgress/);
  });
});
