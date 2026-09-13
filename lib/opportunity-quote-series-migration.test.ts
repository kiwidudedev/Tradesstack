import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260822130000_add_opportunity_quote_series.sql", import.meta.url),
  "utf8",
);

describe("Opportunity Quote Series migration", () => {
  it("keeps project_quotes as the canonical revision engine", () => {
    expect(migration).toContain("create table public.opportunity_quote_series");
    expect(migration).toContain("add column if not exists quote_series_id uuid null");
    expect(migration).not.toContain("create table public.opportunity_quote_revisions");
    expect(migration).not.toContain("insert into public.opportunity_quotes");
  });

  it("creates the initial series and Rev 1 atomically with database numbering", () => {
    expect(migration).toContain("create or replace function public.create_opportunity_quote_series_v1");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("revision_number, revision_kind, revision_created_by, quote_series_id");
    expect(migration).toContain("set current_revision_id = created_quote.id");
  });

  it("clones revisions transactionally and preserves one-successor idempotence", () => {
    expect(migration).toContain("create or replace function public.create_opportunity_quote_revision_v1");
    expect(migration).toContain("where quote.organization_id = p_organization_id and quote.predecessor_quote_id = predecessor.id");
    expect(migration).toContain("series.base_quote_number || '-R' || next_revision::text");
    expect(migration).toContain("source_quote_id, clone_kind");
  });

  it("protects issued quote, line, worksheet, and source-link evidence", () => {
    for (const status of ["Sent", "Accepted", "Rejected", "Expired"]) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(migration).toContain("reject_issued_quote_revision_mutation");
    expect(migration).toContain("reject_issued_quote_line_mutation");
    expect(migration).toContain("reject_issued_quote_workbook_mutation");
    expect(migration).toContain("reject_issued_quote_workbook_child_mutation");
    expect(migration).toContain("reject_issued_quote_link_mutation");
  });

  it("uses one accepted revision and its series recipient for conversion", () => {
    expect(migration).toContain("accepted_quote_revision_id is distinct from p_accepted_quote_id");
    expect(migration).toContain("set client_id = series.recipient_client_id");
    expect(migration).toContain("award_opportunity_by_lifecycle_pre_quote_series_v1");
  });

  it("provides one-query register and exact history read models", () => {
    expect(migration).toContain("get_opportunity_quote_register_v1");
    expect(migration).toContain("join public.project_quotes current_quote");
    expect(migration).toContain("get_opportunity_quote_revision_history_v1");
    expect(migration).toContain("requested.originating_opportunity_id = p_opportunity_id");
  });
});
