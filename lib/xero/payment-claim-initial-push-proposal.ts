import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";
import {
  buildPaymentClaimPdfExportModelServer,
  generatePaymentClaimPdfBundleServer,
} from "@/lib/exports/payment-claim-pdf-server";
import { hashAccountingEvidence } from "@/lib/accounting/accounting-evidence";
import {
  buildInitialPushLineEvidence,
  calculateInitialPushHashes,
  PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
  type PaymentClaimInitialPushProposal,
} from "@/lib/xero/payment-claim-initial-push-contract";
import {
  buildPaymentClaimXeroPayloadFromResolvedSnapshot,
  PaymentClaimXeroPayloadError,
} from "@/lib/xero/payment-claim-sales-invoice-payload";
import { buildPaymentClaimXeroCurrentStateHashFromPayload } from "@/lib/xero/payment-claim-sales-invoice-hash";
import {
  evaluatePaymentClaimXeroReadinessSnapshot,
  resolvePaymentClaimXeroDependencies,
  resolvePaymentClaimXeroReadinessContext,
} from "@/lib/xero/payment-claim-readiness";
import { resolvePaymentClaimAccountingOperationForState } from "@/lib/xero/payment-claim-accounting-decision-server";
import type { XeroActionTiming } from "@/lib/xero/action-performance";

