import { describe, expect, it } from "vitest";
import { deriveComparableMaterialPrice, policyFromPriceSnapshot, resolveComparableBestCost } from "@/lib/materials/effective-price";
import type { EffectiveSupplierProductPrice, OrganizationMaterialSupplierPriceRow, OrganizationMaterialSupplierProductRow, OrganizationMaterialSupplierProductUnitConversionRow } from "@/lib/materials/types";
import type { OrganizationTaxPolicy } from "@/lib/tax/types";

const policy = (rate = 15, comparisonBasis: "exclusive" | "inclusive" = "exclusive", supported = true): OrganizationTaxPolicy => ({
  id: `policy-${rate}`, organizationId: "org", jurisdictionCode: supported ? "TEST-VAT" : "TEST-SALES",
  taxName: "VAT", registrationStatus: "registered", comparisonBasis, standardRate: rate,
  supportsInclusiveExclusive: supported, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, policySource: "test",
});
const conversion = (materialQuantity: number, materialUnit = "m2") => ({
  supplier_unit: "sheet", material_unit: materialUnit, supplier_quantity: 1, material_quantity: materialQuantity,
}) as OrganizationMaterialSupplierProductUnitConversionRow;

describe("canonical Material comparable-cost pipeline", () => {
  it("normalizes tax before applying a generic unit relationship", () => {
    const result = deriveComparableMaterialPrice({
      sourceUnitCost: 87.56, sourceUnit: "sheet", materialUnit: "m2",
      sourceTaxBasis: "inclusive", taxPolicy: policy(15), effectiveConversion: conversion(3.6),
    });
    expect(result.normalizedSupplierUnitCost).toBeCloseTo(76.13913, 5);
    expect(result.comparableUnitCost).toBeCloseTo(21.149758, 5);
    expect(result.comparisonStatus).toBe("comparable");
  });

  it("normalizes same-unit tax independently of unit conversion", () => {
    const result = deriveComparableMaterialPrice({ sourceUnitCost: 11.5, sourceUnit: "m2", materialUnit: "m2", sourceTaxBasis: "inclusive", taxPolicy: policy(15) });
    expect(result.effectiveConversion).toBeNull();
    expect(result.comparableUnitCost).toBe(10);
  });

  it("keeps exclusive unit conversion arithmetic unchanged", () => {
    const result = deriveComparableMaterialPrice({ sourceUnitCost: 46, sourceUnit: "sheet", materialUnit: "m2", sourceTaxBasis: "exclusive", taxPolicy: policy(15), effectiveConversion: conversion(2.88) });
    expect(result.comparableUnitCost).toBeCloseTo(15.972222, 5);
  });

  it("separates unknown tax, unsupported tax, and missing unit conversion", () => {
    expect(deriveComparableMaterialPrice({ sourceUnitCost: 10, sourceUnit: "m2", materialUnit: "m2", sourceTaxBasis: "unknown", taxPolicy: policy() }).comparisonStatus).toBe("unknown_tax_basis");
    expect(deriveComparableMaterialPrice({ sourceUnitCost: 10, sourceUnit: "m2", materialUnit: "m2", sourceTaxBasis: "inclusive", taxPolicy: policy(10, "exclusive", false) }).comparisonStatus).toBe("unsupported_tax_jurisdiction");
    expect(deriveComparableMaterialPrice({ sourceUnitCost: 10, sourceUnit: "sheet", materialUnit: "m2", sourceTaxBasis: "exclusive", taxPolicy: policy() })).toMatchObject({ comparisonStatus: "non_comparable", comparisonReason: "non_comparable_unit" });
  });

  it("chooses only the lowest normalized comparable offering", () => {
    const product = (id: string) => ({ id, supplier_unit: "m2", pack_quantity: null, pack_unit: null }) as unknown as OrganizationMaterialSupplierProductRow;
    const price = (id: string, cost: number) => ({ id, unit_cost: cost, unit: "m2", currency: "NZD" }) as unknown as OrganizationMaterialSupplierPriceRow;
    const offerings: EffectiveSupplierProductPrice[] = [
      { supplierProduct: product("a"), effectivePrice: price("inclusive", 115), comparableUnitCost: 100, comparisonUnit: "m2", comparisonTaxBasis: "exclusive", comparisonStatus: "comparable" },
      { supplierProduct: product("b"), effectivePrice: price("exclusive", 99), comparableUnitCost: 99, comparisonUnit: "m2", comparisonTaxBasis: "exclusive", comparisonStatus: "comparable" },
      { supplierProduct: product("c"), effectivePrice: price("unknown", 1), comparableUnitCost: null, comparisonUnit: "m2", comparisonTaxBasis: null, comparisonStatus: "unknown_tax_basis" },
    ];
    expect(resolveComparableBestCost(offerings)).toMatchObject({ status: "comparable", price: { id: "exclusive" }, comparableUnitCost: 99 });
  });

  it("reconstructs historical tax from each immutable price snapshot", () => {
    const historicalPrice = (rate: number) => ({
      organization_id: "org", effective_from: "2026-01-01T00:00:00Z",
      tax_jurisdiction_code: "TEST-VAT", comparison_tax_basis: "exclusive",
      comparison_tax_rate: rate, tax_policy_snapshot: {
        taxName: "VAT", supportsInclusiveExclusive: true, standardRate: rate,
        effectiveFrom: "2026-01-01T00:00:00Z", policySource: "test-version",
      },
    }) as unknown as OrganizationMaterialSupplierPriceRow;
    const older = deriveComparableMaterialPrice({ sourceUnitCost: 110, sourceUnit: "m2", materialUnit: "m2", sourceTaxBasis: "inclusive", taxPolicy: policyFromPriceSnapshot(historicalPrice(10)) });
    const newer = deriveComparableMaterialPrice({ sourceUnitCost: 120, sourceUnit: "m2", materialUnit: "m2", sourceTaxBasis: "inclusive", taxPolicy: policyFromPriceSnapshot(historicalPrice(20)) });
    expect(older.comparableUnitCost).toBe(100);
    expect(newer.comparableUnitCost).toBe(100);
  });
});
