import {
  formatProjectNameFromSlug,
  resolveUniqueProjectSlug,
  toProjectImageStoragePath,
  toProjectSlug,
  type OrganizationProject,
} from "@/lib/projects";

export type TradePackWorkspace = OrganizationProject;
export type TradePackPlanTier = "starter" | "professional" | "business";

export const TRADE_PACK_MONTHLY_LIMITS: Record<TradePackPlanTier, number> = {
  starter: 4,
  professional: 12,
  business: 30,
};

export function toTradePackWorkspaceSlug(name: string): string {
  return toProjectSlug(name);
}

export function resolveUniqueTradePackWorkspaceSlug(baseSlug: string, existingSlugs: string[]): string {
  return resolveUniqueProjectSlug(baseSlug, existingSlugs);
}

export function formatTradePackWorkspaceNameFromSlug(slug: string): string {
  return formatProjectNameFromSlug(slug);
}

export function toTradePackWorkspaceImageStoragePath(params: {
  organizationId: string;
  projectId: string;
  fileName: string;
}): string {
  return toProjectImageStoragePath(params);
}

