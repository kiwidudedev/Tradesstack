import { describe, expect, it } from "vitest";
import {
  buildSupplierBillPromptCompactionFailureRecord,
  buildSupplierBillTestRecord,
} from "@/lib/universal-learning/__test-utils__/supplier-bill";
import {
  compareSupplierBillEffectiveCursor,
  compactSupplierBillBusinessRecordForPrompt,
  getSupplierBillEffectiveCursor,
  selectSupplierBillRecordsForPrompt,
  SUPPLIER_BILL_PROMPT_MAX_BYTES,
  SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET,
} from "@/lib/universal-learning/supplier-bill-prompt";
import { buildModelVisiblePromptPacket } from "@/lib/universal-learning/prompt";
import type {
  UniversalLearningCursor,
  UniversalLearningPromptPacket,
} from "@/lib/universal-learning/types";

function projectionLines(projection: Record<string, unknown>) {
  const evidence = projection.sourceEvidence as Record<string, unknown>;
  const lines = evidence.lines as Record<string, unknown>;
  return lines.representativeLines as Array<Record<string, unknown>>;
}

function compareCursor(
  left: { updatedAt: string | null; id: string | null },
  right: { updatedAt: string | null; id: string | null },
) {
  return (
    (left.updatedAt ?? "").localeCompare(right.updatedAt ?? "")
    || (left.id ?? "").localeCompare(right.id ?? "")
  );
}

function buildAdversarialSupplierBillRecords(count: number) {
  const records = Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const effectiveMinute = count - index;
    const updatedAt = [3, 13, 23].includes(index)
      ? "2026-07-27T01:11:00.000Z"
      : `2026-07-27T01:${String(effectiveMinute).padStart(2, "0")}:00.000Z`;
    return buildSupplierBillTestRecord({ index, updatedAt });
  });

  return [
    ...records.filter((_, index) => index % 3 === 1),
    ...records.filter((_, index) => index % 3 === 0).reverse(),
    ...records.filter((_, index) => index % 3 === 2),
  ];
}

