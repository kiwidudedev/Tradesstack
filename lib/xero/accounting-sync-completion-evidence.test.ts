import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  completionEvidenceMatches,
  derivePaymentClaimLocalAccountingComparison,
  deriveRetentionClaimLocalAccountingComparison,
  parseAccountingSyncCompletionEvidence,
} from "@/lib/xero/accounting-sync-completion-evidence";

function exactEvidence() {
  return {
    organizationId: "org",
    projectId: "project",
    claimId: "claim",
    sourceDocumentType: "project_claim",
    accountingDocumentId: "document",
    activeRevisionId: "revision",
    observationId: "observation",
    projectionId: "projection",
    attemptId: "attempt",
    jobId: "job",
    invoiceId: "invoice",
    invoiceNumber: "26028-CL-01",
    operation: "initial_push",
    providerStatus: "AUTHORISED",
    subtotalMinor: 10000,
    taxMinor: 1500,
    totalMinor: 11500,
    paidMinor: 0,
    creditedMinor: 0,
    outstandingMinor: 11500,
    observedAt: "2026-07-26T07:00:00.000Z",
    completedAt: "2026-07-26T07:00:01.000Z",
    sourceMatches: true,
    document: {
      id: "document",
      active_accounting_revision_id: "revision",
    },
    revision: {
      id: "revision",
      accounting_document_id: "document",
      external_document_id: "invoice",
      external_document_number: "26028-CL-01",
      commercial_snapshot: {
        currentStateHash: "source-hash",
        revenueAmountMinor: 10_000,
        invoiceDate: "2026-07-26",
        dueDate: "2026-08-02",
        issueDate: "2026-07-26",
      },
    },
    observation: {
      id: "observation",
      accounting_revision_id: "revision",
      external_document_id: "invoice",
    },
    projection: {
      id: "projection",
      accounting_revision_id: "revision",
      remote_observation_id: "observation",
      divergent: false,
    },
  };
}

describe("Accounting Sync completion evidence", () => {
  it("accepts only a complete internally consistent persisted identity chain", () => {
    const evidence = parseAccountingSyncCompletionEvidence(exactEvidence());
    expect(evidence).not.toBeNull();
    expect(completionEvidenceMatches({
      evidence: evidence!,
      organizationId: "org",
      claimId: "claim",
      accountingDocumentId: "document",
      activeRevisionId: "revision",
      jobId: "job",
    })).toBe(true);
  });

  it("fails closed on an identity mismatch so the caller uses the full loader", () => {
    const mismatched = exactEvidence();
    mismatched.projection.remote_observation_id = "another-observation";
    expect(parseAccountingSyncCompletionEvidence(mismatched)).toBeNull();

    const evidence = parseAccountingSyncCompletionEvidence(exactEvidence())!;
    expect(completionEvidenceMatches({
      evidence,
      organizationId: "org",
      claimId: "another-claim",
      accountingDocumentId: "document",
      activeRevisionId: "revision",
      jobId: "job",
    })).toBe(false);
  });

  it("does not treat uncertain or incomplete summaries as success evidence", () => {
    const incomplete = exactEvidence();
    delete (incomplete as Partial<typeof incomplete>).observationId;
    expect(parseAccountingSyncCompletionEvidence(incomplete)).toBeNull();
    expect(parseAccountingSyncCompletionEvidence({
      uncertain: true,
      invoiceId: "invoice",
    })).toBeNull();
  });

  it.each([
    ["subtotal", { net_claim_excl_gst: 101 }],
    ["tax", { gst_amount: 16 }],
    ["total", { total_payable: 116 }],
    ["claim amount", { claim_amount: 101 }],
    ["claim date", { claim_date: "2026-07-27" }],
    ["due date", { due_date: "2026-08-03" }],
  ])("rejects Payment fast-path evidence after a changed %s", (_field, change) => {
    const evidence = parseAccountingSyncCompletionEvidence(exactEvidence())!;
    const comparison = derivePaymentClaimLocalAccountingComparison({
      evidence,
      claim: {
        id: "claim",
        status: "Submitted",
        updated_at: "2026-07-26T07:00:00.000Z",
        claim_amount: 100,
        net_claim_excl_gst: 100,
        gst_amount: 15,
        total_payable: 115,
        claim_date: "2026-07-26",
        due_date: "2026-08-02",
        ...change,
      },
    });
    expect(comparison.matchesActiveRevision).toBe(false);
  });

  it("keeps unchanged Payment evidence eligible for the completion fast path", () => {
    const evidence = parseAccountingSyncCompletionEvidence(exactEvidence())!;
    expect(derivePaymentClaimLocalAccountingComparison({
      evidence,
      claim: {
        id: "claim",
        status: "Submitted",
        updated_at: "2026-07-26T07:00:00.000Z",
        claim_amount: 100,
        net_claim_excl_gst: 100,
        gst_amount: 15,
        total_payable: 115,
        claim_date: "2026-07-26",
        due_date: "2026-08-02",
      },
    }).matchesActiveRevision).toBe(true);
  });

  it("requires the fresh proposal optimistic revision match for line edits", () => {
    const raw = exactEvidence();
    raw.sourceMatches = false;
    const evidence = parseAccountingSyncCompletionEvidence(raw)!;
    expect(derivePaymentClaimLocalAccountingComparison({
      evidence,
      claim: {
        id: "claim",
        status: "Submitted",
        updated_at: "2026-07-26T07:01:00.000Z",
        claim_amount: 100,
        net_claim_excl_gst: 100,
        gst_amount: 15,
        total_payable: 115,
        claim_date: "2026-07-26",
        due_date: "2026-08-02",
      },
    }).matchesActiveRevision).toBe(false);
  });

  it.each([
    ["new cumulative retention", "new-source-hash", "2026-07-26", "2026-08-02"],
    ["claim date", "source-hash", "2026-07-27", "2026-08-02"],
    ["due date", "source-hash", "2026-07-26", "2026-08-03"],
  ])("rejects Retention fast-path evidence after %s", (
    _scenario,
    sourceHash,
    issueDate,
    dueDate,
  ) => {
    const raw = exactEvidence();
    raw.sourceDocumentType = "retention_claim";
    const evidence = parseAccountingSyncCompletionEvidence(raw)!;
    const comparison = deriveRetentionClaimLocalAccountingComparison({
      evidence,
      claim: {
        id: "claim",
        status: "submitted",
        submitted_at: "2026-07-26T07:00:00.000Z",
        issue_date: issueDate,
        due_date: dueDate,
      },
      source: {
        claim: {
          id: "claim",
          submissionStateHash: sourceHash,
          submittedAt: "2026-07-26T07:00:00.000Z",
          subtotalExclTax: 100,
        },
      },
    });
    expect(comparison.matchesActiveRevision).toBe(false);
  });
});
