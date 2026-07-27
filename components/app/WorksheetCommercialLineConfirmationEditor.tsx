"use client";

import { useState, type ReactNode } from "react";

export interface CommercialLineDraft {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  total: string;
}

export function WorksheetSelectedCellsDisclosure({
  sourceRangeLabel,
  selectedValues,
}: {
  sourceRangeLabel: string;
  selectedValues: string[];
}) {
  const [showSelectedCells, setShowSelectedCells] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">Commercial line</p>
        <button
          type="button"
          onClick={() => setShowSelectedCells((current) => !current)}
          className="text-xs font-medium text-[var(--brand-blue)]"
        >
          {showSelectedCells ? "Hide selected cells" : "View selected cells"}
        </button>
      </div>

      {showSelectedCells ? (
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]">
          <p className="font-medium text-[var(--text-primary)]">Selected cells</p>
          <p className="mt-1">{sourceRangeLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedValues.length > 0 ? (
              selectedValues.map((value, index) => (
                <span
                  key={`${value}-${index}`}
                  className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                >
                  {value}
                </span>
              ))
            ) : (
              <span className="text-xs">No visible values were found in this selection.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CommercialLineConfirmationEditor<TLine extends CommercialLineDraft>({
  lines,
  sourceRangeLabel,
  selectedValues,
  onLineChange,
  onAddLine,
  onRemoveLine,
  renderDestination,
  renderLineExtras,
  addAnotherLabel = "Add another line",
  isSubmitting,
}: {
  lines: TLine[];
  sourceRangeLabel: string;
  selectedValues: string[];
  onLineChange: (lineId: string, patch: Partial<TLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
  renderDestination?: ReactNode;
  renderLineExtras?: (line: TLine) => ReactNode;
  addAnotherLabel?: string;
  isSubmitting: boolean;
}) {
  const multipleLines = lines.length > 1;

  return (
    <div className="space-y-6">
      {renderDestination}

      <div className="space-y-3">
        <WorksheetSelectedCellsDisclosure
          sourceRangeLabel={sourceRangeLabel}
          selectedValues={selectedValues}
        />

        <div className="space-y-4">
          {lines.map((line, index) => (
            <article
              key={line.id}
              className="rounded-[16px] border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {multipleLines ? `Commercial line ${index + 1}` : "Commercial line"}
                </p>
                {multipleLines ? (
                  <button
                    type="button"
                    onClick={() => onRemoveLine(line.id)}
                    className="text-xs font-medium text-[var(--text-secondary)]"
                    disabled={isSubmitting}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.8fr))]">
                {[
                  ["Description", "description", "text"],
                  ["Quantity", "quantity", "number"],
                  ["Unit", "unit", "text"],
                  ["Rate", "rate", "number"],
                  ["Total", "total", "number"],
                ].map(([label, field, type]) => {
                  const value = line[field as keyof Pick<
                    CommercialLineDraft,
                    "description" | "quantity" | "unit" | "rate" | "total"
                  >];

                  return (
                    <label key={field} className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {label}
                      </span>
                      <input
                        type={type}
                        value={value}
                        onChange={(event) => onLineChange(line.id, { [field]: event.target.value } as Partial<TLine>)}
                        className="h-10 w-full rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-primary)]"
                      />
                    </label>
                  );
                })}
              </div>

              {renderLineExtras ? renderLineExtras(line) : null}
            </article>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-start">
        <button
          type="button"
          onClick={onAddLine}
          disabled={isSubmitting}
          className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:bg-[var(--surface-muted)]"
        >
          {addAnotherLabel}
        </button>
      </div>
    </div>
  );
}
