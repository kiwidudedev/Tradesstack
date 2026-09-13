export interface TakeoffMeasurementVisibilityFields {
  id: string;
  status: string;
  measurement_kind: string;
}

export function isTakeoffMeasurementVisibleInLiveWorkspace(
  measurement: TakeoffMeasurementVisibilityFields,
) {
  return (
    measurement.status !== "deleted" &&
    (measurement.measurement_kind === "line" ||
      measurement.measurement_kind === "area" ||
      measurement.measurement_kind === "count")
  );
}

export function isTakeoffMeasurementIncludedInPdfExport(
  measurement: TakeoffMeasurementVisibilityFields,
  hiddenMeasurementIds: ReadonlySet<string>,
) {
  return (
    isTakeoffMeasurementVisibleInLiveWorkspace(measurement) &&
    !hiddenMeasurementIds.has(measurement.id)
  );
}
