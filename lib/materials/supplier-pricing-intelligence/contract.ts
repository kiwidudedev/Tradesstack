import type {
  InterpretationField,
  InterpretationRunMetadata,
  InterpretationWarning,
  SourceEvidence,
} from "@/lib/document-intelligence/contracts";
import type { SourceTaxBasis } from "@/lib/tax/types";

export const MATERIAL_SUPPLIER_PRICING_CONTRACT_VERSION = "material_supplier_pricing_v1" as const;
export const MATERIAL_SUPPLIER_PRICING_PROMPT_VERSION = "material_supplier_pricing_prompt_v1";

export type MaterialSupplierPricingPrice = {
  priceKey: string;
  label: InterpretationField<string>;
  amount: InterpretationField<number>;
  currency: InterpretationField<string>;
  effectiveFrom: InterpretationField<string>;
  validTo: InterpretationField<string>;
  taxBasis: InterpretationField<SourceTaxBasis>;
  sourceTaxRate: InterpretationField<number>;
};

export type MaterialSupplierPricingRow = {
  rowKey: string;
  supplierDescription: InterpretationField<string>;
  supplierSku: InterpretationField<string>;
  proposedMaterialName: InterpretationField<string>;
  proposedMaterialDescription: InterpretationField<string>;
  supplierUnit: InterpretationField<string>;
  packQuantity: InterpretationField<number>;
  packUnit: InterpretationField<string>;
  prices: MaterialSupplierPricingPrice[];
  priceRecommendation: {
    priceKey: string | null;
    reason: string | null;
    confidence: number | null;
    evidence: SourceEvidence[];
  };
  warnings: InterpretationWarning[];
};

export type MaterialSupplierPricingV1 = {
  contractVersion: typeof MATERIAL_SUPPLIER_PRICING_CONTRACT_VERSION;
  document: {
    title: InterpretationField<string>;
    extractedSupplierName: InterpretationField<string>;
    currency: InterpretationField<string>;
    effectiveFrom: InterpretationField<string>;
    validTo: InterpretationField<string>;
  };
  rows: MaterialSupplierPricingRow[];
  warnings: InterpretationWarning[];
  extractionMeta: {
    method: "pdf" | "spreadsheet" | "csv" | "image" | "email";
    sourcePartCount: number;
    rowCount: number;
    partial: boolean;
  };
};

export type MaterialSupplierPricingInterpretation = {
  result: MaterialSupplierPricingV1;
  runs: InterpretationRunMetadata[];
  failedSourceParts: Array<{ sourcePartId: string; errorCode: string; retryable: boolean }>;
};
