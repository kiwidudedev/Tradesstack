"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getSupplierDisplayName, type OrganizationSupplierRow } from "@/lib/suppliers";
import { interMedium } from "@/lib/fonts";

type SupplierPickerProps = {
  suppliers: OrganizationSupplierRow[];
  searchQuery: string;
  isOpen: boolean;
  onSearchQueryChange: (value: string) => void;
  onOpenChange: (value: boolean) => void;
  onClearSelection: () => void;
  onSelectSupplier: (supplier: OrganizationSupplierRow) => void;
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
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-[8px] border border-[#d1d9e6] bg-white shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
          {suppliers.length > 0 ? (
            suppliers.map((supplier) => {
              const label = getSupplierDisplayName(supplier);
              return (
                <button
                  key={supplier.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectSupplier(supplier);
                    onOpenChange(false);
                  }}
                  className={`${interMedium.className} flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[#1d2433] hover:bg-[#F8FAFC]`}
                >
                  <span className="truncate">{label}</span>
                  {!supplier.is_active ? (
                    <Badge variant="secondary" className="bg-[#F1F5F9] text-[#64748B]">
                      Inactive
                    </Badge>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className={`${interMedium.className} px-3 py-2 text-sm text-[#64748B]`}>No suppliers found.</p>
          )}
          <div className="border-t border-[#e7edf5]">
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onCreateNew();
                onOpenChange(false);
              }}
              className={`${interMedium.className} block w-full px-3 py-2 text-left text-sm text-[#1d2433] hover:bg-[#F8FAFC]`}
            >
              Add new supplier
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
