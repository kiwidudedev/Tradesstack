"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDollarSign,
  History,
  Layers3,
  MoreHorizontal,
  Package2,
  Pencil,
  Plus,
  Ruler,
  Search,
  Star,
  TrendingUp,
  Upload,
  UploadCloud,
  Users,
} from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { AddSupplierDialog } from "@/components/app/AddSupplierDialog";
import {
  CommercialSummaryCard,
  CommercialSummaryRow,
} from "@/components/app/CommercialLineItemsTable";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { FormLabel } from "@/components/app/FormLabel";
import {
  OperationalKpiCard,
  operationalKpiToneClassName,
  type OperationalKpiTone,
} from "@/components/app/OperationalKpiCard";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { OperationalToolbar } from "@/components/app/OperationalToolbar";
import uploaderStyles from "@/components/app/SupplierInvoiceDocumentUploader.module.css";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ibmPlexSans } from "@/lib/fonts";
import {
  deriveComparableMaterialPrice,
  resolveEffectiveConversionRows,
  resolveSupplierPriceComparisonAt,
} from "@/lib/materials/effective-price";
import {
  formatMaterialDate,
  formatMaterialMoney,
} from "@/lib/materials/normalization";
import type { SourceTaxBasis } from "@/lib/tax/types";
import {
  routePriceTaxReview,
  type PriceTaxEvidenceIntent,
  type PriceTaxReviewRoute,
} from "@/lib/tax/price-review-state";
import {
  materialConversionUnitsEqual,
  normalizeMaterialConversionUnit,
} from "@/lib/materials/unit-conversion/normalize-unit";
import {
  materialImportFailureCopy,
  type MaterialImportProcessingState,
} from "@/lib/materials/import-processing";
import { getSupplierDisplayName, type OrganizationSupplierRow } from "@/lib/suppliers";
import type { MaterialLibraryPageData } from "@/lib/materials/queries";
import type {
  MaterialImportRowAction,
  OrganizationMaterialImportBatchRow,
  OrganizationMaterialImportRowRow,
  OrganizationMaterialRow,
  OrganizationMaterialSupplierProductLifecycleEventRow,
} from "@/lib/materials/types";
import type {
  MaterialDraftInput,
  MaterialImportReviewDraft,
  MaterialSupplierPriceDraftInput,
} from "@/lib/materials/validation";
import { cn } from "@/lib/utils";
import {
  addMaterialSupplierPriceAction,
  archiveMaterialAction,
  archiveMaterialSupplierProductAction,
  confirmMaterialSupplierPriceTaxEvidenceAction,
  confirmMaterialSupplierPriceTaxEvidenceForwardAction,
  createMaterialWithInitialSupplierPriceAction,
  makeMaterialSupplierPricePreferredAction,
  moveMaterialSupplierProductAction,
  restoreMaterialSupplierProductAction,
  updateMaterialAction,
} from "./actions";
import {
  MATERIAL_IMPORT_ACCEPT,
  filterMaterialImportSuppliers,
  materialImportUploadStatus,
  moveMaterialImportSupplierActiveIndex,
  validateMaterialImportUploadFile,
} from "./material-import-upload";
import {
  MaterialImportReviewPanel,
  materialImportTaxBasisLabel,
  type MaterialImportPriceOption,
  type MaterialImportReviewRowState,
} from "./MaterialImportReviewPanel";

type CompanyMaterialsWorkspaceProps = {
  organizationId: string;
  canWrite: boolean;
  canCreateSupplier: boolean;
  initialData: MaterialLibraryPageData;
};

type MaterialStatusFilter = "Active" | "All" | "Preferred" | "Recently Updated" | "Archived";

type MaterialFormState = {
  name: string;
  description: string;
  defaultUnit: string;
  category: string;
  organizationCostCodeId: string;
  isActive: boolean;
};

type SupplierPriceFormState = {
  supplierProductId: string;
  supplierId: string;
  supplierDescription: string;
  unit: string;
  unitCost: string;
  currency: string;
  isPreferred: boolean;
  sourceTaxBasis: SourceTaxBasis;
  sourceTaxRate: number | null;
  taxEvidenceIntent: PriceTaxEvidenceIntent | "";
  incompleteTaxReason: string;
  correctionEffectiveFrom: string;
  correctionReason: string;
  previousSupplierPriceId: string;
};

type SupplierPriceModalMode = "create" | "update" | "confirm_tax_simple" | "confirm_tax_advanced";

function isReviewableTaxStatus(status: string | undefined) {
  return status === "unknown_tax_basis"
    || status === "missing_tax_policy"
    || status === "unsupported_tax_jurisdiction"
    || status === "tax_rate_conflict";
}

const SUPPLIER_PRODUCT_ARCHIVE_REASONS = [
  "Incorrect Material match",
  "No longer supplied",
  "Duplicate supplier item",
  "Superseded supplier item",
  "Other",
] as const;

type AddMaterialFormState = {
  name: string;
  supplierId: string;
  unit: string;
  unitCost: string;
  isPreferred: boolean;
  sourceTaxBasis: SourceTaxBasis;
  taxEvidenceIntent: PriceTaxEvidenceIntent | "";
  incompleteTaxReason: string;
};

const FIELD_SELECT_CLASS =
  "h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const ADD_MATERIAL_INPUT_CLASS = `${ibmPlexSans.className} h-11 rounded-[0.6rem] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] focus-visible:ring-[var(--primary)]`;
