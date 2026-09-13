import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "app/app/(workspace)/company/materials/CompanyMaterialsWorkspace.tsx",
  "utf8"
);
const queriesSource = readFileSync("lib/materials/queries.ts", "utf8");
const kpiAreaStart = source.indexOf('<div className="grid gap-4 lg:grid-cols-3">');
const kpiArea = source.slice(
  kpiAreaStart,
  source.indexOf('<div className="space-y-3">', kpiAreaStart)
);
const addMaterialHandler = source.slice(
  source.indexOf("async function handleCreateMaterial("),
  source.indexOf("async function handleSaveMaterialDetails(")
);
const addMaterialDialogStart = source.indexOf("<Dialog open={isAddMaterialOpen}");
const addMaterialDialog = source.slice(
  addMaterialDialogStart,
  source.indexOf("{message ?", addMaterialDialogStart)
);
const materialDetailsDialogStart = source.indexOf('<Dialog open={Boolean(selectedMaterialId)}');
const materialDetailsDialog = source.slice(
  materialDetailsDialogStart,
  source.indexOf('<Dialog open={isEditMaterialOpen}', materialDetailsDialogStart)
);
const materialDetailsHeader = source.slice(
  materialDetailsDialogStart,
  source.indexOf('<div className="min-h-0 flex-1 overflow-y-auto', materialDetailsDialogStart)
);
const materialSummarySectionStart = source.indexOf('aria-labelledby="material-summary-heading"');
const materialSummarySection = source.slice(
  materialSummarySectionStart,
  source.indexOf('aria-labelledby="supplier-lines-heading"', materialSummarySectionStart)
);
const materialSummaryCardStart = source.indexOf("function MaterialSummaryCard(");
const materialSummaryCard = source.slice(
  materialSummaryCardStart,
  source.indexOf("function DrawerSection(", materialSummaryCardStart)
);
const supplierLinesSectionStart = source.indexOf('aria-labelledby="supplier-lines-heading"');
const supplierLinesSection = source.slice(
  supplierLinesSectionStart,
  source.indexOf("ref={priceHistoryRef}", supplierLinesSectionStart)
);
const priceHistorySectionStart = source.indexOf("ref={priceHistoryRef}");
const priceHistorySection = source.slice(
  priceHistorySectionStart,
  source.indexOf('<Dialog open={isEditMaterialOpen}', priceHistorySectionStart)
);
const editMaterialDialogStart = source.indexOf('<Dialog open={isEditMaterialOpen}');
const editMaterialDialog = source.slice(
  editMaterialDialogStart,
  source.indexOf('<Dialog open={isAddPriceOpen}', editMaterialDialogStart)
);
const editMaterialOpenHandlers = source.slice(
  source.indexOf("function handleOpenEditMaterial("),
  source.indexOf("async function handleSaveMaterialDetails(")
);
const saveMaterialHandler = source.slice(
  source.indexOf("async function handleSaveMaterialDetails("),
  source.indexOf("async function handleArchiveMaterial(")
);
const supplierPriceDialogStart = source.indexOf('<Dialog open={isAddPriceOpen}');
const supplierPriceDialog = source.slice(
  supplierPriceDialogStart,
  source.indexOf('<Dialog open={isImportOpen}', supplierPriceDialogStart)
);
const supplierPriceSaveHandlerStart = source.indexOf("async function handleAddSupplierPrice(");
const supplierPriceSaveHandler = source.slice(
  supplierPriceSaveHandlerStart,
  source.indexOf("function handleOpenUpdateSupplierPrice(", supplierPriceSaveHandlerStart)
);
const removeSupplierProductDialogStart = source.indexOf('<Dialog open={Boolean(removeSupplierProductId)}');
const removeSupplierProductDialog = source.slice(
  removeSupplierProductDialogStart,
  source.indexOf('<Dialog open={Boolean(restoreSupplierProductId)}', removeSupplierProductDialogStart)
);
const removeSupplierProductHandlerStart = source.indexOf("async function handleRemoveSupplierProduct(");
const removeSupplierProductHandler = source.slice(
  removeSupplierProductHandlerStart,
  source.indexOf("async function handleRestoreSupplierProduct(", removeSupplierProductHandlerStart)
);
const materialTableStart = source.indexOf('<OperationalTable className="min-w-[1000px]">');
const materialTable = source.slice(
  materialTableStart,
  source.indexOf("</OperationalTable>", materialTableStart)
);
const materialSearch = source.slice(
  source.indexOf("const filteredMaterials = useMemo"),
  source.indexOf("const addMaterialFormCanSubmit", source.indexOf("const filteredMaterials = useMemo"))
);

describe("Material Library list presentation", () => {
  it("renders the Material name without its description as secondary table text", () => {
    expect(materialTableStart).toBeGreaterThan(-1);
    expect(materialTable).toContain("{summary.material.name}");
    expect(materialTable).not.toContain("summary.material.description");
  });

  it("preserves description search and the Material Details/Edit Material surfaces", () => {
    expect(materialSearch).toContain('summary.material.description ?? ""');
    expect(materialSummarySection).toContain("selectedMaterial.description");
    expect(editMaterialDialog).toContain('htmlFor="material-description"');
    expect(editMaterialDialog).toContain("value={materialForm.description}");
  });

  it("leaves lifecycle status and the Open action in the main table", () => {
    expect(materialTable).toContain("{summary.status}</StatusBadge>");
    expect(materialTable).toContain("setSelectedMaterialId(summary.material.id)");
    expect(materialTable).toContain("Open");
  });
});

