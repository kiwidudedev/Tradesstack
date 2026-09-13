import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260819180000_order_commercial_history_attachment_before_award_finalize.sql",
  "utf8",
);

describe("Opportunity commercial-history award ordering", () => {
  it("moves link scope before the quote update that fires award finalization", () => {
    const itemUpdate = migration.indexOf("update public.commercial_items item");
    const lineUpdate = migration.indexOf("update public.project_quote_line_items line");
    const quoteUpdate = migration.indexOf("update public.project_quotes quote");

    expect(itemUpdate).toBeGreaterThan(-1);
    expect(lineUpdate).toBeGreaterThan(itemUpdate);
    expect(quoteUpdate).toBeGreaterThan(lineUpdate);
  });
});
