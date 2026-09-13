import { describe, expect, it } from "vitest";

import {
  buildPricingWorksheetFormulaPresentation,
  getWorksheetCaretIndexFromTextMetrics,
} from "./pricing-worksheet-formula-presentation";
import { applyWorksheetFormulaReferencePickTransaction } from "./pricing-worksheet-interaction";

describe("pricing worksheet formula presentation", () => {
  it("assigns stable colours to distinct references without changing formula text", () => {
    const formula = "=B8*C8+B8+SUM(D8:F8)";
    const presentation = buildPricingWorksheetFormulaPresentation(formula);

    expect(presentation.segments.map((segment) => segment.text).join("")).toBe(formula);
    expect(presentation.references.map((reference) => [
      reference.normalizedRef,
      reference.colorIndex,
    ])).toEqual([
      ["B8", 0],
      ["C8", 1],
      ["B8", 0],
      ["D8:F8", 2],
    ]);
  });

  it("uses measured glyph widths to choose the nearest caret boundary", () => {
    const widths: Record<string, number> = {
      "=": 4,
      "=W": 16,
      "=Wi": 20,
      "=Wid": 28,
      "=Wide": 36,
    };
    expect(getWorksheetCaretIndexFromTextMetrics({
      value: "=Wide",
      contentX: 18,
      measureText: (value) => widths[value] ?? 0,
    })).toBe(2);
    expect(getWorksheetCaretIndexFromTextMetrics({
      value: "=Wide",
      contentX: 72,
      scale: 2,
      measureText: (value) => widths[value] ?? 0,
    })).toBe(5);
  });

  it("retains the token/reference colour contract after a picked reference transaction", () => {
    const insertion = applyWorksheetFormulaReferencePickTransaction({
      value: "=I7*",
      selection: { start: 4, end: 4 },
      reference: "J7",
    });
    const presentation = buildPricingWorksheetFormulaPresentation(insertion.value);
    const j7Reference = presentation.references.find((reference) => reference.normalizedRef === "J7");
    const j7Token = presentation.segments.find((segment) => segment.text === "J7");

    expect(j7Reference).toBeDefined();
    expect(j7Token?.colorIndex).toBe(j7Reference?.colorIndex);
    expect(presentation.segments.map((segment) => segment.text).join("")).toBe("=I7*J7");
  });
});
