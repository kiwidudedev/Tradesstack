import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectFinancialsReport } from "./ProjectFinancialsReport";
import { formatProjectCostReportClassificationLabel, type ProjectCostReportData, type ProjectCostReportRow } from "@/lib/project-cost-report";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/fonts", () => ({ interMedium: { className: "font" } }));

function row(overrides: Partial<ProjectCostReportRow> = {}): ProjectCostReportRow {
  const routing = {
    tradesstackCostCode: "100",
    tradesstackCostCodeLabel: "Materials",
    mappedAccountingCode: "4200",
    mappedAccountingCodeLabel: "Material purchases",
    isUnmatchedActual: false,
    ...overrides,
  };
  return {
    key: "routing:100",
    accountingMappingId: "mapping-1",
    estimated: 200, committed: 125, actual: 75, varianceAmount: 125, variancePercent: 62.5,
    isBudgetAdjustment: false,
    drilldown: { estimatedSubtotal: 200, committedSubtotal: 125, actualSubtotal: 75, estimatedLines: [], committedLines: [], actualEvents: [] },
    ...routing,
    classificationLabel: formatProjectCostReportClassificationLabel(routing),
  };
}

function report(rows: ProjectCostReportRow[]): ProjectCostReportData {
  return {
    organizationId: "org-1", projectId: "project-1", projectSlug: "project-slug", projectName: "Test project",
    taxBasisLabel: "Excl. GST",
    baselineQuote: { id: "quote-1", quoteNumber: "Q-001", status: "Accepted" },
    summary: { originalBudget: 200, approvedVariations: 25, currentBudget: 225, estimated: 200, committed: 125, actual: 75, varianceAmount: 125, variancePercent: 62.5 },
    rows,
    states: { hasBaselineQuote: true, hasCommittedCosts: true, hasPostedActuals: true, hasReportRows: true },
  };
}

describe("financial report canonical producer/consumer contract", () => {
  it("displays the producer's routing, accounting label and financial totals without retired fields", () => {
    const data = report([row()]);
    const markup = renderToStaticMarkup(<ProjectFinancialsReport report={data} />);
    expect(markup).toContain("100 Materials");
    expect(markup).toContain("4200 Material purchases");
    expect(markup).toContain("Q-001");
    expect(markup).toContain("Accepted");
    expect(markup).toContain("225.00");
    expect(markup).toContain("125.00");
    expect(markup).toContain("75.00");
    expect(data.summary.currentBudget).toBe(225);
  });

  it("uses the producer's Unclassified fallback instead of resurrecting legacy classification metadata", () => {
    // Old cached/additional object properties must not override canonical routing.
    const oldProperties = { workType: "Legacy carpentry", internalCostCode: "LEGACY-CODE", costType: "Legacy cost type" };
    const data = report([{
      ...row({ tradesstackCostCode: null, tradesstackCostCodeLabel: null, mappedAccountingCode: null, mappedAccountingCodeLabel: null }),
      ...oldProperties,
    }]);
    const markup = renderToStaticMarkup(<ProjectFinancialsReport report={data} />);
    expect(markup).toContain("Unclassified");
    for (const value of Object.values(oldProperties)) expect(markup).not.toContain(value);
  });

  it("retains special unmatched and commercial-adjustment labels", () => {
    const markup = renderToStaticMarkup(<ProjectFinancialsReport report={report([
      row({ key: "unmatched", isUnmatchedActual: true }),
      row({ key: "adjustment", isBudgetAdjustment: true }),
    ])} />);
    expect(markup).toContain("Unmatched actuals");
    expect(markup).toContain("Commercial adjustments");
  });
});
