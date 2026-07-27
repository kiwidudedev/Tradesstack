import { describe, expect, it } from "vitest";
import { buildPurchaseOrderPublishPreview } from "@/lib/commercial-items/worksheet-purchase-order-classification";
import type { PublishedWorksheetSelection } from "@/lib/commercial-items/published-worksheet-selection";

function buildSelection(): PublishedWorksheetSelection {
  return {
    destination: "purchase_order",
    selectionRange: {
      startRowIndex: 0,
      endRowIndex: 7,
      startColumnIndex: 0,
      endColumnIndex: 4,
    },
    commercialRows: [
      {
        rowId: "materials",
        rowIndex: 1,
        rowLabel: "2",
        sourceRowIndex: 1,
        sourceRange: { startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        sourceRangeLabel: "A2:E2",
        sectionHeading: "Materials",
        rowCategoryHint: "Materials",
        description: "GIB plasterboard",
        quantity: 10,
        unit: "sheet",
        rate: 20,
        total: 200,
        snapshotJson: {},
        sourceLinkJson: {},
        lockedMetadataJson: {},
        sourceSignature: "sig-materials",
      },
      {
        rowId: "subcontract",
        rowIndex: 2,
        rowLabel: "3",
        sourceRowIndex: 2,
        sourceRange: { startRowIndex: 2, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 },
        sourceRangeLabel: "A3:E3",
        sectionHeading: "Subcontractors",
        rowCategoryHint: "Subcontractors",
        description: "Electrical subcontract",
        quantity: 1,
        unit: "sum",
        rate: 5000,
        total: 5000,
        snapshotJson: {},
        sourceLinkJson: {},
        lockedMetadataJson: {},
        sourceSignature: "sig-subcontract",
      },
      {
        rowId: "plant",
        rowIndex: 3,
        rowLabel: "4",
        sourceRowIndex: 3,
        sourceRange: { startRowIndex: 3, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 4 },
        sourceRangeLabel: "A4:E4",
        sectionHeading: "Plant",
        rowCategoryHint: "Plant",
        description: "Scissor lift hire",
        quantity: 2,
        unit: "day",
        rate: 300,
        total: 600,
        snapshotJson: {},
        sourceLinkJson: {},
        lockedMetadataJson: {},
        sourceSignature: "sig-plant",
      },
      {
        rowId: "labour",
        rowIndex: 4,
        rowLabel: "5",
        sourceRowIndex: 4,
        sourceRange: { startRowIndex: 4, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 4 },
        sourceRangeLabel: "A5:E5",
        sectionHeading: "Labour",
        rowCategoryHint: "Labour",
        description: "Installation labour",
        quantity: 8,
        unit: "hrs",
        rate: 85,
        total: 680,
        snapshotJson: {},
        sourceLinkJson: {},
        lockedMetadataJson: {},
        sourceSignature: "sig-labour",
      },
      {
        rowId: "gst",
        rowIndex: 5,
        rowLabel: "6",
        sourceRowIndex: 5,
        sourceRange: { startRowIndex: 5, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 4 },
        sourceRangeLabel: "A6:E6",
        sectionHeading: null,
        rowCategoryHint: null,
        description: "GST",
        quantity: 1,
        unit: "sum",
        rate: 15,
        total: 15,
        snapshotJson: {},
        sourceLinkJson: {},
        lockedMetadataJson: {},
        sourceSignature: "sig-gst",
      },
      {
        rowId: "unknown",
        rowIndex: 6,
        rowLabel: "7",
        sourceRowIndex: 6,
        sourceRange: { startRowIndex: 6, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 4 },
        sourceRangeLabel: "A7:E7",
        sectionHeading: null,
        rowCategoryHint: null,
        description: "Misc package",
        quantity: 1,
        unit: "sum",
        rate: 100,
        total: 100,
        snapshotJson: {},
        sourceLinkJson: {},
        lockedMetadataJson: {},
        sourceSignature: "sig-unknown",
      },
    ],
    skippedRows: [
      {
        rowId: "header",
        rowIndex: 0,
        rowLabel: "1",
        reason: "heading_row",
      },
      {
        rowId: "grand-total",
        rowIndex: 7,
        rowLabel: "8",
        reason: "grand_total_row",
      },
    ],
  };
}

describe("worksheet purchase order classification", () => {
  it("classifies eligible, excluded, and unknown procurement rows deterministically", () => {
    const preview = buildPurchaseOrderPublishPreview(buildSelection());
    const byId = new Map(preview.rows.map((row) => [row.rowId, row]));

    expect(byId.get("materials")).toMatchObject({
      status: "eligible",
      suggestedSection: "Materials",
      selectedByDefault: true,
    });
    expect(byId.get("subcontract")).toMatchObject({
      status: "eligible",
      suggestedSection: "Subcontractors",
      selectedByDefault: true,
    });
    expect(byId.get("plant")).toMatchObject({
      status: "eligible",
      suggestedSection: "Plant",
      selectedByDefault: true,
    });
    expect(byId.get("labour")).toMatchObject({
      status: "eligible",
      reasonCode: "labour",
      suggestedSection: "Labour",
      selectedByDefault: true,
    });
    expect(byId.get("gst")).toMatchObject({
      status: "excluded",
      reasonCode: "tax",
    });
    expect(byId.get("unknown")).toMatchObject({
      status: "unknown",
      selectedByDefault: false,
    });
    expect(byId.get("header")).toMatchObject({
      status: "excluded",
      reasonCode: "header",
    });
    expect(byId.get("grand-total")).toMatchObject({
      status: "excluded",
      reasonCode: "grand_total",
    });
  });
});
