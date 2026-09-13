import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260826160000_add_atomic_multi_quote_worksheet_publication.sql", import.meta.url),
  "utf8",
);

describe("atomic multi-Quote worksheet publication migration", () => {
  it("validates and locks every fresh exact destination before any mutation", () => {
    const validationLoop = migration.indexOf("-- Validate and lock every fresh destination");
    const mutationLoop = migration.indexOf("-- Each call retains destination-scoped idempotency");

    expect(validationLoop).toBeGreaterThan(0);
    expect(mutationLoop).toBeGreaterThan(validationLoop);
    expect(migration).toContain("order by item.value->>'quoteId'");
    expect(migration).toContain("quote.organization_id = resolved_organization_id");
    expect(migration).toContain("quote.originating_opportunity_id = resolved_opportunity_id");
    expect(migration).toContain("quote.updated_at = (destination->>'expectedUpdatedAt')::timestamptz");
    expect(migration).toContain("series.current_revision_id = quote.id");
    expect(migration).toContain("quote.award_locked_at is null");
    expect(migration).toContain("series.archived_at is null");
    expect(migration).toContain("for update of quote, series");
  });

  it("rejects crafted or duplicate destination identities as one request", () => {
    expect(migration).toContain("Quote destinations and request keys must be unique");
    expect(migration).toContain("matching organization, Opportunity, Quote, request key, and expected version");
    expect(migration).toContain("request key belongs to a different Quote destination");
    expect(migration).toContain("using errcode = 'TS409'");
  });

  it("reuses the hardened destination-scoped RPC inside the enclosing transaction", () => {
    expect(migration).toContain("public.publish_worksheet_commercial_quote_v1(destination)");
    expect(migration).toContain("public.worksheet_quote_publication_requests");
    expect(migration).toContain("grant execute on function public.publish_worksheet_commercial_quotes_v1(jsonb) to authenticated");
  });
});
