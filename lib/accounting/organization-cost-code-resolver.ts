import type {
  AccountingCostItemResolutionInput,
  OrganizationCostCodeMappingRuleRow,
  OrganizationCostCodeRow,
  OrganizationCostCodeRuleType,
  ResolvedOrganizationAccountingCode,
} from "@/lib/accounting/types";

const RULE_TYPE_PRIORITY: Record<OrganizationCostCodeRuleType, number> = {
  direct_cost_item_code: 1,
  work_type_cost_type: 2,
  work_type: 3,
  cost_type: 4,
  default: 5,
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compareRulePriority(left: OrganizationCostCodeMappingRuleRow, right: OrganizationCostCodeMappingRuleRow) {
  const leftTypePriority = RULE_TYPE_PRIORITY[left.rule_type as OrganizationCostCodeRuleType] ?? Number.MAX_SAFE_INTEGER;
  const rightTypePriority = RULE_TYPE_PRIORITY[right.rule_type as OrganizationCostCodeRuleType] ?? Number.MAX_SAFE_INTEGER;

  if (leftTypePriority !== rightTypePriority) {
    return leftTypePriority - rightTypePriority;
  }

  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  if (left.created_at !== right.created_at) {
    return left.created_at.localeCompare(right.created_at);
  }

  return left.id.localeCompare(right.id);
}

function ruleMatchesInput(
  rule: OrganizationCostCodeMappingRuleRow,
  input: AccountingCostItemResolutionInput
): boolean {
  const intelligenceCostCode = normalizeText(input.intelligenceCostCode);
  const workType = normalizeText(input.workType);
  const costType = normalizeText(input.costType);

  switch (rule.rule_type as OrganizationCostCodeRuleType) {
    case "direct_cost_item_code":
      return normalizeText(rule.intelligence_cost_code) === intelligenceCostCode;
    case "work_type_cost_type":
      return normalizeText(rule.work_type) === workType && normalizeText(rule.cost_type) === costType;
    case "work_type":
      return normalizeText(rule.work_type) === workType;
    case "cost_type":
      return normalizeText(rule.cost_type) === costType;
    case "default":
      return true;
    default:
      return false;
  }
}

function buildCodeLookup(costCodes: OrganizationCostCodeRow[]) {
  return new Map(costCodes.filter((row) => row.is_active).map((row) => [row.id, row]));
}

export function resolveOrganizationAccountingCode(params: {
  costCodes: OrganizationCostCodeRow[];
  mappingRules: OrganizationCostCodeMappingRuleRow[];
  input: AccountingCostItemResolutionInput;
}): ResolvedOrganizationAccountingCode {
  const { input } = params;
  const normalizedCostCode = normalizeText(input.intelligenceCostCode);
  const normalizedWorkType = normalizeText(input.workType);
  const normalizedCostType = normalizeText(input.costType);
  const activeCostCodesById = buildCodeLookup(params.costCodes);
  const activeRules = params.mappingRules
    .filter((rule) => rule.is_active)
    .filter((rule) => activeCostCodesById.has(rule.target_cost_code_id))
    .sort(compareRulePriority);

  if (input.classificationNeedsReview || !normalizedCostCode || !normalizedWorkType || !normalizedCostType) {
    return {
      status: "classification_review_required",
      organizationCostCodeId: null,
      code: null,
      name: null,
      matchedRuleId: null,
      matchedRuleType: null,
      needsAccountingReview: false,
      classificationState: "classification_review_required",
      reason: "missing_classification",
    };
  }

  const matchingRules = activeRules.filter((rule) => ruleMatchesInput(rule, input));
  if (matchingRules.length === 0) {
    return {
      status: "unresolved",
      organizationCostCodeId: null,
      code: null,
      name: null,
      matchedRuleId: null,
      matchedRuleType: null,
      needsAccountingReview: true,
      classificationState: "finalized",
      reason: "no_active_mapping_rule",
    };
  }

  const topRule = matchingRules[0];
  const topTypePriority = RULE_TYPE_PRIORITY[topRule.rule_type as OrganizationCostCodeRuleType] ?? Number.MAX_SAFE_INTEGER;
  const samePriorityMatches = matchingRules.filter((rule) => {
    const typePriority = RULE_TYPE_PRIORITY[rule.rule_type as OrganizationCostCodeRuleType] ?? Number.MAX_SAFE_INTEGER;
    return typePriority === topTypePriority && rule.priority === topRule.priority;
  });
  const samePriorityTargetIds = new Set(samePriorityMatches.map((rule) => rule.target_cost_code_id));

  if (samePriorityTargetIds.size > 1) {
    return {
      status: "unresolved",
      organizationCostCodeId: null,
      code: null,
      name: null,
      matchedRuleId: null,
      matchedRuleType: null,
      needsAccountingReview: true,
      classificationState: "finalized",
      reason: "ambiguous_rule_match",
    };
  }

  const matchedCostCode = activeCostCodesById.get(topRule.target_cost_code_id) ?? null;
  if (!matchedCostCode) {
    return {
      status: "unresolved",
      organizationCostCodeId: null,
      code: null,
      name: null,
      matchedRuleId: null,
      matchedRuleType: null,
      needsAccountingReview: true,
      classificationState: "finalized",
      reason: "no_active_mapping_rule",
    };
  }

  const matchedRuleType = topRule.rule_type as OrganizationCostCodeRuleType;

  return {
    status: matchedRuleType === "default" ? "fallback" : "resolved",
    organizationCostCodeId: matchedCostCode.id,
    code: matchedCostCode.code,
    name: matchedCostCode.name,
    matchedRuleId: topRule.id,
    matchedRuleType,
    needsAccountingReview: false,
    classificationState: "finalized",
    reason:
      matchedRuleType === "direct_cost_item_code"
        ? "matched_direct_cost_item_code"
        : matchedRuleType === "work_type_cost_type"
          ? "matched_work_type_cost_type"
          : matchedRuleType === "work_type"
            ? "matched_work_type"
            : matchedRuleType === "cost_type"
              ? "matched_cost_type"
              : "matched_default",
  };
}

export function resolveOrganizationAccountingCodesForInputs(params: {
  costCodes: OrganizationCostCodeRow[];
  mappingRules: OrganizationCostCodeMappingRuleRow[];
  inputs: AccountingCostItemResolutionInput[];
}) {
  return params.inputs.map((input) => ({
    ...input,
    resolution: resolveOrganizationAccountingCode({
      costCodes: params.costCodes,
      mappingRules: params.mappingRules,
      input,
    }),
  }));
}
