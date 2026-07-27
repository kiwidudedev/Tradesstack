import type { OrganizationCostCodeRow } from "@/lib/accounting/types";

export function getXeroAccountTenantId(costCode: Pick<OrganizationCostCodeRow, "metadata">) {
  if (!costCode.metadata || typeof costCode.metadata !== "object" || Array.isArray(costCode.metadata)) {
    return null;
  }

  const tenantId = (costCode.metadata as Record<string, unknown>).tenantId;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
}

export function isCostCodeAvailableForAccountingTenant(params: {
  costCode: Pick<OrganizationCostCodeRow, "external_provider" | "metadata">;
  provider: string;
  currentXeroTenantId: string | null;
}) {
  if (params.provider !== "xero") {
    return true;
  }

  return Boolean(
    params.currentXeroTenantId
    && getXeroAccountTenantId(params.costCode) === params.currentXeroTenantId
  );
}

export function formatExternalAccountingCode(costCode: Pick<
  OrganizationCostCodeRow,
  "code" | "external_code" | "name"
>) {
  const code = costCode.external_code?.trim() || costCode.code;
  return `${code}${costCode.name ? ` - ${costCode.name}` : ""}`;
}
