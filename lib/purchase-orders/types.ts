import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type PurchaseOrderClient = SupabaseClient<Database>;

export type PurchaseOrderStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Issued"
  | "Received"
  | "Invoiced"
  | "Cancelled";

export type PurchaseOrderOrigin =
  | "Material Supply"
  | "Subcontract Work"
  | "Plant / Equipment Hire"
  | "Site Expense"
  | "Freight / Delivery"
  | "Variation Order"
  | "General Purchase"
  | "Other";

export type PurchaseOrderCostSection = "Labour" | "Materials" | "Subcontractors" | "Plant" | "Margin";
export const PURCHASE_ORDER_SOURCE_SECTIONS = ["Labour", "Materials", "Subcontractors", "Plant"] as const;
export type PurchaseOrderSourceSection = (typeof PURCHASE_ORDER_SOURCE_SECTIONS)[number];
export type PurchaseOrderAttachmentKind = "Drawing" | "Email" | "Site Instruction" | "Other";

export type PurchaseOrderRow = Database["public"]["Tables"]["project_purchase_orders"]["Row"];
export type PurchaseOrderLineItemRow = Database["public"]["Tables"]["project_purchase_order_line_items"]["Row"];
export type PurchaseOrderAttachmentRow = Database["public"]["Tables"]["project_purchase_order_attachments"]["Row"];
export type PurchaseOrderAssignmentRow = Database["public"]["Tables"]["project_purchase_order_assignments"]["Row"];
export type SupplierInvoicePurchaseOrderMatchRow =
  Database["public"]["Tables"]["supplier_invoice_purchase_order_matches"]["Row"];
export type OrganizationSupplierRow = Database["public"]["Tables"]["organization_suppliers"]["Row"];
export type CostItemRow = Database["public"]["Tables"]["cost_items"]["Row"];

export interface PurchaseOrderRegisterRow {
  id: string;
  purchaseOrderNumber: string;
  purchaseOrderTitle: string;
  issuedToLabel: string;
  status: string;
  requestedDate: string | null;
  dueDate: string | null;
  subtotal: number;
  marginPercent: number;
  discountAmount: number;
  contingencyAmount: number;
  totalPurchaseOrderPrice: number;
  updatedAt: string;
}

export interface PurchaseOrderPayload {
  id: string;
  organizationId: string;
  projectId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  purchaseOrderTitle: string;
  purchaseOrderNumber: string;
  status: string;
  origin: string;
  supplierId: string | null;
  issuedToLabel: string;
  supplierContact: string;
  supplierNameSnapshot: string;
  supplierEmailSnapshot: string;
  supplierPhoneSnapshot: string;
  requestedBy: string;
  requestedDate: string | null;
  dueDate: string | null;
  sentToClientAt: string | null;
  approvedAt: string | null;
  invoiceReady: boolean;
  notes: string;
  labourTotal: number;
  materialsTotal: number;
  subcontractorsTotal: number;
  plantTotal: number;
  marginTotal: number;
  subtotal: number;
  marginPercent: number;
  discountAmount: number;
  contingencyAmount: number;
  gstPercent: number;
  gstTotal: number;
  totalPurchaseOrderPrice: number;
  includeMarginInExport: boolean;
  includeDiscountInExport: boolean;
  includeContingencyInExport: boolean;
}

