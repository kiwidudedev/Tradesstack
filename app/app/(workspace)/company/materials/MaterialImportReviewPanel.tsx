"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, CircleMinus, Loader2, XCircle } from "lucide-react";
import {
  CommercialLineItemsCell,
  CommercialLineItemsRow,
  CommercialLineItemsTable,
  CommercialLineTextInput,
  CommercialSummaryCard,
  CommercialSummaryRow,
} from "@/components/app/CommercialLineItemsTable";
import styles from "@/components/app/trade-pack-builder.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deriveComparableMaterialPrice } from "@/lib/materials/effective-price";
import { formatMaterialMoney } from "@/lib/materials/normalization";
import type {
  ConfirmedMaterialUnitConversion,
  MaterialUnitConversionProposal,
} from "@/lib/materials/unit-conversion/contract";
import type { MaterialUnitConversionErrorCode } from "@/lib/materials/unit-conversion/errors";
import {
  materialConversionUnitsEqual,
  normalizeMaterialConversionUnit,
} from "@/lib/materials/unit-conversion/normalize-unit";
import { calculateComparableMaterialUnitCost } from "@/lib/materials/unit-conversion/pricing";
import type {
  MaterialImportRowAction,
  OrganizationMaterialRow,
  OrganizationMaterialSupplierProductRow,
  OrganizationMaterialSupplierProductLifecycleEventRow,
  OrganizationMaterialSupplierProductUnitConversionRow,
} from "@/lib/materials/types";
import type { OrganizationTaxPolicy, SourceTaxBasis } from "@/lib/tax/types";

export type MaterialImportPriceOption = {
  priceKey: string;
  label: string;
  amount: number | null;
  currency: string;
  evidence: string;
  dateLabel: string;
  taxBasis?: SourceTaxBasis;
  sourceTaxRate?: number | null;
  taxEvidence?: string;
};

export type MaterialImportReviewRowState = {
  id: string;
  action: MaterialImportRowAction;
  matchedMaterialId: string;
  reviewedName: string;
  reviewedDescription: string;
  supplierUnit: string;
  supplierUnitReadOnly: boolean;
  materialUnit: string;
  confirmedUnitConversion: ConfirmedMaterialUnitConversion | null;
  reviewedUnitCost: string;
  reviewedCurrency: string;
  reviewedTaxBasis?: SourceTaxBasis;
  reviewedSourceTaxRate?: number | null;
  taxEvidence?: string;
  reviewedSupplierDescription: string;
  reviewedSupplierSku: string;
  status: string;
  selectedPriceKey: string;
  recommendedPriceKey: string;
  priceOptions: MaterialImportPriceOption[];
  packLabel: string;
  interpretationWarnings: string[];
  confidence: number | null;
  approvalError?: { code: string; message: string } | null;
  allowDuplicateSourceObservation?: boolean;
  acknowledgeIncompleteTaxEvidence?: boolean;
  incompleteTaxReason?: string;
  archivedSupplierProductId?: string | null;
  archivedSupplierProductResolution?: "restore" | "create_distinct" | null;
  identityVariant?: string;
};

type MaterialImportReviewPanelProps = {
  batchId?: string;
  rows: MaterialImportReviewRowState[];
  selectedRowIds: string[];
  materials: OrganizationMaterialRow[];
  supplierId?: string | null;
  supplierProducts?: OrganizationMaterialSupplierProductRow[];
  unitConversions?: OrganizationMaterialSupplierProductUnitConversionRow[];
  lifecycleEvents?: OrganizationMaterialSupplierProductLifecycleEventRow[];
  companyCurrency?: string;
  taxPolicy?: OrganizationTaxPolicy | null;
  onSelectedRowIdsChange: (rowIds: string[]) => void;
  onUpdateRow: (rowId: string, updates: Partial<MaterialImportReviewRowState>) => void;
};

export function materialImportTaxBasisLabel(
  basis: SourceTaxBasis,
  policy: OrganizationTaxPolicy | null = null,
) {
  const taxName = policy?.taxName.trim() || "Tax";
  switch (basis) {
    case "inclusive": return `Incl. ${taxName}`;
    case "exclusive": return `Excl. ${taxName}`;
    case "zero_rated": return "Zero Rated";
    case "exempt": return "Exempt";
    case "no_tax": return "No Tax";
    default: return "Unknown";
  }
}

function materialImportPriceSourceLabel(
  price: MaterialImportPriceOption,
  policy: OrganizationTaxPolicy | null,
) {
  if (!price.taxBasis) return price.label;
  const basisLabel = materialImportTaxBasisLabel(price.taxBasis, policy);
  const suffix = [` (${basisLabel})`, ` ${basisLabel}`].find((candidate) => price.label.endsWith(candidate));
  return suffix ? price.label.slice(0, -suffix.length) : price.label;
}

function materialImportTaxBasisOptions(
  policy: OrganizationTaxPolicy | null,
  selectedBasis: SourceTaxBasis,
) {
  const options: SourceTaxBasis[] = ["inclusive", "exclusive", "zero_rated", "exempt", "no_tax", "unknown"];
  if (!policy || policy.supportsInclusiveExclusive) return options;
  return options.filter((basis) =>
    (basis !== "inclusive" && basis !== "exclusive") || basis === selectedBasis
  );
}

export type UnitConversionDraft = {
  status: "idle" | "converting" | "proposal" | "needs_information" | "not_convertible" | "error";
  proposal: MaterialUnitConversionProposal | null;
  error: string | null;
  errorCode?: MaterialUnitConversionErrorCode | null;
  additionalFacts?: Array<{ value: string; unit: string; label: string }>;
  /** Compatibility for in-flight review state created before multiple facts. */
  additionalValue?: string;
  additionalUnit?: string;
  additionalLabel?: string;
};

const EMPTY_UNIT_CONVERSION_DRAFT: UnitConversionDraft = {
  status: "idle",
  proposal: null,
  error: null,
  errorCode: null,
  additionalFacts: [{ value: "", unit: "", label: "" }],
};

const REVIEW_GRID_TEMPLATE =
  "44px minmax(280px,2fr) 84px minmax(170px,1fr) minmax(260px,1.4fr) minmax(190px,1fr) 120px";
const DETAIL_SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
      {children}
    </label>
  );
}

