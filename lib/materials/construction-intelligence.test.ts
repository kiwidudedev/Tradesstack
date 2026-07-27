import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cost-construction-intelligence", () => ({
  EMPTY_COST_CONSTRUCTION_INTELLIGENCE: {},
  buildCostConstructionIntelligenceIdempotencyKey: vi.fn(
    ({
      sourceType,
      sourceId,
      revisionToken,
    }: {
      sourceType: string;
      sourceId: string;
      revisionToken?: string | null;
    }) =>
      [sourceType, sourceId, revisionToken ?? "current"].join(":"),
  ),
  tryEnqueueCostConstructionIntelligenceEvent: vi.fn().mockResolvedValue(null),
}));

import { buildMaterialConstructionIntelligenceInput } from "@/lib/materials/service";
import { buildMaterialClassificationPatch } from "@/lib/materials/service";

describe("material construction intelligence inputs", () => {
  it("includes preferred supplier, current price, and import-batch context", () => {
    const input = buildMaterialConstructionIntelligenceInput({
      material: {
        id: "material-1",
        organization_id: "org-1",
        tradesstack_cost_code: "100",
        tradesstack_cost_code_label: "Materials",
        accounting_mapping_id: "mapping-1",
        name: "13mm GIB Standard",
        description: "13mm GIB Standard plasterboard sheets",
        default_unit: "sheet",
        category: "Wall Linings",
        metadata: { family: "plasterboard" },
        work_type: "Wall Linings",
        classification_source: "rules",
        updated_at: "2026-06-21T12:00:00.000Z",
        created_at: "2026-06-21T11:00:00.000Z",
      } as never,
      context: {
        supplierName: "Placemakers",
        supplierId: "supplier-1",
        currentPriceUnit: "sheet",
        currentPriceRate: 18.5,
        currentPriceCurrency: "NZD",
        currentPriceSource: "import",
        currentPriceSupplierDescription: "13mm GIB Standard",
        currentPriceSupplierSku: "GIB-13",
        importBatchId: "batch-1",
        importBatchFileName: "placemakers.csv",
        importBatchFileType: "text/csv",
        importBatchExtractionMethod: "csv",
      },
    });

    expect(input).toMatchObject({
      organizationId: "org-1",
      sourceType: "organization_material",
      sourceId: "material-1",
      tradesstackCostCode: "100",
      accountingMappingId: "mapping-1",
      supplierId: "supplier-1",
      supplierName: "Placemakers",
      description: "13mm GIB Standard plasterboard sheets",
      unit: "sheet",
      rate: 18.5,
      documentContext: {
        module: "materials",
        entityName: "13mm GIB Standard",
        category: "Wall Linings",
        tradeLabel: "Wall Linings",
        classificationSource: "rules",
        currentPriceCurrency: "NZD",
        currentPriceSource: "import",
        importBatchId: "batch-1",
        importBatchFileName: "placemakers.csv",
        importBatchExtractionMethod: "csv",
      },
      eventPayload: {
        preferredSupplierName: "Placemakers",
        currentPriceRate: 18.5,
        currentPriceSupplierSku: "GIB-13",
        importBatchFileType: "text/csv",
        metadata: { family: "plasterboard" },
      },
    });
  });

  it("defaults source-row construction metadata to a non-null empty object", () => {
    const patch = buildMaterialClassificationPatch({
      classification: {
        workType: "Wall Linings",
        divisionName: "Wall Linings",
        costType: "MAT",
        costCode: "MAT-001",
        codePrefix: "MAT",
        confidence: 0.92,
        matchedKeywords: ["gib", "plasterboard"],
        normalizedDescription: "13mm gib standard plasterboard sheets",
        needsReview: false,
        reasoningSummary: "Material library route",
        classificationSource: "rules",
        financialRouting: {
          tradesstackCostCode: "100",
          tradesstackCostCodeLabel: "Materials",
          confidence: 0.98,
          source: "material_library",
          reviewStatus: "auto_approved",
        },
        originalClassification: null,
        finalClassification: null,
      } as never,
      organizationCostCodeId: null,
    });

    expect(patch.ai_construction_intelligence).toEqual({});
  });
});
