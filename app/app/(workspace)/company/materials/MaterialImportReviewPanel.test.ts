import { describe, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MaterialImportReviewPanel,
  MaterialImportReviewRow,
  deriveMaterialImportReviewPricingPresentation,
  filterExistingMaterials,
  materialImportTaxBasisLabel,
  materialImportRowNeedsAttention,
  materialImportRowStatusLabel,
  moveExistingMaterialActiveIndex,
  type MaterialImportReviewRowState,
  type UnitConversionDraft,
} from "./MaterialImportReviewPanel";
import type { OrganizationTaxPolicy } from "@/lib/tax/types";

const nzTaxPolicy: OrganizationTaxPolicy = {
  id: "nz-gst-policy",
  organizationId: "organization-1",
  jurisdictionCode: "NZ",
  taxName: "GST",
  registrationStatus: "registered",
  comparisonBasis: "exclusive",
  standardRate: 15,
  supportsInclusiveExclusive: true,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveTo: null,
  policySource: "organization_settings",
};

function reviewRow(overrides: Partial<MaterialImportReviewRowState> = {}): MaterialImportReviewRowState {
  return {
    id: "gib-10mm",
    action: "create_material",
    matchedMaterialId: "",
    reviewedName: "GIB Standard Plasterboard 10mm",
    reviewedDescription: "Internal canonical description",
    supplierUnit: "m2",
    supplierUnitReadOnly: true,
    materialUnit: "m2",
    confirmedUnitConversion: null,
    reviewedUnitCost: "8.3",
    reviewedCurrency: "NZD",
    reviewedSupplierDescription: "GIB Standard Plasterboard 10mm",
    reviewedSupplierSku: "",
    status: "pending_review",
    selectedPriceKey: "source-1:fis",
    recommendedPriceKey: "source-1:fis",
    priceOptions: [
      { priceKey: "source-1:fis", label: "FIS PRICE", amount: 8.3, currency: "NZD", evidence: "Page 1", dateLabel: "" },
      { priceKey: "source-1:dts1", label: "DTS1 PRICE", amount: 8.74, currency: "NZD", evidence: "Page 1", dateLabel: "" },
      { priceKey: "source-1:dts2", label: "DTS2 PRICE", amount: 9.1, currency: "NZD", evidence: "Page 1", dateLabel: "" },
    ],
    packLabel: "1 each",
    interpretationWarnings: [],
    confidence: 0.8,
    ...overrides,
  };
}

function confirmedConversion(
  materialQuantity: number,
  materialUnit = "m2",
): NonNullable<MaterialImportReviewRowState["confirmedUnitConversion"]> {
  return {
    supplierQuantity: 1,
    supplierUnit: "sheet",
    materialQuantity,
    materialUnit,
    convertedUnitCost: 78.8 / materialQuantity,
    currency: "NZD",
    contractVersion: "material_unit_conversion_v2",
    source: "user_confirmed_ai",
    explanation: `One sheet covers ${materialQuantity} ${materialUnit}.`,
    confidence: 0.99,
    basis: "selected_material_context",
    evidenceRefs: ["selected_material.description"],
    evidenceSummary: "Explicit product dimensions.",
    selectedMaterialId: null,
    selectedMaterialUpdatedAt: null,
    contextHash: "context-hash",
    promptVersion: "material_unit_conversion_prompt_v2",
  };
}

function existingMaterial(id: string, name: string, defaultUnit = "each") {
  return {
    id,
    name,
    normalized_name: name.trim().toLowerCase().replace(/\s+/g, " "),
    default_unit: defaultUnit,
    description: null,
    category: null,
  } as never;
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (predicate(element)) return element;
  return findElement(element.props.children as ReactNode, predicate);
}

