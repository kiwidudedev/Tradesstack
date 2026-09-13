import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposeMaterialUnitConversion } from "@/lib/materials/unit-conversion/convert";
import { MATERIAL_UNIT_CONVERSION_JSON_SCHEMA } from "@/lib/materials/unit-conversion/schema";
import { normalizeMaterialConversionUnit } from "@/lib/materials/unit-conversion/normalize-unit";
import { calculateComparableMaterialUnitCost } from "@/lib/materials/unit-conversion/pricing";
import { validateMaterialUnitConversionProposal } from "@/lib/materials/unit-conversion/validate";
import { physicalEvidenceSupportsConversion } from "@/lib/materials/unit-conversion/physical-evidence";
import { buildMaterialUnitConversionInstructions } from "@/lib/materials/unit-conversion/prompt";

const { interpretStructuredDocument } = vi.hoisted(() => ({ interpretStructuredDocument: vi.fn() }));
vi.mock("@/lib/document-intelligence/structured-interpreter", () => ({ interpretStructuredDocument }));

const context = {
  supplierDescription: "Radiata SG8 H1.2 Dry Timber 90 x 45 x 6.0m",
  supplierSku: "2055895",
  supplierUnit: "each",
  supplierUnitCost: 48.75,
  currency: "NZD",
  packQuantity: 1,
  packUnit: "each",
  proposedMaterialName: "Radiata timber 90 x 45",
  requestedMaterialUnit: "lm",
  selectedPriceKey: "price-1",
  selectedPriceLabel: "Each (per length)",
  evidence: [{
    id: "supplier.description",
    source: "supplier_source" as const,
    text: "Radiata SG8 H1.2 Dry Timber 90 x 45 x 6.0m",
  }],
  additionalInformation: null,
};

const metadata = {
  contextHash: "context-hash",
  selectedMaterialId: null,
  selectedMaterialUpdatedAt: null,
};

function wire(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: "material_unit_conversion_v2",
    status: "convertible",
    supplierUnit: "each",
    requestedMaterialUnit: "lm",
    supplierQuantity: 1,
    materialQuantity: 6,
    convertedUnitCost: 8.125,
    currency: "NZD",
    basis: "supplier_source",
    evidenceRefs: ["supplier.description"],
    evidenceSummary: "The supplier description states a six metre length.",
    explanation: "The supplier item is one six metre length.",
    missingInformation: [],
    confidence: 0.98,
    ...overrides,
  };
}

beforeEach(() => interpretStructuredDocument.mockReset());

describe("Material unit alias normalization", () => {
  it.each(["L/M", "LM", "lm", "linear metre", "linear meter"])("normalizes %s to lm", (value) => {
    expect(normalizeMaterialConversionUnit(value)).toBe("lm");
  });
  it.each(["m²", "m2", "sqm"])("normalizes %s to m2", (value) => {
    expect(normalizeMaterialConversionUnit(value)).toBe("m2");
  });
  it.each(["ea", "each"])("normalizes %s to each", (value) => {
    expect(normalizeMaterialConversionUnit(value)).toBe("each");
  });
});

describe("Material unit conversion arithmetic", () => {
  it.each([
    [48.75, 1, 6, 8.125],
    [25, 1, 100, 0.25],
    [28.8, 1, 2.88, 10],
    [18, 1, 20, 0.9],
  ])("converts source cost %s using %s:%s", (cost, supplierQuantity, materialQuantity, expected) => {
    expect(calculateComparableMaterialUnitCost({ supplierUnitCost: cost, supplierQuantity, materialQuantity })).toBeCloseTo(expected, 8);
  });
  it("rejects zero and nonfinite quantities", () => {
    expect(() => calculateComparableMaterialUnitCost({ supplierUnitCost: 10, supplierQuantity: 0, materialQuantity: 1 })).toThrow(/Supplier quantity/);
    expect(() => calculateComparableMaterialUnitCost({ supplierUnitCost: 10, supplierQuantity: 1, materialQuantity: Number.NaN })).toThrow(/Material quantity/);
  });
});

