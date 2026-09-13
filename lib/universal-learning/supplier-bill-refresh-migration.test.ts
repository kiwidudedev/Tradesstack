import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260728120000_add_supplier_bill_ucl_refresh_outbox.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("Supplier Bill UCL refresh outbox migration", () => {
  it("creates a durable identity-coalesced outbox and metadata-only current state", () => {
    expect(sql).toContain("create table if not exists public.supplier_bill_ucl_refresh_queue");
    expect(sql).toContain("create table if not exists public.supplier_bill_ucl_current_state");
    expect(sql).toContain("(organization_id, container_type, source_id)");
    expect(sql).toContain("on conflict (organization_id, container_type, source_id)");
    expect(sql).toContain("greatest(public.supplier_bill_ucl_refresh_queue.priority, excluded.priority)");
    expect(sql).toContain("excluded.priority >= public.supplier_bill_ucl_refresh_queue.priority");
    expect(sql).toContain("else public.supplier_bill_ucl_refresh_queue.reason_code");
    expect(sql).toContain("queue_state = 'dead_letter' then 'dead_letter'");
    expect(sql).toContain("first_requested_at timestamptz not null default now()");
    expect(sql).toContain("else public.supplier_bill_ucl_refresh_queue.first_requested_at");
    expect(sql).toContain("last_requested_at = now()");
    expect(sql).not.toMatch(/\b(raw_payload|container_payload|ocr_payload|payload_json)\b/i);
  });

  it("enforces the complete bounded reason vocabulary in the database", () => {
    for (const reason of [
      "supplier_bill_created",
      "supplier_bill_header_changed",
      "supplier_bill_lines_changed",
      "supplier_bill_supplier_changed",
      "supplier_bill_project_scope_changed",
      "supplier_bill_document_changed",
      "supplier_bill_extraction_changed",
      "supplier_bill_po_match_changed",
      "supplier_bill_allocation_changed",
      "supplier_bill_routing_changed",
      "supplier_bill_site_review_changed",
      "supplier_bill_accounts_approval_changed",
      "supplier_bill_commercial_approval_changed",
      "supplier_bill_commercial_snapshot_changed",
      "supplier_bill_variance_changed",
      "supplier_bill_actual_cost_changed",
      "supplier_bill_xero_export_changed",
      "supplier_bill_xero_attachment_changed",
      "supplier_bill_payment_changed",
      "supplier_bill_voided",
      "supplier_bill_deleted",
      "supplier_bill_manual_refresh",
    ]) {
      expect(sql).toContain(`'${reason}'`);
    }
    expect(sql).toContain("constraint supplier_bill_ucl_refresh_queue_reason_check");
  });

  it("uses atomic triggers across every canonical Supplier Bill dependency family", () => {
    for (const table of [
      "supplier_invoices",
      "supplier_invoice_lines",
      "supplier_invoice_documents",
      "supplier_invoice_document_extractions",
      "supplier_invoice_purchase_order_matches",
      "supplier_invoice_line_allocations",
      "supplier_invoice_site_review_submissions",
      "supplier_invoice_site_review_decisions",
      "supplier_invoice_accounts_approvals",
      "supplier_invoice_commercial_approvals",
      "supplier_invoice_commercial_line_snapshots",
      "supplier_invoice_commercial_variances",
      "supplier_invoice_activity_events",
      "project_actual_cost_events",
      "organization_accounting_documents",
      "organization_accounting_document_lines",
      "project_purchase_orders",
      "project_purchase_order_line_items",
      "organization_suppliers",
      "organization_projects",
    ]) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain("after insert or update or delete");
    expect(sql).toContain("perform public._enqueue_supplier_bill_ucl_refresh");
    expect(sql).toContain("tg_op = 'DELETE' and tg_table_name in");
    expect(sql).toContain("supplier_bill_payment_changed");
    expect(sql).toContain("supplier_bill_xero_attachment_changed");
    expect(sql).toContain("supplier_bill_routing_changed");
  });

  it("provides atomic claim, lease recovery, deterministic order and lease-owned finalize", () => {
    expect(sql).toContain("create or replace function public.claim_supplier_bill_ucl_refresh_batch");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("q.lease_expires_at <= now()");
    expect(sql).toContain("order by q.priority desc, q.first_requested_at asc, q.source_id asc");
    expect(sql).toContain("q.lease_token = p_lease_token");
    expect(sql).toContain("Supplier Bill refresh lease is not owned by this worker");
    expect(sql).toContain("create or replace function public.requeue_supplier_bill_ucl_refresh_dead_letter");
    expect(sql).toContain("and q.queue_state = 'dead_letter'");
  });

  it("distinguishes confirmed deletion from an unproven missing source", () => {
    expect(sql).toContain("deletion_evidence_at");
    expect(sql).toContain("if queued.deletion_evidence_at is null");
    expect(sql).toContain("Supplier Bill deletion cannot be finalized without atomic deletion evidence");
    expect(sql).toContain("context_status = 'deleted'");
    expect(sql).toContain("content_hash = null");
    expect(sql).toContain("Supplier Bill deletion cannot be finalized while a canonical source exists");
  });

  it("forces RLS and exposes queue functions to service_role only", () => {
    expect(sql).toContain("alter table public.supplier_bill_ucl_refresh_queue force row level security");
    expect(sql).toContain("alter table public.supplier_bill_ucl_current_state force row level security");
    expect(sql).toContain(
      "revoke all on public.supplier_bill_ucl_refresh_queue from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.enqueue_supplier_bill_ucl_refresh(uuid, text, integer)",
    );
    expect(sql).toContain(
      "grant execute on function public.enqueue_supplier_bill_ucl_refresh(uuid, text, integer) to service_role",
    );
    expect(sql).not.toMatch(/grant execute on function public\.(claim|finalize)_supplier_bill_ucl_refresh[^;]+authenticated/i);
  });

  it("provides bounded operational metrics without storing or returning container content", () => {
    expect(sql).toContain("create or replace function public.get_supplier_bill_ucl_refresh_metrics");
    expect(sql).toContain("'oldestPendingAt'");
    expect(sql).toContain("'averageSuccessfulLatencySeconds'");
    expect(sql).toContain("'attemptsByReason'");
    expect(sql).toContain("'failuresByCode'");
    expect(sql).not.toMatch(/jsonb_build_object\([^;]*(raw|payload|description|notes|xero)/is);
  });

  it("does not couple refresh triggers to monthly learning or model inference", () => {
    expect(sql).not.toContain("learning_review_queue");
    expect(sql).not.toContain("learning_review_cursors");
    expect(sql).not.toContain("organization_memory");
    expect(sql).not.toMatch(/anthropic|openai|embedding/i);
  });
});
