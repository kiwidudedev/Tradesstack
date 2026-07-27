import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

describe("buildConstructionMemorySemanticPools", () => {
  it("groups alias evidence pools into one semantic pool", async () => {
    const { buildConstructionMemorySemanticPools } = await import("./construction-memory-semantic-pools");

    const evidencePools = [
      {
        organizationId: "org-1",
        poolSignature: "pool-1",
        scopeSignature: "scope-1",
        targetSignature: "target-1",
        semanticSeedSignature: "gib_standard_13",
        poolKind: "product_preference",
        scopeContext: { trade: "interiors", system: "plasterboard wall" },
        targetContext: { productSignature: "gib_standard_13", product: "13mm GIB Standard" },
        evidenceCount: 2,
        eventCount: 2,
        projectCount: 2,
        supplierCount: 1,
        supportCount: 2,
        contradictionCount: 0,
        averageConfidence: 0.82,
        firstSeenAt: "2026-06-21T00:00:00.000Z",
        lastSeenAt: "2026-06-22T00:00:00.000Z",
        supportingEventIds: ["event-1", "event-2"],
        poolRevisionHash: "rev-1",
        maturityStatus: "ready_for_synthesis",
        linkedEvents: [],
      },
      {
        organizationId: "org-1",
        poolSignature: "pool-2",
        scopeSignature: "scope-2",
        targetSignature: "target-2",
        semanticSeedSignature: "gib_standard_13",
        poolKind: "product_preference",
        scopeContext: { trade: "interiors", system: "plasterboard wall" },
        targetContext: { productSignature: "gib_standard_13", product: "GIB Standard 13" },
        evidenceCount: 2,
        eventCount: 2,
        projectCount: 2,
        supplierCount: 1,
        supportCount: 2,
        contradictionCount: 0,
        averageConfidence: 0.84,
        firstSeenAt: "2026-06-23T00:00:00.000Z",
        lastSeenAt: "2026-06-24T00:00:00.000Z",
        supportingEventIds: ["event-3", "event-4"],
        poolRevisionHash: "rev-2",
        maturityStatus: "ready_for_synthesis",
        linkedEvents: [],
      },
    ];

    const semanticPools = buildConstructionMemorySemanticPools(evidencePools);

    expect(semanticPools).toHaveLength(1);
    expect(semanticPools[0]?.eventCount).toBe(4);
    expect(semanticPools[0]?.title).toContain("GIB");
    expect(semanticPools[0]?.maturityStatus).toBe("ready_for_synthesis");
  });

  it("does not split semantic pools purely because project context wording differs", async () => {
    const { buildConstructionMemorySemanticPools } = await import("./construction-memory-semantic-pools");

    const evidencePools = [
      {
        organizationId: "org-1",
        poolSignature: "pool-1",
        scopeSignature: "scope-1",
        targetSignature: "target-1",
        semanticSeedSignature: "rondo_keylock_grid",
        poolKind: "product_system",
        scopeContext: { trade: "ceilings", system: "suspended ceiling", projectContext: "fitout" },
        targetContext: { productSignature: "rondo_keylock_grid", product: "Rondo Keylock Grid", system: "suspended ceiling" },
        evidenceCount: 2,
        eventCount: 2,
        projectCount: 2,
        supplierCount: 1,
        supportCount: 2,
        contradictionCount: 0,
        averageConfidence: 0.82,
        firstSeenAt: "2026-06-21T00:00:00.000Z",
        lastSeenAt: "2026-06-22T00:00:00.000Z",
        supportingEventIds: ["event-1", "event-2"],
        poolRevisionHash: "rev-1",
        maturityStatus: "ready_for_synthesis",
        linkedEvents: [],
      },
      {
        organizationId: "org-1",
        poolSignature: "pool-2",
        scopeSignature: "scope-2",
        targetSignature: "target-2",
        semanticSeedSignature: "rondo_keylock_grid",
        poolKind: "product_system",
        scopeContext: { trade: "ceilings", system: "suspended ceiling", projectContext: "office fitout" },
        targetContext: { productSignature: "rondo_keylock_grid", product: "24mm Keylock Grid", system: "suspended ceiling" },
        evidenceCount: 2,
        eventCount: 2,
        projectCount: 2,
        supplierCount: 1,
        supportCount: 2,
        contradictionCount: 0,
        averageConfidence: 0.84,
        firstSeenAt: "2026-06-23T00:00:00.000Z",
        lastSeenAt: "2026-06-24T00:00:00.000Z",
        supportingEventIds: ["event-3", "event-4"],
        poolRevisionHash: "rev-2",
        maturityStatus: "ready_for_synthesis",
        linkedEvents: [],
      },
    ];

    const semanticPools = buildConstructionMemorySemanticPools(evidencePools);
    expect(semanticPools).toHaveLength(1);
    expect(semanticPools[0]?.eventCount).toBe(4);
  });
});
