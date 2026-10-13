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
    })).toBe('<table><tbody><tr><td style="font-weight:bold;text-align:right;background-color:#ffff00;border-bottom:1px solid #000000">42</td></tr></tbody></table>');
  });
});
