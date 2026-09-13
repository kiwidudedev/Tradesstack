import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260829150000_complete_project_qa_operational_execution.sql", "utf8");
const ambiguityFix = readFileSync("supabase/migrations/20260829151000_fix_project_qa_operational_rpc_ambiguity.sql", "utf8");
const readyFix = readFileSync("supabase/migrations/20260829152000_reject_contradictory_project_qa_photo_rules.sql", "utf8");

describe("Project QA operational completion migrations", () => {
  it("adds private, response-scoped Photo and File evidence with reservation verification", () => {
    expect(migration).toContain("'project-qa-evidence','project-qa-evidence',false,104857600");
    expect(migration).toContain("create table public.project_qa_evidence_uploads");
    expect(migration).toContain("create table public.project_qa_response_evidence");
    expect(migration).toContain("initiated_by=auth.uid()");
    expect(migration).toContain("actual_size is distinct from upload_row.byte_size");
    expect(migration).toContain("actual_mime<>upload_row.mime_type");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.project_qa_(?:evidence_uploads|response_evidence)/i);
  });

  it("persists typed acknowledgement signatures, verifier Hold decisions, and final signoff", () => {
    for (const token of ["signature_signer_name", "typed_acknowledgement", "signature_signed_by", "signature_signed_at", "project_qa_hold_releases", "project_qa_signoffs", "'qa.verify'", "'qa.signoff'"]) expect(migration).toContain(token);
    expect(migration).toContain("Hold Point \"%\" must be released before completion");
    expect(migration).toContain("Only a completed QA Record can be signed off");
  });

  it("enforces authoritative completion and immutable completed evidence", () => {
    for (const token of ["Wait for pending QA evidence uploads", "requires at least % photo(s)", "requires a supporting file", "outside its captured target tolerance", "Completed or cancelled QA evidence is immutable"]) expect(migration).toContain(token);
    expect(migration).toContain("guard_project_qa_operational_evidence_immutable_v1");
    expect(migration).toContain("guard_project_qa_operational_hold_immutable_v1");
  });

  it("queues abandoned, expired, and removed storage objects for retryable cleanup", () => {
    expect(migration).toContain("create table public.project_qa_evidence_cleanup_jobs");
    for (const reason of ["'abandoned'", "'expired'", "'removed'"]) expect(migration).toContain(reason);
    expect(migration).toContain("queue_expired_project_qa_evidence_uploads_v1");
    expect(migration).toContain("grant execute on function public.queue_expired_project_qa_evidence_uploads_v1() to service_role");
  });

  it("qualifies output-column collisions in all linter-identified RPCs", () => {
    expect(ambiguityFix).toContain("lock_version=target.lock_version+1");
    expect(ambiguityFix).toContain("target.status='in_progress'");
    expect(ambiguityFix).toContain("select signoff.id,signoff.signed_at");
    expect(ambiguityFix).not.toMatch(/lock_version=lock_version\+1/);
  });

  it("rejects contradictory Inspection photo rules before Ready", () => {
    expect(readyFix).toContain("field.photo_required and field.require_photo_on_fail");
    expect(readyFix).toContain("cannot be both Required and Required on Fail");
  });
});
