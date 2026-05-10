import { notFound } from "next/navigation";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import type {
  SupplierInvoiceActivityEventRow,
  SupplierInvoiceApprovalStepRow,
  SupplierInvoiceDocumentRow,
  SupplierInvoiceLineRow,
  SupplierInvoicePurchaseOrderMatchRow,
  SupplierInvoiceRow,
} from "@/lib/supplier-invoices";
import type { Database } from "@/lib/supabase/types";
import { SupplierInvoiceDetailWorkspace } from "./SupplierInvoiceDetailWorkspace";

type SupplierInvoiceDetailPageProps = {
  params: Promise<{ invoiceId: string }>;
};

type OrganizationProjectRow = Database["public"]["Tables"]["organization_projects"]["Row"];
type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];
type OrganizationMemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type PurchaseOrderCandidateRow = {
  id: string;
  project_id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  supplier_id: string | null;
  issued_to_label: string | null;
  status: string;
  requested_date: string | null;
  total_purchase_order_price: number | null;
};

export default async function SupplierInvoiceDetailPage({
  params,
}: SupplierInvoiceDetailPageProps) {
  const { invoiceId } = await params;
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) {
    return null;
  }

  const [canView, canWrite, canReview] = await Promise.all([
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.view"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.write"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.review"),
  ]);

  if (!canView) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purchaseOrdersTable = (supabase as any).from("project_purchase_orders");
  const [
    { data: invoice, error: invoiceError },
    { data: suppliers, error: suppliersError },
    { data: lines, error: linesError },
    { data: documents, error: documentsError },
    { data: projects, error: projectsError },
    { data: costCodes, error: costCodesError },
    { data: matches, error: matchesError },
    { data: approvalSteps, error: approvalStepsError },
    { data: activityEvents, error: activityEventsError },
    { data: members, error: membersError },
    { data: purchaseOrders, error: purchaseOrdersError },
  ] = await Promise.all([
    supabase
      .from("supplier_invoices")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase
      .from("organization_suppliers")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .order("company_name", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("supplier_invoice_lines")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("supplier_invoice_documents")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", invoiceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("organization_projects")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .order("name", { ascending: true }),
    supabase
      .from("organization_cost_codes")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    supabase
      .from("supplier_invoice_purchase_order_matches")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", invoiceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("supplier_invoice_approval_steps")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", invoiceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("supplier_invoice_activity_events")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", invoiceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("organization_members")
      .select("user_id, display_name, role, organization_id, id, avatar_path, created_at, updated_at")
      .eq("organization_id", currentMember.organization_id)
      .order("display_name", { ascending: true }),
    purchaseOrdersTable
      .select(
        "id, project_id, purchase_order_number, purchase_order_title, supplier_id, issued_to_label, status, requested_date, total_purchase_order_price"
      )
      .eq("organization_id", currentMember.organization_id)
      .order("updated_at", { ascending: false }),
  ]);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }
  if (suppliersError) {
    throw new Error(suppliersError.message);
  }
  if (linesError) {
    throw new Error(linesError.message);
  }
  if (documentsError) {
    throw new Error(documentsError.message);
  }
  if (projectsError) {
    throw new Error(projectsError.message);
  }
  if (costCodesError) {
    throw new Error(costCodesError.message);
  }
  if (matchesError) {
    throw new Error(matchesError.message);
  }
  if (approvalStepsError) {
    throw new Error(approvalStepsError.message);
  }
  if (activityEventsError) {
    throw new Error(activityEventsError.message);
  }
  if (membersError) {
    throw new Error(membersError.message);
  }
  if (purchaseOrdersError) {
    throw new Error(purchaseOrdersError.message);
  }

  if (!invoice) {
    notFound();
  }

  return (
    <SupplierInvoiceDetailWorkspace
      organizationId={currentMember.organization_id}
      initialInvoice={invoice as SupplierInvoiceRow}
      suppliers={(suppliers ?? []) as OrganizationSupplierRow[]}
      initialLines={(lines ?? []) as SupplierInvoiceLineRow[]}
      initialDocuments={(documents ?? []) as SupplierInvoiceDocumentRow[]}
      initialMatches={(matches ?? []) as SupplierInvoicePurchaseOrderMatchRow[]}
      initialApprovalSteps={(approvalSteps ?? []) as SupplierInvoiceApprovalStepRow[]}
      initialActivityEvents={(activityEvents ?? []) as SupplierInvoiceActivityEventRow[]}
      purchaseOrders={(purchaseOrders ?? []) as PurchaseOrderCandidateRow[]}
      projects={(projects ?? []) as OrganizationProjectRow[]}
      costCodes={(costCodes ?? []) as OrganizationCostCodeRow[]}
      organizationMembers={(members ?? []) as OrganizationMemberRow[]}
      canWrite={canWrite}
      canReview={canReview}
    />
  );
}
