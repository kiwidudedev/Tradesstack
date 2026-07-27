import type { QuoteStatus } from "@/lib/supabase/types";

export interface OpportunityWorkspaceLatestQuoteSummary {
  totalQuotePrice: number | null;
  status: QuoteStatus | null;
  quoteDate: string | null;
  updatedAt: string | null;
}

export interface OpportunityWorkspaceData {
  organizationId: string;
  opportunityId: string;
  slug: string;
  name: string;
  clientId: string | null;
  clientName: string;
  ownerUserId: string | null;
  ownerName: string;
  workspaceProjectId: string | null;
  workspaceProjectSlug: string | null;
  latestQuoteSummary: OpportunityWorkspaceLatestQuoteSummary | null;
}
