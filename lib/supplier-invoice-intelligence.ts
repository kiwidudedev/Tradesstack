import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

type SupplierInvoiceIntelligenceEventType =
  | "supplier_invoice_created"
  | "supplier_invoice_match_suggested"
  | "supplier_invoice_match_confirmed"
  | "supplier_invoice_match_rejected"
  | "supplier_invoice_allocation_suggested"
  | "supplier_invoice_allocation_approved"
  | "supplier_invoice_allocation_corrected"
  | "supplier_invoice_approval_requested"
  | "supplier_invoice_approved"
  | "supplier_invoice_rejected"
  | "supplier_invoice_actual_cost_posted"
  | "supplier_invoice_actual_cost_reversed"
  | "ai_supplier_invoice_match_accepted"
  | "ai_supplier_invoice_match_rejected"
  | "ai_supplier_invoice_match_edited";

type SupplierInvoiceEventFamily =
  | "ai_interaction"
  | "validation"
  | "correction"
  | "approval"
  | "commercial_action"
  | "lineage"
  | "file_lifecycle";

type SupplierInvoiceAction =
  | "created"
  | "suggested"
  | "confirmed"
  | "rejected"
  | "approved"
  | "corrected"
  | "requested"
  | "posted"
  | "reversed"
  | "accepted"
  | "edited";

export type SupplierInvoiceIntelligenceEventInput = {
  organizationId: string;
  projectId?: string | null;
  module: "supplier_invoices";
  eventFamily: SupplierInvoiceEventFamily;
  eventType: SupplierInvoiceIntelligenceEventType;
  action: SupplierInvoiceAction;
  entityType:
    | "supplier_invoice"
    | "supplier_invoice_purchase_order_match"
    | "supplier_invoice_line_allocation"
    | "project_actual_cost_event";
  entityId: string;
  occurredAt?: string;
  beforeData?: Record<string, Json | null> | null;
  afterData?: Record<string, Json | null> | null;
  diffData?: Record<string, Json | null>;
  metadata?: Record<string, Json>;
  reason?: string | null;
};

export type SupplierInvoiceAiInteractionInput = {
  organizationId: string;
  projectId?: string | null;
  subjectEntityType: "supplier_invoice_purchase_order_match" | "supplier_invoice_line_allocation";
  subjectEntityId: string;
  confidence?: number | null;
  humanDisposition: "accepted" | "rejected" | "edited";
  humanFeedbackSummary?: string | null;
  outputStructured?: Json | null;
  editedOutput?: Json | null;
  linkedEventId?: string | null;
  provider?: string | null;
  model?: string | null;
};

export type SupplierInvoiceCorrectionEventInput = {
  organizationId: string;
  projectId?: string | null;
  targetEntityType: "supplier_invoice_purchase_order_match" | "supplier_invoice_line_allocation";
  targetEntityId: string;
  correctionType: "allocation_fix" | "manual_override";
  correctedFieldName?: string | null;
  incorrectValue?: Json | null;
  correctedValue?: Json | null;
  correctionReason?: string | null;
  feedbackLabel?: string | null;
  linkedEventId?: string | null;
  linkedAiInteractionId?: string | null;
  isTrainingEligible?: boolean;
};

export type SupplierInvoiceValidationCaseInput = {
  organizationId: string;
  projectId?: string | null;
  scopeEntityType: "supplier_invoice" | "supplier_invoice_purchase_order_match" | "supplier_invoice_line_allocation";
  scopeEntityId: string;
  linkedEventId?: string | null;
  expectedValue?: Json | null;
  observedValue?: Json | null;
  details?: Record<string, Json>;
  ruleKey: string;
  result?: "failed" | "warning";
  approvalNote?: string | null;
};

export function summarizeSupplierInvoiceHeader(input: {
  supplierId?: string | null;
  source?: string | null;
  status?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  total?: number | null;
  hasDocument?: boolean;
}) {
  return {
    supplierId: input.supplierId ?? null,
    source: input.source ?? null,
    status: input.status ?? null,
    invoiceNumberPresent: Boolean(input.invoiceNumber && input.invoiceNumber.trim().length > 0),
    invoiceDate: input.invoiceDate ?? null,
    dueDate: input.dueDate ?? null,
    total: typeof input.total === "number" ? input.total : null,
    hasDocument: input.hasDocument ?? false,
  };
}