describe("Material Library cost-code presentation", () => {
  it("omits company cost codes from the main filters, table, add modal, and search", () => {
    expect(source).not.toContain("costCodeFilter");
    expect(source).not.toContain("summary.costCodeLabel");
    expect(source).not.toContain("<OperationalTableHead>Cost Code</OperationalTableHead>");
    expect(addMaterialDialog).not.toContain("Cost Code");
    expect(addMaterialDialog).not.toContain("Accounting Mapping");
  });

  it("keeps the approved eight-column table order", () => {
    const headers = Array.from(
      source.matchAll(/<OperationalTableHead>([^<]+)<\/OperationalTableHead>/g),
      (match) => match[1]
    );

    expect(headers.slice(0, 8)).toEqual([
      "Material",
      "Preferred Supplier",
      "Cost",
      "Unit",
      "Total Suppliers",
      "Last Updated",
      "Status",
      "Actions",
    ]);
    expect(source).toContain("<OperationalTableCell>{summary.supplierCount}</OperationalTableCell>");

    expect(source).not.toContain("isAddingMaterialInline");
    expect(source).not.toContain("isSavingInlineMaterial");
    expect(source).not.toContain("inlineMaterialRow");
    expect(source).not.toContain("handleCreateMaterialInline");
    expect(source).not.toContain("Pending Save");
    expect(source).not.toContain("Review status assigned after save");
  });

  it("uses the shared dialog primitives for the Add Material form", () => {
    expect(addMaterialDialog).toContain("<DialogTrigger asChild>");
    expect(addMaterialDialog).toContain("<DialogContent");
    expect(addMaterialDialog).toContain("<DialogHeader");
    expect(addMaterialDialog).toContain("<DialogTitle");
    expect(addMaterialDialog).toContain("<DialogFooter");
    expect(addMaterialDialog).toContain("<form onSubmit={handleCreateMaterial}>");
    expect(addMaterialDialog).toContain("max-w-[720px]");
    expect(addMaterialDialog).toContain("grid grid-cols-1 gap-3 sm:grid-cols-2");
  });

  it("contains exactly the supported creation controls and preserves their constraints", () => {
    expect(addMaterialDialog).toContain('htmlFor="add-material-name"');
    expect(addMaterialDialog).toContain('htmlFor="add-material-unit"');
    expect(addMaterialDialog).toContain('htmlFor="add-material-unit-cost"');
    expect(addMaterialDialog).toContain('htmlFor="add-material-supplier"');
    expect(addMaterialDialog).toContain('htmlFor="add-material-preferred"');
    expect(addMaterialDialog).toContain('htmlFor="add-material-tax-basis"');
    expect(addMaterialDialog).toContain('htmlFor="add-material-tax-outcome"');
    expect(addMaterialDialog).toContain('min="0"');
    expect(addMaterialDialog).toContain('step="0.01"');
    expect(addMaterialDialog).toContain("checked={addMaterialForm.isPreferred}");
    expect(addMaterialDialog).toContain("event.target.checked");
    expect(addMaterialDialog).toContain("initialData.suppliers.length === 0");
    expect(addMaterialDialog.match(/id="add-material-/g)).toHaveLength(8);
    expect(addMaterialDialog.match(/\srequired/g)).toHaveLength(6);
  });

  it("preserves the existing action payload and modal success behavior", () => {
    expect(addMaterialHandler).toContain("createMaterialWithInitialSupplierPriceAction({");
    expect(addMaterialHandler).toContain("operationId: addMaterialOperationIdRef.current");
    expect(addMaterialHandler).toContain("if (isCreatingMaterialRef.current)");
    expect(addMaterialHandler).toContain("name: addMaterialForm.name");
    expect(addMaterialHandler).toContain("defaultUnit: addMaterialForm.unit");
    expect(addMaterialHandler).toContain("supplierId: addMaterialForm.supplierId");
    expect(addMaterialHandler).toContain("unitCost: Number(addMaterialForm.unitCost)");
    expect(addMaterialHandler).toContain("isPreferred: addMaterialForm.isPreferred");
    expect(addMaterialHandler).toContain("setAddMaterialError(result.error");
    expect(addMaterialHandler).toContain("setIsAddMaterialOpen(false)");
    expect(addMaterialHandler).toContain("router.refresh()");
    expect(addMaterialHandler).not.toContain("setSelectedMaterialId");
  });

  it("retains the supplier, category, and status filters", () => {
    expect(source).toContain('const [supplierFilter, setSupplierFilter] = useState("all")');
    expect(source).toContain('const [categoryFilter, setCategoryFilter] = useState("all")');
    expect(source).toContain('const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>("Active")');
    expect(source).toContain('summary.preferredPrice?.supplier_id !== supplierFilter');
    expect(source).toContain('(summary.material.category ?? "") !== categoryFilter');
    expect(source).toContain(
      '(["Active", "All", "Preferred", "Recently Updated", "Archived"] as MaterialStatusFilter[])'
    );
    expect(source).toContain('statusFilter === "Active" && summary.status !== "Active"');
    expect(source).not.toContain('"All", "Needs Review"');
  });

  it("removes the persistent import-review KPI without adding a replacement queue metric", () => {
    expect(kpiAreaStart).toBeGreaterThan(-1);
    expect(kpiArea.match(/<OperationalKpiCard/g)).toHaveLength(3);
    expect(kpiArea).toContain('label="Materials"');
    expect(kpiArea).toContain('label="Suppliers"');
    expect(kpiArea).toContain('label="Price Updates"');
    expect(kpiArea).not.toContain('label="Needs Review"');
    expect(kpiArea).not.toContain('label="Import Review"');
    expect(kpiArea).not.toContain("Imported items to match");
    expect(source).not.toContain("needsReviewCount");
  });

  it("does not load historical import staging data into the Material Library page", () => {
    expect(queriesSource).not.toContain('.from("organization_material_import_rows")');
    expect(queriesSource).not.toContain('.from("organization_material_import_batches")');
    expect(queriesSource).not.toContain("importRows:");
    expect(queriesSource).not.toContain("importBatches:");
  });

  it("keeps accounting and financial routing presentation out of Material Details", () => {
    expect(materialDetailsDialog).not.toContain("Accounting & Financial Routing");
    expect(materialDetailsDialog).not.toContain("TradesStack Route");
    expect(materialDetailsDialog).not.toContain("Organization Cost Code");
    expect(materialDetailsDialog).not.toContain("Mapping Status");
    expect(materialDetailsDialog).not.toContain("Review Status");
    expect(materialDetailsDialog).not.toContain("Review Mapping");
    expect(materialDetailsDialog).not.toContain("Configure Cost Codes");
    expect(source).not.toContain("handleSaveMaterialMapping");
    expect(source).not.toContain("isEditingMaterialClassification");
    expect(source).not.toContain('htmlFor="material-cost-code"');
    expect(source).not.toContain("Save Mapping");
    expect(source).not.toContain("Edit Mapping");
  });

  it("removes the legacy classification panel and all of its detail rows", () => {
    expect(materialDetailsDialog).not.toContain("TradesStack Classification");
    expect(materialDetailsDialog).not.toContain(
      "Structured classification and accounting intelligence for this material."
    );
    expect(materialDetailsDialog).not.toContain("selectedMaterial.work_type");
    expect(materialDetailsDialog).not.toContain("selectedMaterial.cost_type");
    expect(materialDetailsDialog).not.toContain("selectedMaterial.cost_code");
    expect(materialDetailsDialog).not.toContain("selectedMaterial.classification_source");
    expect(materialDetailsDialog).not.toContain("selectedMaterial.classification_confidence");
    expect(materialDetailsDialog).not.toContain("selectedMaterial.ai_construction_intelligence");
    expect(materialDetailsDialog).not.toContain("selectedMaterialReviewStatus");
    expect(materialDetailsDialog).not.toContain("This material classification requires review.");
    expect(materialDetailsDialog).not.toContain("Review Classification");
  });

  it("keeps only genuine material lifecycle state in the detail header", () => {
    expect(materialDetailsHeader).toContain('selectedMaterial.is_active && !selectedMaterial.archived_at');
    expect(materialDetailsHeader).toContain('"Active" : "Archived"');
    expect(materialDetailsHeader).not.toContain("classification_confidence");
    expect(materialDetailsHeader).not.toContain("drawerStatus");
    expect(materialDetailsHeader).not.toContain("Confirmed");
    expect(materialDetailsHeader).not.toContain("Needs Review");
  });

  it("restructures material details into a summary followed by supplier lines", () => {
    expect(materialDetailsDialog).toContain("Material Summary");
    expect(materialDetailsDialog).toContain('label="Unit"');
    expect(materialDetailsDialog).toContain('label="Trade / Category"');
    expect(materialDetailsDialog).toContain('label="Preferred Supplier"');
    expect(materialDetailsDialog).toContain('label="Best Cost"');
    expect(materialDetailsDialog).toContain('label="Other Priced Suppliers"');
    expect(materialDetailsDialog).toContain('label="Last Updated"');
    expect(source).toContain('return "Confirm tax basis"');
    expect(source).toContain('return "Conversion required"');
    expect(materialDetailsDialog.indexOf("Material Summary")).toBeLessThan(
      materialDetailsDialog.indexOf("Supplier Pricing")
    );
    expect(materialDetailsDialog.indexOf("Supplier Pricing")).toBeLessThan(
      materialDetailsDialog.indexOf("Price History")
    );
    expect(materialDetailsDialog).toContain('className="border-b border-[var(--border)] py-4"');
    expect(materialSummarySection).toContain("grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3");
    expect(materialSummarySection).not.toContain("xl:grid-cols-6");
    expect(materialDetailsDialog).not.toContain('title="Commercial Summary"');
    expect(source).not.toContain("activeDrawerTab");
    expect(materialDetailsDialog).not.toContain('(["Details", "Supplier Prices", "History"]');
  });

  it("uses six compact shared-surface summary cards without the full KPI component", () => {
    expect(materialSummarySection.match(/<MaterialSummaryCard/g)).toHaveLength(6);
    expect(materialSummaryCard).toContain("<Card");
    expect(materialSummaryCard).toContain("operationalKpiToneClassName[tone]");
    expect(materialSummaryCard).toContain('className="min-h-[104px] p-4"');
    expect(materialSummaryCard).toContain("h-9 w-9");
    expect(materialSummaryCard).toContain("text-base font-semibold");
    expect(materialSummaryCard).not.toContain("font-size-kpi");
    expect(materialSummarySection).not.toContain("<OperationalKpiCard");
  });

  it("maps Material Summary fields to Lucide icons and canonical KPI tones", () => {
    expect(materialSummarySection).toContain('<Ruler className="h-[18px] w-[18px]"');
    expect(materialSummarySection).toContain('<Layers3 className="h-[18px] w-[18px]"');
    expect(materialSummarySection).toContain('<Building2 className="h-[18px] w-[18px]"');
    expect(materialSummarySection).toContain('<CircleDollarSign className="h-[18px] w-[18px]"');
    expect(materialSummarySection).toContain('<Users className="h-[18px] w-[18px]"');
    expect(materialSummarySection).toContain('<CalendarClock className="h-[18px] w-[18px]"');
    expect(materialSummarySection.match(/tone="navy"/g)).toHaveLength(2);
    expect(materialSummarySection.match(/tone="sage"/g)).toHaveLength(2);
    expect(materialSummarySection).toContain('tone="amber"');
    expect(materialSummarySection).toContain('tone="orange"');
  });

  it("keeps identity and lifecycle actions in one permission-gated ellipsis menu", () => {
    expect(materialDetailsHeader).toContain("{canWrite ? (");
    expect(materialDetailsHeader.indexOf("{canWrite ? (")).toBeLessThan(
      materialDetailsHeader.indexOf("<DropdownMenu>")
    );
    expect(materialDetailsHeader).toContain("<DropdownMenu>");
    expect(materialDetailsHeader).toContain("<DropdownMenuTrigger asChild>");
    expect(materialDetailsHeader).toContain("ref={materialActionsTriggerRef}");
    expect(materialDetailsHeader).toContain('type="button"');
    expect(materialDetailsHeader).toContain('variant="secondary"');
    expect(materialDetailsHeader).toContain('size="icon"');
    expect(materialDetailsHeader).toContain('className="h-8 w-8 rounded-full"');
    expect(materialDetailsHeader).toContain('<MoreHorizontal className="h-4 w-4" aria-hidden="true" />');
    expect(materialDetailsHeader).toContain("Actions for {selectedMaterial.name}");
    expect(materialDetailsHeader).toContain("<DropdownMenuContent");
    expect(materialDetailsHeader).toContain('align="end"');
    for (const menuSurfaceClass of [
      "!z-[200]",
      "min-w-[160px]",
      "rounded-[var(--radius-lg)]",
      "border border-[var(--border)]",
      "!bg-[var(--card)]",
      "p-1.5",
      "shadow-[var(--shadow-md)]",
    ]) {
      expect(materialDetailsHeader).toContain(menuSurfaceClass);
    }
    expect(materialDetailsHeader).toContain("onSelect={handleOpenEditMaterial}");
    expect(materialDetailsHeader).toContain("Edit Material");
    expect(materialDetailsHeader).toContain('<Pencil className="mr-2 h-3.5 w-3.5 text-[var(--text-secondary)]"');
    expect(materialDetailsHeader).toContain('<DropdownMenuSeparator className="my-1 bg-[var(--border)]" />');
    expect(materialDetailsHeader).not.toContain("onClick={handleOpenEditMaterial}");
    expect(materialDetailsHeader).not.toContain('size="sm"');
    expect(materialDetailsHeader).not.toContain('variant="outline"');
    expect(materialDetailsDialog).not.toContain('htmlFor="material-name"');
    expect(materialDetailsDialog).not.toContain("Save Material Identity");
    expect(source).toContain("updateMaterialAction({");
    expect(source).toContain("archiveMaterialAction({");
  });

  it("renders state-aware Archive and Restore menu items without changing the lifecycle handler", () => {
    expect(materialDetailsHeader).toContain("{selectedMaterial.is_active ? (");
    expect(materialDetailsHeader.match(/handleArchiveMaterial\(selectedMaterial\.is_active\)/g)).toHaveLength(2);
    expect(materialDetailsHeader).toContain('<Archive className="mr-2 h-3.5 w-3.5" aria-hidden="true" />');
    expect(materialDetailsHeader).toContain("Archive");
    expect(materialDetailsHeader).toContain("text-[var(--error)] focus:bg-[var(--error-light)]");
    expect(materialDetailsHeader).toContain("<ArchiveRestore");
    expect(materialDetailsHeader).toContain("Restore");
    expect(materialDetailsHeader).toContain("text-[var(--text-primary)] focus:bg-[var(--surface-muted)]");
  });

  it("renders Edit Material as a dedicated sibling dialog using the approved shell", () => {
    expect(editMaterialDialogStart).toBeGreaterThan(materialDetailsDialogStart);
    expect(editMaterialDialog).toContain("onOpenChange={handleEditMaterialOpenChange}");
    expect(editMaterialDialog).toContain('className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0"');
    expect(editMaterialDialog).toContain('className="px-7 pb-6 pt-7"');
    expect(editMaterialDialog).toContain("<DialogTitle");
    expect(editMaterialDialog).toContain("Edit Material");
    expect(editMaterialDialog).toContain("<DialogDescription");
    expect(editMaterialDialog).toContain("Update the core material identity separately from supplier pricing.");
    expect(editMaterialDialog).toContain('className="space-y-3.5 px-7 pb-4"');
    expect(editMaterialDialog).toContain('className="flex flex-wrap items-center justify-end gap-3 px-7 pb-7 pt-5"');
  });

  it("preserves the identity fields, responsive layout, and semantic submit wiring", () => {
    expect(editMaterialDialog).toContain("<form onSubmit={handleSaveMaterialDetails}>");
    expect(editMaterialDialog).toContain('htmlFor="material-name"');
    expect(editMaterialDialog).toContain('htmlFor="material-description"');
    expect(editMaterialDialog).toContain('htmlFor="material-unit"');
    expect(editMaterialDialog).toContain('htmlFor="material-category"');
    expect(editMaterialDialog).toContain("checked={materialForm.isActive}");
    expect(editMaterialDialog).toContain("sm:grid-cols-2");
    expect(editMaterialDialog).toContain('type="submit"');
    expect(editMaterialDialog).toContain('variant="orange"');
    expect(editMaterialDialog).toContain('disabled={isSavingMaterialIdentity}');
    expect(editMaterialDialog).toContain('isSavingMaterialIdentity ? "Saving..." : "Save Material Identity"');
    expect(editMaterialDialog).not.toContain("organizationCostCodeId");
  });

  it("resets cancelled drafts, keeps failures visible, and restores trigger focus", () => {
    expect(editMaterialOpenHandlers).toContain("setMaterialForm(buildMaterialFormState(selectedMaterial))");
    expect(editMaterialOpenHandlers).toContain("if (!nextOpen && isSavingMaterialIdentity)");
    expect(editMaterialOpenHandlers).toContain("setIsEditMaterialOpen(nextOpen)");
    expect(editMaterialDialog).toContain("<DialogClose asChild>");
    expect(editMaterialDialog).toContain('role="alert"');
    expect(editMaterialDialog).toContain("onCloseAutoFocus");
    expect(editMaterialDialog).toContain("materialActionsTriggerRef.current?.focus()");
  });

  it("retains the authoritative save contract and keeps the dialog open on failure", () => {
    expect(saveMaterialHandler).toContain("event.preventDefault()");
    expect(saveMaterialHandler).toContain("if (!selectedMaterial || isSavingMaterialIdentity)");
    expect(saveMaterialHandler).toContain("updateMaterialAction({");
    expect(saveMaterialHandler).toContain("organizationCostCodeId: materialForm.organizationCostCodeId || null");
    expect(saveMaterialHandler).toContain("setError(result.error");
    expect(saveMaterialHandler.indexOf("setIsEditMaterialOpen(false)")).toBeGreaterThan(
      saveMaterialHandler.indexOf("if (!result.ok)")
    );
    expect(saveMaterialHandler).toContain("router.refresh()");
    expect(saveMaterialHandler).toContain("finally");
    expect(saveMaterialHandler).toContain("setIsSavingMaterialIdentity(false)");
    expect(saveMaterialHandler).not.toContain("setSelectedMaterialId");
  });

  it("renders one active supplier-product projection with source and comparable pricing columns", () => {
    expect(supplierLinesSection).toContain("materialEffectiveSupplierProducts.map");
    expect(supplierLinesSection).not.toContain("materialPriceRows.map");
    const headers = Array.from(
      supplierLinesSection.matchAll(/<OperationalTableHead(?:\s+[^>]*)?>([^<]+)<\/OperationalTableHead>/g),
      (match) => match[1]
    );
    expect(headers.slice(0, 7)).toEqual([
      "Supplier",
      "Unit",
      "Supplier Price",
      "Comparable",
      "Updated",
      "Status",
      "Actions",
    ]);
    expect(supplierLinesSection).toContain("supplierNameById.get(supplierProduct.supplier_id)");
    expect(supplierLinesSection).toContain("supplierProduct.pack_quantity");
    expect(supplierLinesSection).toContain("formatMaterialMoney(comparableUnitCost");
    expect(supplierLinesSection).toContain("/ ${comparisonUnit}");
    expect(supplierLinesSection).toContain('effectivePrice.unit_cost');
    expect(supplierLinesSection).toContain("isReviewableTaxStatus(comparisonStatus)");
    expect(supplierLinesSection).not.toContain("effectiveConversion.supplier_quantity");
    expect(supplierLinesSection).toContain('"No effective price"');
    expect(supplierLinesSection).toContain("handleMakePreferredSupplierPrice(effectivePrice.id)");
    expect(supplierLinesSection).not.toContain("<OperationalTableHead>Preferred</OperationalTableHead>");
    expect(supplierLinesSection).not.toContain('supplierProduct.is_preferred ? "Yes" : "No"');
    expect(headers.slice(0, 7)).not.toContain("Supplier Item");
    expect(supplierLinesSection).not.toContain('"Not specified"');
    expect(supplierLinesSection).not.toContain("SKU:");
    expect(supplierLinesSection).toContain('className="min-w-[720px]"');
    expect(supplierLinesSection).toContain('className="h-12 w-[52px] px-2 text-right"');
    expect(supplierLinesSection).toContain('className="flex items-center justify-end"');
  });

  it("presents one commercial status without supplier identity provenance", () => {
    const supplierCellStart = supplierLinesSection.indexOf('<OperationalTableCell className="py-3">');
    const supplierCell = supplierLinesSection.slice(
      supplierCellStart,
      supplierLinesSection.indexOf("</OperationalTableCell>", supplierCellStart)
    );
    const statusCellStart = supplierLinesSection.indexOf(
      '<OperationalTableCell className="py-3">',
      supplierLinesSection.indexOf('formatMaterialDate(effectivePrice?.updated_at ?? supplierProduct.updated_at)')
    );
    const statusCell = supplierLinesSection.slice(
      statusCellStart,
      supplierLinesSection.indexOf("</OperationalTableCell>", statusCellStart)
    );

    expect(supplierCell).not.toContain("Preferred");
    expect(statusCell).toContain('!effectivePrice ? "draft"');
    expect(statusCell).toContain('supplierProduct.is_preferred ? "approved" : "active"');
    expect(statusCell).toContain('? "No current price"');
    expect(statusCell).toContain('? "Preferred"');
    expect(statusCell).toContain(': "Current"');
    expect(statusCell).not.toContain("Effective");
    expect(statusCell).not.toContain("Needs identity review");
    expect(statusCell).not.toContain("identity_status");
    expect(statusCell.match(/<StatusBadge/g)).toHaveLength(1);
  });

  it("uses one Purchase Order-style action menu per supplier row", () => {
    const rowActionCell = supplierLinesSection.slice(
      supplierLinesSection.indexOf('<OperationalTableCell className="px-2 py-3">'),
      supplierLinesSection.indexOf("</OperationalTableCell>", supplierLinesSection.indexOf('<OperationalTableCell className="px-2 py-3">'))
    );

    expect(supplierLinesSection).toContain("<DropdownMenu>");
    expect(supplierLinesSection).toContain("<DropdownMenuTrigger asChild>");
    expect(supplierLinesSection).toContain("<MoreHorizontal");
    expect(supplierLinesSection).toContain('className="h-8 w-8 rounded-full"');
    expect(supplierLinesSection).toContain('<DropdownMenuContent');
    expect(supplierLinesSection).toContain('align="end"');
    expect(supplierLinesSection).toContain("min-w-[160px]");
    expect(rowActionCell).not.toContain('size="sm"');
    expect(rowActionCell).not.toContain('variant="outline"');
  });

  it("keeps mutation actions permission-gated and history available to read-only users", () => {
    const updatePriceItem = supplierLinesSection.slice(
      supplierLinesSection.indexOf("{canWrite && effectivePrice ? ("),
      supplierLinesSection.indexOf("{canWrite && effectivePrice && !supplierProduct.is_preferred ? (")
    );
    const makePreferredItem = supplierLinesSection.slice(
      supplierLinesSection.indexOf("{canWrite && effectivePrice && !supplierProduct.is_preferred ? ("),
      supplierLinesSection.indexOf("<DropdownMenuItem\n                                        onSelect={() => handleViewSupplierPriceHistory")
    );

    expect(updatePriceItem).toContain("Update Price");
    expect(updatePriceItem).toContain("handleOpenUpdateSupplierPrice(effectivePrice)");
    expect(supplierLinesSection).toContain('taxReviewRouteByPriceId.get(effectivePrice.id) === "simple_forward_confirmation"');
    expect(supplierLinesSection).toContain('taxReviewRouteByPriceId.get(effectivePrice.id) === "advanced_review"');
    expect(supplierLinesSection).toContain("Confirm Tax Setup");
    expect(supplierLinesSection).toContain("Review Tax Setup");
    expect(supplierLinesSection).toContain("handleOpenConfirmSupplierPriceTaxBasis(");
    expect(makePreferredItem).toContain("Make Preferred");
    expect(makePreferredItem).toContain("handleMakePreferredSupplierPrice(effectivePrice.id)");
    expect(supplierLinesSection).toContain("!supplierProduct.is_preferred");
    expect(supplierLinesSection).toContain("View History");
    expect(supplierLinesSection).toContain("handleViewSupplierPriceHistory(supplierProduct.id)");
    expect(supplierLinesSection).toContain('{canWrite ? <DropdownMenuSeparator');
    expect(supplierLinesSection).toContain("Remove Supplier Item");
    expect(supplierLinesSection).not.toContain("Delete Supplier Item");
    expect(supplierLinesSection).toContain("text-[var(--error)]");
  });

  it("prevents duplicate preferred mutations while retaining the authoritative action", () => {
    expect(source).toContain("if (preferredPricePendingId)");
    expect(source).toContain("setPreferredPricePendingId(priceId)");
    expect(source).toContain("supplierPriceId: priceId");
    expect(source).toContain("setPreferredPricePendingId(null)");
    expect(supplierLinesSection).toContain("disabled={preferredPricePendingId !== null}");
  });

  it("puts Add Supplier Line and a permission-aware empty state in the table area", () => {
    expect(supplierLinesSection).toContain('aria-label="Add supplier price"');
    expect(supplierLinesSection).not.toContain("Add Suppliers Price");
    expect(supplierLinesSection).toContain("handleOpenAddSupplierLine");
    expect(supplierLinesSection).toContain("materialEffectiveSupplierProducts.length === 0");
    expect(supplierLinesSection).toContain('title="No supplier lines yet"');
    expect(supplierLinesSection).toContain("canWrite ? (");
    expect(source).toContain("addMaterialSupplierPriceAction({");
  });

  it("reuses the atomic price flow and locks supplier-product identity in update mode", () => {
    expect(source).toContain("supplierProductId: supplierPriceForm.supplierProductId || null");
    expect(source).toContain("operationId: supplierPriceOperationIdRef.current");
    expect(supplierPriceDialog).toContain('supplierPriceModalMode === "confirm_tax_advanced"');
    expect(supplierPriceDialog).toContain('supplierPriceModalMode === "update"');
    expect(supplierPriceDialog).toContain('disabled={isSavingSupplierPrice || supplierPriceModalMode !== "create"}');
    expect(supplierPriceDialog).toContain("Save New Price Version");
    expect(supplierPriceDialog).toContain("Set as Preferred Supplier");
    expect(source).toContain("makeMaterialSupplierPricePreferredAction({");
    expect(source).toContain("router.refresh()");
  });

  it("routes simple forward confirmation separately from advanced tax review", () => {
    expect(source).toContain('"confirm_tax_simple" | "confirm_tax_advanced"');
    expect(source).toContain('route === "simple_forward_confirmation" ? "confirm_tax_simple" : "confirm_tax_advanced"');
    expect(source).toContain("routePriceTaxReview({");
    expect(supplierPriceDialog).toContain("Confirm Tax Setup");
    expect(supplierLinesSection).toContain("Tax setup needs confirmation");
    expect(supplierPriceDialog).toContain('data-testid="simple-tax-confirmation"');
    expect(supplierPriceDialog).toContain("Confirm & Use");
    expect(supplierPriceDialog).toContain("The original supplier price and evidence will remain unchanged in history.");
    expect(supplierPriceDialog).toContain('supplierPriceModalMode !== "confirm_tax_simple" ? <div');
    expect(supplierPriceSaveHandler).toContain("confirmMaterialSupplierPriceTaxEvidenceForwardAction");
    expect(supplierPriceSaveHandler).toContain("previousSupplierPriceId: supplierPriceForm.previousSupplierPriceId");
    expect(source).toContain("Tax setup confirmed. This supplier price is now available for estimating.");

    // Advanced review remains available for genuinely ambiguous evidence.
    expect(supplierPriceDialog).toContain("Review the immutable source evidence");
    expect(supplierPriceDialog).toContain("Original immutable evidence");
    expect(supplierPriceDialog).toContain("Applicable organization policy");
    expect(supplierPriceDialog).toContain('id="price-tax-correction-effective"');
    expect(supplierPriceDialog).toContain('id="price-tax-correction-reason"');
    expect(supplierPriceSaveHandler).toContain('supplierPriceModalMode === "confirm_tax_advanced" && supplierPriceForm.sourceTaxBasis === "unknown"');
    expect(supplierPriceSaveHandler).toContain("Choose the confirmed source tax basis before saving a new price version.");
    expect(supplierPriceSaveHandler).toContain("unitCost: Number(supplierPriceForm.unitCost)");
    expect(supplierPriceSaveHandler).toContain("confirmMaterialSupplierPriceTaxEvidenceAction");
  });

  it("adds a lightweight derived Material Pricing preview without changing source-price persistence", () => {
    expect(supplierPriceDialog).toContain('className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto p-0"');
    expect(supplierPriceDialog).toContain("Material Pricing");
    expect(supplierPriceDialog).toContain("<CommercialSummaryCard");
    expect(supplierPriceDialog).toContain('<CommercialSummaryRow label="Material"');
    expect(supplierPriceDialog).toContain('label="Material Unit"');
    expect(supplierPriceDialog).toContain('label="Supplier Price"');
    expect(supplierPriceDialog).toContain('label="Tax Basis"');
    expect(supplierPriceDialog).toContain('label="Conversion"');
    expect(supplierPriceDialog).toContain('label="Comparable Material Cost"');
    expect(supplierPriceDialog).toContain('labelClassName="text-[15px] font-semibold text-[var(--text-primary)]"');
    expect(supplierPriceDialog).toContain("supplierPricePreview.comparableUnitCost");
    expect(supplierPriceDialog).toContain("Conversion required");
    expect(supplierPriceDialog).toContain("Unavailable — unit conversion required");
    expect(supplierPriceDialog).toContain("View conversion details");
    expect(supplierPriceDialog).toContain("conversionEvidenceSummary(supplierPriceModalConversion.proposal_metadata)");
    expect(supplierPriceDialog).not.toContain('<DrawerField label="Normalized Supplier Cost"');
    expect(source).toContain("resolveEffectiveConversionRows({");
    expect(source).toContain("effectiveConversion: supplierPriceModalConversion");
    expect(source).toContain("taxPolicy: initialData.taxPolicy");
    expect(supplierPriceSaveHandler).toContain("unitCost: Number(supplierPriceForm.unitCost)");
    expect(supplierPriceSaveHandler).not.toContain("comparableUnitCost");
    expect(supplierPriceSaveHandler).not.toContain("confirmedUnitConversion");
    expect(supplierPriceSaveHandler).not.toMatch(/anthropic|provider|fetch\(/i);
  });

  it("keeps immutable price history hidden until requested and supplier-filterable", () => {
    expect(materialDetailsDialog).toContain("{isPriceHistoryOpen ? (");
    expect(priceHistorySection).toContain("open");
    expect(priceHistorySection).toContain("<summary");
    expect(priceHistorySection).toContain("py-3 text-sm font-semibold");
    expect(priceHistorySection).not.toContain('className="scroll-mt-4 rounded-[var(--radius-lg)]');
    expect(priceHistorySection).toContain("Price History");
    expect(priceHistorySection).toContain("visibleMaterialPriceRows.map");
    expect(priceHistorySection).toContain("Show All History");
    expect(priceHistorySection).toContain("Technical details");
    expect(priceHistorySection).toContain("price.supplier_description");
    expect(priceHistorySection).toContain("price.supplier_sku");
    expect(priceHistorySection).toContain('label="Supplier Price"');
    expect(priceHistorySection).toContain('label="Conversion"');
    expect(priceHistorySection).toContain('label="Comparable Material Cost"');
    expect(priceHistorySection).toContain("priceHistoryComparisonById.get(price.id)");
    expect(supplierLinesSection).toContain("handleViewSupplierPriceHistory(supplierProduct.id)");
  });

  it("places Supplier Product lifecycle actions at row level and preserves the price-only modal", () => {
    expect(supplierLinesSection).toContain("Remove Supplier Item");
    expect(supplierLinesSection).toContain("Move Supplier Item");
    expect(supplierLinesSection).toContain("supplierProductHasPriceHistory");
    expect(source).toContain("Remove Supplier Item");
    expect(source).toContain("Historical records were preserved");
    expect(source).toContain("Archived Supplier Items");
    expect(source).toContain("Restore Supplier Item?");
    expect(source).toContain("It will not become preferred automatically");
    expect(supplierPriceDialog).not.toContain("Remove Supplier Item");
  });

  it("aligns the Remove Supplier Item dialog with the approved TradesStack modal shell", () => {
    expect(removeSupplierProductDialogStart).toBeGreaterThan(-1);
    expect(removeSupplierProductDialog).toContain('className="max-h-[92vh] w-full max-w-[720px] overflow-hidden p-0"');
    expect(removeSupplierProductDialog).toContain('className="shrink-0 px-7 pb-6 pt-7"');
    expect(removeSupplierProductDialog).not.toContain("Remove this supplier item from active pricing while preserving its historical prices, conversions, assignments, and import records.");
    expect(removeSupplierProductDialog).toContain('className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 pb-5"');
    expect(removeSupplierProductDialog).toContain('aria-labelledby="remove-supplier-product-context-heading"');
    expect(removeSupplierProductDialog).toContain(">Supplier<");
    expect(removeSupplierProductDialog).toContain(">Supplier Item<");
    expect(removeSupplierProductDialog).toContain(">Material<");
    expect(removeSupplierProductDialog).not.toContain('bg-[var(--surface-muted)] p-4 text-sm');
  });

  it("preserves lifecycle form controls, conditional warning, footer, and archive payload", () => {
    expect(removeSupplierProductDialog).toContain('htmlFor="remove-supplier-product-reason"');
    expect(removeSupplierProductDialog).toContain('className={cn(FIELD_SELECT_CLASS, "h-11")}');
    expect(removeSupplierProductDialog).toContain('htmlFor="remove-supplier-product-note"');
    expect(removeSupplierProductDialog).toContain('className={FIELD_TEXTAREA_CLASS}');
    expect(removeSupplierProductDialog).toContain("removeSupplierProduct.is_preferred ? (");
    expect(removeSupplierProductDialog).toContain("This is currently the preferred supplier item.");
    expect(removeSupplierProductDialog).not.toContain("Historical pricing and conversion records will remain available.");
    expect(removeSupplierProductDialog).not.toContain("If this item belongs to another Material, use Move Supplier Item when available.");
    expect(removeSupplierProductDialog).toContain('variant="secondary"');
    expect(removeSupplierProductDialog).toContain('variant="destructive"');
    expect(removeSupplierProductDialog).toContain('supplierProductLifecyclePending ? "Removing..." : "Remove Supplier Item"');
    expect(removeSupplierProductHandler).toContain("reason: removeSupplierProductReason");
    expect(removeSupplierProductHandler).toContain("note: removeSupplierProductNote || null");
  });

  it("keeps the Add Material and import presentation outside the redesign boundary", () => {
    expect(addMaterialDialog).toContain("Add Material");
    expect(source).toContain("MaterialImportUploadZone");
    expect(source).toContain("handleStartImport");
  });
});