export interface PurchaseOrderLineItemPayload {
  id: string;
  organizationId: string;
  projectId: string;
  purchaseOrderId: string;
  lineUid: string;
  costItemId: string | null;
  sourceCostItemId: string | null;
  sourceTimeSheetEntryId: string | null;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderAttachmentPayload {
  id: string;
  organizationId: string;
  projectId: string;
  purchaseOrderId: string;
  fileKind: string;
  fileName: string;
  storagePath: string | null;
  externalUrl: string | null;
  notes: string;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderAssignmentPayload {
  id: string;
  organizationId: string;
  projectId: string;
  purchaseOrderId: string;
  organizationMemberId: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderSummaryPayload {
  totalValue: number;
  draftCount: number;
  awaitingClientCount: number;
  approvedCount: number;
  invoiceReadyCount: number;
}

export interface WorkerAssignedPurchaseOrderPayload {
  id: string;
  purchaseOrderNumber: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface PurchaseOrderInvoiceMatchPayload {
  id: string;
  organizationId: string;
  supplierInvoiceId: string;
  purchaseOrderId: string;
  matchedAmount: number;
  matchStatus: string;
  confidenceScore: number | null;
  matchBasis: string;
  approvalStatus: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  approvalNotes: string;
  approvalChecksJson: SupplierInvoicePurchaseOrderMatchRow["approval_checks_json"];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderDetailPayload {
  purchaseOrder: PurchaseOrderPayload | null;
  lineItems: PurchaseOrderLineItemPayload[];
  attachments: PurchaseOrderAttachmentPayload[];
}

export interface ProjectMemberPayload {
  id: string;
  organizationId: string;
  projectId: string;
  organizationMemberId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  role: string;
  userId: string;
  displayName: string;
  avatarPath: string | null;
}

export interface PurchaseOrderSourceCostItemOption {
  id: string;
  documentKind: "project_quote" | "project_variation";
  documentId: string;
  documentNumber: string;
  documentTitle: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
  sortOrder: number;
}

export interface CreatePurchaseOrderDraftInput {
  organizationId: string;
  projectId: string;
  title?: string;
  origin?: string;
}

export interface CreatePurchaseOrderDraftResult {
  id: string;
  updatedAt: string;
  purchaseOrderNumber: string;
  purchaseOrderTitle: string;
  status: string;
  origin: string;
}

export interface PurchaseOrderSaveLineItemInput {
  id: string;
  lineUid?: string | null;
  costItemId?: string | null;
  sourceCostItemId?: string | null;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  sourceTimeSheetEntryId?: string | null;
}

export interface PurchaseOrderSaveAttachmentInput {
  id?: string | null;
  name: string;
  type: string;
  storagePath?: string | null;
  externalUrl?: string | null;
}

export interface SavePurchaseOrderDraftInput {
  organizationId: string;
  projectId: string;
  purchaseOrderId: string;
  expectedUpdatedAt: string;
  purchaseOrderTitle: string;
  purchaseOrderNumber: string;
  status: string;
  origin: string;
  supplierId?: string | null;
  issuedToLabel: string;
  supplierContact: string;
  supplierNameSnapshot: string;
  supplierEmailSnapshot: string;
  supplierPhoneSnapshot: string;
  requestedBy: string;
  requestedDate?: string | null;
  dueDate?: string | null;
  sentToClientAt?: string | null;
  approvedAt?: string | null;
  invoiceReady: boolean;
  notes: string;
  marginPercent: number;
  discountAmount: number;
  contingencyAmount: number;
  gstPercent: number;
  includeMarginInExport: boolean;
  includeDiscountInExport: boolean;
  includeContingencyInExport: boolean;
  lineItems: PurchaseOrderSaveLineItemInput[];
  attachments: PurchaseOrderSaveAttachmentInput[];
}

export interface SavePurchaseOrderDraftResult {
  id: string;
  updatedAt: string;
  subtotal: number;
  gstTotal: number;
  totalPurchaseOrderPrice: number;
  status: string;
}

export interface UpdatePurchaseOrderStatusInput {
  organizationId: string;
  projectId: string;
  purchaseOrderId: string;
  status: PurchaseOrderStatus | string;
}

export interface UpdatePurchaseOrderStatusResult {
  id: string;
  status: string;
  updatedAt: string;
}

export interface GetProjectPurchaseOrderSummaryInput {
  organizationId: string;
  projectId: string;
}

export interface ListPurchaseOrdersInput {
  organizationId: string;
  projectId: string;
}

export interface GetPurchaseOrderInput {
  organizationId: string;
  purchaseOrderId: string;
}

export interface ListPurchaseOrderLineItemsInput {
  organizationId: string;
  purchaseOrderId: string;
}

export interface ListPurchaseOrderAttachmentsInput {
  organizationId: string;
  purchaseOrderId: string;
}

export interface GetPurchaseOrderDetailInput {
  organizationId: string;
  purchaseOrderId: string;
}

export interface ListPurchaseOrderInvoiceMatchesInput {
  organizationId: string;
  purchaseOrderId: string;
}

export interface AddPurchaseOrderAssignmentInput {
  organizationId: string;
  projectId: string;
  purchaseOrderId: string;
  organizationMemberId: string;
}

export interface RemovePurchaseOrderAssignmentInput {
  organizationId: string;
  projectId: string;
  purchaseOrderId: string;
  organizationMemberId: string;
}

export interface ListPurchaseOrderAssignmentsInput {
  organizationId: string;
  projectId: string;
  purchaseOrderId: string;
}

export interface ListWorkerAssignedPurchaseOrdersInput {
  organizationId: string;
  projectId: string;
  organizationMemberId: string;
}

export interface ListProjectMembersInput {
  organizationId: string;
  projectId: string;
}

export interface ListOrganizationSuppliersInput {
  organizationId: string;
}

export interface ListPurchaseOrderSourceCostItemOptionsInput {
  organizationId: string;
  projectId: string;
}
