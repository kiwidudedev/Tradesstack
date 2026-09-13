import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveTakeoffDrawingSetForOpportunity,
  renameTakeoffDrawingSetForOpportunity,
} from "@/lib/takeoff-server";
import { PATCH } from "./route";

vi.mock("@/lib/takeoff-server", () => ({
  archiveTakeoffDrawingSetForOpportunity: vi.fn(),
  renameTakeoffDrawingSetForOpportunity: vi.fn(),
}));

const rename = vi.mocked(renameTakeoffDrawingSetForOpportunity);
const archive = vi.mocked(archiveTakeoffDrawingSetForOpportunity);
const context = { params: Promise.resolve({ drawingSetId: "drawing-a" }) };

describe("Takeoff drawing set lifecycle route", () => {
  beforeEach(() => {
    rename.mockReset();
    archive.mockReset();
  });

  it("renames only through the scoped server lifecycle", async () => {
    rename.mockResolvedValue({ id: "drawing-a", display_name: "Ceiling Plans" } as never);
    const response = await PATCH(new Request("http://localhost/api/takeoff/drawing-sets/drawing-a", {
      method: "PATCH",
      body: JSON.stringify({ action: "rename", opportunityId: "opp-a", displayName: " Ceiling Plans " }),
    }), context);
    expect(response.status).toBe(200);
    expect(rename).toHaveBeenCalledWith({ opportunitySlug: "opp-a", drawingSetId: "drawing-a", displayName: " Ceiling Plans " });
    expect(archive).not.toHaveBeenCalled();
  });

  it("archives without exposing a delete action", async () => {
    archive.mockResolvedValue({ archivedDrawingSetId: "drawing-a" });
    const response = await PATCH(new Request("http://localhost/api/takeoff/drawing-sets/drawing-a", {
      method: "PATCH",
      body: JSON.stringify({ action: "archive", opportunityId: "opp-a" }),
    }), context);
    expect(response.status).toBe(200);
    expect(archive).toHaveBeenCalledWith({ opportunitySlug: "opp-a", drawingSetId: "drawing-a" });
  });

  it("rejects requests without an opportunity scope", async () => {
    const response = await PATCH(new Request("http://localhost/api/takeoff/drawing-sets/drawing-a", {
      method: "PATCH",
      body: JSON.stringify({ action: "archive" }),
    }), context);
    expect(response.status).toBe(400);
    expect(archive).not.toHaveBeenCalled();
  });
});
