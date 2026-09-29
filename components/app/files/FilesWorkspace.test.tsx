import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => {
    void prefetch;
    return <a href={href} {...props}>{children}</a>;
  },
}));
vi.mock("@/components/app/files/FileUploadQueue", () => ({
  FileUploadQueue: ({ currentFolderName }: { currentFolderName: string }) => (
    <button type="button" data-testid="upload-queue" data-folder={currentFolderName}>
      Upload files
    </button>
  ),
}));
vi.mock("@/lib/documents/workspace-actions", () => ({
  createDocumentFolderAction: vi.fn(),
  renameDocumentNodeAction: vi.fn(),
  moveDocumentNodeAction: vi.fn(),
  deleteDocumentNodeAction: vi.fn(),
  restoreDocumentNodeAction: vi.fn(),
  purgeDocumentNodeAction: vi.fn(),
}));

import { FilesWorkspace } from "@/components/app/files/FilesWorkspace";
import type { DocumentWorkspaceNode } from "@/lib/documents/workspace";

const query = {
  view: "active" as const,
  folderId: null,
  search: "",
  fileType: "all" as const,
  sort: "name" as const,
  direction: "asc" as const,
  page: 1,
};

const metadata = {
  canView: true,
  canWrite: true,
  canDelete: true,
  canPurge: true,
  cleanupAttentionRequired: false,
};

function render(
  nodes: DocumentWorkspaceNode[],
  search = "",
  entity: {
    kind: "opportunity" | "project";
    id: string;
    slug: string;
  } = {
    kind: "opportunity",
    id: "e2000000-0000-4000-8000-000000000001",
    slug: "example-opportunity",
  },
  metadataOverride = metadata,
) {
  return renderToStaticMarkup(
    <FilesWorkspace
      entity={entity}
      workspaceId="e2000000-0000-4000-8000-000000000002"
      nodes={nodes}
      deletedBatches={[]}
      totalCount={nodes.length}
      breadcrumbs={[]}
      query={{ ...query, search }}
      metadata={metadataOverride}
    />,
  );
}

describe("Opportunity Files workspace", () => {
  it("renders the compact audited toolbar and no inline upload zone", () => {
    const markup = render([]);
    expect(markup).toContain("No files yet");
    expect(markup).toContain("Create a folder or upload files");
    expect(markup).toContain("Upload files");
    expect(markup).toContain("New folder");
    expect(markup).toContain("Recycle bin");
    expect(markup).toContain("Search all files");
    expect(markup).not.toContain("Organization storage");
    expect(markup).not.toContain("Drop files here");
    expect(markup.indexOf("Upload files")).toBeLessThan(markup.indexOf("New folder"));
    expect(markup.indexOf("New folder")).toBeLessThan(markup.indexOf("Recycle bin"));
    expect(markup).toContain('<span aria-current="page"');
    expect(markup).toContain(">Files</span>");
  });

  it("renders folders and files in a semantic responsive table", () => {
    const base = {
      parentNodeId: null,
      ownerUserId: "user-1",
      ownerName: "Corey Builder",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T01:00:00.000Z",
      mimeType: null,
      versionNumber: null,
      uploadState: null,
      sha256Checksum: null,
      parentName: null,
    };
    const markup = render([
      {
        ...base,
        nodeId: "folder-1",
        kind: "folder",
        displayName: "Contracts",
        byteSize: null,
        fileExtension: null,
      },
      {
        ...base,
        nodeId: "file-1",
        kind: "file",
        displayName: "Proposal.pdf",
        byteSize: 2048,
        fileExtension: "pdf",
        versionNumber: 2,
        uploadState: "active",
      },
    ]);
    expect(markup).toContain("<table");
    expect(markup).toContain('aria-label="Files workspace"');
    expect(markup).toContain("Contracts");
    expect(markup).toContain("Proposal.pdf");
    expect(markup).toContain("2.0 KB");
    expect(markup).toContain("hidden md:table-cell");
  });

  it("distinguishes recursive search with no results from an empty folder", () => {
    const markup = render([], "missing contract");
    expect(markup).toContain("Searching the full workspace");
    expect(markup).toContain("No matching files");
    expect(markup).not.toContain("This folder is empty");
  });

  it("uses the same UI and Project route base without Opportunity-only wording", () => {
    const markup = render([], "", {
      kind: "project",
      id: "e2000000-0000-4000-8000-000000000003",
      slug: "example-project",
    });
    expect(markup).not.toContain("Opportunity files");
    expect(markup).toContain("Create a folder or upload files");
  });

  it("keeps an existing workspace useful for a view-only member", () => {
    const markup = render([], "", undefined, {
      ...metadata,
      canWrite: false,
      canDelete: false,
      canPurge: false,
    });
    expect(markup).toContain("This shared workspace does not contain any files yet.");
    expect(markup).toContain("Search all files");
    expect(markup).not.toContain("Upload files");
    expect(markup).not.toContain("New folder");
    expect(markup).not.toContain("Recycle bin");
  });

  it("renders deleted batches separately with restore and purge controls", () => {
    const markup = renderToStaticMarkup(
      <FilesWorkspace
        entity={{
          kind: "opportunity",
          id: "e2000000-0000-4000-8000-000000000001",
          slug: "example-opportunity",
        }}
        workspaceId="e2000000-0000-4000-8000-000000000002"
        nodes={[]}
        deletedBatches={[{
          deletionBatchId: "batch-1",
          rootNodeId: "node-1",
          kind: "folder",
          displayName: "Superseded drawings",
          deletedByUserId: "user-1",
          deletedByName: "Corey Builder",
          deletedAt: "2026-07-30T00:00:00.000Z",
          originalParentNodeId: null,
          originalParentName: null,
          itemCount: 12,
          byteSize: 4096,
        }]}
        totalCount={1}
        breadcrumbs={[]}
        query={{ ...query, view: "deleted" }}
        metadata={metadata}
      />,
    );
    expect(markup).toContain('aria-label="Deleted files"');
    expect(markup).toContain("Superseded drawings");
    expect(markup).toContain("12 items in this deletion batch");
    expect(markup).toContain(">Files</button>");
    expect(markup).not.toContain("Upload files");
    expect(markup).not.toContain("New folder");
  });
});