export function summarizeSupplierInvoiceMatch(input: {
  supplierInvoiceId: string;
  purchaseOrderId: string;
  matchedAmount?: number | null;
  matchStatus?: string | null;
  approvalStatus?: string | null;
  matchBasis?: string | null;
  confidenceScore?: number | null;
}) {
  return {
    supplierInvoiceId: input.supplierInvoiceId,
    purchaseOrderId: input.purchaseOrderId,
    matchedAmount: typeof input.matchedAmount === "number" ? input.matchedAmount : null,
    matchStatus: input.matchStatus ?? null,
    approvalStatus: input.approvalStatus ?? null,
    matchBasis: input.matchBasis ?? null,
    confidenceScore: typeof input.confidenceScore === "number" ? input.confidenceScore : null,
  };
}

export function summarizeSupplierInvoiceAllocation(input: {
  supplierInvoiceId: string;
  supplierInvoiceLineId: string;
  purchaseOrderId?: string | null;
  purchaseOrderLineItemId?: string | null;
  projectId?: string | null;
  allocatedAmount?: number | null;
  allocationStatus?: string | null;
  reviewStatus?: string | null;
  approvalStatus?: string | null;
  accountingResolutionStatus?: string | null;
  organizationCostCodeId?: string | null;
  aiConfidenceScore?: number | null;
  aiSuggestedPurchaseOrderLineItemId?: string | null;
}) {
  return {
    supplierInvoiceId: input.supplierInvoiceId,
    supplierInvoiceLineId: input.supplierInvoiceLineId,
    purchaseOrderId: input.purchaseOrderId ?? null,
    purchaseOrderLineItemId: input.purchaseOrderLineItemId ?? null,
    projectId: input.projectId ?? null,
    allocatedAmount: typeof input.allocatedAmount === "number" ? input.allocatedAmount : null,
    allocationStatus: input.allocationStatus ?? null,
    reviewStatus: input.reviewStatus ?? null,
    approvalStatus: input.approvalStatus ?? null,
    accountingResolutionStatus: input.accountingResolutionStatus ?? null,
    organizationCostCodeId: input.organizationCostCodeId ?? null,
    aiConfidenceScore: typeof input.aiConfidenceScore === "number" ? input.aiConfidenceScore : null,
    aiSuggestedPurchaseOrderLineItemId: input.aiSuggestedPurchaseOrderLineItemId ?? null,
  };
}

export function summarizeSupplierInvoiceActualCostEvent(input: {
  supplierInvoiceId: string;
  allocationId?: string | null;
  projectId?: string | null;
  totalAmount?: number | null;
  eventType?: string | null;
  eventStatus?: string | null;
  reversesEventId?: string | null;
}) {
  return {
    supplierInvoiceId: input.supplierInvoiceId,
    allocationId: input.allocationId ?? null,
    projectId: input.projectId ?? null,
    totalAmount: typeof input.totalAmount === "number" ? input.totalAmount : null,
    eventType: input.eventType ?? null,
    eventStatus: input.eventStatus ?? null,
    reversesEventId: input.reversesEventId ?? null,
  };
}

export function buildSupplierInvoiceIntelligenceEvent(
  params: SupplierInvoiceIntelligenceEventInput
) {
  return {
    organizationId: params.organizationId,
    projectId: params.projectId ?? null,
    module: params.module,
    eventFamily: params.eventFamily,
    eventType: params.eventType,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    beforeData: params.beforeData ?? null,
    afterData: params.afterData ?? null,
    diffData: params.diffData ?? {},
    metadata: params.metadata ?? {},
    reason: params.reason ?? null,
    privacyClassification: "financial_sensitive",
    visibilityScope: "organization",
    containsFinancialData: true,
    containsPersonalData: false,
    containsAttachmentContent: false,
    occurredAt: params.occurredAt,
  };
}

