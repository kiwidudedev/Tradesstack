import { describe, expect, it } from "vitest";
import { selectScopedTakeoffPage } from "./page-selection";

const scopedPages = [
  { id: "page-1", drawingSetId: "drawing-a" },
  { id: "page-2", drawingSetId: "drawing-a" },
];

describe("selectScopedTakeoffPage", () => {
  it("uses the first scoped page when no page was requested", () => {
    expect(selectScopedTakeoffPage(scopedPages, null)).toEqual(scopedPages[0]);
  });

  it("returns a requested page inside the scoped drawing set", () => {
    expect(selectScopedTakeoffPage(scopedPages, "page-2")).toEqual(scopedPages[1]);
  });

  it.each([
    ["unknown page", "missing-page"],
    ["page from another drawing set or project", "other-scope-page"],
  ])("falls back to the first scoped page for an %s", (_case, requestedPageId) => {
    expect(selectScopedTakeoffPage(scopedPages, requestedPageId)).toEqual(scopedPages[0]);
  });
});
