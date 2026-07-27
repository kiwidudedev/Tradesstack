import { vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogTrigger: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogContent: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogDescription: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogFooter: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogHeader: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogTitle: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisconnectXeroDialog } from "./DisconnectXeroDialog";

describe("DisconnectXeroDialog", () => {
  it("renders the explicit Phase 1 disconnect warning copy", () => {
    const markup = renderToStaticMarkup(
      <DisconnectXeroDialog action={async () => undefined} disabled={false} />,
    );

    expect(markup).toContain("Disconnect Xero?");
    expect(markup).toContain("stored token secrets will be removed");
    expect(markup).toContain("Imported accounts and tax rates will remain");
    expect(markup).toContain("Existing TradesStack accounting mappings will remain");
    expect(markup).toContain("No Supplier Invoices or Payment Claims are exported to Xero in Phase 1.");
    expect(markup).toContain('name="disconnect_confirmation"');
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Disconnect");
  });
});