describe("Material Import review row presentation", () => {
  it("treats a selected GIB source price as ready while retaining every source option", () => {
    const row = reviewRow();
    expect(row.priceOptions.map((price) => price.label)).toEqual(["FIS PRICE", "DTS1 PRICE", "DTS2 PRICE"]);
    expect(materialImportRowNeedsAttention(row)).toBe(false);
    expect(materialImportRowStatusLabel(row)).toBe("Ready");
  });

  it("renders the GIB row as a compact collapsed summary without mounting detail editors", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewPanel, {
      rows: [reviewRow()],
      selectedRowIds: ["gib-10mm"],
      materials: [],
      onSelectedRowIdsChange: () => undefined,
      onUpdateRow: () => undefined,
    }));

    expect(html).toContain("GIB Standard Plasterboard 10mm");
    expect(html).toContain("m²");
    expect(html).not.toContain("FIS PRICE · 3 price options");
    expect(html).not.toContain("No SKU");
    expect(html).toContain("Create New");
    expect(html).toContain("Details");
    expect(html).toContain("Details — ready for GIB Standard Plasterboard 10mm");
    expect(html).toContain("status-approved-light");
    expect(html).not.toContain(">Ready<");
    expect(html).not.toContain("Supplier Prices");
    expect(html).not.toContain("Interpretation confidence");
    expect(html).not.toContain("Internal canonical description");
  });

  it("flags unresolved multiple-price and Match Existing decisions for attention", () => {
    expect(materialImportRowStatusLabel(reviewRow({ selectedPriceKey: "" }))).toBe("Needs Attention");
    expect(materialImportRowStatusLabel(reviewRow({ action: "match_material", matchedMaterialId: "" }))).toBe("Needs Attention");
  });

  it("surfaces only the affected approval conflict as row-level attention", () => {
    const failed = reviewRow({
      approvalError: {
        code: "duplicate_supplier_product_target",
        message: "Two selected rows resolve to the same Supplier Product.",
      },
    });
    expect(materialImportRowNeedsAttention(failed)).toBe(true);
    expect(materialImportRowStatusLabel(failed)).toBe("Needs Attention");

    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: failed,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));
    expect(html).toContain('data-testid="material-import-row-error-gib-10mm"');
    expect(html).toContain("This row needs attention");
    expect(html).toContain("Two selected rows resolve to the same Supplier Product.");
    expect(html).toContain("Details — needs attention");
  });

  it("communicates attention through the Details control without a visible status label", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewPanel, {
      rows: [reviewRow({ selectedPriceKey: "", interpretationWarnings: ["Confirm source price"] })],
      selectedRowIds: [],
      materials: [],
      onSelectedRowIdsChange: () => undefined,
      onUpdateRow: () => undefined,
    }));

    expect(html).toContain("Details — needs attention for GIB Standard Plasterboard 10mm");
    expect(html).toContain("status-overdue-light");
    expect(html).not.toContain(">Needs Attention<");
    expect(html).not.toContain("Confirm source price");
    expect(html).not.toContain("Page 1");
    expect(html).not.toContain("1 each");
  });

  it("keeps expanded review focused on actionable fields and source price choices", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({ interpretationWarnings: ["Confirm source price"] }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="material-import-row-details-gib-10mm"');
    expect(html).toContain('id="material-import-row-details-gib-10mm"');
    expect(html).toContain("Pricing");
    expect(html).toContain("FIS PRICE");
    expect(html).toContain("DTS1 PRICE");
    expect(html).toContain("DTS2 PRICE");
    expect(html).toContain("Manual price");
    expect(html).not.toContain("Evidence and Review Notes");
    expect(html).not.toContain("Interpretation confidence");
    expect(html).not.toContain("Confirm source price");
    expect(html).not.toContain("Page 1");
    expect(html).not.toContain("1 each");
  });

  it("uses the Supplier Invoice field and section rhythm in expanded details", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow(),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    expect(html).toContain('id="material-import-row-details-gib-10mm" class="border-t border-[var(--border)] bg-[var(--surface-muted)]/35 px-4 py-4"');
    expect(html).toContain('class="space-y-3"');
    expect(html).toContain('data-testid="review-step-marker-1"');
    expect(html).toContain('data-testid="review-step-marker-2"');
    expect(html).toContain('data-testid="review-step-marker-3"');
    expect(html).toContain('data-testid="review-step-marker-4"');
    expect(html).toContain("Material Name");
    expect(html).toContain("Supplier Item");
    expect(html).toContain("Supplier Pricing");
    expect(html).toContain("Material Library");
    expect(html).toContain("Pricing Summary");
    expect(html).toContain("What TradesStack identified from the supplier.");
    expect(html).toContain("Choose the supplier price and confirm its tax basis.");
    expect(html).toContain("Choose where this supplier item belongs.");
    expect(html).toContain("Final comparable pricing for this Material.");
    expect(html).toContain("rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4");
    expect(html).toContain("h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5");
  });

  it("orders expanded details as source, pricing, Material Library, conversion, then final cost", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({ supplierUnit: "sheet", materialUnit: "m2", reviewedTaxBasis: "inclusive", reviewedSourceTaxRate: 15 }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    const supplierItem = html.indexOf('aria-labelledby="supplier-item-fields-gib-10mm"');
    const supplierPricing = html.indexOf('aria-labelledby="supplier-prices-gib-10mm"');
    const materialLibrary = html.indexOf('aria-labelledby="material-fields-gib-10mm"');
    const unitConversion = html.indexOf('aria-labelledby="unit-conversion-gib-10mm"');
    const pricingSummary = html.indexOf('aria-labelledby="pricing-summary-gib-10mm"');
    expect(supplierItem).toBeGreaterThan(-1);
    expect(supplierItem).toBeLessThan(supplierPricing);
    expect(supplierPricing).toBeLessThan(materialLibrary);
    expect(materialLibrary).toBeLessThan(unitConversion);
    expect(unitConversion).toBeLessThan(pricingSummary);
    expect(html).toContain("Convert supplier unit to Material unit.");
    expect(html).toContain('data-testid="review-step-marker-5"');

    const summaryMarkup = html.slice(pricingSummary);
    expect(summaryMarkup.indexOf("<section", 8)).toBe(-1);
    expect(summaryMarkup).not.toContain("<input");
    expect(summaryMarkup).not.toContain("<select");
    expect(summaryMarkup).not.toContain("<button");
  });

  it("omits Unit Conversion for same-unit rows while keeping Pricing Summary last", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({ supplierUnit: "m2", materialUnit: "m²" }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    const supplierItem = html.indexOf('aria-labelledby="supplier-item-fields-gib-10mm"');
    const supplierPricing = html.indexOf('aria-labelledby="supplier-prices-gib-10mm"');
    const materialLibrary = html.indexOf('aria-labelledby="material-fields-gib-10mm"');
    const pricingSummary = html.indexOf('aria-labelledby="pricing-summary-gib-10mm"');
    expect(supplierItem).toBeLessThan(supplierPricing);
    expect(supplierPricing).toBeLessThan(materialLibrary);
    expect(materialLibrary).toBeLessThan(pricingSummary);
    expect(html).not.toContain('aria-labelledby="unit-conversion-gib-10mm"');
  });

  it("renders one or many supplier prices as compact flat rows with a compact manual row", () => {
    const singlePrice = reviewRow({
      selectedPriceKey: "source-1:fis",
      recommendedPriceKey: "source-1:fis",
      priceOptions: [
        { priceKey: "source-1:fis", label: "Each (per length)", amount: 48.75, currency: "NZD", evidence: "Page 1", dateLabel: "" },
      ],
    });
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: singlePrice,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    expect(html).toContain("Each (per length)");
    expect(html).toContain("$48.75 NZD");
    expect(html).toContain("Manual price");
    expect(html).toContain("divide-y divide-[var(--border-subtle)]");
    expect(html).toContain("bg-[var(--orange-soft)]");
    expect(html).toContain('aria-label="Manual price amount for GIB Standard Plasterboard 10mm"');
    expect(html).toContain('disabled:opacity-50 h-9');
    expect(html).not.toContain("DTS1 PRICE");
  });

  it("separates supplier truth from an editable Material unit and renders an explicit proposal", () => {
    const row = reviewRow({ supplierUnit: "each", materialUnit: "lm", reviewedUnitCost: "48.75" });
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-1",
      conversionDraft: {
        status: "proposal",
        proposal: {
          contractVersion: "material_unit_conversion_v2",
          status: "convertible",
          supplierUnit: "each",
          requestedMaterialUnit: "lm",
          supplierQuantity: 1,
          materialQuantity: 6,
          convertedUnitCost: 8.125,
          currency: "NZD",
          basis: "supplier_source",
          evidenceRefs: ["supplier.description"],
          evidenceSummary: "The supplier description identifies a six metre length.",
          explanation: "One six metre length.",
          missingInformation: [],
          confidence: 0.98,
          contextHash: "context-hash",
          selectedMaterialId: null,
          selectedMaterialUpdatedAt: null,
          promptVersion: "material_unit_conversion_prompt_v2",
          additionalInformation: null,
        },
        error: null,
        additionalValue: "",
        additionalUnit: "",
        additionalLabel: "",
      },
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
      onConversionDraftChange: () => undefined,
    }));

    expect(html).toContain("Supplier Unit");
    expect(html).toContain("Material Unit");
    expect(html).toContain("Conversion found");
    expect(html).toContain("1 each = 6 lm");
    expect(html).not.toContain("$48.75 / each →");
    expect(html).not.toContain("$8.13 / lm");
    expect(html).toContain("Use Conversion");
  });

  it("requires Use Conversion to create the confirmed draft and makes no provider call", () => {
    let row = reviewRow({
      action: "match_material",
      matchedMaterialId: "material-gib",
      supplierUnit: "each",
      materialUnit: "m2",
      reviewedUnitCost: "46",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tree = MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-gib",
      conversionDraft: {
        status: "proposal",
        proposal: {
          contractVersion: "material_unit_conversion_v2",
          status: "convertible",
          supplierUnit: "each",
          requestedMaterialUnit: "m2",
          supplierQuantity: 1,
          materialQuantity: 2.88,
          convertedUnitCost: 46 / 2.88,
          currency: "NZD",
          basis: "selected_material_context",
          evidenceRefs: ["selected_material.description"],
          evidenceSummary: "Selected Material dimensions: 2400 × 1200mm",
          explanation: "Explicit area.",
          missingInformation: [],
          confidence: 0.99,
          contextHash: "context-hash",
          selectedMaterialId: "material-gib",
          selectedMaterialUpdatedAt: "2026-08-15T00:38:29Z",
          promptVersion: "material_unit_conversion_prompt_v2",
          additionalInformation: null,
        },
        error: null,
        additionalValue: "",
        additionalUnit: "",
        additionalLabel: "",
      },
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
      onConversionDraftChange: () => undefined,
    });
    expect(row.confirmedUnitConversion).toBeNull();
    const useButton = findElement(tree, (element) => element.props.children === "Use Conversion");
    (useButton?.props.onClick as (() => void) | undefined)?.();
    expect(row.confirmedUnitConversion).toMatchObject({
      supplierQuantity: 1,
      materialQuantity: 2.88,
      selectedMaterialId: "material-gib",
      contextHash: "context-hash",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reveals Convert Unit immediately after a Create New row changes from each to lm and invokes the row API", async () => {
    let row = reviewRow({
      id: "radiata-2055895",
      reviewedName: "Radiata SG8 H1.2 Dry Timber 90 × 45 × 6.0m",
      reviewedSupplierDescription: "Radiata SG8 H1.2 Dry Timber 90 × 45 × 6.0m",
      reviewedSupplierSku: "2055895",
      supplierUnit: "each",
      materialUnit: "each",
      reviewedUnitCost: "48.75",
      action: "create_material",
    });
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-radiata",
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
      onConversionDraftChange: () => undefined,
    });

    expect(renderToStaticMarkup(renderRow())).not.toContain("Convert Unit");
    const materialUnitInput = findElement(renderRow(), (element) => element.props.id === "material-unit-radiata-2055895");
    expect(materialUnitInput).not.toBeNull();
    const onChange = materialUnitInput?.props.onChange as ((event: { target: { value: string } }) => void) | undefined;
    onChange?.({ target: { value: "lm" } });

    const changedTree = renderRow();
    expect(renderToStaticMarkup(changedTree)).toContain("Convert Unit");
    const convertButton = findElement(changedTree, (element) => element.props["aria-label"] === "Convert Unit");
    expect(convertButton).not.toBeNull();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        proposal: {
          contractVersion: "material_unit_conversion_v2",
          status: "convertible",
          supplierUnit: "each",
          requestedMaterialUnit: "lm",
          supplierQuantity: 1,
          materialQuantity: 6,
          convertedUnitCost: 8.125,
          currency: "NZD",
          basis: "supplier_source",
          evidenceRefs: ["supplier.description"],
          evidenceSummary: "The supplier description identifies a six metre length.",
          explanation: "One six metre length.",
          missingInformation: [],
          confidence: 0.98,
          contextHash: "context-hash",
          selectedMaterialId: null,
          selectedMaterialUpdatedAt: null,
          promptVersion: "material_unit_conversion_prompt_v2",
          additionalInformation: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClick = convertButton?.props.onClick as (() => void) | undefined;
    onClick?.();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const [url, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/materials/imports/batch-radiata/rows/radiata-2055895/unit-conversion");
    expect(JSON.parse(request.body)).toMatchObject({ requestedMaterialUnit: "lm" });
    expect(row.supplierUnit).toBe("each");
    expect(row.materialUnit).toBe("lm");
    vi.unstubAllGlobals();
  });

  it("sends only the selected Material ID for Match Existing conversion context", async () => {
    const row = reviewRow({
      action: "match_material",
      matchedMaterialId: "material-gib",
      supplierUnit: "each",
      materialUnit: "m2",
      reviewedUnitCost: "46",
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: "needs_information" }) });
    vi.stubGlobal("fetch", fetchMock);
    const tree = MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [existingMaterial("material-gib", "GIB Fyreline® 13mm", "m2")],
      batchId: "batch-gib",
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
      onConversionDraftChange: () => undefined,
    });
    const button = findElement(tree, (element) => element.props["aria-label"] === "Convert Unit");
    (button?.props.onClick as (() => void) | undefined)?.();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      requestedMaterialUnit: "m2",
      selectedPriceKey: "source-1:fis",
      selectedMaterialId: "material-gib",
    });
    expect(body).not.toHaveProperty("materialDescription");
    expect(body).not.toHaveProperty("sourcePrice");
    vi.unstubAllGlobals();
  });

  it.each([
    ["provider_unavailable", "Unit conversion is temporarily unavailable."],
    ["needs_information", "More product information is required to convert each to m²."],
    ["unsafe_conversion", "TradesStack could not verify a safe conversion from the available product information."],
    ["not_convertible", "These units cannot be safely converted from the available product information."],
    ["invalid_context", "The selected Material or source price has changed. Review the conversion again."],
  ] as const)("maps %s to safe exact UI copy", async (code, expectedCopy) => {
    const row = reviewRow({ supplierUnit: "each", materialUnit: "m2", reviewedUnitCost: "46" });
    let conversionDraft: UnitConversionDraft = {
      status: "idle",
      proposal: null,
      error: null,
      additionalValue: "",
      additionalUnit: "",
      additionalLabel: "",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ code, error: "raw private provider detail" }),
    }));
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-gib",
      conversionDraft,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
      onConversionDraftChange: (updates) => { conversionDraft = { ...conversionDraft, ...updates }; },
    });
    const button = findElement(renderRow(), (element) => element.props["aria-label"] === "Convert Unit");
    (button?.props.onClick as (() => void) | undefined)?.();
    await vi.waitFor(() => expect(conversionDraft.status).toBe("error"));
    const html = renderToStaticMarkup(renderRow());
    expect(html).toContain(expectedCopy);
    expect(html).not.toContain("raw private provider detail");
    vi.unstubAllGlobals();
  });

  it("shows row-scoped loading feedback, blocks duplicates, and transitions to the proposal", async () => {
    const row = reviewRow({ supplierUnit: "each", materialUnit: "lm", reviewedUnitCost: "48.75" });
    let conversionDraft: UnitConversionDraft = {
      status: "idle",
      proposal: null,
      error: null,
      additionalValue: "",
      additionalUnit: "",
      additionalLabel: "",
    };
    let resolveResponse: ((response: {
      ok: boolean;
      json: () => Promise<{ proposal: NonNullable<UnitConversionDraft["proposal"]> }>;
    }) => void) | undefined;
    const responsePromise = new Promise<{
      ok: boolean;
      json: () => Promise<{ proposal: NonNullable<UnitConversionDraft["proposal"]> }>;
    }>((resolve) => { resolveResponse = resolve; });
    const fetchMock = vi.fn().mockReturnValue(responsePromise);
    vi.stubGlobal("fetch", fetchMock);
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-radiata",
      conversionDraft,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
      onConversionDraftChange: (updates) => { conversionDraft = { ...conversionDraft, ...updates }; },
    });

    const idleButton = findElement(renderRow(), (element) => element.props["aria-label"] === "Convert Unit");
    const clickIdle = idleButton?.props.onClick as (() => void) | undefined;
    clickIdle?.();
    expect(conversionDraft.status).toBe("converting");

    const loadingTree = renderRow();
    const loadingHtml = renderToStaticMarkup(loadingTree);
    expect(loadingHtml).toContain("animate-spin");
    expect(loadingHtml).toContain("Converting supplier pricing…");
    expect(loadingHtml).toContain('aria-busy="true"');
    expect(loadingHtml).toContain('disabled=""');
    const loadingButton = findElement(loadingTree, (element) => element.props["aria-label"] === "Working out conversion");
    expect(loadingButton?.props.disabled).toBe(true);
    const clickLoading = loadingButton?.props.onClick as (() => void) | undefined;
    clickLoading?.();
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveResponse?.({
      ok: true,
      json: async () => ({
        proposal: {
          contractVersion: "material_unit_conversion_v2",
          status: "convertible",
          supplierUnit: "each",
          requestedMaterialUnit: "lm",
          supplierQuantity: 1,
          materialQuantity: 6,
          convertedUnitCost: 8.125,
          currency: "NZD",
          basis: "supplier_source",
          evidenceRefs: ["supplier.description"],
          evidenceSummary: "The supplier description identifies a six metre length.",
          explanation: "One six metre length.",
          missingInformation: [],
          confidence: 0.98,
          contextHash: "context-hash",
          selectedMaterialId: null,
          selectedMaterialUpdatedAt: null,
          promptVersion: "material_unit_conversion_prompt_v2",
          additionalInformation: null,
        },
      }),
    });
    await vi.waitFor(() => expect(conversionDraft.status).toBe("proposal"));
    const proposalHtml = renderToStaticMarkup(renderRow());
    expect(proposalHtml).not.toContain("Converting supplier pricing…");
    expect(proposalHtml).toContain("Conversion found");
    expect(proposalHtml).toContain("Use Conversion");
    vi.unstubAllGlobals();
  });

  it("removes loading feedback and exposes the safe retry state after an API error", async () => {
    const row = reviewRow({ supplierUnit: "each", materialUnit: "lm", reviewedUnitCost: "48.75" });
    let conversionDraft: UnitConversionDraft = {
      status: "idle",
      proposal: null,
      error: null,
      additionalValue: "",
      additionalUnit: "",
      additionalLabel: "",
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider detail")));
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-radiata",
      conversionDraft,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
      onConversionDraftChange: (updates) => { conversionDraft = { ...conversionDraft, ...updates }; },
    });
    const button = findElement(renderRow(), (element) => element.props["aria-label"] === "Convert Unit");
    const onClick = button?.props.onClick as (() => void) | undefined;
    onClick?.();
    await vi.waitFor(() => expect(conversionDraft.status).toBe("error"));

    const errorHtml = renderToStaticMarkup(renderRow());
    expect(errorHtml).not.toContain("Converting supplier pricing…");
    expect(errorHtml).toContain("Unit conversion is temporarily unavailable.");
    expect(errorHtml).toContain("Try Again");
    expect(errorHtml).not.toContain("provider detail");
    vi.unstubAllGlobals();
  });

  it("keeps conversion loading feedback isolated to the active row", () => {
    const convertingDraft: UnitConversionDraft = {
      status: "converting",
      proposal: null,
      error: null,
      additionalValue: "",
      additionalUnit: "",
      additionalLabel: "",
    };
    const idleDraft: UnitConversionDraft = { ...convertingDraft, status: "idle" };
    const renderWithDraft = (id: string, conversionDraft: UnitConversionDraft) => renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({ id, supplierUnit: "each", materialUnit: "lm" }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-radiata",
      conversionDraft,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    expect(renderWithDraft("row-a", convertingDraft)).toContain("Converting supplier pricing…");
    expect(renderWithDraft("row-b", idleDraft)).not.toContain("Converting supplier pricing…");
    expect(renderWithDraft("row-b", idleDraft)).toContain("Convert Unit");
  });

  it("shows Convert Unit for a Match Existing row whose Material unit differs", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({
        action: "match_material",
        matchedMaterialId: "material-radiata",
        supplierUnit: "each",
        materialUnit: "lm",
        reviewedUnitCost: "48.75",
      }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-radiata",
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    expect(html).toContain("Convert Unit");
  });

  it("renders Existing Material as a typable filtered input", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({
        action: "match_material",
        matchedMaterialId: "material-gib",
      }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [existingMaterial("material-gib", "GIB Standard Plasterboard 13mm 2700×1200", "sheet")],
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('placeholder="Search materials..."');
    expect(html).toContain('value="GIB Standard Plasterboard 13mm 2700×1200"');
    expect(html).not.toContain('<datalist id="matched-material-gib-10mm-options">');
  });

  it("filters Existing Material suggestions immediately with token and prefix matching", () => {
    const materials = [
      existingMaterial("gib-13", "GIB Standard Plasterboard 13mm 2700×1200mm", "sheet"),
      existingMaterial("gib-10", "GIB Standard Plasterboard 10mm", "sheet"),
      existingMaterial("timber", "Radiata SG8 H1.2 Timber 90×45", "lm"),
    ];

    expect(filterExistingMaterials(materials, "st").map((material) => material.id)).toEqual(["gib-10", "gib-13"]);
    expect(filterExistingMaterials(materials, "gib std").map((material) => material.id)).toEqual(["gib-10", "gib-13"]);
    expect(filterExistingMaterials(materials, "standard 13").map((material) => material.id)).toEqual(["gib-13"]);
    expect(filterExistingMaterials(materials, "13mm").map((material) => material.id)).toEqual(["gib-13"]);
    expect(filterExistingMaterials(materials, "nonsense")).toEqual([]);
  });

  it("wraps Existing Material keyboard navigation in both directions", () => {
    expect(moveExistingMaterialActiveIndex(0, 3, "next")).toBe(1);
    expect(moveExistingMaterialActiveIndex(2, 3, "next")).toBe(0);
    expect(moveExistingMaterialActiveIndex(0, 3, "previous")).toBe(2);
    expect(moveExistingMaterialActiveIndex(0, 0, "next")).toBe(0);
  });

  it("clears a confirmed conversion and reveals Convert Unit when the target unit changes", () => {
    let row = reviewRow({
      supplierUnit: "each",
      materialUnit: "lm",
      reviewedUnitCost: "48.75",
      confirmedUnitConversion: {
        supplierQuantity: 1,
        supplierUnit: "each",
        materialQuantity: 6,
        materialUnit: "lm",
        convertedUnitCost: 8.125,
        currency: "NZD",
        contractVersion: "material_unit_conversion_v1",
        source: "user_confirmed_ai",
        explanation: "One six metre length.",
        confidence: 0.98,
      },
    });
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-radiata",
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
    });

    expect(renderToStaticMarkup(renderRow())).toContain("Conversion confirmed");
    const materialUnitInput = findElement(renderRow(), (element) => element.props.id === "material-unit-gib-10mm");
    const onChange = materialUnitInput?.props.onChange as ((event: { target: { value: string } }) => void) | undefined;
    onChange?.({ target: { value: "m2" } });

    expect(row.confirmedUnitConversion).toBeNull();
    expect(row.materialUnit).toBe("m2");
    expect(renderToStaticMarkup(renderRow())).toContain("Convert Unit");
  });

  it("clears proposal and confirmed draft when the matched Material changes", () => {
    let row = reviewRow({
      action: "match_material",
      matchedMaterialId: "material-a",
      supplierUnit: "each",
      materialUnit: "m2",
      confirmedUnitConversion: {
        supplierQuantity: 1,
        supplierUnit: "each",
        materialQuantity: 2.88,
        materialUnit: "m2",
        convertedUnitCost: 46 / 2.88,
        currency: "NZD",
        contractVersion: "material_unit_conversion_v1",
        source: "user_confirmed_ai",
        explanation: null,
        confidence: null,
      },
    });
    let conversionDraft: UnitConversionDraft = {
      status: "proposal",
      proposal: null,
      error: null,
      additionalValue: "",
      additionalUnit: "",
      additionalLabel: "",
    };
    const materials = [
      existingMaterial("material-a", "Material A", "m2"),
      existingMaterial("material-b", "Material B", "lm"),
    ];
    const tree = MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials,
      batchId: "batch-1",
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
      conversionDraft,
      onConversionDraftChange: (updates) => { conversionDraft = { ...conversionDraft, ...updates }; },
    });
    const matcher = findElement(tree, (element) => element.props.id === "matched-material-gib-10mm");
    (matcher?.props.onSelect as ((materialId: string) => void) | undefined)?.("material-b");
    expect(row.matchedMaterialId).toBe("material-b");
    expect(row.materialUnit).toBe("lm");
    expect(row.confirmedUnitConversion).toBeNull();
    expect(conversionDraft.status).toBe("idle");
    expect(conversionDraft.proposal).toBeNull();
  });

  it("reuses an existing confirmed Supplier Product conversion without a provider call", () => {
    let row = reviewRow({
      action: "match_material",
      matchedMaterialId: "",
      supplierUnit: "each",
      materialUnit: "each",
      reviewedSupplierSku: "ABC-1",
      reviewedUnitCost: "48.75",
    });
    const selectedMaterial = existingMaterial("material-radiata", "Radiata timber", "lm");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tree = MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [selectedMaterial],
      supplierId: "supplier-1",
      supplierProducts: [{
        id: "product-1",
        material_id: "material-radiata",
        supplier_id: "supplier-1",
        supplier_unit: "each",
        normalized_supplier_sku: "abc-1",
        normalized_supplier_description: null,
        is_active: true,
        archived_at: null,
      } as never],
      unitConversions: [{
        supplier_product_id: "product-1",
        supplier_quantity: 1,
        supplier_unit: "each",
        material_quantity: 6,
        material_unit: "lm",
        source: "user_confirmed_ai",
        effective_to: null,
      } as never],
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
    });
    const matcher = findElement(tree, (element) => element.props.id === "matched-material-gib-10mm");
    (matcher?.props.onSelect as ((materialId: string) => void) | undefined)?.("material-radiata");
    expect(row.confirmedUnitConversion).toMatchObject({
      supplierQuantity: 1,
      materialQuantity: 6,
      convertedUnitCost: 8.125,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("renders generic missing-information inputs without auto-confirming", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({ supplierUnit: "each", materialUnit: "kg", reviewedUnitCost: "50" }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      batchId: "batch-1",
      conversionDraft: {
        status: "needs_information",
        proposal: {
          contractVersion: "material_unit_conversion_v2",
          status: "needs_information",
          supplierUnit: "each",
          requestedMaterialUnit: "kg",
          supplierQuantity: null,
          materialQuantity: null,
          convertedUnitCost: null,
          currency: "NZD",
          basis: null,
          evidenceRefs: [],
          evidenceSummary: null,
          explanation: null,
          missingInformation: ["Weight per supplier item"],
          confidence: null,
          contextHash: "context-hash",
          selectedMaterialId: null,
          selectedMaterialUpdatedAt: null,
          promptVersion: "material_unit_conversion_prompt_v2",
          additionalInformation: null,
        },
        error: null,
        additionalValue: "",
        additionalUnit: "",
        additionalLabel: "",
      },
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
      onConversionDraftChange: () => undefined,
    }));
    expect(html).toContain("More product information is required");
    expect(html).toContain("Weight per supplier item");
    expect(html).toContain("Sheet width");
    expect(html).toContain("Convert Again");
    expect(html).not.toContain("Use Conversion");
  });

  it("renders Purchase Order-style pricing columns with inline selected tax editing", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({
        reviewedTaxBasis: "inclusive",
        reviewedSourceTaxRate: 15,
        priceOptions: [{
          priceKey: "source-1:fis",
          label: "Per Sheet (Incl. GST)",
          amount: 78.8,
          currency: "NZD",
          evidence: "Page 1",
          dateLabel: "",
          taxBasis: "inclusive",
          sourceTaxRate: 15,
        }],
        reviewedUnitCost: "78.8",
      }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));

    expect(html).toContain("Price Source");
    expect(html).toContain("Tax Basis");
    expect(html).toContain("Supplier Unit");
    expect(html).toContain("Supplier Price");
    expect(html.indexOf("Supplier Price")).toBeLessThan(html.indexOf("Tax Basis"));
    const supplierPricingStart = html.indexOf('aria-labelledby="supplier-prices-gib-10mm"');
    const materialLibraryStart = html.indexOf('aria-labelledby="material-fields-gib-10mm"');
    const supplierPricingMarkup = html.slice(supplierPricingStart, materialLibraryStart);
    expect(supplierPricingMarkup).not.toContain("Material Cost");
    expect(supplierPricingMarkup).not.toContain("$68.52 / m²");
    expect(html).toContain("Manual price");
    expect(html).toContain("Per Sheet</span>");
    expect(html).not.toContain("Per Sheet (Incl. GST)</span>");
    expect(html).toContain('id="price-tax-basis-gib-10mm"');
    expect(html).toContain("min-w-[760px]");
    expect(html).toContain("rounded-[18px]");
    expect(html).toContain("Incl. GST");
    expect(html).toContain("Excl. GST");
    expect(html).toContain("$68.52 / m²");
    expect(materialImportTaxBasisLabel("inclusive", { ...nzTaxPolicy, taxName: "VAT" })).toBe("Incl. VAT");
    expect(materialImportTaxBasisLabel("exclusive", null)).toBe("Excl. Tax");
  });

  it("changes only the reviewed tax basis and refreshes the same-unit comparable preview without a provider call", () => {
    let row = reviewRow({
      reviewedTaxBasis: "inclusive",
      reviewedSourceTaxRate: 15,
      reviewedUnitCost: "78.8",
      priceOptions: [{
        priceKey: "source-1:fis",
        label: "Per Sheet (Incl. GST)",
        amount: 78.8,
        currency: "NZD",
        evidence: "Page 1",
        dateLabel: "",
        taxBasis: "inclusive",
        sourceTaxRate: 15,
      }],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
    });

    const select = findElement(renderRow(), (element) => element.props.id === "price-tax-basis-gib-10mm");
    (select?.props.onChange as ((event: { target: { value: string } }) => void))({ target: { value: "exclusive" } });
    expect(row.reviewedTaxBasis).toBe("exclusive");
    expect(row.reviewedUnitCost).toBe("78.8");
    expect(row.selectedPriceKey).toBe("source-1:fis");
    let html = renderToStaticMarkup(renderRow());
    expect(html).toContain("$78.80 / m²");
    expect(html).toContain("Source suggested: Incl. GST");

    const changedSelect = findElement(renderRow(), (element) => element.props.id === "price-tax-basis-gib-10mm");
    (changedSelect?.props.onChange as ((event: { target: { value: string } }) => void))({ target: { value: "inclusive" } });
    html = renderToStaticMarkup(renderRow());
    expect(html).toContain("$68.52 / m²");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("marks unknown tax as non-comparable while keeping the source price valid", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({ reviewedTaxBasis: "unknown", reviewedUnitCost: "78.8" }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));
    expect(html).toContain("Unavailable");
    expect(html).toContain("Pricing Summary");
    expect(html).toContain("Confirm price tax basis.");
  });

  it("loads each selected source price tax basis and preserves it for Manual price", () => {
    let row = reviewRow({
      reviewedTaxBasis: "inclusive",
      priceOptions: [
        { priceKey: "incl", label: "Retail Incl. GST", amount: 230, currency: "NZD", evidence: "", dateLabel: "", taxBasis: "inclusive", sourceTaxRate: 15 },
        { priceKey: "excl", label: "Trade Excl. GST", amount: 100, currency: "NZD", evidence: "", dateLabel: "", taxBasis: "exclusive", sourceTaxRate: 15 },
      ],
      selectedPriceKey: "incl",
      recommendedPriceKey: "incl",
      reviewedUnitCost: "230",
      reviewedSourceTaxRate: 15,
    });
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
    });

    const exclusivePrice = findElement(renderRow(), (element) => element.type === "input" && element.props.value === "excl");
    (exclusivePrice?.props.onChange as (() => void))();
    expect(row).toMatchObject({ selectedPriceKey: "excl", reviewedTaxBasis: "exclusive", reviewedUnitCost: "100" });
    const switchedHtml = renderToStaticMarkup(renderRow());
    expect(switchedHtml).toContain(">Trade</span>");
    expect(switchedHtml).not.toContain(">Trade Excl. GST</span>");
    expect(switchedHtml).toContain('data-testid="compact-summary-cost-gib-10mm">$100.00');
    expect(switchedHtml).toContain("$100.00 / m²");
    expect(switchedHtml).not.toContain('data-testid="compact-summary-cost-gib-10mm">$200.00');

    const manual = findElement(renderRow(), (element) => element.type === "input" && element.props.value === "manual");
    (manual?.props.onChange as (() => void))();
    expect(row.selectedPriceKey).toBe("manual");
    expect(row.reviewedTaxBasis).toBe("exclusive");
    const manualHtml = renderToStaticMarkup(renderRow());
    expect(manualHtml).toContain("Tax Basis");
    expect(manualHtml.match(/id="price-tax-basis-gib-10mm"/g)).toHaveLength(1);
    expect(manualHtml).toContain("bg-[var(--orange-soft)]");
  });

  it("combines tax normalization with a confirmed unit conversion deterministically", () => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: reviewRow({
        supplierUnit: "each",
        materialUnit: "m2",
        reviewedUnitCost: "78.8",
        reviewedTaxBasis: "inclusive",
        reviewedSourceTaxRate: 15,
        confirmedUnitConversion: {
          supplierQuantity: 1,
          supplierUnit: "each",
          materialQuantity: 2.88,
          materialUnit: "m2",
          convertedUnitCost: 78.8 / 2.88,
          currency: "NZD",
          contractVersion: "material_unit_conversion_v2",
          source: "user_confirmed_ai",
          explanation: "One sheet covers 2.88 m2.",
          confidence: 0.99,
          basis: "selected_material_context",
          evidenceRefs: ["selected_material.description"],
          evidenceSummary: "2400 × 1200mm sheet",
          selectedMaterialId: null,
          selectedMaterialUpdatedAt: null,
          contextHash: "context-hash",
          promptVersion: "material_unit_conversion_prompt_v2",
        },
      }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));
    expect(html).toContain("$23.79 / m²");
  });

  it("uses the tax-normalized comparable GIB cost in both the compact row and expanded Pricing", () => {
    const row = reviewRow({
      id: "gib-fyreline-2700",
      reviewedName: "Gib Fyreline 13mm 2.7 × 1.2M",
      supplierUnit: "sheet",
      materialUnit: "m2",
      reviewedUnitCost: "78.8",
      reviewedTaxBasis: "inclusive",
      reviewedSourceTaxRate: 15,
      selectedPriceKey: "per-sheet",
      recommendedPriceKey: "per-sheet",
      priceOptions: [{
        priceKey: "per-sheet",
        label: "Per Sheet (Incl. GST)",
        amount: 78.8,
        currency: "NZD",
        evidence: "Page 1",
        dateLabel: "",
        taxBasis: "inclusive",
        sourceTaxRate: 15,
      }],
      confirmedUnitConversion: confirmedConversion(3.24),
    });
    const presentation = deriveMaterialImportReviewPricingPresentation(row, nzTaxPolicy);
    expect(presentation).toMatchObject({
      sourceAmount: 78.8,
      sourceUnit: "sheet",
      comparisonUnit: "m2",
      summaryUnit: "m2",
      summaryStatus: "comparable",
    });
    expect(presentation.normalizedSupplierCost).toBeCloseTo(78.8 / 1.15, 5);
    expect(presentation.comparableMaterialCost).toBeCloseTo(21.15, 2);
    expect(presentation.summaryAmount).toBeCloseTo(21.15, 2);

    const html = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));
    expect(html).toContain('data-testid="compact-summary-unit-gib-fyreline-2700">m²</span>');
    expect(html).toContain('data-testid="compact-summary-cost-gib-fyreline-2700">$21.15');
    expect(html).toContain("Pricing Summary");
    expect(html).toContain("Supplier Price");
    expect(html).toContain("$78.80 NZD");
    expect(html).toContain("Tax Basis");
    expect(html).toContain("Incl. GST");
    expect(html).toContain("Normalized Supplier Cost");
    expect(html).toContain("$68.52 / sheet");
    expect(html).toContain("Conversion");
    expect(html).toContain("1 sheet = 3.24 m²");
    expect(html).toContain("Comparable Material Cost");
    expect(html).toContain("$21.15 / m²");
    expect(html).not.toContain('data-testid="compact-summary-cost-gib-fyreline-2700">$24.32');
  });

  it("keeps compact and expanded comparable pricing synchronized across tax overrides", () => {
    let row = reviewRow({
      supplierUnit: "sheet",
      materialUnit: "m2",
      reviewedUnitCost: "78.8",
      reviewedTaxBasis: "inclusive",
      reviewedSourceTaxRate: 15,
      selectedPriceKey: "per-sheet",
      priceOptions: [{ priceKey: "per-sheet", label: "Per Sheet", amount: 78.8, currency: "NZD", evidence: "", dateLabel: "", taxBasis: "inclusive", sourceTaxRate: 15 }],
      confirmedUnitConversion: confirmedConversion(3.24),
    });
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
    });
    expect(renderToStaticMarkup(renderRow())).toContain('data-testid="compact-summary-cost-gib-10mm">$21.15');

    const select = findElement(renderRow(), (element) => element.props.id === "price-tax-basis-gib-10mm");
    (select?.props.onChange as ((event: { target: { value: string } }) => void))({ target: { value: "exclusive" } });
    const exclusiveHtml = renderToStaticMarkup(renderRow());
    expect(exclusiveHtml).toContain('data-testid="compact-summary-cost-gib-10mm">$24.32');
    expect(exclusiveHtml).toContain("$24.32 / m²");
  });

  it("falls back coherently to labelled source pricing when tax or unit comparison is unresolved", () => {
    const unknownTax = reviewRow({
      supplierUnit: "sheet",
      materialUnit: "m2",
      reviewedUnitCost: "78.8",
      reviewedTaxBasis: "unknown",
      confirmedUnitConversion: confirmedConversion(3.24),
    });
    expect(deriveMaterialImportReviewPricingPresentation(unknownTax, nzTaxPolicy)).toMatchObject({
      comparableMaterialCost: null,
      summaryAmount: 78.8,
      summaryUnit: "sheet",
      summaryStatus: "source",
      unitComparisonStatus: "converted",
    });
    const unknownHtml = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: unknownTax,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));
    expect(unknownHtml).toContain('data-testid="compact-summary-unit-gib-10mm">sheet</span>');
    expect(unknownHtml).toContain('data-testid="compact-summary-cost-gib-10mm">$78.80');
    expect(unknownHtml).toContain("Source price");
    expect(unknownHtml).toContain("Unavailable");

    const missingConversion = { ...unknownTax, reviewedTaxBasis: "inclusive" as const, confirmedUnitConversion: null };
    expect(deriveMaterialImportReviewPricingPresentation(missingConversion, nzTaxPolicy)).toMatchObject({
      comparableMaterialCost: null,
      summaryAmount: 78.8,
      summaryUnit: "sheet",
      summaryStatus: "source",
      unitComparisonStatus: "missing_conversion",
    });
    const missingConversionHtml = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: missingConversion,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));
    expect(missingConversionHtml).toContain("Unavailable");
    expect(missingConversionHtml).toContain("Pricing Summary");
    expect(missingConversionHtml).toContain("Unit conversion required.");
  });

  it("uses tax-normalized compact pricing for same-unit inclusive and exclusive prices", () => {
    const inclusive = reviewRow({
      supplierUnit: "m2",
      materialUnit: "m2",
      reviewedUnitCost: "11.5",
      reviewedTaxBasis: "inclusive",
      reviewedSourceTaxRate: 15,
      priceOptions: [{ priceKey: "source-1:fis", label: "Per m2", amount: 11.5, currency: "NZD", evidence: "", dateLabel: "", taxBasis: "inclusive", sourceTaxRate: 15 }],
    });
    expect(deriveMaterialImportReviewPricingPresentation(inclusive, nzTaxPolicy)).toMatchObject({
      summaryAmount: 10,
      summaryUnit: "m2",
      summaryStatus: "comparable",
      unitComparisonStatus: "same_unit",
    });
    const sameUnitHtml = renderToStaticMarkup(createElement(MaterialImportReviewRow, {
      row: inclusive,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));
    expect(sameUnitHtml).toContain("$10.00 / m²");
    expect(sameUnitHtml).not.toContain('>Conversion</span>');
    const exclusive = {
      ...inclusive,
      reviewedUnitCost: "24",
      reviewedTaxBasis: "exclusive" as const,
      priceOptions: [{ ...inclusive.priceOptions[0], amount: 24, taxBasis: "exclusive" as const }],
    };
    expect(deriveMaterialImportReviewPricingPresentation(exclusive, nzTaxPolicy)).toMatchObject({
      summaryAmount: 24,
      summaryUnit: "m2",
      summaryStatus: "comparable",
    });
  });

  it("recalculates compact pricing from manual amount edits without a provider call", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let row = reviewRow({
      supplierUnit: "m2",
      materialUnit: "m2",
      reviewedUnitCost: "11.5",
      reviewedTaxBasis: "inclusive",
      reviewedSourceTaxRate: 15,
      selectedPriceKey: "manual",
    });
    const renderRow = () => MaterialImportReviewRow({
      row,
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: nzTaxPolicy,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: (updates) => { row = { ...row, ...updates }; },
    });
    const amountInput = findElement(renderRow(), (element) => element.props.ariaLabel === "Manual price amount for GIB Standard Plasterboard 10mm");
    (amountInput?.props.onChange as ((value: string) => void))("23");
    const html = renderToStaticMarkup(renderRow());
    expect(html).toContain('data-testid="compact-summary-cost-gib-10mm">$20.00');
    expect(html).toContain("$20.00 / m²");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each([
    [{ status: "approved" }, "approved", "status-approved-light"],
    [{ status: "rejected" }, "rejected", "status-overdue-light"],
    [{ action: "skip" as const }, "skipped", "surface-muted"],
  ])("uses the expected Details treatment for terminal row state %#", (overrides, stateLabel, token) => {
    const html = renderToStaticMarkup(createElement(MaterialImportReviewPanel, {
      rows: [reviewRow(overrides)],
      selectedRowIds: [],
      materials: [],
      onSelectedRowIdsChange: () => undefined,
      onUpdateRow: () => undefined,
    }));

    expect(html).toContain(`Details — ${stateLabel} for GIB Standard Plasterboard 10mm`);
    expect(html).toContain(token);
    expect(html).not.toContain(`>${stateLabel}<`);
  });

  it("maps internal row state to user-facing status labels", () => {
    expect(materialImportRowStatusLabel(reviewRow({ action: "skip" }))).toBe("Skipped");
    expect(materialImportRowStatusLabel(reviewRow({ status: "approved" }))).toBe("Approved");
    expect(materialImportRowStatusLabel(reviewRow({ status: "rejected" }))).toBe("Rejected");
  });

  it("requires an explicit acknowledgement when an import remains tax-incomplete", () => {
    const html = renderToStaticMarkup(MaterialImportReviewRow({
      row: reviewRow({ reviewedTaxBasis: "exclusive" }),
      index: 0,
      selected: true,
      expanded: true,
      materials: [],
      taxPolicy: null,
      onSelectedChange: () => undefined,
      onExpandedChange: () => undefined,
      onUpdate: () => undefined,
    }));
    expect(html).toContain("Tax evidence needs review");
    expect(html).toContain("saved as non-comparable");
    expect(html).toContain("estimating-rate use remains unavailable");
  });
});
