import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewer = readFileSync(new URL("../components/app/TakeoffPdfViewer.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/app/TakeoffMeasureWorkspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/app/TakeoffAddToQuotePanel.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("takeoff/add-to-quote-actions.ts", import.meta.url), "utf8");
const authority = readFileSync(new URL("takeoff/commercial-authority-server.ts", import.meta.url), "utf8");

describe("Takeoff Add to Quote integration", () => {
  it("exposes a keyboard-safe Add to Quote action for eligible parent measurements", () => {
    expect(viewer).toContain('role="menu"');
    expect(viewer).toContain('role="menuitem"');
    expect(viewer).toContain("Add to Quote");
    expect(viewer).toContain('measurement.status === "active"');
    expect(viewer).toContain("!isTemporaryTakeoffMeasurementId(measurement.id)");
    expect(viewer).toContain("hitTarget.measurementId");
    expect(viewer).toContain("canAddToQuote: measurement.status");
    expect(viewer).not.toMatch(/canAddToQuote:[^\n]*hiddenFromExportLegendMeasurementIds/);
  });

  it("hosts the panel beside the still-mounted viewer without route state", () => {
    expect(workspace).toContain("<TakeoffPdfViewer");
    expect(workspace).toContain("<TakeoffAddToQuotePanel");
    expect(workspace).toContain("onAddMeasurementToQuote={(measurementId) =>");
    expect(workspace).toContain("setQuoteMeasurementId(measurementId)");
    expect(workspace).not.toContain('search.set("quoteMeasurementId"');
  });

  it("renders editable commercial fields without worksheet mapping affordances", () => {
    expect(panel).toContain('label="Description"');
    expect(panel).toContain("onChange={setDescription}");
    expect(panel).toContain("publishTakeoffMeasurementToQuotes({ owner, measurementId, description, rate, target })");
    expect(panel).toContain('label="Qty."');
    expect(panel).toContain('label="Unit"');
    expect(panel).toContain('label="Rate"');
    expect(panel).toContain('label="Total"');
    expect(panel).toContain("<QuoteDestinationSection");
    expect(panel).not.toContain("Select worksheet cell");
    expect(panel).not.toContain("Quote Mapping Mode");
  });

  it("re-resolves owner, measurement, drawing, page and commercial lineage server-side", () => {
    expect(actions).toContain("resolveTakeoffCommercialMeasurementAuthority");
    expect(authority).toContain("resolveAuthorizedTakeoffContext");
    expect(authority).toContain('.from("takeoff_measurements")');
    expect(authority).toContain('.from("project_drawing_sets")');
    expect(authority).toContain('.from("takeoff_pages")');
    expect(actions).toContain("resolveWorksheetQuotePublishContextForCurrentUser");
    expect(actions).toContain("publishCommercialRowsToQuotes");
    expect(actions).toContain("description: authority.commercialMeasurement.description");
    expect(actions).toContain("const description = input.description.trim()");
    expect(authority).toContain("if (!context.lineageOpportunityId)");
    expect(actions).not.toContain("measurement.quantity");
  });
});
