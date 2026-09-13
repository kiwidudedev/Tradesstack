"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, FileStack, FileText, LayoutGrid, Ruler, Search } from "lucide-react";
import styles from "@/components/app/trade-pack-builder.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportQuantitiesWorkbook, type QuantitiesExcelExportContext } from "@/lib/exports/quantities-excel";
import { interMedium } from "@/lib/fonts";
import type { QuantityTableRow } from "@/lib/takeoff/quantities-adapter";
import { aggregateTakeoffQuantityRows, formatTakeoffQuantityGroupTotals } from "@/lib/takeoff/quantity-totals";
import { TakeoffQuantitiesTable, type QuantityTableGroup } from "@/components/app/TakeoffQuantitiesTable";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

type SortOption = "default" | "name-asc" | "quantity-desc" | "quantity-asc" | "page-order";
type GroupOption = "none" | "drawing" | "name" | "page" | "type";
type PageOption = { id: string; label: string; pageNumber: number };

function normalizeGroupName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function HydrationRowsBridge({
  hydrationResult,
  onResolved,
}: {
  hydrationResult: Promise<{
    rows: QuantityTableRow[];
    error: string | null;
  }>;
  onResolved: (result: { rows: QuantityTableRow[]; error: string | null }) => void;
}) {
  const result = use(hydrationResult);

  useEffect(() => {
    onResolved(result);
  }, [onResolved, result]);

  return null;
}

