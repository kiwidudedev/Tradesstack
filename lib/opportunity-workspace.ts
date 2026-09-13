import type { QuoteStatus } from "@/lib/quote-editor-core";
import type { Database } from "@/lib/supabase/types";

type OpportunityStage = Database["public"]["Tables"]["organization_opportunities"]["Row"]["stage"];

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
  stage: OpportunityStage;
  convertedProjectId: string | null;
  clientId: string | null;
  clientName: string;
  ownerUserId: string | null;
  ownerName: string;
  workspaceProjectId: string | null;
  workspaceProjectSlug: string | null;
  latestQuoteSummary: OpportunityWorkspaceLatestQuoteSummary | null;
}
