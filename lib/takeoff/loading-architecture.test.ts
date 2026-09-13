import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Takeoff loading architecture", () => {
  it("keeps the Takeoff register metadata-only", () => {
    const registerSource = source("app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/page.tsx");
    expect(registerSource).toContain("getTakeoffDrawingSetsForOpportunitySlug");
    expect(registerSource).toContain("getTakeoffDrawingTabsForOpportunitySlug");
    expect(registerSource).toContain("canonicalProject");
    expect(registerSource).not.toMatch(/getTakeoffMeasureViewerData|createSignedTakeoffDrawingSetUrl|TakeoffPdfViewer/);
  });

  it("does not synchronously create page metadata in a navigation loader", () => {
    const loaderSource = source("lib/takeoff/page-data-server.ts");
    expect(loaderSource).not.toContain("ensureTakeoffPagesForOpportunityDrawingSet");
    expect(loaderSource).toContain("getTakeoffMeasurePagesForOpportunitySlug");
  });

  it("restores the Takeoff dropdown without heavy route prefetch", () => {
    const navigationSource = source("components/app/OpportunityWorkspaceShell.tsx");
    expect(navigationSource).toContain("buildTakeoffRegisterHref(opportunityId)");
    expect(navigationSource).toContain('<Link href={takeoffHref} prefetch={false}>');
    expect(navigationSource).toContain('<Link href={quantitiesHref} prefetch={false}>');
    expect(navigationSource).toContain("<DropdownMenu>");
    expect(navigationSource).toContain("Measure");
    expect(navigationSource).toContain("Quantities");
    expect(navigationSource).toContain("isMeasureActive = isTakeoffActive && !isQuantitiesActive");
    expect(navigationSource).toContain('pathname.startsWith(`${takeoffBasePath}/quantities`)');
  });

  it("keeps Quantities out of the Drawing Set Register header", () => {
    const registerSource = source("components/app/TakeoffDrawingSetRegister.tsx");
    expect(registerSource).not.toContain("View Quantities");
    expect(registerSource).toContain("Add Drawing Set");
  });

  it("loads PDF export code only when export is requested", () => {
    const viewerSource = source("components/app/TakeoffPdfViewer.tsx");
    expect(viewerSource).not.toMatch(/^import .*takeoff-pdf-export/m);
    expect(viewerSource).toContain('await import("@/lib/exports/takeoff-pdf-export")');
  });

  it("keeps Project Takeoff links from hidden prefetch", () => {
    const navigationSource = source("components/app/ProjectSecondaryNav.tsx");
    expect(navigationSource).toContain('<Link href={href} prefetch={false}>Measure</Link>');
    expect(navigationSource).toContain('<Link href={`${href}/quantities`} prefetch={false}>Quantities</Link>');
  });
});
