import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkbookPagesTray } from "@/components/app/WorkbookPagesTray";
import {
  createDefaultWorksheetData,
  createDefaultWorksheetExtractedPricingData,
  createDefaultWorksheetPricingSummary,
} from "@/lib/opportunity-pricing-worksheet-defaults";
import { buildWorksheetCellKey } from "@/lib/opportunity-pricing-worksheet-paste";
import type { OpportunityPricingWorkbookSheet } from "@/lib/opportunity-pricing-workbook";

function buildSheet(
  id: string,
  name: string,
  sheetOrder: number,
  options?: { sampleCellValue?: string },
): OpportunityPricingWorkbookSheet {
  const worksheet = createDefaultWorksheetData({
    sheetName: name,
    rowCount: 6,
    columnCount: 4,
  });

  if (options?.sampleCellValue) {
    worksheet.cells[buildWorksheetCellKey("A", "1")] = {
      ...worksheet.cells[buildWorksheetCellKey("A", "1")],
      value: options.sampleCellValue,
      displayValue: options.sampleCellValue,
    };
  }

  return {
    createdAt: "2026-05-31T00:00:00.000Z",
    createdBy: "user-1",
    extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
    id,
    isDefault: sheetOrder === 0,
    name,
    pricingSummary: createDefaultWorksheetPricingSummary(),
    sheetOrder,
    updatedAt: "2026-05-31T00:00:00.000Z",
    updatedBy: "user-1",
    version: worksheet.version,
    workbookId: "workbook-1",
    worksheet,
  };
}

describe("WorkbookPagesTray", () => {
  it("renders the light tray treatment with active page styling and names", () => {
    const markup = renderToStaticMarkup(
      <WorkbookPagesTray
        canWriteWorksheet
        isLoadingWorksheet={false}
        isMutatingPages={false}
        isOpen
        onAddBlankPage={vi.fn()}
        onDeletePage={vi.fn()}
        onDuplicatePage={vi.fn()}
        onRenamePage={vi.fn()}
        onSwitchPage={vi.fn()}
        sheets={[
          buildSheet("sheet-1", "Partitions", 0),
          buildSheet("sheet-2", "Ceiling Area", 1),
        ]}
        worksheetSheetId="sheet-1"
      />,
    );

    expect(markup).toContain('data-testid="workbook-pages-tray"');
    expect(markup).toContain('data-theme="light"');
    expect(markup).toContain("Partitions");
    expect(markup).toContain("Ceiling Area");
    expect(markup).toContain("ACTIVE");
    expect(markup).toContain('data-testid="workbook-page-card-sheet-1"');
    expect(markup).toContain('data-active="true"');
    expect(markup).toContain("bg-[#ECEEF3]");
    expect(markup).toContain("block px-3 py-2");
    expect(markup).not.toContain("Workbook Pages");
    expect(markup).not.toContain("Switch between worksheet pages");
  });

  it("does not render worksheet cell content inside the blank page thumbnail", () => {
    const markup = renderToStaticMarkup(
      <WorkbookPagesTray
        canWriteWorksheet
        isLoadingWorksheet={false}
        isMutatingPages={false}
        isOpen
        onAddBlankPage={vi.fn()}
        onDeletePage={vi.fn()}
        onDuplicatePage={vi.fn()}
        onRenamePage={vi.fn()}
        onSwitchPage={vi.fn()}
        sheets={[buildSheet("sheet-1", "Partitions", 0, { sampleCellValue: "Should Not Render" })]}
        worksheetSheetId="sheet-1"
      />,
    );

    expect(markup).not.toContain("Should Not Render");
    expect(markup).not.toContain("rows");
    expect(markup).not.toContain("cols");
    expect(markup).not.toContain("filled");
  });

  it("renders the inline new page split control", () => {
    const markup = renderToStaticMarkup(
      <WorkbookPagesTray
        canWriteWorksheet
        isLoadingWorksheet={false}
        isMutatingPages={false}
        isOpen
        onAddBlankPage={vi.fn()}
        onDeletePage={vi.fn()}
        onDuplicatePage={vi.fn()}
        onRenamePage={vi.fn()}
        onSwitchPage={vi.fn()}
        sheets={[buildSheet("sheet-1", "Partitions", 0)]}
        worksheetSheetId="sheet-1"
      />,
    );

    expect(markup).toContain('data-testid="workbook-pages-new-split-control"');
    expect(markup).toContain("Add workbook page");
    expect(markup).toContain("More new page options");
  });
});
