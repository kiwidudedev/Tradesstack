import { describe, expect, it } from "vitest";
import { buildPaymentClaimUclV2Sections } from "./payment-claim-builder";
import {
  assertValidPaymentClaimUclBusinessRecord,
  PAYMENT_CLAIM_UCL_SCHEMA_VERSION,
  validatePaymentClaimUclBusinessRecord,
} from "./payment-claim-schema";

const updatedAt = "2026-07-20T01:02:03.123456Z";

function buildRecord(overrides?: {
  lines?: Array<Record<string, unknown>>;
  status?: string;
  project?: Record<string, unknown> | null;
  client?: Record<string, unknown> | null;
}) {
  const row = {
    id: "claim-1",
    organization_id: "org-1",
    project_id: overrides?.project === null ? null : "project-1",
    created_by: "user-1",
    claim_number: "PC-001",
    claim_title: "July progress claim",
    claim_type: "Progress",
    status: overrides?.status ?? "Submitted",
    claim_date: "2026-07-20",
    due_date: "2026-08-05",
    period_start: "2026-07-01",
    period_end: "2026-07-31",
    linked_quote_value: 10_000,
    linked_approved_variations: 2_000,
    revised_contract_value: 12_000,
    previous_claims_total: 2_000,
    claim_amount: 4_000,
    retention_method: "flat",
    retention_percent: 10,
    retention_withheld_amount: 400,
    retention_released_amount: 0,
    retention_held_to_date: 600,
    retention_released_to_date: 0,
    retention_balance: 600,
    gst_amount: 540,
    total_payable: 4_140,
    paid_amount: 1_000,
    created_at: "2026-07-19T01:00:00.000000Z",
    updated_at: updatedAt,
  };
  const lines = overrides?.lines ?? [{
    id: "line-1",
    line_uid: "schedule-line-1",
    sort_order: 1,
    section: "Contract works",
    description: "Measured work completed",
    unit: "lot",
    quantity: 1,
    rate: 10_000,
    source_total: 10_000,
    previously_claimed_amount: 2_000,
    claim_amount: 4_000,
    cumulative_claimed_amount: 6_000,
    claim_percent: 60,
    source_kind: "Quote",
    source_document_id: "quote-1",
    source_line_item_id: "quote-line-1",
  }];
  const sections = buildPaymentClaimUclV2Sections({
    organizationId: "org-1",
    row,
    lines,
    project: overrides?.project === undefined
      ? { id: "project-1", client_id: "client-1", name: "Civic fitout", project_code: "P-001", stage: "delivery" }
      : overrides.project,
    client: overrides?.client === undefined
      ? { id: "client-1", company_name: "Civic Client" }
      : overrides.client,
    quotesById: new Map([["quote-1", { id: "quote-1", quote_number: "Q-001" }]]),
    variationsById: new Map(),
    retentionAllocations: [],
    accountingDocuments: [],
    routingContext: { readOnly: true },
    assembledAt: "2026-07-20T02:00:00.000000Z",
    updatedAt,
  });
  return {
    containerType: "project_claim" as const,
    source: { table: "project_claims", sourceId: "claim-1", sourceVersion: 1 },
    organizationId: "org-1",
    projectId: overrides?.project === null ? null : "project-1",
    opportunityId: null,
    supplierId: null,
    clientId: overrides?.client === null ? null : "client-1",
    actorUserId: "user-1",
    updatedAt,
    status: {
      canonicalStatus: "Submitted",
      workflowState: sections.workflowState,
      approvalState: sections.approvalState,
    },
    payload: sections.payload,
    linkedContext: sections.linkedContext,
    routingContext: sections.routingContext,
    signalStrength: sections.signalStrength,
  };
}

describe("Payment Claim UCL v2 contract", () => {
  it("validates a full record and preserves canonical microseconds", () => {
    const record = buildRecord();
    expect(record.payload.schemaVersion).toBe(PAYMENT_CLAIM_UCL_SCHEMA_VERSION);
    expect(record.payload.provenance.latestDependencyUpdatedAt).toBe(updatedAt);
    expect(record.updatedAt).toBe(updatedAt);
    expect(() => assertValidPaymentClaimUclBusinessRecord(record)).not.toThrow();
  });

  it("supports a minimal draft with no project, client, variations, or documents", () => {
    const record = buildRecord({ status: "Draft", project: null, client: null, lines: [] });
    expect(record.payload.sourceEvidence.project.projectId).toBeNull();
    expect(record.payload.sourceEvidence.client.clientId).toBeNull();
    expect(record.payload.sourceEvidence.variations).toEqual([]);
    expect(() => assertValidPaymentClaimUclBusinessRecord(record)).not.toThrow();
  });

  it("rejects mismatched record and effective timestamps", () => {
    const record = buildRecord();
    record.updatedAt = "2026-07-20T01:02:04.000000Z";
    const result = validatePaymentClaimUclBusinessRecord(record);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        path: "record.payload.provenance.latestDependencyUpdatedAt",
      }));
    }
  });

  it("rejects forbidden document and credential fields", () => {
    const record = buildRecord() as unknown as Record<string, unknown>;
    (record.payload as Record<string, unknown>).rawOcr = "forbidden";
    expect(validatePaymentClaimUclBusinessRecord(record).success).toBe(false);
  });
});

export { buildRecord as buildPaymentClaimTestRecord };