describe("Supplier Bill UCL prompt projection", () => {
  it("is deterministic, bounded, preserves learning summaries, and does not mutate the canonical record", () => {
    const record = buildSupplierBillTestRecord({ lineCount: 30 });
    record.payload.sourceEvidence.billLines[29].exceptionCodes = ["tax_unresolved"];
    const original = structuredClone(record);

    const first = compactSupplierBillBusinessRecordForPrompt(record);
    const second = compactSupplierBillBusinessRecordForPrompt(record);
    const serialized = JSON.stringify(first.projection);

    expect(second).toEqual(first);
    expect(record).toEqual(original);
    expect(first.diagnostics.promptBytes).toBeLessThanOrEqual(SUPPLIER_BILL_PROMPT_MAX_BYTES);
    expect(first.diagnostics.promptLineCount).toBeLessThan(first.diagnostics.canonicalLineCount);
    expect(projectionLines(first.projection).map((line) => line.lineId))
      .toContain("invoice-1-line-30");
    expect(serialized).toContain('"financialTotals"');
    expect(serialized).toContain('"taxSummary"');
    expect(serialized).toContain('"poMatchingCompleteness"');
    expect(serialized).toContain('"allocationCompleteness"');
    expect(serialized).toContain('"schemaVersion":"supplier_bill.v2"');
    expect(serialized).toContain('"builderVersion":"supplier_bill.contract.v2"');
    expect(first.projection.supplier).toEqual({
      supplierId: "11111111-1111-4111-8111-111111111111",
      displayName: "Test Supplier",
    });
    expect(serialized).not.toContain("Canonical private line description");
  });

  it("prioritizes tax exceptions with stable tie-breakers", () => {
    const record = buildSupplierBillTestRecord({ lineCount: 20 });
    for (let index = 0; index < 12; index += 1) {
      record.payload.sourceEvidence.billLines[index].exceptionCodes = ["general_exception"];
      record.payload.sourceEvidence.billLines[index].lineTotal = 100;
    }
    record.payload.sourceEvidence.billLines[19].exceptionCodes = ["gst_unresolved"];
    record.payload.sourceEvidence.billLines[18].lineTotal = 50_000;

    const { projection } = compactSupplierBillBusinessRecordForPrompt(record);
    const ids = projectionLines(projection).map((line) => line.lineId);

    expect(ids[0]).toBe("invoice-1-line-20");
    expect(ids).not.toContain("invoice-1-line-19");
    expect(ids).toEqual([
      "invoice-1-line-20",
      ...Array.from({ length: 11 }, (_, index) => `invoice-1-line-${index + 1}`),
    ]);
  });

  it("uses financial materiality after exception and completeness priorities", () => {
    const record = buildSupplierBillTestRecord({ lineCount: 20 });
    record.payload.sourceEvidence.billLines[18].lineTotal = 50_000;

    const { projection } = compactSupplierBillBusinessRecordForPrompt(record);

    expect(projectionLines(projection)[0].lineId).toBe("invoice-1-line-19");
  });

  it("prioritizes unresolved matches and uncoded allocations", () => {
    const record = buildSupplierBillTestRecord({ lineCount: 20 });
    record.payload.sourceEvidence.poMatches = Array.from({ length: 10 }, (_, index) => ({
      matchId: `match-${index + 1}`,
      purchaseOrderId: `po-${index + 1}`,
      projectId: null,
      matchedAmount: index === 8 ? 100_000 : 100 + index,
      matchBasis: "amount",
      matchStatus: index === 9 ? "rejected" : "accepted",
      approvalStatus: index === 9 ? "rejected" : "approved",
      passedCheckCount: index === 9 ? 0 : 1,
      failedCheckCount: index === 9 ? 1 : 0,
      unresolvedCheckCount: 0,
    }));
    record.payload.sourceEvidence.allocationSummary.allocations = Array.from(
      { length: 15 },
      (_, index) => ({
        allocationId: `allocation-${index + 1}`,
        billLineId: `invoice-1-line-${index + 1}`,
        projectId: null,
        purchaseOrderId: null,
        purchaseOrderLineItemId: null,
        allocatedQuantity: 1,
        allocatedAmount: index === 13 ? 50_000 : 100,
        allocationStatus: index === 14 ? "unresolved" : "allocated",
        approvalStatus: index === 14 ? "pending" : "approved",
      }),
    );
    record.payload.sourceEvidence.allocationSummary.totalAllocationCount = 15;
    record.payload.sourceEvidence.allocationSummary.allocatedLineCount = 15;
    record.payload.sourceEvidence.allocationSummary.allocatedAmount = 51_400;
    record.payload.sourceEvidence.allocationSummary.uncodedLineCount = 1;
    record.payload.operationalContext.totalCounts.poMatches = 10;
    record.payload.operationalContext.totalCounts.allocationSummaries = 15;
    record.payload.operationalContext.totalCounts.linkedPurchaseOrders = 10;
    record.payload.lineage.purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    record.payload.lineage.allocationIds = Array.from(
      { length: 15 },
      (_, index) => `allocation-${index + 1}`,
    );
    record.linkedContext.purchaseOrders = Array.from({ length: 10 }, (_, index) => ({
      purchaseOrderId: `po-${index + 1}`,
      purchaseOrderNumber: `PO-${index + 1}`,
      projectId: null,
      status: "Approved",
      committedTotal: 1_000,
    }));

    const { projection } = compactSupplierBillBusinessRecordForPrompt(record);
    const evidence = projection.sourceEvidence as Record<string, Record<string, unknown>>;
    const matches = evidence.poMatches.representativeMatches as Array<Record<string, unknown>>;
    const allocations = evidence.allocations.representativeAllocations as Array<Record<string, unknown>>;

    expect(matches[0].matchId).toBe("match-10");
    expect(matches[1].matchId).toBe("match-9");
    expect(allocations[0].allocationId).toBe("allocation-15");
    expect(allocations[1].allocationId).toBe("allocation-14");
    expect(evidence.allocations.allocatedAmount).toBe(51_400);
    expect(evidence.allocations.totalAllocationCount).toBe(15);
  });

  it("summarizes attachments without sending document identities, filenames, or Xero identities", () => {
    const record = buildSupplierBillTestRecord();
    record.payload.sourceEvidence.attachmentSummary = {
      totalAttachmentCount: 1,
      references: [{
        documentId: "document-private-1",
        documentType: "supplier_bill",
        fileName: "private-supplier-bill.pdf",
        isCurrent: true,
        extractionStatus: "completed",
      }],
      extractionState: "completed",
      extractionSchemaVersion: "v1",
      warningCount: 2,
      errorCount: 0,
    };
    record.payload.operationalContext.totalCounts.attachmentReferences = 1;
    record.payload.lineage.currentDocumentIds = ["document-private-1"];
    record.payload.sourceEvidence.xeroSummary.accountingDocumentId = "accounting-private-1";
    record.payload.sourceEvidence.xeroSummary.externalBillReference = "xero-private-1";
    record.payload.lineage.accountingDocumentId = "accounting-private-1";
    record.payload.visibility.requiresAccountingVisibility = true;

    const { projection } = compactSupplierBillBusinessRecordForPrompt(record);
    const serialized = JSON.stringify(projection);

    expect(serialized).toContain('"totalAttachmentCount":1');
    expect(serialized).toContain('"currentDocumentCount":1');
    expect(serialized).toContain('"documentTypes":["supplier_bill"]');
    expect(serialized).not.toContain("document-private-1");
    expect(serialized).not.toContain("private-supplier-bill.pdf");
    expect(serialized).not.toContain("accounting-private-1");
    expect(serialized).not.toContain("xero-private-1");
  });

  it("rejects an invalid canonical v2 record before prompt serialization", () => {
    const record = buildSupplierBillTestRecord();
    record.payload.schemaVersion = "wrong-version" as "supplier_bill.v2";

    expect(() => compactSupplierBillBusinessRecordForPrompt(record))
      .toThrow("Invalid Supplier Bill UCL Container");
  });

  it("uses a safe reason code when an otherwise valid projection cannot meet its byte budget", () => {
    const record = buildSupplierBillPromptCompactionFailureRecord();

    try {
      compactSupplierBillBusinessRecordForPrompt(record);
      throw new Error("Expected prompt compaction to fail.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "supplier_bill_prompt_compaction_failed",
      });
    }
  });

  it("selects only a cursor-ordered prefix and leaves deferred bills behind the cursor", () => {
    const records = Array.from(
      { length: SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET + 3 },
      (_, index) => buildSupplierBillTestRecord({ index: index + 1 }),
    );
    const result = selectSupplierBillRecordsForPrompt({
      records,
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: {
        updatedAt: records.at(-1)!.updatedAt,
        id: records.at(-1)!.source.sourceId,
      },
    });

    expect(result.records).toEqual(records.slice(0, SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET));
    expect(result.deferredRecordCount).toBe(3);
    expect(result.deferredReason).toBe("record_count_limit");
    expect(result.nextCursorCandidate).toEqual({
      updatedAt: records[SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET - 1].updatedAt,
      id: records[SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET - 1].source.sourceId,
    });
    expect(result.sourceNextCursorCandidate.id).toBe(records.at(-1)!.source.sourceId);
  });

  it("supports a smaller diagnostic prefix without weakening effective-cursor ordering", () => {
    const shuffled = buildAdversarialSupplierBillRecords(7);
    const expected = [...shuffled].sort(compareSupplierBillEffectiveCursor);
    const result = selectSupplierBillRecordsForPrompt({
      records: shuffled,
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: getSupplierBillEffectiveCursor(expected.at(-1)!),
      maxRecords: 3,
    });

    expect(result.records.map((record) => record.source.sourceId)).toEqual(
      expected.slice(0, 3).map((record) => record.source.sourceId),
    );
    expect(result.nextCursorCandidate).toEqual(getSupplierBillEffectiveCursor(expected[2]));
    expect(result.deferredRecordCount).toBe(4);
    expect(result.deferredReason).toBe("record_count_limit");
    for (const deferred of expected.slice(3)) {
      expect(compareCursor(
        getSupplierBillEffectiveCursor(deferred),
        result.nextCursorCandidate,
      )).toBeGreaterThan(0);
    }
  });

  it("deterministically processes a shuffled 27-record effective-cursor sequence in 12/12/3 batches", () => {
    const shuffled = buildAdversarialSupplierBillRecords(27);
    const expected = [...shuffled].sort(compareSupplierBillEffectiveCursor);
    const sourceNextCursorCandidate = getSupplierBillEffectiveCursor(expected.at(-1)!);
    const successfulSourceIds: string[] = [];
    const batchSourceIds: string[][] = [];
    let previousCursor: UniversalLearningCursor = { updatedAt: null, id: null };

    while (successfulSourceIds.length < expected.length) {
      const eligible = shuffled.filter(
        (record) => compareCursor(getSupplierBillEffectiveCursor(record), previousCursor) > 0,
      );
      const orderedEligible = [...eligible].sort(compareSupplierBillEffectiveCursor);
      const selection = selectSupplierBillRecordsForPrompt({
        records: eligible,
        previousCursor,
        sourceNextCursorCandidate,
      });
      const selectedIds = selection.records.map((record) => record.source.sourceId);
      const selectedCursors = selection.records.map(getSupplierBillEffectiveCursor);

      expect(selectedCursors).toEqual(
        [...selectedCursors].sort(compareCursor),
      );
      expect(selection.nextCursorCandidate).toEqual(selectedCursors.at(-1));
      for (const deferred of orderedEligible.slice(selection.records.length)) {
        expect(
          compareCursor(
            getSupplierBillEffectiveCursor(deferred),
            selection.nextCursorCandidate,
          ),
        ).toBeGreaterThan(0);
      }

      batchSourceIds.push(selectedIds);
      successfulSourceIds.push(...selectedIds);
      previousCursor = selection.nextCursorCandidate;
    }

    expect(batchSourceIds.map((batch) => batch.length)).toEqual([12, 12, 3]);
    expect(batchSourceIds[1][0]).toBe(expected[12].source.sourceId);
    expect(batchSourceIds[2][0]).toBe(expected[24].source.sourceId);
    expect(successfulSourceIds).toEqual(expected.map((record) => record.source.sourceId));
    expect(new Set(successfulSourceIds).size).toBe(27);
    expect(previousCursor).toEqual(sourceNextCursorCandidate);
  });

  it.each([12, 13])(
    "uses an exact deterministic prefix for %i shuffled records",
    (count) => {
      const shuffled = buildAdversarialSupplierBillRecords(count);
      const expected = [...shuffled].sort(compareSupplierBillEffectiveCursor);
      const result = selectSupplierBillRecordsForPrompt({
        records: shuffled,
        previousCursor: { updatedAt: null, id: null },
        sourceNextCursorCandidate: getSupplierBillEffectiveCursor(expected.at(-1)!),
      });

      expect(result.records.map((record) => record.source.sourceId)).toEqual(
        expected
          .slice(0, SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET)
          .map((record) => record.source.sourceId),
      );
      expect(result.deferredRecordCount).toBe(
        Math.max(0, count - SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET),
      );
      expect(result.nextCursorCandidate).toEqual(
        getSupplierBillEffectiveCursor(
          expected[Math.min(count, SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET) - 1],
        ),
      );
    },
  );

  it("breaks equal effective timestamps by source ID regardless of input order", () => {
    const records = [2, 11, 1, 10].map((index) =>
      buildSupplierBillTestRecord({
        index,
        updatedAt: "2026-07-27T01:11:00.000Z",
      }));
    const result = selectSupplierBillRecordsForPrompt({
      records,
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: {
        updatedAt: "2026-07-27T01:11:00.000Z",
        id: "invoice-2",
      },
    });

    expect(result.records.map((record) => record.source.sourceId)).toEqual([
      "invoice-1",
      "invoice-10",
      "invoice-11",
      "invoice-2",
    ]);
  });

  it("treats equivalent UTC and offset cursor representations as the same instant", () => {
    const record = buildSupplierBillTestRecord({
      index: 2,
      updatedAt: "2026-07-27T01:11:00.000000Z",
    });
    const result = selectSupplierBillRecordsForPrompt({
      records: [record],
      previousCursor: {
        updatedAt: "2026-07-27T13:11:00.000+12:00",
        id: "invoice-1",
      },
      sourceNextCursorCandidate: {
        updatedAt: "2026-07-27T13:11:00+12:00",
        id: "invoice-2",
      },
    });

    expect(result.records).toEqual([record]);
    expect(result.nextCursorCandidate).toEqual(getSupplierBillEffectiveCursor(record));
  });

  it("rejects a source cursor that disagrees with the ordered candidate sequence", () => {
    const records = buildAdversarialSupplierBillRecords(13);

    expect(() => selectSupplierBillRecordsForPrompt({
      records,
      previousCursor: { updatedAt: null, id: null },
      sourceNextCursorCandidate: {
        updatedAt: "2026-07-27T01:59:00.000Z",
        id: "not-the-final-source",
      },
    })).toThrow("source cursor does not equal the final effective record cursor");
  });

  it("does not change prompt projection for unrelated UCL records", () => {
    const unrelated = {
      containerType: "project_purchase_order" as const,
      source: { table: "project_purchase_orders", sourceId: "po-1", sourceVersion: 1 },
      organizationId: "org-1",
      projectId: null,
      opportunityId: null,
      supplierId: null,
      clientId: null,
      actorUserId: null,
      updatedAt: "2026-07-01T00:00:00.000Z",
      status: {},
      payload: {
        sourceEvidence: { title: "PO" },
        operationalContext: { status: "Draft" },
        lineageContext: { sourceId: "po-1" },
      },
      linkedContext: {},
      routingContext: { readOnly: true },
      signalStrength: "normal" as const,
    };
    const packet = {
      reviewMeta: {
        reviewId: "",
        organizationId: "org-1",
        containerType: "project_purchase_order",
        reviewMonth: "2026-07",
        reviewPeriodStart: "2026-07-01T00:00:00.000Z",
        reviewPeriodEnd: "2026-08-01T00:00:00.000Z",
        runType: "monthly",
        previousReviewCursor: { updatedAt: null, id: null },
        nextReviewCursorCandidate: { updatedAt: unrelated.updatedAt, id: "po-1" },
        reviewIntent: "test",
        maxLearnings: 12,
      },
      companyConstructionProfile: { rawProfile: null, normalizedProfile: {} },
      existingRelevantMemories: [],
      reviewScopeContext: {
        module: "purchase_orders",
        workflow: "monthly_purchase_order_review",
        recordCount: 1,
        projectCount: 0,
        supplierCount: 0,
        clientCount: 0,
        statusMix: {},
        projects: [],
        suppliers: [],
        clients: [],
      },
      newBusinessActivity: [unrelated],
      boundaryContext: {
        routingIsImmutable: true,
        lockedFields: [],
        forbiddenOperationalChanges: [],
        lockedRoutingCodes: {},
      },
    } satisfies UniversalLearningPromptPacket;

    const modelPacket = buildModelVisiblePromptPacket(packet) as {
      newBusinessActivity: Array<Record<string, unknown>>;
    };
    expect(modelPacket.newBusinessActivity).toEqual([{
      sourceEvidence: { title: "PO" },
      operationalContext: { status: "Draft" },
      lineageContext: { sourceId: "po-1" },
      routingContext: { readOnly: true },
    }]);
  });
});
