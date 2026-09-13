import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrganizationXeroConnection } from "@/lib/xero/service";
import { hasXeroAttachmentScope, hasXeroInvoiceScope } from "@/lib/xero/scopes";
import {
  buildRetentionClaimXeroPayload,
  type RetentionClaimXeroSource,
} from "@/lib/xero/retention-claim-sales-invoice-payload";
import {
  loadDirectRetentionOriginEvidence,
} from "@/lib/xero/retention-claim-direct-origin-evidence-server";
import type {
  DirectRetentionOriginEvidence,
} from "@/lib/xero/retention-claim-direct-origin-evidence";

type Row = Record<string, unknown>;
type UntypedClient = {
  // Phase 9 tables and RPCs intentionally precede generated database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type RetentionClaimXeroBlocker = {
  code: string;
  message: string;
};

export type RetentionClaimXeroPanel = {
  visible: boolean;
  canManage: boolean;
  ready: boolean;
  blockers: RetentionClaimXeroBlocker[];
  accountingDocumentId: string | null;
  exportStatus: string | null;
  externalInvoiceId: string | null;
  externalInvoiceNumber: string | null;
  xeroInvoiceUrl: string | null;
  attachmentStatus: string | null;
  lastError: string | null;
  activeJobKind: string | null;
  activeQueueState: string | null;
};

export type RetentionClaimXeroSourceAccess = {
  succeeded?: boolean;
  errorCode?: string;
  actorUserId?: string;
  organizationId?: string;
  projectId?: string;
  retentionSourceEvidenceHash?: string;
  source?: RetentionClaimXeroSource;
};

export type RetentionClaimXeroResolved = {
  access: RetentionClaimXeroSourceAccess;
  source: RetentionClaimXeroSource;
  project: Row;
  organization: Row;
  connection: NonNullable<Awaited<ReturnType<typeof getOrganizationXeroConnection>>>;
  contactId: string;
  contact: Row;
  mapping: Row;
  costCode: Row;
  taxRate: Row;
  document: Row | null;
  accountingDocument: Row | null;
  activeJob: Row | null;
  originEvidence: DirectRetentionOriginEvidence | null;
};

const MESSAGES: Record<string, string> = {
  claim_not_submitted: "Submit the Retention Claim before creating its Xero invoice.",
  document_missing: "Generate the immutable Retention Claim PDF before creating its Xero invoice.",
  invoice_dates_missing: "The submitted Retention Claim must have an issue date and due date.",
  unsupported_jurisdiction: "The organisation jurisdiction is not configured.",
  unsupported_tax_registration: "The organisation tax registration is not configured.",
  unsupported_currency: "The organisation must have a valid three-letter currency code.",
  client_missing: "The project does not have a client.",
  xero_disconnected: "Connect Xero and select a tenant.",
  invoice_scope_missing: "Reconnect Xero to grant invoice access.",
  attachment_scope_missing: "Reconnect Xero to grant invoice attachment access.",
  client_contact_missing: "Link the project client to an active Xero Contact.",
  retention_mapping_missing: "Configure Retention Receivable with an active Xero Current Asset account.",
  revenue_tax_type_missing: "Synchronize an active revenue TaxType for the selected Xero tenant.",
  accounting_document_invalid: "The Retention Claim Xero accounting identity is invalid.",
  multiple_origins_unsupported:
    "This Retention Claim requires a single originating Payment Claim.",
  origin_revision_missing:
    "The originating Payment Claim does not have one effective succeeded accounting revision.",
  origin_revision_ambiguous:
    "The originating Payment Claim has ambiguous effective accounting revisions.",
  origin_retention_line_missing:
    "The effective originating Payment Claim revision has no immutable retention line.",
  origin_retention_line_ambiguous:
    "The effective originating Payment Claim revision has ambiguous immutable retention lines.",
  origin_tax_evidence_missing:
    "The originating Payment Claim retention line does not contain complete immutable tax evidence.",
  origin_tax_type_unavailable:
    "The originating Payment Claim TaxType is not available for the selected Xero tenant.",
  origin_amount_mismatch:
    "The Retention Claim must release the full immutable originating retention amount.",
  origin_identity_mismatch:
    "The originating Payment Claim accounting identity does not match this Retention Claim.",
  origin_retention_line_invalid:
    "The immutable originating Payment Claim retention line is invalid.",
};

