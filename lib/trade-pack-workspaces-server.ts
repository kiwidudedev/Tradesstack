import "server-only";

import { cache } from "react";
import {
  getOrganizationProjectsForCurrentUser,
  getProjectDashboardMetricsForCurrentUser,
  getProjectDrawingSetsForCurrentUser,
  getRecentActivityForCurrentUser,
  getVisibleOrganizationProjectBySlugForCurrentUser,
} from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TradePackPlanTier } from "@/lib/trade-pack-workspaces";

export interface TradePackWorkspaceQuota {
  planTier: TradePackPlanTier;
  monthlyLimit: number;
  createdCount: number;
  remaining: number;
  monthStart: string;
  monthEnd: string;
}

export const getTradePackWorkspacesForCurrentUser = getOrganizationProjectsForCurrentUser;
export const getTradePackWorkspaceBySlugForCurrentUser = cache(
  getVisibleOrganizationProjectBySlugForCurrentUser,
);
export const getTradePackWorkspaceDrawingSetsForCurrentUser = getProjectDrawingSetsForCurrentUser;
export const getTradePackWorkspaceDashboardMetricsForCurrentUser = getProjectDashboardMetricsForCurrentUser;
export const getTradePackWorkspaceRecentActivityForCurrentUser = getRecentActivityForCurrentUser;

function normalizePlanTier(value: unknown): TradePackPlanTier {
  if (value === "professional" || value === "business") {
    return value;
  }

  return "starter";
}

export async function getTradePackWorkspaceQuotaForCurrentUser(organizationId: string): Promise<TradePackWorkspaceQuota | null> {
  const supabase = await createServerSupabaseClient();
  const client = supabase as unknown as {
    rpc: (
      fn: "get_trade_pack_workspace_quota",
      params: { p_organization_id: string }
    ) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message?: string } | null }>;
  };

  const { data, error } = await client.rpc("get_trade_pack_workspace_quota", {
    p_organization_id: organizationId,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const row = data[0] ?? {};
  const monthlyLimit = typeof row.monthly_limit === "number" ? row.monthly_limit : 4;
  const createdCount = typeof row.created_count === "number" ? row.created_count : 0;
  const remaining = typeof row.remaining === "number" ? row.remaining : Math.max(monthlyLimit - createdCount, 0);
  const monthStart = typeof row.month_start === "string" ? row.month_start : new Date().toISOString();
  const monthEnd = typeof row.month_end === "string" ? row.month_end : new Date().toISOString();

  return {
    planTier: normalizePlanTier(row.plan_tier),
    monthlyLimit,
    createdCount,
    remaining,
    monthStart,
    monthEnd,
  };
}
