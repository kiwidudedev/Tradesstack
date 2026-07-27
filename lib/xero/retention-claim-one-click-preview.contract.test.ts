import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const resolved = readFileSync(
  "lib/xero/retention-claim-sales-invoice.ts",
  "utf8",
);
const actions = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
  "utf8",
);
const preparation = readFileSync(
  "lib/xero/retention-claim-push-preparation.ts",
  "utf8",
);
const proposal = readFileSync(
  "lib/xero/retention-claim-push-proposal.ts",
  "utf8",
);
const documentService = readFileSync(
  "lib/retention/phase8-retention-documents.ts",
  "utf8",
);

describe("Retention Claim one-click preview contract", () => {
  it("does not block Phase 2C readiness when PDF preparation is pending", () => {
    expect(resolved).toContain(
      "if (!document.data && !immutablePhase2c)",
    );
    expect(resolved).toContain(
      "(!document.data && !immutablePhase2c)",
    );
    expect(resolved).toContain("document: Row | null");
  });

  it("finalises, reloads, then builds a structured proposal without a PDF", () => {
    const loadAction = actions.slice(
      actions.indexOf(
        "async function prepareRetentionClaimPushProposal",
      ),
      actions.indexOf(
        "export async function loadRetentionClaimPushProposalAction",
      ),
    );
    expect(loadAction.indexOf("prepareRetentionClaimForXeroPreview"))
      .toBeLessThan(loadAction.indexOf("buildRetentionClaimPushProposal"));
    expect(preparation).toContain("await dependencies.submitClaim");
    expect(preparation).toContain("reloadSubmittedClaim");
    expect(loadAction).not.toContain("generateRetentionClaimPreviewDocument");
    expect(proposal).not.toContain("downloadRetentionClaimDocument");
    expect(proposal).not.toContain("pdfHash");
    expect(proposal).not.toContain(
      "Generate the immutable Retention Claim PDF before pushing to Xero.",
    );
  });

  it("preserves the historical deterministic PDF implementation", () => {
    expect(documentService).toContain(
      "generateRetentionClaimDocumentFromServerSource",
    );
    expect(documentService).toContain("if (existing.document)");
    expect(documentService).toContain("reused: true");
    expect(documentService).toContain("upsert: false");
    expect(documentService).toContain("collisionHash !== pdfSha256");
    expect(documentService).toContain(
      '"record_retention_claim_document"',
    );
  });

  it("never reaches Xero or accounting confirmation during preview loading", () => {
    const loadAction = actions.slice(
      actions.indexOf(
        "async function prepareRetentionClaimPushProposal",
      ),
      actions.indexOf(
        "export async function loadRetentionClaimPushProposalAction",
      ),
    );
    expect(loadAction).not.toContain("runXeroSyncWorker");
    expect(loadAction).not.toContain("createXeroInvoices");
    expect(loadAction).not.toContain("confirmRetentionClaimPush");
  });

  it("returns a specific resumable proposal error", () => {
    expect(actions).toContain('"RETENTION_PROPOSAL_PREPARATION_FAILED"');
    expect(actions).toContain(
      "Push to Xero again to retry; the Claim will not be submitted twice.",
    );
  });
});
