import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const board = readFileSync(resolve(process.cwd(), "components/app/OpportunityPricingWorksheetBoard.tsx"), "utf8");
const drawer = readFileSync(resolve(process.cwd(), "components/app/PricingWorksheetMaterialLibraryDrawer.tsx"), "utf8");
const browser = readFileSync(resolve(process.cwd(), "components/app/SharedSupplierPricingBrowser.tsx"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "components/app/WorksheetSidePanel.tsx"), "utf8");

describe("pricing worksheet Material drawer contract", () => {
  it("is a shared nonmodal desktop side panel with a narrow overlay", () => {
    expect(board).toContain("<PricingWorksheetMaterialLibraryDrawer");
    expect(board).toContain('aria-label="Open Material Library"');
    expect(drawer).toContain("WorksheetSidePanel");
    expect(shell).toContain("md:static");
    expect(shell).toContain("md:w-[400px]");
    expect(drawer).not.toContain("SheetContent");
  });

  it("starts search-first, then debounces and cancels bounded searches without running while closed", () => {
    expect(drawer).toContain("SharedSupplierPricingBrowser");
    expect(browser).toContain("PRICING_WORKSHEET_MATERIAL_PICKER_MIN_SEARCH_LENGTH");
    expect(browser).toContain("normalizePricingWorksheetMaterialPickerSearch");
    expect(browser).toContain("if (!active || !hasValidSearch || debouncedSearch !== normalizedSearch) return");
    expect(browser).toContain("Search the Material Library");
    expect(browser).toContain("Type at least");
    expect(browser).toContain("window.setTimeout");
    expect(browser).toContain("300");
    expect(browser).toContain("AbortController");
    expect(browser).toContain("requestSequence");
    expect(browser).toContain("requestController.current?.abort()");
    expect(browser).toContain("completedRequestKey.current === requestKey");
    expect(board).toContain('activeSidePanel === "materials" ? (');
  });

  it("captures one target, confirms replacement, and uses the canonical mutation path", () => {
    expect(board).toContain("selectedSingleCellKey ? captureSidePanelTarget");
    expect(board).toContain("commitActiveEditIfNeeded();");
    expect(board).toContain("applyCommittedWorksheetChange((worksheetData)");
    expect(board).toContain("buildMaterialEstimatingRateWorksheetCell");
    expect(board).toContain("buildMaterialPriceWorksheetCell");
    expect(drawer).toContain("Replace formula?");
    expect(drawer).toContain("Replace cell value?");
    expect(drawer).toContain("This workbook is read-only.");
  });

  it("presents estimating rates as primary while retaining source and blocker evidence", () => {
    expect(browser).toContain("Supplier price");
    expect(browser).toContain("Conversion required");
    expect(browser).toContain("Currency conversion unavailable");
    expect(browser).toContain("Estimating basis");
    expect(browser).toContain("No effective Supplier Price is available");
    expect(browser).toContain("Tax setup needs confirmation in Material Library");
  });

  it("uses shared operational primitives and compact accessible panel navigation", () => {
    expect(browser).toContain('import { Input } from "@/components/ui/input"');
    expect(browser).toContain('import { StatusBadge } from "@/components/app/StatusBadge"');
    expect(drawer).toContain('import { Button } from "@/components/ui/button"');
    expect(drawer).toContain('import { OperationalAlert } from "@/components/app/OperationalAlert"');
    expect(drawer).toContain('from "@/components/ui/dialog"');
    expect(drawer).toContain('role="tablist"');
    expect(drawer).toContain('role="tab"');
    expect(drawer).toContain("aria-selected");
    expect(browser).toContain('size="toolbar"');
    expect(browser).toContain('<StatusBadge status="approved">Preferred</StatusBadge>');
    expect(drawer).not.toContain("bg-amber-50");
    expect(drawer).not.toContain("text-amber-800");
    expect(drawer).not.toContain("<Star");
  });

  it("keeps result and review presentation compact, tokenized, and narrow-safe", () => {
    expect(browser).toContain("function MaterialResultGroup");
    expect(browser).toContain("function SupplierPricingRow");
    expect(browser).toContain("function PricingRateDisplay");
    expect(browser).toContain("function BrowserState");
    expect(browser).toContain("flex flex-wrap items-end justify-between");
    expect(browser).toContain("divide-y divide-[var(--border-subtle)]");
    expect(browser).toContain("bg-[var(--surface-subtle)]");
    expect(shell).toContain("shadow-[var(--shadow-overlay)]");
    expect(drawer).not.toContain("bg-slate-950/25");
    expect(drawer).not.toContain("bg-white");
    for (const radius of ["rounded-[5px]", "rounded-[6px]", "rounded-[7px]", "rounded-[10px]"]) {
      expect(drawer).not.toContain(radius);
    }
  });

  it("shows conversion changes explicitly and keeps them out of the routine update action", () => {
    expect(drawer).toContain("Supplier price and conversion both changed");
    expect(drawer).toContain("conversionLabel(group.historicalPricing)");
    expect(drawer).toContain("conversionLabel(group.currentPricing)");
    expect(drawer).toContain('["conversion_changed", "price_and_conversion_changed", "conversion_unavailable"]');
  });

  it("invalidates targets on sheet/structure changes and keeps AI/Materials mutually exclusive", () => {
    expect(board).toContain("materialTarget.structureKey === worksheetStructureKey");
    expect(board).toContain("setActiveSidePanel(null)");
    expect(board).toContain("setIsAiChatOpen(false)");
  });

  it("adds an Updates mode with dirty-sheet overlay and current-sheet-only explicit updates", () => {
    expect(drawer).toContain('onModeChange("updates")');
    expect(drawer).toContain("setMode(nextMode)");
    expect(drawer).toContain("All pages");
    expect(drawer).toContain("Current page");
    expect(drawer).toContain("activeSheetId: isDirty ? activeSheetId : null");
    expect(drawer).toContain("localBindings: isDirty ? localBindings : null");
    expect(drawer).toContain('mode: "revalidate"');
    expect(drawer).toContain("targetItem.sheetId === activeSheetId");
    expect(board).toContain("buildMaterialPriceReviewOverlay(worksheet)");
    expect(board).toContain("bindingId: crypto.randomUUID()");
    expect(board).toContain("updateReviewedMaterialPrice");
  });
});
