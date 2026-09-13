export const QA_FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "measurement",
  "date",
  "yes_no",
  "single_select",
  "multi_select",
  "checkbox",
  "inspection_check",
  "photo",
  "file",
  "person",
  "location",
  "product_material",
  "signature",
] as const;

export type QAFieldType = (typeof QA_FIELD_TYPES)[number];
export type QADefinitionStatus = "draft" | "active" | "archived";
export type QABuilderMode = "company-template" | "project-qa";

export type QAFieldOption = {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
};

export type QAMeasurementConfiguration = {
  unit?: string;
  minimum?: number | null;
  maximum?: number | null;
  target?: number | null;
  tolerance?: number | null;
};

export type QACommentRule = "optional" | "required" | "required_on_fail";
export type QAPhotoRule = "optional" | "required" | "required_on_fail";

export type QAProductMaterialConfiguration = {
  captureBatchLot: boolean;
  captureManufacturer: boolean;
  captureSupplier: boolean;
  captureProductCode: boolean;
  suggestMaterials: boolean;
};

export type QAFieldDefinition = {
  id: string;
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
  options: QAFieldOption[];
};

export type QASectionDefinition = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  fields: QAFieldDefinition[];
};

export type QADefinition = {
  id: string;
  name: string;
  description: string;
  status: QADefinitionStatus;
  definitionVersion: number;
  sections: QASectionDefinition[];
  sourceTemplateName?: string | null;
  copiedAt?: string | null;
};

export const QA_FIELD_LIBRARY: Array<{
  category: "Basic" | "QA" | "Evidence" | "Job Information" | "Completion";
  types: Array<{ type: QAFieldType; label: string }>;
}> = [
  {
    category: "Basic",
    types: [
      { type: "short_text", label: "Short Text" },
      { type: "long_text", label: "Long Text" },
      { type: "number", label: "Number" },
      { type: "date", label: "Date" },
      { type: "yes_no", label: "Yes / No" },
      { type: "single_select", label: "Single Select" },
      { type: "multi_select", label: "Multi Select" },
      { type: "checkbox", label: "Checkbox" },
    ],
  },
  { category: "QA", types: [{ type: "inspection_check", label: "Inspection Check" }, { type: "measurement", label: "Measurement" }] },
  { category: "Evidence", types: [{ type: "photo", label: "Photo" }, { type: "file", label: "File" }] },
  { category: "Job Information", types: [{ type: "person", label: "Person" }, { type: "location", label: "Location" }, { type: "product_material", label: "Product / Material" }] },
  { category: "Completion", types: [{ type: "signature", label: "Signature" }] },
];

export const QA_MEASUREMENT_UNITS = [
  "mm", "cm", "m", "m²", "m³", "°C", "%", "kPa", "MPa", "bar", "V", "A", "Ω",
  "L", "L/min", "l/s", "min", "hr", "kg", "N", "kN",
] as const;
