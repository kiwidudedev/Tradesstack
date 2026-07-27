export interface WorksheetQuotePublishContext {
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
  projectSlug: string | null;
  createdWorkspace: false;
  repairedWorkspaceLineage: false;
}

export async function resolveWorksheetQuotePublishContext(params: {
  organizationId: string;
  opportunityId: string;
}): Promise<WorksheetQuotePublishContext> {
  const response = await fetch("/api/commercial-items/quote-publish-context", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const payload = (await response.json().catch(() => null)) as
    | { context?: WorksheetQuotePublishContext; error?: string }
    | null;

  if (!response.ok || !payload?.context) {
    throw new Error(payload?.error ?? "Unable to prepare quote publishing.");
  }

  return payload.context;
}
