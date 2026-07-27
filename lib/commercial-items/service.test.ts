import { describe, expect, it, vi } from "vitest";
import {
  createCommercialItem,
  getCommercialItem,
  linkCommercialItemToPurchaseOrderLine,
  linkCommercialItemToQuoteLine,
  linkCommercialItemToVariationLine,
  listCommercialItemDocumentLinksForVariation,
  listCommercialItemDocumentLinksForQuote,
  listCommercialItemsByIds,
  listCommercialItemsForOpportunity,
  repairProjectQuoteSourceOpportunityLineage,
} from "@/lib/commercial-items/service";
import type { CommercialItemsClient } from "@/lib/commercial-items/types";

function createMockClient() {
  return {
    rpc: vi.fn(),
    from: vi.fn(),
  } as unknown as CommercialItemsClient;
}

describe("commercial item service", () => {
  it("maps createCommercialItem input into the base rpc contract", async () => {
    const client = createMockClient();
    const rpc = vi.mocked(client.rpc);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "item-1",
          organization_id: "org-1",
          opportunity_id: "opp-1",
          project_id: null,
          source_type: "worksheet_selection",
          source_workbook_id: "wb-1",
          source_worksheet_id: "wb-1",
          source_sheet_id: "sheet-1",
          source_range: "A1:B2",
          source_signature: "sig-1",
          source_version: 3,
          source_status: "current",
          stale_reason_code: null,
          last_source_checked_at: null,
          last_source_changed_at: null,
          description: "Wall framing",
          quantity: "12.500",
          unit: "m2",
          rate: "95.00",
          total: "1187.50",
          snapshot_json: { description: "Wall framing" },
          source_link_json: { workbookId: "wb-1" },
          ucl_classification: null,
          ucl_validation_status: "not_reviewed",
          created_by: "user-1",
          updated_by: "user-1",
          created_at: "2026-07-07T00:00:00.000Z",
          updated_at: "2026-07-07T00:00:00.000Z",
        },
      ],
      error: null,
    } as never);

    const result = await createCommercialItem(client, {
      organizationId: "org-1",
      opportunityId: "opp-1",
      sourceWorkbookId: "wb-1",
      sourceSheetId: "sheet-1",
      sourceRange: "A1:B2",
      sourceSignature: "sig-1",
      description: "Wall framing",
      snapshotJson: { description: "Wall framing" },
      sourceLinkJson: { workbookId: "wb-1" },
      lockedMetadataJson: { formulas: ["=SUM(A1:A2)"] },
    });

    expect(rpc).toHaveBeenCalledWith("create_commercial_item", {
      p_input: expect.objectContaining({
        organizationId: "org-1",
        opportunityId: "opp-1",
        sourceWorkbookId: "wb-1",
        sourceWorksheetId: "wb-1",
        sourceSheetId: "sheet-1",
        sourceRange: "A1:B2",
        sourceSignature: "sig-1",
      }),
    });
    expect(result.quantity).toBe(12.5);
    expect(result.rate).toBe(95);
    expect(result.total).toBe(1187.5);
    expect("lockedMetadataJson" in result).toBe(false);
  });

  it("does not expose locked metadata from default read contracts", async () => {
    const client = createMockClient();
    const rpc = vi.mocked(client.rpc);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "item-2",
          organization_id: "org-1",
          opportunity_id: "opp-1",
          project_id: "project-1",
          source_type: "worksheet_selection",
          source_workbook_id: "wb-1",
          source_worksheet_id: "wb-1",
          source_sheet_id: "sheet-1",
          source_range: "A5:C8",
          source_signature: "sig-2",
          source_version: 1,
          source_status: "current",
          stale_reason_code: null,
          last_source_checked_at: null,
          last_source_changed_at: null,
          description: "Ceiling grid",
          quantity: 25,
          unit: "m2",
          rate: 42,
          total: 1050,
          snapshot_json: {},
          source_link_json: {},
          ucl_classification: null,
          ucl_validation_status: "not_reviewed",
          created_by: "user-1",
          updated_by: "user-1",
          created_at: "2026-07-07T01:00:00.000Z",
          updated_at: "2026-07-07T01:00:00.000Z",
        },
      ],
      error: null,
    } as never);

    const result = await listCommercialItemsForOpportunity(client, {
      organizationId: "org-1",
      opportunityId: "opp-1",
    });

    expect(rpc).toHaveBeenCalledWith("list_commercial_items_for_opportunity", {
      p_organization_id: "org-1",
      p_opportunity_id: "opp-1",
    });
    expect(result[0]?.description).toBe("Ceiling grid");
    expect(result[0]).not.toHaveProperty("lockedMetadataJson");
  });

  it("reads a single commercial item without locked metadata by default", async () => {
    const client = createMockClient();
    const rpc = vi.mocked(client.rpc);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "item-3",
          organization_id: "org-1",
          opportunity_id: "opp-1",
          project_id: "project-1",
          source_type: "worksheet_selection",
          source_workbook_id: "wb-1",
          source_worksheet_id: "wb-1",
          source_sheet_id: "sheet-2",
          source_range: "C4:D9",
          source_signature: "sig-3",
          source_version: 2,
          source_status: "current",
          stale_reason_code: null,
          last_source_checked_at: null,
          last_source_changed_at: null,
          description: "Doors package",
          quantity: "3",
          unit: "ea",
          rate: "450",
          total: "1350",
          snapshot_json: { description: "Doors package" },
          source_link_json: { workbookId: "wb-1", range: "C4:D9" },
          ucl_classification: null,
          ucl_validation_status: "not_reviewed",
          created_by: "user-1",
          updated_by: "user-1",
          created_at: "2026-07-07T01:00:00.000Z",
          updated_at: "2026-07-07T01:00:00.000Z",
        },
      ],
      error: null,
    } as never);

    const result = await getCommercialItem(client, {
      commercialItemId: "item-3",
    });

    expect(rpc).toHaveBeenCalledWith("get_commercial_item", {
      p_commercial_item_id: "item-3",
    });
    expect(result?.description).toBe("Doors package");
    expect(result).not.toHaveProperty("lockedMetadataJson");
  });

  it("lists commercial items by ids through the safe table projection", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const inMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "item-7",
          organization_id: "org-1",
          opportunity_id: "opp-1",
          project_id: "project-1",
          source_type: "worksheet_selection",
          source_workbook_id: "wb-1",
          source_worksheet_id: "wb-1",
          source_sheet_id: "sheet-1",
          source_range: "A1:C4",
          source_signature: "sig-7",
          source_version: 1,
          source_status: "current",
          stale_reason_code: null,
          last_source_checked_at: null,
          last_source_changed_at: null,
          description: "Stud framing",
          quantity: "10",
          unit: "lm",
          rate: "32.5",
          total: "325",
          snapshot_json: {},
          source_link_json: { worksheetName: "Pricing" },
          ucl_classification: null,
          ucl_validation_status: "not_reviewed",
          created_by: "user-1",
          updated_by: "user-1",
          created_at: "2026-07-07T04:00:00.000Z",
          updated_at: "2026-07-07T04:00:00.000Z",
        },
      ],
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ in: inMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    from.mockReturnValue({ select: selectMock } as never);

    const result = await listCommercialItemsByIds(client, {
      organizationId: "org-1",
      commercialItemIds: ["item-7"],
    });

    expect(from).toHaveBeenCalledWith("commercial_items");
    expect(result[0]?.description).toBe("Stud framing");
    expect(result[0]).not.toHaveProperty("lockedMetadataJson");
  });

  it("lists quote commercial item links from the safe link table", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const eqLinkRoleMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "link-7",
          organization_id: "org-1",
          commercial_item_id: "item-7",
          document_kind: "quote_line",
          document_id: "quote-1",
          document_line_id: "line-1",
          link_role: "source",
          snapshot_at_link_json: { total: 325 },
          created_by: "user-1",
          created_at: "2026-07-07T05:00:00.000Z",
        },
      ],
      error: null,
    });
    const eqDocumentIdMock = vi.fn().mockReturnValue({ eq: eqLinkRoleMock });
    const eqDocumentKindMock = vi.fn().mockReturnValue({ eq: eqDocumentIdMock });
    const eqOrgMock = vi.fn().mockReturnValue({ eq: eqDocumentKindMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqOrgMock });

    from.mockReturnValue({ select: selectMock } as never);

    const result = await listCommercialItemDocumentLinksForQuote(client, {
      organizationId: "org-1",
      quoteId: "quote-1",
    });

    expect(from).toHaveBeenCalledWith("commercial_item_document_links");
    expect(result).toHaveLength(1);
    expect(result[0]?.commercialItemId).toBe("item-7");
  });

  it("maps quote link creation into the quote rpc contract", async () => {
    const client = createMockClient();
    const rpc = vi.mocked(client.rpc);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "link-1",
          organization_id: "org-1",
          commercial_item_id: "item-1",
          document_kind: "quote_line",
          document_id: "quote-1",
          document_line_id: "quote-line-1",
          link_role: "source",
          snapshot_at_link_json: { total: 1187.5 },
          created_by: "user-1",
          created_at: "2026-07-07T02:00:00.000Z",
        },
      ],
      error: null,
    } as never);

    const result = await linkCommercialItemToQuoteLine(client, {
      organizationId: "org-1",
      commercialItemId: "item-1",
      quoteId: "quote-1",
      quoteLineId: "quote-line-1",
      snapshotAtLinkJson: { total: 1187.5 },
    });

    expect(rpc).toHaveBeenCalledWith("link_commercial_item_to_quote_line", {
      p_input: {
        organizationId: "org-1",
        commercialItemId: "item-1",
        quoteId: "quote-1",
        quoteLineId: "quote-line-1",
        linkRole: "source",
        snapshotAtLinkJson: { total: 1187.5 },
      },
    });
    expect(result.documentKind).toBe("quote_line");
  });

  it("maps quote lineage repair into the internal quote lineage rpc contract", async () => {
    const client = createMockClient();
    const rpc = vi.mocked(client.rpc);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "quote-1",
          source_opportunity_id: "opp-1",
        },
      ],
      error: null,
    } as never);

    const result = await repairProjectQuoteSourceOpportunityLineage(client, {
      organizationId: "org-1",
      quoteId: "quote-1",
    });

    expect(rpc).toHaveBeenCalledWith("repair_project_quote_source_opportunity_lineage", {
      p_organization_id: "org-1",
      p_quote_id: "quote-1",
    });
    expect(result).toEqual({
      id: "quote-1",
      sourceOpportunityId: "opp-1",
    });
  });

  it("maps purchase order link creation into the purchase order rpc contract", async () => {
    const client = createMockClient();
    const rpc = vi.mocked(client.rpc);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "link-2",
          organization_id: "org-1",
          commercial_item_id: "item-1",
          document_kind: "purchase_order_line",
          document_id: "po-1",
          document_line_id: "po-line-1",
          link_role: "source",
          snapshot_at_link_json: { total: 1187.5 },
          created_by: "user-1",
          created_at: "2026-07-07T02:30:00.000Z",
        },
      ],
      error: null,
    } as never);

    const result = await linkCommercialItemToPurchaseOrderLine(client, {
      organizationId: "org-1",
      commercialItemId: "item-1",
      purchaseOrderId: "po-1",
      purchaseOrderLineId: "po-line-1",
      snapshotAtLinkJson: { total: 1187.5 },
    });

    expect(rpc).toHaveBeenCalledWith("link_commercial_item_to_purchase_order_line", {
      p_input: {
        organizationId: "org-1",
        commercialItemId: "item-1",
        purchaseOrderId: "po-1",
        purchaseOrderLineId: "po-line-1",
        linkRole: "source",
        snapshotAtLinkJson: { total: 1187.5 },
      },
    });
    expect(result.documentKind).toBe("purchase_order_line");
  });

  it("lists variation commercial item links from the safe link table", async () => {
    const client = createMockClient();
    const from = vi.mocked(client.from);
    const eqLinkRoleMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "link-variation-1",
          organization_id: "org-1",
          commercial_item_id: "item-9",
          document_kind: "variation_line",
          document_id: "variation-1",
          document_line_id: "line-9",
          link_role: "source",
          snapshot_at_link_json: { total: 222 },
          created_by: "user-1",
          created_at: "2026-07-14T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const eqDocumentIdMock = vi.fn().mockReturnValue({ eq: eqLinkRoleMock });
    const eqDocumentKindMock = vi.fn().mockReturnValue({ eq: eqDocumentIdMock });
    const eqOrganizationMock = vi.fn().mockReturnValue({ eq: eqDocumentKindMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqOrganizationMock });

    from.mockReturnValue({ select: selectMock } as never);

    const result = await listCommercialItemDocumentLinksForVariation(client, {
      organizationId: "org-1",
      variationId: "variation-1",
    });

    expect(from).toHaveBeenCalledWith("commercial_item_document_links");
    expect(result[0]?.documentKind).toBe("variation_line");
    expect(result[0]?.documentId).toBe("variation-1");
  });

  it("maps variation link creation into the variation rpc contract", async () => {
    const client = createMockClient();
    const rpc = vi.mocked(client.rpc);

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "link-variation-2",
          organization_id: "org-1",
          commercial_item_id: "item-10",
          document_kind: "variation_line",
          document_id: "variation-1",
          document_line_id: "line-10",
          link_role: "source",
          snapshot_at_link_json: { total: 500 },
          created_by: "user-1",
          created_at: "2026-07-14T00:00:00.000Z",
        },
      ],
      error: null,
    } as never);

    const result = await linkCommercialItemToVariationLine(client, {
      organizationId: "org-1",
      commercialItemId: "item-10",
      variationId: "variation-1",
      variationLineId: "line-10",
      snapshotAtLinkJson: { total: 500 },
    });

    expect(rpc).toHaveBeenCalledWith("link_commercial_item_to_variation_line", {
      p_input: {
        organizationId: "org-1",
        commercialItemId: "item-10",
        variationId: "variation-1",
        variationLineId: "line-10",
        linkRole: "source",
        snapshotAtLinkJson: { total: 500 },
      },
    });
    expect(result.documentKind).toBe("variation_line");
  });
});
