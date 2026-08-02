import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";
import {
  loadRetentionClaimXeroResolved,
} from "@/lib/xero/retention-claim-sales-invoice";
import {
  buildDirectInheritedRetentionClaimXeroPayload,
  type RetentionClaimXeroSource,
} from "@/lib/xero/retention-claim-sales-invoice-payload";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import {
  buildRetentionClaimRevisionLines,
  calculateRetentionClaimPushHashes,
  type RetentionClaimPushProposal,
} from "@/lib/xero/retention-claim-push-contract";
import { resolveRetentionClaimAccountingOperationForState } from "@/lib/xero/retention-claim-accounting-decision-server";
import { resolveRetentionClaimProposalInvoiceNumber } from "@/lib/xero/retention-claim-proposal-identity";
import type { XeroActionTiming } from "@/lib/xero/action-performance";
import { proposalDecisionError } from "@/lib/xero/retention-claim-proposal-decision-error";
import {
  loadDirectRetentionOriginEvidence,
} from "@/lib/xero/retention-claim-direct-origin-evidence-server";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 2C objects intentionally precede generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

const PROPOSAL_TTL_MS = 10 * 60 * 1000;

function admin() {
  return createAdminSupabaseClient() as unknown as Admin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function metadata(row: Row | null) {
  return row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Row
    : {};
}

function tokenSecret() {
  return getSupabaseServiceRoleEnv().serviceRoleKey;
}

function sign(body: string) {
  return createHmac("sha256", tokenSecret()).update(body).digest("base64url");
}

export function createRetentionClaimPushProposalToken(
  proposal: RetentionClaimPushProposal,
) {
  const body = Buffer.from(JSON.stringify({
    version: 1,
    proposalId: proposal.proposalId,
    organizationId: proposal.organizationId,
    projectId: proposal.projectId,
    retentionClaimId: proposal.retentionClaimId,
    previewHash: proposal.previewHash,
    expiresAt: proposal.expiresAt,
  })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyRetentionClaimPushProposalToken(token: string) {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new Error("The accounting preview token is invalid.");
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("The accounting preview token is invalid.");
  }
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    version: number;
    proposalId: string;
    organizationId: string;
    projectId: string;
    retentionClaimId: string;
    previewHash: string;
    expiresAt: string;
  };
  if (parsed.version !== 1 || Date.parse(parsed.expiresAt) <= Date.now()) {
    throw new Error("The accounting preview has expired. Review the latest values before confirming.");
  }
  return parsed;
}

export async function isRetentionClaimImmutableXeroEnabled(organizationId: string) {
  const result = await admin().from("organization_accounting_phase2b_settings")
    .select("retention_claim_immutable_xero_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  // Rollout is fail-closed, including during an application-before-migration
  // deployment window.
  if (result.error) return false;
  return result.data?.retention_claim_immutable_xero_enabled === true;
}

export async function buildRetentionClaimPushProposal(params: {
  organizationId: string;
  retentionClaimId: string;
  hasPushPermission?: boolean;
}, timing?: XeroActionTiming, prepared?: {
  featureEnabled?: boolean;
}): Promise<RetentionClaimPushProposal> {
  const featureEnabledPromise = prepared?.featureEnabled === undefined
    ? timing
      ? timing.span(
          "feature_gate",
          () => isRetentionClaimImmutableXeroEnabled(params.organizationId),
          {
            databaseOperation:
              "organization_accounting_phase2b_settings.maybeSingle",
          },
        )
      : isRetentionClaimImmutableXeroEnabled(params.organizationId)
    : Promise.resolve(prepared.featureEnabled);
  const statePromise = timing
    ? timing.span(
        "master_source_load",
        () => loadRetentionClaimXeroResolved(
          params.retentionClaimId,
          true,
          true,
        ),
      )
    : loadRetentionClaimXeroResolved(
        params.retentionClaimId,
        true,
        true,
      );
  const [featureEnabled, state] = await Promise.all([
    featureEnabledPromise,
    statePromise,
  ]);
  if (!state.access.succeeded || !state.resolved) {
    throw new Error(state.blockers[0]?.message ?? "Retention Claim readiness could not be resolved.");
  }
  if (state.blockers.length > 0) throw new Error(state.blockers[0].message);
  const resolved = state.resolved;
  if (resolved.source.claim.organizationId !== params.organizationId) {
    throw new Error("The Retention Claim belongs to another organisation.");
  }
  const originEvidence = resolved.originEvidence;
  if (!originEvidence) {
    throw new Error(
      "The originating Payment Claim retention tax evidence could not be resolved.",
    );
  }

  const ownership = timing
    ? await timing.span("retention_ownership", () =>
        admin().rpc("evaluate_retention_ownership_phase2a", {
          p_organization_id: params.organizationId,
          p_project_id: resolved.source.claim.projectId,
          p_proposals: [],
        }), {
          databaseOperation: "evaluate_retention_ownership_phase2a",
        })
    : await admin().rpc("evaluate_retention_ownership_phase2a", {
        p_organization_id: params.organizationId,
        p_project_id: resolved.source.claim.projectId,
        p_proposals: [],
      });
  if (ownership.error) throw new Error(ownership.error.message);
  const ownershipValid = ownership.data?.valid === true;
  if (!ownershipValid) {
    throw new Error("Retention ownership changed. Review the Retention Claim before pushing.");
  }

  const payloadResult = buildDirectInheritedRetentionClaimXeroPayload({
    source: resolved.source,
    projectName: text(resolved.project.name),
    contactId: resolved.contactId,
    routeAccountCode: text(resolved.costCode.external_code),
    configuredDefaultTaxType: text(resolved.taxRate.tax_type),
    evidence: originEvidence,
  });
  const sourceStateHash = text(resolved.source.claim.submissionStateHash);
  const decision = timing
    ? await timing.span("accounting_decision", () =>
        resolveRetentionClaimAccountingOperationForState({
          organizationId: params.organizationId,
          claimNumber: resolved.source.claim.claimNumber,
          sourceStateHash,
          issueDate: resolved.source.claim.issueDate,
          dueDate: resolved.source.claim.dueDate,
          readinessReady: true,
          retentionOwnershipValid: ownershipValid,
          document: resolved.accountingDocument,
          connection: resolved.connection as unknown as Row,
          hasPushPermission: params.hasPushPermission ?? true,
          featureEnabled,
          desiredSubtotalMinor:
            Math.round(payloadResult.subtotalExclTax * 100),
          desiredTaxMinor: Math.round(payloadResult.taxTotal * 100),
          desiredTotalMinor: Math.round(payloadResult.total * 100),
          desiredTaxType: originEvidence.taxType,
          desiredOriginRevisionLineId:
            originEvidence.originAccountingRevisionLineId,
        }))
    : await resolveRetentionClaimAccountingOperationForState({
        organizationId: params.organizationId,
        claimNumber: resolved.source.claim.claimNumber,
        sourceStateHash,
        issueDate: resolved.source.claim.issueDate,
        dueDate: resolved.source.claim.dueDate,
        readinessReady: true,
        retentionOwnershipValid: ownershipValid,
        document: resolved.accountingDocument,
        connection: resolved.connection as unknown as Row,
        hasPushPermission: params.hasPushPermission ?? true,
        featureEnabled,
        desiredSubtotalMinor:
          Math.round(payloadResult.subtotalExclTax * 100),
        desiredTaxMinor: Math.round(payloadResult.taxTotal * 100),
        desiredTotalMinor: Math.round(payloadResult.total * 100),
        desiredTaxType: originEvidence.taxType,
        desiredOriginRevisionLineId:
          originEvidence.originAccountingRevisionLineId,
      });
  if (!decision.canPush) {
    const decisionBlocker = decision.blockers[0];
    if (decisionBlocker) throw proposalDecisionError(decisionBlocker);
    throw new Error("This Retention Claim cannot be pushed to Xero.");
  }
  if (decision.operation === "LEGACY_ADOPTION_REQUIRED") {
    throw new Error("The historical Retention Claim invoice must be adopted before preview.");
  }
  if (![
    "INITIAL_EXPORT",
    "UPDATE_EXISTING_INVOICE",
    "REPLACEMENT_EXPORT",
  ].includes(decision.operation)) {
    throw new Error("The Retention Claim requires a different accounting operation.");
  }

  const invoiceNumber = resolveRetentionClaimProposalInvoiceNumber({
    operation: decision.operation,
    claimNumber: resolved.source.claim.claimNumber,
    activeInvoiceNumber: decision.activeRevisionInvoiceNumber,
    replacementNumber: decision.replacementNumber,
  });
  const payload = { ...payloadResult.payload, InvoiceNumber: invoiceNumber };
  const lines = buildRetentionClaimRevisionLines({
    payload,
    lines: payloadResult.lines,
    directOriginEvidence: originEvidence,
  });
  const commercialSnapshot = {
    commercialClaimNumber: resolved.source.claim.claimNumber,
    claimTitle: resolved.source.claim.title,
    issueDate: resolved.source.claim.issueDate,
    dueDate: resolved.source.claim.dueDate,
    subtotalMinor: Math.round(payloadResult.subtotalExclTax * 100),
    taxMinor: Math.round(payloadResult.taxTotal * 100),
    totalMinor: Math.round(payloadResult.total * 100),
    currentStateHash: sourceStateHash,
  };
  const contactSnapshot = {
    contactId: resolved.contactId,
    name: text(resolved.contact.name) || text(resolved.contact.contact_name),
    connectionId: resolved.connection.id,
    tenantId: resolved.connection.tenant_id,
  };
  const routingSnapshot = {
    retention: {
      route: 700,
      mappingId: resolved.mapping.id,
      organizationCostCodeId: resolved.costCode.id,
      accountId: metadata(resolved.costCode).accountId,
      accountCode: resolved.costCode.external_code,
    },
  };
  const taxSnapshot = {
    inheritanceContract: originEvidence.contract,
    originAccountingRevisionId:
      originEvidence.originAccountingRevisionId,
    originAccountingRevisionLineId:
      originEvidence.originAccountingRevisionLineId,
    taxRateId: originEvidence.taxRateSnapshotId,
    taxType: originEvidence.taxType,
    effectiveRate: originEvidence.effectiveRate,
  };
  const ownershipSnapshot = ownership.data as Record<string, unknown>;
  const sourceEvidence = {
    source: resolved.source,
    allocations: payloadResult.lines,
    accountingIntent: {
      operation: decision.operation,
      externalDocumentNumber: invoiceNumber,
      previousRevisionId: decision.activeRevisionId,
      predecessorObservationHash: decision.predecessorObservationHash,
    },
  };
  const dependencies = {
    operation: decision.operation,
    previousRevisionId: decision.activeRevisionId,
    predecessorObservationHash: decision.predecessorObservationHash,
    connectionId: resolved.connection.id,
    tenantId: resolved.connection.tenant_id,
    contactId: resolved.contactId,
    mappingUpdatedAt: resolved.mapping.updated_at,
    costCodeUpdatedAt: resolved.costCode.updated_at,
    taxRateSyncedAt: resolved.taxRate.synced_at,
    originEvidence,
    ownership: ownershipSnapshot,
  };
  const previousRevision = decision.activeRevisionId
    ? await admin().from("organization_accounting_document_revisions")
        .select(
          "subtotal_minor,tax_minor,total_minor,"
          + "commercial_snapshot,payload_snapshot",
        )
        .eq("organization_id", params.organizationId)
        .eq("id", decision.activeRevisionId)
        .maybeSingle()
    : { data: null, error: null };
  if (previousRevision.error) throw new Error(previousRevision.error.message);
  const previousLines = decision.activeRevisionId
    ? await admin().from("organization_accounting_revision_lines")
        .select("originating_payment_claim_id")
        .eq("organization_id", params.organizationId)
        .eq("accounting_revision_id", decision.activeRevisionId)
    : { data: [], error: null };
  if (previousLines.error) throw new Error(previousLines.error.message);
  const priorOriginIds = new Set(
    (previousLines.data ?? []).map((line: Row) =>
      text(line.originating_payment_claim_id)
    ),
  );
  const hashes = calculateRetentionClaimPushHashes({
    sourceEvidence,
    dependencies,
    commercialSnapshot,
    lines,
    payload,
  });
  const proposal: RetentionClaimPushProposal = {
    operation: decision.operation as RetentionClaimPushProposal["operation"],
    proposalId: randomUUID(),
    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
    organizationId: params.organizationId,
    organizationName: text(resolved.organization.name),
    projectId: resolved.source.claim.projectId,
    projectName: text(resolved.project.name),
    retentionClaimId: params.retentionClaimId,
    retentionClaimNumber: resolved.source.claim.claimNumber,
    retentionClaimTitle: resolved.source.claim.title,
    sourceOptimisticRevision: resolved.source.claim.submittedAt,
    accountingDocumentId: text(resolved.accountingDocument?.id) || null,
    previousRevisionId: decision.activeRevisionId,
    previousInvoiceId: decision.activeRevisionInvoiceId,
    previousInvoiceNumber: decision.activeRevisionInvoiceNumber,
    previousInvoiceDate:
      text((previousRevision.data?.commercial_snapshot as Row | undefined)?.issueDate)
      || text((previousRevision.data?.payload_snapshot as Row | undefined)?.Date)
      || null,
    previousDueDate:
      text((previousRevision.data?.commercial_snapshot as Row | undefined)?.dueDate)
      || text((previousRevision.data?.payload_snapshot as Row | undefined)?.DueDate)
      || null,
    previousObservationId: decision.latestObservationId,
    predecessorObservationHash: decision.predecessorObservationHash,
    connectionId: resolved.connection.id,
    tenantId: text(resolved.connection.tenant_id),
    xeroOrganizationName: text(metadata(resolved.connection as unknown as Row).tenantName)
      || text((resolved.connection as unknown as Row).tenant_name)
      || "the selected Xero organisation",
    contactId: resolved.contactId,
    contactName: text(resolved.contact.name)
      || text(resolved.contact.contact_name)
      || "the linked client",
    invoiceNumber,
    reference: payload.Reference,
    invoiceDate: payload.Date,
    dueDate: payload.DueDate,
    currencyCode: payload.CurrencyCode,
    lineAmountType: "Exclusive",
    providerDocumentType: "ACCREC",
    requestedProviderStatus: "AUTHORISED",
    lines,
    allocations: payloadResult.lines,
    subtotalMinor: commercialSnapshot.subtotalMinor,
    taxMinor: commercialSnapshot.taxMinor,
    totalMinor: commercialSnapshot.totalMinor,
    previousSubtotalMinor: Number(previousRevision.data?.subtotal_minor ?? 0),
    previousTaxMinor: Number(previousRevision.data?.tax_minor ?? 0),
    previousTotalMinor: Number(previousRevision.data?.total_minor ?? 0),
    differenceMinor:
      commercialSnapshot.totalMinor
      - Number(previousRevision.data?.total_minor ?? 0),
    newlyAddedOriginIds: payloadResult.lines
      .map((line) => line.originatingPaymentClaimId)
      .filter((id) => !priorOriginIds.has(id)),
    sourceEvidence,
    commercialSnapshot,
    contactSnapshot,
    routingSnapshot,
    taxSnapshot,
    ownershipSnapshot,
    payloadTemplate: payload,
    ...hashes,
    retentionSourceEvidenceHash: state.access.retentionSourceEvidenceHash ?? "",
    confirmationTitle: decision.confirmationTitle!,
    confirmationMessage: decision.confirmationMessage!,
  };
  return proposal;
}

type CurrentRetentionSource = {
  succeeded?: boolean;
  organizationId?: string;
  projectId?: string;
  retentionSourceEvidenceHash?: string;
  source?: RetentionClaimXeroSource;
};

function nestedRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : {};
}

export async function validateRetentionClaimProposalStillCurrent(
  proposal: RetentionClaimPushProposal,
): Promise<{
  valid: boolean;
  sourceChanged: boolean;
  ownershipChanged: boolean;
}> {
  const client = admin();
  const routing = nestedRow(proposal.routingSnapshot.retention);
  const [sourceResult, ownership, project, organization, connection, mappings, taxRates] =
    await Promise.all([
      client.rpc("get_retention_claim_xero_source_phase2c", {
        p_retention_claim_id: proposal.retentionClaimId,
      }),
      client.rpc("evaluate_retention_ownership_phase2a", {
        p_organization_id: proposal.organizationId,
        p_project_id: proposal.projectId,
        p_proposals: [],
      }),
      client.from("organization_projects")
        .select("id,organization_id,client_id,name")
        .eq("organization_id", proposal.organizationId)
        .eq("id", proposal.projectId)
        .maybeSingle(),
      client.from("organizations")
        .select("id,country,default_currency,tax_registration_status")
        .eq("id", proposal.organizationId)
        .maybeSingle(),
      client.from("organization_xero_connections")
        .select("id,organization_id,tenant_id,status,scope")
        .eq("organization_id", proposal.organizationId)
        .eq("id", proposal.connectionId)
        .maybeSingle(),
      client.from("organization_tradesstack_accounting_mappings")
        .select("id,organization_id,project_id,organization_cost_code_id,is_active,updated_at")
        .eq("organization_id", proposal.organizationId)
        .eq("provider", "xero")
        .eq("tradesstack_cost_code", 700)
        .eq("is_active", true),
      client.from("organization_accounting_tax_rates")
        .select("id,organization_id,accounting_connection_id,tenant_id,tax_type,effective_rate,status,is_active,metadata,synced_at")
        .eq("organization_id", proposal.organizationId)
        .eq("provider", "xero")
        .eq("accounting_connection_id", proposal.connectionId)
        .eq("tenant_id", proposal.tenantId),
    ]);
  const queryError = [
    sourceResult.error,
    ownership.error,
    organization.error,
    project.error,
    connection.error,
    mappings.error,
    taxRates.error,
  ].find(Boolean);
  if (queryError) throw new Error(queryError.message);

  const currentSource = (sourceResult.data ?? {}) as CurrentRetentionSource;
  const source = currentSource.source;
  const sourceChanged =
    currentSource.succeeded !== true
    || currentSource.organizationId !== proposal.organizationId
    || currentSource.projectId !== proposal.projectId
    || currentSource.retentionSourceEvidenceHash
      !== proposal.retentionSourceEvidenceHash
    || !source
    || source.claim.id !== proposal.retentionClaimId
    || Date.parse(String(source.claim.submittedAt ?? ""))
      !== Date.parse(proposal.sourceOptimisticRevision);
  const ownershipChanged =
    ownership.data?.valid !== true
    || hashAccountingEvidence(ownership.data)
      !== hashAccountingEvidence(proposal.ownershipSnapshot);
  if (
    sourceChanged
    || ownershipChanged
    || !organization.data
    || !project.data
    || !connection.data
  ) {
    return { valid: false, sourceChanged, ownershipChanged };
  }

  const mapping = ((mappings.data ?? []) as Row[])
    .filter((row) =>
      row.project_id === proposal.projectId || row.project_id == null
    )
    .sort(
      (left, right) =>
        Number(right.project_id != null) - Number(left.project_id != null),
    )[0];
  const taxRate = ((taxRates.data ?? []) as Row[]).find((row) => {
    const rowMeta = metadata(row);
    return row.is_active === true
      && text(row.status).toUpperCase() === "ACTIVE"
      && Number.isFinite(Number(row.effective_rate))
      && Number(row.effective_rate) >= 0
      && text(row.tax_type).toUpperCase()
        === text(proposal.taxSnapshot.taxType).toUpperCase()
      && rowMeta.canApplyToRevenue === true;
  });
  if (!mapping || !taxRate) {
    return { valid: false, sourceChanged: false, ownershipChanged: false };
  }
  const [contactLinks, costCode] = await Promise.all([
    client.from("organization_external_contacts")
      .select("id,external_contact_id,accounting_connection_id,tenant_id,link_status")
      .eq("organization_id", proposal.organizationId)
      .eq("provider", "xero")
      .eq("local_entity_type", "client")
      .eq("local_entity_id", String(project.data.client_id ?? "")),
    client.from("organization_cost_codes")
      .select("id,organization_id,is_active,external_provider,external_code,metadata,updated_at")
      .eq("organization_id", proposal.organizationId)
      .eq("id", String(mapping.organization_cost_code_id ?? ""))
      .maybeSingle(),
  ]);
  const dependentError = contactLinks.error ?? costCode.error;
  if (dependentError) throw new Error(dependentError.message);
  const contactLink = ((contactLinks.data ?? []) as Row[]).find((row) =>
    row.accounting_connection_id === proposal.connectionId
    && row.tenant_id === proposal.tenantId
    && row.link_status === "linked"
  );
  const currentContactId = text(contactLink?.external_contact_id);
  const contact = currentContactId
    ? await client.from("organization_xero_contacts")
        .select("contact_id,contact_status")
        .eq("organization_id", proposal.organizationId)
        .eq("connection_id", proposal.connectionId)
        .eq("tenant_id", proposal.tenantId)
        .eq("contact_id", currentContactId)
        .maybeSingle()
    : { data: null, error: null };
  if (contact.error) throw new Error(contact.error.message);

  const costMeta = metadata(costCode.data as Row);
  const taxMeta = metadata(taxRate);
  const currency = text(organization.data.default_currency).toUpperCase();
  const originResolution = await loadDirectRetentionOriginEvidence({
    source,
    connectionId: proposal.connectionId,
    tenantId: proposal.tenantId,
    currencyCode: currency,
    routeAccountCode: text(costCode.data?.external_code),
  });
  if (!originResolution.ok) {
    return { valid: false, sourceChanged: false, ownershipChanged: false };
  }
  const dependenciesValid =
    /^[A-Z]{3}$/.test(currency)
    && connection.data.status === "connected"
    && connection.data.tenant_id === proposal.tenantId
    && Array.isArray(connection.data.scope)
    && connection.data.scope.includes("accounting.invoices")
    && mapping.id === routing.mappingId
    && mapping.is_active === true
    && mapping.organization_cost_code_id
      === routing.organizationCostCodeId
    && costCode.data
    && costCode.data.is_active === true
    && costCode.data.external_provider === "xero"
    && costCode.data.external_code === routing.accountCode
    && text(costMeta.tenantId) === proposal.tenantId
    && currentContactId === proposal.contactId
    && contact.data
    && !["ARCHIVED", "GDPRREQUEST"].includes(
      text(contact.data.contact_status).toUpperCase(),
    )
    && taxRate.accounting_connection_id === proposal.connectionId
    && taxRate.tenant_id === proposal.tenantId
    && taxRate.is_active === true
    && text(taxRate.status).toUpperCase() === "ACTIVE"
    && Number.isFinite(Number(taxRate.effective_rate))
    && Number(taxRate.effective_rate) >= 0
    && taxMeta.canApplyToRevenue === true
    && taxRate.tax_type === proposal.taxSnapshot.taxType;
  if (!dependenciesValid) {
    return { valid: false, sourceChanged: false, ownershipChanged: false };
  }

  const payloadResult = buildDirectInheritedRetentionClaimXeroPayload({
    source,
    projectName: text(project.data.name),
    contactId: currentContactId,
    routeAccountCode: text(costCode.data.external_code),
    configuredDefaultTaxType: text(taxRate.tax_type),
    evidence: originResolution.evidence,
  });
  const payload = {
    ...payloadResult.payload,
    InvoiceNumber: proposal.invoiceNumber,
  };
  const lines = buildRetentionClaimRevisionLines({
    payload,
    lines: payloadResult.lines,
    directOriginEvidence: originResolution.evidence,
  });
  const commercialSnapshot = {
    commercialClaimNumber: source.claim.claimNumber,
    claimTitle: source.claim.title,
    issueDate: source.claim.issueDate,
    dueDate: source.claim.dueDate,
    subtotalMinor: Math.round(payloadResult.subtotalExclTax * 100),
    taxMinor: Math.round(payloadResult.taxTotal * 100),
    totalMinor: Math.round(payloadResult.total * 100),
    currentStateHash: source.claim.submissionStateHash,
  };
  const sourceEvidence = {
    source,
    allocations: payloadResult.lines,
    accountingIntent: {
      operation: proposal.operation,
      externalDocumentNumber: proposal.invoiceNumber,
      previousRevisionId: proposal.previousRevisionId,
      predecessorObservationHash: proposal.predecessorObservationHash,
    },
  };
  const dependencies = {
    operation: proposal.operation,
    previousRevisionId: proposal.previousRevisionId,
    predecessorObservationHash: proposal.predecessorObservationHash,
    connectionId: proposal.connectionId,
    tenantId: proposal.tenantId,
    contactId: currentContactId,
    mappingUpdatedAt: mapping.updated_at,
    costCodeUpdatedAt: costCode.data.updated_at,
    taxRateSyncedAt: taxRate.synced_at,
    originEvidence: originResolution.evidence,
    ownership: ownership.data as Record<string, unknown>,
  };
  const hashes = calculateRetentionClaimPushHashes({
    sourceEvidence,
    dependencies,
    commercialSnapshot,
    lines,
    payload,
  });
  return {
    valid:
      hashes.sourceEvidenceHash === proposal.sourceEvidenceHash
      && hashes.dependencyHash === proposal.dependencyHash
      && hashes.commercialHash === proposal.commercialHash
      && hashes.linesHash === proposal.linesHash
      && hashes.payloadHash === proposal.payloadHash
      && hashes.previewHash === proposal.previewHash,
    sourceChanged: false,
    ownershipChanged: false,
  };
}

export async function persistRetentionClaimPushProposal(params: {
  proposal: RetentionClaimPushProposal;
  createdBy: string;
}) {
  const proposal = params.proposal;
  const result = await admin().rpc("persist_retention_claim_push_proposal_phase2c", {
    p_input: {
      proposalId: proposal.proposalId,
      organizationId: proposal.organizationId,
      projectId: proposal.projectId,
      retentionClaimId: proposal.retentionClaimId,
      accountingDocumentId: proposal.accountingDocumentId,
      activeRevisionId: proposal.previousRevisionId,
      operation: proposal.operation,
      externalDocumentNumber: proposal.invoiceNumber,
      previewHash: proposal.previewHash,
      sourceOptimisticRevision: proposal.sourceOptimisticRevision,
      decisionSnapshot: {
        operation: proposal.operation,
        previousRevisionId: proposal.previousRevisionId,
        previousInvoiceId: proposal.previousInvoiceId,
        previousInvoiceNumber: proposal.previousInvoiceNumber,
        previousInvoiceDate: proposal.previousInvoiceDate,
        previousDueDate: proposal.previousDueDate,
        previousObservationId: proposal.previousObservationId,
        predecessorObservationHash: proposal.predecessorObservationHash,
        connectionId: proposal.connectionId,
        tenantId: proposal.tenantId,
      },
      evidenceHashes: {
        sourceEvidenceHash: proposal.sourceEvidenceHash,
        dependencyHash: proposal.dependencyHash,
        commercialHash: proposal.commercialHash,
        linesHash: proposal.linesHash,
        payloadHash: proposal.payloadHash,
        previewHash: proposal.previewHash,
      },
      expiresAt: proposal.expiresAt,
      createdBy: params.createdBy,
    },
  });
  if (result.error) throw new Error(result.error.message);
}

export function toRetentionClaimPushPreview(
  proposal: RetentionClaimPushProposal,
) {
  return {
    proposalId: proposal.proposalId,
    expiresAt: proposal.expiresAt,
    operation: proposal.operation,
    confirmationTitle: proposal.confirmationTitle,
    confirmationMessage: proposal.confirmationMessage,
    retentionClaimNumber: proposal.retentionClaimNumber,
    projectName: proposal.projectName,
    previousInvoiceId: proposal.previousInvoiceId,
    previousInvoiceNumber: proposal.previousInvoiceNumber,
    previousInvoiceDate: proposal.previousInvoiceDate,
    previousDueDate: proposal.previousDueDate,
    invoiceNumber: proposal.invoiceNumber,
    xeroOrganizationName: proposal.xeroOrganizationName,
    contactName: proposal.contactName,
    reference: proposal.reference,
    invoiceDate: proposal.invoiceDate,
    dueDate: proposal.dueDate,
    currencyCode: proposal.currencyCode,
    lineAmountType: proposal.lineAmountType,
    providerDocumentType: proposal.providerDocumentType,
    requestedProviderStatus: proposal.requestedProviderStatus,
    lines: proposal.lines.map((line) => ({
      sequence: line.sequence,
      description: line.description,
      accountCode: String(line.accountSnapshot.accountCode ?? ""),
      taxType: String(line.taxSnapshot.taxType ?? ""),
      amountMinor: line.lineAmountMinor,
      taxMinor: line.taxMinor,
      totalMinor: line.totalMinor,
      originClaimNumber: String(line.sourceSnapshot.originClaimNumber ?? ""),
      isNewSinceLastPush: proposal.newlyAddedOriginIds.includes(
        line.originatingPaymentClaimId,
      ),
    })),
    previousSubtotalMinor: proposal.previousSubtotalMinor,
    previousTaxMinor: proposal.previousTaxMinor,
    previousTotalMinor: proposal.previousTotalMinor,
    subtotalMinor: proposal.subtotalMinor,
    taxMinor: proposal.taxMinor,
    totalMinor: proposal.totalMinor,
    differenceMinor: proposal.differenceMinor,
    newlyAddedOriginIds: proposal.newlyAddedOriginIds,
    warning: proposal.operation === "UPDATE_EXISTING_INVOICE"
      ? "This will update the existing AUTHORISED Xero invoice after confirmation."
      : "This will create an AUTHORISED Xero invoice after confirmation, not a Draft.",
  };
}
