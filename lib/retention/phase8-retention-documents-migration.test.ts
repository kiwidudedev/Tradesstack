import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260724130000_add_retention_claim_documents.sql",
  ),
  "utf8",
);

describe("Phase 8 Retention Claim document migration", () => {
  it("adds isolated immutable document evidence and events", () => {
    expect(migration).toContain(
      "create table public.retention_claim_documents",
    );
    expect(migration).toContain(
      "create table public.retention_claim_document_events",
    );
    expect(migration).toContain(
      "Retention Claim document evidence is append-only.",
    );
    expect(migration).toContain(
      "Retention Claim document events are append-only.",
    );
    expect(migration).toContain(
      "alter table public.retention_claim_documents force row level security",
    );
    expect(migration).toContain(
      "alter table public.retention_claim_document_events force row level security",
    );
  });

  it("uses explicit generation permission and an internal Phase 8 gate", () => {
    expect(migration).toContain(
      "'retention.claims.documents.generate'",
    );
    expect(migration).toContain(
      "private.retention_phase8_gate_enabled()",
    );
    expect(migration).toContain(
      "'retention.claims.documents.generate',\n    true",
    );
    expect(migration).toContain("auth.role() is distinct from 'service_role'");
    expect(migration).toContain(
      ") from public, anon, authenticated;\ngrant execute on function public.record_retention_claim_document",
    );
    expect(migration).toContain(") to service_role;");
  });

  it("hashes canonical submitted claim and allocation snapshots", () => {
    expect(migration).toContain(
      "private.retention_claim_document_source",
    );
    expect(migration).toContain("'submissionStateHash'");
    expect(migration).toContain("'originClaimNumberSnapshot'");
    expect(migration).toContain("'originRetentionOwnedSnapshot'");
    expect(migration).toContain("'existingSubmittedAllocationBefore'");
    expect(migration).toContain("'remainingAfterAllocation'");
    expect(migration).toContain("'eligibilityScheduleIdsSnapshot'");
    expect(migration).toContain("'sourceEvidenceHash'");
    expect(migration).toContain("pdf_sha256 text not null");
  });

  it("creates a private content-addressed PDF bucket", () => {
    expect(migration).toContain(
      "'retention-claim-documents',\n  'retention-claim-documents',\n  false",
    );
    expect(migration).toContain("array['application/pdf']");
    expect(migration).toContain("expected_storage_path := concat(");
    expect(migration).toContain("expected_source_hash, '.pdf'");
  });

  it("does not introduce Phase 9+ or mutate existing financial authorities", () => {
    expect(migration).not.toMatch(/update\s+public\.project_claims/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.project_claims/i);
    expect(migration).not.toContain("recalculate_project_claim");
    expect(migration).not.toMatch(/insert\s+into\s+public\..*xero/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\..*invoice/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\..*payment/i);
    expect(migration).not.toContain("paid_amount");
  });
});
