"use server";

import {
  resolveAccountingIdentityPresentation,
  type AccountingIdentityPresentation,
} from "@/lib/accounting/accounting-identity-presentation";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type PaymentClaimRegisterAccountingIdentity = {
  claimId: string;
  identity: AccountingIdentityPresentation;
  statusLabel: string;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statusLabel(document: Record<string, unknown>) {
  const remoteStatus = text(document.normalized_external_status)?.toLowerCase();
  if (remoteStatus === "voided" || remoteStatus === "deleted") return "Voided";

  switch (text(document.export_status)) {
    case "exported":
      return "Synced";
    case "attention_required":
      return "Attention";
    case "failed":
      return "Failed";
    case "queued":
      return "Queued";
    case "exporting":
      return "Syncing";
    default:
      return "Not synced";
  }
}

export async function loadPaymentClaimRegisterAccountingIdentities(params: {
  projectId: string;
  claims: Array<{ id: string; claimNumber: string }>;
}): Promise<PaymentClaimRegisterAccountingIdentity[]> {
  const member = await getCurrentOrganizationMember();
  const canView = member
    ? await hasOrganizationPermission(
        member.organization_id,
        "accounting.sales_invoices.view",
      )
    : false;
  const canManage = member && !canView
    ? await hasOrganizationPermission(
        member.organization_id,
        "accounting.sales_invoices.manage",
      )
    : false;
  if (
    !member
    || (!canView && !canManage)
  ) {
    return [];
  }

  const projectId = text(params.projectId);
  const requestedClaims = params.claims
    .filter((claim) => text(claim.id) && text(claim.claimNumber))
    .slice(0, 250);
  if (!projectId || requestedClaims.length === 0) return [];

  // The generated database types intentionally lag the Phase 2 accounting
  // read model. Keep this server-only query untyped until those types catch up.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminSupabaseClient() as any;
  const projectResult = await admin
    .from("organization_projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", member.organization_id)
    .maybeSingle();
  if (projectResult.error || !projectResult.data) return [];

  const requestedClaimIds = requestedClaims.map((claim) => claim.id);
  const claimsResult = await admin
    .from("project_claims")
    .select("id,claim_number")
    .eq("organization_id", member.organization_id)
    .eq("project_id", projectId)
    .in("id", requestedClaimIds);
  if (claimsResult.error) return [];
  const claims: Array<{ id: string; claimNumber: string }> =
    (claimsResult.data ?? [])
    .map((claim: Record<string, unknown>) => ({
      id: text(claim.id),
      claimNumber: text(claim.claim_number),
    }))
    .filter(
      (claim: { id: string | null; claimNumber: string | null }):
        claim is { id: string; claimNumber: string } =>
        Boolean(claim.id && claim.claimNumber),
    );
  if (claims.length === 0) return [];
  const claimIds = claims.map((claim) => claim.id);
  const documentsResult = await admin
    .from("organization_accounting_documents")
    .select(
      "id,project_claim_id,active_accounting_revision_id,"
      + "external_document_id,external_document_number,export_status,"
      + "normalized_external_status",
    )
    .eq("organization_id", member.organization_id)
    .eq("provider", "xero")
    .eq("local_document_type", "project_claim")
    .in("project_claim_id", claimIds);
  if (documentsResult.error) return [];

  const documents = (documentsResult.data ?? []) as Array<Record<string, unknown>>;
  const activeRevisionIds = documents
    .map((document) => text(document.active_accounting_revision_id))
    .filter((id): id is string => Boolean(id));
  const revisionsResult = activeRevisionIds.length
    ? await admin
        .from("organization_accounting_document_revisions")
        .select(
          "id,accounting_document_id,external_document_id,"
          + "external_document_number,lifecycle_state",
        )
        .eq("organization_id", member.organization_id)
        .in("id", activeRevisionIds)
    : { data: [], error: null };
  if (revisionsResult.error) return [];

  const activeRevisions = new Map(
    ((revisionsResult.data ?? []) as Array<Record<string, unknown>>)
      .map((revision) => [text(revision.id), revision] as const)
      .filter((entry): entry is [string, Record<string, unknown>] =>
        Boolean(entry[0])),
  );
  const documentByClaimId = new Map(
    documents
      .map((document) => [text(document.project_claim_id), document] as const)
      .filter((entry): entry is [string, Record<string, unknown>] =>
        Boolean(entry[0])),
  );

  return claims.map((claim) => {
    const document = documentByClaimId.get(claim.id);
    const activeRevision = document
      ? activeRevisions.get(text(document.active_accounting_revision_id) ?? "")
      : null;
    const revisionMatchesDocument = Boolean(
      document
      && activeRevision
      && text(activeRevision.accounting_document_id) === text(document.id),
    );
    return {
      claimId: claim.id,
      identity: resolveAccountingIdentityPresentation({
        commercialClaimNumber: claim.claimNumber,
        activeRevisionInvoiceNumber: revisionMatchesDocument
          ? text(activeRevision?.external_document_number)
          : null,
        activeRevisionInvoiceId: revisionMatchesDocument
          ? text(activeRevision?.external_document_id)
          : null,
        stableDocumentInvoiceNumber: text(document?.external_document_number),
        stableDocumentInvoiceId: text(document?.external_document_id),
      }),
      statusLabel: document ? statusLabel(document) : "Not synced",
    };
  });
}
