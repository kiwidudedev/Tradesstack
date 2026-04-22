export type TakeoffSection = "measure" | "quantities";

export interface TakeoffNavigationParams {
  drawingSetId?: string | null;
  pageId?: string | null;
  calibrationStatus?: "saved" | "replaced" | "error" | null;
  measurementStatus?: "created" | "archived" | "deleted" | "restored" | "error" | null;
}

export function readSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first.trim() ? first.trim() : null;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

export function buildTakeoffHref(
  opportunityId: string,
  section: TakeoffSection,
  params: TakeoffNavigationParams
) {
  const search = new URLSearchParams();

  if (params.drawingSetId) {
    search.set("drawingSetId", params.drawingSetId);
  }

  if (params.pageId) {
    search.set("pageId", params.pageId);
  }

  if (params.calibrationStatus) {
    search.set("calibrationStatus", params.calibrationStatus);
  }

  if (params.measurementStatus) {
    search.set("measurementStatus", params.measurementStatus);
  }

  const query = search.toString();
  return query
    ? `/app/leads-clients/opportunities/${opportunityId}/takeoff/${section}?${query}`
    : `/app/leads-clients/opportunities/${opportunityId}/takeoff/${section}`;
}
