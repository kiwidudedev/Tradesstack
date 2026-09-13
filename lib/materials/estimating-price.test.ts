import { describe, expect, it } from "vitest";
import { deriveMaterialEstimatingPrice, parseMaterialEstimatingPrice } from "@/lib/materials/estimating-price";
import type { OrganizationMaterialSupplierPriceRow, OrganizationMaterialSupplierProductUnitConversionRow } from "@/lib/materials/types";

function price(overrides: Partial<OrganizationMaterialSupplierPriceRow> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111", organization_id: "org-1", material_id: "material-1",
    supplier_id: "supplier-1", supplier_product_id: "product-1", unit_cost: 46, unit: "each", currency: "NZD",
    source_tax_basis: "exclusive", source_tax_rate: 15, tax_jurisdiction_code: "NZ",
    comparison_tax_basis: "exclusive", comparison_tax_rate: 15,
    tax_policy_snapshot: { supportsInclusiveExclusive: true, taxName: "GST", registrationStatus: "registered" },
    effective_from: "2026-08-16T00:00:00.000Z", effective_to: null,
    ...overrides,
  } as OrganizationMaterialSupplierPriceRow;
}

function conversion(overrides: Partial<OrganizationMaterialSupplierProductUnitConversionRow> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222", organization_id: "org-1", supplier_product_id: "product-1",
    supplier_quantity: 1, supplier_unit: "each", material_quantity: 2.88, material_unit: "m2",
    source: "user_confirmed_ai", contract_version: "material_unit_conversion_v2",
    effective_from: "2026-08-16T00:00:00.000Z", effective_to: null,
    confirmed_at: "2026-08-16T00:00:00.000Z",
    ...overrides,
  } as OrganizationMaterialSupplierProductUnitConversionRow;
}

describe("canonical Material estimating-price contract", () => {
  it("derives Carters source evidence into a full-precision m2 estimating rate", () => {
    const result = deriveMaterialEstimatingPrice({
      price: price(), materialUnit: "m2", organizationCurrency: "NZD",
      evaluatedAt: "2026-08-16T03:00:00.000Z", conversion: conversion(),
    });
    expect(result.sourcePricing).toMatchObject({ unitCost: 46, unit: "each" });
    expect(result.estimatingPricing).toMatchObject({ status: "available", derivationKind: "confirmed_conversion", unit: "m2" });
    expect(result.estimatingPricing.unitCost).toBeCloseTo(15.972222222222223, 12);
    expect(parseMaterialEstimatingPrice(result)).toEqual(result);
  });

  it("tax-normalizes Bunnings before applying its confirmed sheet conversion", () => {
    const result = deriveMaterialEstimatingPrice({
      price: price({ unit_cost: 63.1, unit: "sheet", source_tax_basis: "inclusive" }),
      materialUnit: "m2", organizationCurrency: "NZD", evaluatedAt: "2026-08-16T03:00:00.000Z",
      conversion: conversion({ supplier_unit: "sheet" }),
    });
    expect(result.estimatingPricing.normalizedSourceUnitCost).toBe(54.869565);
    expect(result.estimatingPricing.unitCost).toBeCloseTo(19.051932291666667, 12);
  });

  it("still derives a direct match through tax normalization", () => {
    const result = deriveMaterialEstimatingPrice({
      price: price({ unit_cost: 11.5, unit: "m2", source_tax_basis: "inclusive" }),
      materialUnit: "m2", organizationCurrency: "NZD", evaluatedAt: "2026-08-16T03:00:00.000Z",
    });
    expect(result.estimatingPricing).toMatchObject({ status: "available", derivationKind: "direct_unit_match", unitCost: 10 });
    expect(result.conversion).toBeNull();
  });

  it("keeps a same-tax-basis direct unit match unchanged", () => {
    const result = deriveMaterialEstimatingPrice({
      price: price({ unit_cost: 12.82, unit: "m2" }), materialUnit: "m2",
      organizationCurrency: "NZD", evaluatedAt: "2026-08-16T03:00:00.000Z",
    });
    expect(result.estimatingPricing).toMatchObject({
      status: "available", derivationKind: "direct_unit_match", normalizedSourceUnitCost: 12.82, unitCost: 12.82,
    });
  });

  it("blocks missing conversion, missing tax evidence, and incompatible currency", () => {
    const common = { materialUnit: "m2", organizationCurrency: "NZD", evaluatedAt: "2026-08-16T03:00:00.000Z" };
    expect(deriveMaterialEstimatingPrice({ ...common, price: price() }).estimatingPricing.status).toBe("conversion_required");
    expect(deriveMaterialEstimatingPrice({ ...common, price: price({ comparison_tax_basis: null }) }).estimatingPricing.status).toBe("missing_tax_policy");
    expect(deriveMaterialEstimatingPrice({ ...common, price: price({ currency: "AUD" }), conversion: conversion() }).estimatingPricing.status).toBe("currency_incompatible");
  });

  it.each([
    ["box", "each", 20, 2.3],
    ["roll", "lm", 50, 0.92],
  ])("supports a confirmed direct %s to %s product conversion", (supplierUnit, materialUnit, materialQuantity, expected) => {
    const result = deriveMaterialEstimatingPrice({
      price: price({ unit: supplierUnit }), materialUnit, organizationCurrency: "NZD",
      evaluatedAt: "2026-08-16T03:00:00.000Z",
      conversion: conversion({ supplier_unit: supplierUnit, material_unit: materialUnit, material_quantity: materialQuantity }),
    });
    expect(result.estimatingPricing).toMatchObject({ status: "available", unitCost: expected });
  });

  it.each([
    ["expired", { effective_to: "2026-08-16T02:00:00.000Z" }],
    ["unconfirmed proposal", { source: "ai_proposed" }],
    ["wrong Supplier Product", { supplier_product_id: "product-2" }],
    ["another organization", { organization_id: "org-2" }],
    ["wrong Material unit", { material_unit: "each" }],
  ])("rejects an %s conversion", (_label, conversionChange) => {
    const result = deriveMaterialEstimatingPrice({
      price: price(), materialUnit: "m2", organizationCurrency: "NZD",
      evaluatedAt: "2026-08-16T03:00:00.000Z", conversion: conversion(conversionChange),
    });
    expect(result.estimatingPricing.status).toBe("conversion_required");
    expect(result.conversion).toBeNull();
  });

  it("keeps product-specific sheet dimensions independent and never chains conversions", () => {
    const common = { materialUnit: "m2", organizationCurrency: "NZD", evaluatedAt: "2026-08-16T03:00:00.000Z" };
    const first = deriveMaterialEstimatingPrice({ ...common, price: price(), conversion: conversion({ material_quantity: 2.88 }) });
    const second = deriveMaterialEstimatingPrice({
      ...common,
      price: price({ supplier_product_id: "product-2" }),
      conversion: conversion({ supplier_product_id: "product-2", material_quantity: 3.6 }),
    });
    expect(first.estimatingPricing.unitCost).toBeCloseTo(15.972222222222223, 12);
    expect(second.estimatingPricing.unitCost).toBeCloseTo(12.777777777777779, 12);
    const chainedAttempt = deriveMaterialEstimatingPrice({
      ...common,
      price: price({ unit: "box" }),
      conversion: conversion({ supplier_unit: "box", material_unit: "sheet", material_quantity: 10 }),
    });
    expect(chainedAttempt.estimatingPricing.status).toBe("conversion_required");
  });
});
