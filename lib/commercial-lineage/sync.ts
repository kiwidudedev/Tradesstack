type CommercialLineageRpcClient = {
  rpc: (name: never, args: never) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export type CommercialLineageSyncResult =
  | { status: "written"; insertedCount: number }
  | { status: "unchanged"; insertedCount: 0 }
  | { status: "failed"; insertedCount: 0; reason: string };

export async function syncCommercialItemLineageBestEffort(
  client: CommercialLineageRpcClient,
  commercialItemId: string,
): Promise<CommercialLineageSyncResult> {
  try {
    const { data, error } = await client.rpc("sync_commercial_item_lineage" as never, {
      p_commercial_item_id: commercialItemId,
    } as never);
    if (error) {
      console.error("commercial_lineage_sync_failed", { commercialItemId, reason: error.message });
      return { status: "failed", insertedCount: 0, reason: error.message };
    }
    const insertedCount = typeof data === "number" && Number.isFinite(data) ? data : 0;
    return insertedCount > 0
      ? { status: "written", insertedCount }
      : { status: "unchanged", insertedCount: 0 };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown lineage synchronization failure.";
    console.error("commercial_lineage_sync_failed", { commercialItemId, reason });
    return { status: "failed", insertedCount: 0, reason };
  }
}

