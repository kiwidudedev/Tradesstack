"use client";

import { memo } from "react";
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QASectionPresentation } from "@/components/app/quality-assurance/presentation/QASectionPresentation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QA_FIELD_LIBRARY, type QAFieldType, type QASectionDefinition } from "@/lib/quality-assurance/definitions/types";
import type { QABuilderSelection } from "./builder-state";
import { QAFieldCard } from "./QAFieldCard";

export const QASectionCard = memo(function QASectionCard({
  section,
  sectionIndex,
  sectionCount,
  selection,
  canWrite,
  onSelectSection,
  onSelectField,
  onMoveSection,
  onDuplicateSection,
  onDeleteSection,
  onAddField,
  onMoveField,
  onReorderField,
  onDuplicateField,
  onDeleteField,
}: {
  section: QASectionDefinition;
  sectionIndex: number;
  sectionCount: number;
  selection: QABuilderSelection;
  canWrite: boolean;
  onSelectSection: (sectionId: string) => void;
  onSelectField: (sectionId: string, fieldId: string) => void;
  onMoveSection: (sectionIndex: number, direction: -1 | 1) => void;
  onDuplicateSection: (sectionIndex: number) => void;
  onDeleteSection: (sectionIndex: number) => void;
  onAddField: (sectionId: string, fieldType: QAFieldType, label: string) => void;
  onMoveField: (sectionId: string, fieldIndex: number, direction: -1 | 1) => void;
  onReorderField: (sectionId: string, fromIndex: number, toIndex: number) => void;
  onDuplicateField: (sectionId: string, fieldIndex: number) => void;
  onDeleteField: (sectionId: string, fieldId: string) => void;
}) {
  const selected = selection.type === "section" && selection.sectionId === section.id;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const finishFieldDrag = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const fromIndex = section.fields.findIndex((field) => field.id === active.id);
    const toIndex = section.fields.findIndex((field) => field.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) onReorderField(section.id, fromIndex, toIndex);
  };
  const actions = <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" disabled={!canWrite} aria-label={`Actions for ${section.title || "untitled section"}`} className="h-9 w-9">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem disabled={sectionIndex === 0} onSelect={() => onMoveSection(sectionIndex, -1)}>Move up</DropdownMenuItem>
      <DropdownMenuItem disabled={sectionIndex === sectionCount - 1} onSelect={() => onMoveSection(sectionIndex, 1)}>Move down</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onDuplicateSection(sectionIndex)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-[var(--error)]" onSelect={() => onDeleteSection(sectionIndex)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
  return (
    <div data-qa-section-id={section.id} className={cn("rounded-[var(--radius-lg)] p-3 transition-colors sm:p-4", selected && "bg-[var(--info-light)] ring-1 ring-[var(--brand-blue)]")}>
      <QASectionPresentation
        section={section}
        sectionIndex={sectionIndex}
        headerAction={actions}
        headerSelection={
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`Select section: ${section.title || "Untitled section"}`}
          data-qa-select-target="section"
          onClick={() => onSelectSection(section.id)}
          className="absolute inset-0 z-10 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
        />}
      >
        {section.fields.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-4 text-center text-sm text-[var(--text-secondary)]">No fields in this section.</div>
        ) : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishFieldDrag}>
          <SortableContext items={section.fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
            {section.fields.map((field, fieldIndex) => (
              <QAFieldCard
                key={field.id}
                field={field}
                fieldIndex={fieldIndex}
                fieldCount={section.fields.length}
                selected={selection.type === "field" && selection.fieldId === field.id}
                canWrite={canWrite}
                onSelect={() => onSelectField(section.id, field.id)}
                onMove={(direction) => onMoveField(section.id, fieldIndex, direction)}
                onDuplicate={() => onDuplicateField(section.id, fieldIndex)}
                onDelete={() => onDeleteField(section.id, field.id)}
              />
            ))}
          </SortableContext>
        </DndContext>}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!canWrite} className="w-full border-dashed"><Plus className="h-4 w-4" />Add field</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
            {QA_FIELD_LIBRARY.map((group) => (
              <div key={group.category}>
                <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{group.category}</DropdownMenuLabel>
                {group.types.map((item) => <DropdownMenuItem key={item.type} onSelect={() => onAddField(section.id, item.type, item.label)}>{item.label}</DropdownMenuItem>)}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </QASectionPresentation>
    </div>
  );
});
