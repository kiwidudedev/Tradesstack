import { notFound } from "next/navigation";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import {
  type AcceptedCommercialVarianceInput,
  getPurchaseOrderInvoicingProgress,
  getSupplierInvoiceCommercialComparison,
} from "@/lib/procurement-commercial-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { loadSupplierInvoiceDocumentState } from "@/lib/supplier-invoice-document-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import type {
  SupplierInvoiceActivityEventRow,
  SupplierInvoiceApprovalStepRow,
  SupplierInvoiceLineAllocationRow,
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
  resolvePurchaseOrderLineLineage,
} from "@/lib/supplier-invoice-lineage";
import {
  resolveAccountingRoute,
  type OrganizationAccountingRouteMappingRow,
} from "@/lib/accounting/accounting-routes";
import type { Database, Json } from "@/lib/supabase/types";
import {
  formatExternalAccountingCode,
  isCostCodeAvailableForAccountingTenant,
} from "@/lib/accounting/xero-account-tenant";
import { SupplierInvoiceDetailWorkspace } from "./SupplierInvoiceDetailWorkspace";
import { getSupplierInvoiceXeroBillReadiness } from "@/lib/xero/bills";
import { getSupplierInvoiceWorkflowState } from "@/lib/supplier-invoice-workflow";

type SupplierInvoiceDetailPageProps = {
  params: Promise<{ invoiceId: string }>;
};

