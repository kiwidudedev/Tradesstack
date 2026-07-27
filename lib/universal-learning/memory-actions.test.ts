import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coerceUniversalConstructionLearningResponseShape,
  normalizeUniversalConstructionLearningResponse,
} from "@/lib/universal-learning/response-normalization";
import { validateUniversalConstructionLearningResponse } from "@/lib/universal-learning/response-schema";
import realAnthropicCompactTargetResponse from "@/lib/universal-learning/__fixtures__/real-anthropic-supplier-invoice-allocation-response-compact-target.json";
import type {
  UniversalLearningBusinessRecord,
  UniversalLearningMemoryPackItem,
  UniversalLearningResponse,
} from "@/lib/universal-learning/types";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

function buildRecord(
  sourceId: string,
  containerType: UniversalLearningBusinessRecord["containerType"] = "supplier_invoice_allocation",
): UniversalLearningBusinessRecord {
  const tableByContainerType: Record<UniversalLearningBusinessRecord["containerType"], string> = {
    pricing_workbook_sheet: "pricing_workbook_sheets",
    takeoff_measurement: "takeoff_measurements",
    project_quote: "project_quotes",
    project_variation: "project_variations",
    project_purchase_order: "project_purchase_orders",
    supplier_invoice: "supplier_invoices",
    supplier_invoice_allocation: "supplier_invoice_line_allocations",
    project_actual_cost_event: "project_actual_cost_events",
    organization_material: "organization_materials",
    material_import_batch: "material_import_batches",
    project_claim: "project_claims",
    project_time_sheet_entry: "project_time_sheet_entries",
    project_quality_issue: "project_quality_issues",
    project_quality_inspection: "project_quality_inspections",
    project_quality_sign_off: "project_quality_sign_offs",
    task: "tasks",
  };

  return {
    containerType,
    source: {
      table: tableByContainerType[containerType],
      sourceId,
      sourceVersion: 1,
    },
    organizationId: "org-1",
    projectId: null,
    opportunityId: null,
    supplierId: null,
    clientId: null,
    actorUserId: null,
    updatedAt: "2026-06-01T00:00:00.000Z",
    status: {},
    payload: {},
    linkedContext: {},
    routingContext: {},
    signalStrength: "normal",
  };
}

