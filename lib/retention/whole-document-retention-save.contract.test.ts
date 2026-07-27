import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(
  "lib/retention/retention-claim-document-save.ts",
  "utf8",
);
const actions = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
  "utf8",
);
const editor = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/RetentionClaimDraftEditor.tsx",
  "utf8",
);
const page = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
  "utf8",
);
const readiness = readFileSync(
  "lib/retention/retention-claim-draft-readiness.ts",
  "utf8",
);

describe("whole-document Retention Claim save boundary", () => {
  it("uses one typed RPC and a server-generated correlation id", () => {
    expect(service).toContain('"save_retention_claim_draft_document"');
    expect(service).toContain("expectedDraftRevision");
    expect(service).toContain("expectedPositionStateHash");
    expect(service).toContain("expectedEligibilityStateHash");
    expect(service).toContain("expectedOriginSetHash");
    expect(service).toContain("proposedAmountCents");
    expect(actions).toContain(
      "export async function saveRetentionClaimDocumentAction(",
    );
    expect(actions).toContain("supabase.auth.refreshSession()");
    expect(actions).toContain("correlationId: crypto.randomUUID()");
  });

  it("stages header and every visible Claim % in one focused client editor", () => {
    expect(editor).toContain('"use client"');
    expect(editor).toContain("saveRetentionClaimDocumentAction({");
    expect(editor).toContain("lines: lines.map((line) => ({");
    expect(editor).toContain("proposedAmountCents:");
    expect(editor).toContain("Save Claim");
    expect(editor).not.toContain("updateRetentionAllocationAction");
    expect(editor).not.toContain("addRetentionAllocationAction");
    expect(editor).not.toContain("removeRetentionAllocationAction");
  });

  it("uses one percentage input and removes direct amount controls", () => {
    expect(editor).toContain('aria-label={`Claim % for ${line.claimNumber}`}');
    expect(editor).toContain('step="0.001"');
    expect(editor).toContain("calculateRetentionClaimPercentagePreview(");
    expect(editor).not.toContain("Use available");
    expect(editor).not.toContain(">Reset<");
    expect(editor).not.toContain("setLineAmount");
    expect(editor).not.toContain('aria-label={`This claim for');
    expect(editor).not.toContain("<form action={updateRetentionAllocationAction}");
  });

  it("keeps non-Xero Submit available and blocks dirty or invalid Draft state", () => {
    expect(editor).toContain("<form action={submitRetentionClaimAction}>");
    expect(editor).toContain("!immutableXeroPanel.visible ? (");
    expect(readiness).toContain("!input.dirty");
    expect(readiness).toContain("!input.isSaving");
    expect(readiness).toContain("!input.positionStateStale");
    expect(readiness).toContain("!input.hasInvalidPercentages");
    expect(readiness).toContain("input.thisClaimCents > 0");
    expect(editor).toContain("Save Claim before submitting");
  });

  it("maps authoritative eligibility rejection to its originating row", () => {
    expect(editor).toContain("error.originatingPaymentClaimId");
    expect(editor).toContain("error.currentLimitCents");
    expect(editor).toContain("Currently allowable:");
  });

  it("preserves server-loaded authority and does not add browser Supabase writes", () => {
    expect(page).toContain("getRetentionClaimWorkspace");
    expect(page).toContain("getRetentionClaimDraftOriginSetHash");
    expect(page).toContain("<RetentionClaimDraftEditor");
    expect(editor).not.toContain("createBrowserSupabaseClient");
    expect(editor).not.toContain(".from(");
    expect(editor).not.toContain(".rpc(");
    expect(editor).not.toContain("PaymentClaimXeroPanel");
  });
});
