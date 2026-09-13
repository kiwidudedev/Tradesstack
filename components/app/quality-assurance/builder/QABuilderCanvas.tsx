"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QAFormContent, QAFormIdentity } from "@/components/app/quality-assurance/presentation/QAFormPresentation";
import { cn } from "@/lib/utils";
import type { QADefinition, QAFieldType } from "@/lib/quality-assurance/definitions/types";
import type { QABuilderSelection } from "./builder-state";
import { QASectionCard } from "./QASectionCard";

export type QABuilderScrollTarget = { kind: "section" | "field"; id: string; requestId: number; focusSelection: boolean };

export function QABuilderCanvas({
  definition,
  selection,
  canWrite,
  onSelectTemplate,
  onSelectSection,
  onSelectField,
  onAddSection,
  onMoveSection,
  onDuplicateSection,
  onDeleteSection,
  onAddField,
  onMoveField,
  onReorderField,
  onDuplicateField,
  onDeleteField,
  scrollTarget,
  onScrollHandled,
}: {
  definition: QADefinition;
  selection: QABuilderSelection;
  canWrite: boolean;
  onSelectTemplate: () => void;
  onSelectSection: (sectionId: string) => void;
  onSelectField: (sectionId: string, fieldId: string) => void;
  onAddSection: () => void;
  onMoveSection: (sectionIndex: number, direction: -1 | 1) => void;
  onDuplicateSection: (sectionIndex: number) => void;
  onDeleteSection: (sectionIndex: number) => void;
  onAddField: (sectionId: string, fieldType: QAFieldType, label: string) => void;
  onMoveField: (sectionId: string, fieldIndex: number, direction: -1 | 1) => void;
  onReorderField: (sectionId: string, fromIndex: number, toIndex: number) => void;
  onDuplicateField: (sectionId: string, fieldIndex: number) => void;
  onDeleteField: (sectionId: string, fieldId: string) => void;
  scrollTarget: QABuilderScrollTarget | null;
  onScrollHandled: () => void;
}) {
  const templateSelected = selection.type === "template";
  const canvasRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!scrollTarget || !canvasRef.current) return;
    const attribute = scrollTarget.kind === "field" ? "data-qa-field-id" : "data-qa-section-id";
    const target = canvasRef.current.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(scrollTarget.id)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (scrollTarget.focusSelection) target.querySelector<HTMLElement>("[data-qa-select-target]")?.focus({ preventScroll: true });
    onScrollHandled();
  }, [onScrollHandled, scrollTarget]);

  return (
    <main ref={canvasRef} className="min-w-0 flex-1 overflow-y-auto bg-[var(--surface-muted)] p-4 sm:p-6 lg:p-8 [scrollbar-gutter:stable]">
      <QAFormContent className="space-y-8">
        <section className={cn(
          "relative w-full rounded-[var(--radius-lg)] border bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition-colors sm:p-6",
          templateSelected ? "border-[var(--brand-blue)] bg-[var(--info-light)]" : "border-[var(--border)] hover:bg-[var(--surface-subtle)]",
        )}>
        <button
          type="button"
          aria-pressed={templateSelected}
          aria-label={`Select QA definition: ${definition.name || "Untitled QA"}`}
          onClick={onSelectTemplate}
          className="absolute inset-0 z-10 rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
        />
          <div className="pointer-events-none"><QAFormIdentity name={definition.name} description={definition.description} eyebrow="QA definition" sourceText={definition.sourceTemplateName ? `Created from ${definition.sourceTemplateName}` : null} trailing={<Badge variant="secondary" className="capitalize">{definition.status}</Badge>} /></div>
        </section>

        {definition.sections.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
            <p className="font-semibold text-[var(--text-primary)]">No sections yet</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Add a section, then build the customer-owned QA content.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={onAddSection} disabled={!canWrite}><Plus className="h-4 w-4" />Add section</Button>
          </div>
        ) : definition.sections.map((section, sectionIndex) => (
          <QASectionCard
            key={section.id}
            section={section}
            sectionIndex={sectionIndex}
            sectionCount={definition.sections.length}
            selection={selection}
            canWrite={canWrite}
            onSelectSection={onSelectSection}
            onSelectField={onSelectField}
            onMoveSection={onMoveSection}
            onDuplicateSection={onDuplicateSection}
            onDeleteSection={onDeleteSection}
            onAddField={onAddField}
            onMoveField={onMoveField}
            onReorderField={onReorderField}
            onDuplicateField={onDuplicateField}
            onDeleteField={onDeleteField}
          />
        ))}

        {definition.sections.length > 0 ? (
          <div className="flex justify-center pb-3">
            <Button variant="outline" size="sm" onClick={onAddSection} disabled={!canWrite}><Plus className="h-4 w-4" />Add section</Button>
          </div>
        ) : null}
      </QAFormContent>
    </main>
  );
}
