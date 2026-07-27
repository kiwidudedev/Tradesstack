import type { RetentionOwnershipResult } from "./immutable-accounting";

type RpcResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export interface AccountingFoundationRpcClient {
  rpc<T = unknown>(name: string, parameters: Record<string, unknown>): RpcResult<T>;
}

export type SalesInvoiceNumberReservation = {
  id: string;
  organization_id: string;
  provider: string;
  tenant_id: string;
  sequence_number: number;
  formatted_number: string;
  source_document_type: "project_claim" | "retention_claim";
  source_document_id: string;
  accounting_document_id: string | null;
};

export type ConfirmedAccountingRevision = {
  id: string;
  organization_id: string;
  accounting_document_id: string;
  revision_sequence: number;
  source_evidence_hash: string;
  payload_hash: string;
  requested_provider_status: "AUTHORISED";
  lifecycle_state: string;
};

export type RetentionOwnershipEvaluation = {
  organizationId: string;
  projectId: string;
  readOnly: true;
  origins: RetentionOwnershipResult[];
  valid: boolean;
};

async function requireRpcData<T>(result: RpcResult<T>, operation: string): Promise<T> {
  const { data, error } = await result;
  if (error) throw new Error(`${operation}: ${error.message}`);
  if (data === null) throw new Error(`${operation}: no result returned`);
  return data;
}

export function reserveSalesInvoiceNumber(
  client: AccountingFoundationRpcClient,
  input: {
    organizationId: string;
    provider: string;
    tenantId: string;
    sourceDocumentType: "project_claim" | "retention_claim";
    sourceDocumentId: string;
    accountingDocumentId: string | null;
    reservedBy: string;
    reason: string;
  },
): Promise<SalesInvoiceNumberReservation> {
  return requireRpcData(
    client.rpc<SalesInvoiceNumberReservation>(
      "reserve_accounting_sales_invoice_number_phase2a",
      {
        p_organization_id: input.organizationId,
        p_provider: input.provider,
        p_tenant_id: input.tenantId,
        p_source_document_type: input.sourceDocumentType,
        p_source_document_id: input.sourceDocumentId,
        p_accounting_document_id: input.accountingDocumentId,
        p_reserved_by: input.reservedBy,
        p_reason: input.reason,
      },
    ),
    "Unable to reserve accounting number",
  );
}

export function persistConfirmedAccountingRevision(
  client: AccountingFoundationRpcClient,
  serverResolvedInput: Record<string, unknown>,
): Promise<ConfirmedAccountingRevision> {
  return requireRpcData(
    client.rpc<ConfirmedAccountingRevision>(
      "persist_confirmed_accounting_revision_phase2a",
      { p_input: serverResolvedInput },
    ),
    "Unable to persist confirmed accounting revision",
  );
}

export async function evaluateRetentionOwnershipReadOnly(
  client: AccountingFoundationRpcClient,
  input: {
    organizationId: string;
    projectId: string;
    proposals: unknown[];
  },
): Promise<RetentionOwnershipEvaluation> {
  return requireRpcData(
    client.rpc<RetentionOwnershipEvaluation>("evaluate_retention_ownership_phase2a", {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_proposals: input.proposals,
    }),
    "Unable to evaluate retention ownership",
  );
}
