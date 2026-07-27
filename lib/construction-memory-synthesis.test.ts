import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions-server", () => ({
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

describe("construction memory synthesis", () => {
  it("derives supplier preference candidates", async () => {
    const { constructionMemorySynthesisTestUtils } = await import("./construction-memory-synthesis");

    const candidate = constructionMemorySynthesisTestUtils.buildCandidate({
      id: "pool-1",
      organizationId: "org-1",
      semanticSignature: "semantic-1",
      semanticFamily: "gib_standard_13",
      semanticType: "supplier_preference",
      maturityStatus: "durable",
      title: "13mm GIB Standard from PlaceMakers",
      summary: "Repeated supplier choice.",
      scopePayload: { trade: "interiors", system: "plasterboard wall", projectContext: "apartment" },
      poolValuePayload: { supplier: "PlaceMakers", product: "13mm GIB Standard", productSignature: "gib_standard_13" },
      evidenceSummary: { supportingEventIds: ["event-1", "event-2"] },
      supportCount: 2,
      contradictionCount: 0,
      eventCount: 2,
      projectCount: 2,
      supplierCount: 1,
      averageConfidence: 0.84,
      sourceRevisionHash: "rev-1",
      sourceEventIds: ["event-1", "event-2"],
    });

    expect(candidate?.memoryType).toBe("supplier_preference_pattern");
    expect(candidate?.summary).toContain("commonly buys");
  });

  it("calculates higher confidence for repeated cross-project evidence", async () => {
    const { constructionMemorySynthesisTestUtils } = await import("./construction-memory-synthesis");

    const confidence = constructionMemorySynthesisTestUtils.computeConfidence({
      id: "pool-1",
      organizationId: "org-1",
      semanticSignature: "semantic-1",
      semanticFamily: "gib_standard_13",
      semanticType: "supplier_preference",
      maturityStatus: "durable",
      title: "13mm GIB Standard from PlaceMakers",
      summary: "Repeated supplier choice.",
      scopePayload: {},
      poolValuePayload: {},
      evidenceSummary: {},
      supportCount: 5,
      contradictionCount: 0,
      eventCount: 5,
      projectCount: 3,
      supplierCount: 1,
      averageConfidence: 0.82,
      sourceRevisionHash: "rev-1",
      sourceEventIds: ["event-1", "event-2", "event-3", "event-4", "event-5"],
    });

    expect(confidence).toBeGreaterThan(0.75);
  });

  it("does not create pricing memory from single-project repetition alone", async () => {
    const { constructionMemorySynthesisTestUtils } = await import("./construction-memory-synthesis");

    const candidate = constructionMemorySynthesisTestUtils.buildCandidate({
      id: "pool-1",
      organizationId: "org-1",
      semanticSignature: "semantic-1",
      semanticFamily: "gib_standard_13",
      semanticType: "pricing",
      maturityStatus: "ready_for_synthesis",
      title: "pricing",
      summary: "Repeated rate observations.",
      scopePayload: { trade: "interiors", system: "plasterboard wall" },
      poolValuePayload: { product: "13mm GIB Standard", productSignature: "gib_standard_13", unit: "m2" },
      evidenceSummary: { supportingEventIds: ["event-1", "event-2"], evidencePoolIds: ["pool-sig-1"] },
      supportCount: 2,
      contradictionCount: 0,
      eventCount: 2,
      projectCount: 1,
      supplierCount: 1,
      averageConfidence: 0.84,
      sourceRevisionHash: "rev-1",
      sourceEventIds: ["event-1", "event-2"],
    });

    expect(candidate).toBeNull();
  });

  it("does not reference routing, accounting, export, reporting, or posting surfaces", () => {
    const files = [
      "lib/construction-memory-evidence-pools.ts",
      "lib/construction-memory-semantic-pools.ts",
      "lib/construction-memory-synthesis.ts",
    ];
    const contents = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(contents).not.toMatch(/organization_tradesstack_accounting_mappings/);
    expect(contents).not.toMatch(/\bfinancial routing\b/i);
    expect(contents).not.toMatch(/\bposting\b/i);
    expect(contents).not.toMatch(/\breporting\b/i);
    expect(contents).not.toMatch(/organization_memory_exports?/i);
  });

  it("writes construction raw-event provenance through source_entity fields instead of source_event_id", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const select = vi.fn(() => ({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn(async () => ({ data: [], error: null })),
        }),
      }),
    }));
    const deleteBuilder = {
      in: vi.fn(async () => ({ error: null })),
    };

    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      from: (table: string) => {
        if (table === "organization_memory_links") {
          return {
            upsert,
            select,
            delete: () => deleteBuilder,
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as never);

    const { constructionMemorySynthesisTestUtils } = await import("./construction-memory-synthesis");

    await constructionMemorySynthesisTestUtils.insertProvenanceLinks({
      organizationId: "org-1",
      memoryId: "memory-1",
      semanticPoolId: "semantic-1",
      evidencePoolIds: ["evidence-1"],
      sourceEventIds: ["construction-event-1", "construction-event-2"],
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = upsert.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      onConflict: "organization_memory_item_id,source_entity_type,source_entity_id,link_type",
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_entity_type: "cost_construction_intelligence_event",
          source_entity_id: "construction-event-1",
          source_event_id: null,
        }),
        expect.objectContaining({
          source_entity_type: "cost_construction_intelligence_event",
          source_entity_id: "construction-event-2",
          source_event_id: null,
        }),
      ]),
    );
  });
});
