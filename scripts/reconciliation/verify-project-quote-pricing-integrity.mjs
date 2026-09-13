import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase verification environment is incomplete.");

const organizationId = process.env.PRICING_INTEGRITY_ORGANIZATION_ID ?? "5c5de347-9f21-48fa-aac9-ba87e91fe92a";
const sourceWorkbookId = process.env.PRICING_INTEGRITY_SOURCE_WORKBOOK_ID ?? "1b64bbbf-b130-4204-9722-1090e2ea5a97";
const continuationId = process.env.PRICING_INTEGRITY_CONTINUATION_ID ?? "35e078c3-2da9-0e66-aaf2-25343c076c96";
const acceptedQuoteId = process.env.PRICING_INTEGRITY_ACCEPTED_QUOTE_ID ?? "5d4e1db4-5294-41f9-95fa-3aab762146d3";
const workingQuoteId = process.env.PRICING_INTEGRITY_WORKING_QUOTE_ID ?? "effe5574-0d5c-4000-4251-165d55fbb724";
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const [{ data: workbooks, error: workbookError }, { data: quotes, error: quoteError }, { data: manifests, error: manifestError }] = await Promise.all([
  client.from("opportunity_pricing_worksheets")
    .select("id,opportunity_id,project_id,quote_id,source_workbook_id,clone_kind,award_locked_at,version,worksheet_data,updated_at")
    .eq("organization_id", organizationId)
    .in("id", [sourceWorkbookId, continuationId]),
  client.from("project_quotes")
    .select("id,project_id,status,award_locked_at,predecessor_quote_id,revision_kind,revision_number,subtotal,gst_amount,total_quote_price,updated_at")
    .eq("organization_id", organizationId)
    .in("id", [acceptedQuoteId, workingQuoteId]),
  client.from("opportunity_award_pricing_manifests")
    .select("id,accepted_quote_id,working_quote_id,classification,source_workbook_count,worksheet_line_count,manual_line_count,quote_subtotal_snapshot,quote_gst_snapshot,quote_total_snapshot,created_at")
    .eq("organization_id", organizationId)
    .eq("accepted_quote_id", acceptedQuoteId),
]);
if (workbookError || quoteError || manifestError) throw workbookError ?? quoteError ?? manifestError;

const lineResult = await client.from("project_quote_line_items")
  .select("id,quote_id,pricing_source_kind")
  .eq("organization_id", organizationId)
  .in("quote_id", [acceptedQuoteId, workingQuoteId]);
if (lineResult.error) throw lineResult.error;
const lineIds = (lineResult.data ?? []).map((line) => line.id);
const linkResult = lineIds.length === 0
  ? { data: [], error: null }
  : await client.from("commercial_item_document_links")
      .select("document_id,document_line_id,commercial_item_id")
      .eq("organization_id", organizationId)
      .eq("document_kind", "quote_line")
      .eq("link_role", "source")
      .in("document_line_id", lineIds);
if (linkResult.error) throw linkResult.error;
const commercialItemIds = (linkResult.data ?? []).map((link) => link.commercial_item_id);
const itemResult = commercialItemIds.length === 0
  ? { data: [], error: null }
  : await client.from("commercial_items")
      .select("id,source_workbook_id,source_sheet_id,source_range,source_signature")
      .eq("organization_id", organizationId)
      .in("id", commercialItemIds);
if (itemResult.error) throw itemResult.error;

const workbookHash = (row) => createHash("sha256").update(JSON.stringify(row.worksheet_data)).digest("hex");
console.log(JSON.stringify({
  mode: "read-only",
  workbooks: (workbooks ?? []).map((row) => ({ ...row, worksheet_data: undefined, worksheetHash: workbookHash(row) })),
  quotes,
  manifests,
  quoteLines: lineResult.data,
  sourceLinks: linkResult.data,
  commercialSources: itemResult.data,
}, null, 2));
