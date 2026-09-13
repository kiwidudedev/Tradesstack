import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewer = readFileSync(new URL("../components/app/TakeoffPdfViewer.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/app/TakeoffMeasureWorkspace.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../components/app/TakeoffMeasureRoutePage.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/app/TakeoffAddToVariationPanel.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("takeoff/add-to-variation-actions.ts", import.meta.url), "utf8");
const authority = readFileSync(new URL("takeoff/commercial-authority-server.ts", import.meta.url), "utf8");

describe("Takeoff Add to Variation integration", () => {
  it("adds the direct action after Quote and Purchase Order and closes the menu", () => {
    expect(viewer).toContain("Add to Quote");
    expect(viewer).toContain("Add to Purchase Order");
    expect(viewer).toContain("Add to Variation");
    expect(viewer.indexOf("Add to Variation")).toBeGreaterThan(viewer.indexOf("Add to Purchase Order"));
    expect(viewer).toContain("onAddMeasurementToVariation");
    expect(viewer).toContain("setSummaryContextMenu(null)");
    expect(viewer).toContain('measurement.status === "active"');
    expect(viewer).toContain("!isTemporaryTakeoffMeasurementId(measurement.id)");
  });

  it("keeps the viewer mounted and makes all commercial panels exclusive", () => {
    expect(workspace).toContain("<TakeoffPdfViewer");
    expect(workspace).toContain("<TakeoffAddToQuotePanel");
    expect(workspace).toContain("<TakeoffAddToPurchaseOrderPanel");
    expect(workspace).toContain("<TakeoffAddToVariationPanel");
    expect(workspace).toContain("setQuoteMeasurementId(null)");
    expect(workspace).toContain("setPurchaseOrderMeasurementId(null)");
    expect(workspace).toContain("setVariationMeasurementId(null)");
  });

  it("gates the client action by canonical Project lineage and variations.write", () => {
    expect(route).toContain('hasOrganizationPermission(workspace.organizationId, "variations.write")');
    expect(route).toContain("canWriteVariations");
    expect(route).toContain('workspace.conversionMode === "promoted"');
    expect(route).toContain('workspace.conversionMode === "legacy-reference"');
    expect(authority).toContain("workspace_project_id");
    expect(authority).toContain("converted_project_id");
    expect(authority).toContain("source_opportunity_id");
  });

  it("renders the lazy source fields and Variation-specific destination controls", () => {
    expect(panel).toContain("loadTakeoffAddToVariationContext");
    expect(panel).toContain('label="Description"');
    expect(panel).toContain("onChange={setDescription}");
    expect(panel).toContain('label="Qty."');
    expect(panel).toContain('label="Unit"');
    expect(panel).toContain('label="Rate"');
    expect(panel).toContain('label="Total"');
    expect(panel).toContain("context.measurement.quantity * rate");
    expect(panel).toContain('aria-label="Variation section"');
    expect(panel).toContain("Create new Draft Variation");
    expect(panel).toContain("Append existing Variation");
    expect(panel).toContain('targetMode === "new"');
    expect(panel).toContain('targetMode === "existing"');
    expect(panel).toContain("Variation title");
    expect(panel).toContain("Existing Variations");
    expect(panel).not.toContain("Select worksheet cell");
  });

  it("uses one request identity and the shared authoritative resolver", () => {
    expect(panel).toContain("crypto.randomUUID()");
    expect(actions).toContain("resolveTakeoffCommercialMeasurementAuthority");
    expect(actions).toContain("resolveTakeoffCommercialProjectAuthority");
    expect(actions).toContain("publishTakeoffCommercialVariation");
    expect(actions).toContain("authority.commercialMeasurement");
    expect(actions).not.toContain("takeoff_measurements.quantity");
  });
});
