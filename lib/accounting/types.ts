import type { Database } from "@/lib/supabase/types";
import type { FinancialRoutingReviewStatus, TradesstackFinancialRoutingCode } from "@/lib/tradesstack-financial-routing";

export type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];
export type OrganizationTradesstackAccountingMappingRow =
  Database["public"]["Tables"]["organization_tradesstack_accounting_mappings"]["Row"];

export type OrganizationAccountingResolutionStatus =
  | "resolved"
  | "needs_accounting_mapping"
  | "invalid_tradesstack_cost_code";

export interface AccountingCostItemResolutionInput {
  organizationId: string;
  provider: string;
  tradesstackCostCode: TradesstackFinancialRoutingCode | null;
  projectId?: string | null;
  costItemId?: string | null;
  title?: string | null;
  description?: string | null;
  routingConfidence?: number | null;
  routingSource?: string | null;
  reviewStatus?: FinancialRoutingReviewStatus | null;
  updatedAt?: string | null;
}

export interface ResolvedOrganizationAccountingCode {
  status: OrganizationAccountingResolutionStatus;
  organizationCostCodeId: string | null;
  accountingMappingId: string | null;
  code: string | null;
  name: string | null;
  externalCode: string | null;
  externalProvider: string | null;
  tradesstackCostCode: TradesstackFinancialRoutingCode | null;
  provider: string;
  projectId: string | null;
  reason:
    | "mapped_tradesstack_cost_code"
    | "missing_accounting_mapping"
    | "invalid_tradesstack_cost_code";
}

export interface AccountingResolutionPreviewRow extends AccountingCostItemResolutionInput {
  projectName: string | null;
  sourceDocumentKind: string | null;
  sourceDocumentId: string | null;
  sourceDocumentNumber: string | null;
  sourceDocumentTitle: string | null;
  resolution: ResolvedOrganizationAccountingCode;
}
