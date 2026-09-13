export type XeroJobFailureClassification = "connection_level" | "document_level" | "none";
export type XeroJobRetryClassification =
  | "not_applicable"
  | "already_scheduled"
  | "reconnect_required"
  | "operator_review_required";

export type XeroJobReportInput = {
  job_kind: string;
  queue_state: string;
  request_payload?: Record<string, unknown> | null;
  last_error?: string | null;
};

const CONNECTION_JOB_KINDS = new Set([
  "health_check",
  "import_accounts",
  "import_tax_rates",
  "import_contacts",
]);

const CONNECTION_ERROR_PATTERN = /invalid[_ ]grant|refresh token|revoked|unauthori[sz]ed|tenant access|http[_ ]?(401|403)|status (401|403)/i;

export function shouldXeroFailureAffectConnectionHealth(params: {
  jobKind: string;
  message: string;
  httpStatus?: number | null;
  explicitImpact?: boolean | null;
}) {
  if (params.explicitImpact != null) return params.explicitImpact;
  if (params.httpStatus === 401 || params.httpStatus === 403) return true;
  return CONNECTION_JOB_KINDS.has(params.jobKind)
    || CONNECTION_ERROR_PATTERN.test(params.message);
}

export function classifyXeroJobFailure(job: XeroJobReportInput): XeroJobFailureClassification {
  if (!job.last_error) return "none";
  if (CONNECTION_JOB_KINDS.has(job.job_kind) || CONNECTION_ERROR_PATTERN.test(job.last_error)) {
    return "connection_level";
  }
  return "document_level";
}

export function classifyXeroJobRetry(job: XeroJobReportInput): XeroJobRetryClassification {
  if (["pending", "claimed", "retry_scheduled"].includes(job.queue_state)) {
    return "already_scheduled";
  }
  if (job.queue_state !== "dead_lettered") return "not_applicable";
  return classifyXeroJobFailure(job) === "connection_level"
    ? "reconnect_required"
    : "operator_review_required";
}

export function xeroJobDocumentIdentity(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null;
  for (const key of [
    "accountingDocumentId",
    "documentId",
    "accountingRevisionId",
    "projectClaimId",
    "claimId",
    "supplierInvoiceId",
  ]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return `${key}: ${value.trim()}`;
  }
  return null;
}
