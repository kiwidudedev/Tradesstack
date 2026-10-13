import { describe, expect, it, vi } from "vitest";
import { CloudflareProvider, customerResourceName } from "@/lib/control-plane/cloudflare-provider";

describe("Cloudflare control-plane provider", () => {
  it("creates deterministic customer resource names", () => {
    expect(customerResourceName("Acme & Sons", "documents")).toBe("tradesstack-acme-sons-documents");
  });

  it("uses authenticated Cloudflare API calls and preserves the response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, result: { buckets: [{ name: "docs" }] } }), { status: 200 })) as unknown as typeof fetch;
    const provider = new CloudflareProvider({ accountId: "account-1", apiToken: "token-1", fetchImpl });
    await expect(provider.listR2Buckets()).resolves.toEqual({ buckets: [{ name: "docs" }] });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.cloudflare.com/client/v4/accounts/account-1/r2/buckets", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token-1" }) }));
  });
});
