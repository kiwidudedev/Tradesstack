import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    trade: "interiors",
    subtrade: "partitions",
    work_package: "walls",
    system: "plasterboard wall",
    assembly: "internal partition",
    component: "sheet",
    product_family: "plasterboard",
    product: "13mm GIB Standard",
    manufacturer: "Winstone Wallboards",
    brand: "GIB",
    supplier: "PlaceMakers",
    activity: "supply",
    install_method: null,
    application_area: "walls",
    location_context: "interior",
    project_context: "fitout",
    likely_use: "wall lining",
    related_components: [],
    exclusions_or_risks: [],
    normalization_tokens: ["gib", "13mm", "wall"],
    confidence: 0.81,
    reasoning: "Repeated purchasing pattern.",
    evidence: ["invoice"],
    classificationVersion: 1,
    promptVersion: 1,
    provider: "anthropic",
    model: "claude-test",
    classifiedAt: "2026-06-21T00:00:00.000Z",
    sourceType: "cost_item",
    sourceEventId: "event-1",
    documentContext: {},
    normalization: {
      tokens: ["gib", "13mm", "wall"],
      productSignature: "gib_standard_13",
      constructionSignature: "interiors__plasterboard_wall__gib_standard_13",
      groupingKeys: [],
    },
    ...overrides,
  };
}

function createEvent(overrides: Record<string, unknown> = {}) {
  const eventId = typeof overrides.id === "string" ? overrides.id : "event-1";
  const supplierNameSnapshot =
    typeof overrides.supplierNameSnapshot === "string"
      ? overrides.supplierNameSnapshot
      : "PlaceMakers";

  return {
    id: eventId,
    organizationId: "org-1",
    projectId: "project-1",
    supplierNameSnapshot,
    description: "13mm GIB Standard",
    quantity: 100,
    unit: "m2",
    rate: 24,
    amount: 2400,
    documentContext: {},
    classificationStatus: "completed",
    processedAt: "2026-06-21T00:00:00.000Z",
    createdAt: "2026-06-21T00:00:00.000Z",
    aiConstructionIntelligence: createSnapshot({
      sourceEventId: eventId,
      supplier: supplierNameSnapshot,
    }),
    ...overrides,
  };
}

