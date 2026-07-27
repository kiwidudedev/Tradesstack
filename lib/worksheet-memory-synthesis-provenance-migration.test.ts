import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260608121500_add_full_unique_indexes_for_organization_memory_links.sql",
  "utf8",
);

describe("worksheet memory synthesis provenance migration", () => {
  it("adds a full raw-event unique index that matches the worker upsert target", () => {
    expect(sql).toContain("create unique index if not exists organization_memory_links_item_source_event_uidx");
    expect(sql).toContain("on public.organization_memory_links (organization_memory_item_id, source_event_id);");
  });

  it("adds a full source-entity unique index that matches the worker upsert target", () => {
    expect(sql).toContain("create unique index if not exists organization_memory_links_item_source_entity_role_uidx");
    expect(sql).toContain("on public.organization_memory_links (organization_memory_item_id, source_entity_type, source_entity_id, link_type);");
  });
});
