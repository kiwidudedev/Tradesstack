"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Boxes, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isPricingWorksheetMaterialPickerSearchValid,
  normalizePricingWorksheetMaterialPickerSearch,
  PRICING_WORKSHEET_MATERIAL_PICKER_MIN_SEARCH_LENGTH,
  parsePricingWorksheetMaterialPickerPage,
  type PricingWorksheetMaterialPickerItem,
  type PricingWorksheetMaterialPickerPage,
} from "@/lib/pricing-worksheet-material-picker";

export type SupplierPricingPageLoader = (params: {
  search: string;
  page: number;
  signal: AbortSignal;
}) => Promise<unknown>;

export type SupplierPricingDisplayPrice = {
  formattedPrice: string;
  unit: string;
  basisLabel?: string | null;
};

type Props = {
  loadPage: SupplierPricingPageLoader;
  onSelectPrice: (item: PricingWorksheetMaterialPickerItem) => void;
  selectionIssue?: string | null;
  getSelectionIssue?: (item: PricingWorksheetMaterialPickerItem) => string | null;
  context?: ReactNode;
  autoFocus?: boolean;
  active?: boolean;
  scopeKey?: string;
  getDisplayPrice?: (item: PricingWorksheetMaterialPickerItem) => SupplierPricingDisplayPrice | null;
};

