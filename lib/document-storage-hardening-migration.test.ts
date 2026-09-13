import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260729170000_harden_document_version_activation_order.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("document Storage Phase 2 activation-order hardening migration", () => {
  it("enforces monotonic current-version advancement at the database layer", () => {
    expect(sql).toContain(
      "create or replace function public.validate_document_current_version_progression()",
    );
    expect(sql).toContain(
      "next_version_number <= previous_version_number",
    );
    expect(sql).toContain(
      "before update of current_version_id on public.document_nodes",
    );
  });

  it("uses a fixed search path", () => {
    expect(sql).toContain("set search_path = public");
  });

  it("does not mutate Storage objects or immutable version content", () => {
    expect(sql).not.toContain("storage.objects");
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\.document_versions\b/iu);
  });
});
