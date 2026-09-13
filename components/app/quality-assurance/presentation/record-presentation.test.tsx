import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QAFieldType } from "@/lib/quality-assurance/definitions/types";
import type { QARunFieldSnapshot, QARunResponse } from "@/lib/quality-assurance/execution/types";
import { RecordQAFieldRenderer } from "./RecordQAFieldRenderer";

vi.mock("server-only", () => ({}));

function response(fieldType: QAFieldType, patch: Partial<QARunResponse> = {}, fieldPatch: Partial<QARunFieldSnapshot> = {}): QARunResponse {
  const fieldSnapshot: QARunFieldSnapshot = {
    id: `field-${fieldType}`, sectionId: "section-1", fieldType, label: `${fieldType} label`, description: "Description", instructions: "Instructions", required: false,
    allowNa: true, requirement: "Requirement", acceptanceCriteria: "Acceptance", referenceText: "Reference", photoRequired: false, minimumPhotos: 0, fileRequired: false,
    requireCommentOnFail: false, requirePhotoOnFail: false, createIssueOnFail: false, requireRectificationOnFail: false, blockCompletionOnFail: false,
    requireSupervisorReviewOnFail: false, aiReviewEnabled: false, aiReviewInstruction: "", includeInReport: true,
    configuration: fieldType === "measurement" ? { unit: "mm", minimum: 2, maximum: 4 } : {}, configurationSchemaVersion: 1, sortOrder: 0,
    options: fieldType === "single_select" || fieldType === "multi_select" ? [{ id: "option-1", label: "Option 1", value: "option-1", sortOrder: 0 }] : [],
    ...fieldPatch,
  };
  return {
    id: `response-${fieldType}`, capturedSectionId: "section-1", capturedFieldId: fieldSnapshot.id, sectionSortOrder: 0, fieldSortOrder: 0, fieldType,
    fieldSnapshot, textValue: null, numericValue: null, booleanValue: null, dateValue: null, inspectionResult: null, selectedOptions: [], personUserId: null,
    personDisplayName: null, locationLabel: null, productMaterialValue: null, evidence: [], signatureSignerName: null, signatureMethod: null,
    signatureAttestation: null, signatureSignedBy: null, signatureSignedAt: null, holdRelease: null,
    signatureEvidenceId: null, signatureArtifactSha256: null, signatureArtifactMetadata: null, signatureRecordedByName: null,
    comment: "", lockVersion: 1, updatedAt: "2026-08-29T00:00:00.000Z", ...patch,
  };
}

function render(item: QARunResponse, disabled = false, canVerify = true) {
  return renderToStaticMarkup(<RecordQAFieldRenderer response={item} people={[{ userId: "person-1", name: "Alex Builder" }]} currentUserName="Alex Builder" disabled={disabled} projectSlug="project" projectQaId="qa" runId="run" canVerify={canVerify} onRunChange={vi.fn()} onUploadStateChange={vi.fn()} onUpdateResponse={vi.fn()} />);
}