function ReviewSectionHeading({
  id,
  step,
  title,
  helper,
}: {
  id: string;
  step: number;
  title: string;
  helper: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        data-testid={`review-step-marker-${step}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--orange-soft)] text-xs font-semibold text-[var(--orange-primary)]"
      >
        {step}
      </span>
      <div className="min-w-0">
        <h4 id={id} className="text-sm font-semibold uppercase tracking-[0.035em] text-[var(--text-primary)]">
          {title}
        </h4>
        <p className="mt-0.5 text-xs leading-4 text-[var(--text-secondary)]">{helper}</p>
      </div>
    </div>
  );
}

export function materialImportRowNeedsAttention(row: MaterialImportReviewRowState) {
  return Boolean(
    row.approvalError
      || !row.reviewedName.trim()
      || !row.materialUnit.trim()
      || !row.reviewedUnitCost.trim()
      || !Number.isFinite(Number(row.reviewedUnitCost))
      || row.interpretationWarnings.length > 0
      || (row.priceOptions.length > 1 && !row.selectedPriceKey)
      || (row.action === "match_material" && !row.matchedMaterialId),
  );
}

export function materialImportRowStatusLabel(row: MaterialImportReviewRowState) {
  if (row.status === "approved") return "Approved";
  if (row.status === "rejected") return "Rejected";
  if (row.action === "skip") return "Skipped";
  return materialImportRowNeedsAttention(row) ? "Needs Attention" : "Ready";
}

function detailsPresentation(label: ReturnType<typeof materialImportRowStatusLabel>) {
  if (label === "Ready" || label === "Approved") {
    return {
      stateLabel: label.toLowerCase(),
      className: "border-[var(--status-approved)]/20 bg-[var(--status-approved-light)] text-[var(--status-approved)] hover:bg-[var(--status-approved-light)]",
      icon: CheckCircle2,
    };
  }
  if (label === "Needs Attention") {
    return {
      stateLabel: "needs attention",
      className: "border-[var(--status-overdue)]/20 bg-[var(--status-overdue-light)] text-[var(--status-overdue)] hover:bg-[var(--status-overdue-light)]",
      icon: AlertTriangle,
    };
  }
  if (label === "Rejected") {
    return {
      stateLabel: "rejected",
      className: "border-[var(--status-overdue)]/20 bg-[var(--status-overdue-light)] text-[var(--status-overdue)] hover:bg-[var(--status-overdue-light)]",
      icon: XCircle,
    };
  }
  return {
    stateLabel: "skipped",
    className: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]",
    icon: CircleMinus,
  };
}

function recommendedPrice(row: MaterialImportReviewRowState) {
  return row.priceOptions.find((price) => price.priceKey === row.recommendedPriceKey) ?? null;
}

export type MaterialImportReviewPricingPresentation = {
  sourceAmount: number | null;
  sourceUnit: string | null;
  currency: string | null;
  normalizedSupplierCost: number | null;
  comparableMaterialCost: number | null;
  comparisonUnit: string | null;
  taxComparisonStatus: ReturnType<typeof deriveComparableMaterialPrice>["comparisonStatus"] | "invalid_source";
  unitComparisonStatus: "same_unit" | "converted" | "missing_conversion" | "invalid_source";
  summaryAmount: number | null;
  summaryUnit: string | null;
  summaryStatus: "comparable" | "source" | "unavailable";
};

export function deriveMaterialImportReviewPricingPresentation(
  row: MaterialImportReviewRowState,
  taxPolicy: OrganizationTaxPolicy | null,
): MaterialImportReviewPricingPresentation {
  const selectedSourcePrice = row.priceOptions.find((price) => price.priceKey === row.selectedPriceKey) ?? null;
  const selectedSourceTaxBasis = selectedSourcePrice?.taxBasis ?? "unknown";
  const reviewedTaxBasis = row.reviewedTaxBasis ?? "unknown";
  const sourceAmount = Number(row.reviewedUnitCost);
  const validSourceAmount = Number.isFinite(sourceAmount) ? sourceAmount : null;
  const sourceUnit = normalizeMaterialConversionUnit(row.supplierUnit) || null;
  const materialUnit = normalizeMaterialConversionUnit(row.materialUnit) || null;
  const unitsMatch = Boolean(sourceUnit && materialUnit && sourceUnit === materialUnit);
  const confirmedConversion = row.confirmedUnitConversion;
  const hasCurrentConversion = Boolean(
    confirmedConversion
      && normalizeMaterialConversionUnit(confirmedConversion.supplierUnit) === sourceUnit
      && normalizeMaterialConversionUnit(confirmedConversion.materialUnit) === materialUnit
  );
  const previewSourceTaxRate = reviewedTaxBasis === selectedSourceTaxBasis
    ? row.reviewedSourceTaxRate
    : null;
  const comparablePreview = validSourceAmount !== null
    ? deriveComparableMaterialPrice({
        sourceUnitCost: validSourceAmount,
        sourceUnit: row.supplierUnit,
        materialUnit: row.materialUnit,
        sourceTaxBasis: reviewedTaxBasis,
        sourceTaxRate: previewSourceTaxRate,
        taxPolicy,
        effectiveConversion: confirmedConversion ? {
          supplier_unit: confirmedConversion.supplierUnit,
          material_unit: confirmedConversion.materialUnit,
          supplier_quantity: confirmedConversion.supplierQuantity,
          material_quantity: confirmedConversion.materialQuantity,
        } as OrganizationMaterialSupplierProductUnitConversionRow : null,
      })
    : null;
  const comparableMaterialCost = comparablePreview?.comparisonStatus === "comparable"
    ? comparablePreview.comparableUnitCost
    : null;
  const summaryStatus = comparableMaterialCost !== null ? "comparable" : validSourceAmount !== null ? "source" : "unavailable";

  return {
    sourceAmount: validSourceAmount,
    sourceUnit,
    currency: row.reviewedCurrency || selectedSourcePrice?.currency || null,
    normalizedSupplierCost: comparablePreview?.normalizedSupplierUnitCost ?? null,
    comparableMaterialCost,
    comparisonUnit: comparablePreview?.comparisonUnit ?? materialUnit,
    taxComparisonStatus: comparablePreview?.comparisonStatus ?? "invalid_source",
    unitComparisonStatus: validSourceAmount === null
      ? "invalid_source"
      : unitsMatch
        ? "same_unit"
        : hasCurrentConversion
          ? "converted"
          : "missing_conversion",
    summaryAmount: comparableMaterialCost ?? validSourceAmount,
    summaryUnit: comparableMaterialCost !== null
      ? comparablePreview?.comparisonUnit ?? materialUnit
      : sourceUnit,
    summaryStatus,
  };
}

function normalizeExistingMaterialSearch(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function materialSearchTokenMatchesWord(token: string, word: string) {
  if (word.startsWith(token)) return true;
  if (token.length < 3 || word[0] !== token[0]) return false;
  let tokenIndex = 0;
  for (const character of word) {
    if (character === token[tokenIndex]) tokenIndex += 1;
    if (tokenIndex === token.length) return true;
  }
  return false;
}

export function filterExistingMaterials(
  materials: OrganizationMaterialRow[],
  query: string,
  limit = 50,
) {
  const normalizedQuery = normalizeExistingMaterialSearch(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  return materials
    .filter((material) => material.is_active !== false && !material.archived_at)
    .map((material, originalIndex) => {
      const normalizedName = normalizeExistingMaterialSearch(material.name);
      const searchable = normalizeExistingMaterialSearch([
        material.name,
        material.normalized_name,
        material.description,
        material.category,
      ].filter(Boolean).join(" "));
      const searchableWords = searchable.split(" ").filter(Boolean);
      const tokenMatch = queryTokens.every((token) =>
        searchable.includes(token) || searchableWords.some((word) => materialSearchTokenMatchesWord(token, word))
      );

      if (normalizedQuery && !tokenMatch) return null;

      const score = !normalizedQuery
        ? 4
        : normalizedName === normalizedQuery
          ? 0
          : normalizedName.startsWith(normalizedQuery)
            ? 1
            : queryTokens.every((token) => normalizedName.split(" ").some((word) => materialSearchTokenMatchesWord(token, word)))
              ? 2
              : 3;

      return { material, score, originalIndex };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) =>
      left.score - right.score
      || left.material.name.localeCompare(right.material.name)
      || left.originalIndex - right.originalIndex
    )
    .slice(0, limit)
    .map((candidate) => candidate.material);
}

export function moveExistingMaterialActiveIndex(
  currentIndex: number,
  optionCount: number,
  direction: "next" | "previous",
) {
  if (optionCount === 0) return 0;
  return direction === "next"
    ? (currentIndex + 1) % optionCount
    : (currentIndex - 1 + optionCount) % optionCount;
}

function ExistingMaterialInput({
  id,
  rowLabel,
  matchedMaterialId,
  materials,
  onSelect,
}: {
  id: string;
  rowLabel: string;
  matchedMaterialId: string;
  materials: OrganizationMaterialRow[];
  onSelect: (materialId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedMaterial = materials.find((material) => material.id === matchedMaterialId);
  const selectedMaterialName = selectedMaterial?.name ?? "";
  const [query, setQuery] = useState(selectedMaterialName);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = `${id}-options`;
  const filteredMaterials = useMemo(() => {
    const matches = filterExistingMaterials(materials, query);
    if (query.trim() || !selectedMaterial) return matches;
    return [selectedMaterial, ...matches.filter((material) => material.id !== selectedMaterial.id)];
  }, [materials, query, selectedMaterial]);
  const activeMaterial = filteredMaterials[activeIndex] ?? null;

  function openSearch() {
    if (open) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function closeSearch() {
    setOpen(false);
    setQuery(selectedMaterialName);
    setActiveIndex(0);
  }

  function selectMaterial(material: OrganizationMaterialRow) {
    onSelect(material.id);
    setQuery(material.name);
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
        aria-activedescendant={open && activeMaterial ? `${id}-option-${activeMaterial.id}` : undefined}
        aria-label={`Existing Material match for ${rowLabel}`}
        placeholder="Search materials..."
        autoComplete="off"
        className="pr-10"
        data-testid={`existing-material-combobox-${id}`}
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
            setActiveIndex((current) => moveExistingMaterialActiveIndex(current, filteredMaterials.length, "next"));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              openSearch();
              return;
            }
            setActiveIndex((current) => moveExistingMaterialActiveIndex(current, filteredMaterials.length, "previous"));
          } else if (event.key === "Enter" && open && activeMaterial) {
            event.preventDefault();
            selectMaterial(activeMaterial);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            closeSearch();
          }
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close existing Materials" : "Show existing Materials"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--text-secondary)]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => open ? closeSearch() : openSearch()}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Existing Materials"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
        >
          {filteredMaterials.length > 0 ? filteredMaterials.map((material, optionIndex) => (
            <button
              key={material.id}
              id={`${id}-option-${material.id}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={material.id === matchedMaterialId}
              className={`flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--text-primary)] ${
                optionIndex === activeIndex ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]"
              }`}
              onMouseEnter={() => setActiveIndex(optionIndex)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMaterial(material)}
            >
              <span className="min-w-0 truncate">{material.name}</span>
              {material.id === matchedMaterialId ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            </button>
          )) : (
            <p className="px-3 py-3 text-center text-sm text-[var(--text-secondary)]">No materials found</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MaterialImportReviewRow({
  row,
  index,
  selected,
  expanded,
  materials,
  onSelectedChange,
  onExpandedChange,
  onUpdate,
  batchId = "",
  supplierId = null,
  supplierProducts = [],
  unitConversions = [],
  lifecycleEvents = [],
  companyCurrency = "NZD",
  taxPolicy = null,
  conversionDraft = EMPTY_UNIT_CONVERSION_DRAFT,
  onConversionDraftChange = () => undefined,
}: {
  row: MaterialImportReviewRowState;
  index: number;
  selected: boolean;
  expanded: boolean;
  materials: OrganizationMaterialRow[];
  supplierId?: string | null;
  supplierProducts?: OrganizationMaterialSupplierProductRow[];
  unitConversions?: OrganizationMaterialSupplierProductUnitConversionRow[];
  lifecycleEvents?: OrganizationMaterialSupplierProductLifecycleEventRow[];
  companyCurrency?: string;
  taxPolicy?: OrganizationTaxPolicy | null;
  onSelectedChange: (selected: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
  onUpdate: (updates: Partial<MaterialImportReviewRowState>) => void;
  batchId?: string;
  conversionDraft?: UnitConversionDraft;
  onConversionDraftChange?: (updates: Partial<UnitConversionDraft>) => void;
}) {
  const rowLabel = row.reviewedName.trim() || `import row ${index + 1}`;
  const normalizeIdentity = (value: string | null | undefined) =>
    (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const reviewedSku = normalizeIdentity(row.reviewedSupplierSku);
  const reviewedDescription = normalizeIdentity(row.reviewedSupplierDescription);
  const matchesReviewedSupplierIdentity = (candidate: OrganizationMaterialSupplierProductRow) =>
        candidate.material_id === row.matchedMaterialId
        && candidate.supplier_id === supplierId
        && normalizeMaterialConversionUnit(candidate.supplier_unit) === normalizeMaterialConversionUnit(row.supplierUnit)
        && (reviewedSku
          ? candidate.normalized_supplier_sku === reviewedSku
          : !candidate.normalized_supplier_sku && candidate.normalized_supplier_description === reviewedDescription);
  const activeSupplierProductMatch = row.action === "match_material" && row.matchedMaterialId && supplierId
    ? supplierProducts.find((candidate) =>
        candidate.is_active && !candidate.archived_at && matchesReviewedSupplierIdentity(candidate)
      ) ?? null
    : null;
  const archivedSupplierProductMatch = row.action === "match_material" && row.matchedMaterialId && supplierId && !activeSupplierProductMatch
    ? supplierProducts.find((candidate) =>
        (!candidate.is_active || Boolean(candidate.archived_at)) && matchesReviewedSupplierIdentity(candidate)
      ) ?? null
    : null;
  const archivedMatchEvent = archivedSupplierProductMatch
    ? lifecycleEvents.find((event) =>
        event.supplier_product_id === archivedSupplierProductMatch.id && event.event_type === "archived"
      ) ?? null
    : null;
  const statusLabel = materialImportRowStatusLabel(row);
  const details = detailsPresentation(statusLabel);
  const DetailsStateIcon = details.icon;
  const suggestedPrice = recommendedPrice(row);
  const detailId = `material-import-row-details-${row.id}`;
  const unitsDiffer = Boolean(row.supplierUnit.trim() && row.materialUnit.trim())
    && !materialConversionUnitsEqual(row.supplierUnit, row.materialUnit);
  const conversionEligible = row.status !== "approved" && row.status !== "rejected" && row.action !== "skip";
  const showConversion = conversionEligible && unitsDiffer;
  const confirmedConversion = row.confirmedUnitConversion;
  const reviewedTaxBasis = row.reviewedTaxBasis ?? "unknown";
  const selectedSourcePrice = row.priceOptions.find((price) => price.priceKey === row.selectedPriceKey) ?? null;
  const selectedSourceTaxBasis = selectedSourcePrice?.taxBasis ?? "unknown";
  const pricingPresentation = deriveMaterialImportReviewPricingPresentation(row, taxPolicy);
  const taxNormalizationStatus = pricingPresentation.taxComparisonStatus;
  const taxNeedsReview = taxNormalizationStatus === "unknown_tax_basis"
    || taxNormalizationStatus === "missing_tax_policy"
    || taxNormalizationStatus === "unsupported_tax_jurisdiction"
    || taxNormalizationStatus === "tax_rate_conflict";
  const normalizedSupplierCost = pricingPresentation.normalizedSupplierCost;
  const comparableMaterialCost = pricingPresentation.comparableMaterialCost;
  const summaryCurrency = pricingPresentation.currency || companyCurrency;
  const formatReviewMoney = (value: number | null | undefined, currency = companyCurrency) =>
    formatMaterialMoney(value, currency, companyCurrency);
  const displayUnit = (unit: string) => normalizeMaterialConversionUnit(unit) === "m2" ? "m²" : unit;
  const sourcePriceValue = pricingPresentation.sourceAmount === null
    ? "Unavailable"
    : `${formatReviewMoney(pricingPresentation.sourceAmount, summaryCurrency)} ${summaryCurrency}${pricingPresentation.sourceUnit ? ` / ${displayUnit(pricingPresentation.sourceUnit)}` : ""}`;
  const clearProposal = () => onConversionDraftChange({
    status: "idle",
    proposal: null,
    error: null,
    errorCode: null,
  });
  const conversionErrorMessage = (code: MaterialUnitConversionErrorCode | null) => {
    switch (code) {
      case "needs_information":
        return `More product information is required to convert ${row.supplierUnit} to ${displayUnit(row.materialUnit)}.`;
      case "unsafe_conversion":
        return "TradesStack could not verify a safe conversion from the available product information.";
      case "not_convertible":
        return "These units cannot be safely converted from the available product information.";
      case "invalid_context":
        return "The selected Material or source price has changed. Review the conversion again.";
      default:
        return "Unit conversion is temporarily unavailable.";
    }
  };

  async function requestConversion() {
    if (!batchId || !showConversion || row.selectedPriceKey === "manual" || conversionDraft.status === "converting") return;
    const supplementalFacts = conversionDraft.additionalFacts ?? [{
      value: conversionDraft.additionalValue ?? "",
      unit: conversionDraft.additionalUnit ?? "",
      label: conversionDraft.additionalLabel ?? "",
    }];
    const populatedFacts = supplementalFacts.filter((fact) => fact.value.trim() || fact.unit.trim() || fact.label.trim());
    if (populatedFacts.some((fact) => !Number.isFinite(Number(fact.value)) || Number(fact.value) <= 0 || !fact.unit.trim())) {
      onConversionDraftChange({ status: "error", error: "Enter a positive additional value and unit.", errorCode: "invalid_context" });
      return;
    }
    onConversionDraftChange({ status: "converting", proposal: null, error: null, errorCode: null });
    try {
      const response = await fetch(`/api/materials/imports/${batchId}/rows/${row.id}/unit-conversion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedMaterialUnit: row.materialUnit,
          selectedPriceKey: row.selectedPriceKey,
          ...(row.action === "match_material" && row.matchedMaterialId
            ? { selectedMaterialId: row.matchedMaterialId }
            : {}),
          additionalInformation: populatedFacts.length ? populatedFacts.map((fact) => ({
            value: Number(fact.value), unit: fact.unit, label: fact.label || undefined,
          })) : undefined,
        }),
      });
      const payload = await response.json() as {
        proposal?: MaterialUnitConversionProposal;
        error?: string;
        code?: MaterialUnitConversionErrorCode;
      };
      if (!response.ok || !payload.proposal) {
        const code = payload.code ?? "provider_unavailable";
        onConversionDraftChange({
          status: "error",
          proposal: null,
          errorCode: code,
          error: conversionErrorMessage(code),
        });
        return;
      }
      const proposal = payload.proposal;
      onConversionDraftChange({
        proposal,
        error: null,
        errorCode: null,
        status: proposal.status === "convertible"
          ? "proposal"
          : proposal.status === "needs_information"
            ? "needs_information"
            : proposal.status === "not_convertible"
              ? "not_convertible"
              : "idle",
      });
    } catch {
      onConversionDraftChange({
        status: "error",
        proposal: null,
        errorCode: "provider_unavailable",
        error: conversionErrorMessage("provider_unavailable"),
      });
    }
  }

  function useConversion() {
    const proposal = conversionDraft.proposal;
    if (
      !proposal
      || proposal.status !== "convertible"
      || proposal.supplierQuantity === null
      || proposal.materialQuantity === null
      || proposal.convertedUnitCost === null
    ) return;
    onUpdate({
      materialUnit: normalizeMaterialConversionUnit(row.materialUnit),
      confirmedUnitConversion: {
        supplierQuantity: proposal.supplierQuantity,
        supplierUnit: normalizeMaterialConversionUnit(row.supplierUnit),
        materialQuantity: proposal.materialQuantity,
        materialUnit: normalizeMaterialConversionUnit(row.materialUnit),
        convertedUnitCost: proposal.convertedUnitCost,
        currency: companyCurrency,
        contractVersion: proposal.contractVersion,
        source: "user_confirmed_ai",
        explanation: proposal.explanation,
        confidence: proposal.confidence,
        selectedMaterialId: proposal.selectedMaterialId,
        selectedMaterialUpdatedAt: proposal.selectedMaterialUpdatedAt,
        contextHash: proposal.contextHash,
        basis: proposal.basis,
        evidenceRefs: proposal.evidenceRefs,
        evidenceSummary: proposal.evidenceSummary,
        promptVersion: proposal.promptVersion,
        additionalInformation: proposal.additionalInformation,
      },
    });
    clearProposal();
  }

  function existingConfirmedConversion(materialId: string) {
    const normalizeIdentity = (value: string | null | undefined) =>
      (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const sku = normalizeIdentity(row.reviewedSupplierSku);
    const description = normalizeIdentity(row.reviewedSupplierDescription);
    const product = supplierProducts.find((candidate) =>
      candidate.material_id === materialId
      && candidate.supplier_id === supplierId
      && normalizeMaterialConversionUnit(candidate.supplier_unit) === normalizeMaterialConversionUnit(row.supplierUnit)
      && candidate.is_active
      && !candidate.archived_at
      && (sku
        ? candidate.normalized_supplier_sku === sku
        : !candidate.normalized_supplier_sku && candidate.normalized_supplier_description === description)
    );
    if (!product) return null;
    return unitConversions.find((conversion) =>
      conversion.supplier_product_id === product.id && conversion.effective_to === null
    ) ?? null;
  }

  function updateAction(action: MaterialImportRowAction) {
    onUpdate({
      action,
      archivedSupplierProductId: null,
      archivedSupplierProductResolution: null,
      identityVariant: "",
      ...(action === "create_material" ? {
        matchedMaterialId: "",
        materialUnit: row.supplierUnit,
        confirmedUnitConversion: null,
      } : {}),
    });
    clearProposal();
    if (action === "match_material") onExpandedChange(true);
  }

  function selectMatchedMaterial(materialId: string) {
    const matchedMaterial = materials.find((material) => material.id === materialId);
    if (!matchedMaterial) {
      onUpdate({
        matchedMaterialId: "",
        materialUnit: row.supplierUnit,
        confirmedUnitConversion: null,
        archivedSupplierProductId: null,
        archivedSupplierProductResolution: null,
        identityVariant: "",
      });
      clearProposal();
      return;
    }

    const existingConversion = existingConfirmedConversion(matchedMaterial.id);
    const sourceUnitCost = Number(row.reviewedUnitCost);
    const convertedUnitCost = existingConversion && Number.isFinite(sourceUnitCost) && sourceUnitCost >= 0
      ? calculateComparableMaterialUnitCost({
          supplierUnitCost: sourceUnitCost,
          supplierQuantity: Number(existingConversion.supplier_quantity),
          materialQuantity: Number(existingConversion.material_quantity),
        })
      : null;
    onUpdate({
      matchedMaterialId: matchedMaterial.id,
      materialUnit: matchedMaterial.default_unit,
      archivedSupplierProductId: null,
      archivedSupplierProductResolution: null,
      identityVariant: "",
      confirmedUnitConversion: existingConversion && convertedUnitCost !== null ? {
        supplierQuantity: Number(existingConversion.supplier_quantity),
        supplierUnit: existingConversion.supplier_unit,
        materialQuantity: Number(existingConversion.material_quantity),
        materialUnit: existingConversion.material_unit,
        convertedUnitCost,
        currency: companyCurrency,
        contractVersion: "material_unit_conversion_v1",
        source: existingConversion.source === "user_confirmed_manual"
          ? "user_confirmed_manual"
          : "user_confirmed_ai",
        explanation: "Existing confirmed Supplier Product conversion.",
        confidence: null,
        selectedMaterialId: matchedMaterial.id,
        selectedMaterialUpdatedAt: matchedMaterial.updated_at,
        contextHash: null,
        basis: null,
        evidenceRefs: [],
        evidenceSummary: null,
        promptVersion: null,
        additionalInformation: null,
      } : null,
    });
    clearProposal();
  }

  const selectionControl = (
    <input
      type="checkbox"
      checked={selected}
      aria-label={`Select ${rowLabel}`}
      onChange={(event) => onSelectedChange(event.target.checked)}
      className="h-4 w-4 accent-[var(--orange-primary)]"
    />
  );

  const decisionControl = (
    <select
      value={row.action}
      aria-label={`Material Library decision for ${rowLabel}`}
      onChange={(event) => updateAction(event.target.value as MaterialImportRowAction)}
      className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
    >
      <option value="create_material">Create New</option>
      <option value="match_material">Match Existing</option>
      <option value="skip">Skip</option>
    </select>
  );

  const detailsControl = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-expanded={expanded}
      aria-controls={detailId}
      aria-label={`Details — ${details.stateLabel} for ${rowLabel}`}
      className={`h-9 min-w-[104px] gap-1.5 px-2.5 ${details.className}`}
      onClick={() => onExpandedChange(!expanded)}
    >
      <DetailsStateIcon className="h-3.5 w-3.5" aria-hidden="true" />
      Details
      {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
    </Button>
  );

  return (
    <article
      data-testid={`material-import-review-row-${row.id}`}
      className={row.approvalError ? "bg-[var(--status-overdue-light)]/35" : "bg-[var(--surface)]"}
    >
      <div className="hidden items-center lg:grid" style={{ gridTemplateColumns: REVIEW_GRID_TEMPLATE }}>
        <div className="flex items-center justify-center px-3 py-2.5">{selectionControl}</div>
        <div className="min-w-0 px-3 py-2.5">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={row.reviewedName}>
            {row.reviewedName || "Unnamed Material"}
          </p>
          {row.approvalError ? (
            <p className="mt-0.5 truncate text-xs text-[var(--status-overdue)]" title={row.approvalError.message}>
              Needs attention
            </p>
          ) : null}
        </div>
        <div className="border-l border-[var(--border-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)]">
          <span data-testid={`compact-summary-unit-${row.id}`}>{pricingPresentation.summaryUnit ? displayUnit(pricingPresentation.summaryUnit) : "—"}</span>
        </div>
        <div className="min-w-0 border-l border-[var(--border-subtle)] px-3 py-2.5">
          <p className="text-sm font-medium text-[var(--text-primary)]" data-testid={`compact-summary-cost-${row.id}`}>
            {formatReviewMoney(pricingPresentation.summaryAmount, summaryCurrency)}
            <span className="ml-1 font-normal text-[var(--text-secondary)]">{summaryCurrency}</span>
          </p>
          {pricingPresentation.summaryStatus === "source" ? <p className="text-xs text-[var(--text-muted)]">Source price</p> : null}
        </div>
        <div className="min-w-0 border-l border-[var(--border-subtle)] px-3 py-2.5">
          <p className="truncate text-sm text-[var(--text-primary)]" title={row.reviewedSupplierDescription}>
            {row.reviewedSupplierDescription || "No supplier description"}
          </p>
        </div>
        <div className="border-l border-[var(--border-subtle)] px-3 py-2">{decisionControl}</div>
        <div className="flex items-center justify-center border-l border-[var(--border-subtle)] px-2 py-2">
          {detailsControl}
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 lg:hidden">
        <div className="flex items-start gap-3">
          <div className="pt-1">{selectionControl}</div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[var(--text-primary)]">{row.reviewedName || "Unnamed Material"}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {pricingPresentation.summaryUnit ? displayUnit(pricingPresentation.summaryUnit) : "—"} · {formatReviewMoney(pricingPresentation.summaryAmount, summaryCurrency)} {summaryCurrency}
              {pricingPresentation.summaryStatus === "source" ? " · Source price" : ""}
            </p>
          </div>
          {detailsControl}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">Supplier Item</p>
          <p className="mt-1 text-sm text-[var(--text-primary)]">{row.reviewedSupplierDescription || "No supplier description"}</p>
        </div>
        <div>{decisionControl}</div>
      </div>

      {expanded ? (
        <div id={detailId} className="border-t border-[var(--border)] bg-[var(--surface-muted)]/35 px-4 py-4">
          <div className="space-y-3">
            {row.approvalError ? (
              <div
                role="alert"
                data-testid={`material-import-row-error-${row.id}`}
                className="rounded-[var(--radius-md)] border border-[var(--status-overdue)]/25 bg-[var(--status-overdue-light)] px-4 py-3 text-sm text-[var(--status-overdue)]"
              >
                <p className="font-semibold">This row needs attention</p>
                <p className="mt-1">{row.approvalError.message}</p>
                {row.approvalError.code === "possible_duplicate_source_observation" ? (
                  <label className="mt-3 flex items-start gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={row.allowDuplicateSourceObservation === true}
                      onChange={(event) => onUpdate({
                        allowDuplicateSourceObservation: event.target.checked,
                      })}
                      className="mt-0.5"
                    />
                    <span>I reviewed the possible prior import and want to approve this as a new source observation.</span>
                  </label>
                ) : null}
              </div>
            ) : null}
            {archivedSupplierProductMatch ? (
              <div
                role="status"
                data-testid={`archived-supplier-product-match-${row.id}`}
                className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                <p className="font-semibold">Archived supplier item found</p>
                <p className="mt-1">
                  {archivedSupplierProductMatch.supplier_description ?? row.reviewedSupplierDescription}
                  {archivedSupplierProductMatch.archived_at
                    ? ` was removed on ${new Date(archivedSupplierProductMatch.archived_at).toLocaleDateString("en-NZ")}.`
                    : " was previously removed from active pricing."}
                </p>
                {archivedMatchEvent?.reason ? <p className="mt-1">Reason: {archivedMatchEvent.reason}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={row.archivedSupplierProductResolution === "restore" ? "orange" : "secondary"}
                    onClick={() => onUpdate({
                      archivedSupplierProductId: archivedSupplierProductMatch.id,
                      archivedSupplierProductResolution: "restore",
                      identityVariant: "",
                    })}
                  >
                    Restore Supplier Item
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={row.archivedSupplierProductResolution === "create_distinct" ? "orange" : "secondary"}
                    onClick={() => onUpdate({
                      archivedSupplierProductId: archivedSupplierProductMatch.id,
                      archivedSupplierProductResolution: "create_distinct",
                    })}
                  >
                    Keep Archived / Create Distinct Item
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onUpdate({
                      matchedMaterialId: "",
                      archivedSupplierProductId: null,
                      archivedSupplierProductResolution: null,
                      identityVariant: "",
                      confirmedUnitConversion: null,
                    })}
                  >
                    Select Another Material
                  </Button>
                </div>
                {row.archivedSupplierProductResolution === "create_distinct" ? (
                  <div className="mt-3 max-w-sm">
                    <FieldLabel htmlFor={`identity-variant-${row.id}`}>Distinct Identity Variant</FieldLabel>
                    <Input
                      id={`identity-variant-${row.id}`}
                      value={row.identityVariant ?? ""}
                      placeholder="e.g. alternate-pack"
                      onChange={(event) => onUpdate({ identityVariant: event.target.value })}
                    />
                    <p className="mt-1 text-xs">Required so an exact duplicate active identity is not created.</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4" aria-labelledby={`supplier-item-fields-${row.id}`}>
              <ReviewSectionHeading
                id={`supplier-item-fields-${row.id}`}
                step={1}
                title="Supplier Item"
                helper="What TradesStack identified from the supplier."
              />
              <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(180px,0.75fr)]">
                <div>
                  <FieldLabel htmlFor={`supplier-description-${row.id}`}>Supplier Description</FieldLabel>
                  <Input
                    id={`supplier-description-${row.id}`}
                    value={row.reviewedSupplierDescription}
                    onChange={(event) => {
                      onUpdate({ reviewedSupplierDescription: event.target.value, confirmedUnitConversion: null });
                      clearProposal();
                    }}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={`supplier-sku-${row.id}`}>Supplier SKU</FieldLabel>
                  <Input
                    id={`supplier-sku-${row.id}`}
                    value={row.reviewedSupplierSku}
                    placeholder="Optional"
                    onChange={(event) => {
                      onUpdate({ reviewedSupplierSku: event.target.value, confirmedUnitConversion: null });
                      clearProposal();
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4" aria-labelledby={`supplier-prices-${row.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <ReviewSectionHeading
                  id={`supplier-prices-${row.id}`}
                  step={2}
                  title="Supplier Pricing"
                  helper="Choose the supplier price and confirm its tax basis."
                />
                {suggestedPrice ? <p className="text-xs text-[var(--text-secondary)]">Suggested: {suggestedPrice.label}</p> : null}
              </div>
              <CommercialLineItemsTable
                columns={[
                  { key: "select", label: "", align: "center", className: "px-2" },
                  { key: "source", label: "Price Source" },
                  { key: "unit", label: "Supplier Unit" },
                  { key: "price", label: "Supplier Price", align: "right" },
                  { key: "tax", label: "Tax Basis" },
                ]}
                gridTemplateColumns="48px minmax(210px,1fr) minmax(130px,0.65fr) minmax(190px,0.9fr) minmax(170px,0.8fr)"
                minWidthClassName="min-w-[760px]"
                className="border-[var(--border)]"
              >
                {row.priceOptions.map((price) => {
                  const isSelected = row.selectedPriceKey === price.priceKey;
                  return (
                    <CommercialLineItemsRow
                      key={price.priceKey}
                      gridTemplateColumns="48px minmax(210px,1fr) minmax(130px,0.65fr) minmax(190px,0.9fr) minmax(170px,0.8fr)"
                      className={`transition-colors ${isSelected ? "bg-[var(--orange-soft)]" : "bg-[var(--surface)] hover:bg-[var(--surface-muted)]"}`}
                    >
                      <CommercialLineItemsCell className="justify-center px-2">
                        <input
                          type="radio"
                          name={`price-${row.id}`}
                          value={price.priceKey}
                          checked={isSelected}
                          aria-label={`Select ${price.label} for ${rowLabel}`}
                          onChange={() => {
                            onUpdate({
                              selectedPriceKey: price.priceKey,
                              reviewedUnitCost: price.amount === null ? row.reviewedUnitCost : String(price.amount),
                              reviewedCurrency: companyCurrency,
                              reviewedTaxBasis: price.taxBasis ?? "unknown",
                              reviewedSourceTaxRate: price.sourceTaxRate,
                              taxEvidence: price.taxEvidence,
                              confirmedUnitConversion: null,
                            });
                            clearProposal();
                          }}
                          className="h-4 w-4 shrink-0 accent-[var(--orange-primary)]"
                        />
                      </CommercialLineItemsCell>
                      <CommercialLineItemsCell withBorder>
                        <span className={`${isSelected ? "font-semibold" : "font-medium"} text-sm text-[var(--text-primary)]`}>
                          {materialImportPriceSourceLabel(price, taxPolicy)}
                        </span>
                      </CommercialLineItemsCell>
                      <CommercialLineItemsCell withBorder>
                        <span className="text-sm text-[var(--text-primary)]">{displayUnit(row.supplierUnit) || "—"}</span>
                      </CommercialLineItemsCell>
                      <CommercialLineItemsCell withBorder className="justify-end text-right">
                        <span className="whitespace-nowrap text-sm font-medium text-[var(--text-primary)]">
                          {formatReviewMoney(price.amount, price.currency || companyCurrency)} {price.currency || companyCurrency}
                        </span>
                      </CommercialLineItemsCell>
                      <CommercialLineItemsCell withBorder>
                        {isSelected ? (
                          <select
                            id={`price-tax-basis-${row.id}`}
                            aria-label={`Price tax basis for ${rowLabel}`}
                            className="h-9 w-full border-0 bg-transparent px-0 text-sm text-[var(--text-primary)] shadow-none focus:outline-none focus:ring-0"
                            value={reviewedTaxBasis}
                            onChange={(event) => onUpdate({ reviewedTaxBasis: event.target.value as SourceTaxBasis })}
                          >
                            {materialImportTaxBasisOptions(taxPolicy, reviewedTaxBasis).map((basis) => (
                              <option key={basis} value={basis}>{materialImportTaxBasisLabel(basis, taxPolicy)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm text-[var(--text-secondary)]">
                            {materialImportTaxBasisLabel(price.taxBasis ?? "unknown", taxPolicy)}
                          </span>
                        )}
                      </CommercialLineItemsCell>
                    </CommercialLineItemsRow>
                  );
                })}
                <CommercialLineItemsRow
                  gridTemplateColumns="48px minmax(210px,1fr) minmax(130px,0.65fr) minmax(190px,0.9fr) minmax(170px,0.8fr)"
                  className={`transition-colors ${row.selectedPriceKey === "manual" ? "bg-[var(--orange-soft)]" : "bg-[var(--surface)] hover:bg-[var(--surface-muted)]"}`}
                >
                  <CommercialLineItemsCell className="justify-center px-2">
                    <input
                      type="radio"
                      name={`price-${row.id}`}
                      value="manual"
                      checked={row.selectedPriceKey === "manual"}
                      aria-label={`Use manual price for ${rowLabel}`}
                      onChange={() => {
                        onUpdate({ selectedPriceKey: "manual", confirmedUnitConversion: null });
                        clearProposal();
                      }}
                      className="h-4 w-4 shrink-0 accent-[var(--orange-primary)]"
                    />
                  </CommercialLineItemsCell>
                  <CommercialLineItemsCell withBorder>
                    <span className={`${row.selectedPriceKey === "manual" ? "font-semibold" : "font-medium"} text-sm text-[var(--text-primary)]`}>Manual price</span>
                  </CommercialLineItemsCell>
                  <CommercialLineItemsCell withBorder>
                    <span className="text-sm text-[var(--text-primary)]">{displayUnit(row.supplierUnit) || "—"}</span>
                  </CommercialLineItemsCell>
                  <CommercialLineItemsCell withBorder className="justify-end">
                    <div className="flex w-full items-center justify-end gap-2">
                      <CommercialLineTextInput
                        value={row.reviewedUnitCost}
                        inputMode="decimal"
                        ariaLabel={`Manual price amount for ${rowLabel}`}
                        className="max-w-[96px] text-right"
                        onChange={(value) => {
                          onUpdate({ reviewedUnitCost: value, selectedPriceKey: "manual", confirmedUnitConversion: null });
                          clearProposal();
                        }}
                      />
                      <span className="whitespace-nowrap text-sm text-[var(--text-secondary)]">{companyCurrency}</span>
                    </div>
                  </CommercialLineItemsCell>
                  <CommercialLineItemsCell withBorder>
                    {row.selectedPriceKey === "manual" ? (
                      <select
                        id={`price-tax-basis-${row.id}`}
                        aria-label={`Price tax basis for ${rowLabel}`}
                        className="h-9 w-full border-0 bg-transparent px-0 text-sm text-[var(--text-primary)] shadow-none focus:outline-none focus:ring-0"
                        value={reviewedTaxBasis}
                        onChange={(event) => onUpdate({ reviewedTaxBasis: event.target.value as SourceTaxBasis })}
                      >
                        {materialImportTaxBasisOptions(taxPolicy, reviewedTaxBasis).map((basis) => (
                          <option key={basis} value={basis}>{materialImportTaxBasisLabel(basis, taxPolicy)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-[var(--text-secondary)]">
                        {materialImportTaxBasisLabel(reviewedTaxBasis, taxPolicy)}
                      </span>
                    )}
                  </CommercialLineItemsCell>
                </CommercialLineItemsRow>
              </CommercialLineItemsTable>
              {row.selectedPriceKey !== "manual" && reviewedTaxBasis !== selectedSourceTaxBasis ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  Source suggested: {materialImportTaxBasisLabel(selectedSourceTaxBasis, taxPolicy)}
                </p>
              ) : null}
            </section>

            <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4" aria-labelledby={`material-fields-${row.id}`}>
              <ReviewSectionHeading
                id={`material-fields-${row.id}`}
                step={3}
                title="Material Library"
                helper="Choose where this supplier item belongs."
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor={`material-name-${row.id}`}>Material Name</FieldLabel>
                  <Input
                    id={`material-name-${row.id}`}
                    value={row.reviewedName}
                    aria-label={`Material name for ${rowLabel}`}
                    onChange={(event) => onUpdate({ reviewedName: event.target.value })}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={`material-decision-${row.id}`}>Material Library</FieldLabel>
                  <select
                    id={`material-decision-${row.id}`}
                    value={row.action}
                    aria-label={`Expanded Material Library decision for ${rowLabel}`}
                    onChange={(event) => updateAction(event.target.value as MaterialImportRowAction)}
                    className={DETAIL_SELECT_CLASS}
                  >
                    <option value="create_material">Create New</option>
                    <option value="match_material">Match Existing</option>
                    <option value="skip">Skip</option>
                  </select>
                </div>
                {row.action === "match_material" ? (
                  <div>
                    <FieldLabel htmlFor={`matched-material-${row.id}`}>Existing Material</FieldLabel>
                    <ExistingMaterialInput
                      id={`matched-material-${row.id}`}
                      rowLabel={rowLabel}
                      matchedMaterialId={row.matchedMaterialId}
                      materials={materials}
                      onSelect={selectMatchedMaterial}
                    />
                  </div>
                ) : null}
                <div>
                  <FieldLabel htmlFor={`supplier-unit-${row.id}`}>Supplier Unit</FieldLabel>
                  <Input
                    id={`supplier-unit-${row.id}`}
                    value={row.supplierUnit}
                    aria-label={`Supplier unit for ${rowLabel}`}
                    readOnly={row.supplierUnitReadOnly}
                    placeholder="Supplier unit"
                    className={row.supplierUnitReadOnly ? "bg-[var(--surface-muted)]" : undefined}
                    onChange={(event) => {
                      onUpdate({
                        supplierUnit: event.target.value,
                        materialUnit: row.materialUnit || event.target.value,
                        confirmedUnitConversion: null,
                      });
                      clearProposal();
                    }}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={`material-unit-${row.id}`}>Material Unit</FieldLabel>
                  <Input
                    id={`material-unit-${row.id}`}
                    value={row.materialUnit}
                    aria-label={`Material unit for ${rowLabel}`}
                    list={`material-unit-options-${row.id}`}
                    disabled={conversionDraft.status === "converting"}
                    onChange={(event) => {
                      onUpdate({ materialUnit: event.target.value, confirmedUnitConversion: null });
                      clearProposal();
                    }}
                  />
                </div>
              </div>
              <datalist id={`material-unit-options-${row.id}`}>
                {['each', 'lm', 'm', 'm2', 'kg', 'box', 'pack', 'roll', 'sheet', 'bag'].map((unit) => <option key={unit} value={unit} />)}
              </datalist>
            </section>

            {showConversion ? (
              <section
                className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
                aria-labelledby={`unit-conversion-${row.id}`}
                aria-busy={conversionDraft.status === "converting"}
              >
                <ReviewSectionHeading
                  id={`unit-conversion-${row.id}`}
                  step={4}
                  title="Unit Conversion"
                  helper="Convert supplier unit to Material unit."
                />
                <div className="border-t border-[var(--border-subtle)] pt-3">
                  {confirmedConversion ? (
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="space-y-1 text-sm">
                        <p className="font-medium text-[var(--status-approved)]">✓ Conversion confirmed</p>
                        <p className="text-[var(--text-secondary)]">
                          {confirmedConversion.supplierQuantity} {displayUnit(confirmedConversion.supplierUnit)} = {confirmedConversion.materialQuantity} {displayUnit(confirmedConversion.materialUnit)}
                        </p>
                      </div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => onUpdate({ confirmedUnitConversion: null })}>Remove Conversion</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">Unit conversion required</p>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {displayUnit(row.supplierUnit)} → {displayUnit(row.materialUnit)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={conversionDraft.status === "converting" ? "Working out conversion" : "Convert Unit"}
                          disabled={!batchId || row.selectedPriceKey === "manual" || conversionDraft.status === "converting"}
                          onClick={() => void requestConversion()}
                        >
                          {conversionDraft.status === "converting" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                          {conversionDraft.status === "converting" ? "Converting…" : "Convert Unit"}
                        </Button>
                      </div>
                      {conversionDraft.status === "converting" ? (
                        <p className="text-xs text-[var(--text-secondary)]" role="status" aria-live="polite">Converting supplier pricing…</p>
                      ) : null}
                      {row.selectedPriceKey === "manual" ? <p className="text-xs text-[var(--text-secondary)]">Select an extracted supplier price to use the conversion assistant.</p> : null}

                      {conversionDraft.status === "proposal" && conversionDraft.proposal ? (
                        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-3 text-sm">
                          <p className="font-medium text-[var(--text-primary)]">Conversion found</p>
                          <p className="text-[var(--text-secondary)]">
                            {conversionDraft.proposal.supplierQuantity} {displayUnit(conversionDraft.proposal.supplierUnit)} = {conversionDraft.proposal.materialQuantity} {displayUnit(conversionDraft.proposal.requestedMaterialUnit)}
                          </p>
                          {conversionDraft.proposal.evidenceSummary ? (
                            <p className="text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">Based on:</span> {conversionDraft.proposal.evidenceSummary}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="orange" size="sm" onClick={useConversion}>Use Conversion</Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => void requestConversion()}>Try Again</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={clearProposal}>Cancel</Button>
                          </div>
                        </div>
                      ) : null}

                      {conversionDraft.status === "needs_information" ? (
                        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-3">
                          <p className="text-sm font-medium text-[var(--text-primary)]">More product information is required to convert {row.supplierUnit} to {displayUnit(row.materialUnit)}.</p>
                          {conversionDraft.proposal?.missingInformation.length ? <p className="text-xs font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">Needed</p> : null}
                          {conversionDraft.proposal?.missingInformation.length ? <p className="text-sm text-[var(--text-secondary)]">{conversionDraft.proposal.missingInformation.join('; ')}</p> : null}
                          <div className="space-y-2">
                            {(conversionDraft.additionalFacts ?? [{ value: conversionDraft.additionalValue ?? "", unit: conversionDraft.additionalUnit ?? "", label: conversionDraft.additionalLabel ?? "" }]).map((fact, index, displayedFacts) => (
                              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_120px_1.4fr_auto]">
                                <Input inputMode="decimal" value={fact.value} aria-label={`Additional conversion value ${index + 1} for ${rowLabel}`} placeholder="1200" onChange={(event) => onConversionDraftChange({ additionalFacts: displayedFacts.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item), proposal: null })} />
                                <Input value={fact.unit} aria-label={`Additional conversion unit ${index + 1} for ${rowLabel}`} placeholder="mm" onChange={(event) => onConversionDraftChange({ additionalFacts: displayedFacts.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item), proposal: null })} />
                                <Input value={fact.label} aria-label={`Additional conversion label ${index + 1} for ${rowLabel}`} placeholder="Sheet width" onChange={(event) => onConversionDraftChange({ additionalFacts: displayedFacts.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item), proposal: null })} />
                                {index === displayedFacts.length - 1 ? <Button type="button" variant="secondary" onClick={() => void requestConversion()}>Convert Again</Button> : <Button type="button" variant="ghost" onClick={() => onConversionDraftChange({ additionalFacts: displayedFacts.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button>}
                              </div>
                            ))}
                            <Button type="button" variant="ghost" size="sm" onClick={() => onConversionDraftChange({ additionalFacts: [...(conversionDraft.additionalFacts ?? [{ value: conversionDraft.additionalValue ?? "", unit: conversionDraft.additionalUnit ?? "", label: conversionDraft.additionalLabel ?? "" }]), { value: "", unit: "", label: "" }] })}>+ Add another fact</Button>
                          </div>
                        </div>
                      ) : null}

                      {conversionDraft.status === "not_convertible" ? <p className="text-sm text-[var(--status-overdue)]">These units cannot be safely converted from the available product information.</p> : null}
                      {conversionDraft.status === "error" ? <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-[var(--status-overdue)]">{conversionDraft.error || "Unit conversion is temporarily unavailable."}</p><Button type="button" variant="secondary" size="sm" onClick={() => void requestConversion()}>Try Again</Button></div> : null}
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            <section
              className="pt-0.5"
              aria-labelledby={`pricing-summary-${row.id}`}
              data-testid={`pricing-summary-section-${row.id}`}
            >
              <div className="max-w-[640px]" aria-live="polite">
                <CommercialSummaryCard
                  className="border-[var(--border)] bg-[var(--surface-muted)] shadow-sm"
                  title={(
                    <span className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        data-testid={`review-step-marker-${showConversion ? 5 : 4}`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--orange-primary)] text-xs font-semibold text-white"
                      >
                        {showConversion ? 5 : 4}
                      </span>
                      <span className="min-w-0">
                        <span id={`pricing-summary-${row.id}`} className={styles.quoteSectionTitle}>Pricing Summary</span>
                        <span className="mt-1 block text-xs font-normal leading-4 tracking-normal text-[var(--text-secondary)]">
                          Final comparable pricing for this Material.
                        </span>
                      </span>
                    </span>
                  )}
                >
                  <div className="space-y-2.5 text-[13px]">
                    <CommercialSummaryRow label="Supplier Price" value={sourcePriceValue} />
                    <CommercialSummaryRow label="Tax Basis" value={materialImportTaxBasisLabel(reviewedTaxBasis, taxPolicy)} />
                    <CommercialSummaryRow
                      label="Normalized Supplier Cost"
                      value={normalizedSupplierCost === null
                        ? "Unavailable"
                        : `${formatReviewMoney(normalizedSupplierCost, summaryCurrency)} / ${displayUnit(row.supplierUnit)}`}
                    />
                    {unitsDiffer && confirmedConversion ? (
                      <CommercialSummaryRow
                        label="Conversion"
                        value={`${confirmedConversion.supplierQuantity} ${displayUnit(confirmedConversion.supplierUnit)} = ${confirmedConversion.materialQuantity} ${displayUnit(confirmedConversion.materialUnit)}`}
                      />
                    ) : null}
                    <div className="h-px bg-[var(--border)]" aria-hidden="true" />
                    <CommercialSummaryRow
                      label="Comparable Material Cost"
                      value={comparableMaterialCost === null
                        ? "Unavailable"
                        : `${formatReviewMoney(comparableMaterialCost, summaryCurrency)} / ${displayUnit(pricingPresentation.comparisonUnit ?? row.materialUnit)}`}
                      className="pt-0.5"
                      labelClassName="text-[15px] font-semibold text-[var(--text-primary)]"
                      valueClassName="text-[15px] font-semibold text-[var(--text-primary)]"
                    />
                    {taxNormalizationStatus === "unknown_tax_basis" ? (
                      <p className="text-xs text-[var(--text-muted)]">Confirm price tax basis.</p>
                    ) : pricingPresentation.unitComparisonStatus === "missing_conversion" ? (
                      <p className="text-xs text-[var(--text-muted)]">Unit conversion required.</p>
                    ) : taxNormalizationStatus === "missing_tax_policy" ? (
                      <p className="text-xs text-[var(--text-muted)]">Organization tax policy required.</p>
                    ) : taxNormalizationStatus === "unsupported_tax_jurisdiction" ? (
                      <p className="text-xs text-[var(--text-muted)]">Tax basis is unavailable for the organization policy.</p>
                    ) : taxNormalizationStatus === "tax_rate_conflict" ? (
                      <p className="text-xs text-[var(--text-muted)]">Source tax rate conflicts with the organization policy.</p>
                    ) : null}
                    {taxNeedsReview ? (
                      <div className="mt-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-950">
                        <p className="font-semibold">Tax evidence needs review</p>
                        <p className="mt-1 leading-5">This source price can be stored, but estimating-rate use remains unavailable until its tax evidence is confirmed.</p>
                        <label className="mt-2 flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={row.acknowledgeIncompleteTaxEvidence === true}
                            onChange={(event) => onUpdate({
                              acknowledgeIncompleteTaxEvidence: event.target.checked,
                              incompleteTaxReason: event.target.checked
                                ? row.incompleteTaxReason || "Approved source price with incomplete tax comparison evidence."
                                : "",
                            })}
                            className="mt-0.5"
                          />
                          <span>I understand this price will be saved as non-comparable and needs tax review.</span>
                        </label>
                      </div>
                    ) : null}
                  </div>
                </CommercialSummaryCard>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function MaterialImportReviewPanel({
  batchId,
  rows,
  selectedRowIds,
  materials,
  supplierId,
  supplierProducts,
  unitConversions,
  lifecycleEvents,
  companyCurrency = "NZD",
  taxPolicy = null,
  onSelectedRowIdsChange,
  onUpdateRow,
}: MaterialImportReviewPanelProps) {
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);
  const [conversionDrafts, setConversionDrafts] = useState<Record<string, UnitConversionDraft>>({});
  const desktopSelectAllRef = useRef<HTMLInputElement | null>(null);
  const mobileSelectAllRef = useRef<HTMLInputElement | null>(null);
  const selectedSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;
  const someSelected = selectedRowIds.length > 0 && !allSelected;

  useEffect(() => {
    if (desktopSelectAllRef.current) desktopSelectAllRef.current.indeterminate = someSelected;
    if (mobileSelectAllRef.current) mobileSelectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <section aria-labelledby="material-import-rows-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="material-import-rows-heading" className="text-base font-semibold text-[var(--text-primary)]">Materials</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Review clean rows quickly and expand only the details that need attention.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] lg:hidden">
          <input
            ref={mobileSelectAllRef}
            type="checkbox"
            checked={allSelected}
            aria-label="Select all Material import rows"
            onChange={(event) => onSelectedRowIdsChange(event.target.checked ? rows.map((row) => row.id) : [])}
            className="h-4 w-4 accent-[var(--orange-primary)]"
          />
          Select all
        </label>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)]">
        <div
          className="hidden border-b border-[var(--border)] bg-[var(--surface-muted)] text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--text-secondary)] lg:grid"
          style={{ gridTemplateColumns: REVIEW_GRID_TEMPLATE }}
        >
          <span className="flex items-center justify-center px-3 py-2.5">
            <input
              ref={desktopSelectAllRef}
              type="checkbox"
              checked={allSelected}
              aria-label="Select all Material import rows"
              onChange={(event) => onSelectedRowIdsChange(event.target.checked ? rows.map((row) => row.id) : [])}
              className="h-4 w-4 accent-[var(--orange-primary)]"
            />
          </span>
          <span className="px-3 py-2.5">Material</span>
          <span className="border-l border-[var(--border)] px-3 py-2.5">Unit</span>
          <span className="border-l border-[var(--border)] px-3 py-2.5">Cost</span>
          <span className="border-l border-[var(--border)] px-3 py-2.5">Supplier Item</span>
          <span className="border-l border-[var(--border)] px-3 py-2.5">Match / Create</span>
          <span className="border-l border-[var(--border)] px-3 py-2.5">Details</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--text-secondary)]">No extracted Material rows are ready for review.</div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row, index) => (
              <MaterialImportReviewRow
                key={row.id}
                row={row}
                index={index}
                selected={selectedSet.has(row.id)}
                expanded={Boolean(row.approvalError) || expandedRowIds.includes(row.id)}
                materials={materials}
                supplierId={supplierId}
                supplierProducts={supplierProducts}
                unitConversions={unitConversions}
                lifecycleEvents={lifecycleEvents}
                companyCurrency={companyCurrency}
                taxPolicy={taxPolicy}
                batchId={batchId}
                conversionDraft={conversionDrafts[row.id] ?? EMPTY_UNIT_CONVERSION_DRAFT}
                onConversionDraftChange={(updates) => setConversionDrafts((current) => ({
                  ...current,
                  [row.id]: { ...(current[row.id] ?? EMPTY_UNIT_CONVERSION_DRAFT), ...updates },
                }))}
                onSelectedChange={(nextSelected) => onSelectedRowIdsChange(
                  nextSelected
                    ? [...selectedRowIds.filter((id) => id !== row.id), row.id]
                    : selectedRowIds.filter((id) => id !== row.id),
                )}
                onExpandedChange={(nextExpanded) => setExpandedRowIds((current) =>
                  nextExpanded
                    ? [...current.filter((id) => id !== row.id), row.id]
                    : current.filter((id) => id !== row.id),
                )}
                onUpdate={(updates) => onUpdateRow(row.id, updates)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
