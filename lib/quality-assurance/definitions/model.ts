import {
  QA_FIELD_TYPES,
  type QADefinition,
  type QAFieldDefinition,
  type QAFieldOption,
  type QAFieldType,
  type QACommentRule,
  type QAPhotoRule,
  type QAProductMaterialConfiguration,
  type QASectionDefinition,
} from "./types";

export const DEFAULT_PRODUCT_MATERIAL_CONFIGURATION: QAProductMaterialConfiguration = {
  captureBatchLot: true,
  captureManufacturer: false,
  captureSupplier: false,
  captureProductCode: false,
  suggestMaterials: false,
};

export function getProductMaterialConfiguration(configuration: Record<string, unknown>): QAProductMaterialConfiguration {
  const value = configuration.productMaterial;
  const productMaterial = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    captureBatchLot: typeof productMaterial.captureBatchLot === "boolean" ? productMaterial.captureBatchLot : true,
    captureManufacturer: productMaterial.captureManufacturer === true,
    captureSupplier: productMaterial.captureSupplier === true,
    captureProductCode: productMaterial.captureProductCode === true,
    suggestMaterials: productMaterial.suggestMaterials === true,
  };
}

export function getInspectionCommentRule(field: Pick<QAFieldDefinition, "configuration" | "requireCommentOnFail">): QACommentRule {
  const rule = field.configuration.commentRule;
  if (rule === "optional" || rule === "required" || rule === "required_on_fail") return rule;
  return field.requireCommentOnFail ? "required_on_fail" : "optional";
}

export function getInspectionPhotoRule(field: Pick<QAFieldDefinition, "photoRequired" | "requirePhotoOnFail">): QAPhotoRule {
  if (field.photoRequired) return "required";
  return field.requirePhotoOnFail ? "required_on_fail" : "optional";
}

export function isHoldPointEnabled(field: Pick<QAFieldDefinition, "configuration">) {
  return field.configuration.holdPointEnabled === true;
}

export function newQAId() {
  return crypto.randomUUID();
}

export function createQAField(fieldType: QAFieldType, label?: string): QAFieldDefinition {
  const defaultLabel = label ?? fieldType.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
  const select = fieldType === "single_select" || fieldType === "multi_select";
  return {
    id: newQAId(), fieldType, label: defaultLabel, description: "", instructions: "", required: false,
    allowNa: fieldType === "inspection_check", requirement: "", acceptanceCriteria: "", referenceText: "",
    photoRequired: false, minimumPhotos: fieldType === "photo" ? 1 : 0, fileRequired: false, requireCommentOnFail: false,
    requirePhotoOnFail: false, createIssueOnFail: false, requireRectificationOnFail: false,
    blockCompletionOnFail: false, requireSupervisorReviewOnFail: false, aiReviewEnabled: false,
    aiReviewInstruction: "", includeInReport: true, configuration: fieldType === "measurement"
      ? { unit: "mm" }
      : fieldType === "inspection_check"
        ? { commentRule: "optional", holdPointEnabled: false }
        : fieldType === "product_material"
          ? { productMaterial: { ...DEFAULT_PRODUCT_MATERIAL_CONFIGURATION } }
          : {},
    configurationSchemaVersion: 1, sortOrder: 0,
    options: select ? [{ id: newQAId(), label: "Option 1", value: "option-1", sortOrder: 0 }] : [],
  };
}

export function createQASection(title = "Untitled section"): QASectionDefinition {
  return { id: newQAId(), title, description: "", sortOrder: 0, fields: [] };
}

export function normalizeDefinition(definition: QADefinition): QADefinition {
  return {
    ...definition,
    sections: definition.sections.map((section, sectionIndex) => ({
      ...section,
      sortOrder: sectionIndex,
      fields: section.fields.map((field, fieldIndex) => ({
        ...field,
        minimumPhotos: field.fieldType === "photo"
          ? Number.isInteger(field.minimumPhotos) && field.minimumPhotos >= 1 && field.minimumPhotos <= 50 ? field.minimumPhotos : 1
          : getInspectionPhotoRule(field) === "optional" ? field.minimumPhotos
          : Number.isInteger(field.minimumPhotos) && field.minimumPhotos >= 1 && field.minimumPhotos <= 50 ? field.minimumPhotos : 1,
        sortOrder: fieldIndex,
        options: field.options.map((option, optionIndex) => ({ ...option, sortOrder: optionIndex })),
      })),
    })),
  };
}

