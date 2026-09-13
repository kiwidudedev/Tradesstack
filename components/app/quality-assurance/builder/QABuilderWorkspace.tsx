"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { QABuilderMode, QADefinition, QAFieldDefinition, QAFieldType, QASectionDefinition } from "@/lib/quality-assurance/definitions/types";
import type { MobileBuilderPanel, QABuilderSelection } from "./builder-state";
import { QABuilderCanvas } from "./QABuilderCanvas";
import { QAComponentToolbox } from "./QAComponentToolbox";
import { QAContextInspector } from "./QAContextInspector";
import type { QABuilderScrollTarget } from "./QABuilderCanvas";

export function QABuilderWorkspace({
  definition,
  mode,
  selection,
  selectedSection,
  selectedField,
  canWrite,
  isWide,
  mobilePanel,
  onMobilePanelChange,
  onSelectTemplate,
  onSelectSection,
  onSelectField,
  onUpdateTemplate,
  onAddSection,
  onUpdateSection,
  onMoveSection,
  onDuplicateSection,
  onDeleteSection,
  onAddFieldFromToolbox,
  onAddField,
  onUpdateField,
  onMoveField,
  onReorderField,
  onDuplicateField,
  onDeleteField,
  scrollTarget,
  onScrollHandled,
}: {
  definition: QADefinition;
  mode: QABuilderMode;
  selection: QABuilderSelection;
  selectedSection: QASectionDefinition | null;
  selectedField: QAFieldDefinition | null;
  canWrite: boolean;
  isWide: boolean;
  mobilePanel: MobileBuilderPanel;
  onMobilePanelChange: (panel: MobileBuilderPanel) => void;
  onSelectTemplate: () => void;
  onSelectSection: (sectionId: string) => void;
  onSelectField: (sectionId: string, fieldId: string) => void;
  onUpdateTemplate: (definition: QADefinition) => void;
  onAddSection: () => void;
  onUpdateSection: (section: QASectionDefinition) => void;
  onMoveSection: (sectionIndex: number, direction: -1 | 1) => void;
  onDuplicateSection: (sectionIndex: number) => void;
  onDeleteSection: (sectionIndex: number) => void;
  onAddFieldFromToolbox: (fieldType: QAFieldType, label: string) => void;
  onAddField: (sectionId: string, fieldType: QAFieldType, label: string) => void;
  onUpdateField: (field: QAFieldDefinition) => void;
  onMoveField: (sectionId: string, fieldIndex: number, direction: -1 | 1) => void;
  onReorderField: (sectionId: string, fromIndex: number, toIndex: number) => void;
  onDuplicateField: (sectionId: string, fieldIndex: number) => void;
  onDeleteField: (sectionId: string, fieldId: string) => void;
  scrollTarget: QABuilderScrollTarget | null;
  onScrollHandled: () => void;
}) {
  const canInsertFromToolbox = definition.sections.length === 0 || selection.type !== "template";
  const toolbox = <div className="flex h-full min-h-0 flex-col"><QAComponentToolbox canWrite={canWrite} canInsert={canInsertFromToolbox} onAddField={onAddFieldFromToolbox} /></div>;

  return <div className="flex min-h-0 flex-1 overflow-hidden">
    {isWide ? <aside aria-label="QA field library" className="h-full w-[240px] shrink-0 overflow-hidden border-r border-[var(--border)] bg-[var(--surface)]">{toolbox}</aside> : (
      <Sheet open={mobilePanel === "toolbox"} onOpenChange={(open) => onMobilePanelChange(open ? "toolbox" : null)}>
        <SheetContent side="left" className="w-[280px] overflow-hidden p-0">
          <SheetTitle className="sr-only">QA field library</SheetTitle>
          <SheetDescription className="sr-only">Choose a field to add to the selected QA section.</SheetDescription>
          {toolbox}
        </SheetContent>
      </Sheet>
    )}

    <QABuilderCanvas
      definition={definition}
      selection={selection}
      canWrite={canWrite}
      onSelectTemplate={onSelectTemplate}
      onSelectSection={onSelectSection}
      onSelectField={onSelectField}
      onAddSection={onAddSection}
      onMoveSection={onMoveSection}
      onDuplicateSection={onDuplicateSection}
      onDeleteSection={onDeleteSection}
      onAddField={onAddField}
      onMoveField={onMoveField}
      onReorderField={onReorderField}
      onDuplicateField={onDuplicateField}
      onDeleteField={onDeleteField}
      scrollTarget={scrollTarget}
      onScrollHandled={onScrollHandled}
    />

    <QAContextInspector
      definition={definition}
      mode={mode}
      selection={selection}
      section={selectedSection}
      field={selectedField}
      canWrite={canWrite}
      isWide={isWide}
      open={mobilePanel === "inspector"}
      onOpenChange={(open) => onMobilePanelChange(open ? "inspector" : null)}
      onUpdateTemplate={onUpdateTemplate}
      onUpdateSection={onUpdateSection}
      onUpdateField={onUpdateField}
    />
  </div>;
}
