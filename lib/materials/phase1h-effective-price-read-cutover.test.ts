import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  buildEffectiveSupplierProductPrices,
  deriveComparableMaterialPrice,
  findEffectivePriceIntervalConflicts,
  isMaterialPriceEffectiveAt,
  resolveComparableBestCost,
  resolveEffectiveConversionRows,
  resolveEffectivePriceRows,
  resolveSupplierPriceComparisonAt,
} from "@/lib/materials/effective-price";
import { buildMaterialStatus, buildMaterialSummary } from "@/lib/materials/normalization";
import type {
  OrganizationMaterialRow,
  OrganizationMaterialSupplierPriceRow,
  OrganizationMaterialSupplierProductRow,
  OrganizationMaterialSupplierProductUnitConversionRow,
} from "@/lib/materials/types";

const price = (params: {
  id: string;
  productId: string;
  supplierId?: string;
  unitCost: number;
  unit?: string;
  currency?: string;
  from: string;
  to?: string | null;
  predecessor?: string | null;
}) => ({
  id: params.id,
  organization_id: "org-1",
  material_id: "material-1",
  supplier_id: params.supplierId ?? "supplier-1",
  supplier_product_id: params.productId,
  unit: params.unit ?? "EA",
  unit_cost: params.unitCost,
  currency: params.currency ?? "NZD",
  effective_from: params.from,
  effective_to: params.to ?? null,
  supersedes_price_id: params.predecessor ?? null,
  is_current: false,
  is_preferred: false,
  source: "manual",
  supplier_description: null,
  supplier_sku: null,
  import_batch_id: null,
  import_row_id: null,
  idempotency_key: null,
  observation_metadata: null,
  created_by: null,
  created_at: params.from,
  updated_at: params.from,
}) as OrganizationMaterialSupplierPriceRow;

const product = (params: {
  id: string;
  supplierId?: string;
  preferred?: boolean;
  active?: boolean;
  unit?: string;
  packQuantity?: number | null;
  packUnit?: string | null;
}) => ({
  id: params.id,
  organization_id: "org-1",
  material_id: "material-1",
  supplier_id: params.supplierId ?? "supplier-1",
  supplier_unit: params.unit ?? "EA",
  is_preferred: params.preferred ?? false,
  is_active: params.active ?? true,
  archived_at: params.active === false ? "2026-01-01T00:00:00.000Z" : null,
  pack_quantity: params.packQuantity ?? null,
  pack_unit: params.packUnit ?? null,
  supplier_sku: null,
  supplier_description: null,
  normalized_supplier_sku: null,
  normalized_supplier_description: null,
  normalized_supplier_unit: (params.unit ?? "EA").toLowerCase(),
  identity_variant: "default",
  identity_status: "needs_review",
  archived_by: null,
  created_source: "manual",
  first_seen_at: "2026-01-01T00:00:00.000Z",
  last_seen_at: "2026-01-01T00:00:00.000Z",
  created_by: null,
  updated_by: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
}) as OrganizationMaterialSupplierProductRow;

const material = {
  id: "material-1",
  organization_id: "org-1",
  name: "Test material",
  is_active: true,
  archived_at: null,
  needs_review: false,
  organization_cost_code_id: null,
} as OrganizationMaterialRow;

