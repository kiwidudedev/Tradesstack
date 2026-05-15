import type { Database } from "@/lib/supabase/types";
import {
  normalizeCreatePurchaseOrderDraftResult,
  normalizeProjectMemberRowList,
  normalizePurchaseOrderAssignmentRow,
  normalizePurchaseOrderAssignmentRowList,
  normalizePurchaseOrderAttachmentRowList,
  normalizePurchaseOrderDetail,
  normalizePurchaseOrderInvoiceMatchRowList,
  normalizePurchaseOrderLineItemRowList,
  normalizePurchaseOrderRegisterRowList,
  normalizePurchaseOrderRow,
  normalizePurchaseOrderSourceCostItemOptions,
  normalizePurchaseOrderSummaryRow,
  normalizeSavePurchaseOrderDraftResult,
  normalizeUpdatePurchaseOrderStatusResult,
  normalizeWorkerAssignedPurchaseOrderRowList,
} from "@/lib/purchase-orders/normalization";
import type {
  AddPurchaseOrderAssignmentInput,
  CreatePurchaseOrderDraftInput,
  CreatePurchaseOrderDraftResult,
  GetProjectPurchaseOrderSummaryInput,
  GetPurchaseOrderDetailInput,
  GetPurchaseOrderInput,
  ListOrganizationSuppliersInput,
  ListProjectMembersInput,
  ListPurchaseOrderAssignmentsInput,
  ListPurchaseOrderAttachmentsInput,
  ListPurchaseOrderInvoiceMatchesInput,
  ListPurchaseOrderLineItemsInput,
  ListPurchaseOrdersInput,
  ListPurchaseOrderSourceCostItemOptionsInput,
  ListWorkerAssignedPurchaseOrdersInput,
  OrganizationSupplierRow,
  ProjectMemberPayload,
  PurchaseOrderAssignmentPayload,
  PurchaseOrderAttachmentPayload,
  PurchaseOrderClient,
  PurchaseOrderDetailPayload,
  PurchaseOrderInvoiceMatchPayload,
  PurchaseOrderLineItemPayload,
  PurchaseOrderPayload,
  PurchaseOrderRegisterRow,
  PurchaseOrderSummaryPayload,
  PurchaseOrderSourceCostItemOption,
  RemovePurchaseOrderAssignmentInput,
  SavePurchaseOrderDraftInput,
  SavePurchaseOrderDraftResult,
  UpdatePurchaseOrderStatusInput,
  UpdatePurchaseOrderStatusResult,
  WorkerAssignedPurchaseOrderPayload,
} from "@/lib/purchase-orders/types";

async function unwrapRpcRow<T>(
  request: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data[0] ?? null) : null;
}

async function unwrapRpcRows<T>(
  request: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data : [];
}

