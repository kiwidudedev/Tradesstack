import { describe, expect, it } from "vitest";
import { routeFinancialLineItem } from "@/lib/tradesstack-financial-routing";

describe("tradesstack financial routing", () => {
  it("routes explicit section labels deterministically", () => {
    expect(
      routeFinancialLineItem({
        sourceDocumentKind: "project_purchase_order",
        section: "Materials",
        description: "13mm GIB Standard plasterboard sheets",
      })
    ).toMatchObject({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      reviewStatus: "auto_approved",
    });

    expect(
      routeFinancialLineItem({
        sourceDocumentKind: "project_purchase_order",
        section: "Labour",
        description: "Install GIB plasterboard",
      })
    ).toMatchObject({
      tradesstackCostCode: "200",
      tradesstackCostCodeLabel: "Labour",
      reviewStatus: "auto_approved",
    });
  });

  it("locks claim snapshots to payment claims", () => {
    expect(
      routeFinancialLineItem({
        sourceDocumentKind: "project_claim",
        section: "Wall linings",
        description: "June progress claim",
      })
    ).toMatchObject({
      tradesstackCostCode: "600",
      tradesstackCostCodeLabel: "Payment Claims",
    });
  });

  it("falls back to broad description routing for obvious material items", () => {
    expect(
      routeFinancialLineItem({
        sourceDocumentKind: "opportunity_quote",
        section: "Item",
        description: "Rondo 64mm steel studs",
      })
    ).toMatchObject({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
    });
  });

  it("marks ambiguous generic lines for routing review instead of returning null routing", () => {
    expect(
      routeFinancialLineItem({
        sourceDocumentKind: "project_quote",
        section: "Item",
        description: "Allowance",
      })
    ).toMatchObject({
      tradesstackCostCode: "800",
      tradesstackCostCodeLabel: "Others",
      reviewStatus: "needs_routing_review",
    });
  });
});
