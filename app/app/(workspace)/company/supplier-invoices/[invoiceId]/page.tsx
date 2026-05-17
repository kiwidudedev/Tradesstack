import { notFound } from "next/navigation";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import type {
  SupplierInvoiceActivityEventRow,
  SupplierInvoiceApprovalStepRow,
  SupplierInvoiceLineAllocationRow,
  SupplierInvoiceDocumentRow,
  SupplierInvoiceLineAllocationPreviewRow,
  SupplierInvoiceLineRow,
  SupplierInvoicePurchaseOrderMatchRow,
  SupplierInvoiceRow,
  ProjectActualCostEventRow,
} from "@/lib/supplier-invoices";
import type {
  CostItemRow,
  PurchaseOrderLineItemRow,
} from "@/lib/supplier-invoice-lineage";
import {
  buildAccountingResolutionInput,
  resolveInheritedAccountingCode,
  resolvePurchaseOrderLineLineage,
} from "@/lib/supplier-invoice-lineage";
import type { Database } from "@/lib/supabase/types";
import { SupplierInvoiceDetailWorkspace } from "./SupplierInvoiceDetailWorkspace";

type SupplierInvoiceDetailPageProps = {
  params: Promise<{ invoiceId: string }>;
};

type OrganizationProjectRow = Database["public"]["Tables"]["organization_projects"]["Row"];
type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];
type OrganizationCostCodeMappingRuleRow =
  Database["public"]["Tables"]["organization_cost_code_mapping_rules"]["Row"];
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
const MAX_PREVIEW_CANDIDATES_PER_LINE = 3;

function normalizePreviewText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function scorePreviewCandidate(line: SupplierInvoiceLineRow, purchaseOrderLine: PurchaseOrderLineItemRow) {
  const invoiceDescription = normalizePreviewText(line.description);
  const purchaseOrderDescription = normalizePreviewText(purchaseOrderLine.description);
  let score = 0;

  if (invoiceDescription && purchaseOrderDescription) {
    if (invoiceDescription === purchaseOrderDescription) {
      score += 4;
    } else if (
      invoiceDescription.includes(purchaseOrderDescription) ||
      purchaseOrderDescription.includes(invoiceDescription)
    ) {
      score += 3;
    } else {
      const invoiceTerms = new Set(invoiceDescription.split(/\s+/).filter(Boolean));
      const purchaseOrderTerms = purchaseOrderDescription.split(/\s+/).filter(Boolean);
      const overlapCount = purchaseOrderTerms.filter((term) => invoiceTerms.has(term)).length;
      score += Math.min(overlapCount, 2);
    }
  }

  const invoiceAmount = Number(line.line_total ?? 0);
  const purchaseOrderAmount = Number(purchaseOrderLine.total ?? 0);
  if (Math.abs(invoiceAmount - purchaseOrderAmount) < 0.01) {
    score += 2;
  }

  if (line.project_id && line.project_id === purchaseOrderLine.project_id) {
    score += 1;
  }

  return score;
}

function derivePreviewStatus(params: {
  hasPurchaseOrderLine: boolean;
  workType: string | null;
  costType: string | null;
  internalCostCode: string | null;
  classificationNeedsReview: boolean;
  organizationCostCodeId: string | null;
  needsAccountingReview: boolean;
}) {
  if (!params.hasPurchaseOrderLine) {
    return "No PO line candidate" as const;
  }

  if (
    params.classificationNeedsReview ||
    !params.workType ||
    !params.costType ||
    !params.internalCostCode
  ) {
    return "Needs cost review" as const;
  }

  if (!params.organizationCostCodeId || params.needsAccountingReview) {
    return "Needs accounting mapping" as const;
  }

  return "Ready" as const;
}

