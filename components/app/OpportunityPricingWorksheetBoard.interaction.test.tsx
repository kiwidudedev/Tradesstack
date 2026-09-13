import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  getPricingWorksheetFittedFormulaFontSize,
  PricingWorksheetSelectionSum,
  WorksheetCellView,
} from "./OpportunityPricingWorksheetBoard";

const boardSource = readFileSync(
  new URL("./OpportunityPricingWorksheetBoard.tsx", import.meta.url),
  "utf8",
);

const selectedRange = {
  kind: "cells" as const,
  startRowIndex: 0,
  endRowIndex: 0,
  startColumnIndex: 0,
  endColumnIndex: 0,
};

function renderCell(params?: { editing?: boolean; formulaReference?: boolean }) {
  const noop = vi.fn();
  return renderToStaticMarkup(
    <WorksheetCellView
      activeSelectedRange={selectedRange}
      activeCellKey={params?.editing ? "A1" : null}
      activeEditor={params?.editing ? "cell" : null}
      canWriteWorksheet
      cell={undefined}
      cellKey="A1"
      columnIndex={0}
      editingCellValue="=B1"
      fillPreviewRange={null}
      formulaReferenceHighlight={params?.formulaReference ? { colorIndex: 0 } : null}
      formulaReferenceRanges={[]}
      rowHeight={32}
      rowIndex={0}
      selectedRanges={[selectedRange]}
      onBeginCellEdit={noop}
      onBeginFillDrag={noop}
      onCellClick={noop}
      onCellContextMenu={noop}
      onCellMouseDown={noop}
      onCellMouseEnter={noop}
      onInputBlur={noop}
      onInputChange={noop}
      onInputKeyDown={noop}
      onInputSelect={noop}
      setInputRef={noop}
    />,
  );
}

describe("WorksheetCellView interaction visuals", () => {
  it("scales an in-cell formula to the measured cell width without enlarging short formulas", () => {
    expect(getPricingWorksheetFittedFormulaFontSize(14, 100, 80)).toBe(14);
    expect(getPricingWorksheetFittedFormulaFontSize(14, 100, 280)).toBe(5);
    expect(getPricingWorksheetFittedFormulaFontSize(14, 0, 280)).toBeGreaterThanOrEqual(1);
  });

  it("renders a selected cell without formula-reference decoration", () => {
    const markup = renderCell();
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-editing="false"');
    expect(markup).toContain('data-formula-reference="false"');
  });

  it("exposes authoritative edit and formula-reference states", () => {
    const markup = renderCell({ editing: true, formulaReference: true });
    expect(markup).toContain('data-editing="true"');
    expect(markup).toContain('data-formula-reference="true"');
    expect(markup).toContain('data-formula-reference-color="0"');
    expect(markup).toContain('data-formula-edit-outline="true"');
    expect(markup).toContain('data-formula-token-color="0"');
    expect(markup).toContain("rounded-none border-0 bg-transparent");
    expect(markup).toContain("shadow-none outline-none");
    expect(markup).toContain("color:transparent");
    expect(markup).toContain("font-size:14px");
    expect(markup).toContain("<input");
  });

  it("measures formula text and keeps the color layer and input on one shared font size", () => {
    const formulaFitStart = boardSource.indexOf("const fitFormulaToCell");
    const formulaFitEnd = boardSource.indexOf("const selectionEdgeFlags", formulaFitStart);
    const formulaFitSource = boardSource.slice(formulaFitStart, formulaFitEnd);

    expect(formulaFitSource).toContain("formulaLayer.scrollWidth");
    expect(formulaFitSource).toContain("formulaLayer.clientWidth");
    expect(formulaFitSource).toContain("getPricingWorksheetFittedFormulaFontSize");
    expect(formulaFitSource).toContain("ResizeObserver");
    expect(boardSource).toContain("measureRef={formulaTextLayerRef}");
    expect(boardSource).toContain("...formulaEditorStyle");
  });

  it("renders a reference as a thin dashed annotation without a fill", () => {
    const markup = renderCell({ formulaReference: true });
    expect(markup).toContain("border-[1.5px] border-dashed");
    expect(markup).not.toContain("rgb(219 234 254 / 0.55)");
  });

  it("consumes one armed reference-pick transaction in the grid event path", () => {
    const appendStart = boardSource.indexOf("const appendCellReferenceToFormula");
    const appendEnd = boardSource.indexOf("const handleCellBlur", appendStart);
    const appendSource = boardSource.slice(appendStart, appendEnd);

    expect(appendSource).toContain("if (!isFormulaReferencePickArmedRef.current)");
    expect(appendSource).toContain("applyWorksheetFormulaReferencePickTransaction");
    expect(appendSource).toContain("isFormulaReferencePickArmedRef.current = false");
    expect(appendSource).toContain('if (insertion.action === "noop")');
  });

  it("clears the reference-pick transaction when Escape cancels editing", () => {
    const cancelStart = boardSource.indexOf("const cancelCellEdit");
    const cancelEnd = boardSource.indexOf("const commitCellEdit", cancelStart);
    const cancelSource = boardSource.slice(cancelStart, cancelEnd);

    expect(cancelSource).toContain("isFormulaReferencePickArmedRef.current = false");
    expect(cancelSource).toContain('setEditingCellValue("")');
    expect(cancelSource).not.toContain("updateCell(");
  });
});

