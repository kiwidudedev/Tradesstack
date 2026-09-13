import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260829160000_add_drawn_project_qa_signatures.sql", "utf8");
const actions = readFileSync("lib/quality-assurance/execution/actions.ts", "utf8");
const artifactServer = readFileSync("lib/quality-assurance/execution/signature-artifact-server.ts", "utf8");

describe("Project QA drawn signature migration", () => {
  it("links the active response signature to immutable response-scoped evidence", () => {
    for (const token of [
      "signature_evidence_id", "signature_artifact_sha256", "signature_artifact_metadata",
      "signature_recorded_by_name", "foreign key (id,signature_evidence_id)",
      "Saved QA signature evidence is immutable", "content_sha256", "image_width", "image_height",
    ]) expect(migration).toContain(token);
    expect(migration).toContain("on delete restrict");
  });

  it("keeps typed acknowledgement compatible and adds a dedicated drawn finalizer", () => {
    expect(migration).toContain("signature_method='typed_acknowledgement'");
    expect(migration).toContain("signature_method='drawn_signature'");
    expect(migration).toContain("finalize_drawn_project_qa_signature_v1");
    expect(migration).toContain("Signature evidence requires signature finalization");
    expect(migration).toContain("initiated_by=auth.uid()");
    expect(migration).toContain("response_row.field_type<>'signature'");
  });

  it("validates PNG type, size, dimensions, meaningful metadata, and content hash", () => {
    for (const token of [
      "lower(p_mime)='image/png'", "actual_size>2097152", "^[a-f0-9]{64}$",
      "qa_signature_metadata_is_valid_v1", "pointCount", "totalDistance", "pixelWidth", "pixelHeight",
    ]) expect(migration).toContain(token);
  });

  it("requires an authoritative linked artifact before completing a drawn signature", () => {
    expect(migration).toContain("evidence.id=response_row.signature_evidence_id");
    expect(migration).toContain("evidence.content_sha256=response_row.signature_artifact_sha256");
    expect(migration).toContain("evidence.evidence_type='signature'");
  });

  it("validates exact persisted PNG bytes at the server-action boundary", () => {
    for (const token of [
      'from("project_qa_evidence_uploads")', "upload.organization_id !== member.organization_id",
      "upload.project_id !== project.id", "upload.run_id !== input.runId", "upload.response_id !== input.responseId",
      'upload.evidence_type !== "signature"', 'download(upload.storage_path)', "validateSignaturePngArtifact",
    ]) expect(actions).toContain(token);
    for (const token of ['from "sharp"', 'createHash("sha256").update(bytes).digest("hex")', "image.width !== metadata.pixelWidth"]) expect(artifactServer).toContain(token);
  });
});
