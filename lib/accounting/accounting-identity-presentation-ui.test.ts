import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const paymentDetail = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/PaymentClaimDetailClient.tsx",
  "utf8",
);
const paymentRegister = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/PaymentClaimsRegisterClient.tsx",
  "utf8",
);
const paymentRegisterLoader = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/accounting-identity-actions.ts",
  "utf8",
);
const retentionDetail = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
  "utf8",
);
const retentionRegister = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/RetentionWorkspaceSection.tsx",
  "utf8",
);
const retentionLoader = readFileSync(
  "lib/retention/phase7-retention-workspace.ts",
  "utf8",
);
const paymentPanel = readFileSync(
  "lib/xero/payment-claim-sales-invoice-panel.ts",
  "utf8",
);
const retentionPanel = readFileSync(
  "lib/xero/retention-claim-immutable-panel.ts",
  "utf8",
);

describe("active Xero invoice identity presentation", () => {
  it("keeps Payment Claim commercial and Xero identities separately labelled", () => {
    expect(paymentDetail).toContain("Claim No.");
    expect(paymentDetail).toContain("Xero Invoice No.");
    expect(paymentDetail).toContain("accountingIdentity.commercialClaimNumber");
    expect(paymentDetail).toContain("accountingIdentity.displayAccountingNumber");
    expect(paymentDetail).toContain("Payment Claim ${accountingIdentity.commercialClaimNumber}");
  });

  it("keeps Retention master and Xero identities separately labelled", () => {
    expect(retentionDetail).toContain("Master Claim No.");
    expect(retentionDetail).toContain("Xero Invoice No.");
    expect(retentionDetail).toContain("accountingIdentity.commercialClaimNumber");
    expect(retentionDetail).toContain("accountingIdentity.displayAccountingNumber");
    expect(retentionDetail).toContain(
      "Master Retention Claim ${accountingIdentity.commercialClaimNumber}",
    );
  });

  it("shows the active identity in Claim # and status in Xero for both registers", () => {
    expect(paymentRegister).toContain("accounting?.identity.displayAccountingNumber");
    expect(paymentRegister).toContain("accounting?.statusLabel");
    expect(retentionRegister).toContain(
      "accountingIdentity.displayAccountingNumber",
    );
    expect(retentionRegister).toContain(
      "xeroLabel(row.xeroStatus, row.xeroVisible)",
    );
  });

  it("loads the Payment Claim identity from the active server revision", () => {
    expect(paymentRegisterLoader).toContain(
      "organization_accounting_document_revisions",
    );
    expect(paymentRegisterLoader).toContain(
      "activeRevisionInvoiceNumber",
    );
    expect(paymentRegisterLoader).toContain(
      "stableDocumentInvoiceNumber",
    );
    expect(paymentRegisterLoader).not.toMatch(/\.(?:insert|update|upsert|delete|rpc)\(/);
    expect(paymentRegisterLoader).not.toContain("fetch(");
  });

  it("loads the Retention identity from its active server revision", () => {
    expect(retentionLoader).toContain(
      "activeRevisionInvoiceNumber: revision.data.external_document_number",
    );
    expect(retentionLoader).toContain(
      "activeRevisionInvoiceId: revision.data.external_document_id",
    );
  });

  it("keeps Accounting Sync bound to active immutable revision identity", () => {
    expect(paymentPanel).toContain(
      "text(activeRevision?.external_document_number)",
    );
    expect(paymentPanel).toContain(
      "text(activeRevision?.external_document_id)",
    );
    expect(retentionPanel).toContain(
      "text(revisionRow?.external_document_number)",
    );
    expect(retentionPanel).toContain(
      "text(revisionRow?.external_document_id)",
    );
  });

  it("does not change claim routes or mutate commercial claim numbers", () => {
    expect(paymentDetail).toContain(
      "/preconstruction/claims/${createdRow.id}",
    );
    expect(retentionDetail).toContain("retentionClaimId");
    expect(paymentRegisterLoader).not.toContain("claim_number:");
    expect(paymentRegisterLoader).not.toContain("claimNumber +");
    expect(retentionLoader).not.toContain("claimNumber +");
  });
});