export async function writeSupplierInvoiceIntelligenceEvent(
  supabase: AppSupabaseClient,
  event: ReturnType<typeof buildSupplierInvoiceIntelligenceEvent>
) {
  const { data, error } = await supabase.rpc("write_intelligence_event" as never, {
    p_input: event,
  } as never);
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}

export async function writeSupplierInvoiceIntelligenceEvents(
  supabase: AppSupabaseClient,
  events: Array<ReturnType<typeof buildSupplierInvoiceIntelligenceEvent>>
) {
  const { error } = await supabase.rpc("write_intelligence_events" as never, {
    p_events: events,
  } as never);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createSupplierInvoiceAiInteraction(
  supabase: AppSupabaseClient,
  input: SupplierInvoiceAiInteractionInput
) {
  const { data, error } = await supabase.rpc("create_ai_interaction" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      module: "supplier_invoices",
      interactionType: "matching",
      subjectEntityType: input.subjectEntityType,
      subjectEntityId: input.subjectEntityId,
      provider: input.provider ?? "tradesstack",
      model: input.model ?? "supplier-invoice-suggestion",
      confidence: input.confidence ?? null,
      outputStructured: input.outputStructured ?? null,
      humanDisposition: input.humanDisposition,
      humanFeedbackSummary: input.humanFeedbackSummary ?? null,
      editedOutput: input.editedOutput ?? null,
      linkedEventId: input.linkedEventId ?? null,
      privacyClassification: "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}

export async function writeSupplierInvoiceCorrectionEvent(
  supabase: AppSupabaseClient,
  input: SupplierInvoiceCorrectionEventInput
) {
  const { data, error } = await supabase.rpc("write_correction_event" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      module: "supplier_invoices",
      correctionType: input.correctionType,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      linkedEventId: input.linkedEventId ?? null,
      linkedAiInteractionId: input.linkedAiInteractionId ?? null,
      correctedFieldName: input.correctedFieldName ?? null,
      incorrectValue: input.incorrectValue ?? null,
      correctedValue: input.correctedValue ?? null,
      correctionReason: input.correctionReason ?? null,
      feedbackLabel: input.feedbackLabel ?? null,
      isTrainingEligible: input.isTrainingEligible ?? true,
      privacyClassification: "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}

export async function createSupplierInvoiceValidationCase(
  supabase: AppSupabaseClient,
  input: SupplierInvoiceValidationCaseInput
) {
  const { data, error } = await supabase.rpc("create_validation_case" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      module: "supplier_invoices",
      scopeEntityType: input.scopeEntityType,
      scopeEntityId: input.scopeEntityId,
      linkedEventId: input.linkedEventId ?? null,
      ruleKey: input.ruleKey,
      ruleVersion: "v1",
      validationType: "workflow_gate",
      severity: "warning",
      result: input.result ?? "warning",
      expectedValue: input.expectedValue ?? null,
      observedValue: input.observedValue ?? null,
      details: input.details ?? {},
      requiresApproval: false,
      approvalStatus: "not_required",
      approvalNote: input.approvalNote ?? null,
      privacyClassification: "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}

export function hasAiSupplierInvoiceMatchSuggestion(input: {
  confidenceScore?: number | null;
  matchBasis?: string | null;
  confidence_score?: number | null;
  match_basis?: string | null;
}) {
  return (
    typeof input.confidenceScore === "number" ||
    (input.matchBasis ?? "") !== "manual" ||
    typeof input.confidence_score === "number" ||
    (input.match_basis ?? "") !== "manual"
  );
}

export function hasAiSupplierInvoiceAllocationSuggestion(input: {
  aiSuggestedPurchaseOrderLineItemId?: string | null;
  aiConfidenceScore?: number | null;
  ai_suggested_purchase_order_line_item_id?: string | null;
  ai_confidence_score?: number | null;
}) {
  return (
    Boolean(input.aiSuggestedPurchaseOrderLineItemId) ||
    typeof input.aiConfidenceScore === "number" ||
    Boolean(input.ai_suggested_purchase_order_line_item_id) ||
    typeof input.ai_confidence_score === "number"
  );
}

export function logSupplierInvoiceIntelligenceFailure(action: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.warn("[supplier-invoice-intelligence] write failed", {
    action,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}
