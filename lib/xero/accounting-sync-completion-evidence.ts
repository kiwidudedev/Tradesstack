import "server-only";

import { getMasterRetentionSource } from "@/lib/retention/master-retention-source";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;

export type AccountingSyncCompletionEvidence = {
  organizationId: string;
  projectId: string;
  claimId: string;
  sourceDocumentType: string;
  accountingDocumentId: string;
  activeRevisionId: string;
  observationId: string;
  projectionId: string;
  attemptId: string;
  jobId: string;
  invoiceId: string;
  invoiceNumber: string;
  operation: string;
  providerStatus: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  creditedMinor: number;
  outstandingMinor: number;
  observedAt: string;
  completedAt: string;
  sourceMatches: boolean;
  document: Row;
  revision: Row;
  observation: Row;
  projection: Row;
};

export type AccountingSyncLocalComparison = {
  claimId: string;
  optimisticRevision: string | null;
  sourceHash: string | null;
  subtotalMinor: number | null;
  taxMinor: number | null;
  totalMinor: number | null;
  claimDate: string | null;
  dueDate: string | null;
  matchesActiveRevision: boolean;
};

function object(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null;
}

function requiredText(row: Row, key: string) {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function requiredNumber(row: Row, key: string) {
  const value = Number(row[key]);
  return Number.isSafeInteger(value) ? value : null;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function moneyMinor(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function revisionCommercial(evidence: AccountingSyncCompletionEvidence) {
  return object(evidence.revision.commercial_snapshot) ?? {};
}

export function derivePaymentClaimLocalAccountingComparison(params: {
  evidence: AccountingSyncCompletionEvidence;
  claim: Row;
}): AccountingSyncLocalComparison {
  const { claim, evidence } = params;
  const commercial = revisionCommercial(evidence);
  const subtotalMinor = moneyMinor(claim.net_claim_excl_gst);
  const taxMinor = moneyMinor(claim.gst_amount);
  const totalMinor = moneyMinor(claim.total_payable);
  const claimDate = optionalText(claim.claim_date);
  const dueDate = optionalText(claim.due_date);
  const amountMatches = (
    moneyMinor(claim.claim_amount) === Number(commercial.revenueAmountMinor)
    && subtotalMinor === evidence.subtotalMinor
    && taxMinor === evidence.taxMinor
    && totalMinor === evidence.totalMinor
  );
  const datesMatch = claimDate === optionalText(commercial.invoiceDate)
    && dueDate === optionalText(commercial.dueDate);
  return {
    claimId: String(claim.id),
    optimisticRevision: optionalText(claim.updated_at),
    sourceHash: null,
    subtotalMinor,
    taxMinor,
    totalMinor,
    claimDate,
    dueDate,
    matchesActiveRevision:
      claim.status === "Submitted"
      && evidence.sourceMatches
      && amountMatches
      && datesMatch,
  };
}

export async function loadPaymentClaimLocalAccountingComparison(params: {
  evidence: AccountingSyncCompletionEvidence;
}): Promise<AccountingSyncLocalComparison | null> {
  const { evidence } = params;
  if (evidence.sourceDocumentType !== "project_claim") return null;
  const admin = createAdminSupabaseClient();
  const result = await admin
    .from("project_claims")
    .select(
      "id,organization_id,project_id,status,updated_at,claim_date,due_date,"
      + "claim_amount,net_claim_excl_gst,gst_amount,total_payable",
    )
    .eq("organization_id", evidence.organizationId)
    .eq("project_id", evidence.projectId)
    .eq("id", evidence.claimId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return derivePaymentClaimLocalAccountingComparison({
    evidence,
    claim: result.data as unknown as Row,
  });
}

export function deriveRetentionClaimLocalAccountingComparison(params: {
  evidence: AccountingSyncCompletionEvidence;
  claim: Row;
  source: {
    claim: {
      id: string;
      submissionStateHash: string;
      submittedAt: string;
      subtotalExclTax: number;
    };
  };
}): AccountingSyncLocalComparison {
  const { claim, evidence, source } = params;
  const commercial = revisionCommercial(evidence);
  const sourceHash = optionalText(source.claim.submissionStateHash);
  const subtotalMinor = moneyMinor(source.claim.subtotalExclTax);
  const taxMinor = subtotalMinor == null
    ? null
    : Math.round(subtotalMinor * 0.15);
  const totalMinor = subtotalMinor == null || taxMinor == null
    ? null
    : subtotalMinor + taxMinor;
  const claimDate = optionalText(claim.issue_date);
  const dueDate = optionalText(claim.due_date);
  const activeHash = optionalText(commercial.currentStateHash);
  return {
    claimId: String(claim.id),
    optimisticRevision: optionalText(claim.submitted_at),
    sourceHash,
    subtotalMinor,
    taxMinor,
    totalMinor,
    claimDate,
    dueDate,
    matchesActiveRevision:
      claim.status === "submitted"
      && Boolean(sourceHash && activeHash && sourceHash === activeHash)
      && claimDate === optionalText(commercial.issueDate)
      && dueDate === optionalText(commercial.dueDate),
  };
}

export async function loadRetentionClaimLocalAccountingComparison(params: {
  evidence: AccountingSyncCompletionEvidence;
}): Promise<AccountingSyncLocalComparison | null> {
  const { evidence } = params;
  if (evidence.sourceDocumentType !== "retention_claim") return null;
  const admin = createAdminSupabaseClient();
  const [result, source] = await Promise.all([
    admin
      .from("retention_claims")
      .select(
        "id,organization_id,project_id,status,submitted_at,"
        + "issue_date,due_date",
      )
      .eq("organization_id", evidence.organizationId)
      .eq("project_id", evidence.projectId)
      .eq("id", evidence.claimId)
      .maybeSingle(),
    getMasterRetentionSource(evidence.claimId),
  ]);
  if (result.error || !result.data) return null;
  if (!source || source.claim.id !== evidence.claimId) return null;
  return deriveRetentionClaimLocalAccountingComparison({
    evidence,
    claim: result.data as unknown as Row,
    source,
  });
}

export function parseAccountingSyncCompletionEvidence(
  value: unknown,
): AccountingSyncCompletionEvidence | null {
  const row = object(value);
  if (!row) return null;
  const textKeys = [
    "organizationId",
    "projectId",
    "claimId",
    "sourceDocumentType",
    "accountingDocumentId",
    "activeRevisionId",
    "observationId",
    "projectionId",
    "attemptId",
    "jobId",
    "invoiceId",
    "invoiceNumber",
    "operation",
    "providerStatus",
    "observedAt",
    "completedAt",
  ] as const;
  const numericKeys = [
    "subtotalMinor",
    "taxMinor",
    "totalMinor",
    "paidMinor",
    "creditedMinor",
    "outstandingMinor",
  ] as const;
  if (textKeys.some((key) => requiredText(row, key) === null)) return null;
  if (numericKeys.some((key) => requiredNumber(row, key) === null)) return null;
  if (typeof row.sourceMatches !== "boolean") return null;
  const document = object(row.document);
  const revision = object(row.revision);
  const observation = object(row.observation);
  const projection = object(row.projection);
  if (!document || !revision || !observation || !projection) return null;
  if (
    document.id !== row.accountingDocumentId
    || document.active_accounting_revision_id !== row.activeRevisionId
    || revision.id !== row.activeRevisionId
    || revision.accounting_document_id !== row.accountingDocumentId
    || revision.external_document_id !== row.invoiceId
    || revision.external_document_number !== row.invoiceNumber
    || observation.id !== row.observationId
    || observation.accounting_revision_id !== row.activeRevisionId
    || observation.external_document_id !== row.invoiceId
    || projection.id !== row.projectionId
    || projection.accounting_revision_id !== row.activeRevisionId
    || projection.remote_observation_id !== row.observationId
    || projection.divergent === true
  ) {
    return null;
  }
  return row as AccountingSyncCompletionEvidence;
}

export function completionEvidenceMatches(params: {
  evidence: AccountingSyncCompletionEvidence;
  organizationId: string;
  claimId: string;
  accountingDocumentId: string;
  activeRevisionId: string;
  jobId: string;
}) {
  const evidence = params.evidence;
  return evidence.organizationId === params.organizationId
    && evidence.claimId === params.claimId
    && evidence.accountingDocumentId === params.accountingDocumentId
    && evidence.activeRevisionId === params.activeRevisionId
    && evidence.jobId === params.jobId;
}

export async function loadAccountingSyncCompletionEvidence(params: {
  organizationId: string;
  jobId: string;
}): Promise<AccountingSyncCompletionEvidence | null> {
  const admin = createAdminSupabaseClient() as unknown as {
    rpc: (
      name: string,
      input: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const result = await admin.rpc("get_accounting_sync_completion_evidence", {
    p_organization_id: params.organizationId,
    p_job_id: params.jobId,
  });
  if (result.error) return null;
  return parseAccountingSyncCompletionEvidence(result.data);
}
