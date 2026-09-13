import {
  createQAField,
  createQASection,
  duplicateField,
  duplicateSection,
  moveItem,
} from "@/lib/quality-assurance/definitions/model";
import type {
  QADefinition,
  QAFieldDefinition,
  QAFieldType,
  QASectionDefinition,
} from "@/lib/quality-assurance/definitions/types";

export type QABuilderSelection =
  | { type: "template" }
  | { type: "section"; sectionId: string }
  | { type: "field"; sectionId: string; fieldId: string };

export type MobileBuilderPanel = "toolbox" | "inspector" | null;

export type QABuilderEditResult = {
  definition: QADefinition;
  selection: QABuilderSelection;
};

export function getSelectedSectionId(selection: QABuilderSelection) {
  return selection.type === "template" ? null : selection.sectionId;
}

export function addSectionState(definition: QADefinition): QABuilderEditResult {
  const section = createQASection();
  return {
    definition: { ...definition, sections: [...definition.sections, section] },
    selection: { type: "section", sectionId: section.id },
  };
}

export function updateSectionState(
  definition: QADefinition,
  selection: QABuilderSelection,
  section: QASectionDefinition,
): QABuilderEditResult {
  return {
    definition: {
      ...definition,
      sections: definition.sections.map((candidate) => candidate.id === section.id ? section : candidate),
    },
    selection,
  };
}

export function moveSectionState(
  definition: QADefinition,
  selection: QABuilderSelection,
  sectionIndex: number,
  direction: -1 | 1,
): QABuilderEditResult {
  return {
    definition: { ...definition, sections: moveItem(definition.sections, sectionIndex, direction) },
    selection,
  };
}

export function duplicateSectionState(
  definition: QADefinition,
  sectionIndex: number,
): QABuilderEditResult {
  const section = duplicateSection(definition.sections[sectionIndex]);
  return {
    definition: {
      ...definition,
      sections: [
        ...definition.sections.slice(0, sectionIndex + 1),
        section,
        ...definition.sections.slice(sectionIndex + 1),
      ],
    },
    selection: { type: "section", sectionId: section.id },
  };
}

export function deleteSectionState(
  definition: QADefinition,
  selection: QABuilderSelection,
  sectionIndex: number,
): QABuilderEditResult {
  const deleted = definition.sections[sectionIndex];
  const sections = definition.sections.filter((section) => section.id !== deleted.id);
  const deletedWasSelected = selection.type !== "template" && selection.sectionId === deleted.id;
  const nextSection = sections[Math.min(sectionIndex, sections.length - 1)];

  return {
    definition: { ...definition, sections },
    selection: deletedWasSelected
      ? nextSection
        ? { type: "section", sectionId: nextSection.id }
        : { type: "template" }
      : selection,
  };
}

function appendField(
  definition: QADefinition,
  sectionId: string,
  fieldType: QAFieldType,
  label: string,
): QABuilderEditResult | null {
  if (!definition.sections.some((section) => section.id === sectionId)) return null;
  const field = createQAField(fieldType, label);
  return {
    definition: {
      ...definition,
      sections: definition.sections.map((section) => section.id === sectionId
        ? { ...section, fields: [...section.fields, field] }
        : section),
    },
    selection: { type: "field", sectionId, fieldId: field.id },
  };
}

export function addFieldToSectionState(
  definition: QADefinition,
  sectionId: string,
  fieldType: QAFieldType,
  label: string,
) {
  return appendField(definition, sectionId, fieldType, label);
}

export function addFieldFromToolboxState(
  definition: QADefinition,
  selection: QABuilderSelection,
  fieldType: QAFieldType,
  label: string,
): QABuilderEditResult | null {
  const selectedSectionId = getSelectedSectionId(selection);
  if (selectedSectionId) return appendField(definition, selectedSectionId, fieldType, label);
  if (definition.sections.length > 0) return null;

  const section = createQASection();
  const field = createQAField(fieldType, label);
  section.fields = [field];
  return {
    definition: { ...definition, sections: [section] },
    selection: { type: "field", sectionId: section.id, fieldId: field.id },
  };
}

export function updateFieldState(
  definition: QADefinition,
  selection: QABuilderSelection,
  sectionId: string,
  field: QAFieldDefinition,
): QABuilderEditResult {
  return {
    definition: {
      ...definition,
      sections: definition.sections.map((section) => section.id === sectionId
        ? { ...section, fields: section.fields.map((candidate) => candidate.id === field.id ? field : candidate) }
        : section),
    },
    selection,
  };
}

export function moveFieldState(
  definition: QADefinition,
  selection: QABuilderSelection,
  sectionId: string,
  fieldIndex: number,
  direction: -1 | 1,
): QABuilderEditResult {
  return {
    definition: {
      ...definition,
      sections: definition.sections.map((section) => section.id === sectionId
        ? { ...section, fields: moveItem(section.fields, fieldIndex, direction) }
        : section),
    },
    selection,
  };
}

export function reorderFieldState(
  definition: QADefinition,
  selection: QABuilderSelection,
  sectionId: string,
  fromIndex: number,
  toIndex: number,
): QABuilderEditResult {
  if (fromIndex === toIndex) return { definition, selection };
  return {
    definition: {
      ...definition,
      sections: definition.sections.map((section) => {
        if (section.id !== sectionId || fromIndex < 0 || toIndex < 0 || fromIndex >= section.fields.length || toIndex >= section.fields.length) return section;
        const fields = [...section.fields];
        const [field] = fields.splice(fromIndex, 1);
        fields.splice(toIndex, 0, field);
        return { ...section, fields };
      }),
    },
    selection,
  };
}

export function duplicateFieldState(
  definition: QADefinition,
  sectionId: string,
  fieldIndex: number,
): QABuilderEditResult {
  const source = definition.sections.find((section) => section.id === sectionId)?.fields[fieldIndex];
  if (!source) return { definition, selection: { type: "section", sectionId } };
  const field = duplicateField(source);
  return {
    definition: {
      ...definition,
      sections: definition.sections.map((section) => section.id === sectionId
        ? {
            ...section,
            fields: [
              ...section.fields.slice(0, fieldIndex + 1),
              field,
              ...section.fields.slice(fieldIndex + 1),
            ],
          }
        : section),
    },
    selection: { type: "field", sectionId, fieldId: field.id },
  };
}

export function deleteFieldState(
  definition: QADefinition,
  selection: QABuilderSelection,
  sectionId: string,
  fieldId: string,
): QABuilderEditResult {
  const deletedWasSelected = selection.type === "field" && selection.fieldId === fieldId;
  return {
    definition: {
      ...definition,
      sections: definition.sections.map((section) => section.id === sectionId
        ? { ...section, fields: section.fields.filter((field) => field.id !== fieldId) }
        : section),
    },
    selection: deletedWasSelected ? { type: "section", sectionId } : selection,
  };
}
