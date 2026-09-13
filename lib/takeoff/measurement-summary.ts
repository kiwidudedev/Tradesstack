export interface TakeoffDrawingSetSummaryMeasurement {
  id: string;
  pageId: string;
  pageNumber: number;
  pageLabel: string;
  name: string;
  measurementKind: "line" | "area" | "count";
  colorHex: string | null;
  displayValue: number | null;
  displayUnit: string | null;
  status: string;
  createdAt: string;
}

export interface TakeoffLocalSummaryMeasurement {
  id: string;
  measurement_kind: "line" | "area" | "count";
  status: string;
  name: string;
  color_hex: string | null;
  display_value: number | null;
  display_unit: string | null;
  created_at?: string;
}

interface MergeDrawingSetSummaryMeasurementsParams {
  summaryMeasurements: TakeoffDrawingSetSummaryMeasurement[];
  localMeasurements: TakeoffLocalSummaryMeasurement[];
  activePage: {
    id: string;
    number: number;
    label: string;
  };
}

export function sortTakeoffDrawingSetSummaryMeasurements(
  measurements: TakeoffDrawingSetSummaryMeasurement[],
): TakeoffDrawingSetSummaryMeasurement[] {
  return [...measurements].sort((left, right) =>
    left.pageNumber - right.pageNumber ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

export function reconcileTakeoffDrawingSetSummaryMeasurement(
  measurements: TakeoffDrawingSetSummaryMeasurement[],
  measurement: TakeoffDrawingSetSummaryMeasurement,
): TakeoffDrawingSetSummaryMeasurement[] {
  const withoutCurrent = measurements.filter((current) => current.id !== measurement.id);
  if (measurement.status !== "active") {
    return withoutCurrent;
  }

  return sortTakeoffDrawingSetSummaryMeasurements([...withoutCurrent, measurement]);
}

export function mergeDrawingSetSummaryWithLocalMeasurements({
  summaryMeasurements,
  localMeasurements,
  activePage,
}: MergeDrawingSetSummaryMeasurementsParams): TakeoffDrawingSetSummaryMeasurement[] {
  const localMeasurementsById = new Map(
    localMeasurements.map((measurement) => [measurement.id, measurement] as const),
  );
  const mergedMeasurements = new Map<string, TakeoffDrawingSetSummaryMeasurement>();

  summaryMeasurements.forEach((summaryMeasurement) => {
    if (summaryMeasurement.status !== "active") {
      return;
    }

    if (summaryMeasurement.pageId !== activePage.id) {
      mergedMeasurements.set(summaryMeasurement.id, summaryMeasurement);
      return;
    }

    const localMeasurement = localMeasurementsById.get(summaryMeasurement.id);
    if (!localMeasurement) {
      mergedMeasurements.set(summaryMeasurement.id, summaryMeasurement);
      return;
    }

    if (localMeasurement.status !== "active") {
      return;
    }

    mergedMeasurements.set(summaryMeasurement.id, {
      ...summaryMeasurement,
      pageId: activePage.id,
      name: localMeasurement.name,
      measurementKind: localMeasurement.measurement_kind,
      colorHex: localMeasurement.color_hex,
      displayValue: localMeasurement.display_value,
      displayUnit: localMeasurement.display_unit,
      status: localMeasurement.status,
    });
  });

  localMeasurements.forEach((measurement, index) => {
    if (measurement.status !== "active" || mergedMeasurements.has(measurement.id)) {
      return;
    }

    mergedMeasurements.set(measurement.id, {
      id: measurement.id,
      pageId: activePage.id,
      pageNumber: activePage.number,
      pageLabel: activePage.label,
      name: measurement.name,
      measurementKind: measurement.measurement_kind,
      colorHex: measurement.color_hex,
      displayValue: measurement.display_value,
      displayUnit: measurement.display_unit,
      status: measurement.status,
      createdAt: measurement.created_at ?? `zzzz-optimistic-${String(index).padStart(10, "0")}`,
    });
  });

  return sortTakeoffDrawingSetSummaryMeasurements([...mergedMeasurements.values()]);
}
