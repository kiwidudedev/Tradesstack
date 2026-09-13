export function selectAuthorizedTakeoffDrawingSetId<T extends { id: string }>(
  drawingSets: readonly T[],
  requestedDrawingSetId: string | null,
): string | null {
  if (requestedDrawingSetId && drawingSets.some((drawingSet) => drawingSet.id === requestedDrawingSetId)) {
    return requestedDrawingSetId;
  }
  return drawingSets[0]?.id ?? null;
}
