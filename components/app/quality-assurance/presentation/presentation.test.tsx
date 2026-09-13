import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QAFieldDefinition, QAFieldType } from "@/lib/quality-assurance/definitions/types";
import { BuilderQAFieldRenderer } from "./BuilderQAFieldRenderer";
import { PreviewQAFieldRenderer } from "./PreviewQAFieldRenderer";
import { QAFieldPresentation } from "./QAFieldPresentation";
import { QATextResponseControl } from "./QAResponseControls";

function field(fieldType: QAFieldType): QAFieldDefinition {
  return {
    id: `field-${fieldType}`,
    fieldType,
    label: `${fieldType} label`,
    description: "Field description",
    instructions: "Follow these instructions",
    required: true,
    allowNa: true,
    requirement: "Required finish",
    acceptanceCriteria: "Within tolerance",
    referenceText: "A-402 / Detail 6",
    photoRequired: fieldType === "inspection_check",
    minimumPhotos: fieldType === "inspection_check" ? 1 : 0,
    fileRequired: false,
    requireCommentOnFail: true,
    requirePhotoOnFail: false,
    createIssueOnFail: false,
    requireRectificationOnFail: false,
    blockCompletionOnFail: false,
    requireSupervisorReviewOnFail: false,
    aiReviewEnabled: false,
    aiReviewInstruction: "",
    includeInReport: true,
    configuration: fieldType === "measurement" ? { unit: "mm", minimum: 2, maximum: 4 } : {},
    configurationSchemaVersion: 1,
    sortOrder: 0,
    options: fieldType === "single_select" || fieldType === "multi_select" ? [{ id: "option-1", label: "Option 1", value: "option-1", sortOrder: 0 }] : [],
  };
}

