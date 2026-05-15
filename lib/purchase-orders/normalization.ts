import type { Database } from "@/lib/supabase/types";
import type {
  CreatePurchaseOrderDraftResult,
  ProjectMemberPayload,
  PurchaseOrderAssignmentPayload,
  PurchaseOrderAttachmentPayload,
  PurchaseOrderDetailPayload,
  PurchaseOrderInvoiceMatchPayload,
  PurchaseOrderLineItemPayload,
  PurchaseOrderPayload,
  PurchaseOrderRegisterRow,
  PurchaseOrderSummaryPayload,
  PurchaseOrderSourceCostItemOption,
  SavePurchaseOrderDraftResult,
  UpdatePurchaseOrderStatusResult,
  WorkerAssignedPurchaseOrderPayload,
} from "@/lib/purchase-orders/types";

type QuoteRow = Pick<
  Database["public"]["Tables"]["project_quotes"]["Row"],
  "id" | "quote_number" | "quote_title"
>;
type VariationRow = Pick<
  Database["public"]["Tables"]["project_variations"]["Row"],
  "id" | "variation_number" | "variation_title"
>;
type CostItemSourceRow = Pick<
  Database["public"]["Tables"]["cost_items"]["Row"],
  "id" | "source_document_kind" | "source_document_id" | "section" | "description" | "quantity" | "unit" | "unit_rate" | "sort_order"
>;

function asNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: string | null | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizePurchaseOrderRow(
  row: Database["public"]["Tables"]["project_purchase_orders"]["Row"]
): PurchaseOrderPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    purchaseOrderTitle: row.purchase_order_title,
    purchaseOrderNumber: row.purchase_order_number,
    status: row.status,
    origin: row.origin,
    supplierId: row.supplier_id,
    issuedToLabel: row.issued_to_label,
    supplierContact: row.supplier_contact,
    supplierNameSnapshot: row.supplier_name_snapshot,
    supplierEmailSnapshot: row.supplier_email_snapshot,
    supplierPhoneSnapshot: row.supplier_phone_snapshot,
    requestedBy: row.requested_by,
    requestedDate: row.requested_date,
    dueDate: row.due_date,
    sentToClientAt: row.sent_to_client_at,
    approvedAt: row.approved_at,
    invoiceReady: row.invoice_ready,
    notes: row.notes,
    labourTotal: row.labour_total,
    materialsTotal: row.materials_total,
    subcontractorsTotal: row.subcontractors_total,
    plantTotal: row.plant_total,
    marginTotal: row.margin_total,
    subtotal: row.subtotal,
    marginPercent: row.margin_percent,
    discountAmount: row.discount_amount,
    contingencyAmount: row.contingency_amount,
    gstPercent: row.gst_percent,
    gstTotal: row.gst_total,
    totalPurchaseOrderPrice: row.total_purchase_order_price,
    includeMarginInExport: row.include_margin_in_export,
    includeDiscountInExport: row.include_discount_in_export,
    includeContingencyInExport: row.include_contingency_in_export,
  };
}

export function normalizePurchaseOrderRegisterRow(
  row: Pick<
    Database["public"]["Tables"]["project_purchase_orders"]["Row"],
    | "id"
    | "purchase_order_number"
    | "purchase_order_title"
    | "issued_to_label"
    | "status"
    | "requested_date"
    | "due_date"
    | "subtotal"
    | "margin_percent"
    | "discount_amount"
    | "contingency_amount"
    | "total_purchase_order_price"
    | "updated_at"
  >
): PurchaseOrderRegisterRow {
  return {
    id: row.id,
    purchaseOrderNumber: row.purchase_order_number,
    purchaseOrderTitle: row.purchase_order_title,
    issuedToLabel: row.issued_to_label,
    status: row.status,
    requestedDate: row.requested_date,
    dueDate: row.due_date,
    subtotal: row.subtotal,
    marginPercent: row.margin_percent,
    discountAmount: row.discount_amount,
    contingencyAmount: row.contingency_amount,
    totalPurchaseOrderPrice: row.total_purchase_order_price,
    updatedAt: row.updated_at,
  };
}

export function normalizePurchaseOrderRegisterRowList(
  rows: Array<
    Pick<
      Database["public"]["Tables"]["project_purchase_orders"]["Row"],
      | "id"
      | "purchase_order_number"
      | "purchase_order_title"
      | "issued_to_label"
      | "status"
      | "requested_date"
      | "due_date"
      | "subtotal"
      | "margin_percent"
      | "discount_amount"
      | "contingency_amount"
      | "total_purchase_order_price"
      | "updated_at"
    >
  >
): PurchaseOrderRegisterRow[] {
  return rows.map(normalizePurchaseOrderRegisterRow);
}

