"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  resolveUniqueTradePackWorkspaceSlug,
  toTradePackWorkspaceSlug,
  type TradePackPlanTier,
} from "@/lib/trade-pack-workspaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface TradePackWorkspaceQuota {
  planTier: TradePackPlanTier;
  monthlyLimit: number;
  createdCount: number;
  remaining: number;
}

function normalizePlanTier(value: unknown): TradePackPlanTier {
  if (value === "professional" || value === "business") {
    return value;
  }
  return "starter";
}

function toPlanLabel(planTier: TradePackPlanTier): string {
  if (planTier === "professional") {
    return "Professional";
  }
  if (planTier === "business") {
    return "Business";
  }
  return "Starter";
}

export default function CreateProjectPage() {
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<TradePackWorkspaceQuota | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const loadQuota = useCallback(async (organizationId: string): Promise<TradePackWorkspaceQuota | null> => {
    if (!supabase) {
      return null;
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
      return null;
    }

    const row = data[0] ?? {};
    const monthlyLimit = typeof row.monthly_limit === "number" ? row.monthly_limit : 4;
    const createdCount = typeof row.created_count === "number" ? row.created_count : 0;
    const remaining = typeof row.remaining === "number" ? row.remaining : Math.max(monthlyLimit - createdCount, 0);
    const normalized: TradePackWorkspaceQuota = {
      planTier: normalizePlanTier(row.plan_tier),
      monthlyLimit,
      createdCount,
      remaining,
    };

    setQuota(normalized);
    return normalized;
  }, [supabase]);

  useEffect(() => {
    const organizationId = session?.organizationId;
    if (!organizationId) {
      setQuota(null);
      return;
    }

    void loadQuota(organizationId);
  }, [loadQuota, session?.organizationId]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isAuthLoading) {
      setError("Loading your account. Please try again in a moment.");
      return;
    }

    if (!session) {
      setError("You are not signed in. Please sign in again.");
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Trade pack workspace name is required.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      let organizationId = session.organizationId ?? null;
      if (!organizationId) {
        const { data: ensuredOrganizationId, error: ensureOrganizationError } = await supabase.rpc(
          "ensure_organization_membership"
        );

        if (!ensureOrganizationError) {
          organizationId = ensuredOrganizationId ?? null;
        } else {
          const { data: memberRow } = await supabase
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", session.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          organizationId = memberRow?.organization_id ?? null;

          if (!organizationId) {
            const normalizedError = ensureOrganizationError.message.toLowerCase();
            if (normalizedError.includes("ensure_organization_membership")) {
              setError("Database migration required. Run the latest Supabase migrations and try again.");
            } else {
              setError(ensureOrganizationError.message);
            }
            return;
          }
        }
      }

      if (!organizationId) {
        setError("Could not find or create organization access for this account.");
        return;
      }

      const quotaSnapshot = await loadQuota(organizationId);
      if (quotaSnapshot && quotaSnapshot.remaining <= 0) {
        setError(
          `${toPlanLabel(quotaSnapshot.planTier)} plan monthly limit reached (${quotaSnapshot.monthlyLimit} total trade packs per month).`
        );
        return;
      }

      const baseSlug = toTradePackWorkspaceSlug(trimmedName);
      const { data: existingProjectRows, error: existingProjectsError } = await supabase
        .from("organization_projects")
        .select("slug")
        .eq("organization_id", organizationId)
        .like("slug", `${baseSlug}%`);

      if (existingProjectsError) {
        setError(existingProjectsError.message);
        return;
      }

      const slug = resolveUniqueTradePackWorkspaceSlug(
        baseSlug,
        (existingProjectRows ?? []).map((project) => project.slug)
      );

      const projectId = crypto.randomUUID();

      const { data, error: createProjectError } = await supabase
        .from("organization_projects")
        .insert({
          id: projectId,
          organization_id: organizationId,
          created_by: session.id,
          name: trimmedName,
          slug,
          location: location.trim() || "Unspecified",
          cover_image_url: null,
        })
        .select("slug")
        .single();

      if (createProjectError) {
        const normalizedCreateError = createProjectError.message.toLowerCase();
        if (normalizedCreateError.includes("row-level security") || normalizedCreateError.includes("policy")) {
          const refreshedQuota = await loadQuota(organizationId);
          if (refreshedQuota && refreshedQuota.remaining <= 0) {
            setError(
              `${toPlanLabel(refreshedQuota.planTier)} plan monthly limit reached (${refreshedQuota.monthlyLimit} total trade packs per month).`
            );
            return;
          }
        }

        setError(createProjectError.message);
        return;
      }

      router.push(`/app/projects/${data.slug}/dashboard`);
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create trade pack workspace.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <Link
            href="/app/dashboard"
            className={`${interMedium.className} mb-4 inline-flex w-fit items-center gap-2 rounded-[10px] border border-[#d5dbe6] bg-white px-4 py-2 text-sm font-medium text-[#384055] hover:bg-[#f8faff]`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Main Dashboard
          </Link>
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Create a Trade Pack</CardTitle>
          <p className={`${interMedium.className} max-w-3xl text-base font-medium leading-relaxed text-[#4d5b74]`}>
            Set up a new Trade Pack to analyse drawings, generate scope, and track changes for a specific job or tender.
          </p>
          {quota ? (
            <p className={`${interMedium.className} max-w-3xl text-sm font-medium text-[#5f6f89]`}>
              {toPlanLabel(quota.planTier)} Plan — {quota.monthlyLimit} Trade Packs per month ({quota.remaining} remaining)
            </p>
          ) : (
            <p className={`${interMedium.className} max-w-3xl text-sm font-medium text-[#5f6f89]`}>
              Monthly limits are enforced by plan: Starter 4, Professional 12, Business 30 total trade packs per month.
            </p>
          )}
        </CardHeader>
        <CardContent className="max-w-2xl pb-8">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label htmlFor="projectName" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Project / Tender Name
              </label>
              <Input
                id="projectName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Smith Renovation Workspace"
                className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="projectLocation" className={`${interMedium.className} block text-sm font-medium text-[#1d2433]`}>
                Project Location
              </label>
              <Input
                id="projectLocation"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Auckland"
                className={`${interMedium.className} h-11 rounded-[10px] border-[#cdd4e2] bg-white text-[#1d2433]`}
              />
            </div>

            {error ? (
              <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p>
            ) : null}

            <Button
              type="submit"
              disabled={isSubmitting || isAuthLoading}
              className={`${interMedium.className} h-10 rounded-[10px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#e63f10]`}
            >
              {isSubmitting ? "Creating trade pack..." : isAuthLoading ? "Loading account..." : "Create Trade Pack"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
