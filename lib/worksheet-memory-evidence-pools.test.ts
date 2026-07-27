import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassifiedWorksheetMemoryEvent } from "@/lib/worksheet-memory-derivation";

const requirePlatformAdmin = vi.fn();
const createAdminSupabaseClient = vi.fn();
const listClassifiedWorksheetMemoryEvents = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));
vi.mock("@/lib/worksheet-memory-derivation", () => ({
  listClassifiedWorksheetMemoryEvents,
}));

function buildGridSpacingEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "event-1",
    organizationId: "org-1",
    classificationRecordId: "classification-1",
    classificationAttemptNumber: 1,
    projectId: "project-1",
    opportunityId: "opportunity-1",
    eventType: "worksheet_assumption_changed",
    occurredAt: "2026-06-06T00:00:00.000Z",
    metadata: {
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      sheetName: "Suspended Ceilings",
      worksheetName: "Suspended Ceilings",
      tradePackage: "Suspended Ceilings",
    },
    diffData: {
      itemLabel: "Grid Spacing",
      rowLabel: "Inputs",
      columnHeader: "Quantity",
      unit: "mm",
      oldValue: 1200,
      newValue: 600,
      oldFormula: null,
      newFormula: null,
    },
    classificationStatus: "classified",
    classificationVersion: 1,
    classificationSource: "llm",
    classificationProvider: "anthropic",
    classificationModel: "claude-haiku-4-5-20251001",
    classificationModelVersion: "1",
    overallConfidence: 0.85,
    reasoningSummary: "Repeated estimator assumption change.",
    semanticFields: {
      costRole: { value: "input_assumption", confidence: 0.85 },
      cellRole: { value: null, confidence: null },
      pageType: { value: "estimate_inputs", confidence: 0.85 },
      sectionType: { value: null, confidence: null },
      itemCategory: { value: "suspended_ceiling_parameter", confidence: 0.85 },
      measurementBasis: { value: null, confidence: null },
      normalizedUnit: { value: "mm", confidence: 0.85 },
      normalizedTradePackage: { value: "Suspended Ceilings", confidence: 0.85 },
      workCategory: { value: null, confidence: null },
      systemCategory: { value: null, confidence: null },
      assemblyCategory: { value: null, confidence: null },
    },
    interpretationPayload: {
      interpretedChange: {
        plainEnglishSummary: "Estimator reduced the main tee spacing from 1200mm to 600mm.",
        whatChanged: "Grid spacing changed from 1200mm to 600mm.",
        constructionContext: {
          tradeOrScope: "Suspended Ceilings",
          pageType: "estimate_inputs",
          itemCategory: "suspended_ceiling_parameter",
        },
        pricingContext: {
          costRole: "input_assumption",
        },
      },
    },
    interpretationSchemaVersion: 2,
    futureUseSummary: {
      memoryType: "estimator_assumption_decision",
    },
    confidenceDetail: {},
    classifiedAt: "2026-06-06T00:01:00.000Z",
    ...overrides,
  } satisfies ClassifiedWorksheetMemoryEvent;
}

function buildPerimeterWasteFactorEvent(overrides: Record<string, unknown> = {}) {
  return buildGridSpacingEvent({
    eventId: "waste-event-1",
    classificationRecordId: "waste-classification-1",
    eventType: "worksheet_assumption_changed",
    diffData: {
      itemLabel: "Perimeter Waste Factor",
      rowLabel: "Inputs",
      columnHeader: "Quantity",
      unit: "%",
      oldValue: 10,
      newValue: 12,
      oldFormula: null,
      newFormula: null,
    },
    semanticFields: {
      costRole: { value: "material_loss_contingency", confidence: 0.88 },
      cellRole: { value: null, confidence: null },
      pageType: { value: "inputs", confidence: 0.84 },
      sectionType: { value: null, confidence: null },
      itemCategory: { value: "waste_factor", confidence: 0.86 },
      measurementBasis: { value: null, confidence: null },
      normalizedUnit: { value: "%", confidence: 0.92 },
      normalizedTradePackage: { value: "suspended_ceilings", confidence: 0.9 },
      workCategory: { value: null, confidence: null },
      systemCategory: { value: null, confidence: null },
      assemblyCategory: { value: null, confidence: null },
    },
    interpretationPayload: {
      interpretedChange: {
        plainEnglishSummary: "The estimator increased the waste allowance factor for perimeter cutting and material loss from 10% to 12% in the suspended ceiling inputs section.",
        whatChanged: "Perimeter Waste Factor changed from 10% to 12%.",
        constructionContext: {
          tradeOrScope: "Suspended Ceilings",
          pageType: "inputs",
          itemCategory: "waste_factor",
        },
        pricingContext: {
          costRole: "material_loss_contingency",
        },
      },
    },
    ...overrides,
  });
}

