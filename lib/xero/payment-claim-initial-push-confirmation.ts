import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  initialPushProposalMatchesToken,
  PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
  PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
} from "@/lib/xero/payment-claim-initial-push-contract";
import {
  buildPaymentClaimPushProposal,
  validatePaymentClaimProposalStillCurrent,
  verifyInitialPushProposalToken,
} from "@/lib/xero/payment-claim-initial-push-proposal";
import type {
  PaymentClaimInitialPushProposal,
} from "@/lib/xero/payment-claim-initial-push-contract";
import type { XeroActionTiming } from "@/lib/xero/action-performance";
import type {
  AccountingSyncRequestContext,
} from "@/lib/xero/accounting-sync-request-context";

type UntypedAdmin = {
  // Phase 2B RPC intentionally precedes generated database types.
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: {
      code?: string;
      message: string;
      details?: string | null;
      hint?: string | null;
    } | null;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type StoredProposal = {
  id: string;
  accounting_document_id: string | null;
  active_revision_id: string | null;
  operation: string;
  external_document_number: string;
  source_optimistic_revision: string;
  decision_snapshot: Record<string, unknown>;
  evidence_hashes: Record<string, unknown>;
  expires_at: string;
};

type SpecificStaleCode =
  | "PAYMENT_CLAIM_CHANGED"
  | "ACCOUNTING_STATE_CHANGED"
  | "ACTIVE_REVISION_CHANGED"
  | "XERO_EVIDENCE_CHANGED"
  | "PROPOSAL_EXPIRED";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sameInstant(left: string, right: string) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs)
    && Number.isFinite(rightMs)
    && leftMs === rightMs;
}

export function classifyPaymentClaimProposalStaleness(params: {
  stored: StoredProposal;
  current: {
    sourceOptimisticRevision: string;
    previousRevisionId: string | null;
    predecessorObservationHash: string | null;
    accountingDocumentId: string | null;
    operation: string;
    invoiceNumber: string;
    connectionId: string;
    tenantId: string;
    sourceEvidenceHash: string;
    commercialHash: string;
    linesHash: string;
    readinessHash: string;
    pdfHash: string | null;
  };
  now?: number;
}): { code: SpecificStaleCode; message: string } {
  if (Date.parse(params.stored.expires_at) <= (params.now ?? Date.now())) {
    return {
      code: "PROPOSAL_EXPIRED",
      message: "The accounting preview expired. Review a fresh preview before confirming.",
    };
  }
  if (!sameInstant(
    params.stored.source_optimistic_revision,
    params.current.sourceOptimisticRevision,
  )) {
    return {
      code: "PAYMENT_CLAIM_CHANGED",
      message: "The Payment Claim changed. Review a fresh preview before confirming.",
    };
  }
  if (params.stored.active_revision_id !== params.current.previousRevisionId) {
    return {
      code: "ACTIVE_REVISION_CHANGED",
      message: "The active accounting revision changed. Review a fresh preview before confirming.",
    };
  }
  if (
    text(params.stored.decision_snapshot.predecessorObservationHash)
      !== text(params.current.predecessorObservationHash)
  ) {
    return {
      code: "XERO_EVIDENCE_CHANGED",
      message: "The verified Xero invoice evidence changed. Review a fresh preview before confirming.",
    };
  }
  const evidence = params.stored.evidence_hashes;
  if (
    params.stored.accounting_document_id !== params.current.accountingDocumentId
    || params.stored.operation !== params.current.operation
    || params.stored.external_document_number !== params.current.invoiceNumber
    || text(params.stored.decision_snapshot.connectionId) !== params.current.connectionId
    || text(params.stored.decision_snapshot.tenantId) !== params.current.tenantId
    || text(evidence.sourceEvidenceHash) !== params.current.sourceEvidenceHash
    || text(evidence.commercialHash) !== params.current.commercialHash
    || text(evidence.linesHash) !== params.current.linesHash
    || text(evidence.readinessHash) !== params.current.readinessHash
    || text(evidence.pdfHash) !== text(params.current.pdfHash)
  ) {
    return {
      code: "ACCOUNTING_STATE_CHANGED",
      message: "The accounting information changed. Review a fresh preview before confirming.",
    };
  }
  return {
    code: "ACCOUNTING_STATE_CHANGED",
    message: "The accounting preview changed. Review a fresh preview before confirming.",
  };
}