describe("Material Library lifecycle status", () => {
  it("keeps active Materials active regardless of classification review state", () => {
    expect(buildMaterialStatus({ material: { is_active: true, archived_at: null } })).toBe("Active");
    expect(
      buildMaterialSummary({
        material: { ...material, needs_review: true },
        effectiveSupplierProducts: [],
        supplierNameById: new Map(),
        costCodeLabelById: new Map(),
      }).status
    ).toBe("Active");
  });

  it("keeps a Material active when its preferred Supplier Product has no effective price", () => {
    const preferred = product({ id: "preferred-without-price", preferred: true });
    expect(
      buildMaterialSummary({
        material,
        effectiveSupplierProducts: [{ supplierProduct: preferred, effectivePrice: null }],
        supplierNameById: new Map(),
        costCodeLabelById: new Map(),
      }).status
    ).toBe("Active");
  });

  it("keeps the approved GIB-style state active without making its priced Supplier Product preferred", () => {
    const importedProduct = product({ id: "gib-product", preferred: false });
    const importedPrice = price({
      id: "gib-price",
      productId: importedProduct.id,
      unitCost: 8.3,
      unit: "m2",
      from: "2026-08-14T00:00:00Z",
    });
    const summary = buildMaterialSummary({
      material: { ...material, name: "GIB Standard Plasterboard 10mm", needs_review: false },
      effectiveSupplierProducts: [
        { supplierProduct: importedProduct, effectivePrice: importedPrice },
      ],
      supplierNameById: new Map(),
      costCodeLabelById: new Map(),
    });

    expect(summary.status).toBe("Active");
    expect(summary.preferredSupplierProduct).toBeNull();
    expect(summary.preferredSupplierName).toBeNull();
  });

  it("archives either an inactive Material or one with an archive timestamp", () => {
    expect(buildMaterialStatus({ material: { is_active: false, archived_at: null } })).toBe("Archived");
    expect(
      buildMaterialStatus({
        material: { is_active: true, archived_at: "2026-08-15T00:00:00Z" },
      })
    ).toBe("Archived");
  });
});

describe("Phase 1H canonical effective-price resolution", () => {
  const chain = [
    price({
      id: "price-a",
      productId: "product-1",
      unitCost: 10,
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
    }),
    price({
      id: "price-b",
      productId: "product-1",
      unitCost: 12,
      from: "2026-09-01T00:00:00.000Z",
      predecessor: "price-a",
    }),
  ];

  it("uses half-open intervals for current, historical, and exact-boundary evaluation", () => {
    expect(resolveEffectivePriceRows({ prices: chain, evaluationTime: "2026-08-15T00:00:00Z" }).get("product-1")?.id).toBe("price-a");
    expect(resolveEffectivePriceRows({ prices: chain, evaluationTime: "2026-09-01T00:00:00Z" }).get("product-1")?.id).toBe("price-b");
    expect(resolveEffectivePriceRows({ prices: chain, evaluationTime: "2026-07-31T23:59:59Z" }).size).toBe(0);
    expect(isMaterialPriceEffectiveAt(chain[0], "2026-09-01T00:00:00Z")).toBe(false);
  });

  it("does not activate a scheduled price early and activates it at its boundary", () => {
    expect(resolveEffectivePriceRows({ prices: chain, evaluationTime: "2026-08-31T23:59:59Z" }).get("product-1")?.id).toBe("price-a");
    expect(resolveEffectivePriceRows({ prices: chain, evaluationTime: "2026-09-01T00:00:00Z" }).get("product-1")?.id).toBe("price-b");
  });

  it("raises instead of selecting when two rows are effective for one product", () => {
    const overlapping = [
      chain[0],
      price({ id: "overlap", productId: "product-1", unitCost: 11, from: "2026-08-15T00:00:00Z", to: "2026-09-15T00:00:00Z" }),
    ];
    expect(findEffectivePriceIntervalConflicts(overlapping)).toHaveLength(1);
    expect(() => resolveEffectivePriceRows({ prices: overlapping, evaluationTime: "2026-08-20T00:00:00Z" })).toThrow("effective_price_interval_conflict");
  });

  it("retains a product with an explicit null effective price", () => {
    const offerings = buildEffectiveSupplierProductPrices({
      supplierProducts: [product({ id: "product-1" })],
      prices: chain,
      resolutions: [],
      activeOnly: true,
    });
    expect(offerings).toHaveLength(1);
    expect(offerings[0].effectivePrice).toBeNull();
  });
});

