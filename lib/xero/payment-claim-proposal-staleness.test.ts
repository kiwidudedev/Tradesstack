import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classifyPaymentClaimProposalStaleness } from "./payment-claim-initial-push-confirmation";

const current = {
  sourceOptimisticRevision: "2026-07-25T07:52:10.594856+00:00",
  previousRevisionId: "revision-1",
  predecessorObservationHash: "observation-hash",
  accountingDocumentId: "document-1",
  operation: "REPLACEMENT_EXPORT",
  invoiceNumber: "26028-CL-01-R1",
  connectionId: "connection-1",
  tenantId: "tenant-1",
  sourceEvidenceHash: "source-hash",
  commercialHash: "commercial-hash",
  linesHash: "lines-hash",
  readinessHash: "readiness-hash",
  pdfHash: "pdf-hash",
};

const stored = {
  id: "proposal-1",
  accounting_document_id: "document-1",
  active_revision_id: "revision-1",
  operation: "REPLACEMENT_EXPORT",
  external_document_number: "26028-CL-01-R1",
  source_optimistic_revision: "2026-07-25 07:52:10.594856+00",
  decision_snapshot: {
    predecessorObservationHash: "observation-hash",
    connectionId: "connection-1",
    tenantId: "tenant-1",
  },
  evidence_hashes: {
    sourceEvidenceHash: "source-hash",
    commercialHash: "commercial-hash",
    linesHash: "lines-hash",
    readinessHash: "readiness-hash",
    pdfHash: "pdf-hash",
  },
  expires_at: "2026-07-25T09:00:00.000Z",
};

describe("Payment Claim proposal stale classification", () => {
  it("treats equivalent PostgreSQL and PostgREST timestamps as the same instant", () => {
    expect(classifyPaymentClaimProposalStaleness({
      stored,
      current: { ...current, pdfHash: "changed-pdf" },
      now: Date.parse("2026-07-25T08:00:00Z"),
    }).code).toBe("ACCOUNTING_STATE_CHANGED");
  });

  it("distinguishes a genuinely changed Payment Claim", () => {
    expect(classifyPaymentClaimProposalStaleness({
      stored,
      current: {
        ...current,
        sourceOptimisticRevision: "2026-07-25T07:53:10.594856+00:00",
      },
      now: Date.parse("2026-07-25T08:00:00Z"),
    }).code).toBe("PAYMENT_CLAIM_CHANGED");
  });

  it("distinguishes an active revision change", () => {
    expect(classifyPaymentClaimProposalStaleness({
      stored,
      current: { ...current, previousRevisionId: "revision-2" },
      now: Date.parse("2026-07-25T08:00:00Z"),
    }).code).toBe("ACTIVE_REVISION_CHANGED");
  });

  it("distinguishes changed Xero evidence", () => {
    expect(classifyPaymentClaimProposalStaleness({
      stored,
      current: { ...current, predecessorObservationHash: "new-observation-hash" },
      now: Date.parse("2026-07-25T08:00:00Z"),
    }).code).toBe("XERO_EVIDENCE_CHANGED");
  });

  it("distinguishes proposal expiry", () => {
    expect(classifyPaymentClaimProposalStaleness({
      stored,
      current,
      now: Date.parse("2026-07-25T09:01:00Z"),
    }).code).toBe("PROPOSAL_EXPIRED");
  });
});
