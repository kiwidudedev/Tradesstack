import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyMaterial } from "@/lib/materials/classification";
import {
  addSupplierPrice,
  buildSupersedeCurrentPricePatch,
  createMaterialWithInitialSupplierPrice,
  makeSupplierPricePreferred,
} from "@/lib/materials/service";
import {
  buildApprovedImportSupplierPriceInput,
  computeBatchStatus,
  hasConfirmedClassificationConflict,
} from "@/lib/materials/import-service";

vi.mock("@/lib/material-intelligence", () => ({
  buildMaterialIntelligenceEvent: vi.fn(() => ({})),
  createMaterialValidationCase: vi.fn().mockResolvedValue(undefined),
  logMaterialIntelligenceFailure: vi.fn(),
  summarizeMaterialClassification: vi.fn((input) => input),
  writeMaterialCorrectionEvent: vi.fn().mockResolvedValue(undefined),
  writeMaterialIntelligenceEvents: vi.fn().mockResolvedValue(undefined),
}));

type FakeMaterialRow = {
  id: string;
  organization_id: string;
  name: string;
  normalized_name: string;
  description: string | null;
  default_unit: string;
  category: string | null;
  work_type: string | null;
  cost_type: string | null;
  cost_code: string | null;
  classification_confidence: number | null;
  classification_source: string | null;
  needs_review: boolean;
  original_classification: Record<string, unknown> | null;
  final_classification: Record<string, unknown> | null;
  organization_cost_code_id: string | null;
  is_active: boolean;
  archived_at: string | null;
  archived_by: string | null;
  confirmed_by_user_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
};

type FakePriceRow = {
  id: string;
  organization_id: string;
  material_id: string;
  supplier_id: string;
  import_batch_id: string | null;
  supplier_sku: string | null;
  supplier_description: string | null;
  unit: string;
  unit_cost: number;
  currency: string;
  is_preferred: boolean;
  is_current: boolean;
  source: string;
  effective_from: string;
  effective_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function createMaterialsSupabaseStub(options?: {
  suppliers?: Array<{ id: string; organization_id: string }>;
}) {
  const organizationId = "org-1";
  const now = "2026-06-18T00:00:00.000Z";
  const materials: FakeMaterialRow[] = [];
  const supplierPrices: FakePriceRow[] = [];
  const suppliers = options?.suppliers ?? [{ id: "supplier-1", organization_id: organizationId }];

  const applyFilters = <T extends Record<string, unknown>>(
    rows: T[],
    filters: Array<{ column: string; value: unknown }>
  ) =>
    rows.filter((row) =>
      filters.every((filter) => {
        const value = row[filter.column as keyof T];
        if (filter.column === "is_current" || filter.column === "is_preferred") {
          return Boolean(value) === Boolean(filter.value);
        }
        return value === filter.value;
      })
    );

  const supabase = {
    from(table: string) {
      const filters: Array<{ column: string; value: unknown }> = [];
      let insertedPayload: Record<string, unknown> | null = null;
      let updatePayload: Record<string, unknown> | null = null;

      const resolveSelect = async () => {
        if (table === "organization_cost_codes" || table === "organization_cost_code_mapping_rules") {
          return { data: [], error: null };
        }

        if (table === "organization_suppliers") {
          return { data: applyFilters(suppliers, filters), error: null };
        }

        if (table === "organization_materials") {
          return { data: applyFilters(materials, filters), error: null };
        }

        if (table === "organization_material_supplier_prices") {
          return { data: applyFilters(supplierPrices, filters), error: null };
        }

        throw new Error(`Unexpected select on ${table}`);
      };

      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value });
          return query;
        },
        async single() {
          if (insertedPayload) {
            if (table === "organization_materials") {
              const payload = insertedPayload as Partial<FakeMaterialRow>;
              const row = {
                ...payload,
                confirmed_by_user_id: payload.confirmed_by_user_id ?? null,
                confirmed_at: payload.confirmed_at ?? null,
                created_at: payload.created_at ?? now,
                updated_at: payload.updated_at ?? now,
              } as FakeMaterialRow;
              materials.push(row);
              return { data: row, error: null };
            }

            if (table === "organization_material_supplier_prices") {
              const payload = insertedPayload as Partial<FakePriceRow>;
              const row = {
                ...payload,
                id: payload.id ?? `price-${supplierPrices.length + 1}`,
                created_at: payload.created_at ?? now,
                updated_at: payload.updated_at ?? now,
              } as FakePriceRow;
              supplierPrices.push(row);
              return { data: row, error: null };
            }
          }

          const result = await resolveSelect();
          const row = Array.isArray(result.data) ? result.data[0] ?? null : null;
          return row ? { data: row, error: null } : { data: null, error: { message: "Not found" } };
        },
        async maybeSingle() {
          const result = await resolveSelect();
          const row = Array.isArray(result.data) ? result.data[0] ?? null : null;
          return { data: row, error: null };
        },
        insert(payload: Record<string, unknown>) {
          insertedPayload = payload;
          return query;
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          return query;
        },
        in(column: string, values: unknown[]) {
          if (table === "organization_material_supplier_prices" && updatePayload) {
            for (const row of supplierPrices) {
              if (values.includes(row[column as keyof FakePriceRow])) {
                Object.assign(row, updatePayload, { updated_at: now });
              }
            }
            return Promise.resolve({ data: null, error: null });
          }

          throw new Error(`Unexpected in() on ${table}`);
        },
        async then(onFulfilled: (value: { data: unknown; error: null }) => unknown) {
          if (table === "organization_material_supplier_prices" && updatePayload) {
            const rows = applyFilters(supplierPrices, filters);
            for (const row of rows) {
              Object.assign(row, updatePayload, { updated_at: now });
            }
            return Promise.resolve(onFulfilled({ data: null, error: null }));
          }

          if (table === "organization_materials" && updatePayload) {
            const rows = applyFilters(materials, filters);
            for (const row of rows) {
              Object.assign(row, updatePayload, { updated_at: now });
            }
            return Promise.resolve(onFulfilled({ data: null, error: null }));
          }

          return resolveSelect().then(onFulfilled);
        },
      };

      return query;
    },
  };

  return {
    supabase: supabase as never,
    materials,
    supplierPrices,
  };
}

