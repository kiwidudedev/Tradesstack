export const COMPANY_PAYMENT_CLAIMS_PERMISSION = "accounting.sales_invoices.view";
export const COMPANY_PAYMENT_CLAIMS_PAGE_SIZE = 50;

export type PaymentClaimRegisterOption = {
  value: string;
  label: string;
};

export type CompanyPaymentClaimRegisterRow = {
  id: string;
  claim_number: string;
  claim_title: string;
  claim_status: string;
  claim_date: string | null;
  period_start: string | null;
  period_end: string | null;
  internal_due_date: string | null;
  effective_due_date: string | null;
  total_payable: number;
  gst_amount: number;
  retention_withheld_amount: number;
  retention_released_amount: number;
  project_id: string;
  project_slug: string;
  project_code: string;
  project_name: string;
  client_id: string | null;
  client_name: string | null;
  accounting_document_id: string | null;
  xero_invoice_number: string | null;
  xero_invoice_id: string | null;
  currency: string;
  invoice_date: string | null;
  trusted_paid_minor: number | null;
  trusted_outstanding_minor: number | null;
  projected_at: string | null;
  divergent: boolean | null;
  xero_status: string;
  external_status: string | null;
  payment_status: string | null;
  xero_attention: boolean;
};

export type CompanyPaymentClaimsRegister = {
  rows: CompanyPaymentClaimRegisterRow[];
  metrics: {
    amountPayable: number;
    paid: number;
    outstanding: number;
    openClaims: number;
    xeroAttention: number;
  };
  pageInfo: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  options: {
    projects: PaymentClaimRegisterOption[];
    clients: PaymentClaimRegisterOption[];
    months: string[];
  };
  context: {
    month: string;
    timezone: string;
    currency: string;
    localToday: string;
  };
};

export type CompanyPaymentClaimsSearchParams = {
  month?: string;
  search?: string;
  project?: string;
  client?: string;
  claimStatus?: string;
  xeroStatus?: string;
  externalStatus?: string;
  paymentStatus?: string;
  outstanding?: string;
  overdue?: string;
  attention?: string;
  sort?: string;
  direction?: string;
  page?: string;
};