describe("Phase 1H Material summary semantics", () => {
  it("does not switch away from a preferred product that has no effective price", () => {
    const preferred = product({ id: "preferred", supplierId: "supplier-a", preferred: true });
    const alternative = product({ id: "alternative", supplierId: "supplier-b" });
    const alternativePrice = price({ id: "alternative-price", productId: alternative.id, supplierId: "supplier-b", unitCost: 5, from: "2026-01-01T00:00:00Z" });
    const summary = buildMaterialSummary({
      material,
      effectiveSupplierProducts: [
        { supplierProduct: preferred, effectivePrice: null },
        { supplierProduct: alternative, effectivePrice: alternativePrice },
      ],
      supplierNameById: new Map([["supplier-a", "Preferred Supplier"], ["supplier-b", "Alternative Supplier"]]),
      costCodeLabelById: new Map(),
    });
    expect(summary.preferredSupplierProduct?.id).toBe("preferred");
    expect(summary.preferredPrice).toBeNull();
    expect(summary.preferredSupplierName).toBe("Preferred Supplier");
    expect(summary.otherSupplierCount).toBe(1);
  });

  it("counts distinct effective suppliers, not products or historical rows", () => {
    const first = product({ id: "product-1", supplierId: "supplier-a", preferred: true });
    const second = product({ id: "product-2", supplierId: "supplier-a" });
    const inactive = product({ id: "product-3", supplierId: "supplier-b", active: false });
    const prices = [
      price({ id: "old", productId: first.id, supplierId: "supplier-a", unitCost: 9, from: "2025-01-01T00:00:00Z", to: "2026-01-01T00:00:00Z" }),
      price({ id: "current-1", productId: first.id, supplierId: "supplier-a", unitCost: 10, from: "2026-01-01T00:00:00Z" }),
      price({ id: "current-2", productId: second.id, supplierId: "supplier-a", unitCost: 11, from: "2026-01-01T00:00:00Z" }),
      price({ id: "inactive-price", productId: inactive.id, supplierId: "supplier-b", unitCost: 8, from: "2026-01-01T00:00:00Z" }),
    ];
    const resolved = resolveEffectivePriceRows({ prices, evaluationTime: "2026-08-01T00:00:00Z" });
    const offerings = buildEffectiveSupplierProductPrices({
      supplierProducts: [first, second, inactive],
      prices,
      resolutions: [...resolved].map(([supplierProductId, row]) => ({ supplierProductId, priceId: row.id })),
      activeOnly: true,
    });
    const summary = buildMaterialSummary({ material, effectiveSupplierProducts: offerings, supplierNameById: new Map(), costCodeLabelById: new Map() });
    expect(summary.supplierProductCount).toBe(2);
    expect(summary.supplierCount).toBe(1);
    expect(summary.otherSupplierCount).toBe(0);
    expect(summary.currentPrices.map((row) => row.id)).not.toContain("old");
  });

  it("returns a minimum only for directly comparable effective prices", () => {
    const first = product({ id: "product-1", supplierId: "supplier-a", unit: "EA" });
    const second = product({ id: "product-2", supplierId: "supplier-b", unit: "EA" });
    const a = price({ id: "a", productId: first.id, supplierId: "supplier-a", unitCost: 12, from: "2026-01-01T00:00:00Z" });
    const b = price({ id: "b", productId: second.id, supplierId: "supplier-b", unitCost: 10, from: "2026-01-01T00:00:00Z" });
    expect(resolveComparableBestCost([{ supplierProduct: first, effectivePrice: a }, { supplierProduct: second, effectivePrice: b }])).toMatchObject({ status: "comparable", price: { id: "b" } });
    expect(resolveComparableBestCost([{ supplierProduct: first, effectivePrice: a }, { supplierProduct: second, effectivePrice: { ...b, currency: "USD" } }])).toEqual({ status: "non_comparable", price: null });
    expect(resolveComparableBestCost([{ supplierProduct: first, effectivePrice: a }, { supplierProduct: second, effectivePrice: { ...b, unit: "LM" } }])).toEqual({ status: "non_comparable", price: null });
  });
});

