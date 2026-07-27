import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import {
  RETENTION_CLAIM_PUSH_PERMISSION,
  RETENTION_CLAIM_PUSH_SCHEMA,
} from "@/lib/xero/retention-claim-push-contract";
import {
  buildRetentionClaimPushProposal,
  validateRetentionClaimProposalStillCurrent,
  verifyRetentionClaimPushProposalToken,
} from "@/lib/xero/retention-claim-push-proposal";
import type {
  RetentionClaimPushProposal,
} from "@/lib/xero/retention-claim-push-contract";
import type { XeroActionTiming } from "@/lib/xero/action-performance";
import type {
  AccountingSyncRequestContext,
} from "@/lib/xero/accounting-sync-request-context";

type Admin = {
  // Phase 2C objects intentionally precede generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, input: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

type StoredProposal = {
  id: string;
  accounting_document_id: string | null;
  active_revision_id: string | null;
  operation: string;
  external_document_number: string;
  preview_hash: string;
  source_optimistic_revision: string;
  decision_snapshot: Record<string, unknown>;
  evidence_hashes: Record<string, unknown>;
  expires_at: string;
};

export type RetentionClaimPushErrorCode =
  | "unauthorized"
  | "invalid_proposal"
  | "proposal_stale"
  | "proposal_expired"
  | "retention_claim_changed"
  | "retention_ownership_changed"
  | "accounting_state_changed"
  | "active_revision_changed"
  | "xero_evidence_changed"
  | "wrong_tenant"
  | "connection_unavailable"
  | "payments_exist"
  | "credits_exist"
  | "duplicate_invoice_number"
  | "xero_validation_rejected"
  | "uncertain_result"
  | "legacy_adoption_failed"
  | "database_failure"
  | "RETENTION_MASTER_CHANGED"
  | "ACTIVE_REVISION_CHANGED"
  | "XERO_STATE_CHANGED"
  | "PROPOSAL_EXPIRED"
  | "REPLACEMENT_NO_LONGER_ELIGIBLE";

export class RetentionClaimPushError extends Error {
  constructor(
    readonly code: RetentionClaimPushErrorCode,
    message: string,
    readonly supportReference: string | null = null,
  ) {
    super(message);
    this.name = "RetentionClaimPushError";
  }
}

function sameInstant(left: string, right: string) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function staleReason(
  stored: StoredProposal,
  current: Awaited<ReturnType<typeof buildRetentionClaimPushProposal>>,
) {
  if (Date.parse(stored.expires_at) <= Date.now()) {
    return {
      code: "proposal_expired" as const,
      message: "The accounting preview expired. Review a fresh preview before confirming.",
    };
  }
  if (!sameInstant(
    stored.source_optimistic_revision,
    current.sourceOptimisticRevision,
  )) {
    return {
      code: "retention_claim_changed" as const,
      message: "The Retention Claim changed. Review a fresh preview before confirming.",
    };
  }
  if (stored.active_revision_id !== current.previousRevisionId) {
    return {
      code: "active_revision_changed" as const,
      message: "The active accounting revision changed. Review a fresh preview before confirming.",
    };
  }
  if (
    text(stored.decision_snapshot.predecessorObservationHash)
      !== text(current.predecessorObservationHash)
  ) {
    return {
      code: "xero_evidence_changed" as const,
      message: "The verified Xero invoice evidence changed. Review a fresh preview before confirming.",
    };
  }
  if (
    stored.accounting_document_id !== current.accountingDocumentId
    || stored.operation !== current.operation
    || stored.external_document_number !== current.invoiceNumber
    || text(stored.evidence_hashes.sourceEvidenceHash) !== current.sourceEvidenceHash
    || text(stored.evidence_hashes.dependencyHash) !== current.dependencyHash
    || text(stored.evidence_hashes.commercialHash) !== current.commercialHash
    || text(stored.evidence_hashes.linesHash) !== current.linesHash
    || text(stored.evidence_hashes.payloadHash) !== current.payloadHash
  ) {
    return {
      code: "accounting_state_changed" as const,
      message: "The accounting information changed. Review a fresh preview before confirming.",
    };
  }
  return {
    code: "proposal_stale" as const,
    message: "The accounting preview changed. Review a fresh preview before confirming.",
  };
}

export type RetentionClaimPushConfirmation = {
  accountingDocumentId: string;
  accountingRevisionId: string;
  attemptId: string;
  jobId: string;
  invoiceNumber: string;
  revisionSequence: number;
  status: "queued" | "processing" | "completed";
};

export async function confirmRetentionClaimPush(params: {
  proposalToken: string;
}, preparedProposal?: RetentionClaimPushProposal, timing?: XeroActionTiming,
requestContext?: AccountingSyncRequestContext): Promise<RetentionClaimPushConfirmation> {
  const member = requestContext
    ? {
        id: requestContext.membershipId,
        user_id: requestContext.userId,
        organization_id: requestContext.organizationId,
      }
    : timing
      ? await timing.span("confirmation_authentication", () =>
          getCurrentOrganizationMember())
      : await getCurrentOrganizationMember();
  const permitted = requestContext
    ? requestContext.permissions[RETENTION_CLAIM_PUSH_PERMISSION] === true
    : member
      ? timing
        ? await timing.span("confirmation_permission", () =>
            hasOrganizationPermission(
              member.organization_id,
              RETENTION_CLAIM_PUSH_PERMISSION,
            ))
        : await hasOrganizationPermission(
            member.organization_id,
            RETENTION_CLAIM_PUSH_PERMISSION,
          )
      : false;
  if (
    !member
    || !permitted
  ) {
    throw new RetentionClaimPushError(
      "unauthorized",
      "You do not have permission to Push Retention Claims to Xero.",
    );
  }
  let token;
  try {
    token = verifyRetentionClaimPushProposalToken(params.proposalToken);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The accounting preview is invalid.";
    throw new RetentionClaimPushError(
      /expired/i.test(message) ? "proposal_expired" : "invalid_proposal",
      message,
      randomUUID(),
    );
  }
  if (token.organizationId !== member.organization_id) {
    throw new RetentionClaimPushError(
      "unauthorized",
      "The accounting preview belongs to another organisation.",
    );
  }
  if (requestContext && requestContext.claimId !== token.retentionClaimId) {
    throw new RetentionClaimPushError(
      "unauthorized",
      "The accounting preview belongs to another Retention Claim.",
    );
  }

  const admin = createAdminSupabaseClient() as unknown as Admin;
  const loadStoredProposal = () =>
    admin.from("organization_accounting_push_proposals")
      .select(
        "id,accounting_document_id,active_revision_id,operation,"
        + "external_document_number,preview_hash,source_optimistic_revision,"
        + "decision_snapshot,evidence_hashes,expires_at",
      )
      .eq("id", token.proposalId)
      .eq("organization_id", member.organization_id)
      .eq("source_document_type", "retention_claim")
      .eq("source_document_id", token.retentionClaimId)
      .maybeSingle();
  const storedResult = timing
    ? await timing.span("confirmation_proposal_read", loadStoredProposal, {
        databaseOperation: "organization_accounting_push_proposals.maybeSingle",
      })
    : await loadStoredProposal();
  if (storedResult.error || !storedResult.data) {
    throw new RetentionClaimPushError(
      "invalid_proposal",
      "The immutable Retention Claim accounting preview could not be loaded.",
      randomUUID(),
    );
  }
  const stored = storedResult.data as StoredProposal;
  if (stored.accounting_document_id) {
    const loadExistingRevision = () => admin
        .from("organization_accounting_document_revisions")
        .select("id,revision_sequence,external_document_number")
        .eq("organization_id", member.organization_id)
        .eq("accounting_document_id", stored.accounting_document_id)
        .eq("confirmation_preview_hash", stored.preview_hash)
        .eq("external_document_number", stored.external_document_number)
        .maybeSingle();
    const existingRevision = timing
      ? await timing.span(
          "confirmation_idempotency_revision",
          loadExistingRevision,
          {
            databaseOperation:
              "organization_accounting_document_revisions.maybeSingle",
          },
        )
      : await loadExistingRevision();
    if (existingRevision.error) {
      throw new RetentionClaimPushError(
        "database_failure",
        "The existing immutable Retention Claim confirmation could not be loaded.",
        randomUUID(),
      );
    }
    if (existingRevision.data) {
      const loadExistingAttemptAndJob = () => Promise.all([
        admin.from("organization_accounting_revision_attempts")
          .select("id")
          .eq("organization_id", member.organization_id)
          .eq("accounting_revision_id", existingRevision.data.id)
          .in("attempt_intent", ["create", "update", "replace"])
          .order("attempt_sequence", { ascending: true })
          .limit(1)
          .maybeSingle(),
        admin.from("organization_accounting_sync_jobs")
          .select("id,queue_state")
          .eq("organization_id", member.organization_id)
          .eq(
            "request_payload->>accountingRevisionId",
            existingRevision.data.id,
          )
          .in("job_kind", [
            "xero.retention_claim.initial_push",
            "xero.retention_claim.update",
            "xero.retention_claim.replacement",
          ])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      const [attempt, job] = timing
        ? await timing.span(
            "confirmation_idempotency_attempt_job",
            loadExistingAttemptAndJob,
          )
        : await loadExistingAttemptAndJob();
      if (
        !attempt.error && attempt.data?.id
        && !job.error && job.data?.id
      ) {
        return {
          accountingDocumentId: stored.accounting_document_id,
          accountingRevisionId: String(existingRevision.data.id),
          attemptId: String(attempt.data.id),
          jobId: String(job.data.id),
          invoiceNumber: String(existingRevision.data.external_document_number),
          revisionSequence: Number(existingRevision.data.revision_sequence),
          status: job.data.queue_state === "completed"
            ? "completed"
            : job.data.queue_state === "claimed"
              ? "processing"
              : "queued",
        };
      }
    }
  }
  let current;
  try {
    if (preparedProposal) {
      if (
        preparedProposal.proposalId !== token.proposalId
        || preparedProposal.organizationId !== member.organization_id
        || preparedProposal.projectId !== token.projectId
        || preparedProposal.retentionClaimId !== token.retentionClaimId
      ) {
        throw new RetentionClaimPushError(
          "invalid_proposal",
          "The prepared Retention Claim accounting proposal identity changed.",
          randomUUID(),
        );
      }
      const validation = timing
        ? await timing.span(
            "confirmation_evidence_validation",
            () => validateRetentionClaimProposalStillCurrent(preparedProposal),
          )
        : await validateRetentionClaimProposalStillCurrent(preparedProposal);
      if (!validation.valid) {
        throw new RetentionClaimPushError(
          validation.sourceChanged
            ? "retention_claim_changed"
            : validation.ownershipChanged
              ? "retention_ownership_changed"
              : "accounting_state_changed",
          validation.sourceChanged
            ? "The Retention Claim changed. Review a fresh preview before confirming."
            : validation.ownershipChanged
              ? "Retention ownership changed. Review the Retention Claim before pushing."
              : "The Retention Claim accounting dependencies changed. Review a fresh preview before confirming.",
          randomUUID(),
        );
      }
      current = preparedProposal;
    } else {
      current = timing
        ? await timing.span("confirmation_proposal_rebuild", () =>
            buildRetentionClaimPushProposal({
              organizationId: member.organization_id,
              retentionClaimId: token.retentionClaimId,
              hasPushPermission: true,
            }, timing))
        : await buildRetentionClaimPushProposal({
            organizationId: member.organization_id,
            retentionClaimId: token.retentionClaimId,
            hasPushPermission: true,
          });
    }
  } catch (error) {
    if (error instanceof RetentionClaimPushError) throw error;
    throw new RetentionClaimPushError(
      /ownership/i.test(error instanceof Error ? error.message : "")
        ? "retention_ownership_changed"
        : "accounting_state_changed",
      error instanceof Error
        ? error.message
        : "Retention Claim accounting readiness changed.",
      randomUUID(),
    );
  }
  if (
    current.projectId !== token.projectId
    || current.previewHash !== token.previewHash
  ) {
    const stale = staleReason(stored, current);
    throw new RetentionClaimPushError(
      stale.code,
      stale.message,
      randomUUID(),
    );
  }

  const confirmationRpcName = current.operation === "REPLACEMENT_EXPORT"
      ? "confirm_master_retention_claim_replacement"
      : current.operation === "UPDATE_EXISTING_INVOICE"
        ? "confirm_master_retention_claim_update"
        : "confirm_master_retention_claim_push";
  const confirmRpc = () => admin.rpc(confirmationRpcName, {
    p_input: {
      operation: current.operation,
      organizationId: current.organizationId,
      projectId: current.projectId,
      retentionClaimId: current.retentionClaimId,
      commercialClaimNumber: current.retentionClaimNumber,
      confirmedBy: member.user_id,
      connectionId: current.connectionId,
      tenantId: current.tenantId,
      sourceOptimisticRevision: current.sourceOptimisticRevision,
      retentionSourceEvidenceHash: current.retentionSourceEvidenceHash,
      proposalId: token.proposalId,
      previewHash: current.previewHash,
      canonicalSchemaVersion: RETENTION_CLAIM_PUSH_SCHEMA,
      sourceEvidenceHash: current.sourceEvidenceHash,
      dependencyHash: current.dependencyHash,
      commercialHash: current.commercialHash,
      linesHash: current.linesHash,
      payloadHash: current.payloadHash,
      commercialSnapshot: current.commercialSnapshot,
      contactSnapshot: current.contactSnapshot,
      routingSnapshot: current.routingSnapshot,
      taxSnapshot: current.taxSnapshot,
      payloadTemplate: current.payloadTemplate,
      lines: current.lines,
      subtotalMinor: current.subtotalMinor,
      taxMinor: current.taxMinor,
      totalMinor: current.totalMinor,
      previousRevisionId: current.previousRevisionId,
      previousInvoiceId: current.previousInvoiceId,
      previousInvoiceNumber: current.previousInvoiceNumber,
      previousObservationId: current.previousObservationId,
      externalDocumentNumber: current.invoiceNumber,
    },
  });
  const result = timing
    ? await timing.span("confirmation_rpc", confirmRpc, {
        databaseOperation: confirmationRpcName,
      })
    : await confirmRpc();
  if (result.error || !result.data) {
    const supportReference = randomUUID();
    const message = result.error?.message ?? "Immutable Retention Claim confirmation failed.";
    const structuredCode = message.match(
      /^(RETENTION_MASTER_CHANGED|ACTIVE_REVISION_CHANGED|XERO_STATE_CHANGED|PROPOSAL_EXPIRED|REPLACEMENT_NO_LONGER_ELIGIBLE):/,
    )?.[1] as RetentionClaimPushErrorCode | undefined;
    const safeCode: RetentionClaimPushErrorCode =
      structuredCode
      ?? (/ownership/i.test(message)
        ? "retention_ownership_changed"
        : /tenant|connection/i.test(message)
          ? "wrong_tenant"
          : /payment/i.test(message)
            ? "payments_exist"
            : /credit/i.test(message)
              ? "credits_exist"
              : /duplicate|unique/i.test(message)
                ? "duplicate_invoice_number"
                : /changed|stale|expired/i.test(message)
                  ? "proposal_stale"
                  : "database_failure");
    try {
      await admin.from("organization_accounting_operation_errors").insert({
        support_reference: supportReference,
        organization_id: member.organization_id,
        source_document_type: "retention_claim",
        source_document_id: token.retentionClaimId,
        accounting_document_id: current.accountingDocumentId,
        operation: current.operation === "REPLACEMENT_EXPORT"
          ? "retention_claim_replacement_confirmation"
          : current.operation === "UPDATE_EXISTING_INVOICE"
            ? "retention_claim_update_confirmation"
            : "retention_claim_initial_confirmation",
        safe_code: safeCode,
        internal_message: message,
        internal_sqlstate: null,
        internal_details: null,
        internal_hint: null,
        failed_constraint: message.match(/constraint ["']([^"']+)["']/i)?.[1] ?? null,
      });
    } catch {
      // The safe support reference remains useful even if secondary evidence
      // persistence is temporarily unavailable.
    }
    throw new RetentionClaimPushError(
      safeCode,
      structuredCode
        ? "The accounting information changed. A fresh preview is required."
        : /permission/i.test(message)
        ? "You do not have permission to complete this accounting action."
        : /ownership/i.test(message)
          ? "Retention ownership changed. Review a fresh preview before confirming."
          : /tenant|connection/i.test(message)
            ? "The Xero connection or selected organisation changed."
            : /payment/i.test(message)
              ? "Payments prevent this Retention Claim accounting action."
              : /credit/i.test(message)
                ? "Credits prevent this Retention Claim accounting action."
                : /changed|stale|expired/i.test(message)
                  ? "The accounting information changed. Review a fresh preview before confirming."
                  : "The Retention Claim could not be queued for Xero.",
      supportReference,
    );
  }
  return result.data as RetentionClaimPushConfirmation;
}