function buildStructuralIdentityEvent(overrides: Record<string, unknown> = {}) {
  return buildGridSpacingEvent({
    eventId: "structural-event-1",
    classificationRecordId: "structural-classification-1",
    projectId: "project-structural-1",
    metadata: {
      workbookId: "workbook-structural-1",
      sheetId: "sheet-structural-1",
      sheetName: "Template Alpha",
      worksheetName: "Template Alpha",
      tradePackage: "Package Alpha",
    },
    diffData: {
      sectionLabel: "Inputs",
      subsectionLabel: "Crew Drivers",
      sectionPath: ["Inputs", "Crew Drivers"],
      itemLabel: "Driver Value",
      rowLabel: "Crew Drivers",
      columnHeader: "Quantity",
      columnRole: "quantity",
      columnId: "E",
      column: "E",
      unit: "days/m2",
      oldValue: 1.25,
      newValue: 1.5,
      oldFormula: null,
      newFormula: null,
      generatedByAi: false,
      pricingTuple: {
        quantity: {
          value: 1.5,
        },
        unit: {
          value: "days/m2",
        },
      },
      rowSnapshotAfter: {
        unit: "days/m2",
        visibleCells: [
          { columnRole: "description", value: "Editable crew-day driver", displayValue: "Editable crew-day driver" },
          { columnRole: "unit", value: "days/m2", displayValue: "days/m2" },
          { columnRole: "quantity", value: 1.5, displayValue: "1.5" },
        ],
      },
      rowSnapshotVisibleCells: [
        { columnRole: "description", value: "Editable crew-day driver", displayValue: "Editable crew-day driver" },
        { columnRole: "unit", value: "days/m2", displayValue: "days/m2" },
        { columnRole: "quantity", value: 1.5, displayValue: "1.5" },
      ],
      relatedRows: [
        {
          rowLabel: "Crew Drivers",
          itemLabel: "Derived Hours",
          unit: "hrs",
          visibleCells: [
            { columnRole: "amount", value: "=IFERROR(G10*H10,\"\")", displayValue: "0" },
            { columnRole: "notes", value: "driver times rate", displayValue: "driver times rate" },
          ],
        },
      ],
    },
    semanticFields: {
      costRole: { value: "alpha_role", confidence: 0.8 },
      cellRole: { value: null, confidence: null },
      pageType: { value: "alpha_page", confidence: 0.8 },
      sectionType: { value: "alpha_section", confidence: 0.8 },
      itemCategory: { value: "alpha_item", confidence: 0.8 },
      measurementBasis: { value: null, confidence: null },
      normalizedUnit: { value: "days/m2", confidence: 0.8 },
      normalizedTradePackage: { value: "Package Alpha", confidence: 0.8 },
      workCategory: { value: null, confidence: null },
      systemCategory: { value: null, confidence: null },
      assemblyCategory: { value: null, confidence: null },
    },
    interpretationPayload: {
      interpretedChange: {
        plainEnglishSummary: "Updated an editable driver value.",
        whatChanged: "Driver value changed from 1.25 to 1.5.",
        constructionContext: {
          tradeOrScope: "Package Alpha",
          pageType: "alpha_page",
          itemCategory: "alpha_item",
        },
        pricingContext: {
          costRole: "alpha_role",
        },
      },
    },
    ...overrides,
  });
}

function buildStrongRateIdentityEvent(overrides: Record<string, unknown> = {}) {
  return buildStructuralIdentityEvent({
    eventType: "worksheet_rate_changed",
    diffData: {
      sectionLabel: "Ceiling Framing",
      subsectionLabel: "Main Tee",
      sectionPath: ["Ceiling Framing", "Main Tee"],
      itemLabel: "Main Tee Rate",
      rowLabel: "Main Tee Rate",
      columnHeader: "Rate",
      columnRole: "rate",
      columnId: "F",
      column: "F",
      unit: "$/lm",
      oldValue: 4.55,
      newValue: 4.56,
      oldFormula: null,
      newFormula: null,
      generatedByAi: false,
      pricingTuple: {
        rate: {
          value: 4.56,
        },
        unit: {
          value: "$/lm",
        },
      },
      rowSnapshotAfter: {
        unit: "$/lm",
        visibleCells: [
          { columnRole: "description", value: "Main Tee framing supply", displayValue: "Main Tee framing supply" },
          { columnRole: "unit", value: "$/lm", displayValue: "$/lm" },
          { columnRole: "rate", value: 4.56, displayValue: "4.56" },
        ],
      },
      rowSnapshotVisibleCells: [
        { columnRole: "description", value: "Main Tee framing supply", displayValue: "Main Tee framing supply" },
        { columnRole: "unit", value: "$/lm", displayValue: "$/lm" },
        { columnRole: "rate", value: 4.56, displayValue: "4.56" },
      ],
      relatedRows: [
        {
          rowLabel: "Main Tee Quantity",
          itemLabel: "Lineal Metres",
          unit: "lm",
          visibleCells: [
            { columnRole: "amount", value: "=IFERROR(E8*F13,\"\")", displayValue: "0" },
            { columnRole: "notes", value: "main tee quantity times rate", displayValue: "main tee quantity times rate" },
          ],
        },
      ],
    },
    semanticFields: {
      costRole: { value: "material", confidence: 0.84 },
      cellRole: { value: null, confidence: null },
      pageType: { value: "cost_template", confidence: 0.8 },
      sectionType: { value: "framing_inputs", confidence: 0.8 },
      itemCategory: { value: "structural_component_rate", confidence: 0.78 },
      measurementBasis: { value: null, confidence: null },
      normalizedUnit: { value: "$/lm", confidence: 0.85 },
      normalizedTradePackage: { value: "Suspended Ceilings", confidence: 0.82 },
      workCategory: { value: null, confidence: null },
      systemCategory: { value: null, confidence: null },
      assemblyCategory: { value: null, confidence: null },
    },
    interpretationPayload: {
      interpretedChange: {
        plainEnglishSummary: "Updated the main tee rate.",
        whatChanged: "Main Tee Rate changed from 4.55 to 4.56.",
        constructionContext: {
          tradeOrScope: "Suspended Ceilings",
          pageType: "cost_template",
          itemCategory: "structural_component_rate",
        },
        pricingContext: {
          costRole: "material",
        },
      },
    },
    ...overrides,
  });
}

function createState() {
  return {
    pools: [] as Array<Record<string, unknown>>,
    links: [] as Array<Record<string, unknown>>,
    claimRows: [] as Array<Record<string, unknown>>,
    finalizedClaims: [] as Array<Record<string, unknown>>,
    semanticQueueInsertCount: 1,
    semanticQueueCalls: [] as Array<Record<string, unknown>>,
  };
}

