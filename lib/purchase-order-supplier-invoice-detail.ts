import type {
  PurchaseOrderAccountsApprovalStatus,
  PurchaseOrderAllocationTaxBasis,
  PurchaseOrderInvoiceXeroStatus,
  PurchaseOrderSiteReviewStatus,
} from "@/lib/purchase-order-supplier-invoice-summary";

export type PurchaseOrderSupplierInvoiceAllocationDetail = {
  allocationId: string;
  invoiceLineId: string;
  invoiceLineDescription: string;
  invoiceQuantity: number;
  invoiceUnitRate: number;
  invoiceLineAmount: number;
  purchaseOrderLineDescription: string;
  allocatedQuantity: number | null;
  allocatedAmount: number;
  previouslyApprovedQuantity: number;
  previouslyApprovedValue: number;
  currentApprovedQuantity: number;
  currentApprovedValue: number;
  remainingQuantity: number;
  remainingValue: number;
  taxBasis: PurchaseOrderAllocationTaxBasis;
  varianceLabels: string[];
  teamReview: {
    status: "waiting" | "approved" | "declined";
    reviewerName: string | null;
    reviewedAt: string | null;
    comment: string | null;
    acceptedVariances: string[];
  };
};

export type PurchaseOrderSupplierInvoiceDetail = {
  supplierInvoiceId: string;
  invoiceNumber: string;
  supplierName: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  supplierPoReference: string | null;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  capturedAt: string;
  source: string;
  projectName: string;
  purchaseOrderNumber: string;
  purchaseOrderTitle: string;
  poAllocatedAmount: number;
  allocationTaxBasis: PurchaseOrderAllocationTaxBasis;
  allocatedToOtherPurchaseOrders: boolean;
  allocations: PurchaseOrderSupplierInvoiceAllocationDetail[];
  siteReview: {
    status: PurchaseOrderSiteReviewStatus;
    submissionVersion: number | null;
    submittedAt: string | null;
    reviewerName: string | null;
    reviewedAt: string | null;
    note: string | null;
    acceptedVariances: string[];
    invalidationReason: string | null;
  };
  accountsApproval: {
    status: PurchaseOrderAccountsApprovalStatus;
    approverName: string | null;
    approvedAt: string | null;
    note: string | null;
    current: boolean;
    invalidationReason: string | null;
  };
  xero: {
    status: PurchaseOrderInvoiceXeroStatus;
    billReference: string | null;
    amountPaid: number | null;
    amountDue: number | null;
    fullyPaidAt: string | null;
    lastStatusSyncedAt: string | null;
    safeRefreshWarning: string | null;
  };
  documents: Array<{
    id: string;
    fileName: string;
    documentType: string;
    mimeType: string | null;
    uploadedAt: string;
    openUrl: string | null;
  }>;
  activity: Array<{
    id: string;
    eventType: string;
    message: string;
    occurredAt: string;
    actorName: string | null;
  }>;
  canReview: boolean;
  canPerformAccountsActions: boolean;
  fullInvoiceHref: string;
};