async function unwrapQueryRows<T>(
  request: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function unwrapMaybeSingle<T>(
  request: PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<T | null> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

type UpdatePurchaseOrderStatusRpcRow = {
  id: string | null;
  status: string | null;
  updated_at: string | null;
};

export async function createPurchaseOrderDraft(
  client: PurchaseOrderClient,
  input: CreatePurchaseOrderDraftInput
): Promise<CreatePurchaseOrderDraftResult> {
  const row = await unwrapRpcRow(
    client.rpc("create_project_purchase_order_draft", {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_title: input.title,
      p_origin: input.origin,
    })
  );

  return normalizeCreatePurchaseOrderDraftResult(row);
}

export async function savePurchaseOrderDraft(
  client: PurchaseOrderClient,
  input: SavePurchaseOrderDraftInput
): Promise<SavePurchaseOrderDraftResult> {
  const rpcArgs = {
    p_organization_id: input.organizationId,
    p_project_id: input.projectId,
    p_purchase_order_id: input.purchaseOrderId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_purchase_order_title: input.purchaseOrderTitle,
    p_purchase_order_number: input.purchaseOrderNumber,
    p_status: input.status,
    p_origin: input.origin,
    p_supplier_id: input.supplierId ?? null,
    p_issued_to_label: input.issuedToLabel,
    p_supplier_contact: input.supplierContact,
    p_supplier_name_snapshot: input.supplierNameSnapshot,
    p_supplier_email_snapshot: input.supplierEmailSnapshot,
    p_supplier_phone_snapshot: input.supplierPhoneSnapshot,
    p_requested_by: input.requestedBy,
    p_requested_date: input.requestedDate ?? null,
    p_due_date: input.dueDate ?? null,
    p_sent_to_client_at: input.sentToClientAt ?? null,
    p_approved_at: input.approvedAt ?? null,
    p_invoice_ready: input.invoiceReady,
    p_notes: input.notes,
    p_margin_percent: input.marginPercent,
    p_discount_amount: input.discountAmount,
    p_contingency_amount: input.contingencyAmount,
    p_gst_percent: input.gstPercent,
    p_include_margin_in_export: input.includeMarginInExport,
    p_include_discount_in_export: input.includeDiscountInExport,
    p_include_contingency_in_export: input.includeContingencyInExport,
    p_line_items: input.lineItems.map((line) => ({
      id: line.id,
      line_uid: line.lineUid ?? null,
      cost_item_id: line.costItemId ?? null,
      source_cost_item_id: line.sourceCostItemId ?? null,
      section: line.section,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      source_time_sheet_entry_id: line.sourceTimeSheetEntryId ?? null,
    })),
    p_attachments: input.attachments.map((attachment) => ({
      id: attachment.id ?? null,
      name: attachment.name,
      type: attachment.type,
      storagePath: attachment.storagePath ?? null,
      externalUrl: attachment.externalUrl ?? null,
      notes: attachment.notes ?? "",
    })),
  } as unknown as Database["public"]["Functions"]["save_project_purchase_order_draft"]["Args"];

  const row = await unwrapRpcRow(
    client.rpc("save_project_purchase_order_draft", rpcArgs)
  );

  return normalizeSavePurchaseOrderDraftResult(row);
}

export async function getProjectPurchaseOrderSummary(
  client: PurchaseOrderClient,
  input: GetProjectPurchaseOrderSummaryInput
): Promise<PurchaseOrderSummaryPayload> {
  const row = await unwrapRpcRow(
    client.rpc("get_project_purchase_order_summary", {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
    })
  );

  return normalizePurchaseOrderSummaryRow(row);
}

export async function updatePurchaseOrderStatus(
  client: PurchaseOrderClient,
  input: UpdatePurchaseOrderStatusInput
): Promise<UpdatePurchaseOrderStatusResult> {
  const row = await unwrapRpcRow(
    (client.rpc(
      "update_purchase_order_status",
      {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_purchase_order_id: input.purchaseOrderId,
      p_status: input.status,
      }
    ) as unknown as PromiseLike<{
      data: UpdatePurchaseOrderStatusRpcRow[] | null;
      error: { message: string } | null;
    }>)
  );

  return normalizeUpdatePurchaseOrderStatusResult(row);
}

export async function listPurchaseOrders(
  client: PurchaseOrderClient,
  input: ListPurchaseOrdersInput
): Promise<PurchaseOrderRegisterRow[]> {
  const rows = await unwrapQueryRows(
    client
      .from("project_purchase_orders")
      .select(
        "id, purchase_order_number, purchase_order_title, issued_to_label, status, requested_date, due_date, subtotal, margin_percent, discount_amount, contingency_amount, total_purchase_order_price, updated_at"
      )
      .eq("organization_id", input.organizationId)
      .eq("project_id", input.projectId)
      .order("updated_at", { ascending: false })
  );

  return normalizePurchaseOrderRegisterRowList(rows);
}

export async function getPurchaseOrder(
  client: PurchaseOrderClient,
  input: GetPurchaseOrderInput
): Promise<PurchaseOrderPayload | null> {
  const row = await unwrapMaybeSingle(
    client
      .from("project_purchase_orders")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("id", input.purchaseOrderId)
      .maybeSingle()
  );

  return row ? normalizePurchaseOrderRow(row) : null;
}

export async function listPurchaseOrderLineItems(
  client: PurchaseOrderClient,
  input: ListPurchaseOrderLineItemsInput
): Promise<PurchaseOrderLineItemPayload[]> {
  const rows = await unwrapQueryRows(
    client
      .from("project_purchase_order_line_items")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("purchase_order_id", input.purchaseOrderId)
      .order("sort_order", { ascending: true })
  );

  return normalizePurchaseOrderLineItemRowList(rows);
}

export async function listPurchaseOrderAttachments(
  client: PurchaseOrderClient,
  input: ListPurchaseOrderAttachmentsInput
): Promise<PurchaseOrderAttachmentPayload[]> {
  const rows = await unwrapQueryRows(
    client
      .from("project_purchase_order_attachments")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("purchase_order_id", input.purchaseOrderId)
      .order("created_at", { ascending: true })
  );

  return normalizePurchaseOrderAttachmentRowList(rows);
}

export async function getPurchaseOrderDetail(
  client: PurchaseOrderClient,
  input: GetPurchaseOrderDetailInput
): Promise<PurchaseOrderDetailPayload> {
  const [purchaseOrderRow, lineRows, attachmentRows] = await Promise.all([
    unwrapMaybeSingle(
      client
        .from("project_purchase_orders")
        .select("*")
        .eq("organization_id", input.organizationId)
        .eq("id", input.purchaseOrderId)
        .maybeSingle()
    ),
    unwrapQueryRows(
      client
        .from("project_purchase_order_line_items")
        .select("*")
        .eq("organization_id", input.organizationId)
        .eq("purchase_order_id", input.purchaseOrderId)
        .order("sort_order", { ascending: true })
    ),
    unwrapQueryRows(
      client
        .from("project_purchase_order_attachments")
        .select("*")
        .eq("organization_id", input.organizationId)
        .eq("purchase_order_id", input.purchaseOrderId)
        .order("created_at", { ascending: true })
    ),
  ]);

  return normalizePurchaseOrderDetail(purchaseOrderRow, lineRows, attachmentRows);
}

export async function listPurchaseOrderInvoiceMatches(
  client: PurchaseOrderClient,
  input: ListPurchaseOrderInvoiceMatchesInput
): Promise<PurchaseOrderInvoiceMatchPayload[]> {
  const rows = await unwrapQueryRows(
    client
      .from("supplier_invoice_purchase_order_matches")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("purchase_order_id", input.purchaseOrderId)
      .order("created_at", { ascending: true })
  );

  return normalizePurchaseOrderInvoiceMatchRowList(rows);
}

export async function listPurchaseOrderAssignments(
  client: PurchaseOrderClient,
  input: ListPurchaseOrderAssignmentsInput
): Promise<PurchaseOrderAssignmentPayload[]> {
  const rows = await unwrapRpcRows(
    client.rpc("list_purchase_order_assignments", {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_purchase_order_id: input.purchaseOrderId,
    })
  );

  return normalizePurchaseOrderAssignmentRowList(rows);
}

export async function addPurchaseOrderAssignment(
  client: PurchaseOrderClient,
  input: AddPurchaseOrderAssignmentInput
): Promise<PurchaseOrderAssignmentPayload> {
  const { data, error } = await client.rpc("add_purchase_order_assignment", {
    p_organization_id: input.organizationId,
    p_project_id: input.projectId,
    p_purchase_order_id: input.purchaseOrderId,
    p_organization_member_id: input.organizationMemberId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizePurchaseOrderAssignmentRow(data);
}

export async function removePurchaseOrderAssignment(
  client: PurchaseOrderClient,
  input: RemovePurchaseOrderAssignmentInput
): Promise<void> {
  const { error } = await client.rpc("remove_purchase_order_assignment", {
    p_organization_id: input.organizationId,
    p_project_id: input.projectId,
    p_purchase_order_id: input.purchaseOrderId,
    p_organization_member_id: input.organizationMemberId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function listWorkerAssignedPurchaseOrders(
  client: PurchaseOrderClient,
  input: ListWorkerAssignedPurchaseOrdersInput
): Promise<WorkerAssignedPurchaseOrderPayload[]> {
  const rows = await unwrapRpcRows(
    client.rpc("list_worker_assigned_purchase_orders", {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_organization_member_id: input.organizationMemberId,
    })
  );

  return normalizeWorkerAssignedPurchaseOrderRowList(rows);
}

export async function listProjectMembers(
  client: PurchaseOrderClient,
  input: ListProjectMembersInput
): Promise<ProjectMemberPayload[]> {
  const rows = await unwrapRpcRows(
    client.rpc("list_project_members", {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
    })
  );

  return normalizeProjectMemberRowList(rows);
}

export async function listOrganizationSuppliers(
  client: PurchaseOrderClient,
  input: ListOrganizationSuppliersInput
): Promise<OrganizationSupplierRow[]> {
  return unwrapQueryRows(
    client
      .from("organization_suppliers")
      .select("*")
      .eq("organization_id", input.organizationId)
      .order("company_name", { ascending: true })
      .order("name", { ascending: true })
  );
}

export async function listPurchaseOrderSourceCostItemOptions(
  client: PurchaseOrderClient,
  input: ListPurchaseOrderSourceCostItemOptionsInput
): Promise<PurchaseOrderSourceCostItemOption[]> {
  const [quoteRows, variationRows, costItemRows] = await Promise.all([
    unwrapQueryRows(
      client
        .from("project_quotes")
        .select("id, quote_number, quote_title")
        .eq("organization_id", input.organizationId)
        .eq("project_id", input.projectId)
        .order("quote_number", { ascending: true })
    ),
    unwrapQueryRows(
      client
        .from("project_variations")
        .select("id, variation_number, variation_title")
        .eq("organization_id", input.organizationId)
        .eq("project_id", input.projectId)
        .order("variation_number", { ascending: true })
    ),
    unwrapQueryRows(
      client
        .from("cost_items")
        .select("id, source_document_kind, source_document_id, section, description, quantity, unit, unit_rate, sort_order")
        .eq("organization_id", input.organizationId)
        .eq("project_id", input.projectId)
        .eq("is_current", true)
        .in("source_document_kind", ["project_quote", "project_variation"])
        .order("source_document_kind", { ascending: true })
        .order("sort_order", { ascending: true })
    ),
  ]);

  return normalizePurchaseOrderSourceCostItemOptions({
    quotes: quoteRows,
    variations: variationRows,
    costItems: costItemRows,
  });
}
