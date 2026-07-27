import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAdminSupabaseClient = vi.fn();
const buildOrganizationAiContext = vi.fn();
const getPricingWorksheetAiProvider = vi.fn();
const getPricingWorksheetAiProviderName = vi.fn(() => "openai");
const getPricingWorksheetOpenAiModel = vi.fn(() => "gpt-5.5");
const getPricingWorksheetAnthropicModel = vi.fn(() => "claude-sonnet-4-6");

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/lib/organization-ai-context", () => ({
  buildOrganizationAiContext,
}));

vi.mock("@/lib/ai/providers/pricing-worksheet/registry", () => ({
  getPricingWorksheetAiProvider,
  getPricingWorksheetAiProviderName,
  getPricingWorksheetOpenAiModel,
  getPricingWorksheetAnthropicModel,
}));

function buildAdminStub(options: {
  claimedEvents?: Array<Record<string, unknown>>;
  queueRows?: Array<Record<string, unknown>>;
  duplicateCompletedRows?: Array<Record<string, unknown>>;
}) {
  const updates: Array<{ table: string; values: Record<string, unknown>; eq: Array<[string, string]> }> = [];
  const finalizations: Array<Record<string, unknown>> = [];

  const admin = {
    rpc(name: string, payload: Record<string, unknown>) {
      if (name === "claim_cost_construction_intelligence_batch") {
        return Promise.resolve({
          data: options.claimedEvents ?? [],
          error: null,
        });
      }

      if (name === "finalize_cost_construction_intelligence_batch") {
        finalizations.push(payload);
        return Promise.resolve({
          data: {
            completedCount: Array.isArray(payload.p_inputs) ? payload.p_inputs.length : 0,
            retriedCount: 0,
            deadLetteredCount: 0,
          },
          error: null,
        });
      }

      throw new Error(`Unexpected rpc ${name}`);
    },
    from(table: string) {
      const eqCalls: Array<[string, string]> = [];

      if (table === "cost_construction_intelligence_queue") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({
                  data: options.queueRows ?? [],
                  error: null,
                });
              },
            };
          },
        };
      }

      if (table === "cost_construction_intelligence_events") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          eq() {
                            return {
                              eq() {
                                return {
                                  neq() {
                                    return {
                                      order() {
                                        return {
                                          limit() {
                                            return Promise.resolve({
                                              data: options.duplicateCompletedRows ?? [],
                                              error: null,
                                            });
                                          },
                                        };
                                      },
                                    };
                                  },
                                };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(values: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                eqCalls.push([column, value]);
                updates.push({ table, values, eq: [...eqCalls] });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              eqCalls.push([column, value]);
              updates.push({ table, values, eq: [...eqCalls] });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return {
    admin,
    updates,
    finalizations,
  };
}

function buildClaimedEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "event-1",
    idempotency_key: "key-1",
    organization_id: "org-1",
    project_id: "project-1",
    source_type: "organization_material",
    source_id: "material-1",
    source_line_id: null,
    tradesstack_cost_code: "100",
    tradesstack_cost_code_label: "Materials",
    accounting_mapping_id: "mapping-1",
    description: "13mm GIB Standard plasterboard sheets",
    supplier_id: "supplier-1",
    supplier_name_snapshot: "Placemakers",
    quantity: 24,
    unit: "sheet",
    rate: 22.5,
    amount: 540,
    document_context: {
      module: "materials",
      entityName: "13mm GIB Standard",
      currentPriceSource: "import",
      importBatchFileName: "placemakers-materials.csv",
    },
    event_payload: {
      materialId: "material-1",
      materialName: "13mm GIB Standard",
      preferredSupplierName: "Placemakers",
    },
    classification_status: "pending",
    classification_version: 2,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("cost construction intelligence outbox worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    buildOrganizationAiContext.mockResolvedValue({
      constructionProfile: null,
      organizationConstructionContext: null,
    });
    getPricingWorksheetAiProviderName.mockReturnValue("openai");
    getPricingWorksheetOpenAiModel.mockReturnValue("gpt-5.5");
    getPricingWorksheetAnthropicModel.mockReturnValue("claude-sonnet-4-6");
  });

  it("builds a V2 prompt focused on construction meaning instead of accounting", async () => {
    const { buildCostConstructionIntelligenceWorkerPrompts } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );

    const prompts = buildCostConstructionIntelligenceWorkerPrompts(
      {
        id: "event-1",
        idempotencyKey: "key-1",
        organizationId: "org-1",
        projectId: "project-1",
        sourceType: "organization_material",
        sourceId: "material-1",
        sourceLineId: null,
        tradesstackCostCode: "100",
        tradesstackCostCodeLabel: "Materials",
        accountingMappingId: "mapping-1",
        description: "13mm GIB Standard plasterboard sheets",
        supplierId: "supplier-1",
        supplierNameSnapshot: "Placemakers",
        quantity: 24,
        unit: "sheet",
        rate: 22.5,
        amount: 540,
        documentContext: {
          module: "materials",
          entityName: "13mm GIB Standard",
          currentPriceSource: "import",
        },
        eventPayload: {
          materialId: "material-1",
          preferredSupplierName: "Placemakers",
        },
        aiConstructionIntelligence: null,
        classificationStatus: "pending",
        classificationVersion: 2,
        aiProvider: null,
        aiModel: null,
        aiPromptVersion: null,
        processedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      } as never,
    );

    expect(prompts.systemPrompt).toContain("You are a senior construction estimator and project manager.");
    expect(prompts.systemPrompt).toContain("Your job is to extract reusable construction knowledge");
    expect(prompts.systemPrompt).toContain("Do not classify accounting.");
    expect(prompts.systemPrompt).toContain("Do not use Unknown, N/A, or vague filler values.");
    expect(prompts.userPrompt).toContain("Extract construction knowledge from this record.");
    expect(prompts.userPrompt).toContain("What construction knowledge can TradesStack learn from this record");
    expect(prompts.userPrompt).toContain("Few-shot examples:");
    expect(prompts.userPrompt).toContain("13mm GIB Standard plasterboard sheets for internal partitions");
    expect(prompts.userPrompt).toContain("100 x 25mm Hardieboard");
    expect(prompts.userPrompt).toContain("Scaffold hire weekly charge");
    expect(prompts.userPrompt).toContain("Do not infer cost codes.");
    expect(prompts.userPrompt).toContain('"tradesstackCostCode": "100"');
    expect(prompts.userPrompt).toContain('"accountingMappingState": "mapped"');
    expect(prompts.userPrompt).toContain('"supplierName": "Placemakers"');
    expect(prompts.userPrompt).toContain('"currentPriceSource": "import"');
    expect(prompts.userPrompt).not.toContain("Company Construction Context:");
  });

  it("includes organization construction context when provided", async () => {
    const { buildCostConstructionIntelligenceWorkerPrompts } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );

    const prompts = buildCostConstructionIntelligenceWorkerPrompts(
      {
        id: "event-context",
        idempotencyKey: "key-context",
        organizationId: "org-1",
        projectId: "project-1",
        sourceType: "organization_material",
        sourceId: "material-1",
        sourceLineId: null,
        tradesstackCostCode: "100",
        tradesstackCostCodeLabel: "Materials",
        accountingMappingId: "mapping-1",
        description: "Rondo Keylock ceiling grid",
        supplierId: "supplier-1",
        supplierNameSnapshot: "Placemakers",
        quantity: 24,
        unit: "lm",
        rate: 22.5,
        amount: 540,
        documentContext: {
          module: "materials",
        },
        eventPayload: {},
        aiConstructionIntelligence: null,
        classificationStatus: "pending",
        classificationVersion: 2,
        aiProvider: null,
        aiModel: null,
        aiPromptVersion: null,
        processedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      } as never,
      {
        organizationConstructionContext: [
          "Company Construction Context:",
          "",
          "The following is user-provided background context about this organization.",
          "",
          "We mostly price commercial interiors and suspended ceilings.",
        ].join("\n"),
      },
    );

    expect(prompts.userPrompt).toContain("Company Construction Context:");
    expect(prompts.userPrompt).toContain("We mostly price commercial interiors and suspended ceilings.");
    expect(prompts.userPrompt).toContain("Do not answer accounting questions.");
  });

  it("removes legacy taxonomy blobs from AI-visible prompt payloads", async () => {
    const { buildCostConstructionIntelligenceWorkerPrompts } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );

    const prompts = buildCostConstructionIntelligenceWorkerPrompts(
      {
        id: "event-legacy",
        idempotencyKey: "key-legacy",
        organizationId: "org-1",
        projectId: "project-1",
        sourceType: "cost_item",
        sourceId: "cost-item-1",
        sourceLineId: null,
        tradesstackCostCode: "100",
        tradesstackCostCodeLabel: "Materials",
        accountingMappingId: null,
        description: "Coloursteel cladding sheets",
        supplierId: null,
        supplierNameSnapshot: null,
        quantity: 12,
        unit: "sheet",
        rate: 18.5,
        amount: 222,
        documentContext: {
          module: "cost_items",
        },
        eventPayload: {
          rawDescription: "Coloursteel cladding sheets",
          finalClassification: { workType: "Structural steel", costType: "LAB" },
          originalClassification: { workType: "Structural steel", costType: "LAB" },
        },
        aiConstructionIntelligence: null,
        classificationStatus: "pending",
        classificationVersion: 2,
        aiProvider: null,
        aiModel: null,
        aiPromptVersion: null,
        processedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      } as never,
    );

    expect(prompts.userPrompt).toContain('"rawDescription": "Coloursteel cladding sheets"');
    expect(prompts.userPrompt).not.toContain("finalClassification");
    expect(prompts.userPrompt).not.toContain("originalClassification");
    expect(prompts.userPrompt).not.toContain('"tradeLabel":');
  });

  it("removes weak tradeLabel hints from AI-visible document context and payload", async () => {
    const { buildCostConstructionIntelligenceWorkerPrompts } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );

    const prompts = buildCostConstructionIntelligenceWorkerPrompts(
      {
        id: "event-hardie",
        idempotencyKey: "key-hardie",
        organizationId: "org-1",
        projectId: "project-1",
        sourceType: "cost_item",
        sourceId: "cost-item-hardie",
        sourceLineId: null,
        tradesstackCostCode: "100",
        tradesstackCostCodeLabel: "Materials",
        accountingMappingId: null,
        description: "100 x 25mm Hardieboard",
        supplierId: null,
        supplierNameSnapshot: null,
        quantity: 1100,
        unit: "LM",
        rate: 12,
        amount: 13200,
        documentContext: {
          module: "cost_items",
          tradeLabel: "Multilayer board flooring",
          category: "Materials",
          section: "Materials",
        },
        eventPayload: {
          tradeLabel: "Multilayer board flooring",
        },
        aiConstructionIntelligence: null,
        classificationStatus: "pending",
        classificationVersion: 2,
        aiProvider: null,
        aiModel: null,
        aiPromptVersion: null,
        processedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      } as never,
    );

    expect(prompts.userPrompt).not.toContain('"tradeLabel": "Multilayer board flooring"');
    expect(prompts.userPrompt).toContain('"category": "Materials"');
    expect(prompts.userPrompt).toContain('"upstreamTradeHint": "Multilayer board flooring"');
  });

  it("uses the shared provider registry instead of hardcoding OpenAI", async () => {
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    const generateEditPlan = vi.fn().mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      parsedJson: {
        trade: "Wall Linings",
        subtrade: "Plasterboard",
        work_package: "Internal Wall Linings",
        system: "Plasterboard Walls",
        assembly: "Steel Stud Wall",
        component: "Wall Lining Board",
        product_family: "Standard Plasterboard",
        product: "13mm GIB Standard",
        manufacturer: null,
        brand: "GIB",
        supplier: "Placemakers",
        activity: "Supply",
        install_method: null,
        application_area: "Internal partition walls",
        location_context: null,
        project_context: "Apartment fitout",
        likely_use: "Internal partition walls",
        related_components: ["Rondo 64mm Stud"],
        exclusions_or_risks: ["lead_time"],
        normalization_tokens: ["13mm GIB Board"],
        confidence: 0.9,
        reasoning: "Board wording is explicit.",
        evidence: ["13mm", "GIB"],
      },
    });
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      generateEditPlan,
    });
    const adminStub = buildAdminStub({
      claimedEvents: [buildClaimedEvent()],
      queueRows: [
        {
          event_id: "event-1",
          processing_status: "claimed",
          attempt_count: 1,
          max_attempts: 5,
          claim_token: "claim-1",
        },
      ],
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.admin);

    const { runCostConstructionIntelligenceWorker } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );
    const result = await runCostConstructionIntelligenceWorker({ limit: 1, now: "2026-06-21T01:00:00.000Z" });

    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(getPricingWorksheetAiProvider).toHaveBeenCalledWith("anthropic");
    expect(generateEditPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
      }),
    );
  });

  it("claims, classifies, updates source metadata, and finalizes completed work with V2 schema", async () => {
    const adminStub = buildAdminStub({
      claimedEvents: [buildClaimedEvent()],
      queueRows: [
        {
          event_id: "event-1",
          processing_status: "claimed",
          attempt_count: 1,
          max_attempts: 5,
          claim_token: "claim-1",
        },
      ],
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.admin);
    const generateEditPlan = vi.fn().mockResolvedValue({
      provider: "openai",
      model: "gpt-5.5",
      parsedJson: {
        trade: "Wall Linings",
        subtrade: "Plasterboard",
        work_package: "Internal Wall Linings",
        system: "Plasterboard Walls",
        assembly: "Steel Stud Wall",
        component: "Wall Lining Board",
        product_family: "Standard Plasterboard",
        product: "13mm GIB Standard",
        manufacturer: null,
        brand: "GIB",
        supplier: "Placemakers",
        activity: "Supply",
        install_method: null,
        application_area: "Internal partition walls",
        location_context: null,
        project_context: "Apartment fitout",
        likely_use: "Internal partition walls",
        related_components: ["Rondo 64mm Stud", "Track"],
        exclusions_or_risks: ["lead_time"],
        normalization_tokens: ["13mm GIB Board", "Wall Linings"],
        confidence: 0.88,
        reasoning: "Product wording is explicit.",
        evidence: ["13mm", "GIB Standard"],
      },
    });
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "openai",
      generateEditPlan,
    });

    const { runCostConstructionIntelligenceWorker } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );
    const result = await runCostConstructionIntelligenceWorker({ limit: 1, now: "2026-06-21T01:00:00.000Z" });

    expect(result).toMatchObject({
      claimedCount: 1,
      processedCount: 1,
      completedCount: 1,
      provider: "openai",
      model: "gpt-5.5",
    });

    expect(generateEditPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Never infer accounting codes"),
        systemPrompt: expect.stringContaining("You are a senior construction estimator and project manager."),
        userPrompt: expect.stringContaining('"sourceId": "material-1"'),
        schema: expect.objectContaining({
          required: expect.arrayContaining([
            "trade",
            "subtrade",
            "work_package",
            "system",
            "assembly",
            "component",
            "product_family",
            "product",
            "application_area",
            "normalization_tokens",
            "exclusions_or_risks",
          ]),
        }),
      }),
    );

    const materialUpdate = adminStub.updates.find((entry) => entry.table === "organization_materials");
    expect(materialUpdate?.values).toEqual({
      ai_construction_intelligence: expect.objectContaining({
        trade: "Wall Linings",
        subtrade: "Plasterboard",
        product: "13mm GIB Standard",
        provider: "openai",
        normalization: expect.objectContaining({
          productSignature: "13mm_gib_standard",
          constructionSignature: expect.stringContaining("wall_linings__plasterboard"),
        }),
      }),
    });
    expect(materialUpdate?.values).not.toHaveProperty("tradesstack_cost_code");
    expect(materialUpdate?.values).not.toHaveProperty("accounting_mapping_id");

    const eventUpdate = adminStub.updates.find(
      (entry) => entry.table === "cost_construction_intelligence_events",
    );
    expect(eventUpdate?.values).toMatchObject({
      classification_status: "completed",
      ai_provider: "openai",
      ai_model: "gpt-5.5",
      ai_prompt_version: 3,
    });
    expect(adminStub.finalizations[0]).toMatchObject({
      p_inputs: [expect.objectContaining({ eventId: "event-1", processingStatus: "completed" })],
    });
  });

  it("retries retryable provider failures without mutating routing fields", async () => {
    const adminStub = buildAdminStub({
      claimedEvents: [
        buildClaimedEvent({
          id: "event-2",
          source_type: "cost_item",
          source_id: "cost-item-1",
          tradesstack_cost_code: "300",
          tradesstack_cost_code_label: "Subcontractors",
          description: "Install wall framing package",
          document_context: { module: "cost_items" },
          event_payload: {},
        }),
      ],
      queueRows: [
        {
          event_id: "event-2",
          processing_status: "claimed",
          attempt_count: 1,
          max_attempts: 3,
          claim_token: "claim-2",
        },
      ],
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.admin);
    const providerError = Object.assign(new Error("Temporary provider failure"), {
      code: "provider_timeout",
      provider: "openai",
      model: "gpt-5.5",
      status: 504,
      retryable: true,
      rawError: null,
    });
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "openai",
      generateEditPlan: vi.fn().mockRejectedValue(providerError),
    });

    const { runCostConstructionIntelligenceWorker } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );
    const result = await runCostConstructionIntelligenceWorker({ limit: 1, now: "2026-06-21T01:00:00.000Z" });

    expect(result).toMatchObject({
      claimedCount: 1,
      processedCount: 1,
    });

    const eventUpdate = adminStub.updates.find(
      (entry) => entry.table === "cost_construction_intelligence_events",
    );
    expect(eventUpdate?.values).toMatchObject({
      classification_status: "retry_scheduled",
      error_code: "provider_timeout",
    });
    expect(adminStub.updates.some((entry) => entry.table === "cost_items")).toBe(false);
    expect(adminStub.finalizations[0]).toMatchObject({
      p_inputs: [expect.objectContaining({ eventId: "event-2", processingStatus: "retry_scheduled" })],
    });
  });

  it("rejects all-null construction output without updating source rows", async () => {
    const adminStub = buildAdminStub({
      claimedEvents: [
        buildClaimedEvent({
          id: "event-quality",
          source_type: "cost_item",
          source_id: "cost-item-quality",
          description: "13mm GIB Standard plasterboard sheets",
          document_context: { module: "cost_items" },
          event_payload: { rawDescription: "13mm GIB Standard plasterboard sheets" },
        }),
      ],
      queueRows: [
        {
          event_id: "event-quality",
          processing_status: "claimed",
          attempt_count: 1,
          max_attempts: 2,
          claim_token: "claim-quality",
        },
      ],
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.admin);
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "openai",
      generateEditPlan: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-5.5",
        parsedJson: {
          trade: null,
          subtrade: null,
          work_package: null,
          system: null,
          assembly: null,
          component: null,
          product_family: null,
          product: null,
          manufacturer: null,
          brand: null,
          supplier: null,
          activity: null,
          install_method: null,
          application_area: null,
          location_context: null,
          project_context: null,
          likely_use: null,
          related_components: [],
          exclusions_or_risks: [],
          normalization_tokens: [],
          confidence: null,
          reasoning: null,
          evidence: [],
        },
      }),
    });

    const { runCostConstructionIntelligenceWorker } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );
    const result = await runCostConstructionIntelligenceWorker({ limit: 1, now: "2026-06-21T01:00:00.000Z" });

    expect(result.processedCount).toBe(1);
    expect(adminStub.updates.some((entry) => entry.table === "cost_items")).toBe(false);
    const eventUpdate = adminStub.updates.find(
      (entry) => entry.table === "cost_construction_intelligence_events",
    );
    expect(eventUpdate?.values).toMatchObject({
      classification_status: "dead_lettered",
      error_code: "quality_failed_all_core_fields_null",
    });
    expect(adminStub.finalizations[0]).toMatchObject({
      p_inputs: [expect.objectContaining({ eventId: "event-quality", processingStatus: "dead_lettered" })],
    });
  });

  it("reuses a completed duplicate material snapshot instead of dead-lettering a duplicate event", async () => {
    const priorSnapshot = {
      trade: "Wall Linings",
      subtrade: "Plasterboard",
      work_package: "Internal Wall Linings",
      system: "Plasterboard Walls",
      assembly: "Steel Stud Wall",
      component: "Wall Lining Board",
      product_family: "Standard Plasterboard",
      product: "13mm GIB Standard",
      manufacturer: null,
      brand: "GIB",
      supplier: "Placemakers",
      activity: "Supply",
      install_method: null,
      application_area: "Internal partition walls",
      location_context: null,
      project_context: "Apartment fitout",
      likely_use: "Internal partition walls",
      related_components: ["Rondo 64mm Stud"],
      exclusions_or_risks: ["lead_time"],
      normalization_tokens: ["13mm GIB Board"],
      confidence: 0.9,
      reasoning: "Board wording is explicit.",
      evidence: ["13mm", "GIB"],
      classificationVersion: 2,
      promptVersion: 3,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      classifiedAt: "2026-06-21T00:30:00.000Z",
      sourceType: "organization_material",
      sourceEventId: "prior-event",
      documentContext: {
        module: "materials",
      },
      normalization: {
        tokens: ["13mm_gib_board"],
        productSignature: "13mm_gib_standard",
        constructionSignature: "wall_linings__plasterboard__plasterboard_walls",
        groupingKeys: ["wall_linings_plasterboard_walls"],
      },
    };

    const adminStub = buildAdminStub({
      claimedEvents: [buildClaimedEvent({ id: "event-duplicate", source_id: "material-duplicate" })],
      queueRows: [
        {
          event_id: "event-duplicate",
          processing_status: "claimed",
          attempt_count: 1,
          max_attempts: 5,
          claim_token: "claim-duplicate",
        },
      ],
      duplicateCompletedRows: [
        {
          ai_construction_intelligence: priorSnapshot,
          ai_provider: "anthropic",
          ai_model: "claude-sonnet-4-6",
        },
      ],
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.admin);
    const generateEditPlan = vi.fn();
    getPricingWorksheetAiProviderName.mockReturnValue("anthropic");
    getPricingWorksheetAnthropicModel.mockReturnValue("claude-sonnet-4-6");
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "anthropic",
      generateEditPlan,
    });

    const { runCostConstructionIntelligenceWorker } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );
    const result = await runCostConstructionIntelligenceWorker({ limit: 1, now: "2026-06-21T01:00:00.000Z" });

    expect(result).toMatchObject({
      claimedCount: 1,
      processedCount: 1,
      completedCount: 1,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(generateEditPlan).not.toHaveBeenCalled();
    const materialUpdate = adminStub.updates.find((entry) => entry.table === "organization_materials");
    expect(materialUpdate?.values).toEqual({
      ai_construction_intelligence: expect.objectContaining({
        trade: "Wall Linings",
        product: "13mm GIB Standard",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        sourceEventId: "event-duplicate",
      }),
    });
    const eventUpdate = adminStub.updates.find(
      (entry) => entry.table === "cost_construction_intelligence_events",
    );
    expect(eventUpdate?.values).toMatchObject({
      classification_status: "completed",
      ai_provider: "anthropic",
      ai_model: "claude-sonnet-4-6",
      error_code: null,
    });
  });

  it("keeps construction classifications metadata-only across representative commercial examples", async () => {
    const examples = [
      {
        id: "event-gib",
        tradesstack_cost_code: "100",
        tradesstack_cost_code_label: "Materials",
        description: "13mm GIB plasterboard sheets",
        parsedJson: {
          trade: "Wall Linings",
          subtrade: "Plasterboard",
          work_package: "Internal Wall Linings",
          system: "Plasterboard Walls",
          assembly: "Steel Stud Wall",
          component: "Wall Lining Board",
          product_family: "Standard Plasterboard",
          product: "13mm GIB Standard",
          manufacturer: null,
          brand: "GIB",
          supplier: "Placemakers",
          activity: "Supply",
          install_method: null,
          application_area: "Internal partition walls",
          location_context: null,
          project_context: null,
          likely_use: "Internal partition walls",
          related_components: ["Rondo 64mm Stud"],
          exclusions_or_risks: ["lead_time"],
          normalization_tokens: ["13mm GIB Board"],
          confidence: 0.91,
          reasoning: "Explicit board wording.",
          evidence: ["13mm", "GIB"],
        },
      },
      {
        id: "event-coloursteel",
        tradesstack_cost_code: "100",
        tradesstack_cost_code_label: "Materials",
        description: "Coloursteel cladding",
        parsedJson: {
          trade: "Cladding",
          subtrade: "Metal Cladding",
          work_package: "External Cladding",
          system: "Metal Cladding",
          assembly: "Facade Cladding Build-Up",
          component: "Cladding Sheet",
          product_family: "Profiled Steel Cladding",
          product: "Coloursteel cladding",
          manufacturer: "New Zealand Steel",
          brand: "Coloursteel",
          supplier: null,
          activity: "Supply",
          install_method: "screw-fixed",
          application_area: "External walls",
          location_context: null,
          project_context: null,
          likely_use: "Facade cladding",
          related_components: [],
          exclusions_or_risks: ["lead_time"],
          normalization_tokens: ["Coloursteel Cladding"],
          confidence: 0.86,
          reasoning: "Brand wording is explicit.",
          evidence: ["Coloursteel"],
        },
      },
      {
        id: "event-scaffold",
        tradesstack_cost_code: "400",
        tradesstack_cost_code_label: "Plant & Equipment",
        description: "scaffold hire",
        parsedJson: {
          trade: "Access Systems",
          subtrade: "Scaffolding",
          work_package: "Temporary Access",
          system: "Scaffolding Access",
          assembly: "Perimeter Scaffold",
          component: "Scaffold Hire",
          product_family: "Temporary Access Equipment",
          product: "scaffold hire",
          manufacturer: null,
          brand: null,
          supplier: "Safe Access",
          activity: "Hire",
          install_method: null,
          application_area: "Site perimeter",
          location_context: null,
          project_context: null,
          likely_use: "Temporary access",
          related_components: [],
          exclusions_or_risks: ["access_dependency"],
          normalization_tokens: ["Scaffold Hire"],
          confidence: 0.78,
          reasoning: "Hire wording is explicit.",
          evidence: ["scaffold", "hire"],
        },
      },
      {
        id: "event-claim",
        tradesstack_cost_code: "600",
        tradesstack_cost_code_label: "Payment Claims",
        description: "payment claim",
        parsedJson: {
          trade: null,
          subtrade: null,
          work_package: null,
          system: null,
          assembly: null,
          component: "Claim",
          product_family: null,
          product: "payment claim",
          manufacturer: null,
          brand: null,
          supplier: null,
          activity: "Claim",
          install_method: null,
          application_area: null,
          location_context: null,
          project_context: null,
          likely_use: null,
          related_components: [],
          exclusions_or_risks: ["cash_flow"],
          normalization_tokens: ["Payment Claim"],
          confidence: 0.74,
          reasoning: "Claim workflow wording is explicit.",
          evidence: ["payment claim"],
        },
      },
      {
        id: "event-hardie",
        tradesstack_cost_code: "100",
        tradesstack_cost_code_label: "Materials",
        description: "100 x 25mm Hardieboard",
        parsedJson: {
          trade: "Cladding",
          subtrade: "Fibre Cement Cladding",
          work_package: "External Cladding",
          system: "Fibre Cement Cladding or Lining Board",
          assembly: "Fibre Cement Board Build-Up",
          component: "Fibre cement board",
          product_family: "Hardie fibre cement board",
          product: "100 x 25mm Hardieboard",
          manufacturer: "James Hardie",
          brand: "Hardieboard",
          supplier: "Unknown",
          activity: "Supply",
          install_method: "Unknown",
          application_area: "Exterior wall cladding or lining",
          location_context: "Unknown",
          project_context: "Unknown",
          likely_use: "Fibre cement board for external cladding or lining; exact assembly needs confirmation",
          related_components: ["Cavity batten", "Fixings"],
          exclusions_or_risks: ["profile confirmation needed"],
          normalization_tokens: ["Hardieboard", "100 x 25mm"],
          confidence: 0.83,
          reasoning: "Product wording is stronger than the weak upstream trade hint.",
          evidence: ["Hardieboard", "100 x 25mm"],
        },
      },
    ] as const;

    const adminStub = buildAdminStub({
      claimedEvents: examples.map((example) =>
        buildClaimedEvent({
          id: example.id,
          source_type: "cost_item",
          source_id: example.id.replace("event-", "cost-item-"),
          tradesstack_cost_code: example.tradesstack_cost_code,
          tradesstack_cost_code_label: example.tradesstack_cost_code_label,
          description: example.description,
          document_context: { module: "cost_items" },
          event_payload: {},
          classification_version: 2,
        }),
      ),
      queueRows: examples.map((example) => ({
        event_id: example.id,
        processing_status: "claimed",
        attempt_count: 1,
        max_attempts: 5,
        claim_token: `claim-${example.id}`,
      })),
    });
    createAdminSupabaseClient.mockReturnValue(adminStub.admin);
    const generateEditPlan = vi
      .fn()
      .mockImplementation(async ({ userPrompt }: { userPrompt: string }) => {
        const matched = examples.find((example) => userPrompt.includes(example.description));
        if (!matched) {
          throw new Error("Unexpected example prompt.");
        }

        return {
          provider: "openai",
          model: "gpt-5.5",
          parsedJson: matched.parsedJson,
        };
      });
    getPricingWorksheetAiProvider.mockReturnValue({
      name: "openai",
      generateEditPlan,
    });

    const { runCostConstructionIntelligenceWorker } = await import(
      "@/lib/cost-construction-intelligence-outbox"
    );
    const result = await runCostConstructionIntelligenceWorker({ limit: examples.length, now: "2026-06-21T01:00:00.000Z" });

    expect(result.claimedCount).toBe(examples.length);
    expect(result.processedCount).toBe(examples.length);
    expect(adminStub.updates.filter((entry) => entry.table === "cost_items")).toHaveLength(examples.length);
    for (const update of adminStub.updates.filter((entry) => entry.table === "cost_items")) {
      expect(update.values).toEqual({
        ai_construction_intelligence: expect.objectContaining({
          provider: "openai",
          model: "gpt-5.5",
          normalization: expect.objectContaining({
            constructionSignature: expect.any(String),
          }),
        }),
      });
      expect(update.values).not.toHaveProperty("tradesstack_cost_code");
      expect(update.values).not.toHaveProperty("accounting_mapping_id");
    }
  });
});
