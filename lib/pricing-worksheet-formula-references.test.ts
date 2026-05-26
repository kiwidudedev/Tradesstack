import { describe, expect, it } from "vitest";

import {
  extractPricingWorksheetFormulaReferences,
  type PricingWorksheetFormulaReference,
} from "./pricing-worksheet-formula-references";

function getMatchedTexts(formula: string, references: PricingWorksheetFormulaReference[]) {
  return references.map((reference) => formula.slice(reference.start, reference.end));
}

describe("extractPricingWorksheetFormulaReferences", () => {
  it("extracts ordered cell references with spans", () => {
    const formula = "=ROUND(E8*F9*(1+E6/100)*F14,2)";
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references).toMatchObject([
      {
        kind: "cell",
        ref: "E8",
        normalizedRef: "E8",
        rowIndex: 7,
        columnIndex: 4,
      },
      {
        kind: "cell",
        ref: "F9",
        normalizedRef: "F9",
        rowIndex: 8,
        columnIndex: 5,
      },
      {
        kind: "cell",
        ref: "E6",
        normalizedRef: "E6",
        rowIndex: 5,
        columnIndex: 4,
      },
      {
        kind: "cell",
        ref: "F14",
        normalizedRef: "F14",
        rowIndex: 13,
        columnIndex: 5,
      },
    ]);
    expect(getMatchedTexts(formula, references)).toEqual(["E8", "F9", "E6", "F14"]);
  });

  it("returns repeated references as repeated occurrences", () => {
    const formula = "=A1+A1+A1";
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references).toHaveLength(3);
    expect(references.map((reference) => reference.normalizedRef)).toEqual(["A1", "A1", "A1"]);
    expect(getMatchedTexts(formula, references)).toEqual(["A1", "A1", "A1"]);
  });

  it("normalizes absolute references correctly", () => {
    const formula = "=$A$1+A$2+$B3";
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references).toMatchObject([
      { kind: "cell", ref: "$A$1", normalizedRef: "A1", rowIndex: 0, columnIndex: 0 },
      { kind: "cell", ref: "A$2", normalizedRef: "A2", rowIndex: 1, columnIndex: 0 },
      { kind: "cell", ref: "$B3", normalizedRef: "B3", rowIndex: 2, columnIndex: 1 },
    ]);
    expect(getMatchedTexts(formula, references)).toEqual(["$A$1", "A$2", "$B3"]);
  });

  it("extracts range references with ordered bounds", () => {
    const formula = "=SUM($A$1:$B$10)";
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references).toEqual([
      {
        kind: "range",
        ref: "$A$1:$B$10",
        normalizedRef: "A1:B10",
        startRef: "A1",
        endRef: "B10",
        startRowIndex: 0,
        startColumnIndex: 0,
        endRowIndex: 9,
        endColumnIndex: 1,
        start: 5,
        end: 15,
      },
    ]);
  });

  it("normalizes reversed range bounds correctly", () => {
    const formula = "=SUM(B10:A1)";
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references).toEqual([
      {
        kind: "range",
        ref: "B10:A1",
        normalizedRef: "A1:B10",
        startRef: "A1",
        endRef: "B10",
        startRowIndex: 0,
        startColumnIndex: 0,
        endRowIndex: 9,
        endColumnIndex: 1,
        start: 5,
        end: 11,
      },
    ]);
  });

  it("extracts refs from nested formulas", () => {
    const formula = "=IF(AND(A1>0,B1>0),SUM(C1:C3),0)";
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references.map((reference) => reference.normalizedRef)).toEqual([
      "A1",
      "B1",
      "C1:C3",
    ]);
    expect(references.map((reference) => reference.kind)).toEqual(["cell", "cell", "range"]);
  });

  it("extracts refs from helper formulas", () => {
    const formula = "=QTY(C8,E8,F8,G8)";
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references.map((reference) => reference.normalizedRef)).toEqual(["C8", "E8", "F8", "G8"]);
  });

  it("extracts refs from SUMIF and COUNTIFS style formulas", () => {
    const sumIfFormula = '=SUMIF(B2:B5,"Timber",C2:C5)';
    const countIfsFormula = '=COUNTIFS(B2:B5,"Timber",D2:D5,">0")';

    expect(
      extractPricingWorksheetFormulaReferences(sumIfFormula).map((reference) => reference.normalizedRef)
    ).toEqual(["B2:B5", "C2:C5"]);
    expect(
      extractPricingWorksheetFormulaReferences(countIfsFormula).map((reference) => reference.normalizedRef)
    ).toEqual(["B2:B5", "D2:D5"]);
  });

  it("skips references inside quoted strings", () => {
    const formula = '=IF(A1="B2", "A1", CONCAT("C3:D4", B5))';
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references.map((reference) => reference.normalizedRef)).toEqual(["A1", "B5"]);
    expect(getMatchedTexts(formula, references)).toEqual(["A1", "B5"]);
  });

  it("returns an empty array when the input does not start with equals", () => {
    expect(extractPricingWorksheetFormulaReferences("A1+B2")).toEqual([]);
    expect(extractPricingWorksheetFormulaReferences(" ROUND(A1, 2)")).toEqual([]);
  });

  it("ignores unsupported function names and still extracts valid refs", () => {
    const formula = "=UNSUPPORTED_FN(E8,F9,SUMIF(A1:A3,\"A1\",B1:B3))";
    const references = extractPricingWorksheetFormulaReferences(formula);

    expect(references.map((reference) => reference.normalizedRef)).toEqual([
      "E8",
      "F9",
      "A1:A3",
      "B1:B3",
    ]);
  });
});