const ADD_MATERIAL_SELECT_CLASS = `${ibmPlexSans.className} h-11 w-full appearance-none rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50`;
const FIELD_TEXTAREA_CLASS =
  "flex min-h-[96px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function currentLocalDateTime() {
  const date = new Date(Date.now() - 5_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const EMPTY_MATERIAL_FORM: MaterialFormState = {
  name: "",
  description: "",
  defaultUnit: "",
  category: "",
  organizationCostCodeId: "",
  isActive: true,
};

function emptyPriceForm(currency: string): SupplierPriceFormState {
  return {
    supplierProductId: "",
    supplierId: "",
    supplierDescription: "",
    unit: "",
    unitCost: "",
    currency,
    isPreferred: true,
    sourceTaxBasis: "unknown",
    sourceTaxRate: null,
    taxEvidenceIntent: "",
    incompleteTaxReason: "",
    correctionEffectiveFrom: "",
    correctionReason: "",
    previousSupplierPriceId: "",
  };
}

const EMPTY_ADD_MATERIAL_FORM: AddMaterialFormState = {
  name: "",
  supplierId: "",
  unit: "",
  unitCost: "",
  isPreferred: true,
  sourceTaxBasis: "unknown",
  taxEvidenceIntent: "",
  incompleteTaxReason: "",
};

function MaterialImportUploadZone({
  file,
  disabled,
  onSelectFile,
  onValidationError,
}: {
  file: File | null;
  disabled: boolean;
  onSelectFile: (file: File) => void;
  onValidationError: (message: string) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  function openPicker() {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  function selectFile(nextFile: File | null | undefined) {
    if (!nextFile || disabled) {
      return;
    }

    const validationError = validateMaterialImportUploadFile(nextFile);
    if (validationError) {
      onValidationError(validationError);
      return;
    }

    onSelectFile(nextFile);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragActive(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!disabled && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openPicker();
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={MATERIAL_IMPORT_ACCEPT}
        className="sr-only"
        aria-label="Choose a supplier price list"
        disabled={disabled}
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={file ? `Replace selected supplier price list, ${file.name}` : "Upload a supplier price list"}
        aria-disabled={disabled}
        className={[
          uploaderStyles.dropZone,
          isDragActive ? uploaderStyles.active : "",
          disabled ? uploaderStyles.disabled : "",
          "min-h-[260px] flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange-primary)] focus-visible:ring-offset-2",
        ].join(" ")}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex max-w-[680px] flex-col items-center justify-center gap-5 py-8">
          <span className={uploaderStyles.icon}>
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <p className="text-xl font-semibold text-[var(--text-primary)]">
              Drop a supplier price list here
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              CSV, Excel, PDF or image · Maximum 25 MB · One file
            </p>
          </div>
          <Button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openPicker();
            }}
            disabled={disabled}
          >
            {file ? "Replace File" : "Choose File"}
          </Button>
          <p className="max-w-full text-xs text-[var(--text-muted)]" aria-live="polite">
            {file ? (
              <span className="block max-w-full truncate font-medium text-[var(--text-primary)]" title={file.name}>
                Selected: {file.name}
              </span>
            ) : (
              "No file selected"
            )}
          </p>
        </div>
      </div>
    </>
  );
}

function ImportSupplierCombobox({
  id,
  suppliers,
  selectedSupplierId,
  disabled,
  onSelect,
}: {
  id: string;
  suppliers: OrganizationSupplierRow[];
  selectedSupplierId: string;
  disabled: boolean;
  onSelect: (supplierId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId);
  const selectedSupplierName = selectedSupplier ? getSupplierDisplayName(selectedSupplier) : "";
  const [query, setQuery] = useState(selectedSupplierName);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = `${id}-options`;
  const filteredSuppliers = useMemo(() => {
    const matches = filterMaterialImportSuppliers(suppliers, query);
    if (query.trim() || !selectedSupplier) return matches;
    return [selectedSupplier, ...matches.filter((supplier) => supplier.id !== selectedSupplier.id)];
  }, [query, selectedSupplier, suppliers]);
  const activeSupplier = filteredSuppliers[activeIndex] ?? null;

  function openSearch() {
    if (disabled || open) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function closeSearch() {
    setOpen(false);
    setQuery(selectedSupplierName);
    setActiveIndex(0);
  }

  function selectSupplier(supplier: OrganizationSupplierRow) {
    onSelect(supplier.id);
    setQuery(getSupplierDisplayName(supplier));
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) closeSearch();
      }}
    >
      <Input
        id={id}
        value={query}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeSupplier ? `${id}-option-${activeSupplier.id}` : undefined}
        aria-label="Supplier"
        placeholder="Search suppliers..."
        autoComplete="off"
        disabled={disabled}
        className="pr-11"
        data-testid="material-import-supplier-combobox"
        onFocus={openSearch}
        onClick={openSearch}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              openSearch();
              return;
            }
            setActiveIndex((current) => moveMaterialImportSupplierActiveIndex(current, filteredSuppliers.length, "next"));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              openSearch();
              return;
            }
            setActiveIndex((current) => moveMaterialImportSupplierActiveIndex(current, filteredSuppliers.length, "previous"));
          } else if (event.key === "Enter" && open && activeSupplier) {
            event.preventDefault();
            selectSupplier(activeSupplier);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            closeSearch();
          }
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close suppliers" : "Show suppliers"}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--text-primary)] disabled:opacity-50"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => open ? closeSearch() : openSearch()}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Suppliers"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
        >
          {filteredSuppliers.length > 0 ? filteredSuppliers.map((supplier, optionIndex) => (
            <button
              key={supplier.id}
              id={`${id}-option-${supplier.id}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={supplier.id === selectedSupplierId}
              className={`flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--text-primary)] ${
                optionIndex === activeIndex ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]"
              }`}
              onMouseEnter={() => setActiveIndex(optionIndex)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSupplier(supplier)}
            >
              <span className="min-w-0 truncate">{getSupplierDisplayName(supplier) || "Unknown supplier"}</span>
              {supplier.id === selectedSupplierId ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            </button>
          )) : (
            <p className="px-3 py-3 text-center text-sm text-[var(--text-secondary)]">No suppliers found</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MaterialMoveCombobox({
  materials,
  excludedMaterialId,
  selectedMaterialId,
  disabled,
  onSelect,
}: {
  materials: OrganizationMaterialRow[];
  excludedMaterialId: string;
  selectedMaterialId: string;
  disabled: boolean;
  onSelect: (materialId: string) => void;
}) {
  const options = useMemo(
    () => materials.filter((material) => material.id !== excludedMaterialId && material.is_active && !material.archived_at),
    [excludedMaterialId, materials],
  );
  const selectedName = options.find((material) => material.id === selectedMaterialId)?.name ?? "";
  const [query, setQuery] = useState(selectedName);
  const listId = useId();
  return (
    <div>
      <Input
        type="search"
        list={listId}
        value={query}
        placeholder="Search Materials..."
        disabled={disabled}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          const exact = options.find((material) => material.name.toLowerCase() === nextQuery.trim().toLowerCase());
          onSelect(exact?.id ?? "");
        }}
      />
      <datalist id={listId}>
        {options.map((material) => <option key={material.id} value={material.name} />)}
      </datalist>
    </div>
  );
}

function MaterialImportProgress() {
  return (
    <section
      className="flex flex-col items-center justify-center text-center"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        role="progressbar"
        aria-label="Supplier price list interpretation progress"
        aria-valuetext="Interpreting Supplier Price List"
        data-testid="material-import-processing-ring"
        className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24"
      >
        <span
          className="absolute inset-0 rounded-full border-[8px] border-[var(--orange-soft)]"
          aria-hidden="true"
        />
        <span
          className="absolute inset-0 animate-spin rounded-full border-[8px] border-solid motion-reduce:animate-none"
          style={{
            borderTopColor: "var(--orange-primary)",
            borderRightColor: "var(--orange-primary)",
            borderBottomColor: "transparent",
            borderLeftColor: "transparent",
          }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-7 max-w-lg">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Interpreting Supplier Price List</h3>
      </div>
    </section>
  );
}

function MaterialImportFailure({
  status,
  errorCode,
}: {
  status: string;
  errorCode: string | null;
}) {
  const copy = status === "cancelled"
    ? { title: "Supplier price interpretation was cancelled.", description: "No review rows were created." }
    : materialImportFailureCopy(errorCode);
  return (
    <section className="space-y-4 rounded-[6px] border border-[var(--border)] bg-[var(--surface-muted)] px-5 py-5" role="status">
      <div>
        <h3 className="font-semibold text-[var(--text-primary)]">{copy.title}</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{copy.description}</p>
      </div>
    </section>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
      {children}
    </label>
  );
}

function buildMaterialFormState(material: OrganizationMaterialRow | null): MaterialFormState {
  if (!material) {
    return EMPTY_MATERIAL_FORM;
  }

  return {
    name: material.name,
    description: material.description ?? "",
    defaultUnit: material.default_unit,
    category: material.category ?? "",
    organizationCostCodeId: material.organization_cost_code_id ?? "",
    isActive: material.is_active,
  };
}

function toReviewRowState(
  row: OrganizationMaterialImportRowRow,
  materials: OrganizationMaterialRow[] = [],
  companyCurrency = "NZD",
): MaterialImportReviewRowState {
  const sourcePayload = row.source_payload && typeof row.source_payload === "object" && !Array.isArray(row.source_payload)
    ? row.source_payload as Record<string, unknown>
    : {};
  const rawPrices = Array.isArray(sourcePayload.priceOptions) ? sourcePayload.priceOptions : [];
  const priceOptions = rawPrices.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const price = entry as Record<string, unknown>;
    const amountField = price.amount && typeof price.amount === "object" ? price.amount as Record<string, unknown> : {};
    const labelField = price.label && typeof price.label === "object" ? price.label as Record<string, unknown> : {};
    const effectiveField = price.effectiveFrom && typeof price.effectiveFrom === "object" ? price.effectiveFrom as Record<string, unknown> : {};
    const validToField = price.validTo && typeof price.validTo === "object" ? price.validTo as Record<string, unknown> : {};
    const taxBasisField = price.taxBasis && typeof price.taxBasis === "object" ? price.taxBasis as Record<string, unknown> : {};
    const sourceTaxRateField = price.sourceTaxRate && typeof price.sourceTaxRate === "object" ? price.sourceTaxRate as Record<string, unknown> : {};
    const evidence = Array.isArray(amountField.evidence) ? amountField.evidence[0] as Record<string, unknown> | undefined : undefined;
    if (typeof price.priceKey !== "string") return [];
    return [{
      priceKey: price.priceKey,
      label: typeof labelField.value === "string" ? labelField.value : "Source price",
      amount: typeof amountField.value === "number" ? amountField.value : null,
      currency: companyCurrency,
      evidence: evidence ? [typeof evidence.sourcePartId === "string" ? evidence.sourcePartId : null, typeof evidence.page === "number" ? `Page ${evidence.page}` : null, typeof evidence.sheet === "string" ? evidence.sheet : null, typeof evidence.cellRange === "string" ? evidence.cellRange : null, typeof evidence.excerpt === "string" ? evidence.excerpt : null].filter(Boolean).join(" · ") : "",
      dateLabel: [typeof effectiveField.value === "string" ? `From ${effectiveField.value}` : null, typeof validToField.value === "string" ? `to ${validToField.value}` : null].filter(Boolean).join(" "),
      taxBasis: ["exclusive", "inclusive", "zero_rated", "exempt", "no_tax"].includes(String(taxBasisField.value)) ? taxBasisField.value as MaterialImportPriceOption["taxBasis"] : "unknown",
      sourceTaxRate: typeof sourceTaxRateField.value === "number" ? sourceTaxRateField.value : null,
      taxEvidence: Array.isArray(taxBasisField.evidence) && taxBasisField.evidence[0] && typeof taxBasisField.evidence[0] === "object" ? String((taxBasisField.evidence[0] as Record<string, unknown>).excerpt ?? "") : "",
    }];
  });
  const pack = sourcePayload.pack && typeof sourcePayload.pack === "object" ? sourcePayload.pack as Record<string, unknown> : {};
  const rawWarnings = Array.isArray(sourcePayload.warnings) ? sourcePayload.warnings : [];
  const supplierUnit = row.extracted_unit ?? "";
  const matchedMaterialUnit = materials.find((material) => material.id === row.matched_material_id)?.default_unit;
  const initialPriceKey = typeof sourcePayload.selectedPriceKey === "string" ? sourcePayload.selectedPriceKey : typeof sourcePayload.recommendedPriceKey === "string" ? sourcePayload.recommendedPriceKey : "";
  const initialPrice = priceOptions.find((price) => price.priceKey === initialPriceKey) ?? (priceOptions.length === 1 ? priceOptions[0] : null);
  return {
    id: row.id,
    action: (row.action as MaterialImportRowAction) === "pending" ? "create_material" : (row.action as MaterialImportRowAction),
    matchedMaterialId: row.matched_material_id ?? "",
    reviewedName: row.reviewed_name ?? row.extracted_name ?? "",
    reviewedDescription: row.reviewed_description ?? row.extracted_description ?? "",
    supplierUnit,
    supplierUnitReadOnly: Boolean(row.extracted_unit?.trim()),
    materialUnit: matchedMaterialUnit ?? row.reviewed_unit ?? supplierUnit,
    confirmedUnitConversion: null,
    reviewedUnitCost:
      typeof row.reviewed_unit_cost === "number"
        ? String(row.reviewed_unit_cost)
        : typeof row.extracted_unit_cost === "number"
          ? String(row.extracted_unit_cost)
          : "",
    reviewedCurrency: companyCurrency,
    reviewedTaxBasis: initialPrice?.taxBasis ?? "unknown",
    reviewedSourceTaxRate: initialPrice?.sourceTaxRate ?? null,
    taxEvidence: initialPrice?.taxEvidence ?? "",
    reviewedSupplierDescription:
      row.reviewed_supplier_description ?? row.supplier_description ?? row.extracted_description ?? "",
    reviewedSupplierSku: row.reviewed_supplier_sku ?? row.supplier_sku ?? "",
    status: row.status,
    selectedPriceKey: typeof sourcePayload.selectedPriceKey === "string" ? sourcePayload.selectedPriceKey : "",
    recommendedPriceKey: typeof sourcePayload.recommendedPriceKey === "string" ? sourcePayload.recommendedPriceKey : "",
    priceOptions,
    packLabel: pack.quantity || pack.unit ? `${pack.quantity ?? ""} ${pack.unit ?? ""}`.trim() : "",
    interpretationWarnings: rawWarnings.flatMap((warning) => warning && typeof warning === "object" && !Array.isArray(warning) && typeof (warning as Record<string, unknown>).message === "string" ? [(warning as Record<string, unknown>).message as string] : []),
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    approvalError: null,
    allowDuplicateSourceObservation: false,
    acknowledgeIncompleteTaxEvidence: false,
    incompleteTaxReason: "",
    archivedSupplierProductId: null,
    archivedSupplierProductResolution: null,
    identityVariant: "",
  };
}

function toStatusBadge(status: string) {
  switch (status) {
    case "Active":
      return "active" as const;
    case "Archived":
      return "draft" as const;
    case "approved":
      return "approved" as const;
    case "rejected":
      return "overdue" as const;
    default:
      return "draft" as const;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatConstructionIntelligenceSummary(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const primary = [value.trade, value.subtrade, value.system, value.product]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" / ");
  const activity = [value.activity, value.likely_use]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" · ");

  if (!primary && !activity) {
    return null;
  }

  return activity ? `${primary || "Construction metadata"} · ${activity}` : primary;
}

function materialCostReviewLabel(summary: MaterialLibraryPageData["materialSummaries"][number]) {
  if (summary.effectiveSupplierProducts.some((offering) => offering.comparisonStatus === "unknown_tax_basis")) {
    return "Confirm tax basis";
  }
  if (summary.effectiveSupplierProducts.some((offering) =>
    offering.comparisonStatus === "missing_tax_policy"
    || offering.comparisonStatus === "unsupported_tax_jurisdiction"
    || offering.comparisonStatus === "tax_rate_conflict"
  )) {
    return "Tax review required";
  }
  if (summary.effectiveSupplierProducts.some((offering) => offering.comparisonStatus === "non_comparable")) {
    return "Conversion required";
  }
  return "—";
}

function DrawerField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <div className="text-sm font-medium text-[var(--text-primary)]">{value ?? "—"}</div>
    </div>
  );
}

function formatConversionQuantity(value: number | string) {
  return Number(value).toLocaleString("en-NZ", { maximumFractionDigits: 6 });
}

function formatConfirmedConversion(params: {
  supplierQuantity: number | string;
  supplierUnit: string;
  materialQuantity: number | string;
  materialUnit: string;
}) {
  return `${formatConversionQuantity(params.supplierQuantity)} ${params.supplierUnit} = ${formatConversionQuantity(params.materialQuantity)} ${params.materialUnit}`;
}

function displayMaterialPricingUnit(unit: string) {
  const normalized = normalizeMaterialConversionUnit(unit);
  if (normalized === "m2") return "m²";
  if (normalized === "m3") return "m³";
  return unit;
}

function conversionEvidenceSummary(value: unknown) {
  if (!isRecord(value)) return null;
  return typeof value.evidence_summary === "string" && value.evidence_summary.trim()
    ? value.evidence_summary.trim()
    : null;
}

function MaterialSummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: OperationalKpiTone;
}) {
  return (
    <Card className="min-h-[104px] p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
            operationalKpiToneClassName[tone]
          )}
        >
          {icon}
        </div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      </div>
      <div className="mt-3 break-words text-base font-semibold leading-snug tracking-[-0.01em] text-[var(--text-primary)]">
        {value ?? "—"}
      </div>
    </Card>
  );
}

export function CompanyMaterialsWorkspace({
  organizationId,
  canWrite,
  canCreateSupplier,
  initialData,
}: CompanyMaterialsWorkspaceProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>("Active");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [isCreatingMaterial, setIsCreatingMaterial] = useState(false);
  const [addMaterialForm, setAddMaterialForm] = useState<AddMaterialFormState>(EMPTY_ADD_MATERIAL_FORM);
  const [addMaterialError, setAddMaterialError] = useState<string | null>(null);
  const [materialForm, setMaterialForm] = useState<MaterialFormState>(EMPTY_MATERIAL_FORM);
  const [isAddPriceOpen, setIsAddPriceOpen] = useState(false);
  const [isSavingSupplierPrice, setIsSavingSupplierPrice] = useState(false);
  const [preferredPricePendingId, setPreferredPricePendingId] = useState<string | null>(null);
  const [supplierPriceModalMode, setSupplierPriceModalMode] = useState<SupplierPriceModalMode>("create");
  const [supplierPriceForm, setSupplierPriceForm] = useState<SupplierPriceFormState>(
    () => emptyPriceForm(initialData.companyCurrency),
  );
  const addMaterialOperationIdRef = useRef(crypto.randomUUID());
  const isCreatingMaterialRef = useRef(false);
  const supplierPriceOperationIdRef = useRef(crypto.randomUUID());
  const materialActionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPriceHistoryOpen, setIsPriceHistoryOpen] = useState(false);
  const [historySupplierProductId, setHistorySupplierProductId] = useState<string | null>(null);
  const priceHistoryRef = useRef<HTMLDetailsElement | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState(initialData.suppliers);
  const addSupplierTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [importSupplierId, setImportSupplierId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isUploadingImport, setIsUploadingImport] = useState(false);
  const [isUpdatingImportLifecycle, setIsUpdatingImportLifecycle] = useState(false);
  const [isSubmittingImportReview, setIsSubmittingImportReview] = useState(false);
  const [reviewBatch, setReviewBatch] = useState<OrganizationMaterialImportBatchRow | null>(null);
  const [importProcessing, setImportProcessing] = useState<MaterialImportProcessingState | null>(null);
  const [reviewRows, setReviewRows] = useState<MaterialImportReviewRowState[]>([]);
  const [selectedReviewRowIds, setSelectedReviewRowIds] = useState<string[]>([]);
  const [isEditMaterialOpen, setIsEditMaterialOpen] = useState(false);
  const [isSavingMaterialIdentity, setIsSavingMaterialIdentity] = useState(false);
  const [removeSupplierProductId, setRemoveSupplierProductId] = useState<string | null>(null);
  const [removeSupplierProductReason, setRemoveSupplierProductReason] = useState<string>(SUPPLIER_PRODUCT_ARCHIVE_REASONS[0]);
  const [removeSupplierProductNote, setRemoveSupplierProductNote] = useState("");
  const [restoreSupplierProductId, setRestoreSupplierProductId] = useState<string | null>(null);
  const [moveSupplierProductId, setMoveSupplierProductId] = useState<string | null>(null);
  const [moveTargetMaterialId, setMoveTargetMaterialId] = useState("");
  const [moveSupplierProductReason, setMoveSupplierProductReason] = useState("");
  const [supplierProductLifecyclePending, setSupplierProductLifecyclePending] = useState(false);

  useEffect(() => {
    setSupplierOptions(initialData.suppliers);
  }, [initialData.suppliers]);

  const pollingBatchId = reviewBatch?.id ?? null;
  const pollingBatchStatus = reviewBatch?.status ?? null;

  useEffect(() => {
    if (!pollingBatchId || pollingBatchStatus !== "extracting") return;
    let stopped = false;
    let timer: number | null = null;
    const poll = async (): Promise<void> => {
      let shouldContinue = true;
      try {
        const response = await fetch(`/api/materials/imports/${pollingBatchId}`, { cache: "no-store" });
        const payload = await response.json() as {
          error?: string;
          batch?: OrganizationMaterialImportBatchRow;
          rows?: OrganizationMaterialImportRowRow[];
          processing?: MaterialImportProcessingState;
        };
        if (!response.ok || !payload.batch) throw new Error(payload.error ?? "Unable to refresh import status.");
        if (stopped) return;
        setReviewBatch(payload.batch);
        setImportProcessing(payload.processing ?? null);
        shouldContinue = payload.batch.status === "extracting";
        if (payload.batch.status === "ready_for_review") {
          const nextRows = (payload.rows ?? []).map((row) =>
            toReviewRowState(row, initialData.materials, initialData.companyCurrency)
          );
          setReviewRows(nextRows);
          setSelectedReviewRowIds(nextRows.map((row) => row.id));
          setMessage("Document interpretation complete. Review every selected price before approval.");
        } else if (payload.batch.status === "failed" || payload.batch.status === "cancelled") {
          setError(null);
        }
      } catch (pollError) {
        if (!stopped) setError(pollError instanceof Error ? pollError.message : "Unable to refresh import status.");
      } finally {
        if (!stopped && shouldContinue) {
          timer = window.setTimeout(() => void poll(), 4_000);
        }
      }
    };
    void poll();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [initialData.companyCurrency, initialData.materials, pollingBatchId, pollingBatchStatus]);

  function handleImportSupplierCreated(supplier: OrganizationSupplierRow) {
    setSupplierOptions((current) =>
      [...current.filter((option) => option.id !== supplier.id), supplier].sort((left, right) =>
        getSupplierDisplayName(left).localeCompare(getSupplierDisplayName(right)),
      ),
    );
    setImportSupplierId(supplier.id);
    setError(null);
    setIsAddSupplierOpen(false);
    router.refresh();
  }

  const selectedMaterialSummary = useMemo(
    () =>
      initialData.materialSummaries.find((summary) => summary.material.id === selectedMaterialId) ?? null,
    [initialData.materialSummaries, selectedMaterialId]
  );

  const selectedMaterial = selectedMaterialSummary?.material ?? null;

  useEffect(() => {
    setMaterialForm(buildMaterialFormState(selectedMaterial));
    setIsEditMaterialOpen(false);
    setSupplierPriceForm((current) => ({
      ...emptyPriceForm(initialData.companyCurrency),
      unit: selectedMaterial?.default_unit ?? current.unit,
    }));
  }, [initialData.companyCurrency, selectedMaterial]);

  useEffect(() => {
    setIsPriceHistoryOpen(false);
    setHistorySupplierProductId(null);
    setRemoveSupplierProductId(null);
    setRestoreSupplierProductId(null);
    setMoveSupplierProductId(null);
  }, [selectedMaterialId]);

  const supplierNameById = useMemo(
    () =>
      new Map(
        initialData.suppliers.map((supplier) => [
          supplier.id,
          supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier",
        ])
      ),
    [initialData.suppliers]
  );

  const supplierProductById = useMemo(
    () => new Map(initialData.supplierProducts.map((product) => [product.id, product])),
    [initialData.supplierProducts]
  );

  const effectivePriceIds = useMemo(
    () =>
      new Set(
        initialData.effectiveSupplierProducts.flatMap((offering) =>
          offering.effectivePrice ? [offering.effectivePrice.id] : []
        )
      ),
    [initialData.effectiveSupplierProducts]
  );

  const materialPriceRows = useMemo(
    () =>
      selectedMaterial
        ? initialData.supplierPrices
            .filter((price) => price.material_id === selectedMaterial.id)
            .sort((left, right) => {
              const leftIsEffective = effectivePriceIds.has(left.id);
              const rightIsEffective = effectivePriceIds.has(right.id);
              if (leftIsEffective !== rightIsEffective) {
                return leftIsEffective ? -1 : 1;
              }
              const leftIsPreferred = supplierProductById.get(left.supplier_product_id ?? "")?.is_preferred ?? false;
              const rightIsPreferred = supplierProductById.get(right.supplier_product_id ?? "")?.is_preferred ?? false;
              if (leftIsPreferred !== rightIsPreferred) {
                return leftIsPreferred ? -1 : 1;
              }
              return right.effective_from.localeCompare(left.effective_from);
            })
        : [],
    [effectivePriceIds, initialData.supplierPrices, selectedMaterial, supplierProductById]
  );

  const materialEffectiveSupplierProducts = useMemo(
    () =>
      selectedMaterial
        ? initialData.effectiveSupplierProducts.filter(
            (offering) => offering.supplierProduct.material_id === selectedMaterial.id
          )
        : [],
    [initialData.effectiveSupplierProducts, selectedMaterial]
  );

  const archivedMaterialSupplierProducts = useMemo(
    () => selectedMaterial
      ? initialData.supplierProducts.filter((product) =>
          product.material_id === selectedMaterial.id && (!product.is_active || Boolean(product.archived_at))
        )
      : [],
    [initialData.supplierProducts, selectedMaterial],
  );
  const latestLifecycleEventByProductId = useMemo(() => {
    const events = new Map<string, OrganizationMaterialSupplierProductLifecycleEventRow>();
    for (const event of initialData.supplierProductLifecycleEvents) {
      if (!events.has(event.supplier_product_id)) events.set(event.supplier_product_id, event);
    }
    return events;
  }, [initialData.supplierProductLifecycleEvents]);
  const removeSupplierProduct = removeSupplierProductId
    ? supplierProductById.get(removeSupplierProductId) ?? null
    : null;
  const restoreSupplierProduct = restoreSupplierProductId
    ? supplierProductById.get(restoreSupplierProductId) ?? null
    : null;
  const moveSupplierProduct = moveSupplierProductId
    ? supplierProductById.get(moveSupplierProductId) ?? null
    : null;
  const supplierProductHasPriceHistory = (supplierProductId: string) =>
    initialData.supplierPrices.some((price) => price.supplier_product_id === supplierProductId);

  const supplierPriceModalConversion = useMemo(() => {
    if (!selectedMaterial || !supplierPriceForm.supplierProductId) return null;
    const materialUnit = normalizeMaterialConversionUnit(selectedMaterial.default_unit);
    return resolveEffectiveConversionRows({
      conversions: initialData.unitConversions.filter(
        (conversion) => conversion.supplier_product_id === supplierPriceForm.supplierProductId
      ),
      evaluationTime: initialData.effectivePriceEvaluationTime,
    }).get(`${supplierPriceForm.supplierProductId}|${materialUnit}`) ?? null;
  }, [
    initialData.effectivePriceEvaluationTime,
    initialData.unitConversions,
    selectedMaterial,
    supplierPriceForm.supplierProductId,
  ]);

  const supplierPricePreview = useMemo(() => {
    const sourceUnitCostDraft = supplierPriceForm.unitCost.trim();
    const sourceUnitCost = Number(sourceUnitCostDraft);
    if (
      supplierPriceModalMode === "create"
      || !selectedMaterial
      || !sourceUnitCostDraft
      || !Number.isFinite(sourceUnitCost)
      || sourceUnitCost < 0
    ) {
      return null;
    }
    return deriveComparableMaterialPrice({
      sourceUnitCost,
      sourceUnit: supplierPriceForm.unit,
      materialUnit: selectedMaterial.default_unit,
      effectiveConversion: supplierPriceModalConversion,
      sourceTaxBasis: supplierPriceForm.sourceTaxBasis,
      sourceTaxRate: supplierPriceForm.sourceTaxRate,
      taxPolicy: initialData.taxPolicy,
    });
  }, [
    selectedMaterial,
    supplierPriceForm.unit,
    supplierPriceForm.unitCost,
    supplierPriceForm.sourceTaxBasis,
    supplierPriceForm.sourceTaxRate,
    supplierPriceModalMode,
    supplierPriceModalConversion,
    initialData.taxPolicy,
  ]);
  const selectedPriceTaxReview = initialData.taxEvidenceReviews.find(
    (review) => review.supplierPriceId === supplierPriceForm.previousSupplierPriceId,
  ) ?? null;
  const taxEvidenceReviewByPriceId = useMemo(
    () => new Map(initialData.taxEvidenceReviews.map((review) => [review.supplierPriceId, review])),
    [initialData.taxEvidenceReviews],
  );
  const taxReviewRouteByPriceId = useMemo(
    () => new Map(initialData.taxEvidenceReviews.map((review) => [
      review.supplierPriceId,
      routePriceTaxReview({
        classification: review.classification,
        sourceTaxBasis: review.sourceTaxBasis,
        sourceTaxRate: review.sourceTaxRate,
        amount: review.amount,
        unit: review.unit,
        currency: review.currency,
        isCurrent: review.isCurrent,
        supplierProductId: review.supplierProductId,
        currentPolicy: initialData.taxPolicy,
        canWrite,
      }),
    ])),
    [canWrite, initialData.taxEvidenceReviews, initialData.taxPolicy],
  );
  const selectedPriceTaxRoute = supplierPriceForm.previousSupplierPriceId
    ? taxReviewRouteByPriceId.get(supplierPriceForm.previousSupplierPriceId) ?? "not_correctable"
    : "not_correctable";
  const supplierPriceUnitsMatch = Boolean(
    selectedMaterial
    && materialConversionUnitsEqual(supplierPriceForm.unit, selectedMaterial.default_unit)
  );

  const visibleMaterialPriceRows = useMemo(
    () =>
      historySupplierProductId
        ? materialPriceRows.filter((price) => price.supplier_product_id === historySupplierProductId)
        : materialPriceRows,
    [historySupplierProductId, materialPriceRows]
  );

  const priceHistoryComparisonById = useMemo(() => {
    if (!selectedMaterial) return new Map();
    return new Map(
      materialPriceRows.map((price) => [
        price.id,
        resolveSupplierPriceComparisonAt({
          price,
          materialUnit: selectedMaterial.default_unit,
          conversions: initialData.unitConversions.filter(
            (conversion) => conversion.supplier_product_id === price.supplier_product_id
          ),
          evaluationTime: price.effective_from,
        }),
      ])
    );
  }, [initialData.unitConversions, materialPriceRows, selectedMaterial]);

  const linkedSupplierCount = new Set(
    initialData.effectiveSupplierProducts.flatMap((offering) =>
      offering.effectivePrice ? [offering.supplierProduct.supplier_id] : []
    )
  ).size;
  const priceUpdatesCount = initialData.supplierPrices.filter((price) => {
    const updatedAt = new Date(price.updated_at);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    return updatedAt >= threshold;
  }).length;

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(initialData.materials.map((material) => material.category?.trim()).filter(Boolean) as string[])
      ).sort((left, right) => left.localeCompare(right)),
    [initialData.materials]
  );

  const selectedMaterialPreferredProduct = selectedMaterialSummary?.preferredSupplierProduct ?? null;
  const filteredMaterials = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return initialData.materialSummaries.filter((summary) => {
      if (
        supplierFilter !== "all" &&
        summary.preferredPrice?.supplier_id !== supplierFilter &&
        !summary.currentPrices.some((price) => price.supplier_id === supplierFilter)
      ) {
        return false;
      }

      if (categoryFilter !== "all" && (summary.material.category ?? "") !== categoryFilter) {
        return false;
      }

      if (statusFilter === "Preferred" && !summary.preferredSupplierProduct) {
        return false;
      }
      if (statusFilter === "Active" && summary.status !== "Active") {
        return false;
      }
      if (statusFilter === "Archived" && summary.status !== "Archived") {
        return false;
      }
      if (statusFilter === "Recently Updated") {
        const updatedAt = new Date(summary.material.updated_at);
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 30);
        if (updatedAt < threshold) {
          return false;
        }
      }
      if (!query) {
        return true;
      }

      return [
        summary.material.name,
        summary.material.description ?? "",
        summary.material.category ?? "",
        summary.preferredSupplierName ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [
    categoryFilter,
    initialData.materialSummaries,
    searchQuery,
    statusFilter,
    supplierFilter,
  ]);

  const addMaterialFormCanSubmit =
    initialData.suppliers.length > 0 &&
    addMaterialForm.name.trim().length > 0 &&
    addMaterialForm.supplierId.trim().length > 0 &&
    addMaterialForm.unit.trim().length > 0 &&
    addMaterialForm.unitCost.trim().length > 0 &&
    addMaterialForm.taxEvidenceIntent !== "" &&
    (addMaterialForm.taxEvidenceIntent !== "canonical_ready" || addMaterialForm.sourceTaxBasis !== "unknown") &&
    (addMaterialForm.taxEvidenceIntent !== "needs_review" || addMaterialForm.incompleteTaxReason.trim().length >= 8);

  function resetAddMaterialForm() {
    setAddMaterialForm(EMPTY_ADD_MATERIAL_FORM);
    setAddMaterialError(null);
  }

  function handleAddMaterialOpenChange(nextOpen: boolean) {
    if (!nextOpen && isCreatingMaterial) {
      return;
    }

    if (nextOpen) {
      resetAddMaterialForm();
      addMaterialOperationIdRef.current = crypto.randomUUID();
      setMessage(null);
    } else {
      resetAddMaterialForm();
    }
    setIsAddMaterialOpen(nextOpen);
  }

  async function handleCreateMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreatingMaterialRef.current) {
      return;
    }
    setAddMaterialError(null);
    if (!addMaterialFormCanSubmit) {
      setAddMaterialError("Material name, supplier, unit, and unit cost are required.");
      return;
    }

    isCreatingMaterialRef.current = true;
    setIsCreatingMaterial(true);

    try {
      const materialInput: MaterialDraftInput = {
        name: addMaterialForm.name,
        defaultUnit: addMaterialForm.unit,
        isActive: true,
      };

      const result = await createMaterialWithInitialSupplierPriceAction({
        organizationId,
        operationId: addMaterialOperationIdRef.current,
        materialInput,
        supplierPriceInput: {
          supplierId: addMaterialForm.supplierId,
          unit: addMaterialForm.unit,
          unitCost: Number(addMaterialForm.unitCost),
          currency: initialData.companyCurrency,
          isPreferred: addMaterialForm.isPreferred,
          sourceTaxBasis: addMaterialForm.sourceTaxBasis,
          taxEvidenceIntent: addMaterialForm.taxEvidenceIntent as PriceTaxEvidenceIntent,
          incompleteTaxReason: addMaterialForm.incompleteTaxReason,
        },
      });

      if (!result.ok || !result.materialId) {
        setAddMaterialError(result.error ?? "Unable to create material.");
        return;
      }

      setIsAddMaterialOpen(false);
      resetAddMaterialForm();
      addMaterialOperationIdRef.current = crypto.randomUUID();
      setMessage(
        result.needsReview
          ? "Material created. Classification needs review."
          : "Material created."
      );
      router.refresh();
    } catch (createError) {
      setAddMaterialError(createError instanceof Error ? createError.message : "Unable to create material.");
    } finally {
      isCreatingMaterialRef.current = false;
      setIsCreatingMaterial(false);
    }
  }

  function handleOpenEditMaterial() {
    if (!selectedMaterial) {
      return;
    }

    setError(null);
    setMaterialForm(buildMaterialFormState(selectedMaterial));
    setIsEditMaterialOpen(true);
  }

  function handleEditMaterialOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSavingMaterialIdentity) {
      return;
    }

    if (!nextOpen) {
      setMaterialForm(buildMaterialFormState(selectedMaterial));
      setError(null);
    }
    setIsEditMaterialOpen(nextOpen);
  }

  async function handleSaveMaterialDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMaterial || isSavingMaterialIdentity) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsSavingMaterialIdentity(true);

    try {
      const result = await updateMaterialAction({
        organizationId,
        materialId: selectedMaterial.id,
        input: {
          name: materialForm.name,
          description: materialForm.description,
          defaultUnit: materialForm.defaultUnit,
          category: materialForm.category,
          organizationCostCodeId: materialForm.organizationCostCodeId || null,
          isActive: materialForm.isActive,
        },
      });

      if (!result.ok) {
        setError(result.error ?? "Unable to update material.");
        return;
      }

      setMessage("Material details updated.");
      setIsEditMaterialOpen(false);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update material.");
    } finally {
      setIsSavingMaterialIdentity(false);
    }
  }

  async function handleArchiveMaterial(archived: boolean) {
    if (!selectedMaterial) {
      return;
    }

    const result = await archiveMaterialAction({
      organizationId,
      materialId: selectedMaterial.id,
      archived,
    });

    if (!result.ok) {
      setError(result.error ?? "Unable to update material status.");
      return;
    }

    setMessage(archived ? "Material archived." : "Material restored.");
    router.refresh();
  }

  async function handleAddSupplierPrice() {
    if (!selectedMaterial || isSavingSupplierPrice) {
      return;
    }
    if (supplierPriceModalMode === "confirm_tax_advanced" && supplierPriceForm.sourceTaxBasis === "unknown") {
      setError("Choose the confirmed source tax basis before saving a new price version.");
      return;
    }
    if (supplierPriceModalMode === "confirm_tax_advanced" && (!initialData.taxPolicy?.id
      || !supplierPriceForm.correctionEffectiveFrom
      || supplierPriceForm.correctionReason.trim().length < 8)) {
      setError("Choose the current policy, correction effective time, and enter a meaningful reason.");
      return;
    }
    if (supplierPriceModalMode !== "confirm_tax_advanced" && supplierPriceModalMode !== "confirm_tax_simple" && !supplierPriceForm.taxEvidenceIntent) {
      setError("Choose whether this price is canonical-ready or needs tax review.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsSavingSupplierPrice(true);
    const payload: MaterialSupplierPriceDraftInput = {
      materialId: selectedMaterial.id,
      supplierId: supplierPriceForm.supplierId,
      supplierProductId: supplierPriceForm.supplierProductId || null,
      supplierDescription: supplierPriceForm.supplierDescription,
      unit: supplierPriceForm.unit,
      unitCost: Number(supplierPriceForm.unitCost),
      currency: initialData.companyCurrency,
      isPreferred: supplierPriceForm.isPreferred,
      sourceTaxBasis: supplierPriceForm.sourceTaxBasis,
      sourceTaxRate: supplierPriceForm.sourceTaxRate,
      taxEvidenceIntent: supplierPriceForm.taxEvidenceIntent || "canonical_ready",
      incompleteTaxReason: supplierPriceForm.incompleteTaxReason,
    };

    try {
      const result = supplierPriceModalMode === "confirm_tax_simple"
        ? await confirmMaterialSupplierPriceTaxEvidenceForwardAction({
            organizationId,
            operationId: supplierPriceOperationIdRef.current,
            previousSupplierPriceId: supplierPriceForm.previousSupplierPriceId,
          })
        : supplierPriceModalMode === "confirm_tax_advanced"
        ? await confirmMaterialSupplierPriceTaxEvidenceAction({
            organizationId,
            operationId: supplierPriceOperationIdRef.current,
            previousSupplierPriceId: supplierPriceForm.previousSupplierPriceId,
            policyId: initialData.taxPolicy!.id!,
            sourceTaxBasis: supplierPriceForm.sourceTaxBasis as Exclude<SourceTaxBasis, "unknown">,
            sourceTaxRate: supplierPriceForm.sourceTaxRate,
            effectiveFrom: new Date(supplierPriceForm.correctionEffectiveFrom).toISOString(),
            reason: supplierPriceForm.correctionReason,
          })
        : await addMaterialSupplierPriceAction({
            organizationId,
            operationId: supplierPriceOperationIdRef.current,
            input: payload,
          });

      if (!result.ok) {
        setError(result.error ?? "Unable to add supplier price.");
        if (result.error?.includes("no longer current")) router.refresh();
        return;
      }

      const completedMode = supplierPriceModalMode;
      setIsAddPriceOpen(false);
      supplierPriceOperationIdRef.current = crypto.randomUUID();
      setSupplierPriceModalMode("create");
      setSupplierPriceForm(emptyPriceForm(initialData.companyCurrency));
      setMessage(
        completedMode === "confirm_tax_simple" || completedMode === "confirm_tax_advanced"
          ? "Tax setup confirmed. This supplier price is now available for estimating."
          : completedMode === "update"
            ? "Supplier price updated."
            : "Supplier price added."
      );
      router.refresh();
    } finally {
      setIsSavingSupplierPrice(false);
    }
  }

  function handleOpenUpdateSupplierPrice(price: typeof materialPriceRows[number]) {
    setError(null);
    setSupplierPriceModalMode("update");
    setSupplierPriceForm({
      supplierProductId:
        (price as typeof price & { supplier_product_id?: string | null }).supplier_product_id ?? "",
      supplierId: price.supplier_id,
      supplierDescription: price.supplier_description ?? "",
      unit: price.unit,
      unitCost: String(price.unit_cost),
      currency: initialData.companyCurrency,
      isPreferred:
        supplierProductById.get(price.supplier_product_id ?? "")?.is_preferred ?? false,
      sourceTaxBasis: price.source_tax_basis as SourceTaxBasis,
      sourceTaxRate: price.source_tax_rate,
      taxEvidenceIntent: "",
      incompleteTaxReason: "",
      correctionEffectiveFrom: "",
      correctionReason: "",
      previousSupplierPriceId: "",
    });
    supplierPriceOperationIdRef.current = crypto.randomUUID();
    setIsAddPriceOpen(true);
  }

  function handleOpenConfirmSupplierPriceTaxBasis(
    price: typeof materialPriceRows[number],
    route: Extract<PriceTaxReviewRoute, "simple_forward_confirmation" | "advanced_review">,
  ) {
    setError(null);
    setSupplierPriceModalMode(route === "simple_forward_confirmation" ? "confirm_tax_simple" : "confirm_tax_advanced");
    setSupplierPriceForm({
      supplierProductId:
        (price as typeof price & { supplier_product_id?: string | null }).supplier_product_id ?? "",
      supplierId: price.supplier_id,
      supplierDescription: price.supplier_description ?? "",
      unit: price.unit,
      unitCost: String(price.unit_cost),
      currency: initialData.companyCurrency,
      isPreferred:
        supplierProductById.get(price.supplier_product_id ?? "")?.is_preferred ?? false,
      sourceTaxBasis: price.source_tax_basis as SourceTaxBasis,
      sourceTaxRate: price.source_tax_rate,
      taxEvidenceIntent: "canonical_ready",
      incompleteTaxReason: "",
      correctionEffectiveFrom: currentLocalDateTime(),
      correctionReason: "",
      previousSupplierPriceId: price.id,
    });
    supplierPriceOperationIdRef.current = crypto.randomUUID();
    setIsAddPriceOpen(true);
  }

  function handleOpenAddSupplierLine() {
    setError(null);
    setSupplierPriceModalMode("create");
    setSupplierPriceForm({
      ...emptyPriceForm(initialData.companyCurrency),
      unit: selectedMaterial?.default_unit ?? "",
    });
    supplierPriceOperationIdRef.current = crypto.randomUUID();
    setIsAddPriceOpen(true);
  }

  function handleViewSupplierPriceHistory(supplierProductId: string) {
    setHistorySupplierProductId(supplierProductId);
    setIsPriceHistoryOpen(true);
    requestAnimationFrame(() => {
      priceHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleMakePreferredSupplierPrice(priceId: string) {
    if (preferredPricePendingId) {
      return;
    }

    setError(null);
    setMessage(null);
    setPreferredPricePendingId(priceId);

    try {
      const result = await makeMaterialSupplierPricePreferredAction({
        organizationId,
        supplierPriceId: priceId,
      });

      if (!result.ok) {
        setError(result.error ?? "Unable to update preferred supplier price.");
        return;
      }

      setMessage("Preferred supplier updated.");
      router.refresh();
    } finally {
      setPreferredPricePendingId(null);
    }
  }

  function handleOpenRemoveSupplierProduct(supplierProductId: string) {
    setError(null);
    setRemoveSupplierProductReason(SUPPLIER_PRODUCT_ARCHIVE_REASONS[0]);
    setRemoveSupplierProductNote("");
    setRemoveSupplierProductId(supplierProductId);
  }

  async function handleRemoveSupplierProduct() {
    if (!selectedMaterial || !removeSupplierProduct || supplierProductLifecyclePending) return;
    setSupplierProductLifecyclePending(true);
    setError(null);
    const result = await archiveMaterialSupplierProductAction({
      organizationId,
      materialId: selectedMaterial.id,
      supplierProductId: removeSupplierProduct.id,
      reason: removeSupplierProductReason,
      note: removeSupplierProductNote || null,
    });
    setSupplierProductLifecyclePending(false);
    if (!result.ok) {
      setError(result.error ?? "Unable to remove the supplier item.");
      return;
    }
    setRemoveSupplierProductId(null);
    setMessage("Supplier item removed from active pricing. Historical records were preserved.");
    router.refresh();
  }

  async function handleRestoreSupplierProduct() {
    if (!selectedMaterial || !restoreSupplierProduct || supplierProductLifecyclePending) return;
    setSupplierProductLifecyclePending(true);
    setError(null);
    const result = await restoreMaterialSupplierProductAction({
      organizationId,
      materialId: selectedMaterial.id,
      supplierProductId: restoreSupplierProduct.id,
    });
    setSupplierProductLifecyclePending(false);
    if (!result.ok) {
      setError(result.error ?? "Unable to restore the supplier item.");
      return;
    }
    setRestoreSupplierProductId(null);
    setMessage("Supplier item restored as nonpreferred.");
    router.refresh();
  }

  function handleOpenMoveSupplierProduct(supplierProductId: string) {
    setError(null);
    setMoveTargetMaterialId("");
    setMoveSupplierProductReason("");
    setMoveSupplierProductId(supplierProductId);
  }

  async function handleMoveSupplierProduct() {
    if (!moveSupplierProduct || !moveTargetMaterialId || !moveSupplierProductReason.trim() || supplierProductLifecyclePending) return;
    setSupplierProductLifecyclePending(true);
    setError(null);
    const result = await moveMaterialSupplierProductAction({
      organizationId,
      supplierProductId: moveSupplierProduct.id,
      newMaterialId: moveTargetMaterialId,
      reason: moveSupplierProductReason,
    });
    setSupplierProductLifecyclePending(false);
    if (!result.ok) {
      setError(result.error ?? "Unable to move the supplier item.");
      return;
    }
    setMoveSupplierProductId(null);
    setMessage("Supplier item moved to the selected Material.");
    router.refresh();
  }

  async function handleStartImport() {
    if (isUploadingImport) {
      return;
    }
    if (!importFile) {
      setError("Choose a file to import.");
      return;
    }
    const fileValidationError = validateMaterialImportUploadFile(importFile);
    if (fileValidationError) {
      setError(fileValidationError);
      return;
    }
    if (!importSupplierId) {
      setError("Choose a supplier before importing.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsUploadingImport(true);

    try {
      const formData = new FormData();
      formData.set("file", importFile);
      formData.set("supplierId", importSupplierId);

      const response = await fetch("/api/materials/imports", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        error?: string;
        batch?: OrganizationMaterialImportBatchRow;
        rows?: OrganizationMaterialImportRowRow[];
        queued?: boolean;
      };

      if (!response.ok || !payload.batch) {
        throw new Error(payload.error ?? "Unable to import supplier price list.");
      }

      setReviewBatch(payload.batch);
      setImportProcessing(payload.queued ? {
        status: "queued",
        stage: "preparing",
        completedChunks: null,
        totalChunks: null,
        attempt: 0,
        errorCode: null,
      } : { status: "ready", stage: null, completedChunks: null, totalChunks: null, attempt: 0, errorCode: null });
      setReviewRows((payload.rows ?? []).map((row) =>
        toReviewRowState(row, initialData.materials, initialData.companyCurrency)
      ));
      setSelectedReviewRowIds((payload.rows ?? []).map((row) => row.id));
      setMessage(payload.queued ? "Import queued. This window will update when interpretation completes." : "Import batch ready for review.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to import supplier price list.");
    } finally {
      setIsUploadingImport(false);
    }
  }

  async function handleAddReviewRow() {
    if (!reviewBatch) {
      return;
    }

    const response = await fetch(`/api/materials/imports/${reviewBatch.id}/rows`, {
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string; row?: OrganizationMaterialImportRowRow };
    if (!response.ok || !payload.row) {
      setError(payload.error ?? "Unable to add a review row.");
      return;
    }

    setReviewRows((current) => [
      ...current,
      toReviewRowState(payload.row!, initialData.materials, initialData.companyCurrency),
    ]);
    setSelectedReviewRowIds((current) => [...current, payload.row!.id]);
  }

  async function handleCancelImport() {
    if (!reviewBatch || isUpdatingImportLifecycle) return;
    setIsUpdatingImportLifecycle(true);
    setError(null);
    try {
      const response = await fetch(`/api/materials/imports/${reviewBatch.id}/cancel`, { method: "POST" });
      const payload = await response.json() as { error?: string; cancelled?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Unable to cancel this import.");
      setReviewBatch((current) => current ? { ...current, status: "cancelled" } : current);
      setImportProcessing((current) => ({
        status: "cancelled",
        stage: null,
        completedChunks: current?.completedChunks ?? null,
        totalChunks: current?.totalChunks ?? null,
        attempt: current?.attempt ?? 0,
        errorCode: current?.errorCode ?? null,
      }));
      setMessage(payload.cancelled ? "Import cancelled." : "No active import work remained to cancel.");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel this import.");
    } finally {
      setIsUpdatingImportLifecycle(false);
    }
  }

  async function handleReprocessImport() {
    if (!reviewBatch || isUpdatingImportLifecycle) return;
    setIsUpdatingImportLifecycle(true);
    setError(null);
    try {
      const response = await fetch(`/api/materials/imports/${reviewBatch.id}/reprocess`, { method: "POST" });
      const payload = await response.json() as { error?: string; queued?: boolean };
      if (!response.ok || !payload.queued) throw new Error(payload.error ?? "Unable to reprocess this import.");
      setReviewBatch((current) => current ? { ...current, status: "extracting" } : current);
      setImportProcessing({ status: "queued", stage: "preparing", completedChunks: null, totalChunks: null, attempt: 0, errorCode: null });
      setMessage("Reprocessing queued. Existing review rows are retained until the replacement succeeds.");
    } catch (reprocessError) {
      setError(reprocessError instanceof Error ? reprocessError.message : "Unable to reprocess this import.");
    } finally {
      setIsUpdatingImportLifecycle(false);
    }
  }

  async function handleApproveSelectedRows() {
    if (!reviewBatch || isSubmittingImportReview) {
      return;
    }

    const selectedRows = reviewRows.filter((row) => selectedReviewRowIds.includes(row.id));
    if (selectedRows.length === 0) {
      setError("Choose at least one row to approve.");
      return;
    }

    const reviews: MaterialImportReviewDraft[] = selectedRows.map((row) => ({
      rowId: row.id,
      action: row.action,
      matchedMaterialId: row.matchedMaterialId || null,
      reviewedName: row.reviewedName,
      reviewedDescription: row.reviewedDescription,
      supplierUnit: row.supplierUnit,
      materialUnit: row.materialUnit,
      confirmedUnitConversion: row.confirmedUnitConversion,
      reviewedUnitCost: Number(row.reviewedUnitCost),
      reviewedCurrency: initialData.companyCurrency,
      reviewedSupplierDescription: row.reviewedSupplierDescription,
      reviewedSupplierSku: row.reviewedSupplierSku,
      selectedPriceKey: row.selectedPriceKey || null,
      reviewedTaxBasis: row.reviewedTaxBasis,
      reviewedSourceTaxRate: row.reviewedSourceTaxRate,
      taxEvidence: row.taxEvidence,
      allowDuplicateSourceObservation: row.allowDuplicateSourceObservation === true,
      acknowledgeIncompleteTaxEvidence: row.acknowledgeIncompleteTaxEvidence === true,
      incompleteTaxReason: row.incompleteTaxReason || null,
      archivedSupplierProductId: row.archivedSupplierProductId || null,
      archivedSupplierProductResolution: row.archivedSupplierProductResolution ?? null,
      identityVariant: row.identityVariant || null,
    }));

    setIsSubmittingImportReview(true);
    setError(null);
    try {
      const response = await fetch(`/api/materials/imports/${reviewBatch.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          reviews,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        ok?: boolean;
        approvedRows?: Array<{ rowId: string; materialId: string | null; status: "approved" | "rejected" }>;
        failedRows?: Array<{ rowId: string; code: string; message: string }>;
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to approve import rows.");
        return;
      }

      const approvedRows = payload.approvedRows ?? [];
      const failedRows = payload.failedRows ?? [];
      const approvedById = new Map(approvedRows.map((row) => [row.rowId, row]));
      const failedById = new Map(failedRows.map((row) => [row.rowId, row]));

      setReviewRows((current) => current.map((row) => {
        const approved = approvedById.get(row.id);
        const failed = failedById.get(row.id);
        if (approved) return { ...row, status: approved.status, approvalError: null };
        if (failed) return { ...row, approvalError: { code: failed.code, message: failed.message } };
        return row;
      }));
      setSelectedReviewRowIds(failedRows.map((row) => row.rowId));

      if (failedRows.length > 0) {
        setReviewBatch((current) => current ? {
          ...current,
          rows_approved: current.rows_approved + approvedRows.filter((row) => row.status === "approved").length,
          rows_rejected: current.rows_rejected + approvedRows.filter((row) => row.status === "rejected").length,
          status: approvedRows.length > 0 || current.rows_approved > 0 || current.rows_rejected > 0
            ? "partially_approved"
            : current.status,
        } : current);
        setError(`${failedRows.length} of ${selectedRows.length} selected row${failedRows.length === 1 ? "" : "s"} could not be approved. Review the highlighted row${failedRows.length === 1 ? "" : "s"}.`);
        setMessage(approvedRows.length > 0
          ? `${approvedRows.length} row${approvedRows.length === 1 ? "" : "s"} approved; ${failedRows.length} need attention.`
          : null);
        router.refresh();
        return;
      }

      setIsImportOpen(false);
      setReviewBatch(null);
      setReviewRows([]);
      setSelectedReviewRowIds([]);
      setImportFile(null);
      setImportSupplierId("");
      setMessage(`${approvedRows.length} import row${approvedRows.length === 1 ? "" : "s"} approved.`);
      router.refresh();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Unable to approve import rows.");
    } finally {
      setIsSubmittingImportReview(false);
    }
  }

  async function handleRejectSelectedRows() {
    if (isSubmittingImportReview) {
      return;
    }
    if (!reviewBatch || selectedReviewRowIds.length === 0) {
      setError("Choose at least one row to reject.");
      return;
    }

    setIsSubmittingImportReview(true);
    setError(null);
    try {
      const response = await fetch(`/api/materials/imports/${reviewBatch.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "reject",
          rowIds: selectedReviewRowIds,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to reject import rows.");
        return;
      }

      setIsImportOpen(false);
      setReviewBatch(null);
      setReviewRows([]);
      setSelectedReviewRowIds([]);
      setMessage("Selected import rows rejected.");
      router.refresh();
    } catch (rejectionError) {
      setError(rejectionError instanceof Error ? rejectionError.message : "Unable to reject import rows.");
    } finally {
      setIsSubmittingImportReview(false);
    }
  }

  function handleBackFromImportBatch() {
    setReviewBatch(null);
    setReviewRows([]);
    setSelectedReviewRowIds([]);
    setImportProcessing(null);
    setError(null);
  }

  const isImportProcessing = reviewBatch?.status === "extracting";
  const isImportFailure = reviewBatch?.status === "failed" || reviewBatch?.status === "cancelled";
  const isImportReview = Boolean(reviewBatch && !isImportProcessing && !isImportFailure);
  const importDialogTitle = isImportReview ? "Review Supplier Price List" : "Import Supplier Price List";
  const importSupplier = supplierOptions.find((supplier) => supplier.id === (reviewBatch?.supplier_id ?? importSupplierId));
  const importSupplierName = importSupplier ? getSupplierDisplayName(importSupplier) : "Supplier not selected";

  return (
    <div className="space-y-6">
      <OperationalModuleHeader
        title="Material Library"
        description="Manage supplier material costs, preferred suppliers, and company cost items."
        actions={
          <>
            <Button
              variant="outline"
              size="toolbar"
              onClick={() => {
                setError(null);
                setIsImportOpen(true);
              }}
              disabled={!canWrite}
            >
              <Upload className="h-4 w-4" />
              Import Supplier Price List
            </Button>
            <Dialog open={isAddMaterialOpen} onOpenChange={handleAddMaterialOpenChange}>
              <DialogTrigger asChild>
                <Button variant="orange" size="toolbar" disabled={!canWrite}>
                  <Plus className="h-4 w-4" /> Add Material
                </Button>
              </DialogTrigger>
              <DialogContent
                hideClose={isCreatingMaterial}
                onEscapeKeyDown={(event) => {
                  if (isCreatingMaterial) event.preventDefault();
                }}
                onInteractOutside={(event) => {
                  if (isCreatingMaterial) event.preventDefault();
                }}
                className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]"
              >
                <form onSubmit={handleCreateMaterial}>
                  <DialogHeader className="px-7 pb-6 pt-7">
                    <DialogTitle
                      className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]`}
                    >
                      Add Material
                    </DialogTitle>
                    <DialogDescription className={`${ibmPlexSans.className} pt-2 text-[14px]`}>
                      Create a material and its initial supplier price.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3.5 px-7 pb-4">
                    <div>
                      <FormLabel htmlFor="add-material-name">
                        Material Name <span className="text-[var(--orange-primary)]">*</span>
                      </FormLabel>
                      <Input
                        id="add-material-name"
                        value={addMaterialForm.name}
                        onChange={(event) =>
                          setAddMaterialForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="100 x 50 H1.2 SG8 Timber"
                        className={ADD_MATERIAL_INPUT_CLASS}
                        disabled={isCreatingMaterial}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <FormLabel htmlFor="add-material-unit">
                          Unit <span className="text-[var(--orange-primary)]">*</span>
                        </FormLabel>
                        <Input
                          id="add-material-unit"
                          value={addMaterialForm.unit}
                          onChange={(event) =>
                            setAddMaterialForm((current) => ({ ...current, unit: event.target.value }))
                          }
                          placeholder="LM"
                          className={ADD_MATERIAL_INPUT_CLASS}
                          disabled={isCreatingMaterial}
                          required
                        />
                      </div>
                      <div>
                        <FormLabel htmlFor="add-material-unit-cost">
                          Initial Cost ({initialData.companyCurrency}) <span className="text-[var(--orange-primary)]">*</span>
                        </FormLabel>
                        <Input
                          id="add-material-unit-cost"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={addMaterialForm.unitCost}
                          onChange={(event) =>
                            setAddMaterialForm((current) => ({ ...current, unitCost: event.target.value }))
                          }
                          placeholder="4.55"
                          className={ADD_MATERIAL_INPUT_CLASS}
                          disabled={isCreatingMaterial}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <FormLabel htmlFor="add-material-supplier">
                        Supplier <span className="text-[var(--orange-primary)]">*</span>
                      </FormLabel>
                      <div className="relative">
                        <select
                          id="add-material-supplier"
                          value={addMaterialForm.supplierId}
                          onChange={(event) =>
                            setAddMaterialForm((current) => ({ ...current, supplierId: event.target.value }))
                          }
                          className={ADD_MATERIAL_SELECT_CLASS}
                          disabled={isCreatingMaterial || initialData.suppliers.length === 0}
                          required
                        >
                          <option value="">
                            {initialData.suppliers.length === 0 ? "No suppliers available" : "Select supplier"}
                          </option>
                          {initialData.suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier"}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]"
                          aria-hidden="true"
                        />
                      </div>
                      {initialData.suppliers.length === 0 ? (
                        <p className="mt-1.5 text-[13px] text-[var(--text-secondary)]">
                          Add a company supplier before creating a material with an initial price.
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <FormLabel htmlFor="add-material-tax-basis">Source Tax Basis</FormLabel>
                        <select
                          id="add-material-tax-basis"
                          className={ADD_MATERIAL_SELECT_CLASS}
                          value={addMaterialForm.sourceTaxBasis}
                          onChange={(event) => setAddMaterialForm((current) => ({
                            ...current,
                            sourceTaxBasis: event.target.value as SourceTaxBasis,
                          }))}
                          disabled={isCreatingMaterial}
                        >
                          <option value="unknown">Unknown</option>
                          <option value="inclusive">Tax Inclusive</option>
                          <option value="exclusive">Tax Exclusive</option>
                          <option value="zero_rated">Zero Rated</option>
                          <option value="exempt">Exempt</option>
                          <option value="no_tax">No Tax</option>
                        </select>
                      </div>
                      <div>
                        <FormLabel htmlFor="add-material-tax-outcome">Tax Evidence Outcome</FormLabel>
                        <select
                          id="add-material-tax-outcome"
                          className={ADD_MATERIAL_SELECT_CLASS}
                          value={addMaterialForm.taxEvidenceIntent}
                          onChange={(event) => setAddMaterialForm((current) => ({
                            ...current,
                            taxEvidenceIntent: event.target.value as PriceTaxEvidenceIntent | "",
                          }))}
                          disabled={isCreatingMaterial}
                          required
                        >
                          <option value="">Choose outcome</option>
                          <option value="canonical_ready" disabled={!initialData.taxPolicy || addMaterialForm.sourceTaxBasis === "unknown"}>Complete — canonical-ready</option>
                          <option value="needs_review">Save incomplete — needs tax review</option>
                        </select>
                      </div>
                    </div>

                    {addMaterialForm.taxEvidenceIntent === "needs_review" ? (
                      <div>
                        <FormLabel htmlFor="add-material-tax-review-reason">Why is tax evidence incomplete?</FormLabel>
                        <Input
                          id="add-material-tax-review-reason"
                          value={addMaterialForm.incompleteTaxReason}
                          onChange={(event) => setAddMaterialForm((current) => ({ ...current, incompleteTaxReason: event.target.value }))}
                          placeholder="Supplier document does not state the tax basis."
                          className={ADD_MATERIAL_INPUT_CLASS}
                          disabled={isCreatingMaterial}
                          required
                        />
                      </div>
                    ) : null}

                    <label
                      htmlFor="add-material-preferred"
                      className={`${ibmPlexSans.className} flex items-center gap-2 text-[14px] font-medium text-[var(--text-primary)]`}
                    >
                      <input
                        id="add-material-preferred"
                        type="checkbox"
                        checked={addMaterialForm.isPreferred}
                        onChange={(event) =>
                          setAddMaterialForm((current) => ({ ...current, isPreferred: event.target.checked }))
                        }
                        disabled={isCreatingMaterial}
                        className="h-4 w-4 rounded border-[var(--border)] accent-[var(--orange-primary)]"
                      />
                      Set as preferred supplier
                    </label>

                    {addMaterialError ? (
                      <OperationalAlert variant="error" role="alert">
                        {addMaterialError}
                      </OperationalAlert>
                    ) : null}
                  </div>

                  <DialogFooter className="gap-3 px-7 pb-7 pt-5 sm:space-x-0">
                    <DialogClose asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isCreatingMaterial}
                        className="w-full sm:w-auto"
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      type="submit"
                      variant="orange"
                      disabled={!addMaterialFormCanSubmit || isCreatingMaterial}
                      className="w-full sm:w-auto"
                    >
                      {isCreatingMaterial ? "Adding..." : "Add Material"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {message ? <OperationalAlert variant="success">{message}</OperationalAlert> : null}
      {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <OperationalKpiCard
          label="Materials"
          value={initialData.materials.filter((material) => material.is_active).length.toLocaleString()}
          helper="Active cost items"
          tone="navy"
          icon={<Package2 className="h-5 w-5" />}
        />
        <OperationalKpiCard
          label="Suppliers"
          value={linkedSupplierCount.toLocaleString()}
          helper="Linked suppliers"
          tone="sage"
          icon={<Building2 className="h-5 w-5" />}
        />
        <OperationalKpiCard
          label="Price Updates"
          value={priceUpdatesCount.toLocaleString()}
          helper="Updated in last 30 days"
          tone="orange"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div className="space-y-3">
        <OperationalToolbar
          className="items-start"
          search={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search materials..."
                className="pl-9"
              />
            </div>
          }
          filters={(["Active", "All", "Preferred", "Recently Updated", "Archived"] as MaterialStatusFilter[]).map(
            (item) => (
              <Button
                key={item}
                variant={statusFilter === item ? "primary" : "secondary"}
                size="sm"
                onClick={() => setStatusFilter(item)}
              >
                {item}
              </Button>
            )
          )}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            value={supplierFilter}
            onChange={(event) => setSupplierFilter(event.target.value)}
            className={cn(FIELD_SELECT_CLASS, "w-full")}
          >
            <option value="all">Supplier</option>
            {initialData.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier"}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className={cn(FIELD_SELECT_CLASS, "w-full")}
          >
            <option value="all">Trade / Category</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <OperationalPanel contentClassName="p-0">
        {filteredMaterials.length === 0 ? (
          <div className="p-6">
            <OperationalEmptyState
              title="No materials found"
              description="Try a different search or filter, or add your first material item."
              icon={<AlertCircle className="h-5 w-5" />}
            />
          </div>
        ) : (
            <OperationalTable className="min-w-[1000px]">
              <OperationalTableHeader>
                <OperationalTableRow>
                  <OperationalTableHead>Material</OperationalTableHead>
                  <OperationalTableHead>Preferred Supplier</OperationalTableHead>
                  <OperationalTableHead>Cost</OperationalTableHead>
                  <OperationalTableHead>Unit</OperationalTableHead>
                  <OperationalTableHead>Total Suppliers</OperationalTableHead>
                  <OperationalTableHead>Last Updated</OperationalTableHead>
                  <OperationalTableHead>Status</OperationalTableHead>
                  <OperationalTableHead>Actions</OperationalTableHead>
                </OperationalTableRow>
              </OperationalTableHeader>
              <OperationalTableBody>
                {filteredMaterials.map((summary) => (
                  <OperationalTableRow key={summary.material.id}>
                    <OperationalTableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-[var(--text-primary)]">{summary.material.name}</p>
                        {formatConstructionIntelligenceSummary(summary.material.ai_construction_intelligence) ? (
                          <p className="text-xs text-[var(--text-secondary)]">
                            Construction Intelligence:{" "}
                            {formatConstructionIntelligenceSummary(summary.material.ai_construction_intelligence)}
                          </p>
                        ) : null}
                      </div>
                    </OperationalTableCell>
                    <OperationalTableCell>{summary.preferredSupplierName ?? "—"}</OperationalTableCell>
                    <OperationalTableCell>
                      {summary.bestCost.status !== "comparable"
                        ? materialCostReviewLabel(summary)
                        : formatMaterialMoney(
                            Number(summary.bestCost.comparableUnitCost ?? summary.bestCost.price.unit_cost),
                            initialData.companyCurrency,
                            initialData.companyCurrency,
                          )}
                    </OperationalTableCell>
                    <OperationalTableCell>{summary.material.default_unit}</OperationalTableCell>
                    <OperationalTableCell>{summary.supplierCount}</OperationalTableCell>
                    <OperationalTableCell>{formatMaterialDate(summary.material.updated_at)}</OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={toStatusBadge(summary.status)}>{summary.status}</StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <Button
                        variant="orange"
                        size="toolbar"
                        onClick={() => setSelectedMaterialId(summary.material.id)}
                      >
                      Open
                      </Button>
                    </OperationalTableCell>
                  </OperationalTableRow>
                ))}
            </OperationalTableBody>
          </OperationalTable>
        )}
      </OperationalPanel>

      <Dialog open={Boolean(selectedMaterialId)} onOpenChange={(open) => !open && setSelectedMaterialId(null)}>
        <DialogContent className="w-[95vw] max-w-[1180px] overflow-hidden p-0">
          {selectedMaterial ? (
            <div className="flex max-h-[90vh] flex-col">
              <div className="shrink-0 border-b border-[var(--border)] px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
                <div className="flex flex-wrap items-start justify-between gap-4 pr-12">
                  <div className="min-w-0 space-y-3">
                    <DialogTitle className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                      {selectedMaterial.name}
                    </DialogTitle>
                    <StatusBadge
                      status={selectedMaterial.is_active && !selectedMaterial.archived_at ? "active" : "draft"}
                    >
                      {selectedMaterial.is_active && !selectedMaterial.archived_at ? "Active" : "Archived"}
                    </StatusBadge>
                  </div>
                  {canWrite ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          ref={materialActionsTriggerRef}
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Actions for {selectedMaterial.name}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="!z-[200] min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                      >
                        <DropdownMenuItem
                          onSelect={handleOpenEditMaterial}
                          className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                          Edit Material
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-1 bg-[var(--border)]" />
                        {selectedMaterial.is_active ? (
                          <DropdownMenuItem
                            onSelect={() => void handleArchiveMaterial(selectedMaterial.is_active)}
                            className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--error)] focus:bg-[var(--error-light)]"
                          >
                            <Archive className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => void handleArchiveMaterial(selectedMaterial.is_active)}
                            className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                          >
                            <ArchiveRestore
                              className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]"
                              aria-hidden="true"
                            />
                            Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 sm:px-7">
                <section
                  aria-labelledby="material-summary-heading"
                  className="border-b border-[var(--border)] py-4"
                >
                  <div className="space-y-1">
                    <h3 id="material-summary-heading" className="text-sm font-semibold text-[var(--text-primary)]">
                      Material Summary
                    </h3>
                    {selectedMaterial.description ? (
                      <p className="text-sm leading-6 text-[var(--text-secondary)]">{selectedMaterial.description}</p>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <MaterialSummaryCard
                      label="Unit"
                      value={selectedMaterial.default_unit || "—"}
                      tone="navy"
                      icon={<Ruler className="h-[18px] w-[18px]" aria-hidden="true" />}
                    />
                    <MaterialSummaryCard
                      label="Trade / Category"
                      value={selectedMaterial.category ?? "—"}
                      tone="navy"
                      icon={<Layers3 className="h-[18px] w-[18px]" aria-hidden="true" />}
                    />
                    <MaterialSummaryCard
                      label="Preferred Supplier"
                      value={
                        selectedMaterialPreferredProduct
                          ? supplierNameById.get(selectedMaterialPreferredProduct.supplier_id) ?? "Unknown supplier"
                          : "—"
                      }
                      tone="sage"
                      icon={<Building2 className="h-[18px] w-[18px]" aria-hidden="true" />}
                    />
                    <MaterialSummaryCard
                      label="Best Cost"
                      value={
                        !selectedMaterialSummary || selectedMaterialSummary.bestCost.status !== "comparable"
                          ? selectedMaterialSummary ? materialCostReviewLabel(selectedMaterialSummary) : "—"
                          : formatMaterialMoney(
                              Number(selectedMaterialSummary.bestCost.comparableUnitCost ?? selectedMaterialSummary.bestCost.price.unit_cost),
                              initialData.companyCurrency,
                              initialData.companyCurrency,
                            )
                      }
                      tone="amber"
                      icon={<CircleDollarSign className="h-[18px] w-[18px]" aria-hidden="true" />}
                    />
                    <MaterialSummaryCard
                      label="Other Priced Suppliers"
                      value={(selectedMaterialSummary?.otherSupplierCount ?? 0).toLocaleString()}
                      tone="sage"
                      icon={<Users className="h-[18px] w-[18px]" aria-hidden="true" />}
                    />
                    <MaterialSummaryCard
                      label="Last Updated"
                      value={formatMaterialDate(selectedMaterial.updated_at)}
                      tone="orange"
                      icon={<CalendarClock className="h-[18px] w-[18px]" aria-hidden="true" />}
                    />
                  </div>
                </section>

                <section aria-labelledby="supplier-lines-heading" className="space-y-3 border-b border-[var(--border)] py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 id="supplier-lines-heading" className="text-base font-semibold text-[var(--text-primary)]">
                        Supplier Pricing
                      </h3>
                    </div>
                    {canWrite ? (
                      <Button
                        variant="orange"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={handleOpenAddSupplierLine}
                        aria-label="Add supplier price"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>

                  {materialEffectiveSupplierProducts.length === 0 ? (
                    <OperationalEmptyState
                      title="No supplier lines yet"
                      description="Add a supplier line to start tracking pricing for this material."
                      icon={<Building2 className="h-5 w-5" />}
                      actions={
                        canWrite ? (
                          <Button
                            variant="orange"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={handleOpenAddSupplierLine}
                            aria-label="Add supplier price"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        ) : null
                      }
                    />
                  ) : (
                    <div className="max-w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white">
                      <OperationalTable className="min-w-[720px]">
                        <OperationalTableHeader>
                          <OperationalTableRow>
                            <OperationalTableHead className="h-12">Supplier</OperationalTableHead>
                            <OperationalTableHead className="h-12">Unit</OperationalTableHead>
                            <OperationalTableHead className="h-12">Supplier Price</OperationalTableHead>
                            <OperationalTableHead className="h-12">Comparable</OperationalTableHead>
                            <OperationalTableHead className="h-12">Updated</OperationalTableHead>
                            <OperationalTableHead className="h-12">Status</OperationalTableHead>
                            <OperationalTableHead className="h-12 w-[52px] px-2 text-right">Actions</OperationalTableHead>
                          </OperationalTableRow>
                        </OperationalTableHeader>
                        <OperationalTableBody>
                          {materialEffectiveSupplierProducts.map(({ supplierProduct, effectivePrice, comparableUnitCost, comparisonUnit, comparisonStatus }) => (
                            <OperationalTableRow key={supplierProduct.id} className="h-12">
                              <OperationalTableCell className="py-3">
                                <p className="whitespace-nowrap font-medium">
                                  {supplierNameById.get(supplierProduct.supplier_id) ?? "Unknown supplier"}
                                </p>
                              </OperationalTableCell>
                              <OperationalTableCell className="py-3">
                                <div className="space-y-1">
                                  <p>{effectivePrice?.unit ?? supplierProduct.supplier_unit}</p>
                                  {supplierProduct.pack_quantity || supplierProduct.pack_unit ? (
                                    <p className="text-xs text-[var(--text-secondary)]">
                                      Pack: {supplierProduct.pack_quantity ?? "—"} {supplierProduct.pack_unit ?? ""}
                                    </p>
                                  ) : null}
                                </div>
                              </OperationalTableCell>
                              <OperationalTableCell className="whitespace-nowrap py-3">
                                {effectivePrice
                                  ? formatMaterialMoney(
                                      Number(effectivePrice.unit_cost),
                                      initialData.companyCurrency,
                                      initialData.companyCurrency,
                                    )
                                  : "No effective price"}
                              </OperationalTableCell>
                              <OperationalTableCell className="whitespace-nowrap py-3">
                                {effectivePrice && comparableUnitCost !== null && comparableUnitCost !== undefined
                                  ? `${formatMaterialMoney(comparableUnitCost, initialData.companyCurrency, initialData.companyCurrency)} / ${comparisonUnit}`
                                  : isReviewableTaxStatus(comparisonStatus)
                                    ? effectivePrice && taxReviewRouteByPriceId.get(effectivePrice.id) === "simple_forward_confirmation"
                                      ? "Tax setup needs confirmation"
                                      : "Tax evidence needs review"
                                    : comparisonStatus === "non_comparable"
                                      ? "Conversion required"
                                      : "Unavailable"}
                              </OperationalTableCell>
                              <OperationalTableCell className="whitespace-nowrap py-3">
                                {formatMaterialDate(effectivePrice?.updated_at ?? supplierProduct.updated_at)}
                              </OperationalTableCell>
                              <OperationalTableCell className="py-3">
                                <StatusBadge
                                  status={!effectivePrice ? "draft" : supplierProduct.is_preferred ? "approved" : "active"}
                                >
                                  {!effectivePrice
                                    ? "No current price"
                                    : supplierProduct.is_preferred
                                      ? "Preferred"
                                      : "Current"}
                                </StatusBadge>
                              </OperationalTableCell>
                              <OperationalTableCell className="px-2 py-3">
                                <div className="flex items-center justify-end">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        className="h-8 w-8 rounded-full"
                                        disabled={preferredPricePendingId === effectivePrice?.id}
                                      >
                                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                        <span className="sr-only">Actions for {supplierProduct.supplier_description ?? "supplier line"}</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="!z-[200] min-w-[160px] rounded-[var(--radius-lg)] border border-[var(--border)] !bg-[var(--card)] p-1.5 shadow-[var(--shadow-md)]"
                                    >
                                      {canWrite && effectivePrice && (
                                        taxReviewRouteByPriceId.get(effectivePrice.id) === "simple_forward_confirmation"
                                        || taxReviewRouteByPriceId.get(effectivePrice.id) === "advanced_review"
                                      ) ? (
                                        <DropdownMenuItem
                                          onSelect={() => handleOpenConfirmSupplierPriceTaxBasis(
                                            effectivePrice,
                                            taxReviewRouteByPriceId.get(effectivePrice.id) as Extract<PriceTaxReviewRoute, "simple_forward_confirmation" | "advanced_review">,
                                          )}
                                          className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                                        >
                                          <Check className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                                          {taxReviewRouteByPriceId.get(effectivePrice.id) === "simple_forward_confirmation"
                                            ? "Confirm Tax Setup"
                                            : "Review Tax Setup"}
                                        </DropdownMenuItem>
                                      ) : null}
                                      {canWrite && effectivePrice ? (
                                        <DropdownMenuItem
                                          onSelect={() => handleOpenUpdateSupplierPrice(effectivePrice)}
                                          className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                                        >
                                          <Pencil className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                                          Update Price
                                        </DropdownMenuItem>
                                      ) : null}
                                      {canWrite && effectivePrice && !supplierProduct.is_preferred ? (
                                        <DropdownMenuItem
                                          disabled={preferredPricePendingId !== null}
                                          onSelect={() => void handleMakePreferredSupplierPrice(effectivePrice.id)}
                                          className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                                        >
                                          <Star className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                                          Make Preferred
                                        </DropdownMenuItem>
                                      ) : null}
                                      <DropdownMenuItem
                                        onSelect={() => handleViewSupplierPriceHistory(supplierProduct.id)}
                                        className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                                      >
                                        <History className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                                        View History
                                      </DropdownMenuItem>
                                      {canWrite ? <DropdownMenuSeparator className="my-1 bg-[var(--border)]" /> : null}
                                      {canWrite && !supplierProductHasPriceHistory(supplierProduct.id) ? (
                                        <DropdownMenuItem
                                          onSelect={() => handleOpenMoveSupplierProduct(supplierProduct.id)}
                                          className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]"
                                        >
                                          <ArrowRightLeft className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                                          Move Supplier Item
                                        </DropdownMenuItem>
                                      ) : null}
                                      {canWrite ? (
                                        <DropdownMenuItem
                                          onSelect={() => handleOpenRemoveSupplierProduct(supplierProduct.id)}
                                          className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-sm font-medium text-[var(--error)] focus:bg-[var(--error-light)]"
                                        >
                                          <Archive className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                                          Remove Supplier Item
                                        </DropdownMenuItem>
                                      ) : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </OperationalTableCell>
                            </OperationalTableRow>
                          ))}
                        </OperationalTableBody>
                      </OperationalTable>
                    </div>
                  )}
                </section>

                {archivedMaterialSupplierProducts.length > 0 ? (
                  <details className="border-b border-[var(--border)] py-1">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2">
                        Archived Supplier Items
                        <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                          {archivedMaterialSupplierProducts.length}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </summary>
                    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white">
                      <OperationalTable className="min-w-[760px]">
                        <OperationalTableHeader>
                          <OperationalTableRow>
                            <OperationalTableHead>Supplier</OperationalTableHead>
                            <OperationalTableHead>Supplier Item</OperationalTableHead>
                            <OperationalTableHead>Source Unit</OperationalTableHead>
                            <OperationalTableHead>Archived Date</OperationalTableHead>
                            <OperationalTableHead>Reason</OperationalTableHead>
                            <OperationalTableHead className="text-right">Actions</OperationalTableHead>
                          </OperationalTableRow>
                        </OperationalTableHeader>
                        <OperationalTableBody>
                          {archivedMaterialSupplierProducts.map((supplierProduct) => {
                            const lifecycleEvent = latestLifecycleEventByProductId.get(supplierProduct.id);
                            return (
                              <OperationalTableRow key={supplierProduct.id}>
                                <OperationalTableCell>{supplierNameById.get(supplierProduct.supplier_id) ?? "Unknown supplier"}</OperationalTableCell>
                                <OperationalTableCell>{supplierProduct.supplier_description ?? supplierProduct.supplier_sku ?? "Supplier item"}</OperationalTableCell>
                                <OperationalTableCell>{supplierProduct.supplier_unit}</OperationalTableCell>
                                <OperationalTableCell>{supplierProduct.archived_at ? formatMaterialDate(supplierProduct.archived_at) : "—"}</OperationalTableCell>
                                <OperationalTableCell>{lifecycleEvent?.event_type === "archived" ? lifecycleEvent.reason : "Archived before lifecycle tracking"}</OperationalTableCell>
                                <OperationalTableCell>
                                  <div className="flex justify-end gap-2">
                                    <Button type="button" size="sm" variant="secondary" onClick={() => handleViewSupplierPriceHistory(supplierProduct.id)}>
                                      View History
                                    </Button>
                                    {canWrite ? (
                                      <Button type="button" size="sm" variant="secondary" onClick={() => { setError(null); setRestoreSupplierProductId(supplierProduct.id); }}>
                                        <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                        Restore Supplier Item
                                      </Button>
                                    ) : null}
                                  </div>
                                </OperationalTableCell>
                              </OperationalTableRow>
                            );
                          })}
                        </OperationalTableBody>
                      </OperationalTable>
                    </div>
                  </details>
                ) : null}

                {isPriceHistoryOpen ? (
                  <details
                    ref={priceHistoryRef}
                    open
                    onToggle={(event) => setIsPriceHistoryOpen(event.currentTarget.open)}
                    className="scroll-mt-4 border-b border-[var(--border)]"
                  >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                    <span>Price History</span>
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", isPriceHistoryOpen && "rotate-180")}
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="space-y-3 border-t border-[var(--border)] py-4">
                    {historySupplierProductId ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3 py-2">
                        <p className="text-sm text-[var(--text-secondary)]">
                          Showing history for{" "}
                          {supplierProductById.get(historySupplierProductId)?.supplier_description ??
                            supplierNameById.get(supplierProductById.get(historySupplierProductId)?.supplier_id ?? "") ??
                            "selected supplier line"}
                        </p>
                        <Button variant="secondary" size="sm" onClick={() => setHistorySupplierProductId(null)}>
                          Show All History
                        </Button>
                      </div>
                    ) : null}

                    {visibleMaterialPriceRows.length === 0 ? (
                      <OperationalEmptyState
                        title="No history yet"
                        description="Supplier price history will appear here as prices are added or imported."
                        icon={<TrendingUp className="h-5 w-5" />}
                      />
                    ) : (
                      visibleMaterialPriceRows.map((price) => (
                        <article
                          key={price.id}
                          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium text-[var(--text-primary)]">
                                {supplierNameById.get(price.supplier_id) ?? "Unknown supplier"}
                              </p>
                              <p className="text-sm text-[var(--text-secondary)]">
                                {price.supplier_description ?? "Supplier item not recorded"}
                                {price.supplier_sku ? ` · SKU ${price.supplier_sku}` : ""}
                              </p>
                            </div>
                            <StatusBadge status={effectivePriceIds.has(price.id) ? "active" : "draft"}>
                              {effectivePriceIds.has(price.id) ? "Effective" : "Historical"}
                            </StatusBadge>
                          </div>
                          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            <DrawerField
                              label="Supplier Price"
                              value={`${formatMaterialMoney(Number(price.unit_cost), price.currency, initialData.companyCurrency)} / ${price.unit}`}
                            />
                            <DrawerField label="Currency" value={price.currency || initialData.companyCurrency} />
                            <DrawerField label="Source Tax Basis" value={price.source_tax_basis.replace(/_/g, " ")} />
                            <DrawerField
                              label="Tax Evidence Status"
                              value={taxEvidenceReviewByPriceId.get(price.id)?.needsReview ? "Tax evidence needs review" : "Complete"}
                            />
                            <DrawerField label="Applied Tax Policy / Rate" value={price.comparison_tax_rate === null ? "Unavailable" : `${price.tax_jurisdiction_code ?? "Unknown"} · ${Number(price.comparison_tax_rate).toFixed(2).replace(/\.00$/, "")}%`} />
                            <DrawerField label="Normalized Supplier Cost" value={priceHistoryComparisonById.get(price.id)?.normalizedSupplierUnitCost !== null && priceHistoryComparisonById.get(price.id)?.normalizedSupplierUnitCost !== undefined ? `${formatMaterialMoney(priceHistoryComparisonById.get(price.id)!.normalizedSupplierUnitCost!, price.currency, initialData.companyCurrency)} / ${price.unit}` : "Unavailable"} />
                            <DrawerField
                              label="Conversion"
                              value={
                                priceHistoryComparisonById.get(price.id)?.effectiveConversion
                                  ? formatConfirmedConversion({
                                      supplierQuantity: priceHistoryComparisonById.get(price.id)!.effectiveConversion!.supplier_quantity,
                                      supplierUnit: priceHistoryComparisonById.get(price.id)!.effectiveConversion!.supplier_unit,
                                      materialQuantity: priceHistoryComparisonById.get(price.id)!.effectiveConversion!.material_quantity,
                                      materialUnit: priceHistoryComparisonById.get(price.id)!.effectiveConversion!.material_unit,
                                    })
                                  : priceHistoryComparisonById.get(price.id)?.comparisonStatus === "comparable"
                                    ? "Not required"
                                    : "Unavailable"
                              }
                            />
                            <DrawerField
                              label="Comparable Material Cost"
                              value={
                                priceHistoryComparisonById.get(price.id)?.comparisonStatus === "comparable"
                                && priceHistoryComparisonById.get(price.id)?.comparableUnitCost !== null
                                  ? `${formatMaterialMoney(
                                      priceHistoryComparisonById.get(price.id)?.comparableUnitCost,
                                      price.currency,
                                      initialData.companyCurrency,
                                    )} / ${priceHistoryComparisonById.get(price.id)?.comparisonUnit}`
                                  : "Unavailable"
                              }
                            />
                            <DrawerField label="Effective From" value={formatMaterialDate(price.effective_from)} />
                            <DrawerField
                              label="Effective To"
                              value={price.effective_to ? formatMaterialDate(price.effective_to) : "Current"}
                            />
                            <DrawerField label="Source" value={price.source} />
                          </div>
                          <details className="mt-3 text-xs text-[var(--text-secondary)]">
                            <summary className="cursor-pointer font-medium">Technical details</summary>
                            <div className="mt-2 grid gap-1 sm:grid-cols-2">
                              <span>Price ID: {price.id}</span>
                              <span>Supplier Product: {price.supplier_product_id ?? "—"}</span>
                              <span>Predecessor: {price.supersedes_price_id ?? "—"}</span>
                            </div>
                          </details>
                        </article>
                      ))
                    )}
                  </div>
                  </details>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeSupplierProductId)} onOpenChange={(open) => {
        if (!open && !supplierProductLifecyclePending) setRemoveSupplierProductId(null);
      }}>
        <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-hidden p-0">
          <div className="flex max-h-[92vh] flex-col">
            <div className="shrink-0 px-7 pb-6 pt-7">
              <DialogTitle className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                Remove Supplier Item
              </DialogTitle>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 pb-5">
              {removeSupplierProduct && selectedMaterial ? (
                <>
                  {error ? <OperationalAlert variant="error" role="alert">{error}</OperationalAlert> : null}

                  <section className="space-y-3" aria-labelledby="remove-supplier-product-context-heading">
                    <h3
                      id="remove-supplier-product-context-heading"
                      className="text-sm font-semibold text-[var(--text-primary)]"
                    >
                      Supplier Item
                    </h3>
                    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Supplier</dt>
                        <dd className="text-sm font-medium text-[var(--text-primary)]">
                          {supplierNameById.get(removeSupplierProduct.supplier_id) ?? "Unknown supplier"}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Supplier Item</dt>
                        <dd className="text-sm font-medium text-[var(--text-primary)]">
                          {removeSupplierProduct.supplier_description ?? removeSupplierProduct.supplier_sku ?? "Supplier item"}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Material</dt>
                        <dd className="text-sm font-medium text-[var(--text-primary)]">{selectedMaterial.name}</dd>
                      </div>
                    </dl>
                  </section>

                  {removeSupplierProduct.is_preferred ? (
                    <OperationalAlert variant="warning">
                      This is currently the preferred supplier item. Removing it will clear the preferred supplier. No replacement will be selected automatically.
                    </OperationalAlert>
                  ) : null}

                  <div>
                    <FieldLabel htmlFor="remove-supplier-product-reason">Reason</FieldLabel>
                    <select
                      id="remove-supplier-product-reason"
                      className={cn(FIELD_SELECT_CLASS, "h-11")}
                      value={removeSupplierProductReason}
                      disabled={supplierProductLifecyclePending}
                      onChange={(event) => setRemoveSupplierProductReason(event.target.value)}
                    >
                      {SUPPLIER_PRODUCT_ARCHIVE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                    </select>
                  </div>

                  <div>
                    <FieldLabel htmlFor="remove-supplier-product-note">Note (optional)</FieldLabel>
                    <textarea
                      id="remove-supplier-product-note"
                      className={FIELD_TEXTAREA_CLASS}
                      value={removeSupplierProductNote}
                      disabled={supplierProductLifecyclePending}
                      onChange={(event) => setRemoveSupplierProductNote(event.target.value)}
                    />
                  </div>

                </>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 gap-3 border-t border-[var(--border)] px-7 py-5 sm:space-x-0">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={supplierProductLifecyclePending}
                onClick={() => setRemoveSupplierProductId(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={supplierProductLifecyclePending || !removeSupplierProductReason.trim()}
                onClick={() => void handleRemoveSupplierProduct()}
              >
                {supplierProductLifecyclePending ? "Removing..." : "Remove Supplier Item"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(restoreSupplierProductId)} onOpenChange={(open) => {
        if (!open && !supplierProductLifecyclePending) setRestoreSupplierProductId(null);
      }}>
        <DialogContent className="w-full max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Restore Supplier Item?</DialogTitle>
            <DialogDescription>This will return the supplier item to active pricing. It will not become preferred automatically.</DialogDescription>
          </DialogHeader>
          {error ? <OperationalAlert variant="error" role="alert">{error}</OperationalAlert> : null}
          {restoreSupplierProduct ? (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-4 text-sm">
              <p className="font-semibold">{supplierNameById.get(restoreSupplierProduct.supplier_id) ?? "Unknown supplier"}</p>
              <p>{restoreSupplierProduct.supplier_description ?? restoreSupplierProduct.supplier_sku ?? "Supplier item"}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={supplierProductLifecyclePending} onClick={() => setRestoreSupplierProductId(null)}>Cancel</Button>
            <Button type="button" variant="orange" disabled={supplierProductLifecyclePending} onClick={() => void handleRestoreSupplierProduct()}>
              {supplierProductLifecyclePending ? "Restoring..." : "Restore Supplier Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveSupplierProductId)} onOpenChange={(open) => {
        if (!open && !supplierProductLifecyclePending) setMoveSupplierProductId(null);
      }}>
        <DialogContent className="w-full max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Move Supplier Item</DialogTitle>
            <DialogDescription>Move a price-free Supplier Product to the Material it was intended to match.</DialogDescription>
          </DialogHeader>
          {error ? <OperationalAlert variant="error" role="alert">{error}</OperationalAlert> : null}
          {moveSupplierProduct && selectedMaterial ? (
            <div className="space-y-4">
              <DrawerField label="Current Material" value={selectedMaterial.name} />
              <div>
                <FieldLabel htmlFor="move-supplier-product-material">Move to Material</FieldLabel>
                <MaterialMoveCombobox
                  materials={initialData.materials}
                  excludedMaterialId={selectedMaterial.id}
                  selectedMaterialId={moveTargetMaterialId}
                  disabled={supplierProductLifecyclePending}
                  onSelect={setMoveTargetMaterialId}
                />
              </div>
              <div>
                <FieldLabel htmlFor="move-supplier-product-reason">Reason</FieldLabel>
                <Input id="move-supplier-product-reason" value={moveSupplierProductReason} disabled={supplierProductLifecyclePending} onChange={(event) => setMoveSupplierProductReason(event.target.value)} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={supplierProductLifecyclePending} onClick={() => setMoveSupplierProductId(null)}>Cancel</Button>
            <Button type="button" variant="orange" disabled={supplierProductLifecyclePending || !moveTargetMaterialId || !moveSupplierProductReason.trim()} onClick={() => void handleMoveSupplierProduct()}>
              {supplierProductLifecyclePending ? "Moving..." : "Move Supplier Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditMaterialOpen} onOpenChange={handleEditMaterialOpenChange}>
        <DialogContent
          className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            materialActionsTriggerRef.current?.focus();
          }}
        >
          <form onSubmit={handleSaveMaterialDetails}>
            <div className="px-7 pb-6 pt-7">
              <DialogTitle className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                Edit Material
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-[var(--text-secondary)]">
                Update the core material identity separately from supplier pricing.
              </DialogDescription>
            </div>

            <div className="space-y-3.5 px-7 pb-4">
              {error ? <OperationalAlert variant="error" role="alert">{error}</OperationalAlert> : null}
              <div className="grid gap-4">
                <div>
                  <FieldLabel htmlFor="material-name">Material Name</FieldLabel>
                  <Input
                    id="material-name"
                    value={materialForm.name}
                    onChange={(event) => setMaterialForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={isSavingMaterialIdentity}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="material-description">Description</FieldLabel>
                  <textarea
                    id="material-description"
                    value={materialForm.description}
                    onChange={(event) =>
                      setMaterialForm((current) => ({ ...current, description: event.target.value }))
                    }
                    className={FIELD_TEXTAREA_CLASS}
                    disabled={isSavingMaterialIdentity}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="material-unit">Unit</FieldLabel>
                    <Input
                      id="material-unit"
                      value={materialForm.defaultUnit}
                      onChange={(event) =>
                        setMaterialForm((current) => ({ ...current, defaultUnit: event.target.value }))
                      }
                      disabled={isSavingMaterialIdentity}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="material-category">Trade / Category</FieldLabel>
                    <Input
                      id="material-category"
                      value={materialForm.category}
                      onChange={(event) =>
                        setMaterialForm((current) => ({ ...current, category: event.target.value }))
                      }
                      disabled={isSavingMaterialIdentity}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={materialForm.isActive}
                    onChange={(event) =>
                      setMaterialForm((current) => ({ ...current, isActive: event.target.checked }))
                    }
                    disabled={isSavingMaterialIdentity}
                  />
                  Active
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 px-7 pb-7 pt-5">
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={isSavingMaterialIdentity}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="orange" disabled={isSavingMaterialIdentity}>
                {isSavingMaterialIdentity ? "Saving..." : "Save Material Identity"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddPriceOpen} onOpenChange={setIsAddPriceOpen}>
        <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0">
          <div className={supplierPriceModalMode === "confirm_tax_simple" ? "px-6 pb-4 pt-6 sm:px-7 sm:pt-7" : "px-7 pb-6 pt-7"}>
            <DialogTitle className="m-0 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
              {supplierPriceModalMode === "confirm_tax_simple"
                ? "Confirm Tax Setup"
                : supplierPriceModalMode === "confirm_tax_advanced"
                ? "Review Tax Setup"
                : supplierPriceModalMode === "update"
                  ? "Update Supplier Price"
                  : "Add Supplier Line"}
            </DialogTitle>
            {supplierPriceModalMode !== "update" ? <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {supplierPriceModalMode === "confirm_tax_simple"
                ? "Use your current company tax settings so this supplier price can be used for estimating from now forward."
                : supplierPriceModalMode === "confirm_tax_advanced"
                ? "Review the immutable source evidence, choose the applicable existing policy and effective time, then create a linked same-price version."
                : "Create a supplier item with its initial price while preserving price history."}
            </p> : null}
          </div>

          <div className="space-y-3.5 px-7 pb-4">
            {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
            {supplierPriceModalMode === "confirm_tax_simple" ? (
              <div className="space-y-4" data-testid="simple-tax-confirmation">
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4 sm:px-5">
                  <p className="text-sm text-[var(--text-secondary)]">This supplier price is confirmed as:</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                    {formatMaterialMoney(Number(supplierPriceForm.unitCost), supplierPriceForm.currency, initialData.companyCurrency)} / {displayMaterialPricingUnit(supplierPriceForm.unit)} · {materialImportTaxBasisLabel(supplierPriceForm.sourceTaxBasis, initialData.taxPolicy)}
                  </p>
                  {selectedPriceTaxReview?.sourceEvidenceExcerpt ? (
                    <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                      Supplier evidence: {selectedPriceTaxReview.sourceEvidenceExcerpt}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  TradesStack will apply your current company tax settings so this price can be used for estimating from now forward.
                </p>
                <CommercialSummaryCard title="Estimating Rate" className="border-[var(--border)] bg-[var(--surface)] shadow-sm">
                  <p className="text-lg font-semibold text-[var(--text-primary)]">
                    {supplierPricePreview?.comparisonStatus === "comparable" && supplierPricePreview.comparableUnitCost !== null
                      ? `${formatMaterialMoney(supplierPricePreview.comparableUnitCost, supplierPriceForm.currency, initialData.companyCurrency)} / ${displayMaterialPricingUnit(supplierPricePreview.comparisonUnit ?? supplierPriceForm.unit)}`
                      : `${formatMaterialMoney(Number(supplierPriceForm.unitCost), supplierPriceForm.currency, initialData.companyCurrency)} / ${displayMaterialPricingUnit(supplierPriceForm.unit)}`}
                  </p>
                </CommercialSummaryCard>
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  The original supplier price and evidence will remain unchanged in history.
                </p>
              </div>
            ) : supplierPriceModalMode === "confirm_tax_advanced" ? (
              <CommercialSummaryCard title="Original immutable evidence" className="border-[var(--border)] bg-[var(--surface-muted)] shadow-sm">
                <div className="space-y-2.5 text-[13px]">
                  <CommercialSummaryRow label="Supplier Price ID" value={supplierPriceForm.previousSupplierPriceId} />
                  <CommercialSummaryRow
                    label="Source Price"
                    value={`${formatMaterialMoney(Number(supplierPriceForm.unitCost), supplierPriceForm.currency, initialData.companyCurrency)} / ${displayMaterialPricingUnit(supplierPriceForm.unit)}`}
                  />
                  <CommercialSummaryRow label="Source Effective From" value={selectedPriceTaxReview ? formatMaterialDate(selectedPriceTaxReview.effectiveFrom) : "Unavailable"} />
                  <CommercialSummaryRow label="Current Evidence Status" value="Tax evidence needs review" />
                  <CommercialSummaryRow label="Supplier Source Evidence" value={selectedPriceTaxReview?.sourceEvidenceExcerpt ?? "No source excerpt retained — confirm the source tax basis deliberately."} />
                  <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    The source price is preserved, but TradesStack cannot use it for estimating until an applicable organization tax policy is confirmed. This does not assert that today&apos;s policy applied at the original source date.
                  </p>
                </div>
              </CommercialSummaryCard>
            ) : null}
            {supplierPriceModalMode !== "confirm_tax_simple" ? <div className="grid gap-4">
              <div>
                <FieldLabel htmlFor="price-supplier">Supplier</FieldLabel>
                <select
                  id="price-supplier"
                  value={supplierPriceForm.supplierId}
                  onChange={(event) =>
                    setSupplierPriceForm((current) => ({ ...current, supplierId: event.target.value }))
                  }
                  className={FIELD_SELECT_CLASS}
                  disabled={isSavingSupplierPrice || supplierPriceModalMode !== "create"}
                  required
                >
                  <option value="">Select supplier</option>
                  {initialData.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="price-description">Supplier Item / Description</FieldLabel>
                <Input
                  id="price-description"
                  value={supplierPriceForm.supplierDescription}
                  onChange={(event) =>
                    setSupplierPriceForm((current) => ({
                      ...current,
                      supplierDescription: event.target.value,
                    }))
                  }
                  disabled={isSavingSupplierPrice || supplierPriceModalMode !== "create"}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <FieldLabel htmlFor="price-unit">Unit</FieldLabel>
                  <Input
                    id="price-unit"
                    value={supplierPriceForm.unit}
                    onChange={(event) =>
                      setSupplierPriceForm((current) => ({ ...current, unit: event.target.value }))
                    }
                    disabled={isSavingSupplierPrice || supplierPriceModalMode !== "create"}
                    required
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="price-cost">Unit Cost</FieldLabel>
                  <Input
                    id="price-cost"
                    value={supplierPriceForm.unitCost}
                    onChange={(event) =>
                      setSupplierPriceForm((current) => ({ ...current, unitCost: event.target.value }))
                    }
                    disabled={isSavingSupplierPrice || supplierPriceModalMode === "confirm_tax_advanced"}
                    required
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="price-currency">Currency</FieldLabel>
                  <Input
                    id="price-currency"
                    value={supplierPriceForm.currency}
                    readOnly
                    aria-readonly="true"
                    className="bg-[var(--surface-muted)]"
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="price-tax-basis">Source Tax Basis</FieldLabel>
                <select id="price-tax-basis" className={FIELD_SELECT_CLASS} value={supplierPriceForm.sourceTaxBasis}
                  disabled={isSavingSupplierPrice}
                  onChange={(event) => setSupplierPriceForm((current) => ({ ...current, sourceTaxBasis: event.target.value as SourceTaxBasis, sourceTaxRate: null }))}>
                  <option value="unknown">Unknown</option>
                  <option value="inclusive">Tax Inclusive</option>
                  <option value="exclusive">Tax Exclusive</option>
                  <option value="zero_rated">Zero Rated</option>
                  <option value="exempt">Exempt</option>
                  <option value="no_tax">No Tax</option>
                </select>
              </div>
              {supplierPriceModalMode !== "confirm_tax_advanced" ? (
                <>
                  <div>
                    <FieldLabel htmlFor="price-tax-outcome">Tax Evidence Outcome</FieldLabel>
                    <select
                      id="price-tax-outcome"
                      className={FIELD_SELECT_CLASS}
                      value={supplierPriceForm.taxEvidenceIntent}
                      onChange={(event) => setSupplierPriceForm((current) => ({
                        ...current,
                        taxEvidenceIntent: event.target.value as PriceTaxEvidenceIntent | "",
                      }))}
                      disabled={isSavingSupplierPrice}
                      required
                    >
                      <option value="">Choose outcome</option>
                      <option value="canonical_ready" disabled={!initialData.taxPolicy || supplierPriceForm.sourceTaxBasis === "unknown"}>Complete — canonical-ready</option>
                      <option value="needs_review">Save incomplete — needs tax review</option>
                    </select>
                  </div>
                  {supplierPriceForm.taxEvidenceIntent === "needs_review" ? (
                    <div>
                      <FieldLabel htmlFor="price-tax-review-reason">Why is tax evidence incomplete?</FieldLabel>
                      <Input
                        id="price-tax-review-reason"
                        value={supplierPriceForm.incompleteTaxReason}
                        onChange={(event) => setSupplierPriceForm((current) => ({ ...current, incompleteTaxReason: event.target.value }))}
                        placeholder="Supplier source does not establish the applicable tax policy."
                        disabled={isSavingSupplierPrice}
                        required
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <CommercialSummaryCard title="Applicable organization policy" className="border-[var(--border)] bg-[var(--surface)] shadow-sm">
                    <div className="space-y-2.5 text-[13px]">
                      <CommercialSummaryRow label="Jurisdiction" value={initialData.taxPolicy?.jurisdictionCode ?? "No current policy"} />
                      <CommercialSummaryRow label="Comparison Basis" value={initialData.taxPolicy?.comparisonBasis ?? "Unavailable"} />
                      <CommercialSummaryRow label="Comparison Rate" value={initialData.taxPolicy ? `${initialData.taxPolicy.standardRate}%` : "Unavailable"} />
                      <CommercialSummaryRow label="Policy Effective From" value={initialData.taxPolicy ? formatMaterialDate(initialData.taxPolicy.effectiveFrom) : "Unavailable"} />
                    </div>
                  </CommercialSummaryCard>
                  <div>
                    <FieldLabel htmlFor="price-tax-correction-effective">New Price Effective From</FieldLabel>
                    <Input
                      id="price-tax-correction-effective"
                      type="datetime-local"
                      max={currentLocalDateTime()}
                      value={supplierPriceForm.correctionEffectiveFrom}
                      onChange={(event) => setSupplierPriceForm((current) => ({ ...current, correctionEffectiveFrom: event.target.value }))}
                      disabled={isSavingSupplierPrice}
                      required
                    />
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Defaults to now. The original effective date is not copied or backdated.</p>
                  </div>
                  <div>
                    <FieldLabel htmlFor="price-tax-correction-reason">Confirmation Reason</FieldLabel>
                    <textarea
                      id="price-tax-correction-reason"
                      className={FIELD_TEXTAREA_CLASS}
                      value={supplierPriceForm.correctionReason}
                      onChange={(event) => setSupplierPriceForm((current) => ({ ...current, correctionReason: event.target.value }))}
                      placeholder="Confirmed the current organization tax policy for this Supplier Price from today."
                      disabled={isSavingSupplierPrice}
                      required
                    />
                  </div>
                </>
              )}
            </div> : null}

            {supplierPriceModalMode === "create" || supplierPriceModalMode === "update" ? <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={supplierPriceForm.isPreferred}
                onChange={(event) =>
                  setSupplierPriceForm((current) => ({ ...current, isPreferred: event.target.checked }))
                }
                disabled={isSavingSupplierPrice}
              />
              Set as Preferred Supplier
            </label> : null}

            {supplierPriceModalMode === "update" && selectedMaterial ? (
              <section
                className="border-t border-[var(--border)] pt-4"
                aria-labelledby="supplier-price-material-pricing-heading"
              >
                <CommercialSummaryCard
                  className="border-[var(--border)] bg-[var(--surface)] shadow-sm"
                  title={<span id="supplier-price-material-pricing-heading">Material Pricing</span>}
                >
                  <div className="space-y-2.5 text-[13px]">
                    <CommercialSummaryRow label="Material" value={selectedMaterial.name} />
                    <CommercialSummaryRow
                      label="Material Unit"
                      value={displayMaterialPricingUnit(selectedMaterial.default_unit)}
                    />
                    <CommercialSummaryRow
                      label="Supplier Price"
                      value={supplierPriceForm.unitCost.trim()
                        && Number.isFinite(Number(supplierPriceForm.unitCost))
                        ? `${formatMaterialMoney(
                            Number(supplierPriceForm.unitCost),
                            supplierPriceForm.currency,
                            initialData.companyCurrency,
                          )} / ${displayMaterialPricingUnit(supplierPriceForm.unit)}`
                        : "Unavailable"}
                    />
                    <CommercialSummaryRow
                      label="Tax Basis"
                      value={materialImportTaxBasisLabel(
                        supplierPriceForm.sourceTaxBasis,
                        initialData.taxPolicy,
                      )}
                    />
                    <CommercialSummaryRow
                      label="Conversion"
                      value={supplierPriceUnitsMatch
                        ? "No conversion required"
                        : supplierPriceModalConversion
                          ? formatConfirmedConversion({
                              supplierQuantity: supplierPriceModalConversion.supplier_quantity,
                              supplierUnit: displayMaterialPricingUnit(supplierPriceModalConversion.supplier_unit),
                              materialQuantity: supplierPriceModalConversion.material_quantity,
                              materialUnit: displayMaterialPricingUnit(supplierPriceModalConversion.material_unit),
                            })
                          : "Conversion required"}
                    />
                    <div className="h-px bg-[var(--border)]" aria-hidden="true" />
                    <CommercialSummaryRow
                      label="Comparable Material Cost"
                      value={
                        supplierPricePreview?.comparisonStatus === "comparable"
                        && supplierPricePreview.comparableUnitCost !== null
                        ? `${formatMaterialMoney(
                            supplierPricePreview.comparableUnitCost,
                            supplierPriceForm.currency,
                            initialData.companyCurrency,
                          )} / ${displayMaterialPricingUnit(
                            supplierPricePreview.comparisonUnit ?? selectedMaterial.default_unit,
                          )}`
                        : supplierPricePreview?.comparisonStatus === "unknown_tax_basis"
                          ? <span className="text-[var(--text-secondary)]">Unavailable — price tax basis unknown</span>
                          : supplierPricePreview?.comparisonStatus === "non_comparable"
                            ? <span className="text-[var(--text-secondary)]">Unavailable — unit conversion required</span>
                            : supplierPricePreview
                          ? <span className="text-[var(--text-secondary)]">Unavailable — tax policy not supported</span>
                          : <span className="text-[var(--text-secondary)]">Enter a valid Supplier Unit Cost</span>
                      }
                      className="pt-0.5"
                      labelClassName="text-[15px] font-semibold text-[var(--text-primary)]"
                      valueClassName="text-[15px] font-semibold text-[var(--text-primary)]"
                    />
                  </div>

                  {!supplierPriceUnitsMatch && supplierPriceModalConversion ? (
                    <details className="group mt-4 border-t border-[var(--border-subtle)] pt-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        View conversion details
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="mt-3 space-y-1.5 text-xs leading-5 text-[var(--text-secondary)]">
                        {conversionEvidenceSummary(supplierPriceModalConversion.proposal_metadata) ? (
                          <p>{conversionEvidenceSummary(supplierPriceModalConversion.proposal_metadata)}</p>
                        ) : null}
                        <p>Confirmed {formatMaterialDate(supplierPriceModalConversion.confirmed_at)}</p>
                      </div>
                    </details>
                  ) : null}
                </CommercialSummaryCard>
              </section>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isSavingSupplierPrice}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => void handleAddSupplierPrice()}
              disabled={
                isSavingSupplierPrice
                || (supplierPriceModalMode === "confirm_tax_simple" && selectedPriceTaxRoute !== "simple_forward_confirmation")
                || (supplierPriceModalMode === "confirm_tax_advanced" && (
                  supplierPriceForm.sourceTaxBasis === "unknown"
                  || !initialData.taxPolicy
                  || !supplierPriceForm.correctionEffectiveFrom
                  || supplierPriceForm.correctionReason.trim().length < 8
                ))
                || ((supplierPriceModalMode === "create" || supplierPriceModalMode === "update") && !supplierPriceForm.taxEvidenceIntent)
                || ((supplierPriceModalMode === "create" || supplierPriceModalMode === "update")
                  && supplierPriceForm.taxEvidenceIntent === "canonical_ready"
                  && supplierPriceForm.sourceTaxBasis === "unknown")
                || ((supplierPriceModalMode === "create" || supplierPriceModalMode === "update")
                  && supplierPriceForm.taxEvidenceIntent === "needs_review"
                  && supplierPriceForm.incompleteTaxReason.trim().length < 8)
              }
            >
              {isSavingSupplierPrice
                ? "Saving..."
                : supplierPriceModalMode === "confirm_tax_simple"
                  ? "Confirm & Use"
                  : supplierPriceModalMode === "confirm_tax_advanced" || supplierPriceModalMode === "update"
                    ? "Save New Price Version"
                  : "Add Supplier Line"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent
          align="top"
          className="flex h-[92vh] max-h-[92vh] w-[min(1480px,96vw)] max-w-none flex-col overflow-hidden p-0"
        >
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
            <DialogTitle className="text-2xl tracking-[-0.02em]">{importDialogTitle}</DialogTitle>
          </div>
          {!reviewBatch ? (
            <>
              <main className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
                  <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
                    <MaterialImportUploadZone
                      file={importFile}
                      disabled={isUploadingImport}
                      onSelectFile={(file) => {
                        setImportFile(file);
                        setError(null);
                      }}
                      onValidationError={setError}
                    />

                    <div className="shrink-0">
                      <div className="flex items-center justify-between gap-3">
                        <FieldLabel htmlFor="import-supplier">Supplier</FieldLabel>
                        {canCreateSupplier ? (
                          <Button
                            ref={addSupplierTriggerRef}
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="mb-1.5"
                            data-testid="material-import-add-supplier"
                            onClick={() => setIsAddSupplierOpen(true)}
                            disabled={isUploadingImport}
                          >
                            + Add Supplier
                          </Button>
                        ) : null}
                      </div>
                      <ImportSupplierCombobox
                        key={importSupplierId || "no-supplier"}
                        id="import-supplier"
                        suppliers={supplierOptions}
                        selectedSupplierId={importSupplierId}
                        disabled={isUploadingImport}
                        onSelect={(supplierId) => {
                          setImportSupplierId(supplierId);
                          setError(null);
                        }}
                      />
                    </div>

                    {error ? (
                      <OperationalAlert variant="error" role="alert" className="shrink-0">
                        {error}
                      </OperationalAlert>
                    ) : null}
                  </div>
                </div>
              </main>

              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
                    {materialImportUploadStatus({
                      supplierId: importSupplierId,
                      fileName: importFile?.name ?? null,
                      isUploading: isUploadingImport,
                    })}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <DialogClose asChild>
                      <Button type="button" variant="secondary">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      type="button"
                      variant="orange"
                      onClick={() => void handleStartImport()}
                      disabled={!importSupplierId || !importFile || isUploadingImport}
                    >
                      {isUploadingImport ? "Importing..." : "Import"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {!isImportProcessing ? (
                <div className="shrink-0 border-b border-[var(--border)] px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-[var(--text-primary)]">{reviewBatch.file_name}</h2>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {importSupplierName} · {isImportFailure
                          ? reviewBatch.status === "cancelled" ? "Interpretation cancelled" : "Interpretation needs attention"
                          : `${reviewRows.length} row${reviewRows.length === 1 ? "" : "s"} ready for review`}
                      </p>
                    </div>
                    {isImportReview ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleAddReviewRow()}
                        className="h-8 rounded-none border-0 bg-transparent px-0 text-[var(--text-secondary)] shadow-none hover:bg-transparent hover:text-[var(--text-primary)]"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Row
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className={`mx-auto w-full max-w-[1400px] ${isImportProcessing ? "flex h-full items-center justify-center" : ""}`}>
                  {error ? <OperationalAlert variant="error" role="alert" className="mb-4">{error}</OperationalAlert> : null}
                  {isImportProcessing ? (
                    <MaterialImportProgress />
                  ) : isImportFailure ? (
                    <MaterialImportFailure
                      status={reviewBatch.status}
                      errorCode={importProcessing?.errorCode ?? null}
                    />
                  ) : (
                    <MaterialImportReviewPanel
                      batchId={reviewBatch.id}
                      rows={reviewRows}
                      selectedRowIds={selectedReviewRowIds}
                      materials={initialData.materials}
                      supplierId={reviewBatch.supplier_id}
                      supplierProducts={initialData.supplierProducts}
                      unitConversions={initialData.unitConversions}
                      lifecycleEvents={initialData.supplierProductLifecycleEvents}
                      companyCurrency={initialData.companyCurrency}
                      taxPolicy={initialData.taxPolicy}
                      onSelectedRowIdsChange={(rowIds) => {
                        setSelectedReviewRowIds(rowIds);
                        setReviewRows((current) => current.map((row) =>
                          row.approvalError?.code === "duplicate_supplier_product_target"
                            ? { ...row, approvalError: null }
                            : row
                        ));
                      }}
                      onUpdateRow={(rowId, updates) => setReviewRows((current) => current.map((row) =>
                        row.id === rowId ? { ...row, ...updates, approvalError: null } : row
                      ))}
                    />
                  )}
                </div>
              </main>

              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
                {isImportProcessing ? (
                  <div className="flex justify-end">
                    <Button type="button" variant="secondary" disabled={isUpdatingImportLifecycle} onClick={() => void handleCancelImport()}>
                      {isUpdatingImportLifecycle ? "Cancelling..." : "Cancel"}
                    </Button>
                  </div>
                ) : isImportFailure ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button type="button" variant="secondary" onClick={handleBackFromImportBatch} disabled={isUpdatingImportLifecycle}>
                      Back
                    </Button>
                    <Button type="button" variant="orange" onClick={() => void handleReprocessImport()} disabled={isUpdatingImportLifecycle}>
                      {isUpdatingImportLifecycle ? "Starting..." : "Try Again"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
                      {selectedReviewRowIds.length} of {reviewRows.length} selected
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="secondary" onClick={handleBackFromImportBatch} disabled={isSubmittingImportReview}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleRejectSelectedRows()}
                        disabled={selectedReviewRowIds.length === 0 || isSubmittingImportReview}
                      >
                        {isSubmittingImportReview ? "Working..." : "Reject Selected"}
                      </Button>
                      <Button
                        type="button"
                        variant="orange"
                        onClick={() => void handleApproveSelectedRows()}
                        disabled={selectedReviewRowIds.length === 0 || isSubmittingImportReview}
                      >
                        {isSubmittingImportReview ? "Working..." : "Approve Selected"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AddSupplierDialog
        open={isAddSupplierOpen}
        onOpenChange={setIsAddSupplierOpen}
        onCreated={handleImportSupplierCreated}
        returnFocusRef={addSupplierTriggerRef}
      />
    </div>
  );
}
