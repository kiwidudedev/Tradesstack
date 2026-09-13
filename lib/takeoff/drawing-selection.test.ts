import { describe, expect, it } from "vitest";
import { selectAuthorizedTakeoffDrawingSetId } from "./drawing-selection";

const drawings = [{ id: "drawing-a" }, { id: "drawing-b" }];

describe("Takeoff drawing selection", () => {
  it("keeps a requested drawing only when it belongs to the authorized active list", () => {
    expect(selectAuthorizedTakeoffDrawingSetId(drawings, "drawing-b")).toBe("drawing-b");
  });

  it("recovers stale, archived, generated, or cross-project ids to the first authorized drawing", () => {
    expect(selectAuthorizedTakeoffDrawingSetId(drawings, "forged-drawing")).toBe("drawing-a");
  });

  it("returns an explicit empty state when no source drawings are available", () => {
    expect(selectAuthorizedTakeoffDrawingSetId([], "stale-drawing")).toBeNull();
  });
});
