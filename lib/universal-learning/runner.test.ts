import { beforeEach, describe, expect, it, vi } from "vitest";

const buildUniversalLearningContainerRecords = vi.fn();
const loadUniversalLearningConstructionProfile = vi.fn();
const getUniversalLearningCursor = vi.fn();
const advanceUniversalLearningCursor = vi.fn();
const buildUniversalLearningMemoryPack = vi.fn();
const createUniversalLearningReviewRun = vi.fn();
const updateUniversalLearningReviewRunStatus = vi.fn();
const writeUniversalLearningRunRecords = vi.fn();
const getUniversalLearningBoundaryContext = vi.fn();

vi.mock("@/lib/universal-learning/builders", () => ({
  buildUniversalLearningContainerRecords,
}));
vi.mock("@/lib/universal-learning/construction-profile", () => ({
  loadUniversalLearningConstructionProfile,
}));
vi.mock("@/lib/universal-learning/delta-cursors", () => ({
  getUniversalLearningCursor,
  advanceUniversalLearningCursor,
}));
vi.mock("@/lib/universal-learning/memory-pack", () => ({
  buildUniversalLearningMemoryPack,
}));
vi.mock("@/lib/universal-learning/review-runs", () => ({
  createUniversalLearningReviewRun,
  updateUniversalLearningReviewRunStatus,
}));
vi.mock("@/lib/universal-learning/review-run-records", () => ({
  writeUniversalLearningRunRecords,
}));
vi.mock("@/lib/universal-learning/boundary-guards", () => ({
  getUniversalLearningBoundaryContext,
}));

