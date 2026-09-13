import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QAFieldDefinition } from "@/lib/quality-assurance/definitions/types";
import { QAComponentToolbox } from "./QAComponentToolbox";
import { QAFieldInspector } from "./QAFieldInspector";
import { QASectionCard } from "./QASectionCard";

const inspectionField: QAFieldDefinition = {
  id: "field-1",
  fieldType: "inspection_check",
  label: "Wall framing",
  description: "",
  instructions: "",
  required: true,
  allowNa: true,
  requirement: "Plumb and straight",
  acceptanceCriteria: "",
  referenceText: "",
  photoRequired: true,
  minimumPhotos: 1,
  fileRequired: false,
  requireCommentOnFail: true,
  requirePhotoOnFail: true,
  createIssueOnFail: true,
  requireRectificationOnFail: true,
  blockCompletionOnFail: false,
  requireSupervisorReviewOnFail: false,
  aiReviewEnabled: true,
  aiReviewInstruction: "Check alignment",
  includeInReport: true,
  configuration: {},
  configurationSchemaVersion: 1,
  sortOrder: 0,
  options: [],
};

describe("QA workspace component contracts", () => {
  it("explains and disables toolbox insertion when no section is selected", () => {
    const onAddField = vi.fn();
    const markup = renderToStaticMarkup(<QAComponentToolbox canWrite canInsert={false} onAddField={onAddField} />);
    expect(markup).toContain("Select a section to add fields.");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("aria-describedby=\"qa-toolbox-helper\"");
    expect(onAddField).not.toHaveBeenCalled();
  });

  it("renders every field inspector mutation control disabled for read-only users", () => {
    const onChange = vi.fn();
    const markup = renderToStaticMarkup(<QAFieldInspector field={inspectionField} canWrite={false} onChange={onChange} />);
    expect(markup).toContain(">Required<");
    expect(markup).toContain("Photo evidence");
    expect(markup).toContain("Required on Fail");
    expect(markup).toContain("Hold Point");
    expect(markup).not.toContain("AI review enabled");
    expect(markup).toMatch(/id="qa-field-label"[^>]*disabled=""/);
    expect(markup).toMatch(/role="switch"[^>]*disabled=""[^>]*aria-label="Required"/);
    expect(markup).toMatch(/type="radio"[^>]*disabled=""/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("makes the full field card the keyboard-accessible drag surface without a grip icon", () => {
    const markup = renderToStaticMarkup(<QASectionCard
      section={{ id: "section-1", title: "Checklist", description: "", sortOrder: 0, fields: [inspectionField] }}
      sectionIndex={0}
      sectionCount={1}
      selection={{ type: "section", sectionId: "section-1" }}
      canWrite
      onSelectSection={vi.fn()}
      onSelectField={vi.fn()}
      onMoveSection={vi.fn()}
      onDuplicateSection={vi.fn()}
      onDeleteSection={vi.fn()}
      onAddField={vi.fn()}
      onMoveField={vi.fn()}
      onReorderField={vi.fn()}
      onDuplicateField={vi.fn()}
      onDeleteField={vi.fn()}
    />);
    expect(markup).toContain('aria-label="Select field: Wall framing. Drag to reorder."');
    expect(markup).toContain('aria-roledescription="sortable"');
    expect(markup).not.toContain("lucide-grip-vertical");
  });
});
