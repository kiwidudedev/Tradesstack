import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section role="dialog" className={className}>{children}</section>
  ),
  DialogTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  DialogDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  ),
  DialogClose: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/documents/upload-client", () => ({
  requestDocumentUploadAbandonment: vi.fn(),
  requestDocumentUploadInitiation: vi.fn(),
  uploadReservedDocumentWithTus: vi.fn(),
}));

import { FileUploadQueue } from "@/components/app/files/FileUploadQueue";

describe("FileUploadQueue modal presentation", () => {
  it("renders the shared modal shell, semantic context and accessible non-button drop region", () => {
    const markup = renderToStaticMarkup(
      <FileUploadQueue
        entity={{
          kind: "opportunity",
          id: "e2000000-0000-4000-8000-000000000001",
          slug: "example-opportunity",
        }}
        parentNodeId="e2000000-0000-4000-8000-000000000002"
        currentFolderName="Signed contracts"
        visibleNodes={[]}
        onComplete={vi.fn()}
      />,
    );

    expect(markup).toContain(">Upload files</button>");
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain(">Upload files</h2>");
    expect(markup).toContain("Uploading to Signed contracts.");
    expect(markup).toContain("may continue when this dialog is closed");
    expect(markup).toContain('aria-label="File drop zone"');
    expect(markup).not.toContain('role="button"');
    expect(markup).toContain('aria-label="Choose files to upload"');
    expect(markup).toContain(">Choose files</button>");
    expect(markup).toContain("2 GiB maximum per file");
    expect(markup).toContain("bg-[#fffaf7]");
    expect(markup).toContain("border-[rgba(241,90,41,0.7)]");
    expect(markup).toContain("h-[92vh]");
    expect(markup).toContain("w-[min(980px,94vw)]");
    expect(markup).toContain("overflow-y-auto");
    expect(markup).toContain("border-t");
  });
});
