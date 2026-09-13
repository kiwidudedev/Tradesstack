import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const builder = readFileSync("components/app/quality-assurance/builder/SharedQABuilder.tsx", "utf8");
const inspector = readFileSync("components/app/quality-assurance/builder/QAFieldInspector.tsx", "utf8");
const workspace = readFileSync("components/app/quality-assurance/builder/QABuilderWorkspace.tsx", "utf8");
const canvas = readFileSync("components/app/quality-assurance/builder/QABuilderCanvas.tsx", "utf8");
const sectionCard = readFileSync("components/app/quality-assurance/builder/QASectionCard.tsx", "utf8");
const fieldCard = readFileSync("components/app/quality-assurance/builder/QAFieldCard.tsx", "utf8");
const contextInspector = readFileSync("components/app/quality-assurance/builder/QAContextInspector.tsx", "utf8");
const toolbox = readFileSync("components/app/quality-assurance/builder/QAComponentToolbox.tsx", "utf8");
const formPresentation = readFileSync("components/app/quality-assurance/presentation/QAFormPresentation.tsx", "utf8");
const builderRenderer = readFileSync("components/app/quality-assurance/presentation/BuilderQAFieldRenderer.tsx", "utf8");
const preview = readFileSync("components/app/quality-assurance/builder/QAPreview.tsx", "utf8");
const previewRenderer = readFileSync("components/app/quality-assurance/presentation/PreviewQAFieldRenderer.tsx", "utf8");
const sidePanel = readFileSync("components/app/WorksheetSidePanel.tsx", "utf8");
const templateEditor = readFileSync("components/app/quality-assurance/templates/QATemplateEditor.tsx", "utf8");
const projectEditor = readFileSync("components/app/quality-assurance/project/ProjectQAEditor.tsx", "utf8");
const projectRegister = readFileSync("components/app/quality-assurance/project/ProjectQARegister.tsx", "utf8");
const legacyTemplates = readFileSync("lib/quality-assurance/constants.ts", "utf8");
const actions = readFileSync("lib/quality-assurance/definitions/actions.ts", "utf8");

describe("QA builder and compatibility contracts", () => {
  it("uses explicit save, preserves failed local state, and protects dirty navigation", () => {
    expect(builder).toContain('setSaveState("saving")');
    expect(builder).toContain("const savedDefinition = { ...normalized, definitionVersion: result.data.version }");
    expect(builder).toContain("setDefinition(savedDefinition)");
    expect(builder).toContain("setSaveError(result.error)");
    expect(builder).toContain('window.addEventListener("beforeunload"');
    expect(builder).toContain('window.addEventListener("popstate"');
    expect(builder).toContain("You have unsaved QA changes");
    expect(actions).toContain("p_expected_version: definition.definitionVersion");
    expect(actions).toContain("p_expected_version:input.definition.definitionVersion");
  });

  it("shows inspection-only settings conditionally and provides accessible field reordering", () => {
    expect(inspector).toContain('const isInspection = field.fieldType === "inspection_check"');
    expect(inspector).toContain("{isInspection ? <>");
    expect(inspector).toContain('title="Comments"');
    expect(inspector).toContain('title="Hold Point"');
    expect(inspector).toContain("<details");
    for (const hidden of ["Create QA issue", "Require rectification", "Require supervisor review", "AI review enabled", "Block completion"]) expect(inspector).not.toContain(hidden);
    expect(sectionCard).toContain("DndContext");
    expect(sectionCard).toContain("sortableKeyboardCoordinates");
    expect(fieldCard).toContain("useSortable");
    expect(fieldCard).toContain("Drag to reorder");
    expect(fieldCard).not.toContain("GripVertical");
    expect(sectionCard).toContain("Move up");
    expect(sectionCard).toContain("Move down");
    expect(fieldCard).toContain("Move up");
    expect(fieldCard).toContain("Move down");
  });

  it("uses the xl three-panel workspace and Sheets below that breakpoint", () => {
    expect(workspace).toContain('w-[240px]');
    expect(contextInspector).toContain('persistentFrom="xl"');
    expect(workspace).toContain('w-[280px]');
    expect(contextInspector).toContain('max-w-[420px]');
    expect(canvas).toContain("QAFormContent");
    expect(formPresentation).toContain("max-w-4xl");
    expect(sidePanel).toContain('persistentFrom = "md"');
  });

  it("uses shared WYSIWYG presentation with static builder controls and stable scroll targets", () => {
    expect(fieldCard).toContain("BuilderQAFieldRenderer");
    expect(fieldCard).toContain("data-qa-field-id");
    expect(sectionCard).toContain("data-qa-section-id");
    expect(canvas).toContain("scrollIntoView");
    expect(builderRenderer).not.toMatch(/<Input|<Textarea|<Select|<Checkbox|<Button/);
    for (const type of ["short_text", "long_text", "number", "measurement", "date", "yes_no", "single_select", "multi_select", "checkbox", "inspection_check", "photo", "file", "person", "location", "product_material", "signature"]) expect(builderRenderer).toContain(`case "${type}"`);
  });

  it("keeps Preview ephemeral and isolated from QA execution", () => {
    expect(preview).toContain("Preview only — responses are not saved.");
    expect(preview).toContain('width: "min(100vw, 56rem)"');
    expect(preview).toContain("setValues({})");
    expect(preview).toContain("PreviewQAFieldRenderer");
    expect(previewRenderer).toContain("QAFieldPresentation");
    expect(`${preview}\n${previewRenderer}`).not.toMatch(/saveProjectQAResponseAction|completeProjectQARunAction|QARunResponse|lockVersion/);
  });

  it("keeps all read-only mutation surfaces disabled", () => {
    expect(toolbox).toContain("disabled={disabled}");
    expect(canvas).toContain("disabled={!canWrite}");
    expect(sectionCard).toContain("disabled={!canWrite}");
    expect(inspector).toContain("if (!canWrite) return");
    expect(inspector).toContain("disabled={!canWrite}");
    expect(contextInspector).toContain("if (!canWrite) return");
  });

  it("supports template, section, and field inspector modes without persisting selection", () => {
    expect(builder).toContain('useState<QABuilderSelection>({ type: "template" })');
    expect(contextInspector).toContain('selection.type === "field"');
    expect(contextInspector).toContain('selection.type === "section"');
    expect(contextInspector).toContain("TemplateInspector");
    expect(builder).not.toMatch(/onSave\([^)]*selection|normalizeDefinition\([^)]*selection/);
  });

  it("keeps the existing operational QA board accessible and legacy templates isolated", () => {
    expect(projectRegister).toContain("ProjectQualityAssuranceBoard");
    expect(projectRegister).toContain("Existing QA Activity");
    expect(legacyTemplates).toContain("Framing Inspection");
    expect(builder).not.toMatch(/Framing Inspection|Waterproofing Inspection|Pre-Pour Checklist/);
    expect(templateEditor).toContain("SharedQABuilder");
    expect(projectEditor).toContain("SharedQABuilder");
  });
});
