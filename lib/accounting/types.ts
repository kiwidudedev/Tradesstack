import type { Database } from "@/lib/supabase/types";

export type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];
export type OrganizationCostCodeMappingRuleRow = Database["public"]["Tables"]["organization_cost_code_mapping_rules"]["Row"];

export type OrganizationCostCodeRuleType =
  | "direct_cost_item_code"
  | "work_type_cost_type"
  | "work_type"
  | "cost_type"
  | "default";

export type CostItemClassificationState =
  | "finalized"
  | "classification_review_required";

export type OrganizationAccountingResolutionStatus =
  | "resolved"
  | "fallback"
  | "unresolved"
  | "classification_review_required";

export interface AccountingCostItemResolutionInput {
  costItemId: string;
  projectId: string;
  projectName: string | null;
  sourceDocumentKind: string;
  title: string;
  description: string;
  intelligenceCostCode: string | null;
  workType: string | null;
  costType: string | null;
  classificationConfidence: number | null;
  classificationNeedsReview: boolean;
  classificationSource: string | null;
  updatedAt: string | null;
}

export interface ResolvedOrganizationAccountingCode {
  status: OrganizationAccountingResolutionStatus;
  organizationCostCodeId: string | null;
  code: string | null;
  name: string | null;
  matchedRuleId: string | null;
  matchedRuleType: OrganizationCostCodeRuleType | null;
  needsAccountingReview: boolean;
  classificationState: CostItemClassificationState;
  reason:
    | "matched_direct_cost_item_code"
    | "matched_work_type_cost_type"
    | "matched_work_type"
    | "matched_cost_type"
    | "matched_default"
    | "ambiguous_rule_match"
    | "missing_classification"
    | "no_active_mapping_rule";
}

export interface AccountingResolutionPreviewRow extends AccountingCostItemResolutionInput {
  resolution: ResolvedOrganizationAccountingCode;
}