describe("PricingWorksheetSelectionSum", () => {
  it("renders the compact semantic Sum without a dropdown", () => {
    const markup = renderToStaticMarkup(
      <PricingWorksheetSelectionSum
        aggregate={{
          numericCellCount: 7,
          sum: 20933.66,
          displayValue: "$20,933.66",
          numberFormat: { kind: "currency", currencyCode: "NZD" },
        }}
      />,
    );

    expect(markup).toContain('data-testid="pricing-worksheet-selection-sum"');
    expect(markup).toContain("Sum:");
    expect(markup).toContain("$20,933.66");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("items-center justify-center");
    expect(markup).toContain("text-center");
    expect(markup).not.toContain("ChevronDown");
  });

  it.each([
    ["short", "12"],
    ["normal decimal", "3,890.98"],
    ["large grouped", "12,345,678.91"],
  ])("uses intrinsic single-line sizing for a %s Sum", (_label, displayValue) => {
    const markup = renderToStaticMarkup(
      <PricingWorksheetSelectionSum
        aggregate={{
          numericCellCount: 12,
          sum: Number(displayValue.replaceAll(",", "")),
          displayValue,
          numberFormat: { kind: "general" },
        }}
      />,
    );

    expect(markup).toContain(displayValue);
    expect(markup).toContain("w-max");
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).toContain("truncate");
    expect(markup).toContain("max-width:min(22rem, calc(100% - 2rem))");
    expect(markup).not.toContain("min-w-[9rem]");
    expect(markup).not.toContain("getPricingWorksheetSelectionSumFontSize");
    expect(markup).not.toContain("font-size:");
  });

  it("renders no placeholder when the aggregate is hidden", () => {
    expect(renderToStaticMarkup(<PricingWorksheetSelectionSum aggregate={null} />)).toBe("");
  });

  it("keeps aggregate derivation at board/header scope instead of row or cell props", () => {
    const aggregateStart = boardSource.indexOf("const selectionAggregate = useMemo");
    const aggregateSource = boardSource.slice(aggregateStart, aggregateStart + 240);
    const rowPropsStart = boardSource.indexOf("type WorksheetRowViewProps");
    const rowPropsEnd = boardSource.indexOf("const WorksheetRowView", rowPropsStart);
    const cellPropsStart = boardSource.indexOf("type WorksheetCellViewProps");
    const cellPropsEnd = boardSource.indexOf("export const WorksheetCellView", cellPropsStart);

    expect(aggregateSource).toContain("deriveWorksheetSelectionAggregate");
    expect(boardSource.slice(rowPropsStart, rowPropsEnd)).not.toContain("selectionAggregate");
    expect(boardSource.slice(cellPropsStart, cellPropsEnd)).not.toContain("selectionAggregate");
  });

  it("floats the Sum over the spreadsheet bottom-right without adding a status bar", () => {
    const formulaRowStart = boardSource.indexOf('className="mx-3 mt-2 flex shrink-0 items-center');
    const gridShellStart = boardSource.indexOf('data-testid="pricing-worksheet-grid-shell"', formulaRowStart);
    const gridStart = boardSource.indexOf('ref={worksheetViewportRef}', gridShellStart);
    const formulaRowSource = boardSource.slice(formulaRowStart, gridStart);
    const gridSource = boardSource.slice(gridShellStart, boardSource.indexOf("<WorkbookPagesTray", gridStart));

    expect(formulaRowSource).not.toContain("<PricingWorksheetSelectionSum aggregate={selectionAggregate} />");
    expect(gridSource).toContain("<PricingWorksheetSelectionSum aggregate={selectionAggregate} />");
    expect(gridSource).toContain('className="relative mx-3');
    expect(boardSource).toContain("pointer-events-none absolute right-4 bottom-4 z-20");
    expect(boardSource).not.toContain("pricing-worksheet-bottom-status");
  });
});
