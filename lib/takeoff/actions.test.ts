import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTakeoffPageActions } from "./actions";
import {
  deleteUnusedTakeoffCalibrationForOpportunityPage,
  getTakeoffCalibrationHistoryForOpportunityPage,
  updateTakeoffMeasurementStatusForOpportunity,
} from "@/lib/takeoff-server";

vi.mock("@/lib/takeoff-server", () => ({
  appendAreaShapeToMeasurementForOpportunity: vi.fn(),
  appendCountItemToMeasurementForOpportunity: vi.fn(),
  appendLinePathToMeasurementForOpportunity: vi.fn(),
  createAreaTakeoffMeasurementForOpportunityPage: vi.fn(),
  createCountTakeoffMeasurementForOpportunityPage: vi.fn(),
  createLineTakeoffMeasurementForOpportunityPage: vi.fn(),
  deleteUnusedTakeoffCalibrationForOpportunityPage: vi.fn(),
  deleteTakeoffMeasurementChildForOpportunity: vi.fn(),
  getTakeoffCalibrationHistoryForOpportunityPage: vi.fn(),
  saveTakeoffCalibrationForOpportunityPage: vi.fn(),
  setActiveTakeoffCalibrationForOpportunityPage: vi.fn(),
  updateTakeoffMeasurementChildGeometryForOpportunity: vi.fn(),
  updateTakeoffMeasurementDetailsForOpportunity: vi.fn(),
  updateTakeoffMeasurementGeometryForOpportunity: vi.fn(),
  updateTakeoffMeasurementStatusForOpportunity: vi.fn(),
}));

describe("takeoff lifecycle actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a temp measurement status mutation before calling persistence", async () => {
    const actions = createTakeoffPageActions("opportunity-a");
    const formData = new FormData();
    formData.set("measurementId", "temp-pending");
    formData.set("action", "delete");

    await expect(actions.updateMeasurementStatusAction(formData)).resolves.toMatchObject({ ok: false });
    expect(updateTakeoffMeasurementStatusForOpportunity).not.toHaveBeenCalled();
  });

  it("passes drawing and page scope to persisted status mutations", async () => {
    vi.mocked(updateTakeoffMeasurementStatusForOpportunity).mockResolvedValue({ id: "measurement-a" } as never);
    const actions = createTakeoffPageActions("opportunity-a");
    const formData = new FormData();
    formData.set("drawingSetId", "drawing-a");
    formData.set("pageId", "page-a");
    formData.set("measurementId", "measurement-a");
    formData.set("action", "delete");

    await expect(actions.updateMeasurementStatusAction(formData)).resolves.toMatchObject({ ok: true });
    expect(updateTakeoffMeasurementStatusForOpportunity).toHaveBeenCalledWith({
      opportunitySlug: "opportunity-a",
      drawingSetId: "drawing-a",
      pageId: "page-a",
      measurementId: "measurement-a",
      action: "delete",
    });
  });

  it("scopes calibration history and deletion by drawing and page", async () => {
    vi.mocked(getTakeoffCalibrationHistoryForOpportunityPage).mockResolvedValue([]);
    vi.mocked(deleteUnusedTakeoffCalibrationForOpportunityPage).mockResolvedValue({
      deletedCalibrationId: "calibration-a",
      activeCalibration: null,
    });
    const actions = createTakeoffPageActions("opportunity-a");
    const formData = new FormData();
    formData.set("drawingSetId", "drawing-a");
    formData.set("pageId", "page-a");
    formData.set("calibrationId", "calibration-a");

    await actions.getCalibrationHistoryAction(formData);
    await actions.deleteCalibrationAction(formData);

    expect(getTakeoffCalibrationHistoryForOpportunityPage).toHaveBeenCalledWith({
      opportunitySlug: "opportunity-a",
      drawingSetId: "drawing-a",
      pageId: "page-a",
    });
    expect(deleteUnusedTakeoffCalibrationForOpportunityPage).toHaveBeenCalledWith({
      opportunitySlug: "opportunity-a",
      drawingSetId: "drawing-a",
      pageId: "page-a",
      calibrationId: "calibration-a",
    });
  });
});
