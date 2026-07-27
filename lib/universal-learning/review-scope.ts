import type { UniversalLearningContainerType, UniversalLearningRunSelection } from "@/lib/universal-learning/types";

export function buildUniversalLearningScopeKey(params?: {
  projectId?: string | null;
  opportunityId?: string | null;
  supplierId?: string | null;
}) {
  if (params?.projectId) {
    return `project:${params.projectId}`;
  }
  if (params?.opportunityId) {
    return `opportunity:${params.opportunityId}`;
  }
  if (params?.supplierId) {
    return `supplier:${params.supplierId}`;
  }
  return "organization";
}

export function buildMonthlyReviewSelection(input: {
  organizationId: string;
  containerType: UniversalLearningContainerType;
  reviewMonth: string;
}): UniversalLearningRunSelection {
  return {
    organizationId: input.organizationId,
    containerType: input.containerType,
    reviewMonth: input.reviewMonth,
    runType: "monthly",
    scopeKey: "organization",
  };
}
