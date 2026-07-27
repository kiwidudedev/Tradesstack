import { describe, expect, it, vi } from "vitest";
import {
  buildProjectCostReportGroupingKey,
  formatProjectCostReportClassificationLabel,
} from "@/lib/project-cost-report";

vi.mock("server-only", () => ({}));

describe("project cost report grouping", () => {
  it("groups by TradesStack routing code before legacy taxonomy fields", () => {
    const key = buildProjectCostReportGroupingKey({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      accountingMappingId: "mapping-1",
      mappedAccountingCode: "4200",
      mappedAccountingCodeLabel: "Materials",
      internalCostCode: null,
      workType: null,
      costType: null,
    });

    expect(key).toBe("routing:100 Materials|mapping:mapping-1|account:4200 Materials");
  });

  it("formats report labels from the TradesStack routing code first", () => {
    const label = formatProjectCostReportClassificationLabel({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      mappedAccountingCode: "4200",
      mappedAccountingCodeLabel: "Materials",
      internalCostCode: "legacy-ignored",
      workType: "Wall framing",
      costType: "MAT",
      isUnmatchedActual: false,
    });

    expect(label).toBe("100 Materials / 4200 Materials");
  });

  it("falls back to legacy taxonomy only when routing fields are missing", () => {
    const key = buildProjectCostReportGroupingKey({
      tradesstackCostCode: null,
      tradesstackCostCodeLabel: null,
      accountingMappingId: null,
      mappedAccountingCode: null,
      mappedAccountingCodeLabel: null,
      internalCostCode: "INT-001",
      workType: "Wall framing",
      costType: "LAB",
    });

    expect(key).toBe("legacy:INT-001|Wall framing|LAB");
  });
});
