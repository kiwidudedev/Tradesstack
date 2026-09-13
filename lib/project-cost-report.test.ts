import { describe, expect, it, vi } from "vitest";
import {
  buildProjectCostReportGroupingKey,
  formatProjectCostReportClassificationLabel,
} from "@/lib/project-cost-report";

vi.mock("server-only", () => ({}));

describe("project cost report grouping", () => {
  it("groups by TradesStack routing code and accounting mapping", () => {
    const key = buildProjectCostReportGroupingKey({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      accountingMappingId: "mapping-1",
      mappedAccountingCode: "4200",
      mappedAccountingCodeLabel: "Materials",
    });

    expect(key).toBe("routing:100 Materials|mapping:mapping-1|account:4200 Materials");
  });

  it("formats report labels from the TradesStack routing code first", () => {
    const label = formatProjectCostReportClassificationLabel({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      mappedAccountingCode: "4200",
      mappedAccountingCodeLabel: "Materials",
      isUnmatchedActual: false,
    });

    expect(label).toBe("100 Materials / 4200 Materials");
  });

  it("groups missing routing as unclassified", () => {
    const key = buildProjectCostReportGroupingKey({
      tradesstackCostCode: null,
      tradesstackCostCodeLabel: null,
      accountingMappingId: null,
      mappedAccountingCode: null,
      mappedAccountingCodeLabel: null,
    });

    expect(key).toBe("routing:unclassified");
  });
});
