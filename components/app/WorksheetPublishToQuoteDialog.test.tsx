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
import { WorksheetPublishToQuoteDialog } from "@/components/app/WorksheetPublishToQuoteDialog";

describe("WorksheetPublishToQuoteDialog", () => {
  it("renders quote confirmation without purchase-order-only controls", () => {
    const markup = renderToStaticMarkup(
      <WorksheetPublishToQuoteDialog
        open
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
        quotes={[
          {
            id: "quote-1",
            quoteNumber: "Q-001",
            quoteTitle: "Draft Quote",
            status: "Draft",
            updatedAt: "2026-07-11T00:00:00.000Z",
            lineItemCount: 3,
          },
        ]}
        selectedTargetMode="existing"
        selectedQuoteId="quote-1"
        sourceRangeLabel="A2:B4"
        selectedValues={["Board Supply Cost", "92", "Sheets", "30", "2760"]}
        onOpenChange={() => undefined}
        onTargetModeChange={() => undefined}
        onQuoteChange={() => undefined}
        onLineChange={() => undefined}
        onAddLine={() => undefined}
        onRemoveLine={() => undefined}
        onConfirm={() => undefined}
        isSubmitting={false}
      />,
    );

    expect(markup).toContain("Add to Quote");
    expect(markup).toContain("Quote destination");
    expect(markup).toContain("Create New Draft Quote");
    expect(markup).toContain("Append Existing Draft Quote");
    expect(markup).toContain("Board Supply Cost");
    expect(markup).toContain("Add another line");
    expect(markup).not.toContain("Supplier");
    expect(markup).not.toContain("Procurement section");
  });
});