export function duplicateField(field: QAFieldDefinition): QAFieldDefinition {
  return {
    ...field,
    id: newQAId(),
    label: `${field.label} copy`,
    options: field.options.map((option) => ({ ...option, id: newQAId() })),
  };
}

export function duplicateSection(section: QASectionDefinition): QASectionDefinition {
  return {
    ...section,
    id: newQAId(),
    title: `${section.title} copy`,
    fields: section.fields.map((field) => ({ ...duplicateField(field), label: field.label })),
  };
}

export function validateQADefinition(definition: QADefinition): string[] {
  const errors: string[] = [];
  if (!definition.name.trim() || definition.name.trim().length > 160) errors.push("Name must be between 1 and 160 characters.");
  const ids = new Set<string>();
  for (const section of definition.sections) {
    if (!section.title.trim()) errors.push("Every section requires a title.");
    if (ids.has(section.id)) errors.push("Section identities must be unique.");
    ids.add(section.id);
    for (const field of section.fields) {
      if (!QA_FIELD_TYPES.includes(field.fieldType)) errors.push(`Unsupported field type: ${field.fieldType}`);
      if (!field.label.trim()) errors.push("Every field requires a label.");
      if (ids.has(field.id)) errors.push("Field identities must be unique.");
      ids.add(field.id);
      if (!Number.isInteger(field.minimumPhotos) || field.minimumPhotos < 0 || field.minimumPhotos > 50) errors.push(`${field.label}: minimum photos must be between 0 and 50.`);
      if (field.fieldType === "photo" && field.minimumPhotos < 1) errors.push(`${field.label}: Photo fields need a minimum of at least one photo.`);
      if ((field.fieldType === "single_select" || field.fieldType === "multi_select") && field.options.length === 0) errors.push(`${field.label}: add at least one option.`);
      const optionValues = new Set<string>();
      for (const option of field.options) {
        if (!option.label.trim() || !option.value.trim()) errors.push(`${field.label}: options require a label and value.`);
        if (optionValues.has(option.value)) errors.push(`${field.label}: option values must be unique.`);
        optionValues.add(option.value);
      }
      if (field.fieldType === "measurement") {
        const config = field.configuration as { unit?: unknown; minimum?: number | null; maximum?: number | null; target?: number | null; tolerance?: number | null };
        if (typeof config.unit !== "string" || !config.unit.trim() || config.unit.trim().length > 32) errors.push(`${field.label}: unit must be between 1 and 32 characters.`);
        if (config.minimum != null && config.maximum != null && config.minimum > config.maximum) errors.push(`${field.label}: minimum cannot exceed maximum.`);
        if (config.tolerance != null && config.tolerance < 0) errors.push(`${field.label}: tolerance cannot be negative.`);
        if ((config.target == null) !== (config.tolerance == null)) errors.push(`${field.label}: target and tolerance must be configured together.`);
      }
      if (field.fieldType === "inspection_check") {
        const commentRule = field.configuration.commentRule;
        if (commentRule !== undefined && commentRule !== "optional" && commentRule !== "required" && commentRule !== "required_on_fail") errors.push(`${field.label}: invalid comment rule.`);
        if (field.configuration.holdPointEnabled !== undefined && typeof field.configuration.holdPointEnabled !== "boolean") errors.push(`${field.label}: hold point setting must be true or false.`);
        if (getInspectionPhotoRule(field) !== "optional" && field.minimumPhotos < 1) errors.push(`${field.label}: required photo evidence needs at least one photo.`);
        if (field.photoRequired && field.requirePhotoOnFail) errors.push(`${field.label}: choose either Required or Required on Fail photo evidence.`);
      }
      if (field.fieldType === "product_material") {
        const productMaterial = field.configuration.productMaterial;
        if (!productMaterial || typeof productMaterial !== "object" || Array.isArray(productMaterial)) errors.push(`${field.label}: invalid Product / Material configuration.`);
        else for (const key of ["captureBatchLot", "captureManufacturer", "captureSupplier", "captureProductCode", "suggestMaterials"]) {
          if (typeof (productMaterial as Record<string, unknown>)[key] !== "boolean") errors.push(`${field.label}: invalid Product / Material ${key} setting.`);
        }
      }
    }
  }
  return errors;
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function optionValue(label: string, fallbackId: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallbackId;
}

export function cloneOptions(options: QAFieldOption[]) {
  return options.map((option) => ({ ...option, id: newQAId() }));
}
