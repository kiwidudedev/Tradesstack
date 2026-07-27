import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderCommercialItemLink,
  buildPurchaseOrderCommercialItemSourceHref,
} from "@/lib/commercial-items/purchase-order-linking";
import type { CommercialItemPayload } from "@/lib/commercial-items/types";

function buildCommercialItem(overrides: Partial<CommercialItemPayload> = {}): CommercialItemPayload {
  return {
    id: "item-1",
    organizationId: "org-1",
    opportunityId: "opp-1",
    projectId: "project-1",
    sourceType: "worksheet_selection",
    sourceWorkbookId: "workbook-1",
    sourceWorksheetId: "workbook-1",
    sourceSheetId: "sheet-1",
    sourceRange: "A2:E2",
    sourceSignature: "sig-1",
    sourceVersion: 1,
    sourceStatus: "current",
    staleReasonCode: null,
    lastSourceCheckedAt: null,
    lastSourceChangedAt: null,
    description: "Steel framing",
    quantity: 10,
    unit: "lm",
    rate: 50,
    total: 500,
    snapshotJson: {},
    sourceLinkJson: {
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
      ownerType: "variation",
      opportunitySlug: null,
      projectSlug: "airport-fitout",
      variationId: "variation-1",
    },
    uclClassification: null,
    uclValidationStatus: "not_reviewed",
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("purchase order linking", () => {
  it("builds a variation worksheet source href from safe source metadata", () => {
    const link = buildPurchaseOrderCommercialItemLink(buildCommercialItem());

    expect(buildPurchaseOrderCommercialItemSourceHref({
      commercialItemLink: link,
    })).toBe(
      "/app/projects/airport-fitout/preconstruction/variations/variation-1/pricing-worksheet/workbook-1?sheetId=sheet-1",
    );
  });

  it("does not expose locked metadata on the purchase order line link", () => {
    const link = buildPurchaseOrderCommercialItemLink(buildCommercialItem());

    expect("lockedMetadataJson" in link).toBe(false);
  });
});