function buildAdminClient(state: ReturnType<typeof createState>) {
  return {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "claim_worksheet_memory_evidence_pool_batch") {
        return {
          data: state.claimRows,
          error: null,
        };
      }

      if (fn === "finalize_worksheet_memory_evidence_pool_batch") {
        const payload = Array.isArray(args.p_inputs) ? args.p_inputs : [];
        state.finalizedClaims = payload;
        return {
          data: {
            count: payload.length,
            completedCount: payload.filter((entry) => entry.queueState === "completed").length,
            retriedCount: payload.filter((entry) => entry.queueState === "retry_scheduled").length,
            deadLetteredCount: payload.filter((entry) => entry.queueState === "dead_lettered").length,
          },
          error: null,
        };
      }

      if (fn === "enqueue_worksheet_memory_semantic_pool_queue") {
        state.semanticQueueCalls.push(args);
        return {
          data: {
            count: state.semanticQueueInsertCount,
            ids: ["semantic-queue-1"],
          },
          error: null,
        };
      }

      throw new Error(`Unexpected rpc ${fn}`);
    }),
    from(table: string) {
      if (table === "worksheet_memory_evidence_pools") {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: unknown) => {
            if (column === "organization_id") {
              builder._organizationId = value;
              return Promise.resolve({
                data: state.pools
                  .filter((row) => row.organization_id === value)
                  .map((row) => ({
                    id: row.id,
                    organization_id: row.organization_id,
                    pool_signature: row.pool_signature,
                  })),
                error: null,
              });
            }
            return builder;
          }),
          upsert(payload: Array<Record<string, unknown>>, options?: { onConflict?: string }) {
            for (const row of payload) {
              const existing = state.pools.find(
                (entry) =>
                  entry.organization_id === row.organization_id
                  && entry.pool_signature === row.pool_signature,
              );
              if (existing) {
                Object.assign(existing, row);
                continue;
              }

              state.pools.push({
                id: `pool-${state.pools.length + 1}`,
                ...row,
              });
            }

            return {
              select() {
                expect(options?.onConflict).toBe("organization_id,pool_signature");
                return Promise.resolve({
                  data: state.pools.map((row) => ({
                    id: row.id,
                    organization_id: row.organization_id,
                    pool_signature: row.pool_signature,
                  })),
                  error: null,
                });
              },
            };
          },
          delete: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => ({
              in: vi.fn((inColumn: string, values: string[]) => {
                expect(column).toBe("organization_id");
                expect(inColumn).toBe("id");
                state.pools = state.pools.filter((row) =>
                  !(row.organization_id === value && values.includes(String(row.id))));
                state.links = state.links.filter((row) => !values.includes(String(row.pool_id)));
                return Promise.resolve({ error: null });
              }),
            })),
          })),
          _organizationId: null as unknown,
        };
        return builder;
      }

      if (table === "worksheet_memory_evidence_pool_events") {
        return {
          upsert(payload: Array<Record<string, unknown>>, options?: { onConflict?: string }) {
            for (const row of payload) {
              const existing = state.links.find(
                (entry) => entry.pool_id === row.pool_id && entry.source_event_id === row.source_event_id,
              );
              if (existing) {
                Object.assign(existing, row);
                continue;
              }

              state.links.push({
                id: `link-${state.links.length + 1}`,
                ...row,
              });
            }

            return {
              select() {
                expect(options?.onConflict).toBe("pool_id,source_event_id");
                return Promise.resolve({
                  data: state.links.map((row) => ({ id: row.id })),
                  error: null,
                });
              },
            };
          },
          delete: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => ({
              in: vi.fn((inColumn: string, values: string[]) => {
                expect(column).toBe("organization_id");
                expect(inColumn).toBe("pool_id");
                state.links = state.links.filter((row) =>
                  !(row.organization_id === value && values.includes(String(row.pool_id))));
                return Promise.resolve({ error: null });
              }),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("worksheet memory evidence pools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requirePlatformAdmin.mockResolvedValue(undefined);
  });

  it("builds one pool for repeated Grid Spacing 1200 -> 600 events across two projects", async () => {
    const { runWorksheetMemoryEvidencePoolBuild } = await import("./worksheet-memory-evidence-pools");
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildGridSpacingEvent({
        eventId: "event-a",
        classificationRecordId: "classification-a",
        projectId: "project-a",
        metadata: {
          workbookId: "workbook-a",
          sheetId: "sheet-a",
          sheetName: "Suspended Ceilings",
          worksheetName: "Suspended Ceilings",
          tradePackage: "Suspended Ceilings",
        },
      }),
      buildGridSpacingEvent({
        eventId: "event-b",
        classificationRecordId: "classification-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        metadata: {
          workbookId: "workbook-b",
          sheetId: "sheet-b",
          sheetName: "Suspended Ceilings",
          worksheetName: "Suspended Ceilings",
          tradePackage: "Suspended Ceilings",
        },
      }),
    ]);

    const state = createState();
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const result = await runWorksheetMemoryEvidencePoolBuild({
      organizationId: "org-1",
      limit: 50,
    });

    expect(requirePlatformAdmin).toHaveBeenCalledWith("admin");
    expect(listClassifiedWorksheetMemoryEvents).toHaveBeenCalledWith({
      organizationId: "org-1",
      limit: 50,
    });
    expect(result.poolCount).toBe(1);
    expect(result.persistedPoolCount).toBe(1);
    expect(result.persistedLinkCount).toBe(2);
    expect(result.maturityDistribution.ready_for_synthesis).toBe(1);
    expect(result.pools[0]).toMatchObject({
      evidenceCount: 2,
      worksheetCount: 2,
      workbookCount: 2,
      projectCount: 2,
      supportCount: 2,
      contradictionCount: 0,
      ignoredCount: 0,
      maturityStatus: "ready_for_synthesis",
    });
    expect(result.pools[0]?.linkedEvents).toHaveLength(2);
    expect(state.pools).toHaveLength(1);
    expect(state.links).toHaveLength(2);
  });

  it("converges equivalent worksheet_rate_changed events into one deterministic Stage 6 pool", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildGridSpacingEvent({
        eventId: "rate-a",
        classificationRecordId: "classification-rate-a",
        eventType: "worksheet_rate_changed",
        metadata: {
          workbookId: "workbook-rate-a",
          sheetId: "sheet-rate-a",
          sheetName: "Pricing Audit",
          worksheetName: "Pricing Audit",
          tradePackage: "Suspended Ceilings",
        },
        diffData: {
          itemLabel: "Suspended Ceiling Installer",
          rowLabel: "Pricing",
          columnHeader: "Labour Rate",
          unit: null,
          oldValue: 42,
          newValue: 48,
          oldFormula: null,
          newFormula: null,
        },
        semanticFields: {
          costRole: { value: "labour", confidence: 0.9 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "audit_worksheet", confidence: 0.82 },
          sectionType: { value: "pricing", confidence: 0.78 },
          itemCategory: { value: "labour_suspended_ceilings", confidence: 0.73 },
          measurementBasis: { value: "time", confidence: 0.7 },
          normalizedUnit: { value: "rate_per_unit", confidence: 0.76 },
          normalizedTradePackage: { value: "Suspended Ceilings", confidence: 0.85 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
        interpretationPayload: {
          interpretedChange: {
            plainEnglishSummary: "Updated the suspended ceilings labour rate.",
            whatChanged: "Labour rate changed from 42 to 48.",
            constructionContext: {
              tradeOrScope: "Suspended Ceilings",
              pageType: "audit_worksheet",
              itemCategory: "labour_suspended_ceilings",
            },
            pricingContext: {
              costRole: "labour",
            },
          },
        },
      }),
      buildGridSpacingEvent({
        eventId: "rate-b",
        classificationRecordId: "classification-rate-b",
        projectId: "project-2",
        opportunityId: "opportunity-2",
        occurredAt: "2026-06-06T00:05:00.000Z",
        eventType: "worksheet_rate_changed",
        metadata: {
          workbookId: "workbook-rate-b",
          sheetId: "sheet-rate-b",
          sheetName: "Estimate Audit",
          worksheetName: "Estimate Audit",
          tradePackage: "Suspended Ceilings",
        },
        diffData: {
          itemLabel: "Suspended Ceiling Installer",
          rowLabel: "Estimate Audit",
          columnHeader: "Labour Rate",
          unit: null,
          oldValue: 42,
          newValue: 48,
          oldFormula: null,
          newFormula: null,
        },
        semanticFields: {
          costRole: { value: "labour", confidence: 0.88 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "estimate_audit", confidence: 0.79 },
          sectionType: { value: null, confidence: null },
          itemCategory: { value: "suspended_ceilings", confidence: 0.7 },
          measurementBasis: { value: "time", confidence: 0.7 },
          normalizedUnit: { value: null, confidence: null },
          normalizedTradePackage: { value: "Suspended Ceilings", confidence: 0.84 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
        interpretationPayload: {
          interpretedChange: {
            plainEnglishSummary: "Adjusted the labour rate for suspended ceilings.",
            whatChanged: "Labour rate changed from 42 to 48.",
            constructionContext: {
              tradeOrScope: "Suspended Ceilings",
              pageType: "estimate_audit",
              itemCategory: "suspended_ceilings",
            },
            pricingContext: {
              costRole: "labour",
            },
          },
        },
      }),
    ]);

    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      poolKind: "rate_transition",
      eventType: "worksheet_rate_changed",
      evidenceCount: 2,
      worksheetCount: 2,
      projectCount: 2,
      maturityStatus: "ready_for_synthesis",
      scopeContext: {
        pageType: "pricing_worksheet",
        sectionType: "pricing_inputs",
        itemCategory: "labour_rate",
        normalizedUnit: "rate_per_unit",
      },
    });
  });

  it("converges equivalent waste-factor assumption transitions despite wording drift", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildPerimeterWasteFactorEvent({
        eventId: "waste-a",
        classificationRecordId: "classification-waste-a",
        projectId: "project-a",
        metadata: {
          workbookId: "workbook-waste-a",
          sheetId: "sheet-waste-a",
          sheetName: "Suspended Ceilings",
          worksheetName: "Suspended Ceilings",
          tradePackage: "Suspended Ceilings",
        },
      }),
      buildPerimeterWasteFactorEvent({
        eventId: "waste-b",
        classificationRecordId: "classification-waste-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        metadata: {
          workbookId: "workbook-waste-b",
          sheetId: "sheet-waste-b",
          sheetName: "Suspended Ceilings",
          worksheetName: "Suspended Ceilings",
          tradePackage: "Suspended Ceilings",
        },
        diffData: {
          itemLabel: "Waste allowance for cutting and perimeter",
          rowLabel: "Perimeter Waste Factor",
          columnHeader: "Quantity",
          unit: "percentage",
          oldValue: 10,
          newValue: 12,
          oldFormula: null,
          newFormula: null,
        },
        semanticFields: {
          costRole: { value: "material_waste_contingency", confidence: 0.86 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "suspended_ceiling_estimate", confidence: 0.8 },
          sectionType: { value: null, confidence: null },
          itemCategory: { value: "waste_allowance", confidence: 0.79 },
          measurementBasis: { value: null, confidence: null },
          normalizedUnit: { value: "percentage", confidence: 0.86 },
          normalizedTradePackage: { value: "Suspended Ceilings", confidence: 0.88 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
        interpretationPayload: {
          interpretedChange: {
            plainEnglishSummary: "An estimator manually increased the waste allowance for cutting and perimeter work on suspended ceilings from 10% to 12%, likely to account for more scrap or complexity in perimeter finishing.",
            whatChanged: "Waste allowance for cutting and perimeter changed from 10% to 12%.",
            constructionContext: {
              tradeOrScope: "Suspended Ceilings",
              pageType: "suspended_ceiling_estimate",
              itemCategory: "waste_allowance",
            },
            pricingContext: {
              costRole: "material_waste_contingency",
            },
          },
        },
      }),
    ]);

    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      poolKind: "assumption_transition",
      eventType: "worksheet_assumption_changed",
      evidenceCount: 2,
      worksheetCount: 2,
      projectCount: 2,
      maturityStatus: "ready_for_synthesis",
      scopeContext: {
        pageType: "worksheet_inputs",
        sectionType: "worksheet_inputs",
        itemCategory: "waste_factor",
        costRole: "material_waste_contingency",
        itemLabel: "Perimeter Waste Factor",
        normalizedUnit: "%",
      },
    });
  });

  it("prefers strong worksheet structural identity over classifier label drift", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildStructuralIdentityEvent({
        eventId: "structural-a",
        classificationRecordId: "structural-classification-a",
        projectId: "project-a",
        metadata: {
          workbookId: "workbook-structural-a",
          sheetId: "sheet-structural-a",
          sheetName: "Template Alpha",
          worksheetName: "Template Alpha",
          tradePackage: "Package Alpha",
        },
      }),
      buildStructuralIdentityEvent({
        eventId: "structural-b",
        classificationRecordId: "structural-classification-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        metadata: {
          workbookId: "workbook-structural-b",
          sheetId: "sheet-structural-b",
          sheetName: "Template Alpha",
          worksheetName: "Template Alpha",
          tradePackage: "Package Alpha",
        },
        semanticFields: {
          costRole: { value: "beta_role", confidence: 0.75 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "beta_page", confidence: 0.75 },
          sectionType: { value: "beta_section", confidence: 0.75 },
          itemCategory: { value: "beta_item", confidence: 0.75 },
          measurementBasis: { value: null, confidence: null },
          normalizedUnit: { value: "days/m2", confidence: 0.8 },
          normalizedTradePackage: { value: "Package Alpha", confidence: 0.8 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
        interpretationPayload: {
          interpretedChange: {
            plainEnglishSummary: "Updated an editable driver value.",
            whatChanged: "Driver value changed from 1.25 to 1.5.",
            constructionContext: {
              tradeOrScope: "Package Alpha",
              pageType: "beta_page",
              itemCategory: "beta_item",
            },
            pricingContext: {
              costRole: "beta_role",
            },
          },
        },
      }),
    ]);

    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      evidenceCount: 2,
      worksheetCount: 2,
      projectCount: 2,
      maturityStatus: "ready_for_synthesis",
      scopeContext: {
        structuralIdentityStrong: true,
      },
    });
  });

  it("pools strong structural behaviours together despite worksheet naming noise", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildStrongRateIdentityEvent({
        eventId: "rate-noise-a",
        classificationRecordId: "classification-rate-noise-a",
        projectId: "project-a",
        metadata: {
          workbookId: "workbook-rate-noise-a",
          sheetId: "sheet-rate-noise-a",
          sheetName: "Suspended Ceilings",
          worksheetName: "Suspended Ceilings",
          tradePackage: "Suspended Ceilings",
        },
      }),
      buildStrongRateIdentityEvent({
        eventId: "rate-noise-b",
        classificationRecordId: "classification-rate-noise-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        metadata: {
          workbookId: "workbook-rate-noise-b",
          sheetId: "sheet-rate-noise-b",
          sheetName: "Suspended Ceilings Copy 2026-06-06 10:45",
          worksheetName: "Suspended Ceilings Copy 2026-06-06 10:45",
          tradePackage: "Suspended Ceilings - Auckland",
        },
        semanticFields: {
          costRole: { value: "supply", confidence: 0.81 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "suspended ceiling estimate", confidence: 0.74 },
          sectionType: { value: "ceiling_framing_inputs", confidence: 0.74 },
          itemCategory: { value: "suspended_ceiling_structural", confidence: 0.74 },
          measurementBasis: { value: null, confidence: null },
          normalizedUnit: { value: "$/lm", confidence: 0.84 },
          normalizedTradePackage: { value: "Suspended Ceilings", confidence: 0.84 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
      }),
      buildStrongRateIdentityEvent({
        eventId: "rate-noise-c",
        classificationRecordId: "classification-rate-noise-c",
        projectId: "project-c",
        opportunityId: "opportunity-c",
        occurredAt: "2026-06-06T00:10:00.000Z",
        metadata: {
          workbookId: "workbook-rate-noise-c",
          sheetId: "sheet-rate-noise-c",
          sheetName: "Suspnded Ceilings v2",
          worksheetName: "Suspnded Ceilings v2",
          tradePackage: "Suspnded Ceilings",
        },
        semanticFields: {
          costRole: { value: "material", confidence: 0.82 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "worksheet_input_rate", confidence: 0.72 },
          sectionType: { value: "pricing_inputs", confidence: 0.72 },
          itemCategory: { value: "structural_component_rate", confidence: 0.72 },
          measurementBasis: { value: null, confidence: null },
          normalizedUnit: { value: "$/lm", confidence: 0.84 },
          normalizedTradePackage: { value: "Suspended Ceilings", confidence: 0.84 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
      }),
    ]);

    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      evidenceCount: 3,
      worksheetCount: 3,
      projectCount: 3,
      maturityStatus: "ready_for_synthesis",
      classificationRecordIds: [
        "classification-rate-noise-a",
        "classification-rate-noise-b",
        "classification-rate-noise-c",
      ],
    });
    expect(pools[0]?.scopeContext).toMatchObject({
      structuralIdentityStrong: true,
      classifierPageType: "cost_template",
      classifierItemCategory: "structural_component_rate",
      structuralSignaturePayload: {
        worksheetDomain: "suspended ceilings",
        workbookDomain: "suspended ceilings",
      },
      structuralHashSignaturePayload: {
        sectionPath: ["ceiling framing", "main tee"],
        rowLabel: "main tee rate",
        itemLabel: "main tee rate",
        columnKey: "f",
        normalizedUnit: "$/lm",
      },
    });
  });

  it("keeps weak structural identity conservative when worksheet context differs", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildGridSpacingEvent({
        eventId: "weak-context-a",
        classificationRecordId: "weak-context-classification-a",
        metadata: {
          workbookId: "workbook-weak-a",
          sheetId: "sheet-weak-a",
          sheetName: "Suspended Ceilings",
          worksheetName: "Suspended Ceilings",
          tradePackage: "Suspended Ceilings",
        },
      }),
      buildGridSpacingEvent({
        eventId: "weak-context-b",
        classificationRecordId: "weak-context-classification-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        metadata: {
          workbookId: "workbook-weak-b",
          sheetId: "sheet-weak-b",
          sheetName: "Partition Layout",
          worksheetName: "Partition Layout Audit",
          tradePackage: "Interior Partitions",
        },
        semanticFields: {
          costRole: { value: "input_assumption", confidence: 0.85 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "estimate_inputs", confidence: 0.85 },
          sectionType: { value: null, confidence: null },
          itemCategory: { value: "partition_parameter", confidence: 0.85 },
          measurementBasis: { value: null, confidence: null },
          normalizedUnit: { value: "mm", confidence: 0.85 },
          normalizedTradePackage: { value: "Interior Partitions", confidence: 0.85 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
      }),
    ]);

    expect(pools).toHaveLength(2);
    expect(new Set(pools.map((pool) => pool.scopeContext.normalizedTradePackage))).toEqual(
      new Set(["Suspended Ceilings", "Interior Partitions"]),
    );
  });

  it("does not merge structurally different rows even when classifier labels match", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildStructuralIdentityEvent({
        eventId: "structural-different-a",
        classificationRecordId: "structural-different-classification-a",
      }),
      buildStructuralIdentityEvent({
        eventId: "structural-different-b",
        classificationRecordId: "structural-different-classification-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        diffData: {
          sectionLabel: "Inputs",
          subsectionLabel: "Crew Drivers",
          sectionPath: ["Inputs", "Crew Drivers"],
          itemLabel: "Alternate Driver",
          rowLabel: "Crew Drivers",
          columnHeader: "Quantity",
          columnRole: "quantity",
          columnId: "E",
          column: "E",
          unit: "days/m2",
          oldValue: 1.25,
          newValue: 1.5,
          oldFormula: null,
          newFormula: null,
          generatedByAi: false,
          pricingTuple: {
            quantity: {
              value: 1.5,
            },
            unit: {
              value: "days/m2",
            },
          },
          rowSnapshotAfter: {
            unit: "days/m2",
            visibleCells: [
              { columnRole: "description", value: "Alternate structural driver", displayValue: "Alternate structural driver" },
              { columnRole: "unit", value: "days/m2", displayValue: "days/m2" },
              { columnRole: "quantity", value: 1.5, displayValue: "1.5" },
            ],
          },
          rowSnapshotVisibleCells: [
            { columnRole: "description", value: "Alternate structural driver", displayValue: "Alternate structural driver" },
            { columnRole: "unit", value: "days/m2", displayValue: "days/m2" },
            { columnRole: "quantity", value: 1.5, displayValue: "1.5" },
          ],
          relatedRows: [
            {
              rowLabel: "Crew Drivers",
              itemLabel: "Derived Hours",
              unit: "hrs",
              visibleCells: [
                { columnRole: "amount", value: "=IFERROR(G10*H10,\"\")", displayValue: "0" },
                { columnRole: "notes", value: "driver times rate", displayValue: "driver times rate" },
              ],
            },
          ],
        },
      }),
    ]);

    expect(pools).toHaveLength(2);
  });

  it("does not merge when structural identity matches but unit differs", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildStructuralIdentityEvent({
        eventId: "structural-unit-a",
        classificationRecordId: "structural-unit-classification-a",
      }),
      buildStructuralIdentityEvent({
        eventId: "structural-unit-b",
        classificationRecordId: "structural-unit-classification-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        diffData: {
          sectionLabel: "Inputs",
          subsectionLabel: "Crew Drivers",
          sectionPath: ["Inputs", "Crew Drivers"],
          itemLabel: "Driver Value",
          rowLabel: "Crew Drivers",
          columnHeader: "Quantity",
          columnRole: "quantity",
          columnId: "E",
          column: "E",
          unit: "days",
          oldValue: 1.25,
          newValue: 1.5,
          oldFormula: null,
          newFormula: null,
          generatedByAi: false,
          pricingTuple: {
            quantity: {
              value: 1.5,
            },
            unit: {
              value: "days",
            },
          },
          rowSnapshotAfter: {
            unit: "days",
            visibleCells: [
              { columnRole: "description", value: "Editable crew-day driver", displayValue: "Editable crew-day driver" },
              { columnRole: "unit", value: "days", displayValue: "days" },
              { columnRole: "quantity", value: 1.5, displayValue: "1.5" },
            ],
          },
          rowSnapshotVisibleCells: [
            { columnRole: "description", value: "Editable crew-day driver", displayValue: "Editable crew-day driver" },
            { columnRole: "unit", value: "days", displayValue: "days" },
            { columnRole: "quantity", value: 1.5, displayValue: "1.5" },
          ],
          relatedRows: [
            {
              rowLabel: "Crew Drivers",
              itemLabel: "Derived Hours",
              unit: "hrs",
              visibleCells: [
                { columnRole: "amount", value: "=IFERROR(G10*H10,\"\")", displayValue: "0" },
                { columnRole: "notes", value: "driver times rate", displayValue: "driver times rate" },
              ],
            },
          ],
        },
        semanticFields: {
          costRole: { value: "beta_role", confidence: 0.75 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "beta_page", confidence: 0.75 },
          sectionType: { value: "beta_section", confidence: 0.75 },
          itemCategory: { value: "beta_item", confidence: 0.75 },
          measurementBasis: { value: null, confidence: null },
          normalizedUnit: { value: "days", confidence: 0.8 },
          normalizedTradePackage: { value: "Package Alpha", confidence: 0.8 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
      }),
    ]);

    expect(pools).toHaveLength(2);
  });

  it("does not merge when the structural role differs between rate-like and quantity-like edits", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildStructuralIdentityEvent({
        eventId: "structural-role-a",
        classificationRecordId: "structural-role-classification-a",
      }),
      buildStructuralIdentityEvent({
        eventId: "structural-role-b",
        classificationRecordId: "structural-role-classification-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        eventType: "worksheet_rate_changed",
        diffData: {
          sectionLabel: "Inputs",
          subsectionLabel: "Crew Drivers",
          sectionPath: ["Inputs", "Crew Drivers"],
          itemLabel: "Driver Value",
          rowLabel: "Crew Drivers",
          columnHeader: "Rate",
          columnRole: "rate",
          columnId: "F",
          column: "F",
          unit: "$/day",
          oldValue: 1.25,
          newValue: 1.5,
          oldFormula: null,
          newFormula: null,
          generatedByAi: false,
          pricingTuple: {
            rate: {
              value: 1.5,
            },
            unit: {
              value: "$/day",
            },
          },
          rowSnapshotAfter: {
            unit: "$/day",
            visibleCells: [
              { columnRole: "description", value: "Editable crew-day driver", displayValue: "Editable crew-day driver" },
              { columnRole: "unit", value: "$/day", displayValue: "$/day" },
              { columnRole: "rate", value: 1.5, displayValue: "1.5" },
            ],
          },
          rowSnapshotVisibleCells: [
            { columnRole: "description", value: "Editable crew-day driver", displayValue: "Editable crew-day driver" },
            { columnRole: "unit", value: "$/day", displayValue: "$/day" },
            { columnRole: "rate", value: 1.5, displayValue: "1.5" },
          ],
          relatedRows: [
            {
              rowLabel: "Crew Drivers",
              itemLabel: "Derived Hours",
              unit: "hrs",
              visibleCells: [
                { columnRole: "amount", value: "=IFERROR(G10*H10,\"\")", displayValue: "0" },
                { columnRole: "notes", value: "driver times rate", displayValue: "driver times rate" },
              ],
            },
          ],
        },
        semanticFields: {
          costRole: { value: "beta_role", confidence: 0.75 },
          cellRole: { value: null, confidence: null },
          pageType: { value: "beta_page", confidence: 0.75 },
          sectionType: { value: "beta_section", confidence: 0.75 },
          itemCategory: { value: "beta_item", confidence: 0.75 },
          measurementBasis: { value: null, confidence: null },
          normalizedUnit: { value: "$/day", confidence: 0.8 },
          normalizedTradePackage: { value: "Package Alpha", confidence: 0.8 },
          workCategory: { value: null, confidence: null },
          systemCategory: { value: null, confidence: null },
          assemblyCategory: { value: null, confidence: null },
        },
      }),
    ]);

    expect(pools).toHaveLength(2);
  });

  it("does not merge when the downstream dependency shape differs materially", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildStrongRateIdentityEvent({
        eventId: "rate-shape-a",
        classificationRecordId: "classification-rate-shape-a",
      }),
      buildStrongRateIdentityEvent({
        eventId: "rate-shape-b",
        classificationRecordId: "classification-rate-shape-b",
        projectId: "project-b",
        opportunityId: "opportunity-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
        diffData: {
          sectionLabel: "Ceiling Framing",
          subsectionLabel: "Main Tee",
          sectionPath: ["Ceiling Framing", "Main Tee"],
          itemLabel: "Main Tee Rate",
          rowLabel: "Main Tee Rate",
          columnHeader: "Rate",
          columnRole: "rate",
          columnId: "F",
          column: "F",
          unit: "$/lm",
          oldValue: 4.55,
          newValue: 4.56,
          oldFormula: null,
          newFormula: null,
          generatedByAi: false,
          pricingTuple: {
            rate: {
              value: 4.56,
            },
            unit: {
              value: "$/lm",
            },
          },
          rowSnapshotAfter: {
            unit: "$/lm",
            visibleCells: [
              { columnRole: "description", value: "Main Tee framing supply", displayValue: "Main Tee framing supply" },
              { columnRole: "unit", value: "$/lm", displayValue: "$/lm" },
              { columnRole: "rate", value: 4.56, displayValue: "4.56" },
            ],
          },
          rowSnapshotVisibleCells: [
            { columnRole: "description", value: "Main Tee framing supply", displayValue: "Main Tee framing supply" },
            { columnRole: "unit", value: "$/lm", displayValue: "$/lm" },
            { columnRole: "rate", value: 4.56, displayValue: "4.56" },
          ],
          relatedRows: [
            {
              rowLabel: "Main Tee Quantity",
              itemLabel: "Allowance Quantity",
              unit: "lm",
              visibleCells: [
                { columnRole: "quantity", value: 0, displayValue: "0" },
                { columnRole: "notes", value: "different dependency path", displayValue: "different dependency path" },
              ],
            },
          ],
        },
      }),
    ]);

    expect(pools).toHaveLength(2);
  });

  it("keeps pools isolated by organization", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildGridSpacingEvent({ eventId: "org-1-a", organizationId: "org-1" }),
      buildGridSpacingEvent({ eventId: "org-2-a", organizationId: "org-2" }),
    ]);

    expect(pools).toHaveLength(2);
    expect(new Set(pools.map((pool) => pool.organizationId))).toEqual(new Set(["org-1", "org-2"]));
  });

  it("does not duplicate pool-event links when rerun", async () => {
    const { runWorksheetMemoryEvidencePoolBuild } = await import("./worksheet-memory-evidence-pools");
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildGridSpacingEvent({
        eventId: "event-a",
        classificationRecordId: "classification-a",
        projectId: "project-a",
      }),
      buildGridSpacingEvent({
        eventId: "event-b",
        classificationRecordId: "classification-b",
        projectId: "project-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
      }),
    ]);

    const state = createState();
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    await runWorksheetMemoryEvidencePoolBuild({ organizationId: "org-1", limit: 50 });
    await runWorksheetMemoryEvidencePoolBuild({ organizationId: "org-1", limit: 50 });

    expect(state.pools).toHaveLength(1);
    expect(state.links).toHaveLength(2);
  });

  it("reconciles stale pool memberships on rerun", async () => {
    const { runWorksheetMemoryEvidencePoolWorker } = await import("./worksheet-memory-evidence-pools");
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildGridSpacingEvent({
        eventId: "event-a",
        classificationRecordId: "classification-a",
      }),
    ]);

    const state = createState();
    state.pools.push({
      id: "pool-1",
      organization_id: "org-1",
      pool_signature: "existing-signature",
    });
    state.links.push(
      {
        id: "link-1",
        pool_id: "pool-1",
        organization_id: "org-1",
        source_event_id: "event-a",
      },
      {
        id: "link-2",
        pool_id: "pool-1",
        organization_id: "org-1",
        source_event_id: "stale-event",
      },
    );
    state.claimRows = [
      {
        id: "queue-1",
        organizationId: "org-1",
        sourceEventId: "event-a",
        classificationRecordId: "classification-a",
        classificationVersion: 1,
        classificationAttemptNumber: 1,
        queueState: "claimed",
        attemptCount: 1,
        maxAttempts: 5,
        priority: 200,
        claimToken: "claim-1",
      },
    ];

    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    await runWorksheetMemoryEvidencePoolWorker({ organizationId: "org-1", limit: 10, eventLimit: 50 });

    expect(state.links).toHaveLength(1);
    expect(state.links[0]?.source_event_id).toBe("event-a");
  });

  it("marks a single event pool as emerging", async () => {
    const { buildWorksheetMemoryEvidencePools } = await import("./worksheet-memory-evidence-pools");
    const pools = buildWorksheetMemoryEvidencePools([
      buildGridSpacingEvent({ eventId: "single-event" }),
    ]);

    expect(pools[0]?.maturityStatus).toBe("emerging");
  });

  it("runs the Stage 6 worker, rebuilds once per organization, and enqueues Stage 7 jobs", async () => {
    const { runWorksheetMemoryEvidencePoolWorker } = await import("./worksheet-memory-evidence-pools");
    listClassifiedWorksheetMemoryEvents.mockResolvedValue([
      buildGridSpacingEvent({
        eventId: "event-a",
        classificationRecordId: "classification-a",
        projectId: "project-a",
      }),
      buildGridSpacingEvent({
        eventId: "event-b",
        classificationRecordId: "classification-b",
        projectId: "project-b",
        occurredAt: "2026-06-06T00:05:00.000Z",
      }),
    ]);

    const state = createState();
    state.claimRows = [
      {
        id: "queue-1",
        organizationId: "org-1",
        sourceEventId: "event-a",
        classificationRecordId: "classification-a",
        classificationVersion: 1,
        classificationAttemptNumber: 1,
        queueState: "claimed",
        attemptCount: 1,
        maxAttempts: 5,
        priority: 200,
        claimToken: "claim-1",
      },
      {
        id: "queue-2",
        organizationId: "org-1",
        sourceEventId: "event-b",
        classificationRecordId: "classification-b",
        classificationVersion: 1,
        classificationAttemptNumber: 1,
        queueState: "claimed",
        attemptCount: 1,
        maxAttempts: 5,
        priority: 200,
        claimToken: "claim-2",
      },
    ];
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const result = await runWorksheetMemoryEvidencePoolWorker({ organizationId: "org-1", limit: 10, eventLimit: 50 });

    expect(result.claimedJobCount).toBe(2);
    expect(result.completedJobCount).toBe(2);
    expect(result.rebuiltOrganizationCount).toBe(1);
    expect(result.persistedPoolCount).toBe(1);
    expect(result.persistedLinkCount).toBe(2);
    expect(result.semanticQueueInsertCount).toBe(1);
    expect(state.pools).toHaveLength(1);
    expect(state.links).toHaveLength(2);
    expect(state.semanticQueueCalls).toEqual([
      {
        p_limit: 1,
        p_organization_id: "org-1",
      },
    ]);
    expect(state.finalizedClaims).toEqual([
      {
        id: "queue-1",
        claimToken: "claim-1",
        queueState: "completed",
      },
      {
        id: "queue-2",
        claimToken: "claim-2",
        queueState: "completed",
      },
    ]);
  });

  it("retries or dead-letters failed Stage 6 jobs without duplicating work", async () => {
    const { runWorksheetMemoryEvidencePoolWorker } = await import("./worksheet-memory-evidence-pools");
    listClassifiedWorksheetMemoryEvents.mockRejectedValue(new Error("classification read failed"));

    const state = createState();
    state.claimRows = [
      {
        id: "queue-retry",
        organizationId: "org-1",
        sourceEventId: "event-a",
        classificationRecordId: "classification-a",
        classificationVersion: 1,
        classificationAttemptNumber: 1,
        queueState: "claimed",
        attemptCount: 1,
        maxAttempts: 5,
        priority: 200,
        claimToken: "claim-retry",
      },
      {
        id: "queue-dead",
        organizationId: "org-2",
        sourceEventId: "event-b",
        classificationRecordId: "classification-b",
        classificationVersion: 1,
        classificationAttemptNumber: 1,
        queueState: "claimed",
        attemptCount: 5,
        maxAttempts: 5,
        priority: 200,
        claimToken: "claim-dead",
      },
    ];
    createAdminSupabaseClient.mockReturnValue(buildAdminClient(state));

    const result = await runWorksheetMemoryEvidencePoolWorker({ limit: 10, eventLimit: 50 });

    expect(result.claimedJobCount).toBe(2);
    expect(result.completedJobCount).toBe(0);
    expect(result.retriedJobCount).toBe(1);
    expect(result.deadLetteredJobCount).toBe(1);
    expect(state.semanticQueueCalls).toHaveLength(0);
    expect(state.finalizedClaims[0]).toMatchObject({
      id: "queue-retry",
      claimToken: "claim-retry",
      queueState: "retry_scheduled",
      errorCode: "stage6_build_failed",
    });
    expect(typeof state.finalizedClaims[0]?.retryAfter).toBe("string");
    expect(state.finalizedClaims[1]).toMatchObject({
      id: "queue-dead",
      claimToken: "claim-dead",
      queueState: "dead_lettered",
      errorCode: "stage6_build_failed",
      retryAfter: null,
    });
  });
});