function classifyConfirmationRpcFailure(message: string) {
  if (/Payment Claim changed/i.test(message)) {
    return {
      code: "PAYMENT_CLAIM_CHANGED" as const,
      message: "The Payment Claim changed. Review a fresh preview before confirming.",
    };
  }
  if (/active Xero invoice changed/i.test(message)) {
    return {
      code: "ACTIVE_REVISION_CHANGED" as const,
      message: "The active accounting revision changed. Review a fresh preview before confirming.",
    };
  }
  if (/previous Xero invoice|payments or credits|replacement eligible/i.test(message)) {
    return {
      code: "XERO_EVIDENCE_CHANGED" as const,
      message: "The verified Xero invoice evidence changed. Review a fresh preview before confirming.",
    };
  }
  if (/changed|stale|tenant|accounting identity|connection/i.test(message)) {
    return {
      code: "ACCOUNTING_STATE_CHANGED" as const,
      message: "The accounting information changed. Review a fresh preview before confirming.",
    };
  }
  return null;
}

export type PaymentClaimInitialPushConfirmation = {
  accountingDocumentId: string;
  accountingRevisionId: string;
  attemptId: string;
  jobId: string;
  invoiceNumber: string;
  revisionSequence: number;
  pdfFilename?: string | null;
  status: "queued" | "processing" | "completed";
};

export class PaymentClaimInitialPushError extends Error {
  constructor(
    readonly code:
      | "unauthorized"
      | "invalid_proposal"
      | "stale_proposal"
      | "not_ready"
      | "confirmation_failed"
      | "payment_update_confirmation_rpc_failed"
      | "payment_update_confirmation_result_invalid"
      | SpecificStaleCode,
    message: string,
    readonly supportReference: string | null = null,
  ) {
    super(message);
    this.name = "PaymentClaimInitialPushError";
  }
}