function db(client: unknown) {
  return client as UntypedClient;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function meta(row: Row | null) {
  return row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Row
    : {};
}

function blocker(code: string): RetentionClaimXeroBlocker {
  return { code, message: MESSAGES[code] ?? code.replaceAll("_", " ") };
}

async function access(retentionClaimId: string, manage: boolean) {
  const server = db(await createServerSupabaseClient());
  const result = await server.rpc(
    manage ? "get_retention_claim_xero_source" : "get_retention_claim_xero_access",
    { p_retention_claim_id: retentionClaimId },
  );
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? {}) as RetentionClaimXeroSourceAccess;
}

export async function loadRetentionClaimStructuredSourceAccess(
  retentionClaimId: string,
) {
  const admin = db(await createAdminSupabaseClient());
  const result = await admin.rpc(
    "get_retention_claim_xero_source_phase2c",
    { p_retention_claim_id: retentionClaimId },
  );
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? {}) as RetentionClaimXeroSourceAccess;
}

export async function loadRetentionClaimXeroResolved(
  retentionClaimId: string,
  manage: boolean,
  immutablePhase2c = false,
): Promise<{
  resolved: RetentionClaimXeroResolved | null;
  blockers: RetentionClaimXeroBlocker[];
  access: RetentionClaimXeroSourceAccess;
}> {
  const accessResult = immutablePhase2c && manage
    ? await loadRetentionClaimStructuredSourceAccess(retentionClaimId)
    : await access(retentionClaimId, manage);
  if (!accessResult.succeeded) {
    return {
      resolved: null,
      blockers: accessResult.errorCode === "project_mode_not_supported"
        || accessResult.errorCode === "capability_disabled"
        || accessResult.errorCode === "permission_denied"
        || accessResult.errorCode === "claim_not_found"
        ? []
        : [blocker(accessResult.errorCode ?? "access_denied")],
      access: accessResult,
    };
  }

  let source = accessResult.source;
  if (!source) {
    const admin = db(await createAdminSupabaseClient());
    const claim = await admin.from("retention_claims").select("*")
      .eq("id", retentionClaimId).maybeSingle();
    const allocations = await admin.from("retention_claim_allocations").select("*")
      .eq("retention_claim_id", retentionClaimId)
      .order("allocation_sequence");
    if (claim.error || allocations.error || !claim.data) {
      throw new Error(claim.error?.message ?? allocations.error?.message ?? "Retention Claim not found.");
    }
    source = {
      schemaVersion: 1,
      claim: {
        id: claim.data.id,
        organizationId: claim.data.organization_id,
        projectId: claim.data.project_id,
        claimNumber: claim.data.claim_number,
        title: claim.data.title,
        reference: claim.data.reference,
        issueDate: claim.data.issue_date,
        dueDate: claim.data.due_date,
        status: claim.data.status,
        subtotalExclTax: claim.data.subtotal_excl_tax,
        submissionStateHash: claim.data.submission_state_hash,
        submittedAt: claim.data.submitted_at,
      },
      allocations: (allocations.data ?? []).map((row: Row) => ({
        id: String(row.id),
        allocationSequence: Number(row.allocation_sequence),
        originatingPaymentClaimId: String(row.originating_payment_claim_id),
        allocationAmount: Number(row.allocation_amount),
        originClaimNumberSnapshot: String(row.origin_claim_number_snapshot),
      })),
    } as RetentionClaimXeroSource;
  }

  const admin = db(await createAdminSupabaseClient());
  const [organization, project, document, accountingDocument] = await Promise.all([
    admin.from("organizations").select("id,country,default_currency,tax_registration_status")
      .eq("id", source.claim.organizationId).maybeSingle(),
    admin.from("organization_projects").select("id,organization_id,client_id,name")
      .eq("organization_id", source.claim.organizationId)
      .eq("id", source.claim.projectId).maybeSingle(),
    admin.from("retention_claim_documents").select("*")
      .eq("organization_id", source.claim.organizationId)
      .eq("retention_claim_id", source.claim.id).maybeSingle(),
    admin.from("organization_accounting_documents").select("*")
      .eq("organization_id", source.claim.organizationId)
      .eq("provider", "xero")
      .eq("local_document_type", "retention_claim")
      .eq("retention_claim_id", source.claim.id).maybeSingle(),
  ]);
  const queryError = organization.error ?? project.error ?? document.error ?? accountingDocument.error;
  if (queryError) throw new Error(queryError.message);
  const blockers: RetentionClaimXeroBlocker[] = [];
  if (!source.claim.issueDate || !source.claim.dueDate) blockers.push(blocker("invoice_dates_missing"));
  const currency = text(organization.data?.default_currency)?.toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    blockers.push(blocker("unsupported_currency"));
  }
  if (!project.data?.client_id) blockers.push(blocker("client_missing"));
  // Phase 2C prepares the deterministic immutable PDF inside proposal loading.
  // The legacy Phase 9 workflow still requires a pre-generated document.
  if (!document.data && !immutablePhase2c) {
    blockers.push(blocker("document_missing"));
  }

  const connection = await getOrganizationXeroConnection(source.claim.organizationId);
  if (!connection || connection.status !== "connected" || !connection.tenant_id) {
    blockers.push(blocker("xero_disconnected"));
    return { resolved: null, blockers, access: accessResult };
  }
  if (!hasXeroInvoiceScope(connection.scope)) blockers.push(blocker("invoice_scope_missing"));
  if (!immutablePhase2c && !hasXeroAttachmentScope(connection.scope)) {
    blockers.push(blocker("attachment_scope_missing"));
  }

  const [links, mappings, taxRates] = await Promise.all([
    admin.from("organization_external_contacts").select("*")
      .eq("organization_id", source.claim.organizationId)
      .eq("provider", "xero")
      .eq("local_entity_type", "client")
      .eq("local_entity_id", project.data?.client_id ?? ""),
    admin.from("organization_accounting_route_mappings").select("*")
      .eq("organization_id", source.claim.organizationId)
      .eq("provider", "xero")
      .eq("accounting_route", "retention_receivable")
      .eq("is_active", true),
    admin.from("organization_accounting_tax_rates").select("*")
      .eq("organization_id", source.claim.organizationId)
      .eq("provider", "xero")
      .eq("accounting_connection_id", connection.id)
      .eq("tenant_id", connection.tenant_id),
  ]);
  const dependencyError = links.error ?? mappings.error ?? taxRates.error;
  if (dependencyError) throw new Error(dependencyError.message);

  const contactLink = (links.data ?? []).find((row: Row) =>
    row.accounting_connection_id === connection.id
    && row.tenant_id === connection.tenant_id
    && row.link_status === "linked"
  ) as Row | undefined;
  const contact = contactLink
    ? await admin.from("organization_xero_contacts").select("*")
        .eq("organization_id", source.claim.organizationId)
        .eq("connection_id", connection.id)
        .eq("tenant_id", connection.tenant_id)
        .eq("contact_id", contactLink.external_contact_id)
        .maybeSingle()
    : { data: null, error: null };
  const contactStatus = text(contact.data?.contact_status)?.toUpperCase();
  if (
    contact.error
    || !contact.data
    || ["ARCHIVED", "GDPRREQUEST"].includes(contactStatus ?? "")
  ) blockers.push(blocker("client_contact_missing"));

  const applicableMappings = (mappings.data ?? [])
    .filter((row: Row) => row.project_id === source!.claim.projectId || row.project_id == null)
    .sort((left: Row, right: Row) => Number(right.project_id != null) - Number(left.project_id != null));
  const mapping = applicableMappings[0] as Row | undefined;
  const costCode = mapping
    ? await admin.from("organization_cost_codes").select("*")
        .eq("organization_id", source.claim.organizationId)
        .eq("id", mapping.organization_cost_code_id).maybeSingle()
    : { data: null, error: null };
  const costMeta = meta(costCode.data as Row | null);
  if (
    costCode.error
    || !costCode.data
    || costCode.data.is_active !== true
    || costCode.data.external_provider !== "xero"
    || text(costMeta.tenantId) !== connection.tenant_id
    || text(costMeta.class)?.toUpperCase() !== "ASSET"
    || text(costMeta.type)?.toUpperCase() !== "CURRENT"
  ) blockers.push(blocker("retention_mapping_missing"));

  let taxRate = (taxRates.data ?? []).find((row: Row) => {
    const metadata = meta(row);
    return row.is_active === true
      && text(row.status)?.toUpperCase() === "ACTIVE"
      && Number.isFinite(Number(row.effective_rate))
      && Number(row.effective_rate) >= 0
      && text(row.tax_type)
      && metadata.canApplyToRevenue === true;
  }) as Row | undefined;

  const originResolution = immutablePhase2c
    && costCode.data
    && connection.tenant_id
    && currency
    ? await loadDirectRetentionOriginEvidence({
        source,
        connectionId: connection.id,
        tenantId: connection.tenant_id,
        currencyCode: currency,
        routeAccountCode: String(costCode.data.external_code ?? ""),
      })
    : null;
  if (originResolution && !originResolution.ok) {
    blockers.push({
      code: originResolution.blocker.code,
      message: originResolution.blocker.message,
    });
  }
  if (originResolution?.ok) {
    taxRate = (taxRates.data ?? []).find((row: Row) => {
      const metadata = meta(row);
      return row.is_active === true
        && text(row.status)?.toUpperCase() === "ACTIVE"
        && text(row.tax_type)?.toUpperCase()
          === originResolution.evidence.taxType
        && metadata.canApplyToRevenue === true;
    }) as Row | undefined;
  }
  if (!taxRate && !originResolution) {
    blockers.push(blocker("revenue_tax_type_missing"));
  }

  const existing = accountingDocument.data as Row | null;
  if (
    existing
    && (
      existing.accounting_connection_id !== connection.id
      || existing.tenant_id !== connection.tenant_id
      || existing.project_claim_id != null
      || existing.local_document_id != null
    )
  ) blockers.push(blocker("accounting_document_invalid"));

  let activeJob: Row | null = null;
  if (existing) {
    const jobs = await admin.from("organization_accounting_sync_jobs").select("*")
      .eq("organization_id", source.claim.organizationId)
      .in("job_kind", ["xero.retention_claim.sync", "xero.retention_claim.attachment"])
      .in("queue_state", ["pending", "claimed", "retry_scheduled"])
      .contains("request_payload", { accountingDocumentId: existing.id })
      .order("created_at", { ascending: false }).limit(1);
    if (jobs.error) throw new Error(jobs.error.message);
    activeJob = jobs.data?.[0] ?? null;
  }

  if (
    !project.data
    || !organization.data
    || (!document.data && !immutablePhase2c)
    || !contact.data
    || !mapping
    || !costCode.data
    || !taxRate
  ) {
    return { resolved: null, blockers, access: accessResult };
  }
  return {
    access: accessResult,
    blockers,
    resolved: {
      access: accessResult,
      source,
      project: project.data,
      organization: organization.data,
      connection,
      contactId: String(contact.data.contact_id),
      contact: contact.data,
      mapping,
      costCode: costCode.data,
      taxRate,
      document: document.data,
      accountingDocument: existing,
      activeJob,
      originEvidence: originResolution?.ok
        ? originResolution.evidence
        : null,
    },
  };
}

