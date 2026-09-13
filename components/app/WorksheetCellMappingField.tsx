"use client";

import type { DragEvent, ReactNode } from "react";
import { MousePointer2, X } from "lucide-react";

export function WorksheetCellMappingField<TField extends string>({
  field,
  label,
  testId,
  mappedCellKey,
  displayValue,
  mappedCellPrefix = "Source",
  manualLabel,
  armed,
  error,
  editingContent,
  trailingAction,
  valueClassName = "truncate tabular-nums font-medium",
  onArm,
  onClear,
  onAssign,
  onHighlight,
}: {
  field: TField;
  label: string;
  testId: string;
  mappedCellKey: string | null;
  displayValue?: string | null;
  mappedCellPrefix?: string;
  manualLabel?: string | null;
  armed: boolean;
  error?: string | null;
  editingContent?: ReactNode;
  trailingAction?: ReactNode;
  valueClassName?: string;
  onArm: (field: TField) => void;
  onClear: (field: TField) => void;
  onAssign?: (field: TField, cellKey: string) => void;
  onHighlight: (field: TField | null) => void;
}) {
  const editing = Boolean(editingContent);
  const mapped = Boolean(mappedCellKey || manualLabel);
  const errorId = `${testId}-error`;
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (editing || !onAssign) return;
    event.preventDefault();
    const cellKey = event.dataTransfer.getData("application/x-tradesstack-worksheet-cell");
    if (cellKey) onAssign(field, cellKey);
  };

  return (
    <div
      data-testid={testId}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onMouseEnter={() => onHighlight(editing ? null : field)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(editing ? null : field)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHighlight(null);
      }}
      onDragOver={(event) => {
        if (!editing && onAssign) event.preventDefault();
      }}
      onDrop={handleDrop}
      className={`group relative min-w-0 transition-colors ${
        error
          ? "bg-[color-mix(in_srgb,var(--error)_5%,white)] ring-1 ring-inset ring-[var(--error)]"
          : armed
            ? "bg-[color-mix(in_srgb,var(--brand-blue)_7%,white)] ring-2 ring-inset ring-[var(--brand-blue)]"
            : "bg-[var(--surface)] hover:bg-[var(--surface-subtle)] focus-within:bg-[var(--surface-subtle)]"
      }`}
    >
      <div className="flex min-h-[68px] items-stretch">
        {editingContent ?? (
          <button
            type="button"
            aria-pressed={armed}
            onClick={() => onArm(field)}
            className="min-w-0 flex-1 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-blue)]"
          >
            <span className="block text-[13px] font-semibold leading-none text-[var(--text-secondary)]">{label}</span>
            {mapped ? (
              <span className="mt-1.5 block min-w-0">
                {displayValue ? <span className={`block min-w-0 text-sm text-[var(--text-primary)] ${valueClassName}`}>{displayValue}</span> : null}
                {mappedCellKey ? (
                  <span aria-label={`${mappedCellPrefix} cell ${mappedCellKey}`} className="mt-1 block font-mono text-[10px] leading-none text-[var(--text-muted)]">{mappedCellPrefix} {mappedCellKey}</span>
                ) : manualLabel ? (
                  <span className="mt-1 block text-[10px] leading-none text-[var(--text-muted)]">{manualLabel}</span>
                ) : null}
              </span>
            ) : (
              <span className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                <MousePointer2 className="h-3.5 w-3.5 shrink-0" />
                {armed ? "Select a cell from worksheet…" : "Select worksheet cell"}
              </span>
            )}
          </button>
        )}
        {trailingAction}
        {mappedCellKey && !editing ? (
          <button type="button" onClick={() => onClear(field)} aria-label={`Clear ${label} mapping`} className="my-auto mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] opacity-70 hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {error ? <p id={errorId} className="border-t border-[color-mix(in_srgb,var(--error)_18%,transparent)] px-3 py-1.5 text-xs text-[var(--error)]">{error}</p> : null}
    </div>
  );
}
