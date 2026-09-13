import type {
  MaterialUnitConversionAdditionalInformation,
  MaterialUnitConversionContext,
  MaterialUnitConversionEvidence,
} from "@/lib/materials/unit-conversion/contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldValue(value: unknown) {
  return isRecord(value) && "value" in value ? value.value : value;
}

function nullableText(value: unknown) {
  const unwrapped = fieldValue(value);
  return typeof unwrapped === "string" && unwrapped.trim() ? unwrapped.trim() : null;
}

function nullableNumber(value: unknown) {
  const unwrapped = fieldValue(value);
  return typeof unwrapped === "number" && Number.isFinite(unwrapped) ? unwrapped : null;
}

function evidenceExcerpts(value: unknown, result: string[] = []): string[] {
  if (result.length >= 8) return result;
  if (Array.isArray(value)) {
    for (const entry of value) evidenceExcerpts(entry, result);
    return result;
  }
  if (!isRecord(value)) return result;
  const excerpt = nullableText(value.excerpt);
  if (excerpt && !result.includes(excerpt)) result.push(excerpt);
  for (const entry of Object.values(value)) evidenceExcerpts(entry, result);
  return result;
}

function addEvidence(
  evidence: MaterialUnitConversionEvidence[],
  id: string,
  text: string | null,
  source: MaterialUnitConversionEvidence["source"] = "supplier_source",
) {
  if (!text?.trim() || evidence.some((entry) => entry.id === id)) return;
  evidence.push({ id, source, text: text.trim().slice(0, 1000) });
}

export type MaterialUnitConversionImportRow = {
  extracted_name: string | null;
  extracted_description: string | null;
  extracted_unit: string | null;
  extracted_unit_cost: number | null;
  extracted_currency: string | null;
  reviewed_name: string | null;
  reviewed_supplier_description: string | null;
  reviewed_supplier_sku: string | null;
  supplier_description: string | null;
  supplier_sku: string | null;
  source_payload: unknown;
};

export function materialUnitConversionContextFromImportRow(
  row: MaterialUnitConversionImportRow,
  requestedMaterialUnit: string,
  additionalInformation: MaterialUnitConversionAdditionalInformation[] | null,
  selectedPriceKey?: string | null,
): MaterialUnitConversionContext {
  const payload = isRecord(row.source_payload) ? row.source_payload : {};
  const canonicalRow = isRecord(payload.canonicalRow) ? payload.canonicalRow : {};
  const pack = isRecord(payload.pack) ? payload.pack : {};
  const prices = Array.isArray(payload.priceOptions) ? payload.priceOptions.filter(isRecord) : [];
  const recommendedPriceKey = nullableText(payload.recommendedPriceKey);
  const requestedPriceKey = selectedPriceKey?.trim() || recommendedPriceKey;
  const requestedPrice = prices.find((price) => price.priceKey === requestedPriceKey) ?? null;
  if (selectedPriceKey?.trim() && !requestedPrice) {
    throw new Error("The selected source price is no longer available.");
  }
  const selectedPrice = requestedPrice ?? prices[0] ?? null;
  const selectedAmount = selectedPrice ? nullableNumber(selectedPrice.amount) : null;
  const supplierUnit = nullableText(canonicalRow.supplierUnit) ?? row.extracted_unit?.trim() ?? "";
  const supplierUnitCost = selectedAmount ?? row.extracted_unit_cost;
  if (!supplierUnit) throw new Error("The import row has no supplier unit to convert.");
  if (supplierUnitCost === null || !Number.isFinite(supplierUnitCost) || supplierUnitCost < 0) {
    throw new Error("The import row has no valid supplier price to convert.");
  }

  const supplierDescription = nullableText(canonicalRow.supplierDescription)
    ?? row.reviewed_supplier_description
    ?? row.supplier_description
    ?? row.extracted_description;
  const supplierSku = nullableText(canonicalRow.supplierSku)
    ?? row.reviewed_supplier_sku
    ?? row.supplier_sku;
  const packQuantity = nullableNumber(pack.quantity) ?? nullableNumber(canonicalRow.packQuantity);
  const packUnit = nullableText(pack.unit) ?? nullableText(canonicalRow.packUnit);
  const selectedPriceLabel = selectedPrice ? nullableText(selectedPrice.label) : null;
  const evidence: MaterialUnitConversionEvidence[] = [];
  addEvidence(evidence, "supplier.description", supplierDescription);
  addEvidence(evidence, "supplier.sku", supplierSku);
  addEvidence(
    evidence,
    "supplier.pack",
    packQuantity !== null ? `${packQuantity} ${packUnit ?? supplierUnit}` : packUnit,
  );
  addEvidence(evidence, "supplier.price_label", selectedPriceLabel);
  evidenceExcerpts(payload).forEach((excerpt, index) => {
    addEvidence(evidence, `supplier.evidence.${index + 1}`, excerpt);
  });
  additionalInformation?.forEach((fact, index) => addEvidence(
    evidence,
    `user.additional_information.${index + 1}`,
    [fact.label, `${fact.value} ${fact.unit}`].filter(Boolean).join(": "),
    "user_supplied_context",
  ));

  return {
    supplierDescription,
    supplierSku,
    supplierUnit,
    supplierUnitCost,
    currency: selectedPrice ? nullableText(selectedPrice.currency) : row.extracted_currency,
    packQuantity,
    packUnit,
    proposedMaterialName: row.reviewed_name ?? nullableText(canonicalRow.proposedMaterialName) ?? row.extracted_name,
    requestedMaterialUnit,
    selectedPriceKey: selectedPrice ? nullableText(selectedPrice.priceKey) : null,
    selectedPriceLabel,
    evidence,
    additionalInformation,
  };
}
