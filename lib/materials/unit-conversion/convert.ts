import { interpretStructuredDocument } from "@/lib/document-intelligence/structured-interpreter";
import {
  MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION,
  MATERIAL_UNIT_CONVERSION_PROMPT_VERSION,
  type MaterialUnitConversionContext,
  type MaterialUnitConversionProposal,
  type MaterialUnitConversionProposalMetadata,
} from "@/lib/materials/unit-conversion/contract";
import { materialConversionUnitsEqual, normalizeMaterialConversionUnit } from "@/lib/materials/unit-conversion/normalize-unit";
import { buildMaterialUnitConversionInstructions } from "@/lib/materials/unit-conversion/prompt";
import { MATERIAL_UNIT_CONVERSION_JSON_SCHEMA } from "@/lib/materials/unit-conversion/schema";
import { validateMaterialUnitConversionProposal } from "@/lib/materials/unit-conversion/validate";

export async function proposeMaterialUnitConversion(
  context: MaterialUnitConversionContext,
  metadata: MaterialUnitConversionProposalMetadata,
): Promise<MaterialUnitConversionProposal> {
  const serverMetadata = {
    ...metadata,
    promptVersion: MATERIAL_UNIT_CONVERSION_PROMPT_VERSION,
    additionalInformation: context.additionalInformation,
  };
  if (materialConversionUnitsEqual(context.supplierUnit, context.requestedMaterialUnit)) {
    return {
      contractVersion: MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION,
      status: "no_conversion_needed",
      supplierUnit: normalizeMaterialConversionUnit(context.supplierUnit),
      requestedMaterialUnit: normalizeMaterialConversionUnit(context.requestedMaterialUnit),
      supplierQuantity: 1,
      materialQuantity: 1,
      convertedUnitCost: context.supplierUnitCost,
      currency: context.currency?.trim().toUpperCase() || null,
      basis: null,
      evidenceRefs: [],
      evidenceSummary: null,
      explanation: "Supplier and Material units are the same.",
      missingInformation: [],
      confidence: 1,
      ...serverMetadata,
    };
  }

  const instructions = buildMaterialUnitConversionInstructions(context);
  const sourceContent = JSON.stringify({ evidence: context.evidence });
  const response = await interpretStructuredDocument("anthropic", {
    ...instructions,
    schema: MATERIAL_UNIT_CONVERSION_JSON_SCHEMA,
    sourceParts: [{
      id: "material-import-row-context",
      kind: "email_body",
      fileName: "material-import-row-context.json",
      mimeType: "application/json",
      sizeBytes: Buffer.byteLength(sourceContent),
      pageCount: null,
      content: sourceContent,
      metadata: { source: "material_import_row" },
    }],
    contractVersion: MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION,
    promptVersion: MATERIAL_UNIT_CONVERSION_PROMPT_VERSION,
    maxOutputTokens: 1200,
    timeoutMs: 30_000,
    attemptNumber: 1,
  });

  return {
    ...validateMaterialUnitConversionProposal({ value: response.value, context }),
    ...serverMetadata,
  };
}
