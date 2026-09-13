import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueTakeoffPageMetadataPreparation,
  getTakeoffPageMetadataPreparationState,
} from "@/lib/takeoff-server";
import { GET, POST } from "./route";

vi.mock("@/lib/takeoff-server", () => ({
  enqueueTakeoffPageMetadataPreparation: vi.fn(),
  getTakeoffPageMetadataPreparationState: vi.fn(),
}));

const enqueue = vi.mocked(enqueueTakeoffPageMetadataPreparation);
const getState = vi.mocked(getTakeoffPageMetadataPreparationState);
const url = "http://localhost/api/takeoff/pages/prepare?opportunityId=opportunity-a&drawingSetId=drawing-a";

describe("Takeoff page metadata preparation route", () => {
  beforeEach(() => {
    enqueue.mockReset();
    getState.mockReset();
  });

  it("returns 202 for an idempotently queued background job", async () => {
    enqueue.mockResolvedValue({ status: "pending", jobId: "job-a", pageCount: 0, error: null });
    const response = await POST(new Request(url, { method: "POST" }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "pending", jobId: "job-a" });
  });

  it("reports a terminal preparation failure without exposing it as ready", async () => {
    getState.mockResolvedValue({ status: "failed", jobId: "job-a", pageCount: 0, error: "PDF exceeds the limit." });
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "failed", error: "PDF exceeds the limit." });
  });

  it("rejects an unscoped request before querying the database", async () => {
    const response = await POST(new Request("http://localhost/api/takeoff/pages/prepare", { method: "POST" }));
    expect(response.status).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
