import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260819190000_defer_award_finalize_until_commercial_scope_is_aligned.sql",
  "utf8",
);

describe("Opportunity award finalization deferral", () => {
  it("defers the quote trigger and finalizes after quote, line, and item scopes align", () => {
    const deferOn = migration.indexOf("set_config('tradesstack.defer_award_pricing_finalize', 'on'");
    const quoteUpdate = migration.indexOf("update public.project_quotes quote", deferOn);
    const lineUpdate = migration.indexOf("update public.project_quote_line_items line", quoteUpdate);
    const itemUpdate = migration.indexOf("update public.commercial_items item", lineUpdate);
    const deferOff = migration.indexOf("set_config('tradesstack.defer_award_pricing_finalize', 'off'", itemUpdate);
    const finalize = migration.indexOf("finalize_opportunity_award_pricing_v1", deferOff);

    expect(deferOn).toBeGreaterThan(-1);
    expect(quoteUpdate).toBeGreaterThan(deferOn);
    expect(lineUpdate).toBeGreaterThan(quoteUpdate);
    expect(itemUpdate).toBeGreaterThan(lineUpdate);
    expect(deferOff).toBeGreaterThan(itemUpdate);
    expect(finalize).toBeGreaterThan(deferOff);
    expect(migration).toContain("current_setting('tradesstack.defer_award_pricing_finalize', true) = 'on'");
  });
});
