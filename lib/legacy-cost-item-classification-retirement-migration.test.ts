import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260823170000_retire_legacy_cost_item_classification.sql"),
  "utf8",
);
const mirrorCleanupMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260823171000_finalize_cost_item_mirror_schema_cleanup.sql"),
  "utf8",
);
const convertedQuoteRoutingMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260823172000_route_converted_project_quote_cost_items.sql"),
  "utf8",
);

const editorFiles = [
  "components/app/OpportunityQuoteRevisionEditor.tsx",
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx",
  "app/app/(workspace)/projects/[projectId]/preconstruction/variations/[variationId]/page.tsx",
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx",
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/PaymentClaimDetailClient.tsx",
];

describe("legacy Cost Item classification retirement", () => {
  it("removes the complete legacy Cost Item schema contract", () => {
    for (const column of [
      "work_type",
      "cost_type",
      "cost_code",
      "classification_confidence",
      "classification_source",
      "needs_review",
      "original_classification",
      "final_classification",
    ]) {
      expect(migration).toContain(`drop column if exists ${column}`);
    }

    expect(migration).toContain("drop index if exists public.cost_items_review_queue_idx");
    expect(migration).toContain("drop table if exists public.organization_cost_code_mapping_rules");
  });

  it("preserves complete Financial Routing identity through reversal and successor creation", () => {
    const reversal = migration.slice(
      migration.indexOf("create or replace function public.reverse_supplier_invoice_actual_cost_event"),
      migration.indexOf("grant execute on function public.reverse_supplier_invoice_actual_cost_event"),
    );

    for (const field of [
      "tradesstack_cost_code",
      "tradesstack_cost_code_label",
      "financial_routing_confidence",
      "financial_routing_source",
      "accounting_mapping_id",
      "organization_cost_code_id",
      "review_status",
      "review_reason",
    ]) {
      expect(reversal).toContain(field);
    }

    expect(reversal).not.toContain("work_type");
    expect(reversal).not.toContain("cost_type");
    expect(reversal).not.toContain("internal_cost_code");
    expect(reversal).not.toContain("classification_status");
  });

  it("keeps routing in document-save SQL and removes browser classifier calls", () => {
    expect(migration).toContain("resolve_cost_item_financial_routing_defaults");
    expect(migration).toContain("upsert_opportunity_quote_cost_items(uuid,text)");
    expect(migration).toContain("upsert_cost_items_for_document(text,uuid,text)");
    expect(migration).toContain("upsert_cost_items_for_project_variation(uuid,text)");
    expect(migration).toContain("upsert_cost_items_for_project_purchase_order(uuid,text)");
    expect(migration).toContain("upsert_cost_items_for_project_claim(uuid,text)");
    expect(mirrorCleanupMigration).toContain("upsert_project_quote_cost_items_from_opportunity(uuid,uuid,uuid)");
    expect(mirrorCleanupMigration).toContain("cost_code");
    expect(mirrorCleanupMigration).toContain("cost_type");
    expect(convertedQuoteRoutingMigration).toContain("upsert_cost_items_for_document");
    expect(convertedQuoteRoutingMigration).toContain("'project_quote'");

    for (const file of editorFiles) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source).not.toContain("triggerDocumentClassification");
      expect(source).not.toContain("/api/cost-items/classify-document");
    }
  });

  it("replaces legacy review observability with Financial Routing metrics", () => {
    expect(migration).toContain("avg(ci.financial_routing_confidence) as avg_routing_confidence");
    expect(migration).toContain("ci.financial_routing_source");
    expect(migration).toContain("ci.review_status in ('needs_routing_review', 'needs_accounting_mapping', 'high_value_review')");
  });
});
