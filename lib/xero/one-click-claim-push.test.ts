import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { executeOneClickClaimPush } from "@/lib/xero/one-click-claim-push";

describe("one-click claim push orchestration", () => {
  it("passes server-only prepared context directly to confirmation", async () => {
    const context = { proposalId: "proposal-1", immutable: true };
    const confirm = vi.fn(async (_token: string, received?: typeof context) => ({
      ok: true as const,
      state: { received },
    }));

    const result = await executeOneClickClaimPush({
      prepare: async () => ({
        ok: true as const,
        proposalToken: "signed-token",
        serverContext: context,
      }),
      confirm,
      recover: async (failed) => failed,
    });

    expect(confirm).toHaveBeenCalledWith("signed-token", context);
    expect(result).toEqual({
      ok: true,
      state: { received: context },
    });
  });
});
