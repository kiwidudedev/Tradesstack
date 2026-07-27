import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path =
  "supabase/migrations/20260723130000_add_retention_claim_financial_foundation.sql";
const sql = readFileSync(path, "utf8");
const generatedTypes = readFileSync("lib/supabase/types.ts", "utf8");

describe("Retention Claim Phase 3 migration", () => {
  it("adds only the approved financial foundation tables", () => {
    for (const table of [
      "project_retention_claim_counters",
      "retention_claims",
      "retention_claim_allocations",
      "retention_claim_events",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(generatedTypes).toContain(`${table}:`);
    }
    for (const forbidden of [
      "retention_schedules",
      "retention_reminders",
      "retention_variances",
      "retention_claim_payments",
      "organization_accounting_documents",
      "organization_accounting_sync_jobs",
      "xero_invoice_id",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it("uses an independent project-scoped advisory-locked number space", () => {
    expect(sql).toContain("private.generate_retention_claim_number");
    expect(sql).toContain("project_retention_claim_counters");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("':retention_claim'");
    expect(sql).toContain("format('%s-RC-%s'");
    expect(sql).not.toContain(
      "public.generate_project_claim_number",
    );
    expect(sql).not.toContain(
      "public.next_project_document_number",
    );
  });

  it("enforces status, identity, amount, sequence, and submitted immutability", () => {
    expect(sql).toContain("status in ('draft', 'submitted', 'cancelled_draft')");
    expect(sql).toContain("retention_claims_unique_number_per_project");
    expect(sql).toContain("retention_claim_allocations_origin_unique");
    expect(sql).toContain("retention_claim_allocations_sequence_unique");
    expect(sql).toContain("check (allocation_amount > 0)");
    expect(sql).toContain("on delete restrict");
    expect(sql).toContain("Retention Claim is immutable after leaving Draft.");
    expect(sql).toContain(
      "Retention Claim allocations are immutable outside Draft.",
    );
    expect(sql).toContain("Retention Claims cannot be hard-deleted.");
  });

  it("implements atomic stale-state and over-allocation validation", () => {
    expect(sql).toContain("for update of origin");
    expect(sql).toContain("order by origin.id");
    expect(sql).toContain("get_project_retention_position_summary");
    expect(sql).toContain("'stale_draft'");
    expect(sql).toContain("'unresolved_legacy_release'");
    expect(sql).toContain("'retention_overallocated'");
    expect(sql).toContain("submitted_claim.status = 'submitted'");
    expect(sql).toContain("existing_submitted_allocation_before");
    expect(sql).toContain("remaining_after_allocation");
  });

  it("does not invoke or mutate the Payment Claim workflow", () => {
    expect(sql).not.toMatch(
      /\b(update|insert into|delete from)\s+public\.project_claims\b/i,
    );
    expect(sql).not.toContain("recalculate_project_claim_snapshots");
    expect(sql).not.toContain("sync_project_claim_line_items");
    expect(sql).not.toContain("save_project_claim");
    expect(sql).not.toContain("update_project_claim_status");
    expect(sql).not.toContain("apply_xero_sales_invoice_payment_to_claim");
  });

  it("uses explicit permissions, an internal gate, RPC-only writes, and append-only events", () => {
    expect(sql).toContain("'retention.view'");
    expect(sql).toContain("'retention.claims.create'");
    expect(sql).toContain("'retention.claims.submit'");
    expect(sql).toContain("retention_phase3_internal");
    expect(sql).toContain("force row level security");
    expect(sql).toContain(
      "revoke all on public.retention_claims from public, anon, authenticated",
    );
    expect(sql).toContain("Retention Claim events are append-only.");
    expect(sql).not.toContain("grant insert on public.retention_claims to authenticated");
  });

  it("updates generated types for every Phase 3 RPC", () => {
    for (const rpc of [
      "create_retention_claim_draft",
      "get_retention_claim",
      "list_project_retention_claims",
      "update_retention_claim_draft",
      "add_retention_claim_allocation",
      "update_retention_claim_allocation",
      "remove_retention_claim_allocation",
      "reorder_retention_claim_allocations",
      "cancel_retention_claim_draft",
      "submit_retention_claim",
      "get_retention_claim_events",
    ]) {
      expect(generatedTypes).toContain(`${rpc}:`);
    }
  });
});
