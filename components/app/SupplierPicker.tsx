"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { SupplierReference } from "@tradesstack/suppliers";
import { interMedium } from "@/lib/fonts";

type SupplierPickerProps = {
  suppliers: SupplierReference[];
  searchQuery: string;
  isOpen: boolean;
  onSearchQueryChange: (value: string) => void;
  onOpenChange: (value: boolean) => void;
  onClearSelection: () => void;
  onSelectSupplier: (supplier: SupplierReference) => void;
  onCreateNew: () => void;
  placeholder?: string;
  disabled?: boolean;
};

export function SupplierPicker({
  suppliers,
  searchQuery,
  isOpen,
  onSearchQueryChange,
  onOpenChange,
  onClearSelection,
  onSelectSupplier,
  onCreateNew,
  placeholder = "Search supplier...",
  disabled = false,
}: SupplierPickerProps) {
  return (
    <div className="relative">
      <Input
        value={searchQuery}
        onFocus={() => onOpenChange(true)}
        onBlur={() => {
          window.setTimeout(() => onOpenChange(false), 100);
        }}
        onChange={(event) => {
          onSearchQueryChange(event.target.value);
          onClearSelection();
          onOpenChange(true);
        }}
        disabled={disabled}
        className="h-10 rounded-[6px]"
        placeholder={placeholder}
      />
      {isOpen ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
          {suppliers.length > 0 ? (
            suppliers.map((supplier) => {
              const label = supplier.displayName;
              return (
                <button
                  key={supplier.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectSupplier(supplier);
                    onOpenChange(false);
                  }}
                  className={`${interMedium.className} flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-muted)]`}
                >
                  <span className="truncate">{label}</span>
                  {!supplier.isActive ? (
                    <Badge variant="secondary" className="bg-[var(--surface-muted)] text-[var(--text-secondary)]">
                      Inactive
                    </Badge>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className={`${interMedium.className} px-3 py-2 text-sm text-[var(--text-secondary)]`}>No suppliers found.</p>
          )}
          <div className="border-t border-[var(--border)]">
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onCreateNew();
                onOpenChange(false);
              }}
              className={`${interMedium.className} block w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-muted)]`}
            >
              Add new supplier
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
