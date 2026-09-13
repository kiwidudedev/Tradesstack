import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Project Takeoff shared architecture", () => {
  it("mounts shared register, Measure, and Quantities surfaces", () => {
    const register = source("app/app/(workspace)/projects/[projectId]/takeoff/page.tsx");
    const measure = source("app/app/(editor)/projects/[projectId]/takeoff/measure/page.tsx");
    const quantities = source("app/app/(workspace)/projects/[projectId]/takeoff/quantities/page.tsx");
    expect(register).toContain("TakeoffDrawingSetRegister");
    expect(register).toContain('kind: "project"');
    expect(measure).toContain("TakeoffMeasureRoutePage");
    expect(quantities).toContain("TakeoffQuantitiesRoutePage");
  });

  it("uses one owner-aware API contract without accepting dataProjectId", () => {
    for (const path of [
      "app/api/takeoff/drawing-sets/[drawingSetId]/route.ts",
      "app/api/takeoff/pages/prepare/route.ts",
      "app/api/takeoff/measure-viewer/route.ts",
    ]) {
      const body = source(path);
      expect(body).toContain("ownerKind");
      expect(body).toContain("ownerSlug");
      expect(body).not.toContain("dataProjectId");
    }
  });

  it("supports direct Project lineage without Opportunity-only mutation filters", () => {
    const server = source("lib/takeoff-server.ts");
    expect(server).not.toContain('.eq("opportunity_id"');
    expect(server).toContain("opportunity_id: resolved.opportunityId");
  });

  it("keeps owner-specific route strings inside the navigation helper", () => {
    const navigation = source("lib/takeoff/navigation.ts");
    expect(navigation).toContain('/app/projects/${owner.slug}/takeoff');
    expect(navigation).toContain('/app/leads-clients/opportunities/${owner.slug}/takeoff');
  });

  it("does not add Takeoff graph cloning to Opportunity conversion", () => {
    const conversion = source("lib/leads-clients-server.ts");
    const legacyClone = conversion.slice(
      conversion.indexOf("async function cloneLegacyTenderDataToProject"),
      conversion.indexOf("export async function getLiveOpportunitiesForCurrentUser"),
    );
    expect(legacyClone).not.toMatch(/takeoff_pages|takeoff_calibrations|takeoff_measurements|takeoff_render_jobs|takeoff-page-previews/);
  });

  it("canonicalizes converted Opportunity routes without preserving unvalidated pages", () => {
    const register = source("app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/page.tsx");
    const measure = source("components/app/TakeoffMeasureRoutePage.tsx");
    const quantities = source("components/app/TakeoffQuantitiesRoutePage.tsx");
    expect(register).toContain("canonicalProject");
    expect(measure).toContain("authorizedPages.some");
    expect(quantities).toContain("authorizedPages.some");
  });
});
