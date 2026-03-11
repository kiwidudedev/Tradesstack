"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type PlanTier = "starter" | "professional" | "business";

interface TradePackQuota {
  planTier: PlanTier;
  monthlyLimit: number;
  createdCount: number;
  remaining: number;
}

function normalizePlanTier(value: unknown): PlanTier {
  if (value === "professional" || value === "business") {
    return value;
  }
  return "starter";
}

export function useTradePackQuota() {
  const { session, isLoading: isAuthLoading } = useAuth();
  const [quota, setQuota] = useState<TradePackQuota | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const organizationId = session?.organizationId ?? null;

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) {
      setQuota(null);
      setIsLoading(false);
      setHasLoadedOnce(true);
      return;
    }

    if (!hasLoadedOnce) {
      setIsLoading(true);
    }

    const quotaClient = supabase as unknown as {
      rpc: (
        fn: "get_trade_pack_workspace_quota",
        params: { p_organization_id: string }
      ) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
    };

    const { data, error } = await quotaClient.rpc("get_trade_pack_workspace_quota", {
      p_organization_id: organizationId,
    });

    if (error || !data || data.length === 0) {
      setQuota(null);
      setIsLoading(false);
      setHasLoadedOnce(true);
      return;
    }

    const row = data[0] ?? {};
    const monthlyLimit = typeof row.monthly_limit === "number" ? row.monthly_limit : 0;
    const createdCount = typeof row.created_count === "number" ? row.created_count : 0;
    const remaining = typeof row.remaining === "number" ? row.remaining : Math.max(monthlyLimit - createdCount, 0);

    setQuota({
      planTier: normalizePlanTier(row.plan_tier),
      monthlyLimit,
      createdCount,
      remaining,
    });
    setIsLoading(false);
    setHasLoadedOnce(true);
  }, [hasLoadedOnce, organizationId, supabase]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isAuthLoading, refresh]);

  return {
    quota,
    isLoading: isLoading || isAuthLoading,
    refresh,
  };
}
