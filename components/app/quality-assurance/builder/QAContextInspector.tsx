"use client";

import { Layers3, Settings2, SlidersHorizontal } from "lucide-react";
import { WorksheetSidePanel, WorksheetSidePanelBody, WorksheetSidePanelHeader } from "@/components/app/WorksheetSidePanel";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { QABuilderMode, QADefinition, QAFieldDefinition, QASectionDefinition } from "@/lib/quality-assurance/definitions/types";
import type { QABuilderSelection } from "./builder-state";
import { QAFieldInspector, QAInspectorSection } from "./QAFieldInspector";

const labelClass = "mb-1 block text-[13px] font-semibold text-[var(--text-primary)]";

function TemplateInspector({ definition, mode, canWrite, onChange }: { definition: QADefinition; mode: QABuilderMode; canWrite: boolean; onChange: (definition: QADefinition) => void }) {
  const update = <K extends keyof QADefinition>(key: K, value: QADefinition[K]) => {
    if (!canWrite) return;
    onChange({ ...definition, [key]: value });
  };
  return <div className="px-5"><QAInspectorSection title="Template settings">
    <div><label className={labelClass} htmlFor="qa-template-name">Name</label><Input id="qa-template-name" value={definition.name} disabled={!canWrite} onChange={(event) => update("name", event.target.value)} /></div>
    <div><label className={labelClass} htmlFor="qa-template-description">Description</label><Textarea id="qa-template-description" value={definition.description} disabled={!canWrite} onChange={(event) => update("description", event.target.value)} className="min-h-20" /></div>
    {mode === "company-template" ? <div><label className={labelClass} htmlFor="qa-template-status">Status</label><Select id="qa-template-status" value={definition.status} disabled={!canWrite || definition.status === "archived"} onChange={(event) => update("status", event.target.value as "draft" | "active")}><option value="draft">Draft</option><option value="active">Active</option>{definition.status === "archived" ? <option value="archived">Archived</option> : null}</Select></div> : <div><p className={labelClass}>Status</p><p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-medium">{definition.status === "active" ? "Ready" : definition.status === "draft" ? "Draft" : "Archived"}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Use the builder header to change the Project QA lifecycle.</p></div>}
  </QAInspectorSection></div>;
}

function SectionInspector({ section, canWrite, onChange }: { section: QASectionDefinition; canWrite: boolean; onChange: (section: QASectionDefinition) => void }) {
  const update = <K extends keyof QASectionDefinition>(key: K, value: QASectionDefinition[K]) => {
    if (!canWrite) return;
    onChange({ ...section, [key]: value });
  };
  return <div className="px-5"><QAInspectorSection title="Section settings">
    <div><label className={labelClass} htmlFor="qa-section-title">Title</label><Input id="qa-section-title" value={section.title} disabled={!canWrite} onChange={(event) => update("title", event.target.value)} /></div>
    <div><label className={labelClass} htmlFor="qa-section-description">Description</label><Textarea id="qa-section-description" value={section.description} disabled={!canWrite} onChange={(event) => update("description", event.target.value)} className="min-h-20" /></div>
  </QAInspectorSection></div>;
}

function getInspectorMeta(selection: QABuilderSelection, definition: QADefinition, section: QASectionDefinition | null, field: QAFieldDefinition | null) {
  if (selection.type === "field" && field) return { title: "Field settings", description: field.label || "Untitled field", icon: <SlidersHorizontal className="h-4 w-4" /> };
  if (selection.type === "section" && section) return { title: "Section settings", description: section.title || "Untitled section", icon: <Layers3 className="h-4 w-4" /> };
  return { title: "Template settings", description: definition.name || "Untitled QA", icon: <Settings2 className="h-4 w-4" /> };
}

function InspectorBody({
  definition,
  mode,
  selection,
  section,
  field,
  canWrite,
  onUpdateTemplate,
  onUpdateSection,
  onUpdateField,
}: {
  definition: QADefinition;
  mode: QABuilderMode;
  selection: QABuilderSelection;
  section: QASectionDefinition | null;
  field: QAFieldDefinition | null;
  canWrite: boolean;
  onUpdateTemplate: (definition: QADefinition) => void;
  onUpdateSection: (section: QASectionDefinition) => void;
  onUpdateField: (field: QAFieldDefinition) => void;
}) {
  if (selection.type === "field" && field) return <QAFieldInspector field={field} canWrite={canWrite} onChange={onUpdateField} />;
  if (selection.type === "section" && section) return <SectionInspector section={section} canWrite={canWrite} onChange={onUpdateSection} />;
  return <TemplateInspector definition={definition} mode={mode} canWrite={canWrite} onChange={onUpdateTemplate} />;
}

export function QAContextInspector({
  definition,
  mode,
  selection,
  section,
  field,
  canWrite,
  isWide,
  open,
  onOpenChange,
  onUpdateTemplate,
  onUpdateSection,
  onUpdateField,
}: {
  definition: QADefinition;
  mode: QABuilderMode;
  selection: QABuilderSelection;
  section: QASectionDefinition | null;
  field: QAFieldDefinition | null;
  canWrite: boolean;
  isWide: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateTemplate: (definition: QADefinition) => void;
  onUpdateSection: (section: QASectionDefinition) => void;
  onUpdateField: (field: QAFieldDefinition) => void;
}) {
  const meta = getInspectorMeta(selection, definition, section, field);
  const body = <InspectorBody definition={definition} mode={mode} selection={selection} section={section} field={field} canWrite={canWrite} onUpdateTemplate={onUpdateTemplate} onUpdateSection={onUpdateSection} onUpdateField={onUpdateField} />;

  if (isWide) {
    return <WorksheetSidePanel ariaLabel="QA settings" closeLabel="Close QA settings" onClose={() => undefined} persistentFrom="xl" className="top-0 h-full">
      <WorksheetSidePanelHeader icon={meta.icon} title={meta.title} description={meta.description} closeLabel="Close QA settings" onClose={() => undefined} showClose={false} />
      <WorksheetSidePanelBody className="px-0 py-0">{body}</WorksheetSidePanelBody>
    </WorksheetSidePanel>;
  }

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full max-w-[420px] overflow-hidden p-0 sm:w-[420px]">
      <SheetTitle className="sr-only">{meta.title}</SheetTitle>
      <SheetDescription className="sr-only">Configure the currently selected QA item.</SheetDescription>
      <div className="flex h-full min-h-0 flex-col">
        <WorksheetSidePanelHeader icon={meta.icon} title={meta.title} description={meta.description} closeLabel="Close QA settings" onClose={() => onOpenChange(false)} showClose={false} />
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">{body}</div>
      </div>
    </SheetContent>
  </Sheet>;
}
