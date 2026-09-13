import { describe, expect, it } from "vitest";
import { toDefaultDrawingSetDisplayName } from "@/lib/drawing-sets";

describe("toDefaultDrawingSetDisplayName", () => {
  it("removes only the final PDF extension case-insensitively", () => {
    expect(toDefaultDrawingSetDisplayName(" Plans.PDF ")).toBe("Plans");
    expect(toDefaultDrawingSetDisplayName("plans.pdf.backup")).toBe("plans.pdf.backup");
  });

  it("falls back for an extension-only filename", () => {
    expect(toDefaultDrawingSetDisplayName(".pdf")).toBe("Untitled Drawing Set");
    expect(toDefaultDrawingSetDisplayName("   ")).toBe("Untitled Drawing Set");
  });

  it("bounds default labels to the persisted display-name limit", () => {
    expect(toDefaultDrawingSetDisplayName(`${"A".repeat(140)}.pdf`)).toHaveLength(120);
  });
});
