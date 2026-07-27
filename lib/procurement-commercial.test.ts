import { describe, expect, it } from "vitest";
import {
  buildLineCommercialVariances,
  calculateSupplierInvoiceLineTax,
  calculatePurchaseOrderLineInvoicingProgress,
  derivePurchaseOrderInvoicingState,
  isCommercialSnapshotHistoricalForInvoice,
  normalizeCommercialLineDescription,
  normalizeSupplierInvoiceNumber,
  sortPurchaseOrderProgressLines,
  summarizeProjectProcurementCommitments,
} from "@/lib/procurement-commercial";

describe("procurement commercial calculations", () => {
  it("derives line tax from the resolved Xero effective rate", () => {
    expect(
      calculateSupplierInvoiceLineTax({
        lineAmount: 8268.48,
        taxResolutionStatus: "resolved",
        effectiveRate: 15,
      })
    ).toBe(1240.27);
  });

  it("keeps no-tax lines at zero and refuses unresolved tax", () => {
    expect(
      calculateSupplierInvoiceLineTax({
        lineAmount: 500,
        taxResolutionStatus: "not_applicable",
        effectiveRate: null,
      })
    ).toBe(0);
    expect(
      calculateSupplierInvoiceLineTax({
        lineAmount: 500,
        taxResolutionStatus: "unresolved",
        effectiveRate: 15,
      })
    ).toBeNull();
  });

  it("supports mixed Xero tax treatments without assigning tax to exempt lines", () => {
    const taxable = calculateSupplierInvoiceLineTax({
      lineAmount: 100,
      taxResolutionStatus: "resolved",
      effectiveRate: 15,
    });
    const exempt = calculateSupplierInvoiceLineTax({
      lineAmount: 50,
      taxResolutionStatus: "not_applicable",
      effectiveRate: null,
    });

    expect((taxable ?? 0) + (exempt ?? 0)).toBe(15);
  });

  it("calculates the first partial invoice", () => {
    const progress = calculatePurchaseOrderLineInvoicingProgress({
      id: "line-1",
      purchaseOrderId: "po-1",
      description: "Timber",
      orderedQuantity: 100,
      orderedRate: 10,
      orderedValue: 1000,
      previouslyApprovedQuantity: 0,
      previouslyApprovedValue: 0,
      currentQuantity: 25,
      currentValue: 250,
      currentUnitRate: 10,
    });

    expect(progress.remainingQuantityBeforeCurrent).toBe(100);
    expect(progress.projectedRemainingQuantity).toBe(75);
    expect(progress.projectedRemainingValue).toBe(750);
    expect(progress.overInvoicedQuantity).toBe(0);
    expect(progress.releasedCommitmentValue).toBe(0);
    expect(progress.reportingRemainingValue).toBe(750);
  });

  it("includes previous approved invoices in the second partial invoice", () => {
    const progress = calculatePurchaseOrderLineInvoicingProgress({
      id: "line-1",
      purchaseOrderId: "po-1",
      description: "Timber",
      orderedQuantity: 100,
      orderedRate: 10,
      orderedValue: 1000,
      previouslyApprovedQuantity: 25,
      previouslyApprovedValue: 250,
      currentQuantity: 50,
      currentValue: 500,
      currentUnitRate: 10,
    });

    expect(progress.remainingQuantityBeforeCurrent).toBe(75);
    expect(progress.projectedRemainingQuantity).toBe(25);
    expect(progress.projectedRemainingValue).toBe(250);
  });

  it("does not treat valid progressive invoicing as a commercial variance", () => {
    const progress = calculatePurchaseOrderLineInvoicingProgress({
      id: "line-1",
      purchaseOrderId: "po-1",
      description: "Timber",
      orderedQuantity: 300,
      orderedRate: 30,
      orderedValue: 9000,
      previouslyApprovedQuantity: 0,
      previouslyApprovedValue: 0,
      currentQuantity: 150,
      currentValue: 4500,
      currentUnitRate: 30,
    });

    expect(buildLineCommercialVariances(progress)).toEqual([]);
    expect(progress.projectedRemainingQuantity).toBe(150);
    expect(progress.projectedRemainingValue).toBe(4500);
  });

  it("treats a trailing remaining-balance label as the same PO line description", () => {
    expect(normalizeCommercialLineDescription("92mm Steel Track 3000mm (Remaining Balance)"))
      .toBe(normalizeCommercialLineDescription("92mm steel track 3000mm"));
    expect(normalizeCommercialLineDescription("Different steel track"))
      .not.toBe(normalizeCommercialLineDescription("92mm steel track 3000mm"));
  });

  it("recognizes a final invoice", () => {
    const progress = calculatePurchaseOrderLineInvoicingProgress({
      id: "line-1",
      purchaseOrderId: "po-1",
      description: "Timber",
      orderedQuantity: 100,
      orderedRate: 10,
      orderedValue: 1000,
      previouslyApprovedQuantity: 75,
      previouslyApprovedValue: 750,
      currentQuantity: 25,
      currentValue: 250,
      currentUnitRate: 10,
    });

    expect(progress.projectedRemainingQuantity).toBe(0);
    expect(progress.projectedRemainingValue).toBe(0);
    expect(
      derivePurchaseOrderInvoicingState({
        currentPurchaseOrderValue: 1000,
        commerciallyApprovedInvoiceValue: 1000,
      })
    ).toBe("fully_invoiced");
  });

  it("does not clamp over-invoiced quantity or value", () => {
    const progress = calculatePurchaseOrderLineInvoicingProgress({
      id: "line-1",
      purchaseOrderId: "po-1",
      description: "Timber",
      orderedQuantity: 100,
      orderedRate: 10,
      orderedValue: 1000,
      previouslyApprovedQuantity: 90,
      previouslyApprovedValue: 900,
      currentQuantity: 20,
      currentValue: 240,
      currentUnitRate: 12,
    });

    expect(progress.projectedRemainingQuantity).toBe(-10);
    expect(progress.projectedRemainingValue).toBe(-140);
    expect(progress.overInvoicedQuantity).toBe(10);
    expect(progress.overInvoicedValue).toBe(140);
  });

  it("emits blocking over-invoice and warning rate variances", () => {
    const progress = calculatePurchaseOrderLineInvoicingProgress({
      id: "line-1",
      purchaseOrderId: "po-1",
      description: "Timber",
      orderedQuantity: 10,
      orderedRate: 10,
      orderedValue: 100,
      previouslyApprovedQuantity: 8,
      previouslyApprovedValue: 80,
      currentQuantity: 4,
      currentValue: 48,
      currentUnitRate: 12,
    });
    const variances = buildLineCommercialVariances(progress);

    expect(variances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "rate_variance",
          severity: "warning",
        }),
        expect.objectContaining({
          type: "over_invoiced_quantity",
          severity: "blocking",
        }),
        expect.objectContaining({
          type: "over_invoiced_value",
          severity: "blocking",
        }),
      ])
    );
  });

  it("classifies PO invoicing states using the explicit tolerance", () => {
    expect(
      derivePurchaseOrderInvoicingState({
        currentPurchaseOrderValue: 1000,
        commerciallyApprovedInvoiceValue: 0,
      })
    ).toBe("not_invoiced");
    expect(
      derivePurchaseOrderInvoicingState({
        currentPurchaseOrderValue: 1000,
        commerciallyApprovedInvoiceValue: 500,
      })
    ).toBe("partially_invoiced");
    expect(
      derivePurchaseOrderInvoicingState({
        currentPurchaseOrderValue: 1000,
        commerciallyApprovedInvoiceValue: 1000.005,
      })
    ).toBe("fully_invoiced");
    expect(
      derivePurchaseOrderInvoicingState({
        currentPurchaseOrderValue: 1000,
        commerciallyApprovedInvoiceValue: 1000.02,
      })
    ).toBe("over_invoiced");
  });

  it("normalizes invoice-number case and whitespace without removing punctuation", () => {
    expect(normalizeSupplierInvoiceNumber(" inv - 001 / a ")).toBe(
      "INV-001/A"
    );
  });

  it("renders commercial comparison lines in purchase-order sort order", () => {
    const baseLine = {
      purchaseOrderId: "po-1",
      description: "Test",
      orderedQuantity: 1,
      orderedRate: 1,
      orderedValue: 1,
      previouslyApprovedQuantity: 0,
      previouslyApprovedValue: 0,
      currentQuantity: 0,
      currentValue: 0,
      currentUnitRate: null,
      remainingQuantityBeforeCurrent: 1,
      remainingValueBeforeCurrent: 1,
      projectedRemainingQuantity: 1,
      projectedRemainingValue: 1,
      overInvoicedQuantity: 0,
      overInvoicedValue: 0,
      releasedCommitmentValue: 0,
      reportingRemainingValue: 1,
    };

    expect(
      sortPurchaseOrderProgressLines(
        [
          { ...baseLine, id: "line-2" },
          { ...baseLine, id: "line-1" },
        ],
        new Map([
          ["line-1", 0],
          ["line-2", 1],
        ])
      ).map((line) => line.id)
    ).toEqual(["line-1", "line-2"]);
  });

  it("does not treat later approvals as previous history when reopening an approved invoice", () => {
    expect(
      isCommercialSnapshotHistoricalForInvoice({
        snapshotInvoiceId: "later-invoice",
        currentInvoiceId: "first-invoice",
        snapshotApprovedAt: "2026-07-16T12:00:00.000Z",
        currentApprovalApprovedAt: "2026-07-16T10:00:00.000Z",
      })
    ).toBe(false);
    expect(
      isCommercialSnapshotHistoricalForInvoice({
        snapshotInvoiceId: "earlier-invoice",
        currentInvoiceId: "second-invoice",
        snapshotApprovedAt: "2026-07-16T10:00:00.000Z",
        currentApprovalApprovedAt: "2026-07-16T12:00:00.000Z",
      })
    ).toBe(true);
  });

  it("aggregates project commitment, approved invoice, release, and actual values", () => {
    expect(
      summarizeProjectProcurementCommitments([
        {
          currentPurchaseOrderValue: 1000,
          approvedInvoicedValue: 600,
          releasedCommitmentValue: 100,
          postedActualCost: 400,
        },
        {
          currentPurchaseOrderValue: 500,
          approvedInvoicedValue: 500,
          releasedCommitmentValue: 0,
          postedActualCost: 500,
        },
      ])
    ).toEqual({
      currentPurchaseOrderValue: 1500,
      approvedInvoicedValue: 1100,
      releasedCommitmentValue: 100,
      remainingCommitment: 300,
      postedActualCost: 900,
      unpostedApprovedInvoiceValue: 200,
    });
  });
});
