"use client";

import { QuoteDestinationMultiSelect } from "@/components/app/QuoteDestinationMultiSelect";
import type { QuotePublishOption } from "@/lib/commercial-items/quote-destination-adapter";

export function QuoteDestinationSection({
  options,
  mode,
  selectedIds,
  disabled = false,
  onModeChange,
  onSelectedIdsChange,
}: {
  options: QuotePublishOption[];
  mode: "new" | "existing";
  selectedIds: string[];
  disabled?: boolean;
  onModeChange: (mode: "new" | "existing") => void;
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="sr-only">Quote destination mode</legend>
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[13px] text-[var(--text-primary)]">
        <input type="radio" className="h-4 w-4 accent-[var(--brand-blue)]" checked={mode === "new"} disabled={disabled} onChange={() => onModeChange("new")} />
        Create new draft Quote
      </label>
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[13px] text-[var(--text-primary)] has-[:disabled]:cursor-not-allowed has-[:disabled]:text-[var(--text-muted)]">
        <input type="radio" className="h-4 w-4 accent-[var(--brand-blue)]" checked={mode === "existing"} disabled={disabled || options.length === 0} onChange={() => onModeChange("existing")} />
        Append existing draft
      </label>
      {mode === "existing" ? (
        <div className="space-y-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Draft Quotes</span>
          <QuoteDestinationMultiSelect quotes={options} selectedIds={selectedIds} onChange={onSelectedIdsChange} disabled={disabled} />
        </div>
      ) : null}
    </fieldset>
  );
}
