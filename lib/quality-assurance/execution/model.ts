import { signatureMetadataIsMeaningful } from "@/components/ui/signature-pad-model";
import type { QARunResponse, QAResponseSaveValue } from "./types";

export const QA_EXECUTION_SUPPORTED_FIELD_TYPES = new Set([
  "short_text", "long_text", "number", "measurement", "date", "yes_no",
  "single_select", "multi_select", "checkbox", "inspection_check", "person", "location",
  "product_material", "photo", "file", "signature",
]);

export function isUnsupportedExecutionField(fieldType: string) {
  return !QA_EXECUTION_SUPPORTED_FIELD_TYPES.has(fieldType);
}

export function isQAResponseAnswered(response: QARunResponse): boolean {
  switch (response.fieldType) {
    case "short_text":
    case "long_text": return Boolean(response.textValue?.trim());
    case "number":
    case "measurement": return response.numericValue !== null && Number.isFinite(response.numericValue);
    case "date": return Boolean(response.dateValue);
    case "yes_no": return response.booleanValue !== null;
    case "single_select": return response.selectedOptions.length === 1;
    case "multi_select": return response.selectedOptions.length > 0;
    case "checkbox": return response.booleanValue === true;
    case "inspection_check": return response.inspectionResult !== null;
    case "person": return Boolean(response.personDisplayName?.trim());
    case "location": return Boolean(response.locationLabel?.trim());
    case "product_material": return Boolean(response.productMaterialValue?.productName.trim());
    case "photo": return response.evidence.filter((item) => item.evidenceType === "photo").length >= Math.max(response.fieldSnapshot.minimumPhotos || 0, 1);
    case "file": return response.evidence.some((item) => item.evidenceType === "file");
    case "signature": return Boolean(
      response.signatureSignerName?.trim()
      && response.signatureSignedAt
      && response.signatureSignedBy
      && response.signatureAttestation?.trim()
      && (response.signatureMethod === "typed_acknowledgement"
        || (response.signatureMethod === "drawn_signature"
          && response.signatureEvidenceId
          && response.signatureArtifactSha256
          && response.signatureArtifactMetadata
          && signatureMetadataIsMeaningful(response.signatureArtifactMetadata))),
    );
    default: return false;
  }
}

export function isQAResponseComplete(response: QARunResponse): boolean {
  const field = response.fieldSnapshot;
  const answered = isQAResponseAnswered(response);
  if (field.required && !answered) return false;
  if (response.fieldType === "measurement" && measurementValidationMessage(response)) return false;
  if (response.fieldType === "inspection_check") {
    const commentRule = field.configuration.commentRule === "required" || field.configuration.commentRule === "required_on_fail"
      ? field.configuration.commentRule
      : field.requireCommentOnFail ? "required_on_fail" : "optional";
    if (commentRule === "required" && !response.comment.trim()) return false;
    if (commentRule === "required_on_fail" && response.inspectionResult === "fail" && !response.comment.trim()) return false;
    const photos = response.evidence.filter((item) => item.evidenceType === "photo").length;
    const minimumPhotos = Math.max(field.minimumPhotos || 0, 1);
    if (field.photoRequired && photos < minimumPhotos) return false;
    if (field.requirePhotoOnFail && response.inspectionResult === "fail" && photos < minimumPhotos) return false;
    if (field.fileRequired && !response.evidence.some((item) => item.evidenceType === "file")) return false;
    if (field.configuration.holdPointEnabled === true && response.holdRelease?.status !== "released") return false;
  }
  return answered || !field.required;
}

export function getQARunProgress(responses: QARunResponse[]) {
  const completed = responses.filter(isQAResponseComplete).length;
  const total = responses.length;
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

export function responseToSaveValue(response: QARunResponse): QAResponseSaveValue {
  return {
    textValue: response.textValue,
    numericValue: response.numericValue,
    booleanValue: response.booleanValue,
    dateValue: response.dateValue,
    inspectionResult: response.inspectionResult,
    selectedOptionValues: response.selectedOptions.map((option) => option.value),
    personUserId: response.personUserId,
    personDisplayName: response.personDisplayName,
    locationLabel: response.locationLabel,
    productMaterialValue: response.productMaterialValue,
    comment: response.comment,
  };
}

export function measurementValidationMessage(response: QARunResponse): string | null {
  if (response.fieldType !== "measurement" || response.numericValue === null) return null;
  const configuration = response.fieldSnapshot.configuration as { minimum?: number | null; maximum?: number | null; target?: number | null; tolerance?: number | null };
  if (configuration.minimum != null && response.numericValue < configuration.minimum) return `Below minimum ${configuration.minimum}`;
  if (configuration.maximum != null && response.numericValue > configuration.maximum) return `Above maximum ${configuration.maximum}`;
  if (configuration.minimum == null && configuration.maximum == null && configuration.target != null && configuration.tolerance != null) {
    const minimum = configuration.target - configuration.tolerance;
    const maximum = configuration.target + configuration.tolerance;
    if (response.numericValue < minimum || response.numericValue > maximum) return `Outside target range ${minimum}–${maximum}`;
  }
  return null;
}
