import { cache } from "react";
import { selectCanonicalProjectQuote } from "@/lib/project-quote-route-selection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type LegacyDraftClassificationRow = {
  is_legacy_automatic_draft: boolean;
};

async function loadCanonicalProjectQuoteId(organizationId: string, projectId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("project_quotes")
    .select("id, status, revision_kind, revision_number, award_locked_at, updated_at, created_at")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .order("revision_number", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Unable to resolve the Project quote: ${error.message}`);
  const quotes = data ?? [];
  const possibleAutomaticIds = quotes
    .filter((quote) => quote.status === "Draft" && quote.revision_kind === "project_working")
    .map((quote) => quote.id);

  if (possibleAutomaticIds.length === 0) {
    return selectCanonicalProjectQuote(quotes)?.id ?? null;
  }

  const untouchedAutomaticIds = new Set<string>();
  const classifications = await Promise.all(possibleAutomaticIds.map(async (quoteId) => {
    const { data, error: classificationError } = await supabase.rpc(
      "classify_legacy_automatic_project_quote_draft_v1" as never,
      { p_organization_id: organizationId, p_quote_id: quoteId } as never,
    );
    if (classificationError) {
      throw new Error(`Unable to classify legacy award Draft ${quoteId}: ${classificationError.message}`);
    }
    const row = (Array.isArray(data) ? data[0] : null) as LegacyDraftClassificationRow | null;
    return { quoteId, isLegacy: row?.is_legacy_automatic_draft === true };
  }));
  for (const classification of classifications) {
    if (classification.isLegacy) untouchedAutomaticIds.add(classification.quoteId);
  }

  return selectCanonicalProjectQuote(quotes.map((quote) => ({
    ...quote,
    is_untouched_automatic_award_draft: untouchedAutomaticIds.has(quote.id),
  })))?.id ?? null;
}

const resolveCanonicalProjectQuoteIdCached = cache(loadCanonicalProjectQuoteId);

export function resolveCanonicalProjectQuoteId(input: {
  organizationId: string;
  projectId: string;
}) {
  return resolveCanonicalProjectQuoteIdCached(input.organizationId, input.projectId);
}
