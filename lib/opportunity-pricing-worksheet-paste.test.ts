import { describe, expect, it } from "vitest";

import {
  buildWorksheetClipboardPayload,
  getWorksheetPasteSelectionRange,
  parseWorksheetClipboardHtml,
  parseWorksheetClipboardPayload,
  parseWorksheetClipboardText,
  normalizeExternalWorksheetClipboardInput,
  mergeExternalWorksheetClipboard,
  serializeWorksheetClipboardPayload,
  applyWorksheetPasteDimensions,
  applyWorksheetPasteToCells,
} from "./opportunity-pricing-worksheet-paste";
import { createDefaultWorksheetData, normalizeWorksheetCell } from "./opportunity-pricing-worksheet-defaults";
import { applyWorksheetClipboardPayloadToCells } from "./opportunity-pricing-worksheet-paste";
import { shiftFormulaForFill } from "./opportunity-pricing-worksheet-formula-shift";
import { buildWorksheetHtmlFromRange } from "./opportunity-pricing-worksheet-copy";

describe("parseWorksheetClipboardText", () => {
  it("selects the complete rectangular destination after a multi-cell paste", () => {
    expect(getWorksheetPasteSelectionRange({ rowIndex: 2, columnIndex: 3 }, { rowCount: 2, columnCount: 3 })).toEqual({
      startRowIndex: 2,
      endRowIndex: 3,
      startColumnIndex: 3,
      endColumnIndex: 5,
    });
  });

  it("treats newline-only clipboard content as a multi-row paste", () => {
    expect(parseWorksheetClipboardText("Labour\nMaterials")).toMatchObject({
      isTabular: true,
      rowCount: 2,
      columnCount: 1,
      rows: [["Labour"], ["Materials"]],
    });
  });

  it("keeps a single clipboard value as a scalar paste", () => {
    expect(parseWorksheetClipboardText("Labour")).toMatchObject({
      isTabular: false,
      rowCount: 1,
      columnCount: 1,
    });
  });

  it("round-trips structured clipboard data with formula and format metadata", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 3, columnCount: 3 });
    worksheet.cells.B1 = { ...normalizeWorksheetCell("=A1*2"), metadata: { format: { text: { bold: true } } } };
    const payload = buildWorksheetClipboardPayload(worksheet, { startRowIndex: 0, endRowIndex: 0, startColumnIndex: 1, endColumnIndex: 1 });
    expect(parseWorksheetClipboardPayload(serializeWorksheetClipboardPayload(payload))).toEqual(payload);
  });

  it("round-trips row heights and column widths with structured clipboard data", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 2 });
    worksheet.rows[0] = { ...worksheet.rows[0], height: 72 };
    worksheet.rows[1] = { ...worksheet.rows[1], height: 48 };
    worksheet.columns[0] = { ...worksheet.columns[0], width: 220 };
    worksheet.columns[1] = { ...worksheet.columns[1], width: 96 };

    const payload = buildWorksheetClipboardPayload(worksheet, {
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 0,
      endColumnIndex: 1,
    });
    expect(parseWorksheetClipboardPayload(serializeWorksheetClipboardPayload(payload))).toMatchObject({
      rowHeights: [72, 48],
      columnWidths: [220, 96],
    });
  });

  it("translates relative references and preserves absolute references on structured paste", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 6, columnCount: 6 });
    const payload = {
      version: 1 as const,
      origin: { rowIndex: 0, columnIndex: 0 },
      rows: [[{ input: "=A1+$B$1+C$1+$D1", format: { text: { italic: true } } }]],
    };
    const pasted = applyWorksheetClipboardPayloadToCells(worksheet, { rowIndex: 2, columnIndex: 2 }, payload, normalizeWorksheetCell, shiftFormulaForFill);
    expect(pasted.cells.C3?.formula).toBe("=C3+$B$1+E$1+$D3");
    expect(pasted.cells.C3?.metadata.format).toEqual({ text: { italic: true } });
  });

  it("matches the observed Excel copy case from C1 to C3", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 4, columnCount: 4 });
    const payload = {
      version: 1 as const,
      origin: { rowIndex: 0, columnIndex: 2 },
      rows: [[{ input: "=A1+B1" }]],
    };
    const pasted = applyWorksheetClipboardPayloadToCells(worksheet, { rowIndex: 2, columnIndex: 2 }, payload, normalizeWorksheetCell, shiftFormulaForFill);
    expect(pasted.cells.C3?.formula).toBe("=A3+B3");
  });

  it("extracts Excel-style HTML cell formatting without trusting display values for formulas", () => {
    const parsed = parseWorksheetClipboardHtml('<table><tr><td style="font-weight:bold;background-color:#ffff00">12</td></tr></table>');
    expect(parsed?.rows).toEqual([["12"]]);
    expect(parsed?.formats?.[0]?.[0]).toEqual({ text: { bold: true }, fill: { color: "#ffff00" } });
  });

  it("parses Excel class styles, borders, number formats and explicit formula metadata", () => {
    const parsed = parseWorksheetClipboardHtml(`
      <style>
        td { font-family:Arial; font-size:10pt; white-space:nowrap; }
        .xl1 { color:red; font-weight:700; font-style:italic; border:1pt solid black; background:yellow; mso-number-format:'$\\#,##0.00'; }
      </style>
      <table><tr><td class="xl1" data-formula="=B2*C2">$20.00</td></tr></table>
    `);
    expect(parsed?.rows).toEqual([["=B2*C2"]]);
    expect(parsed?.formulas).toEqual([["=B2*C2"]]);
    expect(parsed?.formats?.[0]?.[0]).toMatchObject({
      text: { bold: true, italic: true, color: "red", wrap: "clip" },
      fill: { color: "yellow" },
      border: { top: { color: "black", style: "solid" } },
      number: { kind: "currency", decimalPlaces: 2, currencyCode: "NZD" },
    });
  });

  it("parses Excel row and column dimensions", () => {
    const parsed = parseWorksheetClipboardHtml(`
      <table>
        <colgroup><col style="width: 180px"><col style="width: 72pt"></colgroup>
        <tr class="xlRow" style="height: 30pt"><td>A</td><td>B</td></tr>
      </table>
    `);
    expect(parsed?.rowHeights).toEqual([40]);
    expect(parsed?.columnWidths).toEqual([180, 96]);

    const classSized = parseWorksheetClipboardHtml(`
      <style>.xlRow { height: 24pt; }</style>
      <table><tr class="xlRow"><td>A</td></tr></table>
    `);
    expect(classSized?.rowHeights).toEqual([32]);
  });

  it("uses cell dimensions when external clipboard HTML omits colgroup and tr sizing", () => {
    const parsed = parseWorksheetClipboardHtml(`
      <table>
        <tr><td style="height: 18pt; width: 144px">A</td><td style="width: 72pt">B</td></tr>
        <tr><td style="height: 24px; width: 144px">C</td><td style="width: 72pt">D</td></tr>
      </table>
    `);
    expect(parsed?.rowHeights).toEqual([24, 24]);
    expect(parsed?.columnWidths).toEqual([144, 96]);
  });

  it("uses CSS class dimensions from spreadsheet clipboard HTML", () => {
    const parsed = parseWorksheetClipboardHtml(`
      <style>
        .xlRow { height: 30pt; }
        .xlColA { width: 180px; }
        .xlColB { width: 72pt; }
      </style>
      <table>
        <tr class="xlRow"><td class="xlColA">A</td><td class="xlColB">B</td></tr>
        <tr class="xlRow"><td class="xlColA">C</td><td class="xlColB">D</td></tr>
      </table>
    `);

    expect(parsed?.rowHeights).toEqual([40, 40]);
    expect(parsed?.columnWidths).toEqual([180, 96]);
  });

  it("keeps formatting on blank pasted cells and applies pasted dimensions", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 2, columnCount: 2 });
    const pasted = applyWorksheetPasteToCells(worksheet, { rowIndex: 0, columnIndex: 0 }, {
      rows: [["", "42"]],
      rowCount: 1,
      columnCount: 2,
      isTabular: true,
      formats: [[{ fill: { color: "#ffff00" }, border: { bottom: { color: "#000000", style: "solid" } } }, undefined]],
      rowHeights: [54],
      columnWidths: [240, 88],
    }, normalizeWorksheetCell);
    const resized = applyWorksheetPasteDimensions(pasted, { rowIndex: 0, columnIndex: 0 }, {
      rowHeights: [54],
      columnWidths: [240, 88],
    });

    expect(resized.cells.A1?.metadata.format).toMatchObject({ fill: { color: "#ffff00" } });
    expect(resized.cells.B1?.value).toBe(42);
    expect(resized.rows[0]?.height).toBe(54);
    expect(resized.columns[0]?.width).toBe(240);
    expect(resized.columns[1]?.width).toBe(88);
  });

  it("recovers numeric values from displayed Excel currency and percentage text", () => {
    expect(normalizeExternalWorksheetClipboardInput("$1,234.50", { number: { kind: "currency", decimalPlaces: 2 } })).toBe("1234.5");
    expect(normalizeExternalWorksheetClipboardInput("25%", { number: { kind: "percent" } })).toBe("0.25");
    expect(normalizeExternalWorksheetClipboardInput("$20.00", undefined)).toBe("$20.00");
  });

  it("keeps the plain Excel TSV rectangle when the HTML table is sparse", () => {
    const plain = parseWorksheetClipboardText("Header\t\tTotal\nItem\t2\t=SUM(B1:B1)\n\t\t\nFooter\t\tDone");
    const html = parseWorksheetClipboardHtml('<table><tr><td style="font-weight:bold">Header</td><td>Total</td></tr><tr><td>Item</td><td data-formula="=SUM(B1:B1)">2</td></tr></table>');
    const merged = mergeExternalWorksheetClipboard(plain, html);
    expect(merged).toMatchObject({ rowCount: 4, columnCount: 3 });
    expect(merged?.rows).toEqual([
      ["Header", "", "Total"],
      ["Item", "=SUM(B1:B1)", "=SUM(B1:B1)"],
      ["", "", ""],
      ["Footer", "", "Done"],
    ]);
    expect(merged?.formats?.[0]?.[0]).toEqual({ text: { bold: true } });
  });

  it("emits a style-preserving HTML clipboard representation", () => {
    const worksheet = createDefaultWorksheetData({ rowCount: 1, columnCount: 1 });
    worksheet.cells.A1 = {
      ...normalizeWorksheetCell("42"),
      metadata: {
        format: {
          text: { bold: true, align: "right" },
          fill: { color: "#ffff00" },
          border: { bottom: { color: "#000000", style: "solid" } },
        },
      },
    };

    expect(buildWorksheetHtmlFromRange(worksheet, {
      startRowIndex: 0,
      endRowIndex: 0,
      startColumnIndex: 0,
      endColumnIndex: 0,
    })).toBe('<table><colgroup><col style="width:140px"></colgroup><tbody><tr style="height:36px"><td style="font-weight:bold;text-align:right;background-color:#ffff00;border-bottom:1px solid #000000">42</td></tr></tbody></table>');
  });
});
