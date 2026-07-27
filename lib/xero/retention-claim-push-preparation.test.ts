import { describe, expect, it, vi } from "vitest";
import {
  prepareRetentionClaimForXeroPreview,
  RetentionClaimPushPreparationError,
  type RetentionClaimPushPreparationDependencies,
} from "@/lib/xero/retention-claim-push-preparation";

const draftClaim = {
  id: "claim-1",
  organizationId: "org-1",
  projectId: "project-1",
  claimNumber: "RC-01",
  title: "Retention Claim",
  reference: null,
  issueDate: "2026-07-25",
  dueDate: "2026-08-20",
  status: "draft",
  subtotalExclTax: 0,
  draftRevision: 7,
  lastPositionStateHash: "position-hash",
  submissionStateHash: null,
  submittedBy: null,
  submittedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  createdBy: "user-1",
  createdAt: "2026-07-25T00:00:00Z",
  updatedAt: "2026-07-25T00:00:00Z",
} as const;

const submittedClaim = {
  ...draftClaim,
  status: "submitted",
  subtotalExclTax: 100,
  submissionStateHash: "position-hash",
  submittedBy: "user-1",
  submittedAt: "2026-07-26T00:00:00Z",
} as const;

function dependencies(input?: {
  stale?: boolean;
  submissionSucceeded?: boolean;
  reloadedClaim?: typeof draftClaim | typeof submittedClaim;
  documentSucceeded?: boolean;
}) {
  const calls: string[] = [];
  const deps = {
    loadWorkspace: vi.fn(async () => {
      calls.push("load");
      return {
        claim: {
          succeeded: true,
          errorCode: null,
          claim: draftClaim,
          allocations: [{}],
          currentPosition: { stateHash: "position-hash" },
          positionStateStale: input?.stale ?? false,
        },
        eligibility: { eligibilityStateHash: "eligibility-hash" },
        events: [],
        rollingOrigins: [],
        automaticRolling: true,
      };
    }),
    submitClaim: vi.fn(async () => {
      calls.push("submit");
      return {
        succeeded: input?.submissionSucceeded ?? true,
        errorCode: input?.submissionSucceeded === false
          ? "concurrent_update"
          : null,
      };
    }),
    reloadClaim: vi.fn(async () => {
      calls.push("reload");
      return {
        succeeded: true,
        errorCode: null,
        claim: input?.reloadedClaim ?? submittedClaim,
      };
    }),
    generateDocument: vi.fn(async () => {
      calls.push("document");
      return {
        succeeded: input?.documentSucceeded ?? true,
        errorCode: input?.documentSucceeded === false
          ? "document_generation_failed"
          : null,
        created: true,
        reused: false,
      };
    }),
    correlationId: () => "correlation-1",
  } as unknown as RetentionClaimPushPreparationDependencies;
  return { deps, calls };
}

describe("Retention Claim Push preparation", () => {
  it("submits a saved valid Draft exactly once, reloads, then prepares evidence", async () => {
    const { deps, calls } = dependencies();
    const result = await prepareRetentionClaimForXeroPreview({
      organizationId: "org-1",
      retentionClaimId: "claim-1",
    }, deps);

    expect(result.submittedInternally).toBe(true);
    expect(result.claim.status).toBe("submitted");
    expect(deps.submitClaim).toHaveBeenCalledTimes(1);
    expect(deps.reloadClaim).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["load", "submit", "reload", "document"]);
  });

  it("rejects a stale Draft before submission", async () => {
    const { deps } = dependencies({ stale: true });
    await expect(prepareRetentionClaimForXeroPreview({
      organizationId: "org-1",
      retentionClaimId: "claim-1",
    }, deps)).rejects.toMatchObject({ code: "stale_draft" });
    expect(deps.submitClaim).not.toHaveBeenCalled();
    expect(deps.generateDocument).not.toHaveBeenCalled();
  });

  it("resumes when a concurrent request already submitted the Claim", async () => {
    const { deps } = dependencies({
      submissionSucceeded: false,
      reloadedClaim: submittedClaim,
    });
    const result = await prepareRetentionClaimForXeroPreview({
      organizationId: "org-1",
      retentionClaimId: "claim-1",
    }, deps);
    expect(result.submittedInternally).toBe(true);
    expect(deps.submitClaim).toHaveBeenCalledTimes(1);
    expect(deps.reloadClaim).toHaveBeenCalledTimes(2);
    expect(deps.generateDocument).toHaveBeenCalledTimes(1);
  });

  it("preserves Submitted and reports a resumable evidence failure", async () => {
    const { deps } = dependencies({ documentSucceeded: false });
    await expect(prepareRetentionClaimForXeroPreview({
      organizationId: "org-1",
      retentionClaimId: "claim-1",
    }, deps)).rejects.toEqual(expect.objectContaining({
      code: "immutable_document_failed",
      submittedInternally: true,
    } satisfies Partial<RetentionClaimPushPreparationError>));
    expect(deps.submitClaim).toHaveBeenCalledTimes(1);
  });

  it("preserves resume semantics when document generation throws", async () => {
    const { deps } = dependencies();
    deps.generateDocument = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    await expect(prepareRetentionClaimForXeroPreview({
      organizationId: "org-1",
      retentionClaimId: "claim-1",
    }, deps)).rejects.toMatchObject({
      code: "immutable_document_failed",
      submittedInternally: true,
    });
  });

  it("reloads after an uncertain submission response instead of submitting twice", async () => {
    const { deps } = dependencies();
    deps.submitClaim = vi.fn(async () => {
      throw new Error("response lost");
    });
    const result = await prepareRetentionClaimForXeroPreview({
      organizationId: "org-1",
      retentionClaimId: "claim-1",
    }, deps);
    expect(result.claim.status).toBe("submitted");
    expect(deps.submitClaim).toHaveBeenCalledTimes(1);
    expect(deps.reloadClaim).toHaveBeenCalledTimes(2);
  });

  it("skips submission when the authoritative Claim is already Submitted", async () => {
    const { deps, calls } = dependencies();
    deps.loadWorkspace = vi.fn(async () => ({
      claim: {
        succeeded: true,
        errorCode: null,
        claim: submittedClaim,
        currentPosition: { stateHash: "position-hash" },
        positionStateStale: false,
      },
      eligibility: {},
      events: [],
      rollingOrigins: [],
      automaticRolling: false,
    })) as unknown as RetentionClaimPushPreparationDependencies["loadWorkspace"];

    const result = await prepareRetentionClaimForXeroPreview({
      organizationId: "org-1",
      retentionClaimId: "claim-1",
    }, deps);
    expect(result.submittedInternally).toBe(false);
    expect(deps.submitClaim).not.toHaveBeenCalled();
    expect(deps.reloadClaim).not.toHaveBeenCalled();
    expect(calls).toEqual(["document"]);
  });
});
