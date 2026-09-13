import { describe, expect, it, vi } from "vitest";
import { syncCommercialItemLineageBestEffort } from "@/lib/commercial-lineage/sync";

describe("best-effort commercial lineage synchronization", () => {
  it("reports idempotent inserts from the narrow RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    await expect(syncCommercialItemLineageBestEffort({ rpc } as never, "item-1"))
      .resolves.toEqual({ status: "written", insertedCount: 3 });
    expect(rpc).toHaveBeenCalledWith("sync_commercial_item_lineage", { p_commercial_item_id: "item-1" });
  });

  it("treats retry/no-op as unchanged", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 0, error: null });
    await expect(syncCommercialItemLineageBestEffort({ rpc } as never, "item-1"))
      .resolves.toEqual({ status: "unchanged", insertedCount: 0 });
  });

  it("contains RPC and transport failures without failing the commercial action", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rejected = vi.fn().mockRejectedValue(new Error("lineage table unavailable"));
    const rpcError = vi.fn().mockResolvedValue({ data: null, error: { message: "invalid evidence" } });
    await expect(syncCommercialItemLineageBestEffort({ rpc: rejected } as never, "item-1"))
      .resolves.toEqual({ status: "failed", insertedCount: 0, reason: "lineage table unavailable" });
    await expect(syncCommercialItemLineageBestEffort({ rpc: rpcError } as never, "item-2"))
      .resolves.toEqual({ status: "failed", insertedCount: 0, reason: "invalid evidence" });
  });
});

