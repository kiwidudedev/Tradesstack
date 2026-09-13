import { describe, expect, it } from "vitest";
import {
  createQAField,
  duplicateField,
  duplicateSection,
  moveItem,
  normalizeDefinition,
  validateQADefinition,
  getInspectionCommentRule,
  getInspectionPhotoRule,
  getProductMaterialConfiguration,
} from "./model";
import { QA_FIELD_LIBRARY, type QADefinition } from "./types";

function definition(): QADefinition {
  return {
    id: crypto.randomUUID(),
    name: "Customer QA",
    description: "",
    status: "draft",
    definitionVersion: 1,
    sections: [{
      id: crypto.randomUUID(),
      title: "Area one",
      description: "",
      sortOrder: 8,
      fields: [createQAField("single_select", "Result"), createQAField("inspection_check", "Inspection")],
    }],
  };
}

describe("QA definition model", () => {
  it("normalizes relational ordering without changing stable identities", () => {
    const input = definition();
    const normalized = normalizeDefinition(input);
    expect(normalized.sections[0].id).toBe(input.sections[0].id);
    expect(normalized.sections[0].sortOrder).toBe(0);
    expect(normalized.sections[0].fields.map((field) => field.sortOrder)).toEqual([0, 1]);
    expect(normalized.sections[0].fields[0].options[0].sortOrder).toBe(0);
  });

  it("duplicates fields, sections, and select options with independent UUIDs", () => {
    const input = definition();
    const fieldCopy = duplicateField(input.sections[0].fields[0]);
    const sectionCopy = duplicateSection(input.sections[0]);
    expect(fieldCopy.id).not.toBe(input.sections[0].fields[0].id);
    expect(fieldCopy.options[0].id).not.toBe(input.sections[0].fields[0].options[0].id);
    expect(sectionCopy.id).not.toBe(input.sections[0].id);
    expect(sectionCopy.fields.map((field) => field.id)).not.toEqual(input.sections[0].fields.map((field) => field.id));
  });

  it("supports keyboard-friendly reorder commands and validates type-specific rules", () => {
    expect(moveItem(["first", "second"], 1, -1)).toEqual(["second", "first"]);
    const input = definition();
    input.sections[0].fields[0].options = [];
    input.sections[0].fields[1].minimumPhotos = 51;
    expect(validateQADefinition(input)).toEqual(expect.arrayContaining([
      "Result: add at least one option.",
      "Inspection: minimum photos must be between 0 and 50.",
    ]));
  });

  it("defines the subcontractor toolbox and Product / Material defaults", () => {
    expect(QA_FIELD_LIBRARY.find((group) => group.category === "Basic")?.types.map((item) => item.type)).not.toContain("measurement");
    expect(QA_FIELD_LIBRARY.find((group) => group.category === "QA")?.types.map((item) => item.type)).toEqual(["inspection_check", "measurement"]);
    expect(QA_FIELD_LIBRARY.find((group) => group.category === "Job Information")?.types.map((item) => item.type)).toEqual(["person", "location", "product_material"]);
    expect(QA_FIELD_LIBRARY.flatMap((group) => group.types).filter((item) => item.type === "product_material")).toHaveLength(1);
    expect(QA_FIELD_LIBRARY.flatMap((group) => group.types)).toHaveLength(16);

    const product = createQAField("product_material", "Product / Material");
    expect(getProductMaterialConfiguration(product.configuration)).toEqual({ captureBatchLot: true, captureManufacturer: false, captureSupplier: false, captureProductCode: false, suggestMaterials: false });
  });

  it("maps photo and comment rules with legacy compatibility", () => {
    const inspection = createQAField("inspection_check", "Check");
    expect(getInspectionPhotoRule(inspection)).toBe("optional");
    expect(getInspectionCommentRule(inspection)).toBe("optional");
    inspection.requirePhotoOnFail = true;
    inspection.requireCommentOnFail = true;
    inspection.configuration = {};
    expect(getInspectionPhotoRule(inspection)).toBe("required_on_fail");
    expect(getInspectionCommentRule(inspection)).toBe("required_on_fail");
    inspection.photoRequired = true;
    expect(getInspectionPhotoRule(inspection)).toBe("required");
    inspection.minimumPhotos = Number.NaN;
    expect(normalizeDefinition({ ...definition(), sections: [{ ...definition().sections[0], fields: [inspection] }] }).sections[0].fields[0].minimumPhotos).toBe(1);
    inspection.configuration = { commentRule: "required", holdPointEnabled: true };
    expect(getInspectionCommentRule(inspection)).toBe("required");
  });
});