function buildExistingMemory(input: {
  id: string;
  sourceId: string;
  containerType: "project_quote" | "supplier_invoice_allocation";
}): UniversalLearningMemoryPackItem {
  return {
    id: input.id,
    memoryCategory: "construction_decision",
    memoryType: `${input.containerType}_learning`,
    title: "Prior memory",
    summary: "Prior memory summary.",
    confidenceScore: 0.7,
    derivedFromTotalCount: 1,
    memoryValue: {
      containerType: input.containerType,
    },
    evidenceSummary: {
      evidence: {
        supportingRecords: [
          {
            sourceId: input.sourceId,
            containerType: input.containerType,
            reason: "prior memory evidence",
          },
        ],
      },
      reviewRunId: "prior-run-1",
    },
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function buildResponse(sourceId: string): UniversalLearningResponse {
  return {
    reviewSummary: {
      overallAssessment: "Assessment",
      dominantThemes: ["theme"],
      confidenceNotes: "notes",
    },
    learnings: {
      observations: [
        {
          learningId: "learning-1",
          title: "Learning",
          statement: "Statement",
          whyItMatters: "Why it matters",
          confidence: {
            score: 0.8,
            label: "high",
            reasoning: "reasoning",
          },
          evidence: {
            recordCount: 1,
            projectCount: 0,
            supplierCount: 0,
            timeSpan: "2026-06",
            supportingRecords: [
              {
                sourceId,
                reason: "support",
              },
            ],
          },
          relationshipToExistingMemory: {
            status: "new",
            memoryId: null,
            explanation: "new",
          },
          provenance: {
            reviewPeriodStart: "2026-06-01T00:00:00.000Z",
            reviewPeriodEnd: "2026-07-01T00:00:00.000Z",
            relevantEntities: {
              projectIds: [],
              supplierIds: [],
              clientIds: [],
              materialIds: [],
            },
          },
        },
      ],
      emergingPatterns: [],
      reinforcedPatterns: [],
      durablePatterns: [],
      changingBehaviors: [],
      contradictions: [],
      needsMoreEvidence: [],
    },
    memoryActions: {
      create: [],
      reinforce: [],
      update: [],
      retireOrDeactivate: [],
      noAction: [
        {
          action: "no_action",
          targetMemoryId: null,
          basedOnLearningId: "learning-1",
          proposedMemoryTitle: null,
          proposedMemorySummary: "skip",
          confidenceAdjustment: 0,
          reason: "skip",
        },
      ],
    },
  };
}

describe("Universal learning memory action sourceId normalization", () => {
  beforeEach(() => {
    createAdminSupabaseClient.mockReset();
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(),
        upsert: vi.fn(),
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn(),
        single: vi.fn(),
        update: vi.fn(),
      })),
    });
  });

  beforeEach(async () => {
    const { resetUniversalLearningSourceRefCorrectionDiagnostics } = await import("./memory-actions");
    resetUniversalLearningSourceRefCorrectionDiagnostics();
  });

  it("keeps full UUID supporting record ids", async () => {
    const { normalizeUniversalLearningResponseSourceIds } = await import("./memory-actions");
    const fullId = "12d4776a-eedd-46ba-aa27-263a841b6ab9";
    const normalized = normalizeUniversalLearningResponseSourceIds({
      response: buildResponse(fullId),
      reviewedSourceIds: [fullId],
    });

    expect(normalized.learnings.observations[0]?.evidence.supportingRecords[0]?.sourceId).toBe(fullId);
  });

  it("expands unique prefixes to full UUIDs", async () => {
    const {
      normalizeUniversalLearningResponseSourceIds,
      getUniversalLearningSourceRefCorrectionDiagnostics,
      resetUniversalLearningSourceRefCorrectionDiagnostics,
    } = await import("./memory-actions");
    const fullId = "12d4776a-eedd-46ba-aa27-263a841b6ab9";
    resetUniversalLearningSourceRefCorrectionDiagnostics();
    const normalized = normalizeUniversalLearningResponseSourceIds({
      response: buildResponse("12d4776a"),
      reviewedSourceIds: [fullId],
    });

    expect(normalized.learnings.observations[0]?.evidence.supportingRecords[0]?.sourceId).toBe(fullId);
    expect(getUniversalLearningSourceRefCorrectionDiagnostics()).toEqual([]);
  });

  it("fuzzily resolves an obvious unique reviewed-record UUID typo", async () => {
    const {
      normalizeUniversalLearningResponseSourceIds,
      getUniversalLearningSourceRefCorrectionDiagnostics,
      resetUniversalLearningSourceRefCorrectionDiagnostics,
    } = await import("./memory-actions");
    const fullId = "9beff59b-c96d-4e8c-b205-286a85c84bab";
    const typoId = "9beff59b-c96d-4e8c-b205-286a85c8d41";
    resetUniversalLearningSourceRefCorrectionDiagnostics();
    const normalized = normalizeUniversalLearningResponseSourceIds({
      response: buildResponse(typoId),
      reviewedSourceIds: [fullId],
    });

    expect(normalized.learnings.observations[0]?.evidence.supportingRecords[0]?.sourceId).toBe(fullId);
    expect(getUniversalLearningSourceRefCorrectionDiagnostics()).toEqual([
      expect.objectContaining({
        learningId: "learning-1",
        originalSourceId: typoId,
        resolvedSourceId: fullId,
        correctionMethod: "fuzzy_unique_source_ref",
        sourceScope: "reviewed_record",
      }),
    ]);
  });

  it("builds organization_memory_links rows that satisfy source_presence_check", async () => {
    const {
      buildUniversalLearningProvenanceLinkRows,
      normalizeUniversalLearningResponseSourceIds,
    } = await import("./memory-actions");
    const fullId = "12d4776a-eedd-46ba-aa27-263a841b6ab9";
    const record = buildRecord(fullId);
    const recordsBySourceId = new Map([[fullId, record]]);
    const normalized = normalizeUniversalLearningResponseSourceIds({
      response: buildResponse("12d4776a"),
      reviewedSourceIds: [fullId],
      recordsBySourceId,
    });

    const rows = buildUniversalLearningProvenanceLinkRows({
      organizationId: "org-1",
      memoryId: "memory-1",
      learning: normalized.learnings.observations[0]!,
      recordsBySourceId,
      contradiction: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_event_id: null,
      source_ai_interaction_id: null,
      source_correction_event_id: null,
      source_validation_case_id: null,
      source_entity_type: "supplier_invoice_allocation",
      source_entity_id: fullId,
      link_type: "supporting",
    });
  });

  it("builds supplier_invoice provenance links without creating linkless memories", async () => {
    const {
      buildUniversalLearningProvenanceLinkRows,
      normalizeUniversalLearningResponseSourceIds,
    } = await import("./memory-actions");
    const fullId = "invoice-1";
    const record = buildRecord(fullId, "supplier_invoice");
    record.source.table = "supplier_invoices";
    record.supplierId = "supplier-1";
    record.projectId = "project-1";
    const recordsBySourceId = new Map([[fullId, record]]);
    const normalized = normalizeUniversalLearningResponseSourceIds({
      response: buildResponse("invoice-1"),
      reviewedSourceIds: [fullId],
      recordsBySourceId,
    });

    const rows = buildUniversalLearningProvenanceLinkRows({
      organizationId: "org-1",
      memoryId: "memory-supplier-invoice-1",
      learning: normalized.learnings.observations[0]!,
      recordsBySourceId,
      contradiction: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_entity_type: "supplier_invoice",
      source_entity_id: "invoice-1",
      link_type: "supporting",
    });
    expect(rows[0]?.source_entity_id).toBeTruthy();
  });

  it("builds pricing_workbook_sheet provenance links without creating linkless memories", async () => {
    const {
      buildUniversalLearningProvenanceLinkRows,
      normalizeUniversalLearningResponseSourceIds,
    } = await import("./memory-actions");
    const fullId = "sheet-1";
    const record = buildRecord(fullId, "pricing_workbook_sheet");
    record.source.table = "opportunity_pricing_workbook_sheets";
    record.opportunityId = "opp-1";
    record.projectId = "project-1";
    record.clientId = "client-1";
    const recordsBySourceId = new Map([[fullId, record]]);
    const normalized = normalizeUniversalLearningResponseSourceIds({
      response: buildResponse(fullId),
      reviewedSourceIds: [fullId],
      reviewedRecords: [record],
      recordsBySourceId,
    });

    const rows = buildUniversalLearningProvenanceLinkRows({
      organizationId: "org-1",
      memoryId: "memory-pricing-workbook-sheet-1",
      learning: normalized.learnings.observations[0]!,
      recordsBySourceId,
      contradiction: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_entity_type: "pricing_workbook_sheet",
      source_entity_id: "sheet-1",
      link_type: "supporting",
    });
    expect(rows[0]?.source_entity_id).toBeTruthy();
  });

  it("resolves reviewed actual-cost lineage allocation ids as reviewed supplier_invoice_allocation provenance", async () => {
    const {
      buildUniversalLearningProvenanceLinkRows,
      normalizeUniversalLearningResponseSourceIds,
    } = await import("./memory-actions");
    const eventId = "fb1bf9bf-5e1e-4fe0-a440-abe7deeab478";
    const allocationId = "38da3671-255c-4383-ba4b-820a19cf6a3e";
    const record = buildRecord(eventId, "project_actual_cost_event");
    record.projectId = "project-1";
    record.clientId = "client-1";
    record.payload = {
      sourceEvidence: {
        sourceAllocation: {
          allocationId,
          supplierInvoiceLineAllocationId: allocationId,
        },
        supplierInvoice: {
          invoiceId: "invoice-1",
        },
      },
      lineageContext: {
        eventId,
        supplierInvoiceId: "invoice-1",
        supplierInvoiceLineAllocationId: allocationId,
        sourceInvoiceAllocationId: allocationId,
        correctionRootEventId: eventId,
      },
    };
    const recordsBySourceId = new Map<string, UniversalLearningBusinessRecord>([
      [eventId, record],
      [allocationId, record],
    ]);

    const normalized = normalizeUniversalLearningResponseSourceIds({
      response: buildResponse(allocationId),
      reviewedSourceIds: [eventId],
      reviewedRecords: [record],
      recordsBySourceId,
    });
    const supportingRecord = normalized.learnings.observations[0]?.evidence.supportingRecords[0];

    expect(supportingRecord).toMatchObject({
      sourceId: allocationId,
      sourceScope: "reviewed_record",
      containerType: "supplier_invoice_allocation",
    });

    const rows = buildUniversalLearningProvenanceLinkRows({
      organizationId: "org-1",
      memoryId: "memory-1",
      learning: normalized.learnings.observations[0]!,
      recordsBySourceId,
      contradiction: false,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        source_entity_type: "supplier_invoice_allocation",
        source_entity_id: allocationId,
        link_type: "supporting",
      }),
    ]);
  });

  it("uses v2 sourceRefs as provenance supporting records", async () => {
    const {
      buildUniversalLearningProvenanceLinkRows,
      normalizeUniversalLearningResponseSourceIds,
    } = await import("./memory-actions");
    const fullId = "12d4776a-eedd-46ba-aa27-263a841b6ab9";
    const record = buildRecord(fullId);
    const coerced = coerceUniversalConstructionLearningResponseShape({
      contractVersion: "ucl_response_v2",
      reviewSummary: {
        assessment: "PO review found a cautious draft procurement signal.",
        confidence: "moderate",
        notes: "Source refs are compact.",
      },
      learnings: [
        {
          id: "L1",
          stage: "observation",
          statement: "The company is drafting supplier POs before stronger procurement evidence appears.",
          importance: "This should stay observational until approved or invoiced records reinforce it.",
          confidence: {
            score: 0.4,
            label: "moderate",
            basis: "One reviewed record supports the signal.",
          },
          evidence: {
            recordCount: 1,
            sourceRefs: [
              { sourceId: "12d4776a", note: "draft PO source evidence" },
            ],
          },
          existingMemory: {
            status: "insufficient",
            memoryId: null,
          },
        },
      ],
      memoryActions: [
        {
          action: "no_action",
          learningId: "L1",
          targetMemoryId: null,
          title: null,
          summary: null,
          confidenceAdjustment: 0,
          reason: "Needs stronger evidence.",
        },
      ],
    });
    const validation = validateUniversalConstructionLearningResponse(coerced);
    expect(validation.success).toBe(true);
    if (!validation.success) {
      return;
    }

    const normalized = normalizeUniversalConstructionLearningResponse(validation.data);
    const sourceNormalized = normalizeUniversalLearningResponseSourceIds({
      response: normalized,
      reviewedSourceIds: [fullId],
      recordsBySourceId: new Map([[fullId, record]]),
    });

    const rows = buildUniversalLearningProvenanceLinkRows({
      organizationId: "org-1",
      memoryId: "memory-1",
      learning: sourceNormalized.learnings.observations[0]!,
      recordsBySourceId: new Map([[fullId, record]]),
      contradiction: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_entity_type: "supplier_invoice_allocation",
      source_entity_id: fullId,
      note: "draft PO source evidence",
    });
  });

  it("resolves reviewed records and existing memory source evidence for cross-memory reasoning", async () => {
    const {
      buildUniversalLearningProvenanceLinkRows,
      normalizeUniversalLearningResponseSourceIds,
    } = await import("./memory-actions");
    const currentPoId = "ccff2c22-2881-45f1-b926-e2fa57bf8fee";
    const priorQuoteId = "ca1224a1-a312-45fb-a1cb-1ec7a45d5266";
    const currentRecord = buildRecord(currentPoId, "project_purchase_order");
    const existingMemories = [
      buildExistingMemory({
        id: "1a933aa6-9c05-474f-a33b-bedbb5acba75",
        sourceId: priorQuoteId,
        containerType: "project_quote",
      }),
      buildExistingMemory({
        id: "be747d0b-3203-41f5-a381-f94290084832",
        sourceId: priorQuoteId,
        containerType: "project_quote",
      }),
    ];
    const coerced = coerceUniversalConstructionLearningResponseShape({
      contractVersion: "ucl_response_v2",
      reviewSummary: {
        assessment: "PO cost-side evidence was compared with prior quote evidence.",
        confidence: "moderate",
        notes: "L7 is needs-more-evidence and no_action.",
      },
      learnings: [
        {
          id: "L7",
          stage: "needs_more_evidence",
          statement: "PO install-only labour rates may differ from prior supply-and-install quote rates.",
          importance: "The comparison is useful but not directly durable.",
          confidence: {
            score: 0.45,
            label: "low",
            basis: "One current PO and one prior quote evidence source.",
          },
          evidence: {
            recordCount: 2,
            sourceRefs: [
              { sourceId: "ccff2c22", note: "current PO install labour" },
              { sourceId: "ca1224a1", note: "prior quote supply-and-install rate" },
            ],
          },
          existingMemory: {
            status: "new",
            memoryId: null,
          },
        },
      ],
      memoryActions: [
        {
          action: "no_action",
          learningId: "L7",
          targetMemoryId: null,
          title: null,
          summary: null,
          confidenceAdjustment: 0,
          reason: "Rates are not directly comparable.",
        },
      ],
    });
    const validation = validateUniversalConstructionLearningResponse(coerced);
    expect(validation.success).toBe(true);
    if (!validation.success) {
      return;
    }

    const normalized = normalizeUniversalConstructionLearningResponse(validation.data);
    const sourceNormalized = normalizeUniversalLearningResponseSourceIds({
      response: normalized,
      reviewedSourceIds: [currentPoId],
      recordsBySourceId: new Map([[currentPoId, currentRecord]]),
      existingMemories,
    });
    const learning = sourceNormalized.learnings.needsMoreEvidence[0]!;

    expect(learning.evidence.supportingRecords).toEqual([
      expect.objectContaining({
        sourceId: currentPoId,
        sourceScope: "reviewed_record",
      }),
      expect.objectContaining({
        sourceId: priorQuoteId,
        sourceScope: "existing_memory_source",
        containerType: "project_quote",
        memoryId: null,
      }),
    ]);

    const rows = buildUniversalLearningProvenanceLinkRows({
      organizationId: "org-1",
      memoryId: "memory-1",
      learning,
      recordsBySourceId: new Map([[currentPoId, currentRecord]]),
      contradiction: false,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        source_entity_type: "project_purchase_order",
        source_entity_id: currentPoId,
      }),
      expect.objectContaining({
        source_entity_type: "project_quote",
        source_entity_id: priorQuoteId,
      }),
    ]);
  });

  it("dedupes duplicate provenance rows by organization_memory_links conflict identity", async () => {
    const { buildUniversalLearningProvenanceLinkRows } = await import("./memory-actions");
    const fullId = "12d4776a-eedd-46ba-aa27-263a841b6ab9";
    const record = buildRecord(fullId);
    const response = buildResponse(fullId);
    response.learnings.observations[0]!.evidence.supportingRecords = [
      { sourceId: fullId, containerType: "supplier_invoice_allocation", reason: "first reason" },
      { sourceId: fullId, containerType: "supplier_invoice_allocation", reason: "second reason" },
    ];

    const rows = buildUniversalLearningProvenanceLinkRows({
      organizationId: "org-1",
      memoryId: "memory-1",
      learning: response.learnings.observations[0]!,
      recordsBySourceId: new Map([[fullId, record]]),
      contradiction: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_entity_id).toBe(fullId);
  });

  it("uses opportunity_quote provenance entity type for reviewed opportunity quote records", async () => {
    const { buildUniversalLearningProvenanceLinkRows } = await import("./memory-actions");
    const record: UniversalLearningBusinessRecord = {
      containerType: "project_quote",
      source: {
        table: "opportunity_quotes",
        sourceId: "op-quote-1",
        sourceVersion: 1,
      },
      organizationId: "org-1",
      projectId: null,
      opportunityId: "opportunity-1",
      supplierId: null,
      clientId: null,
      actorUserId: null,
      updatedAt: "2026-06-25T07:10:41.549107+00:00",
      status: { status: "Sent" },
      payload: {},
      linkedContext: {},
      routingContext: { readOnly: true },
      signalStrength: "strong",
    };
    const response = buildResponse("op-quote-1");

    const rows = buildUniversalLearningProvenanceLinkRows({
      organizationId: "org-1",
      memoryId: "memory-1",
      learning: response.learnings.observations[0]!,
      recordsBySourceId: new Map([["op-quote-1", record]]),
      contradiction: false,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        source_entity_type: "opportunity_quote",
        source_entity_id: "op-quote-1",
      }),
    ]);
  });

  it("fails for unknown prefixes", async () => {
    const { normalizeUniversalLearningResponseSourceIds, UniversalLearningSourceIdNormalizationError } = await import("./memory-actions");

    expect(() => normalizeUniversalLearningResponseSourceIds({
      response: buildResponse("deadbeef"),
      reviewedSourceIds: ["12d4776a-eedd-46ba-aa27-263a841b6ab9"],
    })).toThrow(UniversalLearningSourceIdNormalizationError);
  });

  it("fails for ambiguous prefixes", async () => {
    const { normalizeUniversalLearningResponseSourceIds, UniversalLearningSourceIdNormalizationError } = await import("./memory-actions");

    expect(() => normalizeUniversalLearningResponseSourceIds({
      response: buildResponse("12d4"),
      reviewedSourceIds: [
        "12d4776a-eedd-46ba-aa27-263a841b6ab9",
        "12d49999-eedd-46ba-aa27-263a841b6ab9",
      ],
    })).toThrow(UniversalLearningSourceIdNormalizationError);
  });

  it("fails for ambiguous fuzzy UUID candidates", async () => {
    const { normalizeUniversalLearningResponseSourceIds, UniversalLearningSourceIdNormalizationError } = await import("./memory-actions");

    expect(() => normalizeUniversalLearningResponseSourceIds({
      response: buildResponse("12d4776a-eedd-46ba-aa27-263a841b6ab"),
      reviewedSourceIds: [
        "12d4776a-eedd-46ba-aa27-263a841b6ab9",
        "12d4776a-eedd-46ba-aa27-263a841b6abc",
      ],
    })).toThrow(UniversalLearningSourceIdNormalizationError);
  });

  it("fails for unrelated malformed UUIDs with no candidate", async () => {
    const { normalizeUniversalLearningResponseSourceIds, UniversalLearningSourceIdNormalizationError } = await import("./memory-actions");

    expect(() => normalizeUniversalLearningResponseSourceIds({
      response: buildResponse("9beff59b-c96d-4e8c-b205-286a85c8ffff"),
      reviewedSourceIds: ["12d4776a-eedd-46ba-aa27-263a841b6ab9"],
    })).toThrow(UniversalLearningSourceIdNormalizationError);
  });

  it("fails fuzzy resolution when the first 8 chars do not match", async () => {
    const { normalizeUniversalLearningResponseSourceIds, UniversalLearningSourceIdNormalizationError } = await import("./memory-actions");

    expect(() => normalizeUniversalLearningResponseSourceIds({
      response: buildResponse("deadbeef-c96d-4e8c-b205-286a85c84bab"),
      reviewedSourceIds: ["9beff59b-c96d-4e8c-b205-286a85c84bab"],
    })).toThrow(UniversalLearningSourceIdNormalizationError);
  });

  it("expands compact targetMemoryId prefixes from the relevant memory pack", async () => {
    const {
      normalizeUniversalLearningResponseTargetMemoryIds,
    } = await import("./memory-actions");
    const coerced = coerceUniversalConstructionLearningResponseShape(realAnthropicCompactTargetResponse);
    const validation = validateUniversalConstructionLearningResponse(coerced);
    expect(validation.success).toBe(true);
    if (!validation.success) {
      return;
    }

    const normalized = normalizeUniversalConstructionLearningResponse(validation.data);
    const targetNormalized = normalizeUniversalLearningResponseTargetMemoryIds({
      response: normalized,
      existingMemoryIds: ["291e682b-d135-452a-b691-00bf5db9fb62"],
    });

    expect(targetNormalized.memoryActions.reinforce[0]?.targetMemoryId).toBe("291e682b-d135-452a-b691-00bf5db9fb62");
  });

  it("fails before writes for unknown compact targetMemoryId prefixes", async () => {
    const admin = {
      from: vi.fn(),
    };
    createAdminSupabaseClient.mockReturnValue(admin);

    const { applyUniversalLearningMemoryActions, UniversalLearningTargetMemoryIdNormalizationError } = await import("./memory-actions");
    const fullId = "12d4776a-eedd-46ba-aa27-263a841b6ab9";
    const response = buildResponse(fullId);
    response.memoryActions.noAction = [];
    response.memoryActions.reinforce = [{
      action: "reinforce",
      targetMemoryId: "deadbeef",
      basedOnLearningId: "learning-1",
      proposedMemoryTitle: null,
      proposedMemorySummary: "summary",
      confidenceAdjustment: 0.1,
      reason: "reason",
    }];

    await expect(applyUniversalLearningMemoryActions({
      reviewRunId: "run-1",
      selection: {
        organizationId: "org-1",
        containerType: "supplier_invoice_allocation",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-1",
      },
      response,
      records: [buildRecord(fullId)],
      existingMemories: [{ id: "291e682b-d135-452a-b691-00bf5db9fb62" } as never],
    })).rejects.toBeInstanceOf(UniversalLearningTargetMemoryIdNormalizationError);

    expect(admin.from).not.toHaveBeenCalled();
  });

  it("fails before writes for ambiguous compact targetMemoryId prefixes", async () => {
    const admin = {
      from: vi.fn(),
    };
    createAdminSupabaseClient.mockReturnValue(admin);

    const { applyUniversalLearningMemoryActions, UniversalLearningTargetMemoryIdNormalizationError } = await import("./memory-actions");
    const fullId = "12d4776a-eedd-46ba-aa27-263a841b6ab9";
    const response = buildResponse(fullId);
    response.memoryActions.noAction = [];
    response.memoryActions.update = [{
      action: "update",
      targetMemoryId: "291e682b",
      basedOnLearningId: "learning-1",
      proposedMemoryTitle: null,
      proposedMemorySummary: "summary",
      confidenceAdjustment: 0.1,
      reason: "reason",
    }];

    await expect(applyUniversalLearningMemoryActions({
      reviewRunId: "run-1",
      selection: {
        organizationId: "org-1",
        containerType: "supplier_invoice_allocation",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-1",
      },
      response,
      records: [buildRecord(fullId)],
      existingMemories: [
        { id: "291e682b-d135-452a-b691-00bf5db9fb62" } as never,
        { id: "291e682b-e135-452a-b691-00bf5db9fb62" } as never,
      ],
    })).rejects.toBeInstanceOf(UniversalLearningTargetMemoryIdNormalizationError);

    expect(admin.from).not.toHaveBeenCalled();
  });

  it("fails before writes when a memory action references a missing learningId", async () => {
    const admin = {
      from: vi.fn(),
    };
    createAdminSupabaseClient.mockReturnValue(admin);

    const { applyUniversalLearningMemoryActions, UniversalLearningActionPreflightError } = await import("./memory-actions");
    const fullId = "12d4776a-eedd-46ba-aa27-263a841b6ab9";
    const response = buildResponse(fullId);
    response.memoryActions.noAction[0]!.basedOnLearningId = "missing-learning";

    await expect(applyUniversalLearningMemoryActions({
      reviewRunId: "run-1",
      selection: {
        organizationId: "org-1",
        containerType: "supplier_invoice_allocation",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-1",
      },
      response,
      records: [buildRecord(fullId)],
    })).rejects.toBeInstanceOf(UniversalLearningActionPreflightError);

    expect(admin.from).not.toHaveBeenCalled();
  });

  it("does not apply any writes when sourceId normalization fails", async () => {
    const admin = {
      from: vi.fn(() => ({
        insert: vi.fn(),
        upsert: vi.fn(),
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn(),
        single: vi.fn(),
        update: vi.fn(),
      })),
    };
    createAdminSupabaseClient.mockReturnValue(admin);

    const { applyUniversalLearningMemoryActions, UniversalLearningSourceIdNormalizationError } = await import("./memory-actions");

    await expect(applyUniversalLearningMemoryActions({
      reviewRunId: "run-1",
      selection: {
        organizationId: "org-1",
        containerType: "supplier_invoice_allocation",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-1",
      },
      response: buildResponse("deadbeef"),
      records: [buildRecord("12d4776a-eedd-46ba-aa27-263a841b6ab9")],
    })).rejects.toBeInstanceOf(UniversalLearningSourceIdNormalizationError);

    expect(admin.from).not.toHaveBeenCalled();
  });

  it("fails before writes when a memory-writing action has only existing memory source evidence", async () => {
    const admin = {
      from: vi.fn(),
    };
    createAdminSupabaseClient.mockReturnValue(admin);

    const { applyUniversalLearningMemoryActions, UniversalLearningActionPreflightError } = await import("./memory-actions");
    const currentPoId = "ccff2c22-2881-45f1-b926-e2fa57bf8fee";
    const priorQuoteId = "ca1224a1-a312-45fb-a1cb-1ec7a45d5266";
    const response = buildResponse(priorQuoteId);
    response.memoryActions.noAction = [];
    response.memoryActions.create = [{
      action: "create",
      targetMemoryId: null,
      basedOnLearningId: "learning-1",
      proposedMemoryTitle: "Historical-only memory should not write",
      proposedMemorySummary: "This should be blocked because no current reviewed record is cited.",
      confidenceAdjustment: 0,
      reason: "Historical evidence only.",
    }];

    await expect(applyUniversalLearningMemoryActions({
      reviewRunId: "run-1",
      selection: {
        organizationId: "org-1",
        containerType: "project_purchase_order",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-1",
      },
      response,
      records: [buildRecord(currentPoId)],
      existingMemories: [
        buildExistingMemory({
          id: "1a933aa6-9c05-474f-a33b-bedbb5acba75",
          sourceId: priorQuoteId,
          containerType: "project_quote",
        }),
      ],
    })).rejects.toBeInstanceOf(UniversalLearningActionPreflightError);

    expect(admin.from).not.toHaveBeenCalled();
  });
});
