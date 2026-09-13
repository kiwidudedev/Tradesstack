import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/commercial-items/service", () => ({
  linkCommercialItemToQuoteLine: vi.fn(),
  listCommercialItemDocumentLinksForQuote: vi.fn(),
  listCommercialItemsByIds: vi.fn(),
  repairProjectQuoteSourceOpportunityLineage: vi.fn(),
}));

import {
  buildCommercialItemSourceHref,
  buildQuoteCommercialItemLink,
  buildQuoteLineDraftFromCommercialItem,
  enrichQuoteLineItemsWithCommercialItems,
  attachCommercialItemLinksToQuoteLines,
  persistCommercialItemQuoteLinks,
  persistCommercialItemQuoteLinksSafely,
} from "@/lib/commercial-items/quote-linking";
import {
  linkCommercialItemToQuoteLine,
  listCommercialItemDocumentLinksForQuote,
  repairProjectQuoteSourceOpportunityLineage,
} from "@/lib/commercial-items/service";
import type { CommercialItemPayload, CommercialItemsClient } from "@/lib/commercial-items/types";

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
    sourceRange: "A1:C4",
    sourceSignature: "sig-1",
    sourceVersion: 1,
    sourceStatus: "current",
    staleReasonCode: null,
    lastSourceCheckedAt: null,
    lastSourceChangedAt: null,
    description: "Stud framing",
    quantity: 10,
    unit: "lm",
    rate: 32.5,
    total: 325,
    snapshotJson: {},
    sourceLinkJson: {
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
    },
    uclClassification: null,
    uclValidationStatus: "not_reviewed",
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function createMockClient() {
  return {
    rpc: vi.fn(),
    from: vi.fn(),
  } as unknown as CommercialItemsClient;
}

function buildLineItem() {
  return {
    id: "line-1",
    section: "Item" as const,
    description: "Stud framing",
    quantity: 10,
    unit: "lm",
    rate: 32.5,
    isOptional: false,
    commercialItemLink: buildQuoteCommercialItemLink(buildCommercialItem()),
  };
}