export async function getRetentionClaimXeroPanel(
  retentionClaimId: string,
): Promise<RetentionClaimXeroPanel> {
  const view = await loadRetentionClaimXeroResolved(retentionClaimId, false);
  if (!view.access.succeeded) {
    return {
      visible: false,
      canManage: false,
      ready: false,
      blockers: [],
      accountingDocumentId: null,
      exportStatus: null,
      externalInvoiceId: null,
      externalInvoiceNumber: null,
      xeroInvoiceUrl: null,
      attachmentStatus: null,
      lastError: null,
      activeJobKind: null,
      activeQueueState: null,
    };
  }
  const manage = await access(retentionClaimId, true);
  const row = view.resolved?.accountingDocument ?? null;
  const tenantId = text(row?.tenant_id);
  const invoiceId = text(row?.external_document_id);
  return {
    visible: true,
    canManage: manage.succeeded === true,
    ready: view.blockers.length === 0 && !invoiceId && !view.resolved?.activeJob,
    blockers: view.blockers,
    accountingDocumentId: text(row?.id),
    exportStatus: text(row?.export_status),
    externalInvoiceId: invoiceId,
    externalInvoiceNumber: text(row?.external_document_number),
    xeroInvoiceUrl: tenantId && invoiceId
      ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`
      : null,
    attachmentStatus: text(row?.attachment_status),
    lastError: text(row?.attachment_error_message) ?? text(row?.last_error_message),
    activeJobKind: text(view.resolved?.activeJob?.job_kind),
    activeQueueState: text(view.resolved?.activeJob?.queue_state),
  };
}

export async function enqueueRetentionClaimXeroSync(retentionClaimId: string) {
  const state = await loadRetentionClaimXeroResolved(retentionClaimId, true);
  if (!state.access.succeeded || !state.resolved || state.blockers.length > 0) {
    return {
      succeeded: false,
      errorCode: state.access.errorCode ?? state.blockers[0]?.code ?? "not_ready",
    };
  }
  const value = state.resolved;
  if (!value.document) {
    return { succeeded: false, errorCode: "document_missing" };
  }
  if (text(value.accountingDocument?.external_document_id)) {
    return { succeeded: false, errorCode: "invoice_already_exists" };
  }
  const costMeta = meta(value.costCode);
  const payload = buildRetentionClaimXeroPayload({
    source: value.source,
    projectName: String(value.project.name),
    contactId: value.contactId,
    accountCode: String(value.costCode.external_code),
    taxType: String(value.taxRate.tax_type),
    taxRateBasisPoints: Math.round(Number(value.taxRate.effective_rate) * 100),
    currencyCode: text(value.organization.default_currency) ?? "NZD",
  });
  const admin = db(await createAdminSupabaseClient());
  const result = await admin.rpc("prepare_retention_claim_xero_sync", {
    p_retention_claim_id: retentionClaimId,
    p_actor_user_id: state.access.actorUserId,
    p_connection_id: value.connection.id,
    p_tenant_id: value.connection.tenant_id,
    p_retention_document_id: value.document.id,
    p_retention_source_evidence_hash: state.access.retentionSourceEvidenceHash,
    p_retention_pdf_sha256: value.document.pdf_sha256,
    p_payload_sha256: payload.payloadSha256,
    p_idempotency_key: payload.idempotencyKey,
    p_contact_id: value.contactId,
    p_invoice_number: payload.payload.InvoiceNumber,
    p_reference: payload.payload.Reference,
    p_invoice_date: payload.payload.Date,
    p_due_date: payload.payload.DueDate,
    p_subtotal_excl_tax: payload.subtotalExclTax,
    p_tax_total: payload.taxTotal,
    p_total: payload.total,
    p_retention_mapping_id: value.mapping.id,
    p_organization_cost_code_id: value.costCode.id,
    p_xero_account_id: costMeta.accountId,
    p_xero_account_code: value.costCode.external_code,
    p_tax_rate_id: value.taxRate.id,
    p_xero_tax_type: value.taxRate.tax_type,
    p_tax_rate_basis_points: 1500,
    p_payload_snapshot: payload.payload,
    p_lines: payload.lines,
    p_correlation_id: crypto.randomUUID(),
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as { succeeded: boolean; errorCode: string | null };
}

export async function enqueueRetentionClaimXeroAttachment(
  retentionClaimId: string,
) {
  const state = await loadRetentionClaimXeroResolved(retentionClaimId, true);
  if (!state.access.succeeded || !state.resolved?.accountingDocument) {
    return { succeeded: false, errorCode: state.access.errorCode ?? "accounting_document_missing" };
  }
  const admin = db(await createAdminSupabaseClient());
  const result = await admin.rpc("queue_retention_claim_xero_attachment", {
    p_accounting_document_id: state.resolved.accountingDocument.id,
    p_actor_user_id: state.access.actorUserId,
    p_correlation_id: crypto.randomUUID(),
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as { succeeded: boolean; errorCode: string | null };
}