describe("buildConstructionMemoryEvidencePools", () => {
  it("limits one material event to a few decision-candidate pools", async () => {
    const { buildConstructionMemoryEvidencePools } = await import("./construction-memory-evidence-pools");

    const pools = buildConstructionMemoryEvidencePools([createEvent()]);

    expect(pools).toHaveLength(3);
    expect(pools.map((pool) => pool.poolKind).sort()).toEqual([
      "procurement_preference",
      "product_system",
      "supplier_preference",
    ]);
  });

  it("limits one labour install event to a few decision-candidate pools", async () => {
    const { buildConstructionMemoryEvidencePools } = await import("./construction-memory-evidence-pools");

    const pools = buildConstructionMemoryEvidencePools([
      createEvent({
        supplierNameSnapshot: null,
        quantity: 18,
        unit: "hours",
        rate: null,
        amount: 1980,
        description: "Install Hardieboard cladding",
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          supplier: null,
          trade: null,
          subtrade: null,
          work_package: "cladding",
          system: "fibre cement cladding",
          assembly: "external wall cladding",
          component: "sheet",
          product_family: "cladding",
          product: "Hardieboard",
          manufacturer: "James Hardie",
          brand: "Hardie",
          activity: "install",
          install_method: "screw fix",
          project_context: "housing",
          likely_use: "exterior wall cladding",
          normalization: {
            tokens: ["hardieboard", "cladding"],
            productSignature: "hardieboard",
            constructionSignature: "fibre_cement_cladding__hardieboard",
            groupingKeys: [],
          },
        }),
      }),
    ]);

    expect(pools).toHaveLength(3);
    expect(pools.map((pool) => pool.poolKind).sort()).toEqual([
      "install_method",
      "product_system",
      "productivity",
    ]);
  });

  it("does not create construction decision pools for payment claims without real construction context", async () => {
    const { buildConstructionMemoryEvidencePools } = await import("./construction-memory-evidence-pools");

    const pools = buildConstructionMemoryEvidencePools([
      createEvent({
        supplierNameSnapshot: null,
        description: "Payment claim 3",
        quantity: 1,
        unit: "ea",
        rate: 1000,
        amount: 1000,
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          trade: "unknown",
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
          activity: "payment claim",
          install_method: null,
          project_context: "payment claim",
          likely_use: "claim line",
          normalization: {
            tokens: ["payment", "claim"],
            productSignature: null,
            constructionSignature: null,
            groupingKeys: [],
          },
        }),
      }),
    ]);

    expect(pools).toHaveLength(0);
  });

  it("only creates supplier preference when supplier and product or system context exist", async () => {
    const { buildConstructionMemoryEvidencePools } = await import("./construction-memory-evidence-pools");

    const pools = buildConstructionMemoryEvidencePools([
      createEvent({
        supplierNameSnapshot: "PlaceMakers",
        description: "Supplier statement",
        quantity: 1,
        unit: "ea",
        rate: null,
        amount: 0,
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          trade: "unknown",
          subtrade: null,
          work_package: null,
          system: null,
          assembly: null,
          component: null,
          product_family: null,
          product: null,
          manufacturer: null,
          brand: null,
          supplier: "PlaceMakers",
          activity: "supply",
          likely_use: null,
          normalization: {
            tokens: ["placemakers"],
            productSignature: null,
            constructionSignature: null,
            groupingKeys: [],
          },
        }),
      }),
    ]);

    expect(pools).toHaveLength(0);
    expect(pools.some((pool) => pool.poolKind === "supplier_preference")).toBe(false);
  });

  it("requires meaningful context before creating pricing or productivity pools", async () => {
    const { buildConstructionMemoryEvidencePools } = await import("./construction-memory-evidence-pools");

    const weakPricingPools = buildConstructionMemoryEvidencePools([
      createEvent({
        supplierNameSnapshot: null,
        unit: "m2",
        rate: 24,
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          trade: "unknown",
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
          activity: "supply",
          normalization: {
            tokens: ["rate"],
            productSignature: null,
            constructionSignature: null,
            groupingKeys: [],
          },
        }),
      }),
    ]);

    const meaningfulPricingPools = buildConstructionMemoryEvidencePools([
      createEvent({
        supplierNameSnapshot: null,
        projectId: "project-1",
        rate: 24,
        unit: "m2",
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          supplier: null,
          trade: null,
          subtrade: null,
          activity: "supply",
        }),
      }),
      createEvent({
        id: "event-2",
        supplierNameSnapshot: null,
        projectId: "project-2",
        processedAt: "2026-06-22T00:00:00.000Z",
        createdAt: "2026-06-22T00:00:00.000Z",
        rate: 25.5,
        unit: "m2",
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-2",
          supplier: null,
          trade: null,
          subtrade: null,
          activity: "supply",
        }),
      }),
    ]);

    const weakProductivityPools = buildConstructionMemoryEvidencePools([
      createEvent({
        supplierNameSnapshot: null,
        quantity: 10,
        unit: "ea",
        rate: null,
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          supplier: null,
          trade: null,
          subtrade: null,
          activity: "install",
          install_method: "screw fix",
        }),
      }),
    ]);

    const meaningfulProductivityPools = buildConstructionMemoryEvidencePools([
      createEvent({
        supplierNameSnapshot: null,
        projectId: "project-1",
        quantity: 18,
        unit: "hours",
        rate: null,
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          supplier: null,
          trade: null,
          subtrade: null,
          activity: "install",
          install_method: "screw fix",
        }),
      }),
      createEvent({
        id: "event-2",
        supplierNameSnapshot: null,
        projectId: "project-2",
        quantity: 20,
        unit: "hours",
        rate: null,
        processedAt: "2026-06-22T00:00:00.000Z",
        createdAt: "2026-06-22T00:00:00.000Z",
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-2",
          supplier: null,
          trade: null,
          subtrade: null,
          activity: "install",
          install_method: "screw fix",
        }),
      }),
    ]);

    expect(weakPricingPools.some((pool) => pool.poolKind === "pricing")).toBe(false);
    expect(meaningfulPricingPools.some((pool) => pool.poolKind === "pricing")).toBe(true);
    expect(weakProductivityPools.some((pool) => pool.poolKind === "productivity")).toBe(false);
    expect(meaningfulProductivityPools.some((pool) => pool.poolKind === "productivity")).toBe(true);
  });

  it("does not create null or weak signature pools", async () => {
    const { buildConstructionMemoryEvidencePools } = await import("./construction-memory-evidence-pools");

    const pools = buildConstructionMemoryEvidencePools([
      createEvent({
        supplierNameSnapshot: null,
        description: "Misc item",
        quantity: 1,
        unit: "ea",
        rate: null,
        amount: 100,
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          trade: "other",
          subtrade: null,
          work_package: "misc",
          system: "unknown",
          assembly: null,
          component: "generic",
          product_family: "other",
          product: "misc",
          manufacturer: null,
          brand: null,
          supplier: null,
          activity: "supply",
          likely_use: null,
          normalization: {
            tokens: ["misc"],
            productSignature: null,
            constructionSignature: null,
            groupingKeys: [],
          },
        }),
      }),
    ]);

    expect(pools).toHaveLength(0);
  });

  it("keeps repeated GIB and Rondo decisions eligible for downstream semantic and synthesis stages", async () => {
    const { buildConstructionMemoryEvidencePools } = await import("./construction-memory-evidence-pools");

    const pools = buildConstructionMemoryEvidencePools([
      createEvent({
        id: "event-1",
        projectId: "project-1",
        processedAt: "2026-06-21T00:00:00.000Z",
        createdAt: "2026-06-21T00:00:00.000Z",
        description: "13mm GIB Standard",
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-1",
          product: "13mm GIB Standard",
          system: "plasterboard wall",
          trade: "interiors",
          supplier: "PlaceMakers",
          activity: "supply",
          normalization: {
            tokens: ["gib", "13mm", "wall"],
            productSignature: "gib_standard_13",
            constructionSignature: "interiors__plasterboard_wall__gib_standard_13",
            groupingKeys: [],
          },
        }),
      }),
      createEvent({
        id: "event-2",
        projectId: "project-2",
        processedAt: "2026-06-22T00:00:00.000Z",
        createdAt: "2026-06-22T00:00:00.000Z",
        description: "GIB Standard 13",
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-2",
          product: "GIB Standard 13",
          system: "plasterboard wall",
          trade: "interiors",
          supplier: "PlaceMakers",
          activity: "supply",
          normalization: {
            tokens: ["gib", "13mm", "wall"],
            productSignature: "gib_standard_13",
            constructionSignature: "interiors__plasterboard_wall__gib_standard_13",
            groupingKeys: [],
          },
        }),
      }),
      createEvent({
        id: "event-3",
        projectId: "project-3",
        processedAt: "2026-06-23T00:00:00.000Z",
        createdAt: "2026-06-23T00:00:00.000Z",
        description: "Rondo Keylock Grid",
        supplierNameSnapshot: "PlaceMakers",
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-3",
          trade: "ceilings",
          subtrade: "suspended ceilings",
          work_package: "ceiling",
          system: "suspended ceiling",
          assembly: "keylock grid ceiling",
          component: "grid",
          product_family: "ceiling grid",
          product: "Rondo Keylock Grid",
          manufacturer: "Rondo",
          brand: "Rondo",
          supplier: "PlaceMakers",
          activity: "supply",
          project_context: "commercial fitout",
          likely_use: "suspended ceiling grid",
          normalization: {
            tokens: ["rondo", "keylock", "grid"],
            productSignature: "rondo_keylock_grid",
            constructionSignature: "ceilings__suspended_ceiling__rondo_keylock_grid",
            groupingKeys: [],
          },
        }),
      }),
      createEvent({
        id: "event-4",
        projectId: "project-4",
        processedAt: "2026-06-24T00:00:00.000Z",
        createdAt: "2026-06-24T00:00:00.000Z",
        description: "24mm Keylock Grid",
        supplierNameSnapshot: "PlaceMakers",
        aiConstructionIntelligence: createSnapshot({
          sourceEventId: "event-4",
          trade: "ceilings",
          subtrade: "suspended ceilings",
          work_package: "ceiling",
          system: "suspended ceiling",
          assembly: "keylock grid ceiling",
          component: "grid",
          product_family: "ceiling grid",
          product: "24mm Keylock Grid",
          manufacturer: "Rondo",
          brand: "Rondo",
          supplier: "PlaceMakers",
          activity: "supply",
          project_context: "commercial fitout",
          likely_use: "suspended ceiling grid",
          normalization: {
            tokens: ["rondo", "keylock", "grid"],
            productSignature: "rondo_keylock_grid",
            constructionSignature: "ceilings__suspended_ceiling__rondo_keylock_grid",
            groupingKeys: [],
          },
        }),
      }),
    ]);

    const semanticReadyPools = pools.filter((pool) =>
      ["supplier_preference", "product_system", "procurement_preference"].includes(pool.poolKind),
    );

    expect(semanticReadyPools.length).toBeGreaterThanOrEqual(4);
    expect(semanticReadyPools.every((pool) => typeof pool.semanticSeedSignature === "string")).toBe(true);
    expect(pools.some((pool) => pool.poolKind === "supplier_preference")).toBe(true);
    expect(pools.some((pool) => pool.poolKind === "product_system")).toBe(true);
    expect(pools.some((pool) => pool.poolKind === "construction_signature")).toBe(false);
  });
});
