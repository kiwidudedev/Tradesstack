import { vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogContent: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogDescription: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogFooter: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogHeader: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogTitle: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorksheetPublishToVariationDialog } from "@/components/app/WorksheetPublishToVariationDialog";

describe("WorksheetPublishToVariationDialog", () => {
  it("renders variation confirmation with current-variation context and section controls", () => {
    const markup = renderToStaticMarkup(
      <WorksheetPublishToVariationDialog
        open
        lines={[
          {
            id: "line-1",
            description: "Board Supply Cost",
            quantity: "",
            unit: "",
            rate: "",
            total: "2760",
            section: "Materials",
          },
        ]}
        variationNumber="26028-VAR-03"
        variationTitle="Client changes"
        variationStatus="Draft"
        sourceRangeLabel="A2:B4"
        selectedValues={["Board Supply Cost", "2760"]}
        onOpenChange={() => undefined}
        onLineChange={() => undefined}
        onAddLine={() => undefined}
        onRemoveLine={() => undefined}
        onConfirm={() => undefined}
        isSubmitting={false}
      />,
    );

    expect(markup).toContain("Add to Variation");
    expect(markup).toContain("Current variation");
    expect(markup).toContain("26028-VAR-03");
    expect(markup).toContain("Client changes");
    expect(markup).toContain("Variation section");
    expect(markup).toContain("Add another line");
    expect(markup).not.toContain("Supplier");
    expect(markup).not.toContain("Quote destination");
  });
});
