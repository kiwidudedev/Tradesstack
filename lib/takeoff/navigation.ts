export type TakeoffSection = "measure" | "quantities";

export interface TakeoffNavigationParams {
  drawingSetId?: string | null;
  pageId?: string | null;
  calibrationStatus?: "saved" | "replaced" | "error" | null;
  measurementStatus?: "created" | "archived" | "deleted" | "restored" | "error" | null;
  drawingScope?: "all" | null;
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

function takeoffBaseHref(ownerInput: string | TakeoffRouteOwner) {
  const owner = typeof ownerInput === "string"
    ? { kind: "opportunity" as const, slug: ownerInput }
    : ownerInput;
  return owner.kind === "project"
    ? `/app/projects/${owner.slug}/takeoff`
    : `/app/leads-clients/opportunities/${owner.slug}/takeoff`;
}

export function buildTakeoffRegisterHref(owner: string | TakeoffRouteOwner) {
  return takeoffBaseHref(owner);
}

export function buildTakeoffHref(
  owner: string | TakeoffRouteOwner,
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

  if (params.drawingScope === "all") {
    search.set("drawingScope", "all");
  }

  const query = search.toString();
  const baseHref = takeoffBaseHref(owner);
  return query ? `${baseHref}/${section}?${query}` : `${baseHref}/${section}`;
}

export function buildTakeoffOwnerApiQuery(owner: TakeoffRouteOwner) {
  const search = new URLSearchParams({ ownerKind: owner.kind, ownerSlug: owner.slug });
  return search.toString();
}
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";
