import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reversalFoundation = readFileSync(
  new URL("../supabase/migrations/20260517113000_add_actual_cost_reversal_foundation.sql", import.meta.url),
  "utf8",
);
const currentReversalRpc = readFileSync(
  new URL("../supabase/migrations/20260823170000_retire_legacy_cost_item_classification.sql", import.meta.url),
  "utf8",
).slice(readFileSync(
  new URL("../supabase/migrations/20260823170000_retire_legacy_cost_item_classification.sql", import.meta.url),
  "utf8",
).indexOf("create or replace function public.reverse_supplier_invoice_actual_cost_event"));

describe("Phase 0 Actual Cost correction behavior", () => {
  it("keeps posting and reversal idempotency enforced by partial unique indexes", () => {
    expect(reversalFoundation).toMatch(/create unique index if not exists project_actual_cost_events_posting_allocation_uidx[\s\S]*event_type = 'posting'/);
    expect(reversalFoundation).toMatch(/create unique index if not exists project_actual_cost_events_reversal_once_uidx[\s\S]*event_type = 'reversal'/);
    expect(currentReversalRpc).toContain("This actual cost event has already been reversed.");
    expect(currentReversalRpc).toContain("for update");
  });

  it("freezes the reversal as the exact negative financial/source snapshot", () => {
    expect(currentReversalRpc).toContain("original_event.amount * -1, original_event.tax_amount * -1, original_event.total_amount * -1");
    expect(currentReversalRpc).toContain("case when original_event.quantity is null then null else original_event.quantity * -1 end");
    for (const field of [
      "purchase_order_id", "purchase_order_line_item_id", "project_id", "supplier_id",
      "cost_item_id", "source_cost_item_id", "tradesstack_cost_code", "tradesstack_cost_code_label",
      "financial_routing_confidence", "financial_routing_source", "organization_cost_code_id",
      "accounting_mapping_id", "event_date", "posting_source", "source_invoice_line_id",
      "source_invoice_allocation_id", "source_type", "source_reference",
    ]) {
      expect(currentReversalRpc).toContain(`original_event.${field}`);
    }
    expect(currentReversalRpc).toContain("original_event.id, correction_root_id");
  });

  it("freezes successor allocation provenance while resetting approval state", () => {
    expect(currentReversalRpc).toContain("coalesce(source_allocation.allocation_group_id, source_allocation.id), source_allocation.id, next_allocation_sequence");
    expect(currentReversalRpc).toContain("source_allocation.cost_item_id, source_allocation.source_cost_item_id");
    expect(currentReversalRpc).toContain("source_allocation.organization_cost_code_id, source_allocation.accounting_mapping_id");
    expect(currentReversalRpc).toContain("'pending', '', source_allocation.approval_checks_json");
    expect(currentReversalRpc).toContain("source_allocation.ai_construction_intelligence, 'editable'");
  });
});

