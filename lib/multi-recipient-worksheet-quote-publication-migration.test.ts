import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260826120000_harden_multi_recipient_worksheet_quote_publication.sql", import.meta.url),
  "utf8",
);

describe("multi-recipient worksheet quote publication migration", () => {
  it("revalidates the exact existing quote against its active current tender series", () => {
    expect(migration).toContain("create or replace function public.publish_worksheet_commercial_quote_v1");
    expect(migration).toContain("quote.organization_id = resolved_organization_id");
    expect(migration).toContain("quote.id = resolved_quote_id");
    expect(migration).toContain("quote.originating_opportunity_id = resolved_opportunity_id");
    expect(migration).toContain("quote.revision_kind = 'tender'");
    expect(migration).toContain("quote.status = 'Draft'");
    expect(migration).toContain("quote.award_locked_at is null");
    expect(migration).toContain("series.opportunity_id = resolved_opportunity_id");
    expect(migration).toContain("series.current_revision_id = quote.id");
    expect(migration).toContain("series.archived_at is null");
  });

  it("locks the quote and series before preserving the existing save boundary", () => {
    const lockIndex = migration.indexOf("for update of quote, series");
    const saveIndex = migration.indexOf("public.save_commercial_quote_draft");

    expect(lockIndex).toBeGreaterThan(0);
    expect(saveIndex).toBeGreaterThan(lockIndex);
    expect(migration).toContain("p_expected_updated_at => nullif(p_input->>'expectedUpdatedAt', '')::timestamptz");
    expect(migration).toContain("public.link_commercial_item_to_quote_line");
    expect(migration).toContain("public.validate_and_record_quote_publication_v1");
  });

  it("preserves destination-scoped idempotency before first-time validation", () => {
    const idempotencyLookupIndex = migration.indexOf("select request.* into existing_request");
    const destinationValidationIndex = migration.indexOf("select quote.* into destination_quote");

    expect(idempotencyLookupIndex).toBeGreaterThan(0);
    expect(destinationValidationIndex).toBeGreaterThan(idempotencyLookupIndex);
    expect(migration).toContain("request.request_key = resolved_request_key");
    expect(migration).toContain("insert into public.worksheet_quote_publication_requests");
  });
});
