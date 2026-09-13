import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewer = readFileSync(new URL("../components/app/TakeoffPdfViewer.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/app/TakeoffMeasureWorkspace.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../components/app/TakeoffMeasureRoutePage.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/app/TakeoffAddToPurchaseOrderPanel.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("takeoff/add-to-purchase-order-actions.ts", import.meta.url), "utf8");
const authority = readFileSync(new URL("takeoff/commercial-authority-server.ts", import.meta.url), "utf8");

describe("Takeoff Add to Purchase Order integration", () => {
  it("preserves the direct Purchase Order menu action alongside Variation", () => {
    expect(viewer).toContain("Add to Purchase Order");
    expect(viewer).toContain("onAddMeasurementToPurchaseOrder");
    expect(viewer).toContain("setSummaryContextMenu(null)");
    expect(viewer).toContain("Add to Variation");
    expect(viewer).toContain('measurement.status === "active"');
    expect(viewer).toContain("!isTemporaryTakeoffMeasurementId(measurement.id)");
  });

  it("keeps the viewer mounted and makes Quote and PO panels exclusive", () => {
    expect(workspace).toContain("<TakeoffPdfViewer");
    expect(workspace).toContain("<TakeoffAddToQuotePanel");
    expect(workspace).toContain("<TakeoffAddToPurchaseOrderPanel");
    expect(workspace).toContain("setPurchaseOrderMeasurementId(null)");
    expect(workspace).toContain("setQuoteMeasurementId(null)");
    expect(workspace).not.toContain('search.set("purchaseOrderMeasurementId"');
  });

  it("only enables PO for converted Opportunity lineage with a canonical Project", () => {
    expect(route).toContain("workspace.opportunityId");
    expect(route).toContain("workspace.routeProjectId");
    expect(route).toContain('hasOrganizationPermission(workspace.organizationId, "purchase_orders.write")');
    expect(route).toContain("canWritePurchaseOrders");
    expect(route).toContain('workspace.conversionMode === "promoted"');
    expect(route).toContain('workspace.conversionMode === "legacy-reference"');
    expect(authority).toContain("converted_project_id");
    expect(authority).toContain("source_opportunity_id");
    expect(authority).toContain("workspace_project_id");
  });

  it("renders authoritative commercial fields and PO-specific controls lazily", () => {
    expect(panel).toContain("loadTakeoffAddToPurchaseOrderContext");
    expect(panel).toContain('label="Description"');
    expect(panel).toContain("onChange={setDescription}");
    expect(panel).toContain('label="Qty."');
    expect(panel).toContain('label="Unit"');
    expect(panel).toContain('label="Rate"');
    expect(panel).toContain('label="Total"');
    expect(panel).toContain("context.measurement.quantity * rate");
    expect(panel).toContain('aria-label="Procurement section"');
    expect(panel).toContain('aria-label="Supplier"');
    expect(panel).toContain("Purchase Order destination");
    expect(panel).toContain("Create new Draft PO");
    expect(panel).toContain("Append existing Draft PO");
    expect(panel).not.toContain("Select worksheet cell");
  });

  it("uses one request identity per panel action and authoritative server resolution", () => {
    expect(panel).toContain("crypto.randomUUID()");
    expect(actions).toContain("resolveTakeoffCommercialMeasurementAuthority");
    expect(actions).toContain("resolveTakeoffPurchaseOrderProjectAuthority");
    expect(actions).toContain("resolvePurchaseOrderPublishOptions");
    expect(actions).toContain("publishTakeoffCommercialPurchaseOrder");
    expect(actions).toContain("authority.commercialMeasurement");
    expect(actions).not.toContain("measurement.quantity");
  });
});
