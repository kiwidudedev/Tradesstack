import { describe, expect, it } from "vitest";
import {
  buildAccountingResolutionInput,
  buildSupplierInvoiceLineAllocationPayload,
  deriveAllocationReviewStatus,
} from "@/lib/supplier-invoice-lineage";

describe("supplier invoice lineage", () => {
  it("builds accounting resolution input from the TradesStack routing code without requiring legacy taxonomy", () => {
    const input = buildAccountingResolutionInput({
      organizationId: "org-1",
      provider: "xero",
      costItemId: "cost-item-1",
      projectId: "project-1",
      title: "Cladding invoice line",
      description: "Cladding supply",
      lineage: {
        projectId: "project-1",
        purchaseOrderLineItemId: "po-line-1",
        purchaseOrderId: "po-1",
        costItemId: "cost-item-1",
        sourceCostItemId: null,
        tradesstackCostCode: "100",
        tradesstackCostCodeLabel: "Materials",
        workType: null,
        costType: null,
        internalCostCode: null,
        classificationNeedsReview: false,
        classificationConfidence: 0.93,
        classificationSource: "material_library",
      },
    });

    expect(input?.tradesstackCostCode).toBe("100");
    expect(input?.reviewStatus).toBe("resolved");
  });

  it("builds allocation payloads with TradesStack routing fields and separate mapping status", () => {
    const payload = buildSupplierInvoiceLineAllocationPayload({
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
      supplierInvoiceLineId: "line-1",
      allocatedAmount: 500,
      lineage: {
        projectId: "project-1",
        purchaseOrderLineItemId: "po-line-1",
        purchaseOrderId: "po-1",
        costItemId: "cost-item-1",
        sourceCostItemId: null,
        tradesstackCostCode: "100",
        tradesstackCostCodeLabel: "Materials",
        workType: null,
        costType: null,
        internalCostCode: null,
        classificationNeedsReview: false,
        classificationConfidence: 0.91,
        classificationSource: "supplier_invoice",
      },
      accountingResolution: {
        status: "resolved",
        organizationCostCodeId: "code-1",
        accountingMappingId: "mapping-1",
        code: "4200",
        name: "Materials",
        externalCode: "4200",
        externalProvider: "xero",
        tradesstackCostCode: "100",
        provider: "xero",
        projectId: null,
        reason: "mapped_tradesstack_cost_code",
      },
    });

    expect(payload.tradesstack_cost_code).toBe("100");
    expect(payload.accounting_mapping_id).toBe("mapping-1");
    expect(
      deriveAllocationReviewStatus({
        lineage: {
          projectId: "project-1",
          purchaseOrderLineItemId: "po-line-1",
          purchaseOrderId: "po-1",
          costItemId: "cost-item-1",
          sourceCostItemId: null,
          tradesstackCostCode: "100",
          tradesstackCostCodeLabel: "Materials",
          workType: null,
          costType: null,
          internalCostCode: null,
          classificationNeedsReview: false,
          classificationConfidence: 0.91,
          classificationSource: "supplier_invoice",
        },
        accountingResolution: {
          status: "resolved",
          organizationCostCodeId: "code-1",
          accountingMappingId: "mapping-1",
          code: "4200",
          name: "Materials",
          externalCode: "4200",
          externalProvider: "xero",
          tradesstackCostCode: "100",
          provider: "xero",
          projectId: null,
          reason: "mapped_tradesstack_cost_code",
        },
      })
    ).toBe("auto_approved");
  });

  it("derives fallback routing from purchase order context when legacy taxonomy is absent", async () => {
    const { resolvePurchaseOrderLineLineage } = await import("@/lib/supplier-invoice-lineage");
    const lineage = resolvePurchaseOrderLineLineage({
      purchaseOrderLine: {
        id: "po-line-1",
        project_id: "project-1",
        purchase_order_id: "po-1",
        cost_item_id: null,
        source_cost_item_id: null,
        source_time_sheet_entry_id: null,
        organization_id: "org-1",
        section: "Materials",
        description: "13mm GIB Standard plasterboard sheets",
        quantity: 10,
        unit: "sheet",
        rate: 18.5,
        total: 185,
        line_uid: "line-uid-1",
        created_at: "2026-06-21T00:00:00.000Z",
        updated_at: "2026-06-21T00:00:00.000Z",
      },
      costItem: null,
      sourceCostItem: null,
    });

    expect(lineage).toMatchObject({
      tradesstackCostCode: "100",
      tradesstackCostCodeLabel: "Materials",
      classificationNeedsReview: false,
    });
  });
});