describe("focused physical evidence validation", () => {
  it.each([
    ["m2", 2.88, ["Sheet is 2400mm × 1200mm"]],
    ["lm", 6, ["One item is 6.0m long"]],
    ["each", 20, ["20 pieces per box"]],
    ["kg", 25, ["Weight per bag: 25kg"]],
  ])("supports explicit %s evidence", (requestedMaterialUnit, materialQuantity, evidenceTexts) => {
    expect(physicalEvidenceSupportsConversion({
      requestedMaterialUnit,
      supplierQuantity: 1,
      materialQuantity,
      evidenceTexts,
    })).toBe(true);
  });

  it("does not support an unstated sheet width", () => {
    expect(physicalEvidenceSupportsConversion({
      requestedMaterialUnit: "m2",
      supplierQuantity: 1,
      materialQuantity: 2.88,
      evidenceTexts: ["Fire-rated sheet, 13mm thick and 2400mm long"],
    })).toBe(false);
  });
});

describe("Material conversion prompt policy", () => {
  it("allows supplied derivation while forbidding standard-dimension assumptions and persistence decisions", () => {
    const prompt = buildMaterialUnitConversionInstructions(context).systemInstruction;
    expect(prompt).toContain("mathematically derive");
    expect(prompt).toContain("Never assume standard dimensions");
    expect(prompt).toContain("For needs_information");
    expect(prompt).toContain("Do not choose database records, persist anything");
  });
});

describe("Material unit conversion contract", () => {
  it("is strict and recomputes the Radiata cost server-side", () => {
    expect(MATERIAL_UNIT_CONVERSION_JSON_SCHEMA).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(MATERIAL_UNIT_CONVERSION_JSON_SCHEMA)).not.toMatch(/"type":\[/);
    const proposal = validateMaterialUnitConversionProposal({
      value: wire(), context: { ...context, requestedMaterialUnit: "L/M" },
    });
    expect(proposal).toMatchObject({ supplierQuantity: 1, materialQuantity: 6, convertedUnitCost: 8.125, requestedMaterialUnit: "lm" });
  });
  it("rejects provider arithmetic that differs from source truth", () => {
    expect(() => validateMaterialUnitConversionProposal({
      value: wire({ convertedUnitCost: 9 }), context,
    })).toThrow(/arithmetic/);
  });
  it("requires explicit missing information and no speculative quantities", () => {
    expect(validateMaterialUnitConversionProposal({
      value: wire({ status: "needs_information", requestedMaterialUnit: "kg", supplierQuantity: null, materialQuantity: null, convertedUnitCost: null, missingInformation: ["Weight per supplier item"] }),
      context: { ...context, requestedMaterialUnit: "kg", supplierUnitCost: 50 },
    }).status).toBe("needs_information");
    expect(() => validateMaterialUnitConversionProposal({
      value: wire({ status: "needs_information", requestedMaterialUnit: "kg", supplierQuantity: null, materialQuantity: null, convertedUnitCost: null, missingInformation: [] }),
      context: { ...context, requestedMaterialUnit: "kg", supplierUnitCost: 50 },
    })).toThrow(/must explain/);
  });
});

describe("Material unit conversion provider cost control", () => {
  it("short-circuits equal aliases with zero provider calls", async () => {
    const proposal = await proposeMaterialUnitConversion({ ...context, supplierUnit: "m²", requestedMaterialUnit: "sqm", supplierUnitCost: 10 }, metadata);
    expect(proposal.status).toBe("no_conversion_needed");
    expect(interpretStructuredDocument).not.toHaveBeenCalled();
  });
  it("uses exactly one provider call and sends structured row context rather than a source document", async () => {
    interpretStructuredDocument.mockResolvedValue({ value: wire(), run: {} });
    const proposal = await proposeMaterialUnitConversion(context, metadata);
    expect(proposal.convertedUnitCost).toBe(8.125);
    expect(interpretStructuredDocument).toHaveBeenCalledTimes(1);
    expect(interpretStructuredDocument).toHaveBeenCalledWith("anthropic", expect.objectContaining({
      attemptNumber: 1,
      sourceParts: [expect.objectContaining({ kind: "email_body", fileName: "material-import-row-context.json" })],
    }));
  });
});