describe("Supplier Product unit conversion effective-price semantics", () => {
  const conversion = (params: { id: string; productId: string; from: string; to?: string | null; materialQuantity: number; materialUnit?: string }) => ({
    id: params.id,
    organization_id: "org-1",
    supplier_product_id: params.productId,
    supplier_unit: "each",
    normalized_supplier_unit: "each",
    material_unit: params.materialUnit ?? "lm",
    normalized_material_unit: params.materialUnit ?? "lm",
    supplier_quantity: 1,
    material_quantity: params.materialQuantity,
    source: "user_confirmed_ai",
    contract_version: "material_unit_conversion_v1",
    proposal_metadata: {},
    source_import_row_id: null,
    confirmed_by: "user-1",
    confirmed_at: params.from,
    effective_from: params.from,
    effective_to: params.to ?? null,
    supersedes_conversion_id: null,
    created_at: params.from,
  }) as OrganizationMaterialSupplierProductUnitConversionRow;

  it("derives Radiata comparable cost while preserving the 48.75/each source observation", () => {
    const timber = product({ id: "radiata", supplierId: "mitre-10", unit: "each" });
    const sourcePrice = price({ id: "radiata-price", productId: timber.id, supplierId: "mitre-10", unit: "each", unitCost: 48.75, from: "2026-08-15T00:00:00Z" });
    const offerings = buildEffectiveSupplierProductPrices({
      supplierProducts: [timber],
      prices: [sourcePrice],
      resolutions: [{ supplierProductId: timber.id, priceId: sourcePrice.id }],
      conversions: [conversion({ id: "conversion-1", productId: timber.id, from: "2026-08-15T00:00:00Z", materialQuantity: 6 })],
      materialUnitById: new Map([["material-1", "lm"]]),
      evaluationTime: "2026-08-16T00:00:00Z",
    });
    expect(offerings[0].effectivePrice).toMatchObject({ unit: "each", unit_cost: 48.75 });
    expect(offerings[0]).toMatchObject({ comparableUnitCost: 8.125, comparisonUnit: "lm", comparisonStatus: "comparable" });
  });

  it("previews GIB and Radiata source-price updates with the confirmed ratio", () => {
    expect(deriveComparableMaterialPrice({
      sourceUnitCost: 49,
      sourceUnit: "each",
      materialUnit: "m2",
      effectiveConversion: conversion({
        id: "gib-conversion",
        productId: "gib",
        from: "2026-08-15T00:00:00Z",
        materialQuantity: 2.88,
        materialUnit: "m2",
      }),
    })).toMatchObject({
      comparableUnitCost: 17.01388888888889,
      comparisonUnit: "m2",
      comparisonStatus: "comparable",
    });
    expect(deriveComparableMaterialPrice({
      sourceUnitCost: 51,
      sourceUnit: "each",
      materialUnit: "lm",
      effectiveConversion: conversion({
        id: "radiata-conversion",
        productId: "radiata",
        from: "2026-08-15T00:00:00Z",
        materialQuantity: 6,
      }),
    })).toMatchObject({ comparableUnitCost: 8.5, comparisonUnit: "lm" });
  });

  it("supports same-unit pricing and leaves different units non-comparable without a conversion", () => {
    expect(deriveComparableMaterialPrice({
      sourceUnitCost: 11,
      sourceUnit: "M2",
      materialUnit: "m2",
    })).toMatchObject({
      effectiveConversion: null,
      comparableUnitCost: 11,
      comparisonUnit: "m2",
      comparisonStatus: "comparable",
    });
    expect(deriveComparableMaterialPrice({
      sourceUnitCost: 49,
      sourceUnit: "each",
      materialUnit: "m2",
    })).toMatchObject({
      effectiveConversion: null,
      comparableUnitCost: null,
      comparisonUnit: "m2",
      comparisonStatus: "non_comparable",
    });
  });

  it("uses the conversion effective at the historical evaluation time", () => {
    const history = [
      conversion({ id: "six-metre", productId: "radiata", from: "2026-01-01T00:00:00Z", to: "2026-07-01T00:00:00Z", materialQuantity: 6 }),
      conversion({ id: "four-eight-metre", productId: "radiata", from: "2026-07-01T00:00:00Z", materialQuantity: 4.8 }),
    ];
    expect(resolveEffectiveConversionRows({ conversions: history, evaluationTime: "2026-06-01T00:00:00Z" }).get("radiata|lm")?.id).toBe("six-metre");
    expect(resolveEffectiveConversionRows({ conversions: history, evaluationTime: "2026-08-01T00:00:00Z" }).get("radiata|lm")?.id).toBe("four-eight-metre");
  });

  it("derives each historical price with the conversion effective when that price began", () => {
    const oldPrice = price({ id: "old-price", productId: "radiata", unit: "each", unitCost: 48.75, from: "2026-06-01T00:00:00Z" });
    const newPrice = price({ id: "new-price", productId: "radiata", unit: "each", unitCost: 51, from: "2026-08-01T00:00:00Z" });
    const history = [
      conversion({ id: "six-metre", productId: "radiata", from: "2026-01-01T00:00:00Z", to: "2026-07-01T00:00:00Z", materialQuantity: 6 }),
      conversion({ id: "four-eight-metre", productId: "radiata", from: "2026-07-01T00:00:00Z", materialQuantity: 4.8 }),
    ];
    expect(resolveSupplierPriceComparisonAt({
      price: oldPrice,
      materialUnit: "lm",
      conversions: history,
    })).toMatchObject({ effectiveConversion: { id: "six-metre" }, comparableUnitCost: 8.125 });
    expect(resolveSupplierPriceComparisonAt({
      price: newPrice,
      materialUnit: "lm",
      conversions: history,
    })).toMatchObject({ effectiveConversion: { id: "four-eight-metre" }, comparableUnitCost: 10.625 });
  });

  it("compares converted and direct Material-unit offerings without changing preference", () => {
    const convertedProduct = product({ id: "converted", supplierId: "mitre-10", unit: "each", preferred: true });
    const directProduct = product({ id: "direct", supplierId: "carters", unit: "lm" });
    const convertedPrice = price({ id: "converted-price", productId: convertedProduct.id, supplierId: "mitre-10", unit: "each", unitCost: 48.75, from: "2026-01-01T00:00:00Z" });
    const directPrice = price({ id: "direct-price", productId: directProduct.id, supplierId: "carters", unit: "lm", unitCost: 8, from: "2026-01-01T00:00:00Z" });
    const offerings = buildEffectiveSupplierProductPrices({
      supplierProducts: [convertedProduct, directProduct],
      prices: [convertedPrice, directPrice],
      resolutions: [
        { supplierProductId: convertedProduct.id, priceId: convertedPrice.id },
        { supplierProductId: directProduct.id, priceId: directPrice.id },
      ],
      conversions: [conversion({ id: "conversion-1", productId: convertedProduct.id, from: "2026-01-01T00:00:00Z", materialQuantity: 6 })],
      materialUnitById: new Map([["material-1", "lm"]]),
      evaluationTime: "2026-08-01T00:00:00Z",
    });
    expect(resolveComparableBestCost(offerings)).toMatchObject({ status: "comparable", price: { id: "direct-price" }, comparableUnitCost: 8 });
    expect(convertedProduct.is_preferred).toBe(true);
    expect(directProduct.is_preferred).toBe(false);
  });
});

