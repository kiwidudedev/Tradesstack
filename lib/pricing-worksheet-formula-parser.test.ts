import { describe, expect, it } from "vitest";
import { parsePricingWorksheetFormula } from "./pricing-worksheet-formula-parser";

function parse(formula: string) {
  return parsePricingWorksheetFormula(formula, {
    allowedFunctions: [
      "SUM",
      "MIN",
      "MAX",
      "ROUND",
      "ROUNDUP",
      "ROUNDDOWN",
      "IF",
      "IFERROR",
      "IFS",
      "AND",
      "OR",
      "CEILING",
      "QTY",
      "UNIT",
      "WASTE",
      "PACKS",
    ],
    maxRowCount: 50,
    maxColumnCount: 12,
  });
}

describe("parsePricingWorksheetFormula", () => {
  it.each([
    "=E3*E4",
    '=IFERROR(E3*E4,"")',
    "=ROUNDUP(E3/1.2,0)",
    "=SUM(E3:E10)",
    "=MAX(1,A1/20)",
    "=MIN(A1,B1)",
    "=AND(A1>0,B1>0)",
    '=AND(A1<>"",B1<>"")',
    '=IF(AND(A1<>"",B1<>""),A1*B1,"")',
    '=IFS(A1="USG",10,A1="Rondo",20)',
    '=IFS(A1=0,0,A1>=0,MAX(1,A1/20))',
    "=QTY(C8,E8,F8,G8)",
    "=UNIT(E8,F8,G8)",
    "=WASTE(E14,F14)",
    "=WASTE(E14,10%)",
    "=PACKS(G14,20)",
    "=A1*10%",
    "=A1^2",
    "=2^3",
    "=IF(E3>0,E4/E3,0)",
    "=CEILING(E3/1.2,1)",
  ])("accepts valid formula %s", (formula) => {
    const result = parse(formula);
    expect(result.success).toBe(true);
  });

  it.each([
    "=IFERROR(E3*E4,\"\")G7",
    "=ROUNDUP(E3/1.2,0)E4",
    "=SUM(E3:E10)J12",
    "=E3E4",
    "=E3+",
    "=*E3",
    "=SUM(E3:E10",
    "=UNKNOWN(E3)",
    "={CostSubtotal}*E4",
    '=row("Area").quantity',
    "=E3:E",
    "=E3::E10",
    "=MAX()",
    "=MIN()",
    "=AND()",
    "=IFS()",
    '=IFS(A1="USG",10,A1="Rondo")',
    "=QTY(C8,E8,F8)",
    "=UNIT(E8,F8)",
    "=WASTE(E14)",
    "=PACKS(G14,20,5)",
  ])("rejects invalid formula %s", (formula) => {
    const result = parse(formula);
    expect(result.success).toBe(false);
  });
});
