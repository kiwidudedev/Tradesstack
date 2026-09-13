import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/commercial-items/service", () => ({
  linkCommercialItemToVariationLine: vi.fn(),
  listCommercialItemDocumentLinksForVariation: vi.fn(),
  listCommercialItemsByIds: vi.fn(),
}));

import {
  buildVariationCommercialItemLink,
  buildVariationCommercialItemSourceHref,
  persistCommercialItemVariationLinks,
  persistCommercialItemVariationLinksSafely,
} from "@/lib/commercial-items/variation-linking";
import {
  linkCommercialItemToVariationLine,
  listCommercialItemDocumentLinksForVariation,
  listCommercialItemsByIds,
} from "@/lib/commercial-items/service";
import type { CommercialItemPayload, CommercialItemsClient } from "@/lib/commercial-items/types";
import type { VariationLineCommercialItemShape } from "@/lib/commercial-items/variation-linking";

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
    quantity: null,
    unit: null,
    rate: null,
    total: 500,
    snapshotJson: {},
    sourceLinkJson: {
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
      ownerType: "variation",
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

function createMockClient() {
  return {
    rpc: vi.fn(),
    from: vi.fn(),
  } as unknown as CommercialItemsClient;
}

describe("variation linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a variation worksheet source href from safe source metadata", () => {
    const link = buildVariationCommercialItemLink(buildCommercialItem());

    expect(buildVariationCommercialItemSourceHref({
      commercialItemLink: link,
    })).toBe(
      "/app/projects/airport-fitout/preconstruction/variations/variation-1/pricing-worksheet/workbook-1?sheetId=sheet-1",
    );
  });

  it("builds a Takeoff source href without inventing worksheet provenance", () => {
    const link = buildVariationCommercialItemLink(buildCommercialItem({
      sourceType: "takeoff_measurement",
      sourceWorkbookId: null,
      sourceWorksheetId: null,
      sourceSheetId: null,
      sourceRange: null,
      sourceTakeoffMeasurementId: "measurement-1",
      sourceLinkJson: {
        ownerType: "project",
        ownerSlug: "airport-fitout",
        drawingSetId: "drawing-set-1",
        pageId: "page-1",
      },
    }));

    expect(buildVariationCommercialItemSourceHref({ commercialItemLink: link })).toBe(
      "/app/projects/airport-fitout/takeoff/measure?drawingSetId=drawing-set-1&pageId=page-1",
    );
    expect(link.sourceWorksheetId).toBeNull();
    expect(link.sourceTakeoffMeasurementId).toBe("measurement-1");
  });

  it("rejects incomplete provenance for both source kinds", () => {
    expect(() => buildVariationCommercialItemLink(buildCommercialItem({ sourceRange: null })))
      .toThrow("worksheet source provenance");
    expect(() => buildVariationCommercialItemLink(buildCommercialItem({
      sourceType: "takeoff_measurement",
      sourceWorkbookId: null,
      sourceWorksheetId: null,
      sourceSheetId: null,
      sourceRange: null,
      sourceTakeoffMeasurementId: "measurement-1",
      sourceLinkJson: {},
    }))).toThrow("measurement, owner, drawing, and page provenance");
  });

  it("persists valid variation links through the existing rpc", async () => {
    const client = createMockClient();
    vi.mocked(linkCommercialItemToVariationLine).mockResolvedValueOnce({
      id: "link-1",
      organizationId: "org-1",
      commercialItemId: "item-1",
      documentKind: "variation_line",
      documentId: "variation-1",
      documentLineId: "line-1",
      linkRole: "source",
      snapshotAtLinkJson: { total: 500 },
      createdBy: "user-1",
      createdAt: "",
    });

    const result = await persistCommercialItemVariationLinks({
      client,
      organizationId: "org-1",
      variationId: "variation-1",
      lineItems: [
        {
          id: "line-1",
          commercialItemLink: buildVariationCommercialItemLink(buildCommercialItem()),
        },
      ],
    });

    expect(linkCommercialItemToVariationLine).toHaveBeenCalledWith(client, expect.objectContaining({
      organizationId: "org-1",
      variationId: "variation-1",
      variationLineId: "line-1",
    }));
    expect(result).toHaveLength(1);
  });

  it("reports partial success when variation save succeeded but commercial item linking failed", async () => {
    const client = createMockClient();
    vi.mocked(linkCommercialItemToVariationLine).mockRejectedValueOnce(
      new Error("A variation line can only have one source commercial item"),
    );

    const result = await persistCommercialItemVariationLinksSafely({
      client,
      organizationId: "org-1",
      variationId: "variation-1",
      lineItems: [
        {
          id: "line-1",
          commercialItemLink: buildVariationCommercialItemLink(buildCommercialItem()),
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("source commercial item");
  });

  it("enriches variation lines without exposing locked metadata", async () => {
    const client = createMockClient();
    vi.mocked(listCommercialItemDocumentLinksForVariation).mockResolvedValueOnce([
      {
        id: "link-1",
        organizationId: "org-1",
        commercialItemId: "item-1",
        documentKind: "variation_line",
        documentId: "variation-1",
        documentLineId: "line-1",
        linkRole: "source",
        snapshotAtLinkJson: { total: 500 },
        createdBy: "user-1",
        createdAt: "",
      },
    ]);
    vi.mocked(listCommercialItemsByIds).mockResolvedValueOnce([buildCommercialItem()]);

    const variationLinking = await import("@/lib/commercial-items/variation-linking");
    const enriched = await variationLinking.enrichVariationLineItemsWithCommercialItems<VariationLineCommercialItemShape>({
      client,
      organizationId: "org-1",
      variationId: "variation-1",
      lineItems: [{ id: "line-1" }],
    });

    expect(enriched[0]?.commercialItemLink?.sourceRange).toBe("A2:E2");
    expect("lockedMetadataJson" in (enriched[0]?.commercialItemLink ?? {})).toBe(false);
  });
});
