import {
  assertTradesstackFinancialRoutingCode,
  coerceTradesstackFinancialRoutingCode,
  isTradesstackFinancialRoutingCode,
} from "@/lib/tradesstack-financial-routing";
import type {
  AccountingCostItemResolutionInput,
  OrganizationCostCodeRow,
  OrganizationTradesstackAccountingMappingRow,
  ResolvedOrganizationAccountingCode,
} from "@/lib/accounting/types";

function buildCodeLookup(costCodes: OrganizationCostCodeRow[]) {
  return new Map(costCodes.filter((row) => row.is_active).map((row) => [row.id, row]));
}

function sortMappings(left: OrganizationTradesstackAccountingMappingRow, right: OrganizationTradesstackAccountingMappingRow) {
  if (left.project_id === right.project_id) {
    if (left.updated_at !== right.updated_at) {
      return right.updated_at.localeCompare(left.updated_at);
    }
    return left.id.localeCompare(right.id);
  }

  if (left.project_id && !right.project_id) {
    return -1;
  }

  if (!left.project_id && right.project_id) {
    return 1;
  }

  return left.id.localeCompare(right.id);
}

export function resolveOrganizationAccountingCode(params: {
  costCodes: OrganizationCostCodeRow[];
  mappings: OrganizationTradesstackAccountingMappingRow[];
  input: AccountingCostItemResolutionInput;
}): ResolvedOrganizationAccountingCode {
  const { costCodes, mappings, input } = params;
  const codeLookup = buildCodeLookup(costCodes);

  if (!input.tradesstackCostCode || !isTradesstackFinancialRoutingCode(input.tradesstackCostCode)) {
    return {
      status: "invalid_tradesstack_cost_code",
      organizationCostCodeId: null,
      accountingMappingId: null,
      code: null,
      name: null,
      externalCode: null,
      externalProvider: null,
      tradesstackCostCode: null,
      provider: input.provider,
      projectId: input.projectId ?? null,
      reason: "invalid_tradesstack_cost_code",
    };
  }

  const tradesstackCostCode = assertTradesstackFinancialRoutingCode(input.tradesstackCostCode);
  const matchingMappings = mappings
    .filter((row) => row.is_active)
    .filter((row) => row.provider === input.provider)
    .filter((row) => coerceTradesstackFinancialRoutingCode(row.tradesstack_cost_code) === tradesstackCostCode)
    .filter((row) => row.project_id === (input.projectId ?? null) || row.project_id === null)
    .sort(sortMappings);

  const mapping = matchingMappings[0] ?? null;
  if (!mapping) {
    return {
      status: "needs_accounting_mapping",
      organizationCostCodeId: null,
      accountingMappingId: null,
      code: null,
      name: null,
      externalCode: null,
      externalProvider: null,
      tradesstackCostCode,
      provider: input.provider,
      projectId: input.projectId ?? null,
      reason: "missing_accounting_mapping",
    };
  }

  const organizationCostCode = codeLookup.get(mapping.organization_cost_code_id) ?? null;
  if (!organizationCostCode) {
    return {
      status: "needs_accounting_mapping",
      organizationCostCodeId: null,
      accountingMappingId: mapping.id,
      code: null,
      name: null,
      externalCode: null,
      externalProvider: mapping.provider,
      tradesstackCostCode,
      provider: input.provider,
      projectId: mapping.project_id,
      reason: "missing_accounting_mapping",
    };
  }

  return {
    status: "resolved",
    organizationCostCodeId: organizationCostCode.id,
    accountingMappingId: mapping.id,
    code: organizationCostCode.code,
    name: organizationCostCode.name,
    externalCode: organizationCostCode.external_code,
    externalProvider: organizationCostCode.external_provider,
    tradesstackCostCode,
    provider: input.provider,
    projectId: mapping.project_id,
    reason: "mapped_tradesstack_cost_code",
  };
}

export function resolveOrganizationAccountingCodesForInputs(params: {
  costCodes: OrganizationCostCodeRow[];
  mappings: OrganizationTradesstackAccountingMappingRow[];
  inputs: AccountingCostItemResolutionInput[];
}) {
  return params.inputs.map((input) => ({
    ...input,
    resolution: resolveOrganizationAccountingCode({
      costCodes: params.costCodes,
      mappings: params.mappings,
      input,
    }),
  }));
}
