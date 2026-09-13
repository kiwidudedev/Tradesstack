"use server";

import { revalidatePath } from "next/cache";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import {
  archiveOrganizationTradesstackAccountingMapping,
  type OrganizationTradesstackAccountingMappingsSupabase,
  saveOrganizationTradesstackAccountingMapping,
} from "@/lib/accounting/mapping-service";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { TradesstackFinancialRoutingCode } from "@/lib/tradesstack-financial-routing";
import { getXeroAccountTenantId } from "@/lib/accounting/xero-account-tenant";

export type SaveTradesstackAccountingMappingActionResult = {
  ok: boolean;
  error?: string;
  notice?: string;
};

const COST_CODES_PATH = "/app/company/cost-codes";
const COST_ITEM_REVIEW_PATH = "/app/company/cost-items/review";

async function requireCostCodeMappingWriteContext(organizationId: string) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember || currentMember.organization_id !== organizationId) {
    throw new Error("You do not have access to this organization.");
  }

  const canEdit = await hasOrganizationPermission(organizationId, "settings.organization.update");
  if (!canEdit) {
    throw new Error("You do not have permission to update accounting mappings.");
  }

  const admin = createAdminSupabaseClient();
  return {
    currentMember,
    admin,
    supabase: admin as unknown as OrganizationTradesstackAccountingMappingsSupabase,
  };
}

function formatProviderLabel(provider: string) {
  return provider
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export async function saveTradesstackAccountingMappingAction(params: {
  organizationId: string;
  provider: string;
  tradesstackCostCode: TradesstackFinancialRoutingCode;
  organizationCostCodeId: string;
}): Promise<SaveTradesstackAccountingMappingActionResult> {
  try {
    const context = await requireCostCodeMappingWriteContext(params.organizationId);
    if (params.provider === "xero") {
      const [{ data: connection, error: connectionError }, { data: costCode, error: costCodeError }] =
        await Promise.all([
          context.admin
            .from("organization_xero_connections")
            .select("tenant_id, status")
            .eq("organization_id", params.organizationId)
            .maybeSingle(),
          context.admin
            .from("organization_cost_codes")
            .select("id, external_provider, is_active, metadata")
            .eq("organization_id", params.organizationId)
            .eq("id", params.organizationCostCodeId)
            .maybeSingle(),
        ]);

      if (
        connectionError
        || !connection
        || connection.status !== "connected"
        || !connection.tenant_id
      ) {
        throw new Error("Connect the intended Xero tenant before updating its accounting mappings.");
      }
      if (
        costCodeError
        || !costCode
        || costCode.external_provider !== "xero"
        || !costCode.is_active
        || getXeroAccountTenantId(costCode) !== connection.tenant_id
      ) {
        throw new Error("Select an active Xero account imported from the currently connected tenant.");
      }
    }

    await saveOrganizationTradesstackAccountingMapping({
      supabase: context.supabase,
      organizationId: params.organizationId,
      provider: params.provider,
      tradesstackCostCode: params.tradesstackCostCode,
      organizationCostCodeId: params.organizationCostCodeId,
    });

    revalidatePath(COST_CODES_PATH);
    revalidatePath(COST_ITEM_REVIEW_PATH);
    return {
      ok: true,
      notice: `Saved ${params.tradesstackCostCode} mapping for ${formatProviderLabel(params.provider)}.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the accounting mapping.",
    };
  }
}

export async function archiveTradesstackAccountingMappingAction(params: {
  organizationId: string;
  provider: string;
  tradesstackCostCode: TradesstackFinancialRoutingCode;
}): Promise<SaveTradesstackAccountingMappingActionResult> {
  try {
    const context = await requireCostCodeMappingWriteContext(params.organizationId);
    await archiveOrganizationTradesstackAccountingMapping({
      supabase: context.supabase,
      organizationId: params.organizationId,
      provider: params.provider,
      tradesstackCostCode: params.tradesstackCostCode,
    });

    revalidatePath(COST_CODES_PATH);
    revalidatePath(COST_ITEM_REVIEW_PATH);
    return {
      ok: true,
      notice: `Removed ${params.tradesstackCostCode} mapping for ${formatProviderLabel(params.provider)}.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to remove the accounting mapping.",
    };
  }
}
