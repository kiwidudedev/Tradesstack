import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  resolveDirectRetentionOriginEvidence,
  type DirectRetentionOriginEvidenceResolution,
} from "@/lib/xero/retention-claim-direct-origin-evidence";
import type {
  RetentionClaimXeroSource,
} from "@/lib/xero/retention-claim-sales-invoice-payload";

type Row = Record<string, unknown>;
type Admin = {
  // Accounting evidence objects intentionally precede generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function admin() {
  return createAdminSupabaseClient() as unknown as Admin;
}

export async function loadDirectRetentionOriginEvidence(params: {
  source: RetentionClaimXeroSource;
  connectionId: string;
  tenantId: string;
  currencyCode: string;
  routeAccountCode: string;
}): Promise<DirectRetentionOriginEvidenceResolution> {
  if (params.source.allocations.length !== 1) {
    return resolveDirectRetentionOriginEvidence({
      organizationId: params.source.claim.organizationId,
      projectId: params.source.claim.projectId,
      connectionId: params.connectionId,
      tenantId: params.tenantId,
      currencyCode: params.currencyCode,
      routeAccountCode: params.routeAccountCode,
      allocations: params.source.allocations,
      originDocuments: [],
      originRevisions: [],
      originLines: [],
      activeTaxTypes: [],
    });
  }
  const client = admin();
  const organizationId = params.source.claim.organizationId;
  const originId = params.source.allocations[0]!.originatingPaymentClaimId;
  const documents = await client.from("organization_accounting_documents")
    .select(
      "id,organization_id,provider,local_document_type,project_claim_id,"
      + "integration_contract,active_accounting_revision_id",
    )
    .eq("organization_id", organizationId)
    .eq("provider", "xero")
    .eq("local_document_type", "project_claim")
    .eq("project_claim_id", originId)
    .eq("integration_contract", "payment_claim_revision_v1");
  if (documents.error) throw new Error(documents.error.message);
  const revisionIds = ((documents.data ?? []) as Row[])
    .map((row) => String(row.active_accounting_revision_id ?? ""))
    .filter(Boolean);
  const revisions = revisionIds.length > 0
    ? await client.from("organization_accounting_document_revisions")
        .select(
          "id,organization_id,project_id,accounting_document_id,"
          + "source_document_type,source_document_id,lifecycle_state,"
          + "connection_id,tenant_id,currency_code,revision_sequence,"
          + "previous_revision_id,tax_snapshot",
        )
        .eq("organization_id", organizationId)
        .in("id", revisionIds)
    : { data: [], error: null };
  if (revisions.error) throw new Error(revisions.error.message);
  const resolvedRevisionIds = ((revisions.data ?? []) as Row[])
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);
  const [lines, taxRates] = await Promise.all([
    resolvedRevisionIds.length > 0
      ? client.from("organization_accounting_revision_lines")
          .select(
            "id,organization_id,accounting_revision_id,line_kind,"
            + "originating_payment_claim_id,line_amount_minor,tax_minor,"
            + "total_minor,account_snapshot,tax_snapshot",
          )
          .eq("organization_id", organizationId)
          .eq("line_kind", "retention")
          .eq("originating_payment_claim_id", originId)
          .in("accounting_revision_id", resolvedRevisionIds)
      : Promise.resolve({ data: [], error: null }),
    client.from("organization_accounting_tax_rates")
      .select("tax_type,metadata")
      .eq("organization_id", organizationId)
      .eq("provider", "xero")
      .eq("accounting_connection_id", params.connectionId)
      .eq("tenant_id", params.tenantId)
      .eq("is_active", true)
      .eq("status", "ACTIVE"),
  ]);
  const dependencyError = lines.error ?? taxRates.error;
  if (dependencyError) throw new Error(dependencyError.message);
  return resolveDirectRetentionOriginEvidence({
    organizationId,
    projectId: params.source.claim.projectId,
    connectionId: params.connectionId,
    tenantId: params.tenantId,
    currencyCode: params.currencyCode,
    routeAccountCode: params.routeAccountCode,
    allocations: params.source.allocations,
    originDocuments: (documents.data ?? []) as Row[],
    originRevisions: (revisions.data ?? []) as Row[],
    originLines: (lines.data ?? []) as Row[],
    activeTaxTypes: ((taxRates.data ?? []) as Row[])
      .filter((row) => {
        const metadata = row.metadata;
        return metadata && typeof metadata === "object"
          && !Array.isArray(metadata)
          && (metadata as Row).canApplyToRevenue === true;
      })
      .map((row) => String(row.tax_type ?? "")),
  });
}
