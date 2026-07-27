import {
  retrieveOrganizationMemoryForAi,
  type AiMemoryItem,
} from "@/lib/ai-lifecycle-server";
import {
  getUniversalLearningPrimaryReasoningDomain,
  rankUniversalLearningMemoryPackItems,
  type UniversalLearningPrimaryReasoningDomain,
} from "@/lib/universal-learning/domain-intelligence";
import type { UniversalLearningMemoryPackItem } from "@/lib/universal-learning/types";
import type { UniversalLearningContainerType } from "@/lib/universal-learning/types";

export type UniversalLearningMemoryPackQuery = {
  organizationId: string;
  currentContainerType: UniversalLearningContainerType;
  primaryReasoningDomain?: UniversalLearningPrimaryReasoningDomain;
  projectId?: string | null;
  opportunityId?: string | null;
  trade?: string | null;
  system?: string | null;
  product?: string | null;
  supplier?: string | null;
  projectType?: string | null;
  activity?: string | null;
  limit?: number;
};

function toMemoryPackItem(item: AiMemoryItem): UniversalLearningMemoryPackItem {
  return {
    id: item.id,
    memoryCategory: item.memoryCategory,
    memoryType: item.memoryType,
    title: item.title,
    summary: item.summary,
    confidenceScore: item.confidenceScore,
    derivedFromTotalCount: item.derivedFromTotalCount,
    memoryValue: item.memoryValue,
    evidenceSummary: item.evidenceSummary,
    updatedAt: item.updatedAt,
  };
}

export async function buildUniversalLearningMemoryPack(
  params: UniversalLearningMemoryPackQuery,
): Promise<UniversalLearningMemoryPackItem[]> {
  const items = await retrieveOrganizationMemoryForAi({
    organizationId: params.organizationId,
    projectId: params.projectId,
    opportunityId: params.opportunityId,
    trade: params.trade,
    system: params.system,
    product: params.product,
    supplier: params.supplier,
    projectType: params.projectType,
    activity: params.activity,
    memoryCategories: ["construction_decision"],
    minimumConfidence: 0.35,
    limit: params.limit ?? 20,
  });

  const mappedItems = items.map(toMemoryPackItem);
  return rankUniversalLearningMemoryPackItems(mappedItems, {
    currentContainerType: params.currentContainerType,
    primaryReasoningDomain:
      params.primaryReasoningDomain
      ?? getUniversalLearningPrimaryReasoningDomain(params.currentContainerType),
    projectId: params.projectId,
    opportunityId: params.opportunityId,
    supplier: params.supplier,
    limit: params.limit ?? 20,
  });
}
