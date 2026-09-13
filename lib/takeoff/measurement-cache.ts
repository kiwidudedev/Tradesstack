type TakeoffMeasurementGeometryKey = "points" | "area_shapes" | "line_paths";

interface TakeoffMeasurementWithGeometryArrays {
  id: string;
  status: string;
  points: readonly unknown[];
  area_shapes: readonly unknown[];
  line_paths: readonly unknown[];
}

export type TakeoffCommittedMeasurement<
  TMeasurement extends TakeoffMeasurementWithGeometryArrays,
> = Pick<TMeasurement, "id" | "status"> &
  Partial<Record<Exclude<keyof TMeasurement, "id" | "status" | TakeoffMeasurementGeometryKey>, unknown>> & {
    points?: readonly unknown[];
    area_shapes?: readonly unknown[];
    line_paths?: readonly unknown[];
  };

function resolveCommittedGeometry<
  TMeasurement extends TakeoffMeasurementWithGeometryArrays,
  TKey extends TakeoffMeasurementGeometryKey,
>(params: {
  existingMeasurement: TMeasurement | undefined;
  incomingMeasurement: TakeoffCommittedMeasurement<TMeasurement>;
  key: TKey;
}): TMeasurement[TKey] {
  const incomingGeometry = params.incomingMeasurement[params.key];
  if (Array.isArray(incomingGeometry)) {
    return incomingGeometry as unknown as TMeasurement[TKey];
  }

  if (params.incomingMeasurement.status === "deleted") {
    return [] as unknown as TMeasurement[TKey];
  }

  return (params.existingMeasurement?.[params.key] ?? []) as TMeasurement[TKey];
}

export function reconcileCommittedTakeoffMeasurement<
  TMeasurement extends TakeoffMeasurementWithGeometryArrays,
>(
  existingMeasurement: TMeasurement | undefined,
  incomingMeasurement: TakeoffCommittedMeasurement<TMeasurement>,
): TMeasurement {
  return {
    ...existingMeasurement,
    ...incomingMeasurement,
    points: resolveCommittedGeometry({ existingMeasurement, incomingMeasurement, key: "points" }),
    area_shapes: resolveCommittedGeometry({ existingMeasurement, incomingMeasurement, key: "area_shapes" }),
    line_paths: resolveCommittedGeometry({ existingMeasurement, incomingMeasurement, key: "line_paths" }),
  } as TMeasurement;
}
