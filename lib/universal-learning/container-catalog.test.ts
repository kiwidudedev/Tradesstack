import { describe, expect, it } from "vitest";
import { getUniversalLearningContainerDefinition } from "@/lib/universal-learning/container-catalog";
import {
  SUPPLIER_BILL_UCL_MONTHLY_ENRICHMENT_SNAPSHOT_TABLES,
  SUPPLIER_BILL_UCL_MONTHLY_SELECTION_TABLES,
  SUPPLIER_BILL_UCL_SOURCE_TABLES,
} from "@/lib/universal-learning/supplier-bill-dependencies";
import { UNIVERSAL_LEARNING_CONTAINER_TYPES } from "@/lib/universal-learning/types";
import { getUniversalLearningContainerRolloutConfig } from "@/lib/universal-learning/rollout-config";

describe("Universal learning Supplier Bill catalog metadata", () => {
  it("describes the exact v2 assembler dependency set without changing the registry key", () => {
    const definition = getUniversalLearningContainerDefinition("supplier_invoice");

    expect(definition.sourceTables).toEqual([...SUPPLIER_BILL_UCL_SOURCE_TABLES]);
    expect(definition.containerType).toBe("supplier_invoice");
    expect(definition.displayName).toBe("Supplier Bill");
    expect(UNIVERSAL_LEARNING_CONTAINER_TYPES).toContain("supplier_invoice");
    expect(UNIVERSAL_LEARNING_CONTAINER_TYPES).not.toContain("supplier_bill");
  });

  it("keeps catalog cadence and triggers descriptive rather than claiming live invalidation", () => {
    const definition = getUniversalLearningContainerDefinition("supplier_invoice");

    expect(definition.monthlyCadence).toBe("monthly");
    expect(definition.secondaryTriggers).toEqual(["exceptional_volume_threshold"]);
    expect(definition).not.toHaveProperty("eventDrivenRefresh");
    expect(definition).not.toHaveProperty("invalidation");
    expect(getUniversalLearningContainerRolloutConfig("supplier_invoice")).toEqual({
      containerType: "supplier_invoice",
      enabled: true,
      minimumRecordCount: 3,
      priority: 90,
      rolloutTier: "production",
    });
  });

  it("keeps monthly cursor sources separate from enrichment-only snapshots", () => {
    const monthlySelection = new Set<string>(SUPPLIER_BILL_UCL_MONTHLY_SELECTION_TABLES);
    const enrichmentSnapshots = new Set<string>(
      SUPPLIER_BILL_UCL_MONTHLY_ENRICHMENT_SNAPSHOT_TABLES,
    );

    expect(
      [...monthlySelection].filter((table) => enrichmentSnapshots.has(table)),
    ).toEqual([]);
    expect(
      [...monthlySelection, ...enrichmentSnapshots].sort(),
    ).toEqual([...SUPPLIER_BILL_UCL_SOURCE_TABLES].sort());
    expect(monthlySelection).toContain("supplier_invoices");
    expect(monthlySelection).toContain("supplier_invoice_lines");
    expect(enrichmentSnapshots).toContain("supplier_invoice_document_extractions");
    expect(enrichmentSnapshots).toContain("organization_accounting_documents");
  });

  it("documents the allocation builder enrichment graph separately", () => {
    const definition = getUniversalLearningContainerDefinition("supplier_invoice_allocation");

    expect(definition.sourceTables).toEqual(expect.arrayContaining([
      "supplier_invoice_line_allocations",
      "supplier_invoices",
      "supplier_invoice_purchase_order_matches",
      "project_actual_cost_events",
      "organization_suppliers",
    ]));
  });
});
