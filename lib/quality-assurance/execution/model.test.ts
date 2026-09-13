import { describe, expect, it } from "vitest";
import { createQAField } from "../definitions/model";
import type { QAFieldType } from "../definitions/types";
import { getQARunProgress, isQAResponseAnswered, measurementValidationMessage, responseToSaveValue } from "./model";
import type { QARunResponse } from "./types";

function response(fieldType: QAFieldType, patch: Partial<QARunResponse> = {}): QARunResponse {
  const field = createQAField(fieldType, fieldType);
  return {
    id: crypto.randomUUID(), capturedSectionId: crypto.randomUUID(), capturedFieldId: field.id,
    sectionSortOrder: 0, fieldSortOrder: 0, fieldType,
    fieldSnapshot: { ...field, sectionId: crypto.randomUUID() },
    textValue: null, numericValue: null, booleanValue: null, dateValue: null,
    inspectionResult: null, selectedOptions: [], personUserId: null, personDisplayName: null,
    locationLabel: null, productMaterialValue: null, evidence: [], signatureSignerName: null, signatureMethod: null,
    signatureAttestation: null, signatureSignedBy: null, signatureSignedAt: null, holdRelease: null,
    signatureEvidenceId: null, signatureArtifactSha256: null, signatureArtifactMetadata: null, signatureRecordedByName: null,
    comment: "", lockVersion: 1, updatedAt: new Date(0).toISOString(),
    ...patch,
  };
}

describe("QA execution response model", () => {
  it("defines answered progress consistently for every V1 supported field type", () => {
    const answered = [
      response("short_text", { textValue: "done" }),
      response("long_text", { textValue: "detail" }),
      response("number", { numericValue: 0 }),
      response("measurement", { numericValue: 12.5 }),
      response("date", { dateValue: "2026-08-29" }),
      response("yes_no", { booleanValue: false }),
      response("single_select", { selectedOptions: [{ id: "a", label: "A", value: "a", sortOrder: 0 }] }),
      response("multi_select", { selectedOptions: [{ id: "a", label: "A", value: "a", sortOrder: 0 }] }),
      response("checkbox", { booleanValue: true }),
      response("inspection_check", { inspectionResult: "na" }),
      response("person", { personUserId: crypto.randomUUID(), personDisplayName: "Site User" }),
      response("person", { personDisplayName: "External Installer" }),
      response("location", { locationLabel: "Level 2" }),
      response("product_material", { productMaterialValue: { schemaVersion: 1, source: "manual", organizationMaterialId: null, supplierProductId: null, supplierId: null, productName: "Ardex WPM 002", materialNameSnapshot: "", manufacturerName: "", supplierName: "", batchLot: "B1", productCode: "" } }),
    ];
    expect(answered.every(isQAResponseAnswered)).toBe(true);
    expect(isQAResponseAnswered(response("yes_no", { booleanValue: false }))).toBe(true);
    expect(isQAResponseAnswered(response("checkbox", { booleanValue: false }))).toBe(false);
    expect(getQARunProgress([...answered, response("short_text")])).toEqual({ completed: 15, total: 15, percent: 100 });
  });

  it("maps only typed response properties across the save boundary", () => {
    const input = response("inspection_check", {
      textValue: "text", numericValue: 3, booleanValue: false, dateValue: "2026-08-29",
      inspectionResult: "fail", selectedOptions: [{ id: "a", label: "A", value: "a", sortOrder: 0 }],
      personUserId: "person", personDisplayName: "Person", locationLabel: "Area", comment: "Observed defect",
    });
    expect(responseToSaveValue(input)).toEqual({
      textValue: "text", numericValue: 3, booleanValue: false, dateValue: "2026-08-29",
      inspectionResult: "fail", selectedOptionValues: ["a"], personUserId: "person", personDisplayName: "Person",
      locationLabel: "Area", productMaterialValue: null, comment: "Observed defect",
    });
  });

  it("requires a meaningful artifact for drawn signatures and preserves typed acknowledgement support", () => {
    const signed = {
      signatureSignerName: "Alex Builder",
      signatureAttestation: "I confirm this response.",
      signatureSignedBy: crypto.randomUUID(),
      signatureSignedAt: new Date().toISOString(),
    };
    expect(isQAResponseAnswered(response("signature", { ...signed, signatureMethod: "typed_acknowledgement" }))).toBe(true);
    expect(isQAResponseAnswered(response("signature", { ...signed, signatureMethod: "drawn_signature" }))).toBe(false);
    expect(isQAResponseAnswered(response("signature", {
      ...signed,
      signatureMethod: "drawn_signature",
      signatureEvidenceId: crypto.randomUUID(),
      signatureArtifactSha256: "a".repeat(64),
      signatureArtifactMetadata: { schemaVersion: 1, rendererVersion: 1, mimeType: "image/png", logicalWidth: 640, logicalHeight: 240, pixelWidth: 1280, pixelHeight: 480, devicePixelRatio: 2, strokeCount: 2, pointCount: 7, totalDistance: 80, bounds: { x: 20, y: 40, width: 120, height: 45 } },
    }))).toBe(true);
  });

  it("validates measurement values against captured snapshot bounds", () => {
    const base = response("measurement");
    base.fieldSnapshot.configuration = { unit: "mm", minimum: 10, maximum: 20 };
    expect(measurementValidationMessage({ ...base, numericValue: 9 })).toBe("Below minimum 10");
    expect(measurementValidationMessage({ ...base, numericValue: 21 })).toBe("Above maximum 20");
    expect(measurementValidationMessage({ ...base, numericValue: 15 })).toBeNull();

    base.fieldSnapshot.configuration = { unit: "V", target: 230, tolerance: 5 };
    expect(measurementValidationMessage({ ...base, numericValue: 224 })).toBe("Outside target range 225–235");
    expect(measurementValidationMessage({ ...base, numericValue: 230 })).toBeNull();

    base.fieldSnapshot.configuration = { unit: "V", minimum: 200, target: 230, tolerance: 5 };
    expect(measurementValidationMessage({ ...base, numericValue: 210 })).toBeNull();
  });
});