export function TakeoffQuantitiesFilters({
  rows,
  exportContext,
  currentPageOnly = false,
  isHydratingAllPages = false,
  isFullDatasetLoaded = true,
  hydrationResult = null,
  owner: ownerProp,
  opportunityId,
  drawingScope,
  activeDrawingSetId,
  availableDrawingSets,
}: {
  rows: QuantityTableRow[];
  exportContext: QuantitiesExcelExportContext;
  currentPageOnly?: boolean;
  isHydratingAllPages?: boolean;
  isFullDatasetLoaded?: boolean;
  hydrationResult?: Promise<{
    rows: QuantityTableRow[];
    error: string | null;
  }> | null;
  owner?: TakeoffRouteOwner;
  opportunityId?: string;
  drawingScope: "current" | "all";
  activeDrawingSetId: string;
  availableDrawingSets: Array<{ id: string; displayName: string }>;
}) {
  const owner = ownerProp ?? { kind: "opportunity" as const, slug: opportunityId ?? "" };
  const router = useRouter();
  const [allRows, setAllRows] = useState(rows);
  const [search, setSearch] = useState("");
  const [pageFilter, setPageFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [groupBy, setGroupBy] = useState<GroupOption>("none");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [, setCurrentPageOnlyState] = useState(currentPageOnly);
  const [, setIsHydratingAllPagesState] = useState(isHydratingAllPages);
  const [isFullDatasetLoadedState, setIsFullDatasetLoadedState] = useState(isFullDatasetLoaded);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  useEffect(() => {
    setAllRows(rows);
  }, [rows]);

  useEffect(() => {
    setCurrentPageOnlyState(currentPageOnly);
    setIsHydratingAllPagesState(isHydratingAllPages);
    setIsFullDatasetLoadedState(isFullDatasetLoaded);
    setHydrationError(null);
  }, [currentPageOnly, isFullDatasetLoaded, isHydratingAllPages, rows]);

  const pageOptions = useMemo<PageOption[]>(() => {
    const seen = new Map<string, PageOption>();

    for (const row of allRows) {
      if (!seen.has(row.pageId)) {
        seen.set(row.pageId, {
          id: row.pageId,
          label: row.pageLabel,
          pageNumber: row.pageNumber,
        });
      }
    }

    return Array.from(seen.values()).sort((left, right) => left.pageNumber - right.pageNumber);
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const nextRows = allRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (normalizedSearch) {
          const haystack = `${row.drawingDisplayName} ${row.name} ${row.description ?? ""}`.toLowerCase();
          if (!haystack.includes(normalizedSearch)) {
            return false;
          }
        }

        if (pageFilter !== "all" && row.pageId !== pageFilter) {
          return false;
        }

        if (typeFilter !== "all" && row.typeLabel !== typeFilter) {
          return false;
        }

        return true;
      });

    nextRows.sort((left, right) => {
      if (sortBy === "default") {
        return left.index - right.index;
      }

      if (sortBy === "page-order") {
        const drawingOrder = left.row.drawingDisplayName.localeCompare(right.row.drawingDisplayName, undefined, { sensitivity: "base" });
        if (drawingScope === "all" && drawingOrder !== 0) return drawingOrder;
        if (left.row.pageNumber !== right.row.pageNumber) {
          return left.row.pageNumber - right.row.pageNumber;
        }
        return left.index - right.index;
      }

      if (sortBy === "name-asc") {
        const compared = left.row.name.localeCompare(right.row.name, undefined, { sensitivity: "base" });
        return compared !== 0 ? compared : left.index - right.index;
      }

      if (sortBy === "quantity-desc" || sortBy === "quantity-asc") {
        if (left.row.unitLabel !== right.row.unitLabel) {
          return left.index - right.index;
        }

        const leftValue = left.row.quantityValue;
        const rightValue = right.row.quantityValue;

        if (leftValue === null || rightValue === null) {
          return left.index - right.index;
        }

        if (leftValue === rightValue) {
          return left.index - right.index;
        }

        return sortBy === "quantity-desc" ? rightValue - leftValue : leftValue - rightValue;
      }

      return left.index - right.index;
      });

    return nextRows.map(({ row }) => row);
  }, [allRows, drawingScope, pageFilter, search, sortBy, typeFilter]);

  const groupedRows = useMemo<QuantityTableGroup[] | null>(() => {
    if (groupBy === "none") {
      return null;
    }

    const groups = new Map<string, QuantityTableRow[]>();
    const labels = new Map<string, string>();

    for (const row of filteredRows) {
      let key = row.id;
      let label = row.name;

      if (groupBy === "name") {
        key = drawingScope === "all"
          ? `${row.drawingSetId}:${normalizeGroupName(row.name)}`
          : normalizeGroupName(row.name);
        label = drawingScope === "all" ? `${row.drawingDisplayName} — ${row.name}` : row.name;
      } else if (groupBy === "page") {
        key = row.pageId;
        label = drawingScope === "all" ? `${row.drawingDisplayName} — ${row.pageLabel}` : row.pageLabel;
      } else if (groupBy === "drawing") {
        key = row.drawingSetId;
        label = row.drawingDisplayName;
      } else if (groupBy === "type") {
        key = row.typeLabel;
        label = row.typeLabel;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
        labels.set(key, label);
      }

      groups.get(key)!.push(row);
    }

    return Array.from(groups.entries()).map(([key, groupRows]) => {
      const totals = aggregateTakeoffQuantityRows(groupRows);

      return {
        key,
        label: labels.get(key) ?? key,
        rows: groupRows,
        totalsLabel: formatTakeoffQuantityGroupTotals(totals),
        totals,
      };
    });
  }, [drawingScope, filteredRows, groupBy]);

  const activePageFilterLabel = useMemo(() => {
    if (pageFilter === "all") {
      return null;
    }

    return pageOptions.find((option) => option.id === pageFilter)?.label ?? null;
  }, [pageFilter, pageOptions]);

  async function handleExportExcel() {
    if (isExporting || !isFullDatasetLoadedState) {
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      await exportQuantitiesWorkbook({
        rows: filteredRows,
        groups: groupBy === "none" ? null : groupedRows,
        context: {
          ...exportContext,
          pageFilterLabel: activePageFilterLabel,
        },
      });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Unable to export quantities right now.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {hydrationResult && currentPageOnly ? (
        <Suspense fallback={null}>
          <HydrationRowsBridge
            hydrationResult={hydrationResult}
            onResolved={(result) => {
              if (result.error) {
                setIsHydratingAllPagesState(false);
                setHydrationError(result.error);
                return;
              }

              setAllRows(result.rows);
              setCurrentPageOnlyState(false);
              setIsHydratingAllPagesState(false);
              setIsFullDatasetLoadedState(true);
              setHydrationError(null);
            }}
          />
        </Suspense>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search measurements..."
            className="h-10 rounded-[12px] border-[#E2E8F1] bg-white pl-11 text-[14px] text-[#10283B] placeholder:text-[#8AA0BC]"
          />
        </div>

        <div className="relative">
          <FileStack className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <select
            value={drawingScope === "all" ? "all" : activeDrawingSetId}
            onChange={(event) => {
              const value = event.target.value;
              router.push(buildTakeoffHref(owner, "quantities", {
                drawingSetId: value === "all" ? activeDrawingSetId : value,
                drawingScope: value === "all" ? "all" : null,
              }));
            }}
            className={`${interMedium.className} h-10 min-w-[190px] rounded-[12px] border border-[#E2E8F1] bg-white pl-10 pr-8 text-[14px] text-[#10283B]`}
          >
            <option value="all">All Drawings</option>
            {availableDrawingSets.map((drawingSet) => (
              <option key={drawingSet.id} value={drawingSet.id}>{drawingSet.displayName}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <FileText className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <select
            value={pageFilter}
            onChange={(event) => setPageFilter(event.target.value)}
            className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#E2E8F1] bg-white pl-10 pr-8 text-[14px] text-[#10283B]`}
          >
            <option value="all">All Pages</option>
            {pageOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {drawingScope === "all"
                  ? `${allRows.find((row) => row.pageId === option.id)?.drawingDisplayName ?? "Drawing"} — ${option.label}`
                  : option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Ruler className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#E2E8F1] bg-white pl-10 pr-8 text-[14px] text-[#10283B]`}
          >
            <option value="all">All Types</option>
            <option value="Area">Area</option>
            <option value="Linear">Linear</option>
            <option value="Count">Count</option>
          </select>
        </div>

        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortOption)}
            className={`${interMedium.className} h-10 min-w-[150px] rounded-[12px] border border-[#E2E8F1] bg-white pl-10 pr-8 text-[14px] text-[#10283B]`}
          >
            <option value="default">Default</option>
            <option value="name-asc">Name A-Z</option>
            <option value="quantity-desc">Quantity high-low</option>
            <option value="quantity-asc">Quantity low-high</option>
            <option value="page-order">Page order</option>
          </select>
        </div>

        <div className="relative">
          <LayoutGrid className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" strokeWidth={2} />
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupOption)}
            className={`${interMedium.className} h-10 min-w-[170px] rounded-[12px] border border-[#E2E8F1] bg-white pl-10 pr-8 text-[14px] text-[#10283B]`}
          >
            <option value="none">None</option>
            {drawingScope === "all" ? <option value="drawing">Drawing</option> : null}
            <option value="name">Measurement name</option>
            <option value="page">Page</option>
            <option value="type">Type</option>
          </select>
        </div>

        <div className="ml-auto flex items-center">
          <Button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={isExporting || filteredRows.length === 0 || !isFullDatasetLoadedState}
            className={`${styles.quoteButtonLabel} h-9 rounded-full bg-[#0B2739] px-5 !text-white hover:bg-[#0B2739]`}
          >
            {isExporting ? "Exporting..." : "Export Excel"}
          </Button>
        </div>
      </div>

      {exportError ? (
        <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>
          {exportError}
        </p>
      ) : null}

      {hydrationError ? (
        <p className={`${interMedium.className} rounded-[10px] border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800`}>
          {hydrationError}
        </p>
      ) : null}

      <TakeoffQuantitiesTable
        rows={filteredRows}
        groups={groupedRows}
        showDrawing={drawingScope === "all"}
      />
    </div>
  );
}
