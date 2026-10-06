import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261004123000_add_assistant_v1_foundation.sql", import.meta.url), "utf8");
const statusMigration = readFileSync(new URL("../../supabase/migrations/20261006120000_harden_assistant_tool_execution_status.sql", import.meta.url), "utf8");

describe("assistant V1 foundation migration", () => {
  it("stores tenant-scoped configuration and tool provenance", () => {
    expect(migration).toContain("create table if not exists public.assistant_configuration");
    expect(migration).toContain("create table if not exists public.assistant_tool_calls");
    expect(migration).toContain("alter table public.assistant_tool_calls force row level security");
    expect(migration).toContain("actor_user_id = auth.uid()");
  });

  it("does not introduce write-capable assistant tools", () => {
    expect(migration).not.toMatch(/execute_sql|query_database|create_record|update_record|delete_record/i);
  });

  it("preserves distinct read execution outcomes", () => {
    expect(statusMigration).toContain("requested");
    expect(statusMigration).toContain("started");
    expect(statusMigration).toContain("succeeded");
    expect(statusMigration).toContain("empty");
    expect(statusMigration).toContain("failed");
    expect(statusMigration).toContain("truncated");
    expect(statusMigration).toContain("project_briefing");
  });
});
