import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createAccountingSyncRequestContextFromIdentity,
  extendAccountingSyncRequestContext,
} from "@/lib/xero/accounting-sync-request-context";

describe("Accounting Sync request context", () => {
  it("copies and freezes request-authoritative permissions and feature flags", () => {
    const permissions = { "accounting.sales_invoices.push": true };
    const featureFlags = { initialPaymentClaimPushEnabled: true };
    const context = createAccountingSyncRequestContextFromIdentity({
      identity: {
        userId: "user-a",
        organizationId: "org-a",
        membershipId: "member-a",
      },
      claimId: "claim-a",
      permissions,
      featureFlags,
    });

    permissions["accounting.sales_invoices.push"] = false;
    featureFlags.initialPaymentClaimPushEnabled = false;

    expect(context.permissions["accounting.sales_invoices.push"]).toBe(true);
    expect(context.featureFlags.initialPaymentClaimPushEnabled).toBe(true);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.permissions)).toBe(true);
    expect(Object.isFrozen(context.featureFlags)).toBe(true);
  });

  it("does not leak identity or state between request contexts", () => {
    const first = createAccountingSyncRequestContextFromIdentity({
      identity: {
        userId: "user-a",
        organizationId: "org-a",
        membershipId: "member-a",
      },
      claimId: "claim-a",
      permissions: { push: true },
    });
    const second = createAccountingSyncRequestContextFromIdentity({
      identity: {
        userId: "user-b",
        organizationId: "org-b",
        membershipId: "member-b",
      },
      claimId: "claim-b",
      permissions: { push: false },
    });
    const extended = extendAccountingSyncRequestContext(first, {
      projectId: "project-a",
      revisionId: "revision-a",
    });

    expect(first.projectId).toBeNull();
    expect(first.revisionId).toBeNull();
    expect(extended.organizationId).toBe("org-a");
    expect(extended.projectId).toBe("project-a");
    expect(second.organizationId).toBe("org-b");
    expect(second.claimId).toBe("claim-b");
    expect(second.permissions.push).toBe(false);
  });
});