export function formatSupplierPricingPrice(item: PricingWorksheetMaterialPickerItem) {
  const pricing = item.pricing;
  const value = pricing?.estimatingPricing.unitCost;
  if (pricing?.estimatingPricing.status !== "available" || value === null || value === undefined) return "Rate unavailable";
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: pricing.estimatingPricing.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${pricing.estimatingPricing.currency} ${value.toFixed(2)}`;
  }
}

function defaultDisplayPrice(item: PricingWorksheetMaterialPickerItem): SupplierPricingDisplayPrice | null {
  const pricing = item.pricing;
  if (pricing?.estimatingPricing.status !== "available" || pricing.estimatingPricing.unitCost === null) return null;
  return {
    formattedPrice: formatSupplierPricingPrice(item),
    unit: pricing.estimatingPricing.unit,
    basisLabel: pricing.estimatingPricing.taxBasis !== pricing.sourcePricing.sourceTaxBasis
      ? `Estimating basis ${pricing.estimatingPricing.taxBasis}` : null,
  };
}

function formatSourcePrice(item: PricingWorksheetMaterialPickerItem) {
  const source = item.pricing?.sourcePricing;
  if (!source) return "Price unavailable";
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency", currency: source.currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(source.unitCost);
  } catch {
    return `${source.currency} ${source.unitCost.toFixed(2)}`;
  }
}

function taxLabel(item: PricingWorksheetMaterialPickerItem) {
  const basis = item.pricing?.sourcePricing.sourceTaxBasis;
  if (basis === "exclusive") return "Excl. GST";
  if (basis === "inclusive") return "Incl. GST";
  if (basis === "zero_rated") return "Zero-rated";
  if (basis === "no_tax") return "No tax";
  return basis ? basis.replaceAll("_", " ") : null;
}

function availabilityMessage(item: PricingWorksheetMaterialPickerItem) {
  const pricing = item.pricing;
  if (!pricing) return "No effective Supplier Price is available.";
  if (pricing.estimatingPricing.status === "conversion_required") return "Conversion required";
  if (pricing.estimatingPricing.status === "currency_incompatible") {
    return `Currency conversion unavailable (${pricing.sourcePricing.currency} → ${pricing.estimatingPricing.currency})`;
  }
  if (pricing.estimatingPricing.status === "missing_tax_policy") return "Tax setup needs confirmation in Material Library";
  if (pricing.estimatingPricing.status === "tax_incompatible") return "Tax basis is incompatible with estimating";
  return pricing.estimatingPricing.status.replaceAll("_", " ");
}

function BrowserState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div aria-live="polite" className="px-4 py-8 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">{icon}</div>
      <p className="mt-2.5 text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-1 max-w-[300px] text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

function PricingRateDisplay({ item, displayPrice, selectionIssue }: {
  item: PricingWorksheetMaterialPickerItem;
  displayPrice: SupplierPricingDisplayPrice | null;
  selectionIssue: string | null;
}) {
  const pricing = item.pricing;
  const isAvailable = Boolean(displayPrice);
  return (
    <div className="min-w-0 flex-1">
      {isAvailable ? <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
        {displayPrice!.formattedPrice} <span className="text-xs font-normal text-[var(--text-secondary)]">/ {displayPrice!.unit}</span>
      </p> : null}
      {pricing ? <p className={`${isAvailable ? "mt-0.5" : ""} text-xs leading-5 text-[var(--text-secondary)]`}>
        Supplier price {formatSourcePrice(item)} / {pricing.sourcePricing.unit} · {taxLabel(item)}
      </p> : null}
      {!isAvailable ? <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
        <StatusBadge status={pricing ? "pending" : "draft"}>{pricing ? "Review" : "Unavailable"}</StatusBadge>
        <p className="min-w-0 text-xs text-[var(--text-secondary)]">{selectionIssue ?? availabilityMessage(item)}</p>
      </div> : displayPrice?.basisLabel ? (
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{displayPrice.basisLabel}</p>
      ) : null}
    </div>
  );
}

function SupplierPricingRow({
  item,
  displayPrice,
  selectionIssue,
  onUse,
}: {
  item: PricingWorksheetMaterialPickerItem;
  displayPrice: SupplierPricingDisplayPrice | null;
  selectionIssue: string | null;
  onUse: (item: PricingWorksheetMaterialPickerItem) => void;
}) {
  const isAvailable = Boolean(displayPrice);
  return (
    <div className="px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="min-w-0 break-words text-[13px] font-semibold text-[var(--text-primary)]">{item.supplierName}</p>
          {item.isPreferred ? <StatusBadge status="approved">Preferred</StatusBadge> : null}
        </div>
        <p className="mt-0.5 break-words text-xs leading-5 text-[var(--text-secondary)]">{item.supplierProductDescription || "Supplier product"}</p>
        {item.supplierSku ? <p className="break-all text-[11px] text-[var(--text-muted)]">SKU: {item.supplierSku}</p> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <PricingRateDisplay item={item} displayPrice={displayPrice} selectionIssue={selectionIssue} />
        <Button
          type="button"
          size="sm"
          disabled={!isAvailable || Boolean(selectionIssue)}
          onClick={() => onUse(item)}
          aria-label={isAvailable ? `Use ${displayPrice!.formattedPrice} from ${item.supplierName}` : `Estimating rate unavailable for ${item.supplierName}`}
          title={selectionIssue ?? undefined}
          className="shrink-0"
        >
          {isAvailable ? `Use ${displayPrice!.formattedPrice}` : "Unavailable"}
        </Button>
      </div>
    </div>
  );
}

function MaterialResultGroup({
  items,
  selectionIssue,
  getSelectionIssue,
  getDisplayPrice,
  onUse,
}: {
  items: PricingWorksheetMaterialPickerItem[];
  selectionIssue: string | null;
  getSelectionIssue?: (item: PricingWorksheetMaterialPickerItem) => string | null;
  getDisplayPrice: (item: PricingWorksheetMaterialPickerItem) => SupplierPricingDisplayPrice | null;
  onUse: (item: PricingWorksheetMaterialPickerItem) => void;
}) {
  const material = items[0];
  if (!material) return null;
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2">
        <h3 className="break-words text-sm font-semibold text-[var(--text-primary)]">{material.materialName}</h3>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{[material.category, material.defaultUnit].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {items.map((item) => <SupplierPricingRow
          key={item.supplierProductId}
          item={item}
          displayPrice={getDisplayPrice(item)}
          selectionIssue={selectionIssue ?? getSelectionIssue?.(item) ?? null}
          onUse={onUse}
        />)}
      </div>
    </section>
  );
}

export function SharedSupplierPricingBrowser({
  loadPage,
  onSelectPrice,
  selectionIssue = null,
  getSelectionIssue,
  context,
  autoFocus = false,
  active = true,
  scopeKey = "supplier-pricing",
  getDisplayPrice = defaultDisplayPrice,
}: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PricingWorksheetMaterialPickerPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const completedRequestKey = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const normalizedSearch = useMemo(() => normalizePricingWorksheetMaterialPickerSearch(search), [search]);
  const hasValidSearch = isPricingWorksheetMaterialPickerSearchValid(normalizedSearch);

  useEffect(() => {
    if (autoFocus && active) searchRef.current?.focus();
  }, [active, autoFocus]);

  useEffect(() => {
    if (!hasValidSearch) return;
    const timeout = window.setTimeout(() => setDebouncedSearch(normalizedSearch), 300);
    return () => window.clearTimeout(timeout);
  }, [hasValidSearch, normalizedSearch]);

  const updateSearch = (nextSearch: string) => {
    const nextNormalizedSearch = normalizePricingWorksheetMaterialPickerSearch(nextSearch);
    setSearch(nextSearch);
    if (nextNormalizedSearch === normalizedSearch) return;
    requestController.current?.abort();
    requestController.current = null;
    requestSequence.current += 1;
    completedRequestKey.current = null;
    setPage(1);
    setResult(null);
    setError(null);
    setIsLoading(false);
    if (!isPricingWorksheetMaterialPickerSearchValid(nextNormalizedSearch)) setDebouncedSearch("");
  };

  useEffect(() => {
    if (!active || !hasValidSearch || debouncedSearch !== normalizedSearch) return;
    const requestKey = `${scopeKey}:${debouncedSearch}:${page}`;
    if (completedRequestKey.current === requestKey) return;
    const controller = new AbortController();
    requestController.current = controller;
    const sequence = ++requestSequence.current;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const payload = await loadPage({ search: debouncedSearch, page, signal: controller.signal });
        const parsed = parsePricingWorksheetMaterialPickerPage(payload);
        if (!parsed) throw new Error("Material Library returned an invalid response.");
        if (requestSequence.current === sequence) {
          completedRequestKey.current = requestKey;
          setResult(parsed);
        }
      } catch (loadError) {
        if (!controller.signal.aborted && requestSequence.current === sequence) {
          setResult(null);
          setError(loadError instanceof Error ? loadError.message : "Material Library unavailable.");
        }
      } finally {
        if (requestSequence.current === sequence) {
          if (requestController.current === controller) requestController.current = null;
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      controller.abort();
      if (requestController.current === controller) requestController.current = null;
      if (requestSequence.current === sequence) requestSequence.current += 1;
    };
  }, [active, debouncedSearch, hasValidSearch, loadPage, normalizedSearch, page, scopeKey]);

  const groups = useMemo(() => {
    const grouped = new Map<string, PricingWorksheetMaterialPickerItem[]>();
    for (const item of result?.items ?? []) grouped.set(item.materialId, [...(grouped.get(item.materialId) ?? []), item]);
    return [...grouped.values()];
  }, [result]);

  return <div className={`${active ? "flex" : "hidden"} min-h-0 flex-1 flex-col`}>
    <div className="shrink-0 space-y-2 border-b border-[var(--border-subtle)] px-4 py-3">
      {context}
      {selectionIssue ? <OperationalAlert variant="warning">{selectionIssue}</OperationalAlert> : null}
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input ref={searchRef} size="toolbar" aria-label="Search Material Library" value={search} onChange={(event) => updateSearch(event.target.value)} onKeyDown={(event) => { if (event.key !== "Escape") event.stopPropagation(); }} placeholder="Search materials, suppliers or SKU" className="pl-9 pr-9" />
        {search ? <button type="button" onClick={() => updateSearch("")} aria-label="Clear Material Library search" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"><X className="h-3.5 w-3.5" /></button> : null}
      </label>
    </div>
    <div className="flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]">
      {normalizedSearch.length === 0 ? <BrowserState icon={<Search className="h-5 w-5" />} title="Search the Material Library" description="Start typing a material, supplier, product description or SKU." /> : null}
      {normalizedSearch.length > 0 && normalizedSearch.length < PRICING_WORKSHEET_MATERIAL_PICKER_MIN_SEARCH_LENGTH ? <div aria-live="polite" className="px-4 py-8 text-center text-xs text-[var(--text-secondary)]">Type at least {PRICING_WORKSHEET_MATERIAL_PICKER_MIN_SEARCH_LENGTH} characters to search.</div> : null}
      {hasValidSearch && error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
      {hasValidSearch && isLoading ? <div aria-live="polite" aria-busy="true" className="flex items-center justify-center gap-2 py-10 text-[13px] text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" />Loading materials…</div> : null}
      {hasValidSearch && !isLoading && !error && result && groups.length === 0 ? <BrowserState icon={<Boxes className="h-5 w-5" />} title="No materials found" description="Try a material, supplier, category or SKU." /> : null}
      {hasValidSearch && !isLoading && !error && result ? <div className="space-y-2.5">{groups.map((items) => <MaterialResultGroup key={items[0]?.materialId} items={items} selectionIssue={selectionIssue} getSelectionIssue={getSelectionIssue} getDisplayPrice={getDisplayPrice} onUse={onSelectPrice} />)}</div> : null}
    </div>
    {hasValidSearch && result && result.total > result.pageSize ? <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]"><span>{result.total} supplier products</span><div className="flex gap-1"><Button variant="secondary" size="icon" aria-label="Previous materials page" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="secondary" size="icon" aria-label="Next materials page" disabled={!result.hasMore || isLoading} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div> : null}
  </div>;
}
