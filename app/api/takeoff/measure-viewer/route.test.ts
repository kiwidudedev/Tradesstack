import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTakeoffMeasurePageData,
  getTakeoffMeasureViewerData,
} from "@/app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data";
import { GET } from "./route";

vi.mock("@/app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data", () => ({
  getTakeoffMeasurePageData: vi.fn(),
  getTakeoffMeasureViewerData: vi.fn(),
}));

const mockedGetTakeoffMeasurePageData = vi.mocked(getTakeoffMeasurePageData);
const mockedGetTakeoffMeasureViewerData = vi.mocked(getTakeoffMeasureViewerData);

function request(query = "opportunityId=opportunity-a&drawingSetId=drawing-a&pageId=page-a") {
  return new Request(`http://localhost/api/takeoff/measure-viewer?${query}`);
}

describe("GET /api/takeoff/measure-viewer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetTakeoffMeasurePageData.mockReset();
    mockedGetTakeoffMeasureViewerData.mockReset();
  });

  it("refreshes the signed source URL only when explicitly requested", async () => {
    mockedGetTakeoffMeasureViewerData.mockResolvedValue({ pageId: "page-a", pdfUrl: "signed-pdf" } as never);

    const response = await GET(request("opportunityId=opportunity-a&drawingSetId=drawing-a&pageId=page-a&refreshSource=1"));

    expect(response.status).toBe(200);
    expect(mockedGetTakeoffMeasureViewerData).toHaveBeenCalledOnce();
    expect(mockedGetTakeoffMeasurePageData).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ data: { pdfUrl: "signed-pdf" } });
  });

  it("returns scoped page data", async () => {
    mockedGetTakeoffMeasurePageData.mockResolvedValue({ pageId: "page-a" } as never);

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { pageId: "page-a" },
    });
  });

  it("returns 404 when the requested page is absent from the scoped drawing set", async () => {
    mockedGetTakeoffMeasurePageData.mockResolvedValue(null);

    const response = await GET(request("opportunityId=opportunity-a&drawingSetId=drawing-a&pageId=other-scope-page"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Measure page data was not found.",
    });
  });

  it("keeps internal exception details out of 500 responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedGetTakeoffMeasurePageData.mockRejectedValue(
      new Error("storage/private/path?token=secret SQL details"),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Unable to load measure page data.",
      code: "TAKEOFF_LOAD_FAILED",
      retryable: true,
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
