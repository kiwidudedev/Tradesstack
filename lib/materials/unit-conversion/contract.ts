export const MATERIAL_UNIT_CONVERSION_LEGACY_CONTRACT_VERSION = "material_unit_conversion_v1" as const;
export const MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION = "material_unit_conversion_v2" as const;
export const MATERIAL_UNIT_CONVERSION_PROMPT_VERSION = "material_unit_conversion_prompt_v2" as const;

export type MaterialUnitConversionContractVersion =
  | typeof MATERIAL_UNIT_CONVERSION_LEGACY_CONTRACT_VERSION
  | typeof MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION;

export type MaterialUnitConversionStatus =
  | "convertible"
  | "needs_information"
  | "not_convertible"
  | "no_conversion_needed";

export type MaterialUnitConversionEvidenceSource =
  | "supplier_source"
  | "selected_material_context"
  | "user_supplied_context";

export type MaterialUnitConversionBasis =
  | MaterialUnitConversionEvidenceSource
  | "combined_context";

export type MaterialUnitConversionEvidence = {
  id: string;
  source: MaterialUnitConversionEvidenceSource;
  text: string;
};

export type MaterialUnitConversionAdditionalInformation = {
  value: number;
  unit: string;
  label?: string | null;
};

export type MaterialUnitConversionProviderProposal = {
  contractVersion: typeof MATERIAL_UNIT_CONVERSION_CONTRACT_VERSION;
  status: Exclude<MaterialUnitConversionStatus, "no_conversion_needed">;
  supplierUnit: string;
  requestedMaterialUnit: string;
  supplierQuantity: number | null;
  materialQuantity: number | null;
  convertedUnitCost: number | null;
  currency: string | null;
  basis: MaterialUnitConversionBasis | null;
  evidenceRefs: string[];
  evidenceSummary: string | null;
  explanation: string | null;
  missingInformation: string[];
  confidence: number | null;
};

export type MaterialUnitConversionProposal = Omit<MaterialUnitConversionProviderProposal, "status"> & {
  status: MaterialUnitConversionStatus;
  contextHash: string;
  selectedMaterialId: string | null;
  selectedMaterialUpdatedAt: string | null;
  promptVersion: typeof MATERIAL_UNIT_CONVERSION_PROMPT_VERSION;
  additionalInformation: MaterialUnitConversionAdditionalInformation[] | null;
};

export type ConfirmedMaterialUnitConversion = {
  supplierQuantity: number;
  supplierUnit: string;
  materialQuantity: number;
  materialUnit: string;
  convertedUnitCost: number;
  currency: string | null;
  contractVersion: MaterialUnitConversionContractVersion;
  source: "user_confirmed_ai" | "user_confirmed_manual";
  explanation: string | null;
  confidence: number | null;
  selectedMaterialId?: string | null;
  selectedMaterialUpdatedAt?: string | null;
  contextHash?: string | null;
  basis?: MaterialUnitConversionBasis | null;
  evidenceRefs?: string[];
  evidenceSummary?: string | null;
  promptVersion?: string | null;
  additionalInformation?: MaterialUnitConversionAdditionalInformation[] | null;
};

export type MaterialUnitConversionContext = {
  supplierDescription: string | null;
  supplierSku: string | null;
  supplierUnit: string;
  supplierUnitCost: number;
  currency: string | null;
  packQuantity: number | null;
  packUnit: string | null;
  proposedMaterialName: string | null;
  requestedMaterialUnit: string;
  selectedPriceKey: string | null;
  selectedPriceLabel: string | null;
  evidence: MaterialUnitConversionEvidence[];
  additionalInformation: MaterialUnitConversionAdditionalInformation[] | null;
};

export type MaterialUnitConversionProposalMetadata = {
  contextHash: string;
  selectedMaterialId: string | null;
  selectedMaterialUpdatedAt: string | null;
};
