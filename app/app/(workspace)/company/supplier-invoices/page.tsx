import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import { matchCountsTowardInvoiceTotal, type SupplierInvoiceRow } from "@/lib/supplier-invoices";
import { resolveTaxJurisdiction } from "@/lib/jurisdiction/country";
import { CompanySupplierInvoicesWorkspace } from "./CompanySupplierInvoicesWorkspace";

export default async function CompanySupplierInvoicesPage() {
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) {
    return null;
  }

  const [canView, canWrite] = await Promise.all([
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.view"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.capture"),
  ]);

  if (!canView) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const [
    { data: organization, error: organizationError },
    { data: xeroConnection, error: xeroConnectionError },
    { data: invoices, error: invoicesError },
    { data: suppliers, error: suppliersError },
    { data: matches, error: matchesError },
  ] = await Promise.all([
      supabase
        .from("organizations")
        .select("country, default_currency, default_tax_rate, tax_registration_status")
        .eq("id", currentMember.organization_id)
        .single(),
      supabase
        .from("organization_xero_connections")
        .select("id, tenant_id, status")
        .eq("organization_id", currentMember.organization_id)
        .eq("status", "connected")
        .maybeSingle(),
      supabase
        .from("supplier_invoices")
        .select("*")
        .eq("organization_id", currentMember.organization_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("organization_suppliers")
        .select("*")
        .eq("organization_id", currentMember.organization_id)
        .order("company_name", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("supplier_invoice_purchase_order_matches")
        .select("supplier_invoice_id, matched_amount, match_status, approval_status")
        .eq("organization_id", currentMember.organization_id),
    ]);

  if (invoicesError) {
    throw new Error(invoicesError.message);
  }

  if (suppliersError) {
    throw new Error(suppliersError.message);
  }
  if (matchesError) {
    throw new Error(matchesError.message);
  }
  if (organizationError) {
    throw new Error(organizationError.message);
  }
  if (xeroConnectionError) {
    throw new Error(xeroConnectionError.message);
  }

  const jurisdiction = resolveTaxJurisdiction(organization.country);
  const standardRate = jurisdiction === "NZ" ? 15 : jurisdiction === "AU" ? 10 : 0;
  let automaticTaxRatePercent = organization.tax_registration_status === "registered"
    ? Number(organization.default_tax_rate ?? standardRate)
    : 0;
  if (xeroConnection?.tenant_id) {
    const { data: taxRates, error: taxRatesError } = await supabase
      .from("organization_accounting_tax_rates")
      .select("effective_rate, jurisdiction_code, status, is_active, can_apply_to_expenses, metadata")
      .eq("organization_id", currentMember.organization_id)
      .eq("accounting_connection_id", xeroConnection.id)
      .eq("tenant_id", xeroConnection.tenant_id);
    if (taxRatesError) {
      throw new Error(taxRatesError.message);
    }
    const standardXeroRate = (taxRates ?? []).find((rate) =>
      rate.is_active
      && rate.status?.toUpperCase() === "ACTIVE"
      && rate.can_apply_to_expenses
      && rate.jurisdiction_code === jurisdiction
      && Number(rate.effective_rate) === standardRate
    );
    if (standardXeroRate?.effective_rate !== null && standardXeroRate?.effective_rate !== undefined) {
      automaticTaxRatePercent = Number(standardXeroRate.effective_rate);
    }
  }

  const invoiceMatchSummaries = new Map<
    string,
    {
      activeMatchCount: number;
      approvedAllocationTotal: number;
      disputedAllocationTotal: number;
    }
  >();

  for (const match of matches ?? []) {
    const supplierInvoiceId = match.supplier_invoice_id as string;
    const current =
      invoiceMatchSummaries.get(supplierInvoiceId) ?? {
        activeMatchCount: 0,
        approvedAllocationTotal: 0,
        disputedAllocationTotal: 0,
      };

    if (matchCountsTowardInvoiceTotal(match.match_status as string)) {
      current.activeMatchCount += 1;
      if (match.approval_status === "approved") {
        current.approvedAllocationTotal += Number(match.matched_amount ?? 0);
      }
      if (match.approval_status === "disputed") {
        current.disputedAllocationTotal += Number(match.matched_amount ?? 0);
      }
    }

    invoiceMatchSummaries.set(supplierInvoiceId, current);
  }

  return (
    <CompanySupplierInvoicesWorkspace
      organizationId={currentMember.organization_id}
      initialInvoices={(invoices ?? []) as SupplierInvoiceRow[]}
      invoiceMatchSummaries={Object.fromEntries(invoiceMatchSummaries)}
      suppliers={(suppliers ?? []) as OrganizationSupplierRow[]}
      currency={organization.default_currency}
      automaticTaxRatePercent={automaticTaxRatePercent}
      canWrite={canWrite}
    />
  );
}
