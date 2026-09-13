"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuilderQAFieldRenderer } from "@/components/app/quality-assurance/presentation/BuilderQAFieldRenderer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QAFieldDefinition } from "@/lib/quality-assurance/definitions/types";

export const QAFieldCard = memo(function QAFieldCard({
  field,
  fieldIndex,
  fieldCount,
  selected,
  canWrite,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
}: {
  field: QAFieldDefinition;
  fieldIndex: number;
  fieldCount: number;
  selected: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id, disabled: !canWrite });
  return (
    <article
      ref={setNodeRef}
      data-qa-field-id={field.id}
      className="group relative w-full"
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined, opacity: isDragging ? 0.72 : undefined }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        aria-pressed={selected}
        aria-label={`Select field: ${field.label || "Untitled field"}. Drag to reorder.`}
        data-qa-select-target="field"
        onClick={onSelect}
        className="absolute inset-0 z-10 cursor-grab rounded-[var(--radius-lg)] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
        {...listeners}
      />
      <div className="pointer-events-none"><BuilderQAFieldRenderer field={field} fieldNumber={fieldIndex + 1} selected={selected} /></div>
      <div className="absolute right-2 top-2 z-20 flex shrink-0 items-start rounded-[var(--radius-md)] bg-[var(--surface)] shadow-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" disabled={!canWrite} aria-label={`Actions for ${field.label || "untitled field"}`} className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={fieldIndex === 0} onSelect={() => onMove(-1)}>Move up</DropdownMenuItem>
            <DropdownMenuItem disabled={fieldIndex === fieldCount - 1} onSelect={() => onMove(1)}>Move down</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[var(--error)]" onSelect={onDelete}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
});