describe("Phase 1H repository contracts", () => {
  it("defines one database resolver with half-open semantics and conflict failure", async () => {
    const sql = await readFile("supabase/migrations/20260809160000_add_effective_supplier_product_price_resolver.sql", "utf8");
    expect(sql).toContain("price.effective_from <= p_evaluation_time");
    expect(sql).toContain("price.effective_to > p_evaluation_time");
    expect(sql).toContain("effective_price_interval_conflict");
    expect(sql).not.toContain("price.is_current");
  });

  it("keeps full history while removing authoritative price flags from Material Library reads", async () => {
    const [queries, workspace, service, universalLearning] = await Promise.all([
      readFile("lib/materials/queries.ts", "utf8"),
      readFile("app/app/(workspace)/company/materials/CompanyMaterialsWorkspace.tsx", "utf8"),
      readFile("lib/materials/service.ts", "utf8"),
      readFile("lib/universal-learning/builders.ts", "utf8"),
    ]);
    expect(queries).toContain('.from("organization_material_supplier_prices")');
    expect(queries).toContain("resolveEffectivePriceIds");
    expect(queries).not.toContain('if (!price.is_current)');
    expect(workspace).not.toMatch(/\.filter\(\(price\) => price\.is_current\)/);
    expect(service).not.toContain('.eq("is_current", true)');
    const materialSummaryBuilder = universalLearning.slice(
      universalLearning.indexOf("function buildOrganizationMaterialSummary"),
      universalLearning.indexOf("function buildOrganizationMaterialReadOnlyRoutingContext")
    );
    expect(materialSummaryBuilder).not.toContain("price.is_current");
    expect(materialSummaryBuilder).not.toContain("price.is_preferred");
    expect(materialSummaryBuilder).toContain("supplierProductsById");
  });
});