describe("Universal learning runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not advance the cursor when memory application fails", async () => {
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [
        {
          containerType: "supplier_invoice_allocation",
          source: {
            table: "supplier_invoice_line_allocations",
            sourceId: "12d4776a-eedd-46ba-aa27-263a841b6ab9",
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
        },
      ],
      nextCursorCandidate: {
        updatedAt: "2026-06-01T00:00:00.000Z",
        id: "12d4776a-eedd-46ba-aa27-263a841b6ab9",
      },
      reviewScopeContext: {
        module: "supplier_invoices",
        workflow: "monthly_supplier_invoice_allocation_review",
        recordCount: 1,
        projectCount: 0,
        supplierCount: 0,
        clientCount: 0,
        statusMix: {},
        projects: [],
        suppliers: [],
        clients: [],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Profile",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [],
      forbiddenOperationalChanges: [],
      lockedRoutingCodes: {},
    });
    createUniversalLearningReviewRun.mockResolvedValue({
      id: "run-1",
    });
    updateUniversalLearningReviewRunStatus.mockResolvedValue(undefined);
    writeUniversalLearningRunRecords.mockResolvedValue(undefined);

    const { runUniversalConstructionLearningReview } = await import("./runner");

    await expect(runUniversalConstructionLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "supplier_invoice_allocation",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-1",
      },
      modelInvoker: async () => ({
        provider: "anthropic",
        model: "test-model",
        rawText: "{}",
        parsedJson: {
          reviewSummary: {
            overallAssessment: "Assessment",
            dominantThemes: ["theme"],
            confidenceNotes: "Confident enough to validate.",
          },
          learnings: {
            observations: [
              {
                learningId: "learning-1",
                title: "Title",
                statement: "Statement",
                whyItMatters: "Why",
                confidence: { score: 0.8, label: "high", reasoning: "reason" },
                evidence: {
                  recordCount: 1,
                  supportingRecords: [{ sourceId: "deadbeef", reason: "support" }],
                },
                relationshipToExistingMemory: { status: "new", memoryId: null, explanation: "new" },
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
        },
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
      }),
      applyMemoryActions: async () => {
        throw Object.assign(new Error("bad source id"), { code: "provenance_source_id_invalid" });
      },
    })).rejects.toThrow("bad source id");

    expect(advanceUniversalLearningCursor).not.toHaveBeenCalled();
  });

  it("normalizes compact v2 responses before applying memory actions and advancing the cursor", async () => {
    const sourceId = "f27f539f-b4ce-4f34-a74a-e74298f22762";
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [
        {
          containerType: "project_purchase_order",
          source: {
            table: "project_purchase_orders",
            sourceId,
            sourceVersion: 1,
          },
          organizationId: "org-1",
          projectId: "project-1",
          opportunityId: null,
          supplierId: "supplier-1",
          clientId: "client-1",
          actorUserId: null,
          updatedAt: "2026-06-01T00:00:00.000Z",
          status: { status: "Draft" },
          payload: {
            sourceEvidence: {
              title: "Timber PO",
              supplier: { supplierName: "Bunnings" },
            },
          },
          linkedContext: {},
          routingContext: { readOnly: true },
          signalStrength: "normal",
        },
      ],
      nextCursorCandidate: {
        updatedAt: "2026-06-01T00:00:00.000Z",
        id: sourceId,
      },
      reviewScopeContext: {
        module: "purchase_orders",
        workflow: "monthly_purchase_order_review",
        recordCount: 1,
        projectCount: 1,
        supplierCount: 1,
        clientCount: 1,
        statusMix: {},
        projects: [],
        suppliers: [],
        clients: [],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [],
      forbiddenOperationalChanges: [],
      lockedRoutingCodes: {},
    });
    createUniversalLearningReviewRun.mockResolvedValue({
      id: "run-v2",
    });
    updateUniversalLearningReviewRunStatus.mockResolvedValue(undefined);
    writeUniversalLearningRunRecords.mockResolvedValue(undefined);

    const applyMemoryActions = vi.fn().mockResolvedValue({ appliedCount: 1 });
    const { runUniversalConstructionLearningReview } = await import("./runner");

    const result = await runUniversalConstructionLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "project_purchase_order",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-v2",
      },
      modelInvoker: async () => ({
        provider: "anthropic",
        model: "test-model",
        rawText: "{}",
        parsedJson: {
          contractVersion: "ucl_response_v2",
          reviewSummary: {
            assessment: "Draft PO evidence is useful but cautious.",
            confidence: "moderate",
            notes: "One source record.",
          },
          learnings: [
            {
              id: "L1",
              stage: "emerging",
              statement: "The company drafts supplier purchase orders before stronger procurement evidence appears.",
              importance: "Draft POs can reveal early procurement intent.",
              confidence: {
                score: 0.45,
                label: "moderate",
                basis: "One reviewed PO supports the signal.",
              },
              evidence: {
                recordCount: 1,
                sourceRefs: [
                  { sourceId: "f27f539f", note: "draft supplier PO" },
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
              action: "create",
              learningId: "L1",
              targetMemoryId: null,
              title: "Draft supplier POs show early procurement intent",
              summary: "The company may use draft supplier purchase orders to capture early procurement intent before approval or invoicing.",
              confidenceAdjustment: 0,
              reason: "Useful synthetic v2 replay.",
            },
          ],
        },
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
      }),
      applyMemoryActions,
    });

    expect(result).toMatchObject({
      reviewRunId: "run-v2",
      appliedCount: 1,
      skipped: false,
    });
    expect(applyMemoryActions).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-v2",
      reviewMonth: "2026-06",
      response: expect.objectContaining({
        learnings: expect.objectContaining({
          emergingPatterns: expect.arrayContaining([
            expect.objectContaining({
              learningId: "L1",
              evidence: expect.objectContaining({
                supportingRecords: [
                  expect.objectContaining({
                    sourceId: "f27f539f",
                    reason: "draft supplier PO",
                  }),
                ],
              }),
            }),
          ]),
        }),
        memoryActions: expect.objectContaining({
          create: [
            expect.objectContaining({
              basedOnLearningId: "L1",
              proposedMemoryTitle: "Draft supplier POs show early procurement intent",
            }),
          ],
        }),
      }),
    }));
    expect(advanceUniversalLearningCursor).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-v2",
      nextCursor: {
        updatedAt: "2026-06-01T00:00:00.000Z",
        id: sourceId,
      },
      selectedRecordCount: 1,
    }));
  });

  it("uses a quote-specific default review intent for project_quote reviews", async () => {
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [],
      nextCursorCandidate: { updatedAt: null, id: null },
      reviewScopeContext: {
        module: "project_quotes",
        workflow: "monthly_project_quote_review",
        recordCount: 0,
        projectCount: 0,
        supplierCount: 0,
        clientCount: 0,
        statusMix: {},
        projects: [],
        suppliers: [],
        clients: [],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [],
      forbiddenOperationalChanges: [],
      lockedRoutingCodes: {},
    });

    const { prepareUniversalLearningReview } = await import("./runner");
    const prepared = await prepareUniversalLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "project_quote",
        reviewMonth: "2026-06",
        runType: "monthly",
        scopeKey: "organization",
      },
    });

    expect(prepared.promptPacket.reviewMeta.reviewIntent).toContain("Monthly estimating review for project quotes");
    expect(prepared.promptPacket.reviewMeta.reviewIntent).toContain("packages labour and materials");
    expect(buildUniversalLearningMemoryPack).toHaveBeenCalledWith(expect.objectContaining({
      currentContainerType: "project_quote",
      primaryReasoningDomain: "commercial_estimating",
    }));
  });

  it("builds a measurement-specific review intent and passes domain-aware retrieval context for takeoff", async () => {
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [],
      nextCursorCandidate: { updatedAt: null, id: null },
      reviewScopeContext: {
        module: "takeoff",
        workflow: "monthly_takeoff_review",
        recordCount: 0,
        projectCount: 0,
        supplierCount: 0,
        clientCount: 0,
        statusMix: {},
        projects: [],
        suppliers: [],
        clients: [],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [],
      forbiddenOperationalChanges: [],
      lockedRoutingCodes: {},
    });

    const { prepareUniversalLearningReview } = await import("./runner");
    const prepared = await prepareUniversalLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "takeoff_measurement",
        reviewMonth: "2026-06",
        runType: "monthly",
        scopeKey: "organization",
      },
    });

    expect(prepared.promptPacket.reviewMeta.reviewIntent).toContain("Monthly measurement-intelligence review for takeoff activity");
    expect(prepared.promptPacket.reviewMeta.reviewIntent).toContain("without widening into downstream commercial conclusions");
    expect(buildUniversalLearningMemoryPack).toHaveBeenCalledWith(expect.objectContaining({
      currentContainerType: "takeoff_measurement",
      primaryReasoningDomain: "measurement_intelligence",
    }));
  });

  it("replays project_variation trust-boundary reviews with a synthetic v2 response and advances the cursor only after success", async () => {
    const sourceId = "variation-1";
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [
        {
          containerType: "project_variation",
          source: {
            table: "project_variations",
            sourceId,
            sourceVersion: 1,
          },
          organizationId: "org-1",
          projectId: "project-1",
          opportunityId: null,
          supplierId: null,
          clientId: "client-1",
          actorUserId: "user-variation-1",
          updatedAt: "2026-06-23T12:00:00.000Z",
          status: {
            status: "Approved",
            origin: "Client Request",
            invoice_ready: true,
          },
          payload: {
            sourceEvidence: {
              variation: {
                variationId: sourceId,
                variationNumber: "VAR-0017",
                status: "Approved",
                origin: "Client Request",
              },
              invoiceExportSummary: {
                invoiceReady: true,
                invoiceItemCount: 1,
              },
              quoteLinkageSummary: {
                quoteLinked: true,
                linkedQuoteCount: 1,
              },
              purchaseOrderLinkageSummary: {
                purchaseOrderLinked: true,
                linkedPurchaseOrderCount: 1,
              },
              claimRelevanceSummary: {
                claimRelevant: true,
                commerciallyRecovered: false,
              },
            },
            operationalContext: {
              lifecycleStage: "invoice_ready",
              hasApproved: true,
              hasInvoiceItems: true,
              evidenceStrength: "strong",
            },
            lineageContext: {
              organizationId: "org-1",
              variationId: sourceId,
              projectId: "project-1",
              clientId: "client-1",
              quoteIds: ["quote-1"],
              purchaseOrderIds: ["po-1"],
              sourceTable: "project_variations",
            },
          },
          linkedContext: {
            sourceTable: "project_variations",
            sourceModule: "variations",
            sourceWorkflow: "monthly_variation_review",
            sourceIds: {
              projectId: "project-1",
              opportunityId: null,
              supplierId: null,
              clientId: "client-1",
            },
          },
          routingContext: {
            readOnly: true,
            tradesstack_cost_codeValues: ["100", "200"],
            tradesstack_cost_code_labelValues: ["Materials", "Labour"],
            accounting_mapping_idValues: ["mapping-variation-1", "mapping-variation-2"],
            organization_cost_code_idValues: ["org-cost-code-variation-1", "org-cost-code-variation-2"],
          },
          signalStrength: "strong",
        },
      ],
      nextCursorCandidate: {
        updatedAt: "2026-06-23T12:00:00.000Z",
        id: sourceId,
      },
      reviewScopeContext: {
        module: "variations",
        workflow: "monthly_variation_review",
        recordCount: 1,
        projectCount: 1,
        supplierCount: 0,
        clientCount: 1,
        statusMix: {
          "status:Approved": 1,
          "origin:Client Request": 1,
          "invoice_ready:true": 1,
        },
        projects: [{ projectId: "project-1", projectName: "Auckland Office Fitout" }],
        suppliers: [],
        clients: [{ clientId: "client-1", clientName: "Metro Property Group" }],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([
      {
        id: "memory-variation-1",
        memoryCategory: "commercial_recovery",
        memoryType: "project_quote_learning",
        title: "Quoted exclusions sometimes become approved variations",
        summary: "The company often turns scoped change into approved commercial recovery after issue to the client.",
        confidenceScore: 0.71,
        derivedFromTotalCount: 4,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [
        "tradesstack_cost_code",
        "tradesstack_cost_code_label",
        "accounting_mapping_id",
        "organization_cost_code_id",
      ],
      forbiddenOperationalChanges: [
        "financial routing",
        "variation invoicing",
        "cost truth",
      ],
      lockedRoutingCodes: {
        "100": "Materials",
        "200": "Labour",
      },
    });
    createUniversalLearningReviewRun.mockResolvedValue({
      id: "run-project-variation",
    });
    updateUniversalLearningReviewRunStatus.mockResolvedValue(undefined);
    writeUniversalLearningRunRecords.mockResolvedValue(undefined);

    const applyMemoryActions = vi.fn().mockResolvedValue({ appliedCount: 1 });
    const { runUniversalConstructionLearningReview } = await import("./runner");

    const result = await runUniversalConstructionLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "project_variation",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-project-variation",
      },
      modelInvoker: async () => ({
        provider: "anthropic",
        model: "synthetic-v2",
        rawText: "{}",
        parsedJson: {
          contractVersion: "ucl_response_v2",
          reviewSummary: {
            assessment: "Variation activity shows disciplined change recovery from issued client scope change into invoice-ready commercial value.",
            confidence: "high",
            notes: "The reviewed variation includes issue, approval, quote lineage, PO lineage, and invoice-ready evidence.",
          },
          learnings: [
            {
              id: "L1",
              stage: "reinforced",
              statement: "Client-driven scope change is being turned into approved, invoice-ready variation revenue with supporting upstream commercial lineage.",
              importance: "This is high-value commercial recovery behaviour rather than uncontrolled scope creep.",
              confidence: {
                score: 0.83,
                label: "high",
                basis: "The reviewed variation shows client issue, approval, quote linkage, PO linkage, and invoice-ready follow-through.",
              },
              evidence: {
                recordCount: 1,
                sourceRefs: [
                  {
                    sourceId,
                    note: "Approved variation retained quote, PO, and invoice-ready lineage.",
                  },
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
              action: "create",
              learningId: "L1",
              targetMemoryId: null,
              title: "Approved client variations are being carried through to invoice-ready recovery",
              summary: "Project variations are being issued, approved, and advanced to invoice-ready commercial recovery with quote and purchase-order lineage preserved.",
              confidenceAdjustment: 0,
              reason: "Synthetic project-variation replay.",
            },
          ],
        },
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
      }),
      applyMemoryActions,
    });

    expect(result).toMatchObject({
      reviewRunId: "run-project-variation",
      appliedCount: 1,
      skipped: false,
    });
    expect(writeUniversalLearningRunRecords).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-project-variation",
      records: expect.arrayContaining([
        expect.objectContaining({
          containerType: "project_variation",
          source: expect.objectContaining({
            table: "project_variations",
            sourceId,
          }),
        }),
      ]),
    }));
    expect(applyMemoryActions).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-project-variation",
      reviewMonth: "2026-06",
      response: expect.objectContaining({
        learnings: expect.objectContaining({
          reinforcedPatterns: expect.arrayContaining([
            expect.objectContaining({
              learningId: "L1",
              evidence: expect.objectContaining({
                supportingRecords: [
                  expect.objectContaining({
                    sourceId,
                    reason: "Approved variation retained quote, PO, and invoice-ready lineage.",
                  }),
                ],
              }),
            }),
          ]),
        }),
      }),
    }));
    expect(advanceUniversalLearningCursor).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-project-variation",
      nextCursor: {
        updatedAt: "2026-06-23T12:00:00.000Z",
        id: sourceId,
      },
      selectedRecordCount: 1,
    }));
  });

  it("replays supplier_invoice trust-boundary reviews with a synthetic v2 response and advances the cursor only after success", async () => {
    const sourceId = "invoice-1";
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [
        {
          containerType: "supplier_invoice",
          source: {
            table: "supplier_invoices",
            sourceId,
            sourceVersion: 1,
          },
          organizationId: "org-1",
          projectId: "project-1",
          opportunityId: null,
          supplierId: "supplier-1",
          clientId: "client-1",
          actorUserId: "user-1",
          updatedAt: "2026-06-21T09:00:00.000Z",
          status: { status: "Needs Review", source: "upload" },
          payload: {
            sourceEvidence: {
              supplierInvoice: {
                sourceId,
                invoiceNumber: "INV-2406-17",
                status: "Needs Review",
              },
              lineItems: [
                { lineItemId: "line-1", description: "13mm GIB standard plasterboard", lineTotal: 1000 },
              ],
              allocationSummary: {
                allocationCount: 1,
                approvedAllocationCount: 1,
              },
              actualCostPostingSummary: {
                postedEventCount: 1,
                postedAmount: 1150,
              },
              reversalCorrectionSummary: {
                reversalCount: 0,
              },
            },
            operationalContext: {
              lifecycleStage: "posted",
              evidenceStrength: "strong",
            },
            lineageContext: {
              organizationId: "org-1",
              supplierId: "supplier-1",
              supplierName: "Metro Building Supplies",
              projectIds: ["project-1"],
              clientIds: ["client-1"],
              invoiceId: sourceId,
              sourceTable: "supplier_invoices",
            },
          },
          linkedContext: {
            sourceTable: "supplier_invoices",
            sourceModule: "supplier_invoices",
            sourceWorkflow: "monthly_supplier_invoice_review",
            sourceIds: {
              projectId: "project-1",
              opportunityId: null,
              supplierId: "supplier-1",
              clientId: "client-1",
            },
          },
          routingContext: {
            readOnly: true,
            tradesstack_cost_codeValues: [100],
            tradesstack_cost_code_labelValues: ["Materials"],
            accounting_mapping_idValues: ["mapping-1"],
          },
          signalStrength: "strong",
        },
      ],
      nextCursorCandidate: {
        updatedAt: "2026-06-21T09:00:00.000Z",
        id: sourceId,
      },
      reviewScopeContext: {
        module: "supplier_invoices",
        workflow: "monthly_supplier_invoice_review",
        recordCount: 1,
        projectCount: 1,
        supplierCount: 1,
        clientCount: 1,
        statusMix: {
          "status:Needs Review": 1,
        },
        projects: [{ projectId: "project-1", projectName: "Auckland Office Fitout" }],
        suppliers: [{ supplierId: "supplier-1", supplierName: "Metro Building Supplies" }],
        clients: [{ clientId: "client-1", clientName: "Metro Property Group" }],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([
      {
        id: "memory-1",
        memoryCategory: "construction_decision",
        memoryType: "project_purchase_order_learning",
        title: "Procurement evidence exists before invoices arrive",
        summary: "The company normally reaches invoice review with upstream procurement context already in place.",
        confidenceScore: 0.7,
        derivedFromTotalCount: 3,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [
        "tradesstack_cost_code",
        "tradesstack_cost_code_label",
        "accounting_mapping_id",
      ],
      forbiddenOperationalChanges: [
        "supplier invoice posting",
        "actual cost posting",
      ],
      lockedRoutingCodes: {
        "100": "Materials",
      },
    });
    createUniversalLearningReviewRun.mockResolvedValue({
      id: "run-supplier-invoice",
    });
    updateUniversalLearningReviewRunStatus.mockResolvedValue(undefined);
    writeUniversalLearningRunRecords.mockResolvedValue(undefined);

    const applyMemoryActions = vi.fn().mockResolvedValue({ appliedCount: 1 });
    const { runUniversalConstructionLearningReview } = await import("./runner");

    const result = await runUniversalConstructionLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "supplier_invoice",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-supplier-invoice",
      },
      modelInvoker: async () => ({
        provider: "anthropic",
        model: "synthetic-v2",
        rawText: "{}",
        parsedJson: {
          contractVersion: "ucl_response_v2",
          reviewSummary: {
            assessment: "Supplier invoice activity shows mature downstream commercial traceability.",
            confidence: "high",
            notes: "The invoice packet includes supplier, PO, allocation, and posting evidence.",
          },
          learnings: [
            {
              id: "L1",
              stage: "reinforced",
              statement: "The company reviews supplier invoices with linked procurement and posting context, not as isolated AP records.",
              importance: "This supports stronger commercial control and cost provenance.",
              confidence: {
                score: 0.78,
                label: "high",
                basis: "The reviewed invoice shows PO linkage, approved allocation, and posted actual cost evidence.",
              },
              evidence: {
                recordCount: 1,
                sourceRefs: [
                  {
                    sourceId,
                    note: "Invoice linked to PO, approved allocation, and actual cost posting.",
                  },
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
              action: "create",
              learningId: "L1",
              targetMemoryId: null,
              title: "Supplier invoices are reviewed against procurement and cost posting evidence",
              summary: "The company reviews supplier invoices alongside PO linkage, approved allocation, and actual-cost posting context rather than treating invoices as isolated AP records.",
              confidenceAdjustment: 0,
              reason: "Synthetic supplier-invoice replay.",
            },
          ],
        },
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
      }),
      applyMemoryActions,
    });

    expect(result).toMatchObject({
      reviewRunId: "run-supplier-invoice",
      appliedCount: 1,
      skipped: false,
    });
    expect(getUniversalLearningBoundaryContext).toHaveBeenCalled();
    expect(writeUniversalLearningRunRecords).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-supplier-invoice",
      records: expect.arrayContaining([
        expect.objectContaining({
          containerType: "supplier_invoice",
          source: expect.objectContaining({
            table: "supplier_invoices",
            sourceId,
          }),
        }),
      ]),
    }));
    expect(applyMemoryActions).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-supplier-invoice",
      reviewMonth: "2026-06",
      response: expect.objectContaining({
        learnings: expect.objectContaining({
          reinforcedPatterns: expect.arrayContaining([
            expect.objectContaining({
              learningId: "L1",
              evidence: expect.objectContaining({
                supportingRecords: [
                  expect.objectContaining({
                    sourceId,
                    reason: "Invoice linked to PO, approved allocation, and actual cost posting.",
                  }),
                ],
              }),
            }),
          ]),
        }),
      }),
    }));
    expect(advanceUniversalLearningCursor).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-supplier-invoice",
      nextCursor: {
        updatedAt: "2026-06-21T09:00:00.000Z",
        id: sourceId,
      },
      selectedRecordCount: 1,
    }));
  });

  it("replays pricing_workbook_sheet trust-boundary reviews with a synthetic v2 response and advances the cursor only after success", async () => {
    const sourceId = "sheet-1";
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [
        {
          containerType: "pricing_workbook_sheet",
          source: {
            table: "opportunity_pricing_workbook_sheets",
            sourceId,
            sourceVersion: 4,
          },
          organizationId: "org-1",
          projectId: "project-1",
          opportunityId: "opp-1",
          supplierId: null,
          clientId: "client-1",
          actorUserId: "estimator-2",
          updatedAt: "2026-06-14T10:30:00.000Z",
          status: { version: 4 },
          payload: {
            sourceEvidence: {
              worksheetIdentity: {
                workbookId: "workbook-1",
                workbookName: "Level 3 Partitions",
                sheetId: sourceId,
                sheetName: "Partitions Worksheet",
                tradePackage: "Partitions",
              },
              worksheetStructureSummary: {
                populatedCellCount: 18,
                formulaCellCount: 2,
              },
              retainedPricingSummary: {
                subtotal: 4236,
                margin: 635.4,
                grandTotal: 5602.11,
              },
              retainedExtractedPricingData: {
                lineItemCount: 2,
              },
              retainedEstimatingSignals: {
                quantities: [{ rowLabel: "13mm GIB board" }],
                rates: [{ rowLabel: "13mm GIB board" }],
                buildUpPatterns: {
                  labour: [{ rowLabel: "Labour install" }],
                  material: [{ rowLabel: "13mm GIB board" }],
                  plant: [],
                  subcontract: [],
                },
              },
            },
            operationalContext: {
              worksheetMaturity: "revised_established",
              evidenceStrength: "strong",
            },
            lineageContext: {
              organizationId: "org-1",
              opportunityId: "opp-1",
              projectId: "project-1",
              clientId: "client-1",
              workbookId: "workbook-1",
              sheetId: sourceId,
              sourceTable: "opportunity_pricing_workbook_sheets",
              parentTable: "opportunity_pricing_worksheets",
            },
          },
          linkedContext: {
            sourceTable: "opportunity_pricing_workbook_sheets",
            sourceModule: "pricing_worksheets",
            sourceWorkflow: "monthly_pricing_review",
            sourceIds: {
              projectId: "project-1",
              opportunityId: "opp-1",
              supplierId: null,
              clientId: "client-1",
            },
          },
          routingContext: { readOnly: true },
          signalStrength: "strong",
        },
      ],
      nextCursorCandidate: {
        updatedAt: "2026-06-14T10:30:00.000Z",
        id: sourceId,
      },
      reviewScopeContext: {
        module: "pricing_worksheets",
        workflow: "monthly_pricing_review",
        recordCount: 1,
        projectCount: 1,
        supplierCount: 0,
        clientCount: 1,
        statusMix: {
          "version:4": 1,
        },
        projects: [{ projectId: "project-1", projectName: "Long Bay Apartments" }],
        suppliers: [],
        clients: [{ clientId: "client-1", clientName: "Long Bay Developments" }],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([
      {
        id: "memory-worksheet-1",
        memoryCategory: "construction_decision",
        memoryType: "project_quote_learning",
        title: "Saved worksheets already show structured estimating discipline",
        summary: "The company typically retains structured worksheet evidence before quote issue.",
        confidenceScore: 0.72,
        derivedFromTotalCount: 4,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [],
      forbiddenOperationalChanges: [
        "pricing worksheet generation",
        "pricing worksheet editing",
      ],
      lockedRoutingCodes: {},
    });
    createUniversalLearningReviewRun.mockResolvedValue({
      id: "run-pricing-workbook-sheet",
    });
    updateUniversalLearningReviewRunStatus.mockResolvedValue(undefined);
    writeUniversalLearningRunRecords.mockResolvedValue(undefined);

    const applyMemoryActions = vi.fn().mockResolvedValue({ appliedCount: 1 });
    const { runUniversalConstructionLearningReview } = await import("./runner");

    const result = await runUniversalConstructionLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "pricing_workbook_sheet",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-pricing-workbook-sheet",
      },
      modelInvoker: async () => ({
        provider: "anthropic",
        model: "synthetic-v2",
        rawText: "{}",
        parsedJson: {
          contractVersion: "ucl_response_v2",
          reviewSummary: {
            assessment: "Saved worksheet evidence shows repeatable estimating structure.",
            confidence: "high",
            notes: "The retained sheet contains formulas, rates, build-ups, and pricing totals.",
          },
          learnings: [
            {
              id: "L1",
              stage: "reinforced",
              statement: "The company retains structured pricing worksheets with formula-led totals and visible labour and material build-ups.",
              importance: "This supports durable estimating consistency across future opportunities.",
              confidence: {
                score: 0.79,
                label: "high",
                basis: "The reviewed worksheet contains retained rates, formulas, pricing totals, and trade build-up rows.",
              },
              evidence: {
                recordCount: 1,
                sourceRefs: [
                  {
                    sourceId,
                    note: "Saved worksheet includes retained formulas, pricing summary, and labour/material build-up rows.",
                  },
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
              action: "create",
              learningId: "L1",
              targetMemoryId: null,
              title: "Pricing worksheets retain structured build-ups and formula-led totals",
              summary: "The company retains structured pricing worksheets with visible labour and material build-ups, formula-led totals, and saved commercial summaries.",
              confidenceAdjustment: 0,
              reason: "Synthetic pricing worksheet replay.",
            },
          ],
        },
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
      }),
      applyMemoryActions,
    });

    expect(result).toMatchObject({
      reviewRunId: "run-pricing-workbook-sheet",
      appliedCount: 1,
      skipped: false,
    });
    expect(writeUniversalLearningRunRecords).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-pricing-workbook-sheet",
      records: expect.arrayContaining([
        expect.objectContaining({
          containerType: "pricing_workbook_sheet",
          source: expect.objectContaining({
            table: "opportunity_pricing_workbook_sheets",
            sourceId,
          }),
        }),
      ]),
    }));
    expect(applyMemoryActions).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-pricing-workbook-sheet",
      response: expect.objectContaining({
        learnings: expect.objectContaining({
          reinforcedPatterns: expect.arrayContaining([
            expect.objectContaining({
              learningId: "L1",
              evidence: expect.objectContaining({
                supportingRecords: [
                  expect.objectContaining({
                    sourceId,
                    reason: "Saved worksheet includes retained formulas, pricing summary, and labour/material build-up rows.",
                  }),
                ],
              }),
            }),
          ]),
        }),
      }),
    }));
    expect(advanceUniversalLearningCursor).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-pricing-workbook-sheet",
      nextCursor: {
        updatedAt: "2026-06-14T10:30:00.000Z",
        id: sourceId,
      },
      selectedRecordCount: 1,
    }));
  });

  it("replays supplier_invoice_allocation trust-boundary reviews with a synthetic v2 response and advances the cursor only after success", async () => {
    const sourceId = "allocation-1";
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [
        {
          containerType: "supplier_invoice_allocation",
          source: {
            table: "supplier_invoice_line_allocations",
            sourceId,
            sourceVersion: 1,
          },
          organizationId: "org-1",
          projectId: "project-1",
          opportunityId: null,
          supplierId: "supplier-1",
          clientId: "client-1",
          actorUserId: "reviewer-1",
          updatedAt: "2026-06-21T10:15:00.000Z",
          status: {
            allocationStatus: "matched",
            reviewStatus: "resolved",
            approvalStatus: "approved",
            matchStatus: "accepted",
          },
          payload: {
            sourceEvidence: {
              allocation: {
                allocationId: sourceId,
                supplierInvoiceId: "invoice-1",
                supplierInvoiceLineId: "line-1",
                allocationStatus: "matched",
                reviewStatus: "resolved",
                approvalStatus: "approved",
                matchStatus: "accepted",
                acceptedAiSuggestion: false,
                matchedBasis: {
                  basis: "matched_to_purchase_order_line",
                  matchEvidence: "accepted",
                },
              },
              supplierInvoice: {
                invoiceId: "invoice-1",
                invoiceNumber: "INV-ALLOC-1",
                status: "Needs Review",
              },
              purchaseOrderMatch: {
                matchId: "match-1",
                purchaseOrderId: "po-1",
                approvalStatus: "approved",
              },
              actualCostEventSummary: {
                postedEventCount: 1,
                postedEventIds: ["event-1"],
                reversalEventCount: 0,
              },
              correctionChainSummary: {
                editState: "locked_posted",
                supersedesAllocationId: null,
                successorAllocationIds: [],
              },
            },
            operationalContext: {
              lifecycleStage: "posted",
              postingCompleteness: {
                posted: true,
                postedEventCount: 1,
                reversalEventCount: 0,
              },
              reviewCompleteness: {
                reviewed: true,
                blocked: false,
              },
              approvalCompleteness: {
                approved: true,
                disputed: false,
                pending: false,
              },
              disputeState: {
                isDisputed: false,
              },
              evidenceStrength: "strong",
            },
            lineageContext: {
              organizationId: "org-1",
              supplierInvoiceId: "invoice-1",
              supplierInvoiceLineId: "line-1",
              purchaseOrderId: "po-1",
              purchaseOrderLineItemId: "po-line-1",
              projectId: "project-1",
              clientId: "client-1",
              supplierId: "supplier-1",
              actualCostEventIds: ["event-1"],
              sourceTable: "supplier_invoice_line_allocations",
            },
          },
          linkedContext: {
            sourceTable: "supplier_invoice_line_allocations",
            sourceModule: "supplier_invoices",
            sourceWorkflow: "monthly_supplier_invoice_allocation_review",
            sourceIds: {
              projectId: "project-1",
              opportunityId: null,
              supplierId: "supplier-1",
              clientId: "client-1",
            },
          },
          routingContext: {
            readOnly: true,
            tradesstack_cost_code: 200,
            tradesstack_cost_code_label: "Labour",
            accounting_mapping_id: "mapping-1",
            organization_cost_code_id: "org-cost-code-1",
          },
          signalStrength: "strong",
        },
      ],
      nextCursorCandidate: {
        updatedAt: "2026-06-21T10:15:00.000Z",
        id: sourceId,
      },
      reviewScopeContext: {
        module: "supplier_invoices",
        workflow: "monthly_supplier_invoice_allocation_review",
        recordCount: 1,
        projectCount: 1,
        supplierCount: 1,
        clientCount: 1,
        statusMix: {
          "approvalStatus:approved": 1,
          "lifecycleStage:posted": 1,
        },
        projects: [{ projectId: "project-1", projectName: "Auckland Office Fitout" }],
        suppliers: [{ supplierId: "supplier-1", supplierName: "Metro Building Supplies" }],
        clients: [{ clientId: "client-1", clientName: "Metro Property Group" }],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([
      {
        id: "memory-alloc-1",
        memoryCategory: "commercial_operations",
        memoryType: "supplier_invoice_learning",
        title: "Matched allocations are usually reviewed before posting",
        summary: "Supplier invoice allocations tend to be reviewed and approved before actual-cost posting.",
        confidenceScore: 0.72,
        derivedFromTotalCount: 4,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [
        "tradesstack_cost_code",
        "tradesstack_cost_code_label",
        "accounting_mapping_id",
        "organization_cost_code_id",
      ],
      forbiddenOperationalChanges: [
        "supplier invoice allocation posting",
        "actual cost posting",
      ],
      lockedRoutingCodes: {
        "200": "Labour",
      },
    });
    createUniversalLearningReviewRun.mockResolvedValue({
      id: "run-supplier-invoice-allocation",
    });
    updateUniversalLearningReviewRunStatus.mockResolvedValue(undefined);
    writeUniversalLearningRunRecords.mockResolvedValue(undefined);

    const applyMemoryActions = vi.fn().mockResolvedValue({ appliedCount: 1 });
    const { runUniversalConstructionLearningReview } = await import("./runner");

    const result = await runUniversalConstructionLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "supplier_invoice_allocation",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-supplier-invoice-allocation",
      },
      modelInvoker: async () => ({
        provider: "anthropic",
        model: "synthetic-v2",
        rawText: "{}",
        parsedJson: {
          contractVersion: "ucl_response_v2",
          reviewSummary: {
            assessment: "Supplier invoice allocation activity shows disciplined matching, review, and posting flow.",
            confidence: "high",
            notes: "The reviewed allocation includes matched PO, review approval, and posted actual-cost evidence.",
          },
          learnings: [
            {
              id: "L1",
              stage: "reinforced",
              statement: "The company usually treats supplier invoice allocations as controlled commercial decisions tied to PO matching and posting readiness.",
              importance: "This preserves cost accuracy and reduces posting risk.",
              confidence: {
                score: 0.8,
                label: "high",
                basis: "The reviewed allocation shows accepted PO matching, resolved review, approved status, and successful posting.",
              },
              evidence: {
                recordCount: 1,
                sourceRefs: [
                  {
                    sourceId,
                    note: "Allocation matched to PO line, approved, and posted without reversal.",
                  },
                ],
              },
              existingMemory: {
                status: "reinforces_existing",
                memoryId: "memory-alloc-1",
              },
            },
          ],
          memoryActions: [
            {
              action: "reinforce",
              learningId: "L1",
              targetMemoryId: "memory-alloc-1",
              title: "Matched allocations are usually reviewed before posting",
              summary: "Supplier invoice allocations continue to show review and approval discipline before actual-cost posting.",
              confidenceAdjustment: 0.05,
              reason: "Synthetic supplier-invoice-allocation replay.",
            },
          ],
        },
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
      }),
      applyMemoryActions,
    });

    expect(result).toMatchObject({
      reviewRunId: "run-supplier-invoice-allocation",
      appliedCount: 1,
      skipped: false,
    });
    expect(getUniversalLearningBoundaryContext).toHaveBeenCalled();
    expect(writeUniversalLearningRunRecords).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-supplier-invoice-allocation",
      records: expect.arrayContaining([
        expect.objectContaining({
          containerType: "supplier_invoice_allocation",
          source: expect.objectContaining({
            table: "supplier_invoice_line_allocations",
            sourceId,
          }),
        }),
      ]),
    }));
    expect(applyMemoryActions).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-supplier-invoice-allocation",
      reviewMonth: "2026-06",
      response: expect.objectContaining({
        learnings: expect.objectContaining({
          reinforcedPatterns: expect.arrayContaining([
            expect.objectContaining({
              learningId: "L1",
              evidence: expect.objectContaining({
                supportingRecords: [
                  expect.objectContaining({
                    sourceId,
                    reason: "Allocation matched to PO line, approved, and posted without reversal.",
                  }),
                ],
              }),
            }),
          ]),
        }),
      }),
    }));
    expect(advanceUniversalLearningCursor).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-supplier-invoice-allocation",
      nextCursor: {
        updatedAt: "2026-06-21T10:15:00.000Z",
        id: sourceId,
      },
      selectedRecordCount: 1,
    }));
  });

  it("replays project_actual_cost_event trust-boundary reviews with a synthetic v2 response and advances the cursor only after success", async () => {
    const sourceId = "event-1";
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [
        {
          containerType: "project_actual_cost_event",
          source: {
            table: "project_actual_cost_events",
            sourceId,
            sourceVersion: 1,
          },
          organizationId: "org-1",
          projectId: "project-1",
          opportunityId: null,
          supplierId: "supplier-1",
          clientId: "client-1",
          actorUserId: "poster-1",
          updatedAt: "2026-06-20T14:00:00.000Z",
          status: {
            event_status: "posted",
            posting_source: "supplier_invoice_allocation",
            source_type: "supplier_invoice",
          },
          payload: {
            sourceEvidence: {
              actualCostEvent: {
                eventId: sourceId,
                eventType: "posting",
                eventStatus: "posted",
                postingSource: "supplier_invoice_allocation",
              },
              sourceAllocation: {
                allocationId: "allocation-1",
                approvalStatus: "approved",
                acceptedAiSuggestion: false,
              },
              correctionOrReversalSummary: {
                correctionRootEventId: "event-1",
              },
              ledgerMeaning: {
                ledgerLabel: "posting",
              },
            },
            operationalContext: {
              lifecycleStage: "posted",
              isManualAdjustment: false,
              evidenceStrength: "strong",
            },
            lineageContext: {
              organizationId: "org-1",
              eventId: sourceId,
              supplierInvoiceId: "invoice-1",
              sourceInvoiceAllocationId: "allocation-1",
              purchaseOrderId: "po-1",
              projectId: "project-1",
              clientId: "client-1",
              supplierId: "supplier-1",
              sourceTable: "project_actual_cost_events",
            },
          },
          linkedContext: {
            sourceTable: "project_actual_cost_events",
            sourceModule: "actual_costs",
            sourceWorkflow: "monthly_actual_cost_review",
            sourceIds: {
              projectId: "project-1",
              opportunityId: null,
              supplierId: "supplier-1",
              clientId: "client-1",
            },
          },
          routingContext: {
            readOnly: true,
            tradesstack_cost_code: 200,
            tradesstack_cost_code_label: "Labour",
            accounting_mapping_id: "mapping-1",
            organization_cost_code_id: "org-cost-code-1",
          },
          signalStrength: "strong",
        },
      ],
      nextCursorCandidate: {
        updatedAt: "2026-06-20T14:00:00.000Z",
        id: sourceId,
      },
      reviewScopeContext: {
        module: "actual_costs",
        workflow: "monthly_actual_cost_review",
        recordCount: 1,
        projectCount: 1,
        supplierCount: 1,
        clientCount: 1,
        statusMix: {
          "event_status:posted": 1,
          "posting_source:supplier_invoice_allocation": 1,
        },
        projects: [{ projectId: "project-1", projectName: "Auckland Office Fitout" }],
        suppliers: [{ supplierId: "supplier-1", supplierName: "Metro Building Supplies" }],
        clients: [{ clientId: "client-1", clientName: "Metro Property Group" }],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([
      {
        id: "memory-actual-cost-1",
        memoryCategory: "commercial_operations",
        memoryType: "supplier_invoice_allocation_learning",
        title: "Posted actual costs normally follow approved allocations",
        summary: "Actual cost postings usually follow approved supplier invoice allocations.",
        confidenceScore: 0.74,
        derivedFromTotalCount: 8,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [
        "tradesstack_cost_code",
        "tradesstack_cost_code_label",
        "accounting_mapping_id",
        "organization_cost_code_id",
      ],
      forbiddenOperationalChanges: [
        "financial routing",
        "actual cost posting",
        "reporting",
      ],
      lockedRoutingCodes: {
        "200": "Labour",
      },
    });
    createUniversalLearningReviewRun.mockResolvedValue({
      id: "run-project-actual-cost-event",
    });
    updateUniversalLearningReviewRunStatus.mockResolvedValue(undefined);
    writeUniversalLearningRunRecords.mockResolvedValue(undefined);

    const applyMemoryActions = vi.fn().mockResolvedValue({ appliedCount: 1 });
    const { runUniversalConstructionLearningReview } = await import("./runner");

    const result = await runUniversalConstructionLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "project_actual_cost_event",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-project-actual-cost-event",
      },
      modelInvoker: async () => ({
        provider: "anthropic",
        model: "synthetic-v2",
        rawText: "{}",
        parsedJson: {
          contractVersion: "ucl_response_v2",
          reviewSummary: {
            assessment: "Actual costs show controlled posting of approved commercial decisions.",
            confidence: "high",
            notes: "The reviewed event has invoice, allocation, and ledger evidence.",
          },
          learnings: [
            {
              id: "L1",
              stage: "reinforced",
              statement: "Actual cost events are being posted from approved supplier invoice allocations rather than entered as freeform cost records.",
              importance: "This improves downstream cost discipline and ledger traceability.",
              confidence: {
                score: 0.81,
                label: "high",
                basis: "The reviewed event retains invoice, allocation, PO, and project lineage with a posted lifecycle stage.",
              },
              evidence: {
                recordCount: 1,
                sourceRefs: [
                  {
                    sourceId,
                    note: "Posted actual cost retained source allocation and invoice lineage.",
                  },
                ],
              },
              existingMemory: {
                status: "reinforces_existing",
                memoryId: "memory-actual-cost-1",
              },
            },
          ],
          memoryActions: [
            {
              action: "reinforce",
              learningId: "L1",
              targetMemoryId: "memory-actual-cost-1",
              title: "Posted actual costs normally follow approved allocations",
              summary: "Actual cost postings continue to follow approved supplier invoice allocation decisions with strong downstream lineage.",
              confidenceAdjustment: 0.03,
              reason: "Synthetic project-actual-cost-event replay.",
            },
          ],
        },
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
      }),
      applyMemoryActions,
    });

    expect(result).toMatchObject({
      reviewRunId: "run-project-actual-cost-event",
      appliedCount: 1,
      skipped: false,
    });
    expect(writeUniversalLearningRunRecords).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-project-actual-cost-event",
      records: expect.arrayContaining([
        expect.objectContaining({
          containerType: "project_actual_cost_event",
          source: expect.objectContaining({
            table: "project_actual_cost_events",
            sourceId,
          }),
        }),
      ]),
    }));
    expect(applyMemoryActions).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-project-actual-cost-event",
      reviewMonth: "2026-06",
      response: expect.objectContaining({
        learnings: expect.objectContaining({
          reinforcedPatterns: expect.arrayContaining([
            expect.objectContaining({
              learningId: "L1",
              evidence: expect.objectContaining({
                supportingRecords: [
                  expect.objectContaining({
                    sourceId,
                    reason: "Posted actual cost retained source allocation and invoice lineage.",
                  }),
                ],
              }),
            }),
          ]),
        }),
      }),
    }));
    expect(advanceUniversalLearningCursor).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-project-actual-cost-event",
      nextCursor: {
        updatedAt: "2026-06-20T14:00:00.000Z",
        id: sourceId,
      },
      selectedRecordCount: 1,
    }));
  });

  it("advances composite cursor identities for multi-source containers after successful review", async () => {
    const sourceId = "5131d8a6-fbb5-401a-ba2e-dca21dd9f8d2";
    getUniversalLearningCursor.mockResolvedValue({ updatedAt: null, id: null });
    buildUniversalLearningContainerRecords.mockResolvedValue({
      records: [
        {
          containerType: "project_quote",
          source: {
            table: "opportunity_quotes",
            sourceId,
            sourceVersion: 1,
          },
          organizationId: "org-1",
          projectId: "project-1",
          opportunityId: "opp-1",
          supplierId: null,
          clientId: "client-1",
          actorUserId: null,
          updatedAt: "2026-06-25T01:02:03.000Z",
          status: { status: "Sent" },
          payload: {
            sourceEvidence: {
              quote: {
                number: "Q-26017-1",
                quoteSourceType: "opportunity_quote",
              },
            },
          },
          linkedContext: {},
          routingContext: { readOnly: true },
          signalStrength: "strong",
        },
      ],
      nextCursorCandidate: {
        updatedAt: "2026-06-25T01:02:03.000Z",
        id: `opportunity_quotes:${sourceId}`,
      },
      reviewScopeContext: {
        module: "quotes",
        workflow: "monthly_project_quote_review",
        recordCount: 1,
        projectCount: 1,
        supplierCount: 0,
        clientCount: 1,
        statusMix: {},
        projects: [],
        suppliers: [],
        clients: [],
      },
    });
    loadUniversalLearningConstructionProfile.mockResolvedValue({
      rawProfile: "Commercial interiors contractor",
      normalizedProfile: {},
    });
    buildUniversalLearningMemoryPack.mockResolvedValue([]);
    getUniversalLearningBoundaryContext.mockReturnValue({
      routingIsImmutable: true,
      lockedFields: [],
      forbiddenOperationalChanges: [],
      lockedRoutingCodes: {},
    });
    createUniversalLearningReviewRun.mockResolvedValue({
      id: "run-quote",
    });
    updateUniversalLearningReviewRunStatus.mockResolvedValue(undefined);
    writeUniversalLearningRunRecords.mockResolvedValue(undefined);

    const applyMemoryActions = vi.fn().mockResolvedValue({ appliedCount: 1 });
    const { runUniversalConstructionLearningReview } = await import("./runner");

    await runUniversalConstructionLearningReview({
      selection: {
        organizationId: "org-1",
        containerType: "project_quote",
        reviewMonth: "2026-06",
        runType: "manual",
        scopeKey: "scope-quote",
      },
      modelInvoker: async () => ({
        provider: "anthropic",
        model: "test-model",
        rawText: "{}",
        parsedJson: {
          reviewSummary: {
            overallAssessment: "Assessment",
            dominantThemes: ["estimating"],
            confidenceNotes: "usable",
          },
          learnings: {
            observations: [
              {
                learningId: "learning-quote-1",
                title: "Title",
                statement: "Statement",
                whyItMatters: "Why",
                confidence: { score: 0.7, label: "high", reasoning: "reason" },
                evidence: {
                  recordCount: 1,
                  supportingRecords: [{ sourceId, reason: "support" }],
                },
                relationshipToExistingMemory: { status: "new", memoryId: null, explanation: "new" },
                provenance: {
                  reviewPeriodStart: "2026-06-01T00:00:00.000Z",
                  reviewPeriodEnd: "2026-07-01T00:00:00.000Z",
                  relevantEntities: {
                    projectIds: ["project-1"],
                    supplierIds: [],
                    clientIds: ["client-1"],
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
            noAction: [],
          },
        },
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
      }),
      applyMemoryActions,
    });

    expect(applyMemoryActions).toHaveBeenCalled();
    expect(advanceUniversalLearningCursor).toHaveBeenCalledWith(expect.objectContaining({
      reviewRunId: "run-quote",
      nextCursor: {
        updatedAt: "2026-06-25T01:02:03.000Z",
        id: "opportunity_quotes:5131d8a6-fbb5-401a-ba2e-dca21dd9f8d2",
      },
      selectedRecordCount: 1,
    }));
  });
});