describe("shared QA presentation", () => {
  it("renders the complete shared field guidance hierarchy", () => {
    const source = field("short_text");
    const markup = renderToStaticMarkup(<QAFieldPresentation field={source} fieldNumber={1} response={<QATextResponseControl interactive={false} placeholder="Enter response..." />} />);
    for (const text of [source.label, "Required", source.description, source.instructions, "Requirement:", source.requirement, "Acceptance criteria:", source.acceptanceCriteria, "Reference:", source.referenceText, "Enter response..."]) expect(markup).toContain(text);
  });

  it("renders a realistic static response for every builder field type without form controls", () => {
    const expected: Record<QAFieldType, string> = {
      short_text: "Enter response...", long_text: "Enter response...", number: ">0<", measurement: "mm", date: "dd/mm/yyyy",
      yes_no: "Yes", single_select: "Select an option", multi_select: "Option 1", checkbox: "Confirmed", inspection_check: "Comment (required on fail)",
      photo: "Add photo evidence", file: "Upload supporting file", person: "Select a person", location: "Enter location...", product_material: "Select or enter product", signature: "Signature",
    };
    for (const fieldType of Object.keys(expected) as QAFieldType[]) {
      const markup = renderToStaticMarkup(<BuilderQAFieldRenderer field={field(fieldType)} fieldNumber={1} selected={false} />);
      expect(markup, fieldType).toContain(expected[fieldType]);
      expect(markup, fieldType).not.toMatch(/<(input|textarea|select|button)\b/);
    }
  });

  it("renders Product / Material configuration and Hold Point consistently", () => {
    const product = field("product_material");
    product.configuration = { productMaterial: { captureBatchLot: true, captureManufacturer: true, captureSupplier: false, captureProductCode: true, suggestMaterials: false } };
    const productMarkup = renderToStaticMarkup(<BuilderQAFieldRenderer field={product} fieldNumber={1} selected={false} />);
    for (const text of ["Product", "Batch / Lot", "Manufacturer", "Product Code", "Manual entry is always available"]) expect(productMarkup).toContain(text);
    expect(productMarkup).not.toContain(">Supplier<");

    const inspection = field("inspection_check");
    inspection.configuration = { commentRule: "required", holdPointEnabled: true };
    const inspectionMarkup = renderToStaticMarkup(<BuilderQAFieldRenderer field={inspection} fieldNumber={1} selected={false} />);
    expect(inspectionMarkup).toContain("HOLD POINT");
    expect(inspectionMarkup).toContain("Do not continue until this check has been released by an authorized QA verifier.");
    expect(inspectionMarkup).toContain("Enter required comment...");
  });

  it("shows inspection metadata, N/A, comment, and configured evidence", () => {
    const markup = renderToStaticMarkup(<BuilderQAFieldRenderer field={field("inspection_check")} fieldNumber={1} selected />);
    for (const text of ["Required finish", "Within tolerance", "A-402 / Detail 6", "pass", "fail", "N/A", "Comment", "Photo evidence configured", "Required · minimum 1"]) expect(markup.toLowerCase()).toContain(text.toLowerCase());
    expect(markup).toContain("min-h-20");
    expect(markup).not.toContain("sm:min-h-36");
    expect(markup).toContain("ring-[var(--brand-blue)]");

    const onFail = field("inspection_check");
    onFail.photoRequired = false;
    onFail.requirePhotoOnFail = true;
    onFail.minimumPhotos = 2;
    onFail.fileRequired = true;
    const onFailMarkup = renderToStaticMarkup(<BuilderQAFieldRenderer field={onFail} fieldNumber={1} selected={false} />);
    expect(onFailMarkup).toContain("Required on Fail · minimum 2");
    expect(onFailMarkup).toContain("Supporting file configured");
  });

  it("reacts directly to builder definition configuration", () => {
    const measurement = field("measurement");
    measurement.configuration = { unit: "MPa", target: 12, tolerance: 0.5 };
    const measurementMarkup = renderToStaticMarkup(<BuilderQAFieldRenderer field={measurement} fieldNumber={1} selected={false} />);
    expect(measurementMarkup).toContain("MPa");
    expect(measurementMarkup).toContain("Target 12 ± 0.5");

    const inspection = field("inspection_check");
    inspection.allowNa = false;
    inspection.requireCommentOnFail = false;
    inspection.photoRequired = false;
    inspection.minimumPhotos = 0;
    const inspectionMarkup = renderToStaticMarkup(<BuilderQAFieldRenderer field={inspection} fieldNumber={1} selected={false} />);
    expect(inspectionMarkup).not.toContain("N/A");
    expect(inspectionMarkup).toContain("Comment (optional)");
    expect(inspectionMarkup).not.toContain("Photo evidence configured");
  });

  it("renders standard Photo and File evidence previews without upload interaction", () => {
    const photoMarkup = renderToStaticMarkup(<BuilderQAFieldRenderer field={field("photo")} fieldNumber={1} selected />);
    for (const text of ["lucide-camera", "Add photo evidence", "min-h-28", "sm:min-h-36", "border-dashed", "ring-[var(--brand-blue)]"]) expect(photoMarkup).toContain(text);
    expect(photoMarkup).not.toMatch(/<(input|button|label)\b/);
    expect(photoMarkup).not.toContain("role=\"button\"");

    const fileMarkup = renderToStaticMarkup(<BuilderQAFieldRenderer field={field("file")} fieldNumber={1} selected={false} />);
    for (const text of ["lucide-file-up", "Upload supporting file", "sm:min-h-36"]) expect(fileMarkup).toContain(text);
    expect(fileMarkup).not.toMatch(/<(input|button|label)\b/);
  });

  it("keeps Preview Photo and File static with the same standard visual language", () => {
    for (const fieldType of ["photo", "file"] as const) {
      const markup = renderToStaticMarkup(<PreviewQAFieldRenderer field={field(fieldType)} fieldNumber={1} value={{}} onChange={() => undefined} />);
      expect(markup).toContain("sm:min-h-36");
      expect(markup).toContain(fieldType === "photo" ? "Add photo evidence" : "Upload supporting file");
      expect(markup).not.toMatch(/<input[^>]*type="file"/);
      expect(markup).not.toMatch(/<button\b/);
    }
  });

  it("renders a realistic but non-interactive Signature field in Builder", () => {
    const markup = renderToStaticMarkup(<BuilderQAFieldRenderer field={field("signature")} fieldNumber={1} selected={false} />);
    for (const text of ["Signer name", "Draw signature", "Typed acknowledgement", "Draw signature here", "Clear", "Save signature"]) expect(markup).toContain(text);
    expect(markup).toContain("h-[180px]");
    expect(markup).not.toMatch(/<(input|button|canvas|label)\b/);
  });
});