export function normalizePurchaseOrderLineItemRow(
  row: Database["public"]["Tables"]["project_purchase_order_line_items"]["Row"]
): PurchaseOrderLineItemPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    purchaseOrderId: row.purchase_order_id,
    lineUid: row.line_uid,
    costItemId: row.cost_item_id,
    sourceCostItemId: row.source_cost_item_id,
    sourceTimeSheetEntryId: row.source_time_sheet_entry_id,
    section: row.section,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    rate: row.rate,
    total: row.total,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePurchaseOrderLineItemRowList(
  rows: Database["public"]["Tables"]["project_purchase_order_line_items"]["Row"][]
): PurchaseOrderLineItemPayload[] {
  return rows.map(normalizePurchaseOrderLineItemRow);
}

export function normalizePurchaseOrderAttachmentRow(
  row: Database["public"]["Tables"]["project_purchase_order_attachments"]["Row"]
): PurchaseOrderAttachmentPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    purchaseOrderId: row.purchase_order_id,
    fileKind: row.file_kind,
    fileName: row.file_name,
    storagePath: row.storage_path,
    externalUrl: row.external_url,
    notes: row.notes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePurchaseOrderAttachmentRowList(
  rows: Database["public"]["Tables"]["project_purchase_order_attachments"]["Row"][]
): PurchaseOrderAttachmentPayload[] {
  return rows.map(normalizePurchaseOrderAttachmentRow);
}

export function normalizePurchaseOrderAssignmentRow(
  row: Database["public"]["Tables"]["project_purchase_order_assignments"]["Row"]
): PurchaseOrderAssignmentPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    purchaseOrderId: row.purchase_order_id,
    organizationMemberId: row.organization_member_id,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePurchaseOrderAssignmentRowList(
  rows: Database["public"]["Tables"]["project_purchase_order_assignments"]["Row"][]
): PurchaseOrderAssignmentPayload[] {
  return rows.map(normalizePurchaseOrderAssignmentRow);
}

export function normalizePurchaseOrderInvoiceMatchRow(
  row: Database["public"]["Tables"]["supplier_invoice_purchase_order_matches"]["Row"]
): PurchaseOrderInvoiceMatchPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    supplierInvoiceId: row.supplier_invoice_id,
    purchaseOrderId: row.purchase_order_id,
    matchedAmount: row.matched_amount,
    matchStatus: row.match_status,
    confidenceScore: row.confidence_score,
    matchBasis: row.match_basis,
    approvalStatus: row.approval_status,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
    approvalNotes: row.approval_notes,
    approvalChecksJson: row.approval_checks_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePurchaseOrderInvoiceMatchRowList(
  rows: Database["public"]["Tables"]["supplier_invoice_purchase_order_matches"]["Row"][]
): PurchaseOrderInvoiceMatchPayload[] {
  return rows.map(normalizePurchaseOrderInvoiceMatchRow);
}

export function normalizePurchaseOrderSummaryRow(
  row:
    | Database["public"]["Functions"]["get_project_purchase_order_summary"]["Returns"][number]
    | null
    | undefined
): PurchaseOrderSummaryPayload {
  return {
    totalValue: asNumber(row?.total_value),
    draftCount: asNumber(row?.draft_count),
    awaitingClientCount: asNumber(row?.awaiting_client_count),
    approvedCount: asNumber(row?.approved_count),
    invoiceReadyCount: asNumber(row?.invoice_ready_count),
  };
}

export function normalizeCreatePurchaseOrderDraftResult(
  row:
    | Database["public"]["Functions"]["create_project_purchase_order_draft"]["Returns"][number]
    | null
    | undefined
): CreatePurchaseOrderDraftResult {
  if (!row?.id) {
    throw new Error("Purchase order draft was created but no identifier was returned.");
  }

  return {
    id: row.id,
    updatedAt: asString(row.updated_at),
    purchaseOrderNumber: asString(row.purchase_order_number),
    purchaseOrderTitle: asString(row.purchase_order_title),
    status: asString(row.status),
    origin: asString(row.origin),
  };
}

