import type { QAFieldType } from "@/lib/quality-assurance/definitions/types";
import type { SignatureArtifactMetadata } from "@/components/ui/signature-pad-model";

export type QARunStatus = "in_progress" | "completed" | "cancelled";
export type QAInspectionResult = "pass" | "fail" | "na" | null;

export type QAEvidenceType = "photo" | "file" | "signature";
export type QAEvidencePurpose = "general" | "failure";
export type QAResponseEvidence = {
  id: string;
  evidenceType: QAEvidenceType;
  purpose: QAEvidencePurpose;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  caption: string;
  sortOrder: number;
  uploadedBy: string;
  uploadedAt: string;
  signedUrl: string | null;
  contentSha256: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
};
export type QAHoldRelease = {
  status: "released" | "rejected";
  comment: string;
  releasedBy: string;
  releasedAt: string;
  revision: number;
};
export type QASignoff = {
  id: string;
  signerName: string;
  attestation: string;
  signedBy: string;
  signedAt: string;
};

export type QAProductMaterialValue = {
  schemaVersion: 1;
  source: "manual" | "material";
  organizationMaterialId: string | null;
  supplierProductId: string | null;
  supplierId: string | null;
  productName: string;
  materialNameSnapshot: string;
  manufacturerName: string;
  supplierName: string;
  batchLot: string;
  productCode: string;
};

export const EMPTY_QA_PRODUCT_MATERIAL_VALUE: QAProductMaterialValue = {
  schemaVersion: 1,
  source: "manual",
  organizationMaterialId: null,
  supplierProductId: null,
  supplierId: null,
  productName: "",
  materialNameSnapshot: "",
  manufacturerName: "",
  supplierName: "",
  batchLot: "",
  productCode: "",
};

export type QASnapshotOption = { id: string; label: string; value: string; sortOrder: number };

export type QARunFieldSnapshot = {
  id: string;
  sectionId: string;
  fieldType: QAFieldType;
  label: string;
  description: string;
  instructions: string;
  required: boolean;
  allowNa: boolean;
  requirement: string;
  acceptanceCriteria: string;
  referenceText: string;
  photoRequired: boolean;
  minimumPhotos: number;
  fileRequired: boolean;
  requireCommentOnFail: boolean;
  requirePhotoOnFail: boolean;
  createIssueOnFail: boolean;
  requireRectificationOnFail: boolean;
  blockCompletionOnFail: boolean;
  requireSupervisorReviewOnFail: boolean;
  aiReviewEnabled: boolean;
  aiReviewInstruction: string;
  includeInReport: boolean;
  configuration: Record<string, unknown>;
  configurationSchemaVersion: number;
  sortOrder: number;
  options: QASnapshotOption[];
};

export type QARunSectionSnapshot = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  fields: QARunFieldSnapshot[];
};

export type QARunDefinitionSnapshot = {
  schemaVersion: number;
  projectQaId: string;
  name: string;
  description: string;
  status: "active";
  definitionVersion: number;
  sourceTemplateId: string | null;
  sourceTemplateName: string | null;
  sourceTemplateVersion: number | null;
  copiedAt: string | null;
  sections: QARunSectionSnapshot[];
};

export type QARunResponse = {
  id: string;
  capturedSectionId: string;
  capturedFieldId: string;
  sectionSortOrder: number;
  fieldSortOrder: number;
  fieldType: QAFieldType;
  fieldSnapshot: QARunFieldSnapshot;
  textValue: string | null;
  numericValue: number | null;
  booleanValue: boolean | null;
  dateValue: string | null;
  inspectionResult: QAInspectionResult;
  selectedOptions: QASnapshotOption[];
  personUserId: string | null;
  personDisplayName: string | null;
  locationLabel: string | null;
  productMaterialValue: QAProductMaterialValue | null;
  evidence: QAResponseEvidence[];
  signatureSignerName: string | null;
  signatureMethod: "typed_acknowledgement" | "drawn_signature" | null;
  signatureAttestation: string | null;
  signatureSignedBy: string | null;
  signatureSignedAt: string | null;
  signatureEvidenceId: string | null;
  signatureArtifactSha256: string | null;
  signatureArtifactMetadata: SignatureArtifactMetadata | null;
  signatureRecordedByName: string | null;
  holdRelease: QAHoldRelease | null;
  comment: string;
  lockVersion: number;
  updatedAt: string;
};

export type QARunRecord = {
  id: string;
  projectQaId: string;
  projectQaDefinitionVersion: number;
  definitionSnapshotSchemaVersion: number;
  definitionSnapshot: QARunDefinitionSnapshot;
  definitionSnapshotHash: string;
  status: QARunStatus;
  title: string;
  locationLabel: string;
  startedBy: string;
  startedAt: string;
  completedBy: string | null;
  completedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  lockVersion: number;
  responses: QARunResponse[];
  signoff: QASignoff | null;
};

export type QARunListItem = Pick<QARunRecord, "id" | "status" | "title" | "locationLabel" | "startedAt" | "completedAt" | "cancelledAt" | "lockVersion"> & {
  answeredCount: number;
  responseCount: number;
};

export type QARecordPersonOption = { userId: string; name: string };

export type QAResponseSaveValue = {
  textValue?: string | null;
  numericValue?: string | number | null;
  booleanValue?: boolean | null;
  dateValue?: string | null;
  inspectionResult?: Exclude<QAInspectionResult, null> | null;
  selectedOptionValues?: string[];
  personUserId?: string | null;
  personDisplayName?: string | null;
  locationLabel?: string | null;
  productMaterialValue?: QAProductMaterialValue | null;
  comment?: string;
};