describe("record QA presentation adapter", () => {
  it("preserves typed text, number, date, person, and location values", () => {
    expect(render(response("short_text", { textValue: "Installed" }))).toContain('value="Installed"');
    expect(render(response("number", { numericValue: 12.5 }))).toContain('value="12.5"');
    expect(render(response("date", { dateValue: "2026-08-29" }))).toContain('value="2026-08-29"');
    expect(render(response("person", { personUserId: "person-1", personDisplayName: "Alex Builder" }))).toMatch(/option value="person-1" selected=""/);
    expect(render(response("location", { locationLabel: "Level 4" }))).toContain('value="Level 4"');
    expect(render(response("person", { personDisplayName: "Manual Installer" }))).toContain('value="Manual Installer"');
  });

  it("renders persisted Product / Material snapshots and record Hold Point disclosure", () => {
    const product = response("product_material", { productMaterialValue: { schemaVersion: 1, source: "manual", organizationMaterialId: null, supplierProductId: null, supplierId: null, productName: "Hilti CFS-S SIL", materialNameSnapshot: "", manufacturerName: "Hilti", supplierName: "", batchLot: "LOT-7", productCode: "CFS-S" } }, { configuration: { productMaterial: { captureBatchLot: true, captureManufacturer: true, captureSupplier: false, captureProductCode: true, suggestMaterials: false } } });
    const productMarkup = render(product);
    for (const value of ["Hilti CFS-S SIL", "Hilti", "LOT-7", "CFS-S"]) expect(productMarkup).toContain(`value="${value}"`);

    const holdPoint = render(response("inspection_check", {}, { configuration: { commentRule: "optional", holdPointEnabled: true } }));
    expect(holdPoint).toContain("HOLD POINT");
    expect(holdPoint).toContain("Hold Point: Awaiting release");
    expect(holdPoint).toContain(">Release<");
  });

  it("preserves measurement unit and validation", () => {
    const markup = render(response("measurement", { numericValue: 1 }));
    expect(markup).toContain("mm");
    expect(markup).toContain("Min 2 · Max 4");
    expect(markup).toContain("Below minimum 2");
  });

  it("preserves select, checkbox, inspection result, and comment bindings", () => {
    const option = { id: "option-1", label: "Option 1", value: "option-1", sortOrder: 0 };
    expect(render(response("single_select", { selectedOptions: [option] }))).toMatch(/option value="option-1" selected=""/);
    expect(render(response("multi_select", { selectedOptions: [option] }))).toContain('checked=""');
    expect(render(response("checkbox", { booleanValue: true }))).toContain('checked=""');
    const inspection = render(response("inspection_check", { inspectionResult: "fail", comment: "Needs rework" }, { requireCommentOnFail: true }));
    expect(inspection).toContain("Needs rework");
    expect(inspection).toContain("Comment (required on fail)");
    expect(inspection).toContain("bg-[var(--primary)]");
  });

  it("renders operational evidence and signature controls and keeps record controls read-only when disabled", () => {
    expect(render(response("photo", {}, { required: true }))).toContain("Take Photo");
    expect(render(response("signature"))).toContain("Signer name");
    expect(render(response("short_text", { textValue: "Locked" }), true)).toContain('disabled=""');
  });

  it.each([
    { label: "inspector only", responseDisabled: false, canVerify: false, edit: true, verify: false },
    { label: "verifier only", responseDisabled: true, canVerify: true, edit: false, verify: true },
    { label: "inspector and verifier", responseDisabled: false, canVerify: true, edit: true, verify: true },
    { label: "view only", responseDisabled: true, canVerify: false, edit: false, verify: false },
  ])("keeps Hold Point inspection and verification permissions independent for $label", ({ responseDisabled, canVerify, edit, verify }) => {
    const markup = render(response("inspection_check", { inspectionResult: "pass" }, { configuration: { commentRule: "optional", holdPointEnabled: true } }), responseDisabled, canVerify);
    expect(markup.includes(">Release<")).toBe(verify);
    expect(/<button[^>]*disabled=""[^>]*>pass<\/button>/.test(markup)).toBe(!edit);
  });

  it("renders saved drawn and typed signatures with durable identity and completed immutability", () => {
    const signed = {
      signatureSignerName: "John Smith",
      signatureAttestation: "I confirm that the information recorded in this QA response is accurate to the best of my knowledge.",
      signatureSignedBy: "actor-1",
      signatureSignedAt: "2026-08-29T08:42:00.000Z",
      signatureRecordedByName: "Corey Fenton",
    };
    const evidenceId = "signature-evidence-1";
    const drawn = response("signature", {
      ...signed,
      signatureMethod: "drawn_signature",
      signatureEvidenceId: evidenceId,
      signatureArtifactSha256: "a".repeat(64),
      signatureArtifactMetadata: { schemaVersion: 1, rendererVersion: 1, mimeType: "image/png", logicalWidth: 600, logicalHeight: 200, pixelWidth: 1200, pixelHeight: 400, devicePixelRatio: 2, strokeCount: 1, pointCount: 4, totalDistance: 200, bounds: { x: 20, y: 40, width: 300, height: 80 } },
      evidence: [{ id: evidenceId, evidenceType: "signature", purpose: "general", originalFilename: "signature.png", mimeType: "image/png", byteSize: 1400, caption: "", sortOrder: 0, uploadedBy: "actor-1", uploadedAt: "2026-08-29T08:42:00.000Z", signedUrl: "https://example.invalid/signature.png", contentSha256: "a".repeat(64), imageWidth: 1200, imageHeight: 400 }],
    });
    const inProgress = render(drawn);
    for (const text of ["Signed by", "John Smith", "Recorded by", "Corey Fenton", "Attestation", "Confirmed", "Replace signature"]) expect(inProgress).toContain(text);
    expect(inProgress).toContain('src="https://example.invalid/signature.png"');
    const completed = render(drawn, true);
    expect(completed).not.toContain("Replace signature");
    expect(completed).not.toContain("Clear");

    const typed = render(response("signature", { ...signed, signatureMethod: "typed_acknowledgement" }));
    expect(typed).toContain("Typed acknowledgement");
    expect(typed).not.toContain("signature.png");
  });
});
