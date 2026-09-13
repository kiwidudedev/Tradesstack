"use client";

import { Plus } from "lucide-react";
import { QA_FIELD_LIBRARY, type QAFieldType } from "@/lib/quality-assurance/definitions/types";

export function QAComponentToolbox({
  canWrite,
  canInsert,
  onAddField,
}: {
  canWrite: boolean;
  canInsert: boolean;
  onAddField: (fieldType: QAFieldType, label: string) => void;
}) {
  const disabled = !canWrite || !canInsert;
  const helper = !canWrite
    ? "You have read-only access."
    : !canInsert
      ? "Select a section to add fields."
      : "Add a field to the selected section.";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
      <div className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Fields</h2>
        <p id="qa-toolbox-helper" className="mt-0.5 text-xs text-[var(--text-secondary)]">{helper}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-gutter:stable]">
        <div className="space-y-5">
          {QA_FIELD_LIBRARY.map((group) => (
            <section key={group.category} aria-labelledby={`qa-toolbox-${group.category.toLowerCase()}`}>
              <h3 id={`qa-toolbox-${group.category.toLowerCase()}`} className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {group.category}
              </h3>
              <div className="space-y-1">
                {group.types.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    disabled={disabled}
                    aria-describedby="qa-toolbox-helper"
                    onClick={() => onAddField(item.type, item.label)}
                    className="flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-left text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]" aria-hidden="true">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
