"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useOpportunityWorkspaceData } from "@/components/app/OpportunityWorkspaceDataProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LegacyMasterQuoteRedirectPage() {
  const router = useRouter();
  const opportunity = useOpportunityWorkspaceData();
  const { session, isLoading } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !session?.organizationId) return;
    const organizationId = session.organizationId;
    let cancelled = false;
    const redirectToPrimaryQuote = async () => {
      const rpc = supabase as unknown as {
        rpc(name: "initialize_primary_opportunity_quote_v1", args: {
          p_organization_id: string;
          p_opportunity_id: string;
        }): Promise<{ data: Array<{ revision_id: string }> | null; error: { message: string } | null }>;
      };
      const result = await rpc.rpc("initialize_primary_opportunity_quote_v1", {
        p_organization_id: organizationId,
        p_opportunity_id: opportunity.opportunityId,
      });
      if (cancelled) return;
      const revisionId = result.data?.[0]?.revision_id;
      if (result.error || !revisionId) {
        setError(result.error?.message ?? "The Primary Client quote is unavailable.");
        return;
      }
      router.replace(`/app/leads-clients/opportunities/${opportunity.slug}/quote/${revisionId}`);
    };
    void redirectToPrimaryQuote();
    return () => { cancelled = true; };
  }, [isLoading, opportunity.opportunityId, opportunity.slug, router, session?.organizationId, supabase]);

  if (error) return <p role="alert" className="p-6 text-sm text-red-700">{error}</p>;
  return <p className="p-6 text-sm text-[var(--text-secondary)]">Opening Primary Client quote…</p>;
}
