import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function readAll(table, columns, configure = (query) => query) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await configure(client.from(table).select(columns)).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

const [lines, sourceLinks, quotes, manifests] = await Promise.all([
  readAll("project_quote_line_items", "id,organization_id,quote_id,pricing_source_kind"),
  readAll(
    "commercial_item_document_links",
    "organization_id,document_id,document_line_id,commercial_item_id",
    (query) => query.eq("document_kind", "quote_line").eq("link_role", "source"),
  ),
  readAll("project_quotes", "id,organization_id,status,award_locked_at"),
  readAll("opportunity_award_pricing_manifests", "organization_id,accepted_quote_id,classification"),
]);

const key = (organizationId, id) => `${organizationId}:${id}`;
const sourceLineKeys = new Set(sourceLinks.map((link) => key(link.organization_id, link.document_line_id)));
const quoteByKey = new Map(quotes.map((quote) => [key(quote.organization_id, quote.id), quote]));
const manifestByQuoteKey = new Map(manifests.map((manifest) => [key(manifest.organization_id, manifest.accepted_quote_id), manifest]));
const mismatches = lines
  .filter((line) => sourceLineKeys.has(key(line.organization_id, line.id)) && line.pricing_source_kind !== "worksheet")
  .map((line) => {
    const quote = quoteByKey.get(key(line.organization_id, line.quote_id));
    const manifest = manifestByQuoteKey.get(key(line.organization_id, line.quote_id));
    return {
      organizationId: line.organization_id,
      quoteId: line.quote_id,
      quoteLineId: line.id,
      recordedSourceKind: line.pricing_source_kind,
      evidenceSourceKind: "worksheet",
      quoteStatus: quote?.status ?? null,
      awardLocked: Boolean(quote?.award_locked_at),
      awardClassification: manifest?.classification ?? null,
    };
  });

const classificationCounts = lines.reduce((counts, line) => {
  counts[line.pricing_source_kind] = (counts[line.pricing_source_kind] ?? 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: "read-only",
  authority: "commercial_item_document_links(source) > project_quote_line_items.pricing_source_kind",
  quoteLineCount: lines.length,
  sourceLinkCount: sourceLinks.length,
  classificationCounts,
  mismatchCount: mismatches.length,
  lockedMismatchCount: mismatches.filter((row) => row.awardLocked).length,
  mismatches,
}, null, 2));
