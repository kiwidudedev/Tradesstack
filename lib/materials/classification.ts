import { resolveOrganizationAccountingCode } from "@/lib/accounting/organization-cost-code-resolver";
import type {
  AccountingCostItemResolutionInput,
  OrganizationCostCodeRow,
  OrganizationTradesstackAccountingMappingRow,
  ResolvedOrganizationAccountingCode,
} from "@/lib/accounting/types";
import type { FinancialRoutingResult } from "@/lib/tradesstack-financial-routing";
import type { Json } from "@/lib/supabase/types";

type JsonObject = Record<string, Json | null>;

export type MaterialClassificationSource = "rules" | "user_confirmed" | "ai" | "imported";

export type MaterialClassificationResult = {
  workType: string | null;
  costType: "MAT";
  costCode: string | null;
  confidence: number | null;
  needsReview: boolean;
  classificationSource: MaterialClassificationSource;
  originalClassification: JsonObject;
  finalClassification: JsonObject;
  reasoningSummary: string | null;
  financialRouting: FinancialRoutingResult;
};

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function classifyMaterial(params: {
  name: string;
  description?: string | null;
  source?: MaterialClassificationSource;
}): MaterialClassificationResult {
  const description = [params.name.trim(), params.description?.trim() || ""].filter(Boolean).join(" ");
  const source = params.source ?? "rules";
  const reasoningSummary = "Construction classification retired; factual material lineage retained.";
  const financialRouting = {
    tradesstackCostCode: null,
    tradesstackCostCodeLabel: null,
    confidence: null,
    source: null,
    reviewStatus: null,
    reviewReason: null,
    evidence: { retirement: "construction_classification" },
  } as unknown as FinancialRoutingResult;

  const originalClassification: JsonObject = {
    method: source,
    classifierVersion: "materials-factual-v3",
    description,
    workType: null,
    costType: "MAT",
    costCode: null,
    confidence: null,
    needsReview: false,
    reasoningSummary,
    tradesstackCostCode: financialRouting.tradesstackCostCode,
    tradesstackCostCodeLabel: financialRouting.tradesstackCostCodeLabel,
    financialRoutingSource: financialRouting.source,
    evidence: financialRouting.evidence as unknown as Json,
  };

  return {
    workType: null,
    costType: "MAT",
    costCode: null,
    confidence: null,
    needsReview: false,
    classificationSource: source,
    originalClassification,
    finalClassification: originalClassification,
    reasoningSummary,
    financialRouting,
  };
}

export function buildMaterialAccountingResolutionInput(params: {
  organizationId: string;
  provider: string;
  materialId: string;
  name: string;
  description?: string | null;
  classification: Pick<MaterialClassificationResult, "confidence" | "classificationSource" | "financialRouting">;
}): AccountingCostItemResolutionInput {
  return {
    organizationId: params.organizationId,
    provider: params.provider,
    tradesstackCostCode: params.classification.financialRouting.tradesstackCostCode,
    projectId: null,
    costItemId: params.materialId,
    title: params.name,
    description: params.description ?? params.name,
    routingConfidence: params.classification.confidence,
    routingSource: params.classification.financialRouting.source,
    reviewStatus: params.classification.financialRouting.reviewStatus,
    updatedAt: null,
  };
}

export function resolveMaterialOrganizationCostCode(params: {
  organizationId: string;
  provider: string;
  materialId: string;
  name: string;
  description?: string | null;
  classification: Pick<MaterialClassificationResult, "confidence" | "classificationSource" | "financialRouting">;
  costCodes: OrganizationCostCodeRow[];
  mappings: OrganizationTradesstackAccountingMappingRow[];
}): ResolvedOrganizationAccountingCode {
  return resolveOrganizationAccountingCode({
    costCodes: params.costCodes,
    mappings: params.mappings,
    input: buildMaterialAccountingResolutionInput({
      organizationId: params.organizationId,
      provider: params.provider,
      materialId: params.materialId,
      name: params.name,
      description: params.description,
      classification: params.classification,
    }),
  });
}

export function buildConfirmedMaterialClassification(params: {
  currentFinalClassification?: JsonObject | null;
  currentOriginalClassification?: JsonObject | null;
  workType: string | null;
  costType: string | null;
  costCode: string | null;
  confidence: number | null;
  confirmedByUserId: string;
  confirmedAt: string;
  confirmedFromSource?: string | null;
  organizationCostCodeId?: string | null;
}) {
  return {
    ...(params.currentFinalClassification ?? {}),
    method: "user_confirmed",
    confirmedFromSource: params.confirmedFromSource ?? toNullableString(params.currentOriginalClassification?.method) ?? "rules",
    workType: params.workType,
    costType: params.costType,
    costCode: params.costCode,
    confidence: params.confidence,
    needsReview: false,
    organizationCostCodeId: params.organizationCostCodeId ?? null,
    confirmedByUserId: params.confirmedByUserId,
    confirmedAt: params.confirmedAt,
  } satisfies JsonObject;
}
