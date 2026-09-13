import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const register = readFileSync(resolve(root, "components/app/TakeoffDrawingSetRegister.tsx"), "utf8");
const registerPage = readFileSync(resolve(root, "app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/page.tsx"), "utf8");
const measurePage = readFileSync(resolve(root, "components/app/TakeoffMeasureRoutePage.tsx"), "utf8");
const workspace = readFileSync(resolve(root, "components/app/TakeoffMeasureWorkspace.tsx"), "utf8");
const quantities = readFileSync(resolve(root, "components/app/TakeoffQuantitiesRoutePage.tsx"), "utf8");
const takeoffServer = readFileSync(resolve(root, "lib/takeoff-server.ts"), "utf8");
const upload = readFileSync(resolve(root, "components/app/useTakeoffSourceDrawingUpload.ts"), "utf8");

describe("multi-drawing Takeoff architecture", () => {
  it("opens explicit drawing routes from the lightweight register", () => {
    expect(register).toContain('buildTakeoffHref(owner, "measure"');
    expect(register).toContain("initialDrawingSets");
    expect(registerPage).toContain("getTakeoffDrawingTabsForOpportunitySlug");
    expect(registerPage).not.toMatch(/getTakeoffMeasureViewerData|createSignedTakeoffDrawingSetUrl|pdfUrl/);
  });

  it("keeps drawing switching out of the editor and rejects invalid deep links", () => {
    expect(measurePage).not.toContain("TakeoffDrawingTabs");
    expect(measurePage).toContain("key={activeDrawingSetId}");
    expect(measurePage).toContain("requestedDrawingSetId !== selectedDrawingSetId");
    expect(measurePage).toContain("redirect(buildTakeoffRegisterHref(owner))");
  });

  it("aborts active page work and clears drawing-local caches on unmount", () => {
    expect(workspace).toContain("activeRequestControllersRef.current.forEach((controller) => controller.abort())");
    expect(workspace).toContain("backgroundPageControllersRef.current.forEach((controller) => controller.abort())");
    expect(workspace).toContain("cacheRef.current.clear()");
  });

  it("uses set-based all-drawing Quantities loading", () => {
    expect(quantities).toContain("getTakeoffMeasurePagesForDrawingSetsForOpportunitySlug");
    expect(quantities).toContain("getTakeoffMeasurementsForPages");
    expect(quantities).toContain("getActiveTakeoffCalibrationsForPages");
  });

  it("scopes source-tab authority and keeps rename independent from source identity", () => {
    const drawingRead = takeoffServer.slice(
      takeoffServer.indexOf("export async function getTakeoffDrawingSetsForOpportunitySlug"),
      takeoffServer.indexOf("export async function getTakeoffDrawingTabsForOpportunitySlug"),
    );
    expect(drawingRead).toContain('.eq("organization_id", resolved.organizationId)');
    expect(drawingRead).toContain('.eq("project_id", resolved.projectId)');
    expect(drawingRead).toContain('.eq("source_type", "source")');
    expect(drawingRead).toContain('.is("archived_at", null)');
    expect(takeoffServer).toContain('.update({ display_name: displayName })');
    expect(takeoffServer).not.toContain('.update({ file_name: displayName })');
    expect(takeoffServer).not.toContain('.update({ storage_path: displayName })');
    expect(takeoffServer).not.toContain('.update({ source_revision: displayName })');
    expect(takeoffServer).not.toContain("source_revision: params.drawingSet.updated_at");
    expect(takeoffServer).toContain("source_revision: getTakeoffDrawingSetSourceRevision(params.drawingSet)");
  });

  it("enqueues preparation and supports staying on the register", () => {
    expect(upload.indexOf("await fetch(preparationUrl")).toBeLessThan(upload.indexOf('completionBehavior === "stay-on-register"'));
    expect(upload).toContain("drawingSetId: insertedRow.id");
    expect(upload).toContain("router.refresh()");
    expect(register).toContain('status: "preparing" as const');
    expect(register).toContain("router.refresh()");
  });
});
