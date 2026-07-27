import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorksheetData, type WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildPublishedWorksheetSelection, publishWorksheetSelection } from "@/lib/commercial-items/worksheet-publish";
import type { CommercialItemPayload, CommercialItemsClient } from "@/lib/commercial-items/types";
import type { WorksheetPublishDestinationAdapter } from "@/lib/commercial-items/destination-adapter";

vi.mock("@/lib/commercial-items/service", () => ({
  createCommercialItem: vi.fn(),
  listCommercialItemsForOpportunity: vi.fn(),
}));

import { createCommercialItem, listCommercialItemsForOpportunity } from "@/lib/commercial-items/service";

function setCell(worksheet: WorksheetData, columnIndex: number, rowIndex: number, value: string | number) {
  const column = worksheet.columns[columnIndex];
  const row = worksheet.rows[rowIndex];

  worksheet.cells[`${column.id}${row.id}`] = {
    value,
    type: typeof value === "number" ? "number" : "text",
    formula: null,
    computedValue: value,
    displayValue: String(value),
    metadata: {},
  };
}

function buildWorksheet() {
  const worksheet = createDefaultWorksheetData({ rowCount: 5, columnCount: 5 });
  worksheet.columns[0]!.label = "Description";
  worksheet.columns[1]!.label = "Qty";
  worksheet.columns[2]!.label = "Unit";
  worksheet.columns[3]!.label = "Rate";
  worksheet.columns[4]!.label = "Total";
  setCell(worksheet, 0, 1, "Stud framing");
  setCell(worksheet, 1, 1, 10);
  setCell(worksheet, 2, 1, "lm");
  setCell(worksheet, 3, 1, 32.5);
  setCell(worksheet, 4, 1, 325);
  return worksheet;
}

function createMockClient() {
  return {
    rpc: vi.fn(),
    from: vi.fn(),
  } as unknown as CommercialItemsClient;
}

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
    description: "Stud framing",
    quantity: 10,
    unit: "lm",
    rate: 32.5,
    total: 325,
    snapshotJson: {},
    sourceLinkJson: {},
    uclClassification: null,
    uclValidationStatus: "not_reviewed",
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("worksheet publish engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an existing commercial item when worksheet source identity and signature match", async () => {
    const worksheet = buildWorksheet();
    const selection = buildPublishedWorksheetSelection({
      destination: "quote",
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 4,
      },
      workbookId: "workbook-1",
      worksheetId: "workbook-1",
      sheetId: "sheet-1",
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
    });

    vi.mocked(listCommercialItemsForOpportunity).mockResolvedValueOnce([
      buildCommercialItem({
        sourceSignature: selection.commercialRows[0]!.sourceSignature,
      }),
    ]);

    const adapter: WorksheetPublishDestinationAdapter<{ targetId: string }, { ok: boolean }> = {
      destination: "quote",
      publish: vi.fn().mockResolvedValue({ ok: true }),
    };

    const result = await publishWorksheetSelection({
      client: createMockClient(),
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      workbookId: "workbook-1",
      worksheetId: "workbook-1",
      sheetId: "sheet-1",
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
        worksheet,
        selectionRange: {
          startRowIndex: 1,
          endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 4,
      },
      adapter,
      target: { targetId: "quote-1" },
    });

    expect(createCommercialItem).not.toHaveBeenCalled();
    expect(result.publishedRows[0]?.reusedCommercialItem).toBe(true);
  });

  it("creates a new commercial item when the source signature changes", async () => {
    const worksheet = buildWorksheet();
    vi.mocked(listCommercialItemsForOpportunity).mockResolvedValueOnce([
      buildCommercialItem({ sourceSignature: "old-sig" }),
    ]);
    vi.mocked(createCommercialItem).mockResolvedValueOnce(buildCommercialItem({ id: "item-2", sourceSignature: "new-sig" }));

    const adapter: WorksheetPublishDestinationAdapter<{ targetId: string }, { ok: boolean }> = {
      destination: "quote",
      publish: vi.fn().mockResolvedValue({ ok: true }),
    };

    const result = await publishWorksheetSelection({
      client: createMockClient(),
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      workbookId: "workbook-1",
      worksheetId: "workbook-1",
      sheetId: "sheet-1",
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
        worksheet,
        selectionRange: {
          startRowIndex: 1,
          endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 4,
      },
      adapter,
      target: { targetId: "quote-1" },
    });

    expect(createCommercialItem).toHaveBeenCalledTimes(1);
    expect(result.publishedRows[0]?.reusedCommercialItem).toBe(false);
  });

  it("creates pre-award commercial items with projectId null even when an opportunity has a hidden workspace bridge", async () => {
    const worksheet = buildWorksheet();
    vi.mocked(listCommercialItemsForOpportunity).mockResolvedValueOnce([]);
    vi.mocked(createCommercialItem).mockResolvedValueOnce(buildCommercialItem({
      id: "item-pre-award",
      projectId: null,
    }));

    const adapter: WorksheetPublishDestinationAdapter<{ targetId: string }, { ok: boolean }> = {
      destination: "quote",
      publish: vi.fn().mockResolvedValue({ ok: true }),
    };

    await publishWorksheetSelection({
      client: createMockClient(),
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: null,
      workbookId: "workbook-1",
      worksheetId: "workbook-1",
      sheetId: "sheet-1",
      worksheetName: "Pricing worksheet",
      sheetName: "Sheet 1",
      worksheet,
      selectionRange: {
        startRowIndex: 1,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 4,
      },
      adapter,
      target: { targetId: "quote-1" },
    });

    expect(createCommercialItem).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      opportunityId: "opp-1",
      projectId: null,
    }));
  });
});