type Row = Record<string, unknown>;
type Admin = {
  // Phase 2B objects intentionally precede generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

const PROPOSAL_TTL_MS = 10 * 60 * 1_000;

function db(client: ReturnType<typeof createAdminSupabaseClient>) {
  return client as unknown as Admin;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function rowMetadata(row: Row | null) {
  return row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
}

function proposalSecret() {
  return getSupabaseServiceRoleEnv().serviceRoleKey;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", proposalSecret()).update(value).digest("base64url");
}

export function createInitialPushProposalToken(proposal: PaymentClaimInitialPushProposal) {
  const body = base64Url(JSON.stringify({
    version: 1,
    proposalId: proposal.proposalId,
    organizationId: proposal.organizationId,
    projectId: proposal.projectId,
    claimId: proposal.claimId,
    previewHash: proposal.previewHash,
    expiresAt: proposal.expiresAt,
  }));
  return `${body}.${sign(body)}`;
}

export function verifyInitialPushProposalToken(token: string) {
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
    claimId: string;
    previewHash: string;
    expiresAt: string;
  };
  if (parsed.version !== 1 || Date.parse(parsed.expiresAt) <= Date.now()) {
    throw new Error("The accounting preview has expired. Review the latest values before confirming.");
  }
  return parsed;
}

export async function isPaymentClaimInitialPushEnabled(organizationId: string) {
  const admin = db(createAdminSupabaseClient());
  const result = await admin.from("organization_accounting_phase2b_settings")
    .select("initial_payment_claim_push_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data?.initial_payment_claim_push_enabled === true;
}

async function buildPaymentClaimPushProposalWithArtifact(params: {
  organizationId: string;
  claimId: string;
}, artifact?: {
  pdfBase64: string;
  paymentClaimLines: unknown;
  statutoryDocumentsIncluded: string[];
}, timing?: XeroActionTiming, prepared?: {
  featureEnabled?: boolean;
}): Promise<PaymentClaimInitialPushProposal> {
  const featureEnabledPromise = prepared?.featureEnabled === undefined
    ? timing
      ? timing.span(
          "feature_gate",
          () => isPaymentClaimInitialPushEnabled(params.organizationId),
          {
            databaseOperation:
              "organization_accounting_phase2b_settings.maybeSingle",
          },
        )
      : isPaymentClaimInitialPushEnabled(params.organizationId)
    : Promise.resolve(prepared.featureEnabled);
  const readinessPromise = timing
    ? timing.span(
        "claim_readiness",
        () => resolvePaymentClaimXeroReadinessContext(params),
      )
    : resolvePaymentClaimXeroReadinessContext(params);
  const [featureEnabled, resolution] = await Promise.all([
    featureEnabledPromise,
    readinessPromise,
  ]);
  if (!featureEnabled) {
    throw new Error("Immutable Payment Claim Push to Xero is not enabled for this organisation.");
  }
  if (!resolution.snapshot) {
    throw new Error(resolution.terminalReadiness.blockers[0]?.message ?? "Payment Claim not found.");
  }
  const dependencies = resolvePaymentClaimXeroDependencies(resolution.snapshot);
  const readiness = evaluatePaymentClaimXeroReadinessSnapshot(resolution.snapshot);
  if (!readiness.ready) {
    const taxResolution = dependencies.revenueTaxResolution;
    throw new PaymentClaimXeroPayloadError(
      "not_ready",
      readiness.blockers[0]?.message ?? "Payment Claim is not ready.",
      {
        organizationId: params.organizationId,
        claimId: params.claimId,
        accountTaxType: taxResolution.status === "resolved"
          ? taxResolution.externalTaxType
          : taxResolution.accountTaxType,
        selectedTaxType: typeof dependencies.revenueTaxRate?.tax_type === "string"
          ? dependencies.revenueTaxRate.tax_type
          : null,
        selectedTaxRateId: typeof dependencies.revenueTaxRate?.id === "string"
          ? dependencies.revenueTaxRate.id
          : null,
        selectedEffectiveRate: Number.isFinite(Number(dependencies.revenueTaxRate?.effective_rate))
          ? Number(dependencies.revenueTaxRate?.effective_rate)
          : null,
      },
    );
  }
  const admin = db(createAdminSupabaseClient());
  const currentHash = buildPaymentClaimXeroCurrentStateHashFromPayload({
    snapshot: resolution.snapshot,
    payloadResult: buildPaymentClaimXeroPayloadFromResolvedSnapshot(resolution.snapshot),
  }).hash;
  const decisionPromise = timing
    ? timing.span("accounting_decision", () =>
        resolvePaymentClaimAccountingOperationForState({
          organizationId: params.organizationId,
          claimNumber: text(resolution.snapshot!.claim.claim_number),
          readiness,
          currentHash,
          document: dependencies.accountingDocument ?? null,
          connection: resolution.snapshot!.connection,
          hasPushPermission: true,
          featureEnabled,
        }))
    : resolvePaymentClaimAccountingOperationForState({
        organizationId: params.organizationId,
        claimNumber: text(resolution.snapshot.claim.claim_number),
        readiness,
        currentHash,
        document: dependencies.accountingDocument ?? null,
        connection: resolution.snapshot.connection,
        hasPushPermission: true,
        featureEnabled,
      });
  const retentionPromise = timing
    ? timing.span("retention_ownership", () =>
        admin.rpc("evaluate_retention_ownership_phase2a", {
          p_organization_id: params.organizationId,
          p_project_id: String(resolution.snapshot!.project.id),
          p_proposals: [],
        }), {
          databaseOperation: "evaluate_retention_ownership_phase2a",
        })
    : admin.rpc("evaluate_retention_ownership_phase2a", {
        p_organization_id: params.organizationId,
        p_project_id: String(resolution.snapshot.project.id),
        p_proposals: [],
      });
  const [decision, retention] = await Promise.all([
    decisionPromise,
    retentionPromise,
  ]);
  if (
    !decision.canPush
    || ![
      "INITIAL_EXPORT",
      "REPLACEMENT_EXPORT",
      "ACCOUNTING_UPDATE",
    ].includes(decision.operation)
  ) {
    throw new Error(decision.blockers[0]?.message ?? "This Payment Claim cannot be pushed to Xero.");
  }

  if (retention.error) throw new Error(retention.error.message);
  if (retention.data?.valid !== true) {
    throw new Error("Retention ownership must be resolved before this Payment Claim can be pushed.");
  }

  const payloadResult = buildPaymentClaimXeroPayloadFromResolvedSnapshot(resolution.snapshot);
  const invoiceNumber = decision.operation === "ACCOUNTING_UPDATE"
    ? text(dependencies.accountingDocument?.external_document_number)
    : decision.replacementNumber
      ?? text(resolution.snapshot.claim.claim_number);
  const payloadTemplate = { ...payloadResult.payload, InvoiceNumber: invoiceNumber };
  const organizationCountry = text(
    resolution.snapshot.organization.country,
  ).toUpperCase();
  const requiresPdf =
    decision.operation !== "ACCOUNTING_UPDATE"
    && ["NZ", "NZL", "NEW ZEALAND"].includes(organizationCountry);
  const pdf = !requiresPdf || artifact
    ? null
    : await (timing
      ? timing.span(
          "payment_claim_pdf_bundle",
          () => generatePaymentClaimPdfBundleServer(params, timing),
        )
      : generatePaymentClaimPdfBundleServer(params, timing));
  const pdfBytes = !requiresPdf
    ? null
    : artifact
      ? Uint8Array.from(Buffer.from(artifact.pdfBase64, "base64"))
      : Uint8Array.from(pdf!.bytes);
  const pdfModelHash = !requiresPdf
    ? null
    : hashAccountingEvidence(
        pdf?.model ?? {
          paymentClaimLines: artifact?.paymentClaimLines,
          statutoryDocumentsIncluded: artifact?.statutoryDocumentsIncluded,
        },
        PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
      );
  const claim = resolution.snapshot.claim;
  const project = resolution.snapshot.project;
  const organization = resolution.snapshot.organization;
  const contact = dependencies.importedContact!;
  const salesAccount = dependencies.salesAccount!;
  const retentionAccount = dependencies.retentionAccount;
  const tax = dependencies.revenueTaxRate!;
  const subtotalMinor = Math.round(payloadResult.reconciliation.subtotal * 100);
  const taxMinor = Math.round(payloadResult.reconciliation.gst * 100);
  const totalMinor = Math.round(payloadResult.reconciliation.total * 100);
  const lines = buildInitialPushLineEvidence({
    claimId: params.claimId,
    payload: payloadTemplate,
    subtotalMinor,
    taxMinor,
  });
  const sourceEvidence = {
    claim,
    project: { id: project.id, name: project.name, clientId: project.client_id },
    paymentClaimLines:
      artifact?.paymentClaimLines
      ?? pdf?.model.lineItems
      ?? payloadTemplate.LineItems,
  };
  const commercialSnapshot = {
    commercialClaimNumber: claim.claim_number,
    claimTitle: claim.claim_title,
    invoiceDate: claim.claim_date,
    dueDate: claim.due_date,
    revenueAmountMinor: Math.round(payloadResult.reconciliation.revenueAmount * 100),
    retentionMovementMinor: Math.round(payloadResult.reconciliation.signedRetentionAmount * 100),
    subtotalMinor,
    taxMinor,
    totalMinor,
    currentStateHash: buildPaymentClaimXeroCurrentStateHashFromPayload({
      snapshot: resolution.snapshot,
      payloadResult,
    }).hash,
  };
  const contactSnapshot = {
    contactId: contact.contact_id,
    name: contact.name ?? contact.contact_name ?? resolution.snapshot.client?.name,
    linkId: dependencies.contactLink?.id,
    connectionId: dependencies.connectionId,
    tenantId: dependencies.tenantId,
  };
  const routingSnapshot = {
    sales: { accountingRoute: "payment_claim_revenue", mappingId: dependencies.salesMapping?.id, accountId: salesAccount.id, accountCode: salesAccount.external_code },
    retention: retentionAccount
      ? { accountingRoute: "retention_receivable", mappingId: dependencies.retentionMapping?.id, accountId: retentionAccount.id, accountCode: retentionAccount.external_code }
      : null,
  };
  const taxSnapshot = {
    taxRateId: tax.id,
    taxType: tax.tax_type,
    effectiveRate: tax.effective_rate,
  };
  const activeRevisionId = text(dependencies.accountingDocument?.active_accounting_revision_id) || null;
  const readinessEvidence = {
    operation: decision.operation,
    accountingState: decision.accountingState,
    previousRevisionId: activeRevisionId,
    previousInvoiceId: text(dependencies.accountingDocument?.external_document_id) || null,
    previousInvoiceNumber: text(dependencies.accountingDocument?.external_document_number) || null,
    previousObservationId: decision.latestObservationId ?? null,
    predecessorObservationHash: decision.predecessorObservationHash ?? null,
    connectionId: dependencies.connectionId,
    tenantId: dependencies.tenantId,
    contactUpdatedAt: dependencies.contactLink?.updated_at,
    salesMappingUpdatedAt: dependencies.salesMapping?.updated_at,
    retentionMappingUpdatedAt: dependencies.retentionMapping?.updated_at ?? null,
    taxSyncedAt: tax.synced_at,
    retention,
  };
  const hashes = calculateInitialPushHashes({
    sourceEvidence,
    commercialSnapshot,
    lines,
    readinessEvidence,
    payloadTemplate,
    pdfBytes,
  });
  const proposalId = randomUUID();
  return {
    operation: decision.operation as PaymentClaimInitialPushProposal["operation"],
    previousRevisionId: activeRevisionId,
    previousInvoiceId: text(dependencies.accountingDocument?.external_document_id) || null,
    previousInvoiceNumber: text(dependencies.accountingDocument?.external_document_number) || null,
    previousObservationId: decision.latestObservationId ?? null,
    predecessorObservationHash: decision.predecessorObservationHash ?? null,
    confirmationTitle: decision.confirmationTitle!,
    confirmationMessage: decision.confirmationMessage!,
    proposalId,
    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
    organizationId: params.organizationId,
    organizationName: text(organization.name),
    projectId: String(project.id),
    projectName: text(project.name),
    claimId: params.claimId,
    accountingDocumentId: text(dependencies.accountingDocument?.id) || null,
    claimNumber: text(claim.claim_number),
    claimTitle: text(claim.claim_title),
    invoiceNumber,
    sourceOptimisticRevision: text(claim.updated_at),
    connectionId: dependencies.connectionId!,
    tenantId: dependencies.tenantId!,
    xeroOrganizationName: text(rowMetadata(resolution.snapshot.connection).tenantName)
      || text(resolution.snapshot.connection?.tenant_name)
      || "the selected Xero organisation",
    contactId: text(contact.contact_id),
    contactName: text(contact.name) || text(contact.contact_name) || text(resolution.snapshot.client?.name),
    reference: payloadTemplate.Reference,
    invoiceDate: payloadTemplate.Date,
    dueDate: payloadTemplate.DueDate,
    currencyCode: payloadTemplate.CurrencyCode,
    lineAmountType: "Exclusive",
    providerDocumentType: "ACCREC",
    requestedProviderStatus: "AUTHORISED",
    lines,
    revenueAmountMinor: commercialSnapshot.revenueAmountMinor,
    retentionMovementMinor: commercialSnapshot.retentionMovementMinor,
    subtotalMinor,
    taxMinor,
    totalMinor,
    sourceEvidence,
    commercialSnapshot,
    contactSnapshot,
    routingSnapshot,
    taxSnapshot,
    payloadTemplate,
    ...hashes,
    pdfModelHash,
    pdfByteSize: pdfBytes?.byteLength ?? 0,
    pdfBase64: pdfBytes ? Buffer.from(pdfBytes).toString("base64") : null,
    statutoryDocumentsIncluded: requiresPdf
      ? artifact?.statutoryDocumentsIncluded
        ?? pdf!.statutoryDocumentsIncluded.map((document) => document.id)
      : [],
  };
}

export async function buildPaymentClaimPushProposal(params: {
  organizationId: string;
  claimId: string;
}, timing?: XeroActionTiming, prepared?: {
  featureEnabled?: boolean;
}): Promise<PaymentClaimInitialPushProposal> {
  return buildPaymentClaimPushProposalWithArtifact(
    params,
    undefined,
    timing,
    prepared,
  );
}

export async function validatePaymentClaimProposalStillCurrent(
  proposal: PaymentClaimInitialPushProposal,
) {
  if (proposal.operation === "ACCOUNTING_UPDATE") {
    const current = await buildPaymentClaimPushProposalWithArtifact({
      organizationId: proposal.organizationId,
      claimId: proposal.claimId,
    });
    return {
      pdfModelChanged: false,
      valid:
        current.projectId === proposal.projectId
        && current.previewHash === proposal.previewHash,
      current,
    };
  }
  const [currentPdf, current] = await Promise.all([
    buildPaymentClaimPdfExportModelServer({
      organizationId: proposal.organizationId,
      claimId: proposal.claimId,
    }),
    buildPaymentClaimPushProposalWithArtifact({
      organizationId: proposal.organizationId,
      claimId: proposal.claimId,
    }, {
      pdfBase64: proposal.pdfBase64!,
      paymentClaimLines: proposal.sourceEvidence.paymentClaimLines,
      statutoryDocumentsIncluded: proposal.statutoryDocumentsIncluded,
    }),
  ]);
  const currentPdfModelHash = hashAccountingEvidence(
    currentPdf.model,
    PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
  );
  return {
    pdfModelChanged: currentPdfModelHash !== proposal.pdfModelHash,
    valid:
      current.projectId === proposal.projectId
      && current.previewHash === proposal.previewHash
      && currentPdfModelHash === proposal.pdfModelHash,
    current,
  };
}

export async function persistPaymentClaimPushProposal(params: {
  proposal: PaymentClaimInitialPushProposal;
  createdBy: string;
}) {
  const proposal = params.proposal;
  const admin = db(createAdminSupabaseClient());
  const result = await admin.rpc("persist_payment_claim_push_proposal_phase2c", {
    p_input: {
      proposalId: proposal.proposalId,
      organizationId: proposal.organizationId,
      projectId: proposal.projectId,
      claimId: proposal.claimId,
      accountingDocumentId: proposal.accountingDocumentId,
      activeRevisionId: proposal.previousRevisionId,
      operation: proposal.operation,
      externalDocumentNumber: proposal.invoiceNumber,
      previewHash: proposal.previewHash,
      sourceOptimisticRevision: proposal.sourceOptimisticRevision,
      decisionSnapshot: {
      operation: proposal.operation,
      confirmationTitle: proposal.confirmationTitle,
      confirmationMessage: proposal.confirmationMessage,
      previousRevisionId: proposal.previousRevisionId,
      previousInvoiceId: proposal.previousInvoiceId,
      previousInvoiceNumber: proposal.previousInvoiceNumber,
      previousObservationId: proposal.previousObservationId,
      predecessorObservationHash: proposal.predecessorObservationHash,
      connectionId: proposal.connectionId,
      tenantId: proposal.tenantId,
      },
      evidenceHashes: {
      sourceEvidenceHash: proposal.sourceEvidenceHash,
      commercialHash: proposal.commercialHash,
      linesHash: proposal.linesHash,
      readinessHash: proposal.readinessHash,
      dependencyHash: proposal.dependencyHash,
      previewHash: proposal.previewHash,
      pdfHash: proposal.pdfHash,
      pdfModelHash: proposal.pdfModelHash,
      payloadHash: proposal.payloadHash,
      },
      expiresAt: proposal.expiresAt,
      createdBy: params.createdBy,
    },
  });
  if (result.error) throw new Error(result.error.message);
}

export async function buildPaymentClaimInitialPushProposal(params: {
  organizationId: string;
  claimId: string;
}) {
  const proposal = await buildPaymentClaimPushProposal(params);
  if (proposal.operation !== "INITIAL_EXPORT") {
    throw new Error("This Payment Claim requires a different immutable accounting operation.");
  }
  return proposal;
}

export async function buildPaymentClaimAccountingUpdateProposal(params: {
  organizationId: string;
  claimId: string;
}) {
  const proposal = await buildPaymentClaimPushProposal(params);
  if (proposal.operation !== "ACCOUNTING_UPDATE") {
    throw new Error(
      "This Payment Claim does not require an immutable same-invoice amendment.",
    );
  }
  return proposal;
}

export function toInitialPushPreview(proposal: PaymentClaimInitialPushProposal) {
  const replacementSuffix = proposal.invoiceNumber.match(/-R([1-9][0-9]*)$/)?.[1];
  const replacementRevision = replacementSuffix ? Number(replacementSuffix) + 1 : null;
  const safeClaimNumber = proposal.claimNumber.replace(/[^A-Za-z0-9._-]+/g, "-") || "Payment-Claim";
  return {
    proposalId: proposal.proposalId,
    expiresAt: proposal.expiresAt,
    organizationName: proposal.organizationName,
    xeroOrganizationName: proposal.xeroOrganizationName,
    projectName: proposal.projectName,
    claimNumber: proposal.claimNumber,
    claimTitle: proposal.claimTitle,
    operation: proposal.operation,
    confirmationTitle: proposal.confirmationTitle,
    confirmationMessage: proposal.confirmationMessage,
    previousInvoiceNumber: proposal.previousInvoiceNumber,
    contactName: proposal.contactName,
    reference: proposal.reference,
    invoiceDate: proposal.invoiceDate,
    dueDate: proposal.dueDate,
    currencyCode: proposal.currencyCode,
    lineAmountType: proposal.lineAmountType,
    providerDocumentType: proposal.providerDocumentType,
    requestedProviderStatus: proposal.requestedProviderStatus,
    invoiceNumber: proposal.invoiceNumber,
    lines: proposal.lines.map((line) => ({
      sequence: line.sequence,
      description: line.description,
      amountExcludingTaxMinor: line.lineAmountMinor,
      accountCode: String(line.accountSnapshot.accountCode ?? ""),
      taxType: String(line.taxSnapshot.taxType ?? ""),
      taxMinor: line.taxMinor,
      retentionClassification: line.lineKind === "retention" ? "Retention movement" : null,
    })),
    revenueAmountMinor: proposal.revenueAmountMinor,
    retentionMovementMinor: proposal.retentionMovementMinor,
    subtotalMinor: proposal.subtotalMinor,
    taxMinor: proposal.taxMinor,
    totalMinor: proposal.totalMinor,
    pdfFilename: proposal.operation === "ACCOUNTING_UPDATE"
      ? null
      : proposal.operation === "INITIAL_EXPORT"
        ? `${proposal.invoiceNumber}-r0001-${safeClaimNumber}.pdf`
        : `${proposal.invoiceNumber}-r${String(replacementRevision ?? 2).padStart(4, "0")}.pdf`,
  };
}

export type PaymentClaimInitialPushPreview = ReturnType<typeof toInitialPushPreview>;
