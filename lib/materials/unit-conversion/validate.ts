import {
  MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION,
  type MaterialUnitConversionBasis,
  type MaterialUnitConversionContext,
  type MaterialUnitConversionProviderProposal,
} from "@/lib/materials/unit-conversion/contract";
import { MaterialUnitConversionError } from "@/lib/materials/unit-conversion/errors";
import { normalizeMaterialConversionUnit } from "@/lib/materials/unit-conversion/normalize-unit";
import { physicalEvidenceSupportsConversion } from "@/lib/materials/unit-conversion/physical-evidence";
import {
  calculateComparableMaterialUnitCost,
  conversionCostsAgree,
} from "@/lib/materials/unit-conversion/pricing";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion result must be an object.");
  }
  return value as Record<string, unknown>;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function expectedBasis(sources: Set<string>): MaterialUnitConversionBasis | null {
  if (sources.size === 0) return null;
  if (sources.size > 1) return "combined_context";
  const [source] = sources;
  return source === "supplier_source"
    || source === "selected_material_context"
    || source === "user_supplied_context"
    ? source
    : null;
}

export function validateMaterialUnitConversionProposal(input: {
  value: unknown;
  context: MaterialUnitConversionContext;
}): MaterialUnitConversionProviderProposal {
  const value = record(input.value);
  if (value.contractVersion !== MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION) {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unsupported Material unit conversion contract version.");
  }
  const status = value.status;
  if (status !== "convertible" && status !== "needs_information" && status !== "not_convertible") {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion result has an invalid status.");
  }
  const supplierUnit = nullableText(value.supplierUnit);
  const requestedMaterialUnit = nullableText(value.requestedMaterialUnit);
  if (!supplierUnit || normalizeMaterialConversionUnit(supplierUnit) !== normalizeMaterialConversionUnit(input.context.supplierUnit)) {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion result changed the supplier unit.");
  }
  if (!requestedMaterialUnit || normalizeMaterialConversionUnit(requestedMaterialUnit) !== normalizeMaterialConversionUnit(input.context.requestedMaterialUnit)) {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion result changed the requested Material unit.");
  }

  const missingInformation = Array.isArray(value.missingInformation)
    ? value.missingInformation.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim())
    : [];
  const confidence = nullableNumber(value.confidence);
  if (confidence !== null && (confidence < 0 || confidence > 1)) {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion confidence must be between zero and one.");
  }
  const evidenceRefs = Array.isArray(value.evidenceRefs)
    ? [...new Set(value.evidenceRefs.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim()))]
    : [];
  const evidenceById = new Map(input.context.evidence.map((entry) => [entry.id, entry]));
  const referencedEvidence = evidenceRefs.map((reference) => evidenceById.get(reference));
  if (referencedEvidence.some((entry) => !entry)) {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion cited evidence that was not supplied.");
  }
  const providerBasis = nullableText(value.basis) as MaterialUnitConversionBasis | null;
  const derivedBasis = expectedBasis(new Set(referencedEvidence.flatMap((entry) => entry ? [entry.source] : [])));
  if (
    providerBasis !== null
    && providerBasis !== "supplier_source"
    && providerBasis !== "selected_material_context"
    && providerBasis !== "user_supplied_context"
    && providerBasis !== "combined_context"
  ) {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion evidence basis was invalid.");
  }
  const basis = derivedBasis;
  const providerCurrency = nullableText(value.currency)?.toUpperCase() ?? null;
  const sourceCurrency = input.context.currency?.trim().toUpperCase() || null;
  if (providerCurrency && sourceCurrency && providerCurrency !== sourceCurrency) {
    throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion currency did not match the source price.");
  }
  const base = {
    contractVersion: MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION,
    status,
    supplierUnit: normalizeMaterialConversionUnit(input.context.supplierUnit),
    requestedMaterialUnit: normalizeMaterialConversionUnit(input.context.requestedMaterialUnit),
    currency: sourceCurrency,
    basis,
    evidenceRefs,
    evidenceSummary: nullableText(value.evidenceSummary),
    explanation: nullableText(value.explanation),
    missingInformation,
    confidence,
  };

  if (status === "convertible") {
    const supplierQuantity = nullableNumber(value.supplierQuantity);
    const materialQuantity = nullableNumber(value.materialQuantity);
    const providerCost = nullableNumber(value.convertedUnitCost);
    if (supplierQuantity === null || supplierQuantity <= 0 || materialQuantity === null || materialQuantity <= 0) {
      throw new MaterialUnitConversionError("unsafe_conversion", "A convertible result requires positive quantities.");
    }
    if (!basis || evidenceRefs.length === 0 || !base.evidenceSummary) {
      throw new MaterialUnitConversionError("unsafe_conversion", "A convertible result requires cited evidence and a concise basis.");
    }
    if (!physicalEvidenceSupportsConversion({
      requestedMaterialUnit: input.context.requestedMaterialUnit,
      supplierQuantity,
      materialQuantity,
      evidenceTexts: referencedEvidence.flatMap((entry) => entry ? [entry.text] : []),
    })) {
      throw new MaterialUnitConversionError("unsafe_conversion", "The proposed physical conversion is not supported by the cited evidence.");
    }
    const convertedUnitCost = calculateComparableMaterialUnitCost({
      supplierUnitCost: input.context.supplierUnitCost,
      supplierQuantity,
      materialQuantity,
    });
    const providerCostDifference = providerCost === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(convertedUnitCost - providerCost);
    if (
      providerCost === null
      || (!conversionCostsAgree(convertedUnitCost, providerCost) && providerCostDifference > 0.005)
    ) {
      throw new MaterialUnitConversionError("unsafe_conversion", "Unit conversion arithmetic did not match the source price.");
    }
    return { ...base, status, supplierQuantity, materialQuantity, convertedUnitCost };
  }

  if (status === "needs_information" && missingInformation.length === 0) {
    throw new MaterialUnitConversionError("unsafe_conversion", "A needs-information result must explain what is missing.");
  }
  if (value.supplierQuantity !== null || value.materialQuantity !== null || value.convertedUnitCost !== null) {
    throw new MaterialUnitConversionError("unsafe_conversion", "An incomplete conversion cannot include authoritative quantities or cost.");
  }
  return {
    ...base,
    status,
    supplierQuantity: null,
    materialQuantity: null,
    convertedUnitCost: null,
  };
}
