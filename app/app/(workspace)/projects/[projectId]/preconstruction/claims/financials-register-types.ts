import type { AccountingIdentityPresentation } from "@/lib/accounting/accounting-identity-presentation";
import type {
  RetentionClaimRegisterRow,
  RetentionRegisterReadModel,
} from "@/lib/retention/phase7-retention-workspace";

export type PaymentClaimRegisterStatus =
  | "Draft"
  | "Submitted"
  | "Unpaid"
  | "Paid"
  | "Overdue"
  | "Cancelled";

export type PaymentClaimRegisterType = "Progress" | "Deposit" | "Final";

export type PaymentClaimRegisterRow = {
  id: string;
  claim_number: string;
  claim_title: string;
  claim_type: PaymentClaimRegisterType;
  status: PaymentClaimRegisterStatus;
  claim_date: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  percent_complete: number | null;
  claim_amount: number | null;
  paid_amount: number | null;
  retention_percent: number | null;
  retention_withheld_amount: number | null;
  retention_released_amount: number | null;
  retention_held_to_date: number | null;
  retention_released_to_date: number | null;
  retention_balance: number | null;
  net_claim_excl_gst: number | null;
  gst_amount: number | null;
  total_payable: number | null;
  linked_quote_value: number | null;
  linked_approved_variations: number | null;
  revised_contract_value: number | null;
  previous_claims_total: number | null;
  updated_at: string;
};

export type PaymentClaimRegisterQuote = {
  id: string;
  status: string;
  subtotal: number | null;
  margin_percent: number | null;
  discount_amount: number | null;
  contingency_amount: number | null;
  updated_at: string;
};

export type PaymentClaimRegisterVariation = {
  id: string;
  status: string;
  subtotal: number | null;
  margin_percent: number | null;
  discount_amount: number | null;
  contingency_amount: number | null;
};

export type PaymentClaimRegisterIdentity = {
  claimId: string;
  identity: AccountingIdentityPresentation;
  statusLabel: string;
};

export type PaymentClaimRegisterSnapshot = {
  organizationId: string;
  projectId: string;
  projectSlug: string;
  claims: PaymentClaimRegisterRow[];
  quotes: PaymentClaimRegisterQuote[];
  approvedVariationsValue: number;
  accountingIdentities: Record<string, PaymentClaimRegisterIdentity>;
  loadedAt: string;
};

export type RetentionRegisterSnapshot = {
  register: RetentionRegisterReadModel;
  claimRows: RetentionClaimRegisterRow[];
  xeroVisible: boolean;
  masterAccounting: {
    pushedSubtotal: number;
    pushedTax: number;
    pushedTotal: number;
    externalInvoiceId: string | null;
    externalInvoiceNumber: string | null;
  } | null;
  loadedAt: string;
};

export type FinancialsRegisterSnapshotResult<T> = {
  snapshot: T | null;
  error: string | null;
  durationMs: number;
};
