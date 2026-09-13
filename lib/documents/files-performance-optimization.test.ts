import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Files performance optimization contracts", () => {
  it.each([
    "app/app/(workspace)/projects/[projectId]/files/page.tsx",
    "app/app/(workspace)/leads-clients/opportunities/[opportunityId]/files/page.tsx",
  ])("keeps non-critical folder and usage RPCs out of normal page loading: %s", (file) => {
    const page = source(file);
    expect(page).not.toContain("listDocumentFolders");
    expect(page).not.toContain("getDocumentStorageUsage");
    expect(page).toContain("FilesContext");
  });

  it("loads Move destinations only from the on-demand authorized endpoint", () => {
    const workspace = source("components/app/files/FilesWorkspace.tsx");
    expect(workspace).toContain("/api/documents/workspaces/${workspaceId}/folders");
    expect(workspace).toContain('if (next.type === "move") void loadMoveFolders()');
    expect(workspace).toContain("Loading destination folders");
  });

  it("uses demand-driven folder prefetch without initial-render prefetch", () => {
    const workspace = source("components/app/files/FilesWorkspace.tsx");
    expect(workspace).toContain("prefetch={false}");
    expect(workspace).toContain("onMouseEnter={() => prefetchFolder(node.nodeId)}");
    expect(workspace).toContain("onFocus={() => prefetchFolder(node.nodeId)}");
  });

  it("preserves database-authoritative metadata and atomic download protection", () => {
    const migration = source("supabase/migrations/20260822120000_optimize_document_files_read_paths.sql");
    expect(migration).toContain("assert_document_workspace_permission");
    expect(migration).toContain("get_document_files_page_metadata");
    expect(migration).toContain("enforce_shared_rate_limit");
    expect(migration).toContain("acquire_shared_concurrency_slot");
    expect(migration).toContain("auth.uid()");
    expect(migration).not.toContain("create index");
  });
});
