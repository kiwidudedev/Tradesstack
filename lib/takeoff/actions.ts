import {
  createAreaTakeoffMeasurementForOpportunityPage,
  createCountTakeoffMeasurementForOpportunityPage,
  createLineTakeoffMeasurementForOpportunityPage,
  saveTakeoffCalibrationForOpportunityPage,
  setActiveTakeoffCalibrationForOpportunityPage,
  updateTakeoffMeasurementDetailsForOpportunity,
  updateTakeoffMeasurementGeometryForOpportunity,
  updateTakeoffMeasurementStatusForOpportunity,
} from "@/lib/takeoff-server";

export interface TakeoffActionResult<TData = void> {
  ok: boolean;
  data?: TData;
  error?: string;
}

function parseNormalizedPointsText(value: string, minimumPoints: number): Array<{ x: number; y: number }> {
  const rows = value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length < minimumPoints) {
    throw new Error(`Enter at least ${minimumPoints} point${minimumPoints === 1 ? "" : "s"}.`);
  }

  return rows.map((row, index) => {
    const parts = row
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(`Point ${index + 1} must use the format x, y`);
    }

    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Point ${index + 1} must contain numeric coordinates.`);
    }

    return { x, y };
  });
}

function parseOptionalNormalizedPointsText(value: string): Array<{ x: number; y: number }> {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  return parseNormalizedPointsText(trimmed, 1);
}

export function createTakeoffPageActions(opportunityId: string) {
  async function saveCalibrationAction(formData: FormData): Promise<TakeoffActionResult<Awaited<ReturnType<typeof saveTakeoffCalibrationForOpportunityPage>>>> {
    "use server";

    const pageId = String(formData.get("pageId") ?? "").trim();

    if (!pageId) {
      return {
        ok: false,
        error: "Missing page id.",
      };
    }

    try {
      const calibration = await saveTakeoffCalibrationForOpportunityPage({
        opportunitySlug: opportunityId,
        pageId,
        name: String(formData.get("name") ?? ""),
        unitSystem: String(formData.get("unitSystem") ?? "metric") === "imperial" ? "imperial" : "metric",
        displayUnit: String(formData.get("displayUnit") ?? ""),
        referenceLengthInput: Number(formData.get("referenceLengthInput") ?? 0),
        pointAX: Number(formData.get("pointAX") ?? -1),
        pointAY: Number(formData.get("pointAY") ?? -1),
        pointBX: Number(formData.get("pointBX") ?? -1),
        pointBY: Number(formData.get("pointBY") ?? -1),
        notes: String(formData.get("notes") ?? ""),
      });

      return {
        ok: true,
        data: calibration,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to save calibration.",
      };
    }
  }

  async function setActiveCalibrationAction(
    formData: FormData
  ): Promise<TakeoffActionResult<Awaited<ReturnType<typeof setActiveTakeoffCalibrationForOpportunityPage>>>> {
    "use server";

    const pageId = String(formData.get("pageId") ?? "").trim();
    const calibrationIdRaw = String(formData.get("calibrationId") ?? "").trim();

    if (!pageId) {
      return {
        ok: false,
        error: "Missing page id.",
      };
    }

    try {
      const calibration = await setActiveTakeoffCalibrationForOpportunityPage({
        opportunitySlug: opportunityId,
        pageId,
        calibrationId: calibrationIdRaw || null,
      });

      return {
        ok: true,
        data: calibration,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update active calibration.",
      };
    }
  }

  async function createLineMeasurementAction(formData: FormData): Promise<TakeoffActionResult<Awaited<ReturnType<typeof createLineTakeoffMeasurementForOpportunityPage>>>> {
    "use server";

    const pageId = String(formData.get("pageId") ?? "").trim();

    try {
      const measurement = await createLineTakeoffMeasurementForOpportunityPage({
        opportunitySlug: opportunityId,
        pageId,
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        groupId: String(formData.get("groupId") ?? ""),
        colorHex: String(formData.get("colorHex") ?? ""),
        points: parseNormalizedPointsText(String(formData.get("points") ?? ""), 2),
      });
      return {
        ok: true,
        data: measurement,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create measurement.",
      };
    }
  }

  async function createAreaMeasurementAction(formData: FormData): Promise<TakeoffActionResult<Awaited<ReturnType<typeof createAreaTakeoffMeasurementForOpportunityPage>>>> {
    "use server";

    const pageId = String(formData.get("pageId") ?? "").trim();

    try {
      const measurement = await createAreaTakeoffMeasurementForOpportunityPage({
        opportunitySlug: opportunityId,
        pageId,
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        groupId: String(formData.get("groupId") ?? ""),
        colorHex: String(formData.get("colorHex") ?? ""),
        points: parseNormalizedPointsText(String(formData.get("points") ?? ""), 3),
      });
      return {
        ok: true,
        data: measurement,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create area measurement.",
      };
    }
  }

  async function createCountMeasurementAction(formData: FormData): Promise<TakeoffActionResult<Awaited<ReturnType<typeof createCountTakeoffMeasurementForOpportunityPage>>>> {
    "use server";

    const pageId = String(formData.get("pageId") ?? "").trim();

    try {
      const measurement = await createCountTakeoffMeasurementForOpportunityPage({
        opportunitySlug: opportunityId,
        pageId,
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        groupId: String(formData.get("groupId") ?? ""),
        colorHex: String(formData.get("colorHex") ?? ""),
        countValue: Number(formData.get("countValue") ?? 0),
        points: parseOptionalNormalizedPointsText(String(formData.get("points") ?? "")),
      });
      return {
        ok: true,
        data: measurement,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create count measurement.",
      };
    }
  }

  async function updateMeasurementStatusAction(
    formData: FormData
  ): Promise<TakeoffActionResult<Awaited<ReturnType<typeof updateTakeoffMeasurementStatusForOpportunity>>>> {
    "use server";

    const measurementId = String(formData.get("measurementId") ?? "").trim();
    const action = String(formData.get("action") ?? "").trim();
    const normalizedAction = action === "restore" ? "restore" : action === "delete" ? "delete" : "archive";

    try {
      const measurement = await updateTakeoffMeasurementStatusForOpportunity({
        opportunitySlug: opportunityId,
        measurementId,
        action: normalizedAction,
      });
      return {
        ok: true,
        data: measurement,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update measurement status.",
      };
    }
  }

  async function updateMeasurementGeometryAction(formData: FormData): Promise<TakeoffActionResult<Awaited<ReturnType<typeof updateTakeoffMeasurementGeometryForOpportunity>>>> {
    "use server";

    const measurementId = String(formData.get("measurementId") ?? "").trim();

    try {
      const measurement = await updateTakeoffMeasurementGeometryForOpportunity({
        opportunitySlug: opportunityId,
        measurementId,
        points: parseNormalizedPointsText(String(formData.get("points") ?? ""), 1),
      });
      return {
        ok: true,
        data: measurement,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update measurement geometry.",
      };
    }
  }

  async function updateMeasurementDetailsAction(
    formData: FormData
  ): Promise<TakeoffActionResult<Awaited<ReturnType<typeof updateTakeoffMeasurementDetailsForOpportunity>>>> {
    "use server";

    const measurementId = String(formData.get("measurementId") ?? "").trim();

    try {
      const measurement = await updateTakeoffMeasurementDetailsForOpportunity({
        opportunitySlug: opportunityId,
        measurementId,
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        tag: String(formData.get("tag") ?? ""),
      });
      return {
        ok: true,
        data: measurement,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update measurement details.",
      };
    }
  }

  return {
    saveCalibrationAction,
    setActiveCalibrationAction,
    createLineMeasurementAction,
    createAreaMeasurementAction,
    createCountMeasurementAction,
    updateMeasurementDetailsAction,
    updateMeasurementGeometryAction,
    updateMeasurementStatusAction,
  };
}
