import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSupplierBillTestRecord } from "@/lib/universal-learning/__test-utils__/supplier-bill";

const createDynamicAdminSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/universal-learning/supabase-dynamic-client", () => ({
  createDynamicAdminSupabaseClient,
}));

function queryResult(data: Record<string, unknown> | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
  };
  return query;
}

describe("Supplier Bill UCL exact internal retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function configure(overrides: {
    current?: Record<string, unknown>;
    version?: Record<string, unknown>;
  } = {}) {
    const record = buildSupplierBillTestRecord();
    const {
      buildSupplierBillStoredPayloadIntegrityHash,
      buildSupplierBillVisibilityScope,
    } = await import("./supplier-bill-container-store");
    const scope = buildSupplierBillVisibilityScope(record);
    const current = {
      organization_id: record.organizationId,
      container_type: "supplier_invoice",
      source_id: record.source.sourceId,
      current_version_id: "version-1",
      schema_version: "supplier_bill.v2",
      builder_version: record.payload.provenance.builderVersion,
      content_hash: record.payload.provenance.contentHash,
      context_status: "current",
      validated_at: "2026-07-28T02:00:00.000Z",
      visibility_scope_hash: scope.visibilityScopeHash,
      deleted_at: null,
      ...overrides.current,
    };
    const version = {
      id: "version-1",
      organization_id: record.organizationId,
      container_type: "supplier_invoice",
      source_id: record.source.sourceId,
      schema_version: "supplier_bill.v2",
      builder_version: record.payload.provenance.builderVersion,
      content_hash: record.payload.provenance.contentHash,
      payload_integrity_hash: buildSupplierBillStoredPayloadIntegrityHash(record),
      canonical_updated_at: record.payload.provenance.canonicalRecordUpdatedAt,
      latest_dependency_updated_at: record.payload.provenance.latestDependencyUpdatedAt,
      assembled_at: record.payload.provenance.assembledAt,
      validated_at: "2026-07-28T02:00:00.000Z",
      payload_bytes: JSON.stringify(record).length,
      payload_json: record,
      visibility_scope_hash: scope.visibilityScopeHash,
      context_status: "current",
      ...overrides.version,
    };
    createDynamicAdminSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => (
        table === "supplier_bill_ucl_current_state"
          ? queryResult(current)
          : queryResult(version)
      )),
    });
    return record;
  }

  it("returns the current runtime-validated canonical record and version metadata", async () => {
    const record = await configure();
    const { getCurrentSupplierBillUclContainer } = await import("./supplier-bill-container-retrieval");

    const result = await getCurrentSupplierBillUclContainer({
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
    });

    expect(result.record).toEqual(record);
    expect(result.current.currentVersionId).toBe("version-1");
    expect(result.version.schemaVersion).toBe("supplier_bill.v2");
  });

  it("fails closed for deleted current state", async () => {
    const record = await configure({
      current: {
        context_status: "deleted",
        current_version_id: null,
        deleted_at: "2026-07-28T03:00:00.000Z",
      },
    });
    const { getCurrentSupplierBillUclContainer } = await import("./supplier-bill-container-retrieval");

    await expect(getCurrentSupplierBillUclContainer({
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
    })).rejects.toThrow("not retrievable");
  });

  it("fails on hash, schema, stored JSON, and organization inconsistencies", async () => {
    const record = await configure({ version: { content_hash: "0".repeat(64) } });
    const { getCurrentSupplierBillUclContainer } = await import("./supplier-bill-container-retrieval");
    await expect(getCurrentSupplierBillUclContainer({
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
    })).rejects.toThrow("does not match");

    await configure({ version: { schema_version: "supplier_bill.v1" } });
    await expect(getCurrentSupplierBillUclContainer({
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
    })).rejects.toThrow("identity is invalid");

    await configure({ version: { payload_json: { invalid: true } } });
    await expect(getCurrentSupplierBillUclContainer({
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
    })).rejects.toThrow("Invalid Supplier Bill UCL Container");

    await configure({ version: { organization_id: "other-org" } });
    await expect(getCurrentSupplierBillUclContainer({
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
    })).rejects.toThrow("identity is invalid");

    await configure({ version: { payload_integrity_hash: "f".repeat(64) } });
    await expect(getCurrentSupplierBillUclContainer({
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
    })).rejects.toThrow("integrity check failed");

    await configure({ current: { organization_id: "other-org" } });
    await expect(getCurrentSupplierBillUclContainer({
      organizationId: record.organizationId,
      sourceId: record.source.sourceId,
    })).rejects.toThrow("scope does not match");
  });
});
