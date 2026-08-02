import { describe, expect, it } from "vitest";
import {
  resolveDirectRetentionOriginEvidence,
  type DirectRetentionOriginEvidenceInput,
} from "./retention-claim-direct-origin-evidence";
import {
  buildDirectInheritedRetentionClaimXeroPayload,
} from "./retention-claim-sales-invoice-payload";

const originClaimId = "55555555-5555-4555-8555-555555555555";

function input(
  overrides: Partial<DirectRetentionOriginEvidenceInput> = {},
): DirectRetentionOriginEvidenceInput {
  return {
    organizationId: "22222222-2222-4222-8222-222222222222",
    projectId: "33333333-3333-4333-8333-333333333333",
    connectionId: "88888888-8888-4888-8888-888888888888",
    tenantId: "tenant-1",
    currencyCode: "NZD",
    routeAccountCode: "700",
    allocations: [{
      id: originClaimId,
      allocationSequence: 1,
      originatingPaymentClaimId: originClaimId,
      allocationAmount: "1000.00",
      originClaimNumberSnapshot: "26030-PC-01",
    }],
    originDocuments: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization_id: "22222222-2222-4222-8222-222222222222",
      provider: "xero",
      local_document_type: "project_claim",
      project_claim_id: originClaimId,
      integration_contract: "payment_claim_revision_v1",
      active_accounting_revision_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }],
    originRevisions: [{
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "22222222-2222-4222-8222-222222222222",
      project_id: "33333333-3333-4333-8333-333333333333",
      accounting_document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      source_document_type: "project_claim",
      source_document_id: originClaimId,
      lifecycle_state: "succeeded",
      connection_id: "88888888-8888-4888-8888-888888888888",
      tenant_id: "tenant-1",
      currency_code: "NZD",
      revision_sequence: 1,
      previous_revision_id: null,
      tax_snapshot: {
        taxRateId: "tax-rate-output2",
        taxType: "OUTPUT2",
        effectiveRate: 15,
      },
    }],
    originLines: [{
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      organization_id: "22222222-2222-4222-8222-222222222222",
      accounting_revision_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      line_kind: "retention",
      originating_payment_claim_id: originClaimId,
      line_amount_minor: -100000,
      tax_minor: -15000,
      total_minor: -115000,
      account_snapshot: { accountCode: "700", accountId: "asset-700" },
      tax_snapshot: {
        taxRateId: "tax-rate-output2",
        taxType: "OUTPUT2",
        effectiveRate: 15,
      },
    }],
    activeTaxTypes: ["OUTPUT2", "NONE"],
    ...overrides,
  };
}

function source() {
  return {
    schemaVersion: 1 as const,
    claim: {
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      projectId: "33333333-3333-4333-8333-333333333333",
      claimNumber: "26030-RC-01",
      title: "Retention release",
      reference: null,
      issueDate: "2026-08-02",
      dueDate: "2026-08-22",
      status: "submitted" as const,
      subtotalExclTax: "1000.00",
      submissionStateHash: "a".repeat(64),
      submittedAt: "2026-08-02T00:00:00Z",
    },
    allocations: input().allocations,
  };
}

describe("direct Retention Claim GST inheritance", () => {
  it("uses the exact inverse of an OUTPUT2 immutable origin line", () => {
    const resolution = resolveDirectRetentionOriginEvidence(input());
    expect(resolution).toMatchObject({
      ok: true,
      evidence: {
        taxType: "OUTPUT2",
        originAmountMinor: -100000,
        originTaxMinor: -15000,
        originTotalMinor: -115000,
        releaseAmountMinor: 100000,
        releaseTaxMinor: 15000,
        releaseTotalMinor: 115000,
      },
    });
    if (!resolution.ok) throw new Error("expected resolved evidence");

    const result = buildDirectInheritedRetentionClaimXeroPayload({
      source: source(),
      projectName: "Harbour Apartments",
      contactId: "contact-id",
      routeAccountCode: "700",
      configuredDefaultTaxType: "NONE",
      evidence: resolution.evidence,
    });
    expect(result.payload.LineItems).toEqual([{
      Description: "Retention release — Payment Claim 26030-PC-01",
      Quantity: 1,
      UnitAmount: 1000,
      LineAmount: 1000,
      TaxAmount: 150,
      AccountCode: "700",
      TaxType: "OUTPUT2",
    }]);
    expect(result).toMatchObject({
      subtotalExclTax: 1000,
      taxTotal: 150,
      total: 1150,
    });
  });

  it("preserves a zero-tax NONE origin without consulting a percentage", () => {
    const zero = input({
      originRevisions: [{
        ...input().originRevisions[0]!,
        tax_snapshot: { taxRateId: "tax-none", taxType: "NONE", effectiveRate: 0 },
      }],
      originLines: [{
        ...input().originLines[0]!,
        tax_minor: 0,
        total_minor: -100000,
        tax_snapshot: { taxRateId: "tax-none", taxType: "NONE", effectiveRate: 0 },
      }],
    });
    const resolution = resolveDirectRetentionOriginEvidence(zero);
    expect(resolution).toMatchObject({
      ok: true,
      evidence: {
        taxType: "NONE",
        releaseTaxMinor: 0,
        releaseTotalMinor: 100000,
      },
    });
  });

  it.each([
    ["origin_revision_missing", { originDocuments: [], originRevisions: [] }],
    ["origin_revision_ambiguous", {
      originDocuments: [
        input().originDocuments[0]!,
        {
          ...input().originDocuments[0]!,
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          active_accounting_revision_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        },
      ],
      originRevisions: [
        input().originRevisions[0]!,
        {
          ...input().originRevisions[0]!,
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          accounting_document_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      ],
    }],
    ["origin_retention_line_missing", { originLines: [] }],
    ["origin_retention_line_ambiguous", {
      originLines: [
        input().originLines[0]!,
        {
          ...input().originLines[0]!,
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        },
      ],
    }],
    ["origin_tax_evidence_missing", {
      originRevisions: [{
        ...input().originRevisions[0]!,
        tax_snapshot: { taxType: "OUTPUT2", effectiveRate: 15 },
      }],
    }],
    ["origin_tax_type_unavailable", { activeTaxTypes: ["NONE"] }],
    ["origin_amount_mismatch", {
      originLines: [{
        ...input().originLines[0]!,
        line_amount_minor: -99999,
        total_minor: -114999,
      }],
    }],
  ])("blocks %s without guessing", (blockerCode, overrides) => {
    expect(resolveDirectRetentionOriginEvidence(input(overrides))).toEqual({
      ok: false,
      blocker: expect.objectContaining({ code: blockerCode }),
    });
  });
});
