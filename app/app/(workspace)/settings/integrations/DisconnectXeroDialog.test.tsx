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
  it("accurately describes the current disconnect behavior", () => {
    const markup = renderToStaticMarkup(
      <DisconnectXeroDialog action={async () => undefined} disabled={false} />,
    );

    expect(markup).toContain("Disconnect Xero?");
    expect(markup).toContain("stored token credentials will be removed");
    expect(markup).toContain("Imported accounts, tax rates, and contacts will remain");
    expect(markup).toContain("Existing TradesStack accounting mappings and historical accounting records will remain");
    expect(markup).toContain("Queued Xero jobs that can no longer run will be ended");
    expect(markup).not.toContain("Phase 1");
    expect(markup).toContain('name="disconnect_confirmation"');
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Disconnect");
  });
});
