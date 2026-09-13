import { describe, expect, it, vi } from "vitest";
import { resolveAuthoritativeContractualBaseline } from "./opportunity-lifecycle-compatibility-client";

describe("authoritative contractual baseline browser reader", () => {
  it("returns the exact mapped quote selected by the Stage 2 resolver", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        quote_id: "11111111-1111-4111-8111-111111111111",
        is_valid: true,
        reason_code: "authoritative_mapping",
      }],
      error: null,
    });

    await expect(resolveAuthoritativeContractualBaseline({
      client: { rpc },
      organizationId: "22222222-2222-4222-8222-222222222222",
      projectId: "33333333-3333-4333-8333-333333333333",
    })).resolves.toEqual({
      quoteId: "11111111-1111-4111-8111-111111111111",
      isValid: true,
      reasonCode: "authoritative_mapping",
    });
  });

  it("fails closed when the resolver fails or returns no recognized row", async () => {
    await expect(resolveAuthoritativeContractualBaseline({
      client: { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } }) },
      organizationId: "org",
      projectId: "project",
    })).rejects.toThrow("denied");
  });
});
