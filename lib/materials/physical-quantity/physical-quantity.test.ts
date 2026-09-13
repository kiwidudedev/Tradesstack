import { describe, expect, it } from "vitest";
import { parseDimensionTuples } from "@/lib/materials/physical-quantity/parse-dimension-tuples";
import { physicalEvidenceSupportsRelationship } from "@/lib/materials/physical-quantity/validate-relationship";

const evidence = (text: string) => [{ id: "source", text }];

describe("generic construction dimension tuples", () => {
  it.each([
    ["3.0 x 1.2M", [3, 1.2], "shared_trailing"],
    ["3.0m x 1.2m", [3, 1.2], "explicit"],
    ["3000 x 1200mm", [3, 1.2], "shared_trailing"],
    ["3000 × 1200 mm", [3, 1.2], "shared_trailing"],
    ["3000mm X 1200MM", [3, 1.2], "explicit"],
    ["1.2 × 2.4 m", [1.2, 2.4], "shared_trailing"],
  ])("normalizes %s", (text, expected, propagation) => {
    expect(parseDimensionTuples(evidence(text))[0]).toMatchObject({ normalizedValues: expected, propagation, ambiguous: false });
  });

  it("extracts a shared-mm 3D tuple without assigning product meaning", () => {
    expect(parseDimensionTuples(evidence("90×45×6000mm"))[0]).toMatchObject({ normalizedValues: [0.09, 0.045, 6], propagation: "shared_trailing" });
  });

  it("fails closed for mixed-scale 90 x 45 x 6.0m notation", () => {
    expect(parseDimensionTuples(evidence("90 x 45 x 6.0m"))[0]).toMatchObject({ normalizedValues: null, ambiguous: true });
  });

  it("retains unitless tuples as unresolved facts", () => {
    expect(parseDimensionTuples(evidence("1200x2400"))[0]).toMatchObject({ normalizedValues: null, propagation: "none" });
  });
});

describe("generic physical relationship validation", () => {
  it.each([
    ["m2", 3.6, "Gib Fyreline 13mm 3.0 x 1.2M"],
    ["m2", 2.2, "Coverage: 2.2m2 per pack"],
    ["m2", 18, "Roll 1.2m x 15m"],
    ["lm", 100, "100m roll"],
    ["kg", 20, "20kg bag"],
    ["each", 500, "500 pieces per box"],
    ["sheet", 40, "40 sheets per pallet"],
  ])("supports %s relationship from %s", (target, materialQuantity, text) => {
    expect(physicalEvidenceSupportsRelationship({ requestedMaterialUnit: target, supplierQuantity: 1, materialQuantity, evidence: evidence(text) })).toBe(true);
  });

  it("does not select a face from a 3D tuple for m2", () => {
    expect(physicalEvidenceSupportsRelationship({ requestedMaterialUnit: "m2", supplierQuantity: 1, materialQuantity: 2.9768, evidence: evidence("2440 x 1220 x 18mm") })).toBe(false);
  });
});
