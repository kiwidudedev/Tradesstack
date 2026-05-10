import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import { matchCountsTowardInvoiceTotal, type SupplierInvoiceRow } from "@/lib/supplier-invoices";
import { CompanySupplierInvoicesWorkspace } from "./CompanySupplierInvoicesWorkspace";

export default async function CompanySupplierInvoicesPage() {
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) {
    return null;
  }

  const [canView, canWrite] = await Promise.all([
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.view"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.write"),
  ]);

  if (!canView) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const [
    { data: invoices, error: invoicesError },
    { data: suppliers, error: suppliersError },
    { data: matches, error: matchesError },
  ] = await Promise.all([
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
      canWrite={canWrite}
    />
  );
}