export function normalizeSavePurchaseOrderDraftResult(
  row:
    | Database["public"]["Functions"]["save_project_purchase_order_draft"]["Returns"][number]
    | null
    | undefined
): SavePurchaseOrderDraftResult {
  if (!row?.id) {
    throw new Error("Purchase order was saved but no identifier was returned.");
  }

  return {
    id: row.id,
    updatedAt: asString(row.updated_at),
    subtotal: asNumber(row.subtotal),
    gstTotal: asNumber(row.gst_total),
    totalPurchaseOrderPrice: asNumber(row.total_purchase_order_price),
    status: asString(row.status),
  };
}

export function normalizeUpdatePurchaseOrderStatusResult(
  row:
    | {
        id: string | null;
        status: string | null;
        updated_at: string | null;
      }
    | null
    | undefined
): UpdatePurchaseOrderStatusResult {
  if (!row?.id) {
    throw new Error("Purchase order status was updated but no identifier was returned.");
  }

  return {
    id: row.id,
    status: asString(row.status),
    updatedAt: asString(row.updated_at),
  };
}

export function normalizeWorkerAssignedPurchaseOrderRow(
  row: Database["public"]["Functions"]["list_worker_assigned_purchase_orders"]["Returns"][number]
): WorkerAssignedPurchaseOrderPayload {
  return {
    id: row.id,
    purchaseOrderNumber: row.purchase_order_number,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function normalizeWorkerAssignedPurchaseOrderRowList(
  rows: Database["public"]["Functions"]["list_worker_assigned_purchase_orders"]["Returns"]
): WorkerAssignedPurchaseOrderPayload[] {
  return rows.map(normalizeWorkerAssignedPurchaseOrderRow);
}

export function normalizeProjectMemberRow(
  row: Database["public"]["Functions"]["list_project_members"]["Returns"][number]
): ProjectMemberPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    organizationMemberId: row.organization_member_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    role: row.role,
    userId: row.user_id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
  };
}

export function normalizeProjectMemberRowList(
  rows: Database["public"]["Functions"]["list_project_members"]["Returns"]
): ProjectMemberPayload[] {
  return rows.map(normalizeProjectMemberRow);
}

export function normalizePurchaseOrderDetail(
  purchaseOrderRow: Database["public"]["Tables"]["project_purchase_orders"]["Row"] | null,
  lineRows: Database["public"]["Tables"]["project_purchase_order_line_items"]["Row"][],
  attachmentRows: Database["public"]["Tables"]["project_purchase_order_attachments"]["Row"][]
): PurchaseOrderDetailPayload {
  return {
    purchaseOrder: purchaseOrderRow ? normalizePurchaseOrderRow(purchaseOrderRow) : null,
    lineItems: normalizePurchaseOrderLineItemRowList(lineRows),
    attachments: normalizePurchaseOrderAttachmentRowList(attachmentRows),
  };
}

export function normalizePurchaseOrderSourceCostItemOptions(input: {
  costItems: CostItemSourceRow[];
  quotes: QuoteRow[];
  variations: VariationRow[];
}): PurchaseOrderSourceCostItemOption[] {
  const quotesById = new Map(input.quotes.map((row) => [row.id, row]));
  const variationsById = new Map(input.variations.map((row) => [row.id, row]));

  return input.costItems
    .filter(
      (row): row is CostItemSourceRow & { source_document_kind: "project_quote" | "project_variation"; source_document_id: string } =>
        (row.source_document_kind === "project_quote" || row.source_document_kind === "project_variation")
        && typeof row.source_document_id === "string"
    )
    .map((row) => {
      if (row.source_document_kind === "project_quote") {
        const quote = quotesById.get(row.source_document_id);
        return {
          id: row.id,
          documentKind: "project_quote" as const,
          documentId: row.source_document_id,
          documentNumber: asString(quote?.quote_number, "Quote"),
          documentTitle: asString(quote?.quote_title),
          section: asString(row.section),
          description: asString(row.description),
          quantity: asNumber(row.quantity),
          unit: asString(row.unit),
          unitRate: asNumber(row.unit_rate),
          sortOrder: asNumber(row.sort_order),
        };
      }

      const variation = variationsById.get(row.source_document_id);
      return {
        id: row.id,
        documentKind: "project_variation" as const,
        documentId: row.source_document_id,
        documentNumber: asString(variation?.variation_number, "Variation"),
        documentTitle: asString(variation?.variation_title),
        section: asString(row.section),
        description: asString(row.description),
        quantity: asNumber(row.quantity),
        unit: asString(row.unit),
        unitRate: asNumber(row.unit_rate),
        sortOrder: asNumber(row.sort_order),
      };
    });
}