export async function confirmPaymentClaimPush(params: {
  proposalToken: string;
}, preparedProposal?: PaymentClaimInitialPushProposal, timing?: XeroActionTiming, requestContext?: AccountingSyncRequestContext): Promise<PaymentClaimInitialPushConfirmation> {
  const member = requestContext
    ? {
        organization_id: requestContext.organizationId,
        user_id: requestContext.userId,
      }
    : timing
    ? await timing.span("confirmation_authentication", () =>
        getCurrentOrganizationMember())
    : await getCurrentOrganizationMember();
  const permitted = member
    ? requestContext
      ? requestContext.permissions[PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION]
          === true
      : timing
      ? await timing.span("confirmation_permission", () =>
          hasOrganizationPermission(
            member.organization_id,
            PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
          ))
      : await hasOrganizationPermission(
          member.organization_id,
          PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION,
        )
    : false;
  if (!member || !permitted) {
    throw new PaymentClaimInitialPushError(
      "unauthorized",
      "You do not have permission to Push Payment Claims to Xero.",
    );
  }
  let token;
  try {
    token = verifyInitialPushProposalToken(params.proposalToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The accounting preview is invalid.";
    throw new PaymentClaimInitialPushError(
      /expired/i.test(message) ? "PROPOSAL_EXPIRED" : "invalid_proposal",
      message,
      /expired/i.test(message) ? randomUUID() : null,
    );
  }
  if (token.organizationId !== member.organization_id) {
    throw new PaymentClaimInitialPushError("unauthorized", "The accounting preview belongs to another organisation.");
  }
  if (requestContext && requestContext.claimId !== token.claimId) {
    throw new PaymentClaimInitialPushError(
      "unauthorized",
      "The accounting preview does not match this request.",
    );
  }

  const admin = createAdminSupabaseClient() as unknown as UntypedAdmin;
  const loadStoredProposal = () => admin
      .from("organization_accounting_push_proposals")
      .select(
        "id,accounting_document_id,active_revision_id,operation,external_document_number,"
        + "source_optimistic_revision,decision_snapshot,evidence_hashes,expires_at",
      )
      .eq("id", token.proposalId)
      .eq("organization_id", member.organization_id)
      .eq("source_document_id", token.claimId)
      .maybeSingle();
  const storedResult = timing
    ? await timing.span("confirmation_proposal_read", loadStoredProposal, {
        databaseOperation: "organization_accounting_push_proposals.maybeSingle",
      })
    : await loadStoredProposal();
  if (storedResult.error || !storedResult.data) {
    throw new PaymentClaimInitialPushError(
      "invalid_proposal",
      "The immutable accounting preview could not be loaded.",
    );
  }
  const storedProposal = storedResult.data as StoredProposal;
  if (Date.parse(storedProposal.expires_at) <= Date.now()) {
    throw new PaymentClaimInitialPushError(
      "PROPOSAL_EXPIRED",
      "The accounting preview expired. Review a fresh preview before confirming.",
      randomUUID(),
    );
  }

  let proposal;
  try {
    if (preparedProposal) {
      if (
        preparedProposal.proposalId !== token.proposalId
        || preparedProposal.organizationId !== member.organization_id
        || preparedProposal.claimId !== token.claimId
      ) {
        throw new Error("The prepared accounting proposal identity changed.");
      }
      const validation = timing
        ? await timing.span(
            "confirmation_evidence_validation",
            () => validatePaymentClaimProposalStillCurrent(preparedProposal),
          )
        : await validatePaymentClaimProposalStillCurrent(preparedProposal);
      if (validation.pdfModelChanged) {
        throw new PaymentClaimInitialPushError(
          "PAYMENT_CLAIM_CHANGED",
          "The Payment Claim changed after the accounting preview was created.",
          randomUUID(),
        );
      }
      proposal = validation.valid ? preparedProposal : validation.current;
    } else {
      proposal = timing
        ? await timing.span("confirmation_proposal_rebuild", () =>
            buildPaymentClaimPushProposal({
              organizationId: member.organization_id,
              claimId: token.claimId,
            }, timing))
        : await buildPaymentClaimPushProposal({
            organizationId: member.organization_id,
            claimId: token.claimId,
          });
    }
  } catch (error) {
    if (error instanceof PaymentClaimInitialPushError) throw error;
    throw new PaymentClaimInitialPushError(
      "not_ready",
      error instanceof Error ? error.message : "Payment Claim readiness changed.",
    );
  }
  if (!initialPushProposalMatchesToken({ proposal, token })) {
    const stale = classifyPaymentClaimProposalStaleness({
      stored: storedProposal,
      current: proposal,
    });
    throw new PaymentClaimInitialPushError(
      stale.code,
      stale.message,
      randomUUID(),
    );
  }

  const confirmRpc = () => admin.rpc("confirm_payment_claim_push_phase2c", {
      p_input: {
        operation: proposal.operation,
        organizationId: proposal.organizationId,
        projectId: proposal.projectId,
        claimId: proposal.claimId,
        confirmedBy: member.user_id,
        connectionId: proposal.connectionId,
        tenantId: proposal.tenantId,
        sourceOptimisticRevision: proposal.sourceOptimisticRevision,
        proposalId: token.proposalId,
        previewHash: proposal.previewHash,
        canonicalSchemaVersion: PAYMENT_CLAIM_INITIAL_PUSH_SCHEMA,
        sourceEvidenceHash: proposal.sourceEvidenceHash,
        commercialHash: proposal.commercialHash,
        linesHash: proposal.linesHash,
        dependencyHash: proposal.dependencyHash,
        payloadHash: proposal.payloadHash,
        commercialSnapshot: proposal.commercialSnapshot,
        contactSnapshot: proposal.contactSnapshot,
        routingSnapshot: proposal.routingSnapshot,
        taxSnapshot: proposal.taxSnapshot,
        payloadTemplate: proposal.payloadTemplate,
        lines: proposal.lines,
        subtotalMinor: proposal.subtotalMinor,
        taxMinor: proposal.taxMinor,
        totalMinor: proposal.totalMinor,
        pdfHash: proposal.pdfHash,
        pdfByteSize: proposal.pdfByteSize,
        pdfBase64: proposal.pdfBase64,
        statutoryDocumentsIncluded: proposal.statutoryDocumentsIncluded,
        previousRevisionId: proposal.previousRevisionId,
        previousInvoiceId: proposal.previousInvoiceId,
        previousInvoiceNumber: proposal.previousInvoiceNumber,
        previousObservationId: proposal.previousObservationId,
        externalDocumentNumber: proposal.invoiceNumber,
      },
    });
  const result = timing
    ? await timing.span("confirmation_rpc", confirmRpc, {
        databaseOperation: "confirm_payment_claim_push_phase2c",
      })
    : await confirmRpc();
  if (result.error) {
    const message = result.error.message;
    const stale = classifyConfirmationRpcFailure(message);
    const supportReference = randomUUID();
    console.error("Payment Claim accounting confirmation failed.", {
      supportReference,
      stage: "confirmation_rpc",
      operation: proposal.operation,
      proposalId: proposal.proposalId,
      claimId: proposal.claimId,
      accountingDocumentId: proposal.accountingDocumentId,
      predecessorRevisionId: proposal.previousRevisionId,
      postgresCode: result.error.code ?? null,
    });
    throw new PaymentClaimInitialPushError(
      stale?.code
        ?? (proposal.operation === "ACCOUNTING_UPDATE"
          ? "payment_update_confirmation_rpc_failed"
          : "confirmation_failed"),
      stale?.message ?? "TradesStack could not confirm the Payment Claim accounting action.",
      supportReference,
    );
  }
  const confirmation = result.data as Partial<PaymentClaimInitialPushConfirmation> | null;
  if (
    !confirmation
    || typeof confirmation.accountingDocumentId !== "string"
    || typeof confirmation.accountingRevisionId !== "string"
    || typeof confirmation.attemptId !== "string"
    || typeof confirmation.jobId !== "string"
    || typeof confirmation.invoiceNumber !== "string"
    || typeof confirmation.revisionSequence !== "number"
    || !["queued", "processing", "completed"].includes(
      confirmation.status ?? "",
    )
  ) {
    const supportReference = randomUUID();
    console.error("Payment Claim accounting confirmation result was invalid.", {
      supportReference,
      stage: "confirmation_result",
      operation: proposal.operation,
      proposalId: proposal.proposalId,
      claimId: proposal.claimId,
      accountingDocumentId: proposal.accountingDocumentId,
      predecessorRevisionId: proposal.previousRevisionId,
      returnedKeys: confirmation ? Object.keys(confirmation).sort() : [],
    });
    throw new PaymentClaimInitialPushError(
      proposal.operation === "ACCOUNTING_UPDATE"
        ? "payment_update_confirmation_result_invalid"
        : "confirmation_failed",
      "Immutable Payment Claim confirmation returned invalid completion evidence.",
      supportReference,
    );
  }
  return confirmation as PaymentClaimInitialPushConfirmation;
}

export async function confirmPaymentClaimInitialPush(params: {
  proposalToken: string;
}) {
  const confirmation = await confirmPaymentClaimPush(params);
  return confirmation;
}
