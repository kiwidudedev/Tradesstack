import type { OrganizationMaterialRow } from "@/lib/materials/types";
import type { ConfirmedMaterialUnitConversion } from "@/lib/materials/unit-conversion/contract";
import { MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION } from "@/lib/materials/unit-conversion/contract";
import { createMaterialUnitConversionContextHash } from "@/lib/materials/unit-conversion/context-hash";
import { addSelectedMaterialEvidence } from "@/lib/materials/unit-conversion/evidence";
import {
  materialUnitConversionContextFromImportRow,
  type MaterialUnitConversionImportRow,
} from "@/lib/materials/unit-conversion/import-row-context";
import { MaterialUnitConversionError } from "@/lib/materials/unit-conversion/errors";

export function assertCurrentMaterialUnitConversionContext(input: {
  organizationId: string;
  batchId: string;
  rowId: string;
  sourceRow: MaterialUnitConversionImportRow;
  selectedMaterial: OrganizationMaterialRow | null;
  requestedMaterialUnit: string;
  selectedPriceKey: string | null;
  confirmed: ConfirmedMaterialUnitConversion;
}) {
  if (input.confirmed.contractVersion !== MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION) return;
  const material = input.selectedMaterial;
  if (!material || input.confirmed.selectedMaterialId !== material.id) {
    throw new MaterialUnitConversionError("invalid_context", "The selected Material has changed. Review the conversion again.");
  }
  if (!material.is_active || material.archived_at) {
    throw new MaterialUnitConversionError("invalid_context", "The selected Material is no longer active.");
  }
  if (input.confirmed.selectedMaterialUpdatedAt !== material.updated_at) {
    throw new MaterialUnitConversionError("invalid_context", "The selected Material was updated after the conversion was proposed.");
  }
  let context;
  try {
    context = materialUnitConversionContextFromImportRow(
      input.sourceRow,
      input.requestedMaterialUnit,
      input.confirmed.additionalInformation ?? null,
      input.selectedPriceKey,
    );
  } catch (error) {
    throw new MaterialUnitConversionError(
      "invalid_context",
      error instanceof Error ? error.message : "The source pricing context has changed.",
    );
  }
  context = addSelectedMaterialEvidence(context, material);
  const currentHash = createMaterialUnitConversionContextHash({
    organizationId: input.organizationId,
    batchId: input.batchId,
    rowId: input.rowId,
    context,
    selectedMaterial: material,
  });
  if (currentHash !== input.confirmed.contextHash) {
    throw new MaterialUnitConversionError(
      "invalid_context",
      "The Material or supplier pricing context has changed. Review the conversion again.",
    );
  }
}
