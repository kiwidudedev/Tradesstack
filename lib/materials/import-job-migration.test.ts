import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260814190000_add_material_document_interpretation_jobs.sql", "utf8");

describe("Material interpretation durable lifecycle migration", () => {
  it("defines durable runs, jobs, leases, cancellation and atomic enqueue", () => {
    expect(migration).toContain("organization_material_import_runs");
    expect(migration).toContain("organization_material_import_jobs");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("run_after <= now()");
    expect(migration).toContain("where state in ('queued', 'processing')");
    expect(migration).toContain("lease_expires_at");
    expect(migration).toContain("heartbeat_at");
    expect(migration).toContain("cancel_requested_at");
    expect(migration).toContain("enqueue_material_import_job");
    expect(migration).toContain("source_retention_until");
    expect(migration).toContain("raw_provider_response_retained");
  });
});