function pushMaterialFixture(materials: FakeMaterialRow[], overrides?: Partial<FakeMaterialRow>) {
  materials.push({
    id: "material-1",
    organization_id: "org-1",
    name: "100 x 50 H1.2 SG8 Timber",
    normalized_name: "100 x 50 h1.2 sg8 timber",
    description: null,
    default_unit: "lm",
    category: null,
    work_type: "Framing Timber",
    cost_type: "MAT",
    cost_code: "05.05.MAT",
    classification_confidence: 0.88,
    classification_source: "rules",
    needs_review: false,
    original_classification: null,
    final_classification: null,
    organization_cost_code_id: "org-code-1",
    is_active: true,
    archived_at: null,
    archived_by: null,
    confirmed_by_user_id: null,
    confirmed_at: null,
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
    created_by: "user-1",
    ...overrides,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("material pricing helpers", () => {
  it("builds current-price supersession updates without mutating historical rows directly", () => {
    const effectiveToIso = "2026-06-15T00:00:00.000Z";
    const patch = buildSupersedeCurrentPricePatch({
      currentRows: [{ id: "price-1" }, { id: "price-2" }],
      effectiveToIso,
    });

    expect(patch).toEqual([
      { id: "price-1", is_current: false, effective_to: effectiveToIso },
      { id: "price-2", is_current: false, effective_to: effectiveToIso },
    ]);
  });
});

describe("material import batch status", () => {
  it("stays ready for review until any row is reviewed", () => {
    expect(
      computeBatchStatus({
        rowsExtracted: 4,
        rowsApproved: 0,
        rowsRejected: 0,
      })
    ).toBe("ready_for_review");
  });

  it("becomes partially approved while review is in progress", () => {
    expect(
      computeBatchStatus({
        rowsExtracted: 4,
        rowsApproved: 2,
        rowsRejected: 0,
      })
    ).toBe("partially_approved");
  });

  it("becomes approved once every extracted row is resolved", () => {
    expect(
      computeBatchStatus({
        rowsExtracted: 4,
        rowsApproved: 3,
        rowsRejected: 1,
      })
    ).toBe("approved");
  });
});

describe("material import approval pricing", () => {
  it("does not mark approved imported supplier prices as preferred by default", () => {
    const input = buildApprovedImportSupplierPriceInput({
      materialId: "material-1",
      supplierId: "supplier-1",
      importBatchId: "batch-1",
      review: {
        rowId: "row-1",
        action: "create_material",
        matchedMaterialId: null,
        reviewedName: "100 x 50 H1.2 SG8 Timber",
        reviewedDescription: "Framing timber",
        reviewedUnit: "lm",
        reviewedUnitCost: 4.05,
        reviewedCurrency: "NZD",
        reviewedSupplierDescription: "100x50 H1.2 SG8",
        reviewedSupplierSku: null,
      },
    });

    expect(input).toMatchObject({
      materialId: "material-1",
      supplierId: "supplier-1",
      importBatchId: "batch-1",
      isPreferred: false,
      source: "import",
    });
  });
});

describe("material classification", () => {
  it("reuses the shared classifier and defaults material cost type to MAT", () => {
    const result = classifyMaterial({
      name: "100 x 50 H1.2 SG8 Timber",
      description: "Structural framing timber",
    });

    expect(result.costType).toBe("MAT");
    expect(result.workType).toBeTruthy();
    expect(result.costCode).toMatch(/\.MAT$/);
    expect(result.classificationSource).toBe("rules");
  });

  it("flags unmatched material names for review", () => {
    const result = classifyMaterial({
      name: "Mystery Builder Widget",
    });

    expect(result.needsReview).toBe(true);
    expect(result.costType).toBe("MAT");
  });
});

describe("material classification conflicts", () => {
  it("does not treat unconfirmed materials as conflicting", () => {
    expect(
      hasConfirmedClassificationConflict({
        material: {
          classification_source: "rules",
          needs_review: true,
          work_type: "Wall framing",
          cost_type: "MAT",
          cost_code: "05.05.MAT",
          organization_cost_code_id: "org-code-1",
        } as never,
        classifiedWorkType: "Roof framing",
        classifiedCostType: "MAT",
        classifiedCostCode: "05.06.MAT",
        classifiedOrganizationCostCodeId: "org-code-2",
      })
    ).toBe(false);
  });

  it("detects conflicts against confirmed material classifications", () => {
    expect(
      hasConfirmedClassificationConflict({
        material: {
          classification_source: "user_confirmed",
          needs_review: false,
          work_type: "Wall framing",
          cost_type: "MAT",
          cost_code: "05.05.MAT",
          organization_cost_code_id: "org-code-1",
        } as never,
        classifiedWorkType: "Roof framing",
        classifiedCostType: "MAT",
        classifiedCostCode: "05.06.MAT",
        classifiedOrganizationCostCodeId: "org-code-2",
      })
    ).toBe(true);
  });
});

describe("material create with initial supplier price", () => {
  it("creates the material and first supplier price together", async () => {
    const { supabase, materials, supplierPrices } = createMaterialsSupabaseStub();

    const result = await createMaterialWithInitialSupplierPrice({
      supabase,
      organizationId: "org-1",
      actorUserId: "user-1",
      materialInput: {
        name: "100 x 50 H1.2 SG8 Timber",
        defaultUnit: "LM",
      },
      supplierPriceInput: {
        supplierId: "supplier-1",
        unit: "LM",
        unitCost: 4.55,
      },
    });

    expect(materials).toHaveLength(1);
    expect(supplierPrices).toHaveLength(1);
    expect(result.material.name).toBe("100 x 50 H1.2 SG8 Timber");
    expect(result.supplierPrice.material_id).toBe(result.material.id);
  });

  it("validates the supplier belongs to the organization before creating the material", async () => {
    const { supabase, materials } = createMaterialsSupabaseStub({
      suppliers: [{ id: "supplier-2", organization_id: "other-org" }],
    });

    await expect(
      createMaterialWithInitialSupplierPrice({
        supabase,
        organizationId: "org-1",
        actorUserId: "user-1",
        materialInput: {
          name: "100 x 50 H1.2 SG8 Timber",
          defaultUnit: "LM",
        },
        supplierPriceInput: {
          supplierId: "supplier-1",
          unit: "LM",
          unitCost: 4.55,
        },
      })
    ).rejects.toThrow("Supplier not found.");

    expect(materials).toHaveLength(0);
  });

  it("preserves automatic classification on create", async () => {
    const { supabase } = createMaterialsSupabaseStub();

    const result = await createMaterialWithInitialSupplierPrice({
      supabase,
      organizationId: "org-1",
      actorUserId: "user-1",
      materialInput: {
        name: "100 x 50 H1.2 SG8 Timber",
        defaultUnit: "LM",
      },
      supplierPriceInput: {
        supplierId: "supplier-1",
        unit: "LM",
        unitCost: 4.55,
      },
    });

    expect(result.material.cost_type).toBe("MAT");
    expect(result.material.classification_source).toBe("rules");
    expect(result.material.work_type).toBeTruthy();
  });

  it("marks low-confidence materials as needing review", async () => {
    const { supabase } = createMaterialsSupabaseStub();

    const result = await createMaterialWithInitialSupplierPrice({
      supabase,
      organizationId: "org-1",
      actorUserId: "user-1",
      materialInput: {
        name: "Mystery Builder Widget",
        defaultUnit: "EA",
      },
      supplierPriceInput: {
        supplierId: "supplier-1",
        unit: "EA",
        unitCost: 12.5,
      },
    });

    expect(result.material.needs_review).toBe(true);
    expect(result.material.cost_type).toBe("MAT");
  });

  it("defaults the first supplier price to preferred", async () => {
    const { supabase } = createMaterialsSupabaseStub();

    const result = await createMaterialWithInitialSupplierPrice({
      supabase,
      organizationId: "org-1",
      actorUserId: "user-1",
      materialInput: {
        name: "100 x 50 H1.2 SG8 Timber",
        defaultUnit: "LM",
      },
      supplierPriceInput: {
        supplierId: "supplier-1",
        unit: "LM",
        unitCost: 4.55,
      },
    });

    expect(result.supplierPrice.is_preferred).toBe(true);
  });

  it("requires material name, supplier, unit, and unit cost", async () => {
    const { supabase } = createMaterialsSupabaseStub();

    await expect(
      createMaterialWithInitialSupplierPrice({
        supabase,
        organizationId: "org-1",
        actorUserId: "user-1",
        materialInput: {
          name: "",
          defaultUnit: "LM",
        },
        supplierPriceInput: {
          supplierId: "supplier-1",
          unit: "LM",
          unitCost: 4.55,
        },
      })
    ).rejects.toThrow("Material name is required.");

    await expect(
      createMaterialWithInitialSupplierPrice({
        supabase,
        organizationId: "org-1",
        actorUserId: "user-1",
        materialInput: {
          name: "Timber",
          defaultUnit: "",
        },
        supplierPriceInput: {
          supplierId: "supplier-1",
          unit: "",
          unitCost: 4.55,
        },
      })
    ).rejects.toThrow("Default unit is required.");

    await expect(
      createMaterialWithInitialSupplierPrice({
        supabase,
        organizationId: "org-1",
        actorUserId: "user-1",
        materialInput: {
          name: "Timber",
          defaultUnit: "LM",
        },
        supplierPriceInput: {
          supplierId: "",
          unit: "LM",
          unitCost: 4.55,
        },
      })
    ).rejects.toThrow("Supplier is required.");

    await expect(
      createMaterialWithInitialSupplierPrice({
        supabase,
        organizationId: "org-1",
        actorUserId: "user-1",
        materialInput: {
          name: "Timber",
          defaultUnit: "LM",
        },
        supplierPriceInput: {
          supplierId: "supplier-1",
          unit: "LM",
          unitCost: Number.NaN,
        },
      })
    ).rejects.toThrow("Unit cost must be a valid positive number.");
  });
});

describe("material supplier price validation", () => {
  it("rejects supplier prices for suppliers outside the organization", async () => {
    const { supabase } = createMaterialsSupabaseStub({
      suppliers: [{ id: "supplier-2", organization_id: "other-org" }],
    });

    await expect(
      addSupplierPrice({
        supabase,
        organizationId: "org-1",
        actorUserId: "user-1",
        input: {
          materialId: "material-1",
          supplierId: "supplier-1",
          unit: "LM",
          unitCost: 4.55,
        },
      })
    ).rejects.toThrow("Supplier not found.");
  });
});

describe("material supplier price versioning", () => {
  it("creates a new current version and closes the previous current row", async () => {
    const { supabase, materials, supplierPrices } = createMaterialsSupabaseStub();
    pushMaterialFixture(materials);

    supplierPrices.push({
      id: "price-1",
      organization_id: "org-1",
      material_id: "material-1",
      supplier_id: "supplier-1",
      import_batch_id: null,
      supplier_sku: null,
      supplier_description: "90 x 45 H1.2 SG8",
      unit: "lm",
      unit_cost: 4.55,
      currency: "NZD",
      is_preferred: true,
      is_current: true,
      source: "manual",
      effective_from: "2026-06-10T00:00:00.000Z",
      effective_to: null,
      created_by: "user-1",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
    });

    await addSupplierPrice({
      supabase,
      organizationId: "org-1",
      actorUserId: "user-2",
      input: {
        materialId: "material-1",
        supplierId: "supplier-1",
        supplierDescription: "90 x 45 H1.2 SG8",
        unit: "lm",
        unitCost: 4.85,
        currency: "NZD",
        isPreferred: true,
      },
    });

    expect(supplierPrices).toHaveLength(2);
    expect(supplierPrices[0]).toMatchObject({
      id: "price-1",
      is_current: false,
      is_preferred: true,
    });
    expect(supplierPrices[0].effective_to).toBeTruthy();
    expect(supplierPrices[1]).toMatchObject({
      material_id: "material-1",
      supplier_id: "supplier-1",
      unit_cost: 4.85,
      is_current: true,
      is_preferred: true,
      effective_to: null,
    });
  });

  it("preserves history rows when updating a supplier price", async () => {
    const { supabase, materials, supplierPrices } = createMaterialsSupabaseStub();
    pushMaterialFixture(materials);

    supplierPrices.push({
      id: "price-1",
      organization_id: "org-1",
      material_id: "material-1",
      supplier_id: "supplier-1",
      import_batch_id: null,
      supplier_sku: null,
      supplier_description: null,
      unit: "ea",
      unit_cost: 1.25,
      currency: "NZD",
      is_preferred: false,
      is_current: true,
      source: "manual",
      effective_from: "2026-06-10T00:00:00.000Z",
      effective_to: null,
      created_by: "user-1",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
    });

    await addSupplierPrice({
      supabase,
      organizationId: "org-1",
      actorUserId: "user-2",
      input: {
        materialId: "material-1",
        supplierId: "supplier-1",
        unit: "ea",
        unitCost: 1.45,
      },
    });

    const historicalRow = supplierPrices.find((row) => row.id === "price-1");
    const currentRow = supplierPrices.find((row) => row.id !== "price-1");

    expect(historicalRow?.is_current).toBe(false);
    expect(historicalRow?.effective_to).toBeTruthy();
    expect(currentRow?.is_current).toBe(true);
    expect(currentRow?.effective_to).toBeNull();
  });

  it("switches preferred supplier on the existing current row without creating duplicate history", async () => {
    const { supabase, materials, supplierPrices } = createMaterialsSupabaseStub();
    pushMaterialFixture(materials);

    supplierPrices.push(
      {
        id: "price-1",
        organization_id: "org-1",
        material_id: "material-1",
        supplier_id: "supplier-1",
        import_batch_id: null,
        supplier_sku: null,
        supplier_description: null,
        unit: "lm",
        unit_cost: 4.55,
        currency: "NZD",
        is_preferred: true,
        is_current: true,
        source: "manual",
        effective_from: "2026-06-10T00:00:00.000Z",
        effective_to: null,
        created_by: "user-1",
        created_at: "2026-06-10T00:00:00.000Z",
        updated_at: "2026-06-10T00:00:00.000Z",
      },
      {
        id: "price-2",
        organization_id: "org-1",
        material_id: "material-1",
        supplier_id: "supplier-2",
        import_batch_id: null,
        supplier_sku: null,
        supplier_description: null,
        unit: "lm",
        unit_cost: 4.8,
        currency: "NZD",
        is_preferred: false,
        is_current: true,
        source: "manual",
        effective_from: "2026-06-11T00:00:00.000Z",
        effective_to: null,
        created_by: "user-1",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      }
    );

    await makeSupplierPricePreferred({
      supabase,
      organizationId: "org-1",
      supplierPriceId: "price-2",
    });

    expect(supplierPrices).toHaveLength(2);
    expect(supplierPrices.find((row) => row.id === "price-1")?.is_preferred).toBe(false);
    expect(supplierPrices.find((row) => row.id === "price-2")?.is_preferred).toBe(true);
    expect(supplierPrices.every((row) => row.is_current)).toBe(true);
  });
});