describe("commercial item quote linking helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a quote line draft from the commercial item snapshot", () => {
    const draft = buildQuoteLineDraftFromCommercialItem(buildCommercialItem());

    expect(draft.description).toBe("Stud framing");
    expect(draft.quantity).toBe(10);
    expect(draft.unit).toBe("lm");
    expect(draft.rate).toBe(32.5);
    expect(draft.commercialItemLink?.commercialItemId).toBe("item-1");
  });

  it("copies only an allowlisted source-link snapshot onto quote links", () => {
    const link = buildQuoteCommercialItemLink(buildCommercialItem({
      sourceLinkJson: {
        worksheetName: "Pricing worksheet",
        sheetName: "Sheet 1",
        ownerType: "variation",
        opportunitySlug: "long-bay-apartment",
        projectSlug: "long-bay-apartment-project",
        variationId: "variation-1",
        worksheetVersion: 4,
        capturedAt: "2026-07-07T00:00:00.000Z",
        hiddenFormula: "=SUM(A1:A4)",
      },
    }));

    expect(link.snapshotAtLinkJson).toMatchObject({
      sourceLink: {
        worksheetName: "Pricing worksheet",
        sheetName: "Sheet 1",
        ownerType: "variation",
        opportunitySlug: "long-bay-apartment",
        projectSlug: "long-bay-apartment-project",
        variationId: "variation-1",
        worksheetVersion: 4,
        capturedAt: "2026-07-07T00:00:00.000Z",
      },
    });
    expect(link.snapshotAtLinkJson).not.toMatchObject({
      sourceLink: {
        hiddenFormula: "=SUM(A1:A4)",
      },
    });
  });

  it("attaches persisted quote links without exposing locked metadata", () => {
    const commercialItem = buildCommercialItem();
    const lineItems = attachCommercialItemLinksToQuoteLines<{
      id: string;
      section: "Item";
      description: string;
      quantity: number;
      unit: string;
      rate: number;
      isOptional: false;
      commercialItemLink?: ReturnType<typeof buildQuoteCommercialItemLink> | null;
    }>(
      [
        {
          id: "line-1",
          section: "Item",
          description: "Stud framing",
          quantity: 10,
          unit: "lm",
          rate: 32.5,
          isOptional: false,
        },
      ],
      [
        {
          id: "link-1",
          organizationId: "org-1",
          commercialItemId: "item-1",
          documentKind: "quote_line",
          documentId: "quote-1",
          documentLineId: "line-1",
          linkRole: "source",
          snapshotAtLinkJson: { total: 325 },
          createdBy: "user-1",
          createdAt: "2026-07-07T01:00:00.000Z",
        },
      ],
      [commercialItem],
    );

    expect(lineItems[0]?.commercialItemLink?.sourceRange).toBe("A1:C4");
    expect("lockedMetadataJson" in (lineItems[0]?.commercialItemLink ?? {})).toBe(false);
  });

  it("builds a source href for linked quote lines", () => {
    const href = buildCommercialItemSourceHref(
      {
        commercialItemLink: buildQuoteCommercialItemLink(buildCommercialItem()),
      },
      "long-bay-apartment",
    );

    expect(href).toBe("/app/leads-clients/opportunities/long-bay-apartment/pricing-worksheet/workbook-1?sheetId=sheet-1");
  });

  it("routes Takeoff provenance to the authoritative drawing and page", () => {
    const href = buildCommercialItemSourceHref({
      commercialItemLink: buildQuoteCommercialItemLink(buildCommercialItem({
        sourceType: "takeoff_measurement",
        sourceWorkbookId: null,
        sourceWorksheetId: null,
        sourceSheetId: null,
        sourceRange: null,
        sourceTakeoffMeasurementId: "measurement-1",
        sourceLinkJson: {
          sourceType: "takeoff_measurement",
          ownerType: "project",
          ownerSlug: "final-project",
          drawingSetId: "drawing-1",
          pageId: "page-2",
        },
      })),
    }, null);

    expect(href).toBe("/app/projects/final-project/takeoff/measure?drawingSetId=drawing-1&pageId=page-2");
  });

  it("keeps quote-owned worksheet links on the exact Project quote revision", () => {
    const href = buildCommercialItemSourceHref(
      {
        commercialItemLink: buildQuoteCommercialItemLink(buildCommercialItem({
          sourceLinkJson: {
            ownerType: "quote",
            projectSlug: "project-one",
            quoteId: "quote-2",
          },
        })),
      },
      "opportunity-one",
    );

    expect(href).toBe("/app/projects/project-one/preconstruction/quote/quote-2/pricing-worksheet/workbook-1?sheetId=sheet-1");
  });

  it("persists valid quote links through the existing rpc", async () => {
    const client = createMockClient();
    vi.mocked(repairProjectQuoteSourceOpportunityLineage).mockResolvedValueOnce({
      id: "quote-1",
      sourceOpportunityId: "opp-1",
    });
    vi.mocked(linkCommercialItemToQuoteLine).mockResolvedValueOnce({
      id: "link-1",
      organizationId: "org-1",
      commercialItemId: "item-1",
      documentKind: "quote_line",
      documentId: "quote-1",
      documentLineId: "line-1",
      linkRole: "source",
      snapshotAtLinkJson: { total: 325 },
      createdBy: "user-1",
      createdAt: "2026-07-07T02:00:00.000Z",
    });

    const results = await persistCommercialItemQuoteLinks({
      client,
      organizationId: "org-1",
      quoteId: "quote-1",
      quoteSourceOpportunityId: "opp-1",
      lineItems: [buildLineItem()],
    });

    expect(client.from).not.toHaveBeenCalled();
    expect(repairProjectQuoteSourceOpportunityLineage).toHaveBeenCalledWith(client, {
      organizationId: "org-1",
      quoteId: "quote-1",
    });
    expect(linkCommercialItemToQuoteLine).toHaveBeenCalledWith(client, expect.objectContaining({
      organizationId: "org-1",
      quoteId: "quote-1",
      quoteLineId: "line-1",
    }));
    expect(results).toHaveLength(1);
  });

  it("surfaces wrong-project or wrong-opportunity rpc rejections", async () => {
    const client = createMockClient();
    vi.mocked(repairProjectQuoteSourceOpportunityLineage).mockResolvedValueOnce({
      id: "quote-1",
      sourceOpportunityId: "opp-2",
    });

    await expect(
      persistCommercialItemQuoteLinks({
        client,
        organizationId: "org-1",
        quoteId: "quote-1",
        quoteSourceOpportunityId: "opp-1",
        lineItems: [buildLineItem()],
      }),
    ).rejects.toThrow("This quote belongs to a different opportunity.");
  });

  it("surfaces one-source-per-line rejections from the actual quote link path", async () => {
    const client = createMockClient();
    vi.mocked(repairProjectQuoteSourceOpportunityLineage).mockResolvedValueOnce({
      id: "quote-1",
      sourceOpportunityId: "opp-1",
    });
    vi.mocked(linkCommercialItemToQuoteLine).mockRejectedValueOnce(
      new Error("A quote line can only have one source commercial item"),
    );

    await expect(
      persistCommercialItemQuoteLinks({
        client,
        organizationId: "org-1",
        quoteId: "quote-1",
        quoteSourceOpportunityId: "opp-1",
        lineItems: [buildLineItem()],
      }),
    ).rejects.toThrow("A quote line can only have one source commercial item");
  });

  it("reports partial success when quote save succeeded but commercial item linking failed", async () => {
    const client = createMockClient();
    vi.mocked(repairProjectQuoteSourceOpportunityLineage).mockResolvedValueOnce({
      id: "quote-1",
      sourceOpportunityId: "opp-1",
    });
    vi.mocked(linkCommercialItemToQuoteLine).mockRejectedValueOnce(
      new Error("Commercial item cannot be linked to the selected quote line"),
    );

    const result = await persistCommercialItemQuoteLinksSafely({
      client,
      organizationId: "org-1",
      quoteId: "quote-1",
      quoteSourceOpportunityId: "opp-1",
      lineItems: [buildLineItem()],
    });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("Commercial item cannot be linked to the selected quote line");
  });

  it("keeps quote lines loadable when commercial item enrichment fails", async () => {
    const client = createMockClient();
    const warning = vi.fn();
    const baseLineItems = [
      {
        id: "line-1",
        section: "Item" as const,
        description: "Stud framing",
        quantity: 10,
        unit: "lm",
        rate: 32.5,
        isOptional: false,
      },
    ];

    vi.mocked(listCommercialItemDocumentLinksForQuote).mockRejectedValueOnce(new Error("read failed"));

    const result = await enrichQuoteLineItemsWithCommercialItems({
      client,
      organizationId: "org-1",
      quoteId: "quote-1",
      lineItems: baseLineItems,
      onWarning: warning,
    });

    expect(result).toEqual(baseLineItems);
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ message: "read failed" }));
  });
});
