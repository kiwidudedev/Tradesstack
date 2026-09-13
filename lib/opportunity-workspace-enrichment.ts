import type { QuoteStatus } from "@/lib/quote-editor-core";

type OptionalQueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

export type OpportunityWorkspaceEnrichment = {
  clientName: string;
  ownerName: string;
  workspaceProjectSlug: string | null;
  latestQuoteSummary: {
    totalQuotePrice: number | null;
    status: QuoteStatus | null;
    quoteDate: string | null;
    updatedAt: string | null;
  } | null;
  warnings: Array<{ query: string; message: string }>;
};

export function resolveOpportunityWorkspaceEnrichment(params: {
  client: OptionalQueryResult<{ company_name: string | null }>;
  owner: OptionalQueryResult<{ display_name: string | null }>;
  latestQuote: OptionalQueryResult<{
    total_quote_price: number | null;
    status: string | null;
    quote_date: string | null;
    updated_at: string | null;
  }>;
  workspaceProject: OptionalQueryResult<{ slug: string }>;
}): OpportunityWorkspaceEnrichment {
  const results = [
    ["client", params.client],
    ["owner", params.owner],
    ["latestQuote", params.latestQuote],
    ["workspaceProject", params.workspaceProject],
  ] as const;
  const warnings = results.flatMap(([query, result]) =>
    result.error ? [{ query, message: result.error.message }] : [],
  );
  const latestQuote = params.latestQuote.error ? null : params.latestQuote.data;

  return {
    clientName: params.client.error
      ? "Unassigned"
      : params.client.data?.company_name?.trim() || "Unassigned",
    ownerName: params.owner.error
      ? "Unassigned"
      : params.owner.data?.display_name || "Unassigned",
    workspaceProjectSlug: params.workspaceProject.error
      ? null
      : params.workspaceProject.data?.slug ?? null,
    latestQuoteSummary: latestQuote
      ? {
          totalQuotePrice:
            typeof latestQuote.total_quote_price === "number"
              ? latestQuote.total_quote_price
              : null,
          status: (latestQuote.status as QuoteStatus | null) ?? null,
          quoteDate: latestQuote.quote_date ?? null,
          updatedAt: latestQuote.updated_at ?? null,
        }
      : null,
    warnings,
  };
}
