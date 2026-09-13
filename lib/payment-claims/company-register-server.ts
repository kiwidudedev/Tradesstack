import "server-only";

import { redirect } from "next/navigation";
import {
  COMPANY_PAYMENT_CLAIMS_PAGE_SIZE,
  COMPANY_PAYMENT_CLAIMS_PERMISSION,
  type CompanyPaymentClaimsRegister,
} from "@/app/app/(workspace)/company/payment-claims/payment-claim-register-types";
import type { CompanyPaymentClaimsFilters } from "@/lib/payment-claims/company-register-presentation";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isRegister(value: unknown): value is CompanyPaymentClaimsRegister {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.rows)
    && Boolean(record.metrics && typeof record.metrics === "object")
    && Boolean(record.pageInfo && typeof record.pageInfo === "object")
    && Boolean(record.options && typeof record.options === "object")
    && Boolean(record.context && typeof record.context === "object");
}

export async function loadCompanyPaymentClaimsRegister(
  filters: CompanyPaymentClaimsFilters,
) {
  const member = await getCurrentOrganizationMember();
  if (!member) redirect("/login");

  const canView = await hasOrganizationPermission(
    member.organization_id,
    COMPANY_PAYMENT_CLAIMS_PERMISSION,
  );
  if (!canView) redirect("/app/dashboard");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "get_company_payment_claims_register",
    {
      p_organization_id: member.organization_id,
      p_month: filters.month ?? undefined,
      p_search: filters.search ?? undefined,
      p_project_id: filters.projectId ?? undefined,
      p_client_id: filters.clientId ?? undefined,
      p_claim_status: filters.claimStatus ?? undefined,
      p_xero_status: filters.xeroStatus ?? undefined,
      p_external_status: filters.externalStatus ?? undefined,
      p_payment_status: filters.paymentStatus ?? undefined,
      p_outstanding_only: filters.outstandingOnly,
      p_overdue_only: filters.overdueOnly,
      p_attention_only: filters.attentionOnly,
      p_sort: filters.sort,
      p_direction: filters.direction,
      p_page: filters.page,
      p_page_size: COMPANY_PAYMENT_CLAIMS_PAGE_SIZE,
    },
  );
  if (error) throw new Error("Unable to load the Payment Claims register.");
  if (!isRegister(data)) throw new Error("The Payment Claims register returned an invalid response.");
  return data;
}