export default async function SupplierInvoiceDetailPage({
  params,
}: SupplierInvoiceDetailPageProps) {
  const { invoiceId } = await params;
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) {
    return null;
  }

  const [canView, canWrite, canReview, canReverse] = await Promise.all([
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.view"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.write"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.review"),
    hasOrganizationPermission(currentMember.organization_id, "actual_costs.reverse"),
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
    { data: draftAllocations, error: draftAllocationsError },
    { data: actualCostEvents, error: actualCostEventsError },
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
    supabase
      .from("supplier_invoice_line_allocations")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", invoiceId)
      .order("supplier_invoice_line_id", { ascending: true })
      .order("allocation_sequence", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("project_actual_cost_events")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("supplier_invoice_id", invoiceId)
      .order("created_at", { ascending: true }),
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
  if (draftAllocationsError) {
    throw new Error(draftAllocationsError.message);
  }
  if (actualCostEventsError) {
    throw new Error(actualCostEventsError.message);
  }

  if (!invoice) {
    notFound();
  }

  const matchedPurchaseOrderIds = Array.from(
    new Set((matches ?? []).map((match) => match.purchase_order_id).filter(Boolean))
  );

  const [{ data: mappingRules, error: mappingRulesError }, matchedPurchaseOrderLinesResult] =
    await Promise.all([
      supabase
        .from("organization_cost_code_mapping_rules")
        .select("*")
        .eq("organization_id", currentMember.organization_id)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
      matchedPurchaseOrderIds.length > 0
        ? supabase
            .from("project_purchase_order_line_items")
            .select("*")
            .eq("organization_id", currentMember.organization_id)
            .in("purchase_order_id", matchedPurchaseOrderIds)
            .order("purchase_order_id", { ascending: true })
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (mappingRulesError) {
    throw new Error(mappingRulesError.message);
  }
  if (matchedPurchaseOrderLinesResult.error) {
    throw new Error(matchedPurchaseOrderLinesResult.error.message);
  }

  const matchedPurchaseOrderLines =
    (matchedPurchaseOrderLinesResult.data ?? []) as PurchaseOrderLineItemRow[];
  const costItemIds = Array.from(
    new Set(
      matchedPurchaseOrderLines
        .flatMap((line) => [line.cost_item_id, line.source_cost_item_id])
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const { data: previewCostItems, error: previewCostItemsError } =
    costItemIds.length > 0
      ? await supabase
          .from("cost_items")
          .select("*")
          .eq("organization_id", currentMember.organization_id)
          .in("id", costItemIds)
      : { data: [], error: null };

  if (previewCostItemsError) {
    throw new Error(previewCostItemsError.message);
  }

  const costItemById = new Map(
    ((previewCostItems ?? []) as CostItemRow[]).map((costItem) => [costItem.id, costItem])
  );
  const purchaseOrderById = new Map(
    ((purchaseOrders ?? []) as PurchaseOrderCandidateRow[]).map((purchaseOrder) => [
      purchaseOrder.id,
      purchaseOrder,
    ])
  );
  const previewRows: SupplierInvoiceLineAllocationPreviewRow[] = ((lines ?? []) as SupplierInvoiceLineRow[]).flatMap<SupplierInvoiceLineAllocationPreviewRow>(
    (line) => {
      if (matchedPurchaseOrderLines.length === 0) {
        return [
          {
            candidateKey: `${line.id}:none`,
            invoiceLineId: line.id,
            invoiceLineDescription: line.description ?? "Untitled invoice line",
            invoiceLineAmount: Number(line.line_total ?? 0),
            candidatePurchaseOrderId: null,
            candidatePurchaseOrderNumber: null,
            candidatePurchaseOrderTitle: null,
            candidatePurchaseOrderLineItemId: null,
            candidatePurchaseOrderLineDescription: null,
            candidatePurchaseOrderLineAmount: null,
            costItemId: null,
            sourceCostItemId: null,
            workType: null,
            costType: null,
            internalCostCode: null,
            organizationCostCodeId: null,
            organizationCostCode: null,
            organizationCostCodeName: null,
            accountingResolutionStatus: "pending",
            status: "No PO line candidate",
            candidateScore: 0,
          } satisfies SupplierInvoiceLineAllocationPreviewRow,
        ];
      }

      return matchedPurchaseOrderLines
        .map((purchaseOrderLine) => {
          const purchaseOrder = purchaseOrderById.get(purchaseOrderLine.purchase_order_id) ?? null;
          const lineage = resolvePurchaseOrderLineLineage({
            purchaseOrderLine,
            costItem: purchaseOrderLine.cost_item_id
              ? costItemById.get(purchaseOrderLine.cost_item_id) ?? null
              : null,
            sourceCostItem: purchaseOrderLine.source_cost_item_id
              ? costItemById.get(purchaseOrderLine.source_cost_item_id) ?? null
              : null,
          });
          const accountingInput = buildAccountingResolutionInput({
            costItemId: lineage.costItemId ?? lineage.sourceCostItemId,
            projectId: lineage.projectId,
            title: line.description ?? "Supplier invoice line",
            description: line.description ?? "",
            lineage,
          });
          const accountingResolution = resolveInheritedAccountingCode({
            costCodes: (costCodes ?? []) as OrganizationCostCodeRow[],
            mappingRules: (mappingRules ?? []) as OrganizationCostCodeMappingRuleRow[],
            input: accountingInput,
          });
          const status = derivePreviewStatus({
            hasPurchaseOrderLine: true,
            workType: lineage.workType,
            costType: lineage.costType,
            internalCostCode: lineage.internalCostCode,
            classificationNeedsReview: lineage.classificationNeedsReview,
            organizationCostCodeId: accountingResolution?.organizationCostCodeId ?? null,
            needsAccountingReview: accountingResolution?.needsAccountingReview ?? false,
          });
          const candidateScore = scorePreviewCandidate(line, purchaseOrderLine);

          return {
            candidateKey: `${line.id}:${purchaseOrderLine.id}`,
            invoiceLineId: line.id,
            invoiceLineDescription: line.description ?? "Untitled invoice line",
            invoiceLineAmount: Number(line.line_total ?? 0),
            candidatePurchaseOrderId: purchaseOrderLine.purchase_order_id,
            candidatePurchaseOrderNumber: purchaseOrder?.purchase_order_number ?? null,
            candidatePurchaseOrderTitle: purchaseOrder?.purchase_order_title ?? null,
            candidatePurchaseOrderLineItemId: purchaseOrderLine.id,
            candidatePurchaseOrderLineDescription: purchaseOrderLine.description ?? null,
            candidatePurchaseOrderLineAmount: Number(purchaseOrderLine.total ?? 0),
            costItemId: lineage.costItemId,
            sourceCostItemId: lineage.sourceCostItemId,
            workType: lineage.workType,
            costType: lineage.costType,
            internalCostCode: lineage.internalCostCode,
            organizationCostCodeId: accountingResolution?.organizationCostCodeId ?? null,
            organizationCostCode: accountingResolution?.code ?? null,
            organizationCostCodeName: accountingResolution?.name ?? null,
            accountingResolutionStatus: accountingResolution?.status ?? "pending",
            status,
            candidateScore,
          } satisfies SupplierInvoiceLineAllocationPreviewRow;
        })
        .sort((left, right) => {
          if (right.candidateScore !== left.candidateScore) {
            return right.candidateScore - left.candidateScore;
          }

          const leftPurchaseOrderNumber = left.candidatePurchaseOrderNumber ?? "";
          const rightPurchaseOrderNumber = right.candidatePurchaseOrderNumber ?? "";
          if (leftPurchaseOrderNumber !== rightPurchaseOrderNumber) {
            return leftPurchaseOrderNumber.localeCompare(rightPurchaseOrderNumber);
          }

          return (left.candidatePurchaseOrderLineDescription ?? "").localeCompare(
            right.candidatePurchaseOrderLineDescription ?? ""
          );
        })
        .slice(0, MAX_PREVIEW_CANDIDATES_PER_LINE);
    }
  );

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
      allocationPreviewRows={previewRows}
      initialDraftAllocations={(draftAllocations ?? []) as SupplierInvoiceLineAllocationRow[]}
      initialActualCostEvents={(actualCostEvents ?? []) as ProjectActualCostEventRow[]}
      canWrite={canWrite}
      canReview={canReview}
      canReverse={canReverse}
    />
  );
}
