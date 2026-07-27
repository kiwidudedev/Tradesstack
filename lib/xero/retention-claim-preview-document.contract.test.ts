import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const previewDocument = fs.readFileSync(
  path.join(root, "lib/xero/retention-claim-preview-document.ts"),
  "utf8",
);
const retentionDocuments = fs.readFileSync(
  path.join(root, "lib/retention/phase8-retention-documents.ts"),
  "utf8",
);
const actions = fs.readFileSync(
  path.join(
    root,
    "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
  ),
  "utf8",
);

describe("Retention Claim accounting preview document boundary", () => {
  it("loads submitted evidence through the service-only Phase 2C reader", () => {
    expect(previewDocument).toContain("createAdminSupabaseClient");
    expect(previewDocument).toContain(
      '"get_retention_claim_xero_source_phase2c"',
    );
    expect(previewDocument).toContain(
      "result.organizationId !== params.organizationId",
    );
    expect(previewDocument).toContain(
      'result.source.claim.status !== "submitted"',
    );
    expect(previewDocument).not.toContain(
      '"get_retention_claim_document_source"',
    );
  });

  it("builds proposal previews without generating or attaching a PDF", () => {
    const proposalStart = actions.indexOf(
      "async function prepareRetentionClaimPushProposal",
    );
    const confirmationStart = actions.indexOf(
      "export async function loadRetentionClaimPushProposalAction",
    );
    expect(proposalStart).toBeGreaterThan(-1);
    expect(confirmationStart).toBeGreaterThan(proposalStart);
    const proposalAction = actions.slice(proposalStart, confirmationStart);
    expect(proposalAction).not.toContain(
      "generateRetentionClaimPreviewDocument",
    );
    expect(proposalAction).not.toContain(
      "generateRetentionClaimDocument",
    );
    expect(proposalAction).toContain(
      "buildRetentionClaimPushProposal",
    );
  });

  it("reuses the existing immutable render, hash, storage, and record path", () => {
    expect(previewDocument).toContain(
      "generateRetentionClaimDocumentFromServerSource",
    );
    expect(retentionDocuments).toContain("upsert: false");
    expect(retentionDocuments).toContain(
      "collisionHash !== pdfSha256",
    );
    expect(retentionDocuments).toContain(
      '"record_retention_claim_document"',
    );
    expect(retentionDocuments).toContain(
      'source.claim.status !== "submitted"',
    );
  });
});
