"use client";

import { useEffect, useRef } from "react";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WorksheetSidePanel,
  WorksheetSidePanelBody,
  WorksheetSidePanelFooter,
  WorksheetSidePanelHeader,
} from "@/components/app/WorksheetSidePanel";
import { toDayMonthYearLabel, type ScopeCostCategoryItem } from "@/lib/quote-editor-core";

export function ScopeImportDrawer({
  isLoading,
  items,
  selectedIds,
  onToggleItem,
  onAddSelected,
  onClose,
}: {
  isLoading: boolean;
  items: ScopeCostCategoryItem[];
  selectedIds: string[];
  onToggleItem: (itemId: string) => void;
  onAddSelected: () => void;
  onClose: () => void;
}) {
  const bodyFocusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bodyFocusRef.current?.focus();
  }, []);

  return (
    <WorksheetSidePanel
      ariaLabel="Import Scope Items"
      closeLabel="Close Import Scope Items"
      onClose={onClose}
      variant="overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <WorksheetSidePanelHeader
        icon={<ListPlus className="h-4 w-4" strokeWidth={1.75} />}
        title="Import Scope Items"
        description="Import completed Scope Builder items into this quote."
        closeLabel="Close Import Scope Items"
        onClose={onClose}
      />
      <WorksheetSidePanelBody>
        <div
          ref={bodyFocusRef}
          tabIndex={-1}
          aria-label="Completed Scope Builder items"
          className="outline-none"
          data-testid="scope-import-drawer-body"
        >
          {isLoading ? (
            <div aria-live="polite" aria-busy="true" className="rounded-[14px] bg-[var(--surface-muted)] px-4 py-5">
              <p className="text-sm text-[var(--text-secondary)]">Loading Scope Builder items...</p>
            </div>
          ) : items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => onToggleItem(item.id)}
                    className="mt-0.5 h-4 w-4 rounded-[6px] border-[var(--border)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{item.title}</span>
                    {item.description ? (
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">{item.description}</span>
                    ) : null}
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {item.tradeLabel} · {toDayMonthYearLabel(item.generatedAt)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5">
              <p className="text-sm text-[var(--text-secondary)]">No completed Scope Builder items are available for this quote.</p>
            </div>
          )}
        </div>
      </WorksheetSidePanelBody>
      <WorksheetSidePanelFooter>
        <Button
          type="button"
          data-testid="scope-import-add-selected"
          onClick={onAddSelected}
          disabled={selectedIds.length === 0}
        >
          Add Selected ({selectedIds.length})
        </Button>
      </WorksheetSidePanelFooter>
    </WorksheetSidePanel>
  );
}
