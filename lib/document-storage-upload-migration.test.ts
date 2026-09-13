import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260729160000_add_document_storage_upload_foundation.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");
const config = fs.readFileSync(path.join(process.cwd(), "supabase/config.toml"), "utf8");

describe("document Storage and upload Phase 2 migration", () => {
  it("creates a private 2 GiB organization document bucket with a MIME allowlist", () => {
    expect(sql).toContain("'organization-documents'");
    expect(sql).toContain("false,\n  2147483648");
    expect(sql).toContain("'application/pdf'");
    expect(sql).toContain("'application/vnd.openxmlformats-officedocument.presentationml.presentation'");
    expect(config).toContain('file_size_limit = "2GiB"');
  });

  it("adds pending visibility, idempotency, expiry, replacement, and activation metadata", () => {
    for (const field of [
      "lifecycle_state",
      "upload_idempotency_key",
      "upload_expires_at",
      "upload_request_fingerprint",
      "replaces_version_id",
      "storage_object_id",
      "storage_etag",
      "activated_at",
    ]) {
      expect(sql).toContain(field);
    }
  });

  it("uses UUID-only opaque object paths and never derives paths from file names", () => {
    expect(sql).toContain("resolved_organization_id::text");
    expect(sql).toContain("resolved_workspace_id::text");
    expect(sql).toContain("new_version_id::text");
    expect(sql).not.toMatch(/storage_key[\s\S]{0,180}normalized_display_name/u);
  });

  it("permits only exact authorized pending object inserts", () => {
    expect(sql).toContain("version.storage_key = p_object_path");
    expect(sql).toContain("version.uploaded_by = auth.uid()");
    expect(sql).toContain("version.upload_state = 'pending'");
    expect(sql).toContain("version.upload_expires_at > now()");
    expect(sql).toContain("owner = auth.uid()");
    expect(sql).toContain("'files.write'");
  });

  it("does not create authenticated Storage select, update, or delete policies", () => {
    const policyStatements =
      sql.match(/create policy[\s\S]*?;\n/gu)?.filter((statement) =>
        statement.includes("on storage.objects")
      ) ?? [];
    expect(policyStatements).toHaveLength(1);
    expect(policyStatements[0]).toContain("for insert");
    expect(policyStatements[0]).not.toMatch(/for (select|update|delete)/u);
    expect(sql).not.toContain("public = true");
  });

  it("keeps completion and expiry processing service-role-only", () => {
    expect(sql).toContain(
      "revoke all on function public.complete_document_upload(uuid, uuid)\nfrom public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.complete_document_upload(uuid, uuid)\nto service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.abandon_expired_document_uploads(integer)\nto service_role;",
    );
  });

  it("defines transaction-safe initiation, completion, abandonment, and download functions", () => {
    for (const functionName of [
      "resolve_document_upload_workspace",
      "initiate_document_upload",
      "complete_document_upload",
      "mark_document_upload_failed",
      "abandon_expired_document_uploads",
      "resolve_document_download",
    ]) {
      expect(sql).toContain(`create or replace function public.${functionName}`);
    }
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update skip locked");
  });

  it("sets a safe search path on every security-definer function", () => {
    const definitions = sql.split("create or replace function ").slice(1);
    for (const definition of definitions) {
      if (definition.includes("security definer")) {
        expect(definition.slice(0, definition.indexOf("$$"))).toContain(
          "set search_path = public",
        );
      }
    }
  });

  it("verifies Storage metadata in the database before atomic activation", () => {
    expect(sql).toContain("from storage.objects object");
    expect(sql).toContain("object.name = version_row.storage_key");
    expect(sql).toContain("actual_size <> version_row.byte_size");
    expect(sql).toContain("actual_mime_type <> lower(version_row.claimed_mime_type)");
    expect(sql).toContain("current_version_id = version_row.id");
    expect(sql).toContain("'version_activated'");
  });

  it("keeps incomplete nodes and versions out of authenticated read policies", () => {
    expect(sql).toContain("Authorized members can view active document nodes");
    expect(sql).toContain("lifecycle_state = 'active'");
    expect(sql).toContain("Authorized members can view active document versions");
    expect(sql).toContain("upload_state = 'active'");
  });
});

