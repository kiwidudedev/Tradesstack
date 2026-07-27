import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildRetentionClaimRegisterRows,
} from "@/lib/retention/phase7-retention-workspace";
import type { RetentionClaimHeader } from "@/lib/retention/phase3-retention-claims";

function claim(
  id: string,
  claimNumber: string,
  status: RetentionClaimHeader["status"],
  subtotalExclTax: number,
): RetentionClaimHeader {
  return {
    id,
    organizationId: "organization",
    projectId: "project",
    claimNumber,
    title: "Retention Claim",
    reference: null,
    issueDate: null,
    dueDate: null,
    status,
    subtotalExclTax,
    draftRevision: 1,
    lastPositionStateHash: null,
    submissionStateHash: null,
    submittedBy: null,
    submittedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    createdBy: "actor",
    createdAt: "2026-07-25T00:00:00Z",
    updatedAt: "2026-07-25T00:00:00Z",
  };
}

describe("Retention Claim register presentation rows", () => {
  it("does not present an automatic projection as a Retention Claim document", () => {
    const rolling = claim("rc-02", "RC-02", "draft", 25);
    const rows = buildRetentionClaimRegisterRows({
      rollingClaim: {
        succeeded: true,
        errorCode: null,
        claim: rolling,
        originCount: 3,
        availableAmount: 50,
      },
      claimHistory: [
        {
          claim: rolling,
          originCount: 3,
          paidAmount: 99,
          outstandingAmount: 99,
          xeroStatus: "exported",
        },
        {
          claim: claim("rc-01", "RC-01", "submitted", 100),
          originCount: 2,
          paidAmount: 40,
          outstandingAmount: 60,
          xeroStatus: "exported",
        },
      ],
      xeroVisible: true,
    });

    expect(rows.map((row) => row.claim.id)).toEqual(["rc-01"]);
    expect(rows[0]).toMatchObject({
      originCount: 2,
      paidAmount: 40,
      outstandingAmount: 60,
      xeroStatus: "exported",
      automaticDraft: false,
    });
  });

  it("never projects paid or outstanding values onto Draft or cancelled rows", () => {
    const rows = buildRetentionClaimRegisterRows({
      rollingClaim: {
        succeeded: true,
        errorCode: null,
        claim: null,
        originCount: 0,
        availableAmount: 0,
      },
      claimHistory: [
        {
          claim: claim("draft", "RC-01", "draft", 10),
          originCount: 1,
          paidAmount: 5,
          outstandingAmount: 5,
          xeroStatus: "queued",
        },
        {
          claim: claim("cancelled", "RC-00", "cancelled_draft", 0),
          originCount: 1,
          paidAmount: 5,
          outstandingAmount: 5,
          xeroStatus: "failed",
        },
      ],
      xeroVisible: true,
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) =>
      row.paidAmount === 0
      && row.outstandingAmount === 0
      && row.xeroStatus === null
    )).toBe(true);
  });
});
