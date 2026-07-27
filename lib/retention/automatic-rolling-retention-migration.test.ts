import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260724160000_add_automatic_rolling_retention_claims.sql",
  ),
  "utf8",
);

describe("automatic rolling Retention Claim migration", () => {
  it("separates zero-value origin membership from positive financial allocations", () => {
    expect(sql).toContain("create table public.retention_rolling_draft_origins");
    expect(sql).not.toContain("drop constraint retention_claim_allocations_amount_positive");
    expect(sql).not.toContain("allocation_amount >= 0");
    expect(sql).toContain("latest_retention_owned numeric(14,2) not null");
  });

  it("enforces one active automatic Draft and deterministic origin identity", () => {
    expect(sql).toContain("retention_claims_one_active_automatic_draft_idx");
    expect(sql).toContain(
      "where status = 'draft' and draft_kind = 'automatic_rolling'",
    );
    expect(sql).toContain(
      "unique (retention_claim_id, originating_payment_claim_id)",
    );
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("claim_date asc nulls last");
  });

  it("projects only confirmed positive-retention Payment Claims", () => {
    expect(sql).toContain(
      "origin.status not in ('Submitted', 'Unpaid', 'Paid', 'Overdue')",
    );
    expect(sql).toContain(
      "round(coalesce(origin.retention_withheld_amount, 0), 2) <= 0",
    );
    expect(sql).toContain(
      "project_claims_retention_rolling_draft_projection",
    );
    expect(sql).toContain("p_operation = 'refresh'");
  });

  it("never mutates submitted claims and creates the next numbered Draft", () => {
    expect(sql).toContain("and claim.status = 'draft'");
    expect(sql).toContain("and claim.draft_kind = 'automatic_rolling'");
    expect(sql).toContain("private.generate_retention_claim_number");
    expect(sql).toContain(
      "Automatic Retention origin membership is immutable outside Draft.",
    );
  });

  it("keeps Payment Claim confirmation successful and records retry evidence", () => {
    expect(sql).toContain("create table public.retention_rolling_draft_jobs");
    expect(sql).toContain("create table public.retention_rolling_draft_events");
    expect(sql).toContain("retry_scheduled");
    expect(sql).toContain(
      "A failure cannot roll back the authoritative Payment Claim transition.",
    );
    expect(sql).toContain("process_retention_rolling_draft_jobs");
    expect(sql).toContain("for update skip locked");
  });

  it("keeps Draft creation free of PDF, Xero, invoice and payment side effects", () => {
    const maintenance = sql.slice(
      sql.indexOf("create or replace function private.maintain_retention_rolling_draft"),
      sql.indexOf("create or replace function private.enqueue_retention_rolling_draft"),
    );
    expect(maintenance).not.toMatch(/xero|pdf|invoice|payment_reconciliation/i);
    expect(maintenance).toContain("'draft'");
  });

  it("preserves capability, project-mode, RLS and service-role boundaries", () => {
    expect(sql).toContain("capability.enabled");
    expect(sql).toContain("workflow.mode = 'observe'");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("public.has_org_permission(organization_id, 'retention.view')");
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
  });
});
