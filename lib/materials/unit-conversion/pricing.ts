export function calculateComparableMaterialUnitCost(input: {
  supplierUnitCost: number;
  supplierQuantity: number;
  materialQuantity: number;
}) {
  const supplierUnitCost = Number(input.supplierUnitCost);
  const supplierQuantity = Number(input.supplierQuantity);
  const materialQuantity = Number(input.materialQuantity);
  if (!Number.isFinite(supplierUnitCost) || supplierUnitCost < 0) {
    throw new Error("Supplier unit cost must be a finite non-negative number.");
  }
  if (!Number.isFinite(supplierQuantity) || supplierQuantity <= 0) {
    throw new Error("Supplier quantity must be a finite positive number.");
  }
  if (!Number.isFinite(materialQuantity) || materialQuantity <= 0) {
    throw new Error("Material quantity must be a finite positive number.");
  }
  return supplierUnitCost * supplierQuantity / materialQuantity;
}

export function conversionCostsAgree(left: number, right: number) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const tolerance = Math.max(0.000001, Math.abs(left) * 0.0001);
  return Math.abs(left - right) <= tolerance;
}
