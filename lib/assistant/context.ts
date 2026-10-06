import "server-only";

import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import type { AssistantContext } from "./types";

export async function resolveAssistantContext(input: {
  projectSlug: string;
  route?: string | null;
  module?: string | null;
  recordId?: string | null;
}): Promise<AssistantContext | null> {
  const project = await getTradePackWorkspaceBySlugForCurrentUser(input.projectSlug);
  if (!project) return null;
  return {
    organizationId: project.organization_id,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    route: input.route ?? null,
    module: input.module ?? null,
    recordId: input.recordId ?? null,
  };
}