type OrganizationProjectRow = Database["public"]["Tables"]["organization_projects"]["Row"];
type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];
type OrganizationAccountingTaxRateRow = {
  id: string;
  name: string;
  tax_type: string | null;
  effective_rate: number | null;
  is_active: boolean;
  status: string | null;
  tenant_id: string | null;
  can_apply_to_expenses: boolean;
};
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
const SUPPLIER_INVOICE_REQUEST_TIMEOUT_MS = 15_000;

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
  accountingResolutionStatus: string | null;
}) {
  if (!params.hasPurchaseOrderLine) {
    return "No PO line candidate" as const;
  }

  if (params.accountingResolutionStatus !== "resolved") {
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

  const [canView, canWrite, canReview, canReverse, canViewXeroBill, canExportXeroBill, canCapture, canSubmitSiteReview, canAccountsApprove] = await Promise.all([
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.view"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.write"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.review"),
    hasOrganizationPermission(currentMember.organization_id, "actual_costs.reverse"),
    hasOrganizationPermission(currentMember.organization_id, "accounting.ap_bills.view"),
    hasOrganizationPermission(currentMember.organization_id, "accounting.ap_bills.export"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.capture"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.submit_site_review"),
    hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.accounts_approve"),
  ]);

  if (!canView) {
    return null;
  }

  const supabase = await createServerSupabaseClient({
    requestTimeoutMs: SUPPLIER_INVOICE_REQUEST_TIMEOUT_MS,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purchaseOrdersTable = (supabase as any).from("project_purchase_orders");
  const [
    { data: invoice, error: invoiceError },
    { data: suppliers, error: suppliersError },
    { data: lines, error: linesError },
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

  const [
    { data: mappings, error: mappingsError },
    { data: accountingTaxRates, error: accountingTaxRatesError },
    matchedPurchaseOrderLinesResult,
    initialCommercialComparison,
  ] =
    await Promise.all([
      supabase
        .from("organization_accounting_route_mappings" as never)
        .select("*")
        .eq("organization_id", currentMember.organization_id)
        .eq("accounting_route", "supplier_bill_expense")
        .order("provider", { ascending: true })
        .order("updated_at", { ascending: false }),
      supabase
        .from("organization_accounting_tax_rates" as never)
        .select("id, name, tax_type, effective_rate, is_active, status, tenant_id, can_apply_to_expenses")
        .eq("organization_id", currentMember.organization_id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      matchedPurchaseOrderIds.length > 0
        ? supabase
            .from("project_purchase_order_line_items")
            .select("*")
            .eq("organization_id", currentMember.organization_id)
            .in("purchase_order_id", matchedPurchaseOrderIds)
            .order("purchase_order_id", { ascending: true })
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      getSupplierInvoiceCommercialComparison({
        supabase,
        organizationId: currentMember.organization_id,
        supplierInvoiceId: invoiceId,
      }),
    ]);

  if (mappingsError) {
    throw new Error(mappingsError.message);
  }
  if (accountingTaxRatesError) {
    throw new Error(accountingTaxRatesError.message);
  }
  if (matchedPurchaseOrderLinesResult.error) {
    throw new Error(matchedPurchaseOrderLinesResult.error.message);
  }

  const acceptedTeamReviewNotesByKey = new Map<string, string>();
  ((draftAllocations ?? []) as SupplierInvoiceLineAllocationRow[]).forEach((allocation) => {
    if (
      allocation.approval_status !== "approved"
      || allocation.edit_state === "reversed"
      || allocation.edit_state === "superseded"
    ) return;
    const checks = allocation.approval_checks_json;
    if (!checks || typeof checks !== "object" || Array.isArray(checks)) return;
    const acceptedVariances = (checks as Record<string, Json>).acceptedVariances;
    if (!Array.isArray(acceptedVariances)) return;
    acceptedVariances.forEach((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const record = value as Record<string, Json>;
      if (typeof record.key === "string" && typeof record.note === "string" && record.note.trim()) {
        acceptedTeamReviewNotesByKey.set(record.key, record.note.trim());
      }
    });
  });
  const acceptedTeamReviewVariances: AcceptedCommercialVarianceInput[] =
    initialCommercialComparison.warnings.flatMap((warning) => {
      const note = acceptedTeamReviewNotesByKey.get(warning.key);
      return note ? [{
        key: warning.key,
        type: warning.type,
        purchaseOrderLineItemId: warning.purchaseOrderLineItemId,
        expectedValue: warning.expectedValue,
        actualValue: warning.actualValue,
        varianceAmount: warning.varianceAmount,
        note,
      }] : [];
    });
  const commercialComparison = acceptedTeamReviewVariances.length > 0
    ? await getSupplierInvoiceCommercialComparison({
        supabase,
        organizationId: currentMember.organization_id,
        supplierInvoiceId: invoiceId,
        acceptedVariances: acceptedTeamReviewVariances,
      })
    : initialCommercialComparison;

  const matchedPurchaseOrderLines =
    (matchedPurchaseOrderLinesResult.data ?? []) as PurchaseOrderLineItemRow[];
  const activeMatchedPurchaseOrderIds = Array.from(
    new Set(
      ((matches ?? []) as SupplierInvoicePurchaseOrderMatchRow[])
        .filter((match) => match.match_status === "accepted" || match.match_status === "adjusted")
        .map((match) => match.purchase_order_id)
    )
  );
  const matchedPurchaseOrderProgress = await Promise.all(
    activeMatchedPurchaseOrderIds.map((purchaseOrderId) =>
      getPurchaseOrderInvoicingProgress({
        supabase,
        organizationId: currentMember.organization_id,
        purchaseOrderId,
      })
    )
  );
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
            tradesstackCostCode: null,
            tradesstackCostCodeLabel: null,
            financialRoutingConfidence: null,
            financialRoutingSource: null,
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
          const accountingResolution = resolveAccountingRoute({
            mappings: (mappings ?? []) as unknown as OrganizationAccountingRouteMappingRow[],
            organizationId: currentMember.organization_id,
            provider: "xero",
            accountingRoute: "supplier_bill_expense",
            projectId: lineage.projectId,
          });
          const accountingCode = ((costCodes ?? []) as OrganizationCostCodeRow[]).find(
            (row) => row.id === accountingResolution.organizationCostCodeId,
          ) ?? null;
          const status = derivePreviewStatus({
            hasPurchaseOrderLine: true,
            accountingResolutionStatus: accountingResolution.status,
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
            tradesstackCostCode: lineage.tradesstackCostCode,
            tradesstackCostCodeLabel: lineage.tradesstackCostCodeLabel,
            financialRoutingConfidence: lineage.financialRoutingConfidence,
            financialRoutingSource: lineage.financialRoutingSource,
            organizationCostCodeId: accountingResolution.organizationCostCodeId,
            organizationCostCode: accountingCode?.code ?? null,
            organizationCostCodeName: accountingCode?.name ?? null,
            accountingResolutionStatus: accountingResolution.status,
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
  let xeroBillReadinessError: string | null = null;
  const [xeroBillReadiness, documentState, workflowState] = await Promise.all([
    canViewXeroBill
      ? getSupplierInvoiceXeroBillReadiness({
          supabase,
          organizationId: currentMember.organization_id,
          supplierInvoiceId: invoiceId,
          commercialComparison,
        }).catch((error: unknown) => {
          console.error("[supplier-invoice] Xero Bill readiness failed.", {
            organizationId: currentMember.organization_id,
            supplierInvoiceId: invoiceId,
            errorType: error instanceof Error ? error.name : "UnknownError",
          });
          xeroBillReadinessError =
            "Xero readiness is temporarily unavailable. Refresh the page to try again.";
          return null;
        })
      : Promise.resolve(null),
    loadSupplierInvoiceDocumentState({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: invoiceId,
    }),
    getSupplierInvoiceWorkflowState({
      supabase,
      organizationId: currentMember.organization_id,
      supplierInvoiceId: invoiceId,
    }),
  ]);
  const currentXeroTenantId =
    xeroBillReadiness?.resolvedSummary.tenantId ?? null;
  const canManageAccountsWorkflow = ["owner", "admin"].includes(currentMember.role);
  const canDeleteInvoice =
    canManageAccountsWorkflow
    && canCapture
    && (!canViewXeroBill || xeroBillReadiness !== null)
    && !(
      xeroBillReadiness
      && ["queued", "exporting", "exported", "attention_required"].includes(
        xeroBillReadiness.resolvedSummary.exportStatus
      )
    );

  return (
    <SupplierInvoiceDetailWorkspace
      organizationId={currentMember.organization_id}
      initialInvoice={invoice as SupplierInvoiceRow}
      suppliers={(suppliers ?? []) as OrganizationSupplierRow[]}
      initialLines={(lines ?? []) as SupplierInvoiceLineRow[]}
      initialCurrentDocument={documentState.currentDocument}
      initialDocumentExtraction={documentState.extraction}
      initialMatches={(matches ?? []) as SupplierInvoicePurchaseOrderMatchRow[]}
      initialApprovalSteps={(approvalSteps ?? []) as SupplierInvoiceApprovalStepRow[]}
      initialActivityEvents={(activityEvents ?? []) as SupplierInvoiceActivityEventRow[]}
      purchaseOrders={(purchaseOrders ?? []) as PurchaseOrderCandidateRow[]}
      projects={(projects ?? []) as OrganizationProjectRow[]}
      costCodes={(costCodes ?? []) as OrganizationCostCodeRow[]}
      organizationMembers={(members ?? []) as OrganizationMemberRow[]}
      allocationPreviewRows={previewRows}
      matchedPurchaseOrderLines={matchedPurchaseOrderLines}
      matchedPurchaseOrderProgress={matchedPurchaseOrderProgress}
      initialDraftAllocations={(draftAllocations ?? []) as SupplierInvoiceLineAllocationRow[]}
      initialActualCostEvents={(actualCostEvents ?? []) as ProjectActualCostEventRow[]}
      initialCommercialComparison={commercialComparison}
      initialXeroBillReadiness={xeroBillReadiness}
      initialXeroBillReadinessError={xeroBillReadinessError}
      initialWorkflowState={workflowState}
      accountingMappings={(
        (mappings ?? []) as unknown as OrganizationAccountingRouteMappingRow[]
      )
        .filter((mapping) => {
          if (!mapping.is_active) {
            return false;
          }
          const costCode = ((costCodes ?? []) as OrganizationCostCodeRow[]).find(
            (row) => row.id === mapping.organization_cost_code_id
          );
          return Boolean(
            costCode
            && isCostCodeAvailableForAccountingTenant({
              costCode,
              provider: mapping.provider,
              currentXeroTenantId,
            })
          );
        })
        .map((mapping) => {
          const costCode = ((costCodes ?? []) as OrganizationCostCodeRow[]).find(
            (row) => row.id === mapping.organization_cost_code_id
          );
          return {
            id: mapping.id,
            label: [
              mapping.project_id ? "Project Supplier Bills" : "Supplier Bills",
              costCode ? formatExternalAccountingCode(costCode) : null,
              mapping.provider,
            ]
              .filter(Boolean)
              .join(" · "),
          };
        })
        .concat(((costCodes ?? []) as OrganizationCostCodeRow[])
          .filter((costCode) => costCode.is_active
            && costCode.external_provider === "xero"
            && isCostCodeAvailableForAccountingTenant({
              costCode,
              provider: "xero",
              currentXeroTenantId,
            }))
          .map((costCode) => ({
            id: `account:${costCode.id}`,
            label: `Line override · ${formatExternalAccountingCode(costCode)}`,
          })))}
      accountingTaxRates={(
        (accountingTaxRates ?? []) as unknown as OrganizationAccountingTaxRateRow[]
      ).filter((taxRate) =>
        taxRate.tenant_id === currentXeroTenantId
        && taxRate.can_apply_to_expenses
        && taxRate.status?.toUpperCase() === "ACTIVE"
      ).map((taxRate) => ({
        id: taxRate.id,
        label: [
          taxRate.name,
          taxRate.tax_type,
          taxRate.effective_rate === null
            ? null
            : `${taxRate.effective_rate}%`,
        ]
          .filter(Boolean)
          .join(" · "),
      }))}
      canWrite={canWrite && canCapture}
      canReview={canReview && canManageAccountsWorkflow}
      canReverse={canReverse}
      canExportXeroBill={canExportXeroBill}
      canRefreshXeroBill={canViewXeroBill && canManageAccountsWorkflow}
      canSubmitSiteReview={canSubmitSiteReview && canManageAccountsWorkflow}
      canAccountsApprove={canAccountsApprove && canManageAccountsWorkflow}
      canDeleteInvoice={canDeleteInvoice}
    />
  );
}
