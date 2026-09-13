import { createHash } from "node:crypto";
import type { OrganizationMaterialRow } from "@/lib/materials/types";
import type { MaterialUnitConversionContext } from "@/lib/materials/unit-conversion/contract";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function createMaterialUnitConversionContextHash(input: {
  organizationId: string;
  batchId: string;
  rowId: string;
  context: MaterialUnitConversionContext;
  selectedMaterial: OrganizationMaterialRow | null;
}) {
  const material = input.selectedMaterial;
  const payload = canonicalize({
    organizationId: input.organizationId,
    batchId: input.batchId,
    rowId: input.rowId,
    supplierDescription: input.context.supplierDescription,
    supplierSku: input.context.supplierSku,
    supplierUnit: input.context.supplierUnit,
    supplierUnitCost: input.context.supplierUnitCost,
    currency: input.context.currency,
    packQuantity: input.context.packQuantity,
    packUnit: input.context.packUnit,
    proposedMaterialName: input.context.proposedMaterialName,
    requestedMaterialUnit: input.context.requestedMaterialUnit,
    selectedPriceKey: input.context.selectedPriceKey,
    selectedPriceLabel: input.context.selectedPriceLabel,
    evidence: input.context.evidence,
    additionalInformation: input.context.additionalInformation,
    selectedMaterial: material ? {
      id: material.id,
      updatedAt: material.updated_at,
      name: material.name,
      description: material.description,
      defaultUnit: material.default_unit,
      category: material.category,
    } : null,
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
