import { describe, expect, it } from "vitest";
import {
  documentFileCategory,
  documentFilesRoute,
  formatDocumentBytes,
  getDocumentFolderPath,
  isDocumentFolderDescendant,
  parseDocumentWorkspaceQuery,
  validateDocumentNodeName,
} from "@/lib/documents/workspace";

describe("document workspace presentation helpers", () => {
  it("builds Opportunity and Project Files routes from typed entity context", () => {
    expect(documentFilesRoute({
      kind: "opportunity",
      id: "opportunity-id",
      slug: "metro-fitout",
    })).toBe("/app/leads-clients/opportunities/metro-fitout/files");
    expect(documentFilesRoute({
      kind: "project",
      id: "project-id",
      slug: "metro-project",
    })).toBe("/app/projects/metro-project/files");
  });

  it("normalizes URL state and rejects unsupported values", () => {
    expect(parseDocumentWorkspaceQuery({
      folder: "E2000000-0000-4000-8000-000000000001",
      q: "  contract  ",
      type: "PDF",
      sort: "modified",
      direction: "desc",
      page: "2",
    })).toEqual({
      view: "active",
      folderId: "e2000000-0000-4000-8000-000000000001",
      search: "contract",
      fileType: "pdf",
      sort: "modified",
      direction: "desc",
      page: 2,
    });
    expect(parseDocumentWorkspaceQuery({
      view: "deleted",
      folder: "forged",
      type: "executable",
      sort: "random",
      direction: "sideways",
      page: "-5",
    })).toMatchObject({
      view: "deleted",
      folderId: null,
      fileType: "all",
      sort: "name",
      direction: "asc",
      page: 1,
    });
  });

  it("categorizes supported file extensions", () => {
    expect(documentFileCategory("pdf")).toBe("pdf");
    expect(documentFileCategory("PNG")).toBe("images");
    expect(documentFileCategory("docx")).toBe("documents");
    expect(documentFileCategory("xlsx")).toBe("spreadsheets");
    expect(documentFileCategory("pptx")).toBe("presentations");
    expect(documentFileCategory("txt")).toBe("text");
    expect(documentFileCategory(null)).toBe("other");
  });

  it("formats sizes without exposing unsafe filename markup", () => {
    expect(formatDocumentBytes(null)).toBe("—");
    expect(formatDocumentBytes(1024)).toBe("1.0 KB");
    expect(validateDocumentNodeName("<script>alert(1)</script>")).toBe(
      "That name is not valid.",
    );
    expect(validateDocumentNodeName("  Contract.pdf  ")).toBeNull();
  });

  it("labels nested folders unambiguously and identifies descendants", () => {
    const folders = [
      { nodeId: "one", parentNodeId: null, displayName: "Plans" },
      { nodeId: "two", parentNodeId: "one", displayName: "Issued" },
      { nodeId: "three", parentNodeId: "two", displayName: "Construction" },
    ];

    expect(getDocumentFolderPath("three", folders)).toBe(
      "Plans / Issued / Construction",
    );
    expect(isDocumentFolderDescendant("three", "one", folders)).toBe(true);
    expect(isDocumentFolderDescendant("one", "three", folders)).toBe(false);
  });
});
