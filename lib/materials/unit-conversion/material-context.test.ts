import { describe, expect, it } from "vitest";
import { assertCurrentMaterialUnitConversionContext } from "@/lib/materials/unit-conversion/approval-validation";
import { createMaterialUnitConversionContextHash } from "@/lib/materials/unit-conversion/context-hash";
import { addSelectedMaterialEvidence } from "@/lib/materials/unit-conversion/evidence";
import { materialUnitConversionContextFromImportRow } from "@/lib/materials/unit-conversion/import-row-context";
import { validateMaterialUnitConversionProposal } from "@/lib/materials/unit-conversion/validate";
import type { OrganizationMaterialRow } from "@/lib/materials/types";

const sourceRow = {
  extracted_name: "GIB 13mm Fyreline (2.4m)",
  extracted_description: "GIB 13mm Fyreline (2.4m)",
  extracted_unit: "each",
  extracted_unit_cost: 46,
  extracted_currency: "NZD",
  reviewed_name: null,
  reviewed_supplier_description: null,
  reviewed_supplier_sku: null,
  supplier_description: "GIB 13mm Fyreline (2.4m)",
  supplier_sku: "I01903",
  source_payload: {
    priceOptions: [{
      priceKey: "source-1:price-ex-gst",
      label: { value: "Price ex GST" },
      amount: { value: 46 },
      currency: { value: "NZD" },
    }],
  },
};

function material(
  description: string,
  updatedAt = "2026-08-15T00:38:29.757769+00:00",
): OrganizationMaterialRow {
  return {
    id: "5ed0006a-9a10-4001-ad32-af3e4f7bf937",
    name: "GIB Fyreline® 13mm",
    description,
    default_unit: "m2",
    category: "Plasterboard",
    organization_id: "org-1",
    is_active: true,
    archived_at: null,
    updated_at: updatedAt,
    metadata: null,
    ai_construction_intelligence: null,
  } as OrganizationMaterialRow;
}

function context(description = "Fire-rated plasterboard sheet, 13mm thick, 2400mm x 1200mm") {
  return addSelectedMaterialEvidence(
    materialUnitConversionContextFromImportRow(sourceRow, "m2", null, "source-1:price-ex-gst"),
    material(description),
  );
}

function provider(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: "material_unit_conversion_v2",
    status: "convertible",
    supplierUnit: "each",
    requestedMaterialUnit: "m2",
    supplierQuantity: 1,
    materialQuantity: 2.88,
    convertedUnitCost: 15.9722222222,
    currency: "NZD",
    basis: "selected_material_context",
    evidenceRefs: ["selected_material.description"],
    evidenceSummary: "Selected Material dimensions are 2400 × 1200mm.",
    explanation: "The explicit dimensions give an area of 2.88 m² per sheet.",
    missingInformation: [],
    confidence: 0.99,
    ...overrides,
  };
}

describe("selected Material conversion evidence", () => {
  it("accepts the exact GIB area fixture and derives cost from source truth", () => {
    const proposal = validateMaterialUnitConversionProposal({ value: provider(), context: context() });
    expect(proposal).toMatchObject({
      status: "convertible",
      supplierQuantity: 1,
      materialQuantity: 2.88,
      basis: "selected_material_context",
      evidenceRefs: ["selected_material.description"],
    });
    expect(proposal.convertedUnitCost).toBeCloseTo(15.972222222222221, 12);
  });

  it("accepts needs_information when width or area is absent without inventing 1200mm", () => {
    const missing = validateMaterialUnitConversionProposal({
      context: context("Fire-rated plasterboard, 13mm thick"),
      value: provider({
        status: "needs_information",
        supplierQuantity: null,
        materialQuantity: null,
        convertedUnitCost: null,
        basis: null,
        evidenceRefs: [],
        evidenceSummary: null,
        explanation: null,
        missingInformation: ["Sheet width or area per sheet"],
        confidence: null,
      }),
    });
    expect(missing.status).toBe("needs_information");
    expect(missing.missingInformation).toContain("Sheet width or area per sheet");
  });

  it("rejects a 2.88 m2 assumption when cited evidence has no width or area", () => {
    expect(() => validateMaterialUnitConversionProposal({
      value: provider(),
      context: context("Fire-rated plasterboard, 13mm thick"),
    })).toThrow(/not supported by the cited evidence/);
  });

  it("rejects unknown or client-invented evidence references", () => {
    expect(() => validateMaterialUnitConversionProposal({
      value: provider({ evidenceRefs: ["client.fake_dimensions"] }),
      context: context(),
    })).toThrow(/was not supplied/);
  });

  it("derives basis from verified evidence refs instead of trusting a provider label", () => {
    const proposal = validateMaterialUnitConversionProposal({
      value: provider({ basis: "supplier_source" }),
      context: context(),
    });
    expect(proposal.basis).toBe("selected_material_context");
  });
});

describe("approval context staleness", () => {
  it("accepts the unchanged hash and rejects Material updated_at or price changes", () => {
    const selectedMaterial = material("Fire-rated plasterboard sheet, 13mm thick, 2400mm x 1200mm");
    const conversionContext = context();
    const contextHash = createMaterialUnitConversionContextHash({
      organizationId: "org-1",
      batchId: "batch-1",
      rowId: "row-1",
      context: conversionContext,
      selectedMaterial,
    });
    const confirmed = {
      supplierQuantity: 1,
      supplierUnit: "each",
      materialQuantity: 2.88,
      materialUnit: "m2",
      convertedUnitCost: 46 / 2.88,
      currency: "NZD",
      contractVersion: "material_unit_conversion_v2" as const,
      source: "user_confirmed_ai" as const,
      explanation: "Explicit area.",
      confidence: 0.99,
      selectedMaterialId: selectedMaterial.id,
      selectedMaterialUpdatedAt: selectedMaterial.updated_at,
      contextHash,
      basis: "selected_material_context" as const,
      evidenceRefs: ["selected_material.description"],
      evidenceSummary: "Selected Material dimensions are 2400 × 1200mm.",
      promptVersion: "material_unit_conversion_prompt_v2",
      additionalInformation: null,
    };
    const base = {
      organizationId: "org-1",
      batchId: "batch-1",
      rowId: "row-1",
      sourceRow,
      selectedMaterial,
      requestedMaterialUnit: "m2",
      selectedPriceKey: "source-1:price-ex-gst",
      confirmed,
    };
    expect(() => assertCurrentMaterialUnitConversionContext(base)).not.toThrow();
    expect(() => assertCurrentMaterialUnitConversionContext({
      ...base,
      selectedMaterial: material(selectedMaterial.description ?? "", "2026-08-15T01:00:00Z"),
    })).toThrow(/updated after/);
    expect(() => assertCurrentMaterialUnitConversionContext({
      ...base,
      sourceRow: {
        ...sourceRow,
        source_payload: {
          priceOptions: [{ priceKey: "source-1:price-ex-gst", amount: { value: 47 }, currency: { value: "NZD" } }],
        },
      },
    })).toThrow(/pricing context has changed/);
  });
});
