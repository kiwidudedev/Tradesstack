import { describe, expect, it } from "vitest";
import { buildPaymentClaimTestRecord } from "./payment-claim-schema.test";
import {
  compactPaymentClaimBusinessRecordForPrompt,
  selectPaymentClaimRecordsForPrompt,
} from "./payment-claim-prompt";

function record(id: string, updatedAt: string) {
  const value = structuredClone(buildPaymentClaimTestRecord());
  value.source.sourceId = id;
  value.payload.sourceEvidence.claim.paymentClaimId = id;
  value.payload.lineage.paymentClaimId = id;
  value.updatedAt = updatedAt;
  value.payload.provenance.latestDependencyUpdatedAt = updatedAt;
  value.payload.provenance.canonicalOwnerUpdatedAt = updatedAt;
  return value;
}

describe("Payment Claim UCL prompt projection", () => {
  it("projects commercial context and explicit omitted counts without sensitive content", () => {
    const value = buildPaymentClaimTestRecord();
    const result = compactPaymentClaimBusinessRecordForPrompt(value);
    expect(result.projection).toMatchObject({
      schemaVersion: "payment_claim.v2",
      claim: { paymentClaimId: "claim-1" },
      project: { name: "Civic fitout" },
      client: { displayName: "Civic Client" },
      financialSummary: {
        stored: { thisClaim: 4_000 },
        calculated: { lineThisClaim: 4_000 },
      },
      operationalContext: {
        promptTruncated: false,
        promptOmittedCounts: { claimLines: 0 },
      },
    });
    const serialized = JSON.stringify(result.projection).toLowerCase();
    expect(serialized).not.toContain("signedurl");
    expect(serialized).not.toContain("storagepath");
    expect(serialized).not.toContain("rawocr");
  });

  it("orders 25 shuffled records by effective cursor and selects exact continuation prefixes", () => {
    const records = Array.from({ length: 25 }, (_, index) => {
      const ordinal = String(index + 1).padStart(2, "0");
      return record(
        `claim-${ordinal}`,
        `2026-07-${String(index + 1).padStart(2, "0")}T01:00:00.123456Z`,
      );
    }).sort((left, right) => right.source.sourceId.localeCompare(left.source.sourceId));

    const first = selectPaymentClaimRecordsForPrompt({
      records,
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: {
        updatedAt: records[0].updatedAt,
        id: records[0].source.sourceId,
      },
    });
    expect(first.records.map((entry) => entry.source.sourceId)).toEqual(
      Array.from({ length: 12 }, (_, index) => `claim-${String(index + 1).padStart(2, "0")}`),
    );
    expect(first.nextCursorCandidate.id).toBe("claim-12");
    expect(first.deferredRecordCount).toBe(13);

    const second = selectPaymentClaimRecordsForPrompt({
      records: records.filter((entry) => entry.source.sourceId > "claim-12"),
      previousCursor: first.nextCursorCandidate,
      sourceNextCursorCandidate: {
        updatedAt: "2026-07-25T01:00:00.123456Z",
        id: "claim-25",
      },
    });
    expect(second.records[0].source.sourceId).toBe("claim-13");
    expect(second.records.at(-1)?.source.sourceId).toBe("claim-24");

    const third = selectPaymentClaimRecordsForPrompt({
      records: records.filter((entry) => entry.source.sourceId > "claim-24"),
      previousCursor: second.nextCursorCandidate,
      sourceNextCursorCandidate: {
        updatedAt: "2026-07-25T01:00:00.123456Z",
        id: "claim-25",
      },
    });
    expect(third.records.map((entry) => entry.source.sourceId)).toEqual(["claim-25"]);
    expect(new Set([
      ...first.records,
      ...second.records,
      ...third.records,
    ].map((entry) => entry.source.sourceId)).size).toBe(25);
  });

  it("uses source ID as the equal-timestamp tie-break", () => {
    const updatedAt = "2026-07-20T01:00:00.123456Z";
    const selection = selectPaymentClaimRecordsForPrompt({
      records: [record("claim-c", updatedAt), record("claim-a", updatedAt), record("claim-b", updatedAt)],
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: { updatedAt, id: "claim-c" },
    });
    expect(selection.records.map((entry) => entry.source.sourceId)).toEqual([
      "claim-a",
      "claim-b",
      "claim-c",
    ]);
  });

  it("uses the same deterministic prefix boundary for exactly 12 and 13 records", () => {
    const updatedAt = "2026-07-20T01:00:00.123456Z";
    const twelve = Array.from({ length: 12 }, (_, index) =>
      record(`claim-${String(index + 1).padStart(2, "0")}`, updatedAt));
    const exact = selectPaymentClaimRecordsForPrompt({
      records: twelve,
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: { updatedAt, id: "claim-12" },
    });
    expect(exact.records).toHaveLength(12);
    expect(exact.deferredRecordCount).toBe(0);

    const thirteen = selectPaymentClaimRecordsForPrompt({
      records: [...twelve, record("claim-13", updatedAt)].reverse(),
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: { updatedAt, id: "claim-13" },
    });
    expect(thirteen.records).toHaveLength(12);
    expect(thirteen.nextCursorCandidate.id).toBe("claim-12");
    expect(thirteen.deferredRecordCount).toBe(1);
  });

  it("compacts large line sets and reports the omitted count", () => {
    const lines = Array.from({ length: 30 }, (_, index) => ({
      id: `line-${String(index + 1).padStart(2, "0")}`,
      sort_order: index + 1,
      section: index < 15 ? "Contract works" : "Variations",
      description: `Measured work ${index + 1}`,
      source_total: 100,
      previously_claimed_amount: 0,
      claim_amount: 50,
      cumulative_claimed_amount: 50,
      source_kind: "Quote",
      source_document_id: "quote-1",
      source_line_item_id: `quote-line-${index + 1}`,
    }));
    const value = buildPaymentClaimTestRecord({ lines });
    const result = compactPaymentClaimBusinessRecordForPrompt(value);
    expect(result.projection.claimLines).toHaveLength(20);
    expect(result.projection.operationalContext.promptTruncated).toBe(true);
    expect(result.projection.operationalContext.promptOmittedCounts.claimLines).toBe(10);
  });
});
