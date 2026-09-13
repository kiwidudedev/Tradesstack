function normalizeSupplierIdentity(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || null;
}

export function selectSupplierProductImportMatch(
  candidates: Array<{ id: string; normalized_supplier_sku: string | null; normalized_supplier_description: string | null }>,
  input: { supplierSku: string | null; supplierDescription: string | null },
) {
  const sku = normalizeSupplierIdentity(input.supplierSku);
  if (sku) {
    const exactSku = candidates.filter((candidate) => candidate.normalized_supplier_sku === sku);
    if (exactSku.length === 1) return exactSku[0]!;
    if (exactSku.length > 1) return null;
  }
  const description = normalizeSupplierIdentity(input.supplierDescription);
  if (description) {
    const exactDescription = candidates.filter((candidate) => candidate.normalized_supplier_description === description);
    if (exactDescription.length === 1) return exactDescription[0]!;
  }
  return null;
}

export function normalizeSupplierProductIdentity(value: string | null | undefined) {
  return normalizeSupplierIdentity(value);
}
