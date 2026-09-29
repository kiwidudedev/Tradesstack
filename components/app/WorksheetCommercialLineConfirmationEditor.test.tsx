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
import { CommercialLineConfirmationEditor } from "@/components/app/WorksheetCommercialLineConfirmationEditor";

describe("CommercialLineConfirmationEditor", () => {
  it("renders the simplified single-line confirmation UI", () => {
    const markup = renderToStaticMarkup(
      <CommercialLineConfirmationEditor
        lines={[
          {
            id: "line-1",
            description: "Board Supply Cost",
            quantity: "92",
            unit: "Sheets",
            rate: "30",
            total: "2760",
          },
        ]}
        sourceRangeLabel="A2:B4"
        selectedValues={["Board Supply Cost", "92", "Sheets", "30", "2760"]}
        onLineChange={() => undefined}
        onAddLine={() => undefined}
        onRemoveLine={() => undefined}
        isSubmitting={false}
      />,
    );

    expect(markup).not.toContain("Commercial line");
    expect(markup).toContain("Board Supply Cost");
    expect(markup).toContain("Add another line");
    expect(markup).not.toContain("Line 1");
    expect(markup).not.toContain("High");
    expect(markup).not.toContain("Medium");
    expect(markup).not.toContain("A2:B4");
  });
});
