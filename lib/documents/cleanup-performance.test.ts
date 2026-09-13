import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const worker = fs.readFileSync(
  path.join(process.cwd(), "lib/documents/cleanup-worker.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730110000_complete_document_storage_lifecycle.sql",
  ),
  "utf8",
);

describe("document lifecycle performance contracts", () => {
  it("uses a bounded concurrent worker pool and bounded claims", () => {
    expect(worker).toContain("const concurrency = 20");
    expect(worker).toContain("params.limit ?? 500");
    expect(worker).toContain("jobs.slice(offset, offset + concurrency)");
    expect(migration.toLowerCase()).toContain("for update skip locked");
    expect(migration).toContain("p_limit > 500");
  });

  it("keeps listing, purge, and reconciliation set-based", () => {
    expect(migration).toContain("count(*) over()");
    expect(migration).toContain("batch_counts as (");
    expect(migration).toContain("batch_sizes as (");
    expect(migration).toContain("document_nodes_deleted_batch_root_idx");
    expect(migration).toContain("document_versions_storage_reconciliation_idx");
    expect(migration).toContain(
      "document_storage_reconciliation_findings_version_idx",
    );
    expect(migration).toContain("order by exists (");
    expect(migration).toContain("insert into public.document_storage_cleanup_jobs");
    expect(migration).not.toContain("offset p_offset +");
  });
});
