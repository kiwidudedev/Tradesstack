export type OpportunityTenderClientReadRow = {
  client_id: string | null;
  client_name: string | null;
  is_tender_client: boolean;
  archived_at?: string | null;
};

export type OpportunityTenderClientDisplay = {
  id: string;
  name: string;
};

export function resolveOpportunityTenderClients(
  rows: OpportunityTenderClientReadRow[],
  primaryClient: OpportunityTenderClientDisplay | null,
): OpportunityTenderClientDisplay[] {
  const activeById = new Map<string, OpportunityTenderClientDisplay>();

  for (const row of rows) {
    if (!row.is_tender_client || row.archived_at || !row.client_id) continue;
    activeById.set(row.client_id, {
      id: row.client_id,
      name: row.client_name?.trim() || "Unknown Company",
    });
  }

  if (primaryClient?.id) {
    activeById.set(primaryClient.id, primaryClient);
  }

  return [
    ...(primaryClient?.id && activeById.has(primaryClient.id)
      ? [activeById.get(primaryClient.id)!]
      : []),
    ...Array.from(activeById.values()).filter((client) => client.id !== primaryClient?.id),
  ];
}
