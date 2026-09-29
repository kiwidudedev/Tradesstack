import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyMaterial } from "@/lib/materials/classification";
import {
  addSupplierPrice,
  createMaterialWithInitialSupplierPrice,
  makeSupplierPricePreferred,
} from "@/lib/materials/service";
import {
  buildPlannedSupplierProductIdentity,
  buildApprovedImportSupplierPriceInput,
  computeBatchStatus,
  duplicatePlannedSupplierProductTargetRowIds,
  hasConfirmedClassificationConflict,
} from "@/lib/materials/import-service";

vi.mock("server-only", () => ({}));

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
  supplier_product_id: string | null;
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
  const supplierProducts: Array<{
    id: string;
    organization_id: string;
    material_id: string;
    supplier_id: string;
    is_preferred: boolean;
    is_active: boolean;
    archived_at: string | null;
  }> = [];
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

        if (table === "organization_material_supplier_products") {
          const derivedProducts = supplierPrices
            .filter((price) => price.supplier_product_id)
            .map((price) => ({
              id: price.supplier_product_id,
              organization_id: price.organization_id,
              material_id: price.material_id,
              supplier_id: price.supplier_id,
              supplier_unit: price.unit,
              normalized_supplier_unit: price.unit.trim().toLowerCase(),
              normalized_supplier_sku: price.supplier_sku,
              normalized_supplier_description: price.supplier_description?.trim().toLowerCase() ?? null,
              is_preferred: price.is_preferred,
              is_active: true,
              archived_at: null,
            }));
          const products = [...supplierProducts, ...derivedProducts.filter((candidate) => !supplierProducts.some((product) => product.id === candidate.id))];
          return { data: applyFilters(products, filters), error: null };
        }

        if (table === "organization_tax_policies") {
          return { data: [], error: null };
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
        lte() {
          return query;
        },
        or() {
          return query;
        },
        is(column: string, value: unknown) {
          filters.push({ column, value });
          return query;
        },
        order() {
          return query;
        },
        limit() {
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
    async rpc(name: string, args: { p_input?: Record<string, unknown>; p_organization_id?: string }) {
      if (name === "resolve_material_supplier_product_prices") {
        return {
          data: supplierPrices
            .filter((row) => row.is_current && row.supplier_product_id)
            .map((row) => ({ supplier_product_id: row.supplier_product_id, price_id: row.id })),
          error: null,
        };
      }

      const input = args.p_input ?? {};
      if (name === "create_supplier_product_with_initial_price") {
        const supplierProductId = `supplier-product-${supplierProducts.length + 1}`;
        const priceId = `price-${supplierPrices.length + 1}`;
        supplierProducts.push({
          id: supplierProductId,
          organization_id: String(input.organization_id),
          material_id: String(input.material_id),
          supplier_id: String(input.supplier_id),
          is_preferred: input.is_preferred === true,
          is_active: true,
          archived_at: null,
        });
        supplierPrices.push({
          id: priceId,
          organization_id: String(input.organization_id),
          material_id: String(input.material_id),
          supplier_id: String(input.supplier_id),
          supplier_product_id: supplierProductId,
          import_batch_id: null,
          supplier_sku: typeof input.supplier_sku === "string" ? input.supplier_sku : null,
          supplier_description: typeof input.supplier_description === "string" ? input.supplier_description : null,
          unit: String(input.supplier_unit),
          unit_cost: Number(input.unit_cost),
          currency: String(input.currency),
          is_preferred: input.is_preferred === true,
          is_current: true,
          source: String(input.source),
          effective_from: now,
          effective_to: null,
          created_by: "user-1",
          created_at: now,
          updated_at: now,
        });
        return { data: { supplier_product_id: supplierProductId, price_id: priceId, material_id: input.material_id }, error: null };
      }

      if (name === "add_supplier_product_price_version") {
        const supplierProductId = String(input.supplier_product_id);
        const previous = supplierPrices.find((row) => row.supplier_product_id === supplierProductId && row.is_current);
        if (previous) {
          previous.is_current = false;
          previous.effective_to = now;
        }
        const priceId = `price-${supplierPrices.length + 1}`;
        const product = supplierProducts.find((row) => row.id === supplierProductId) ?? {
          id: supplierProductId,
          organization_id: String(input.organization_id),
          material_id: previous?.material_id ?? "material-1",
          supplier_id: previous?.supplier_id ?? "supplier-1",
          is_preferred: previous?.is_preferred ?? false,
          is_active: true,
          archived_at: null,
        };
        if (!supplierProducts.some((row) => row.id === supplierProductId)) supplierProducts.push(product);
        supplierPrices.push({
          id: priceId,
          organization_id: String(input.organization_id),
          material_id: product?.material_id ?? "material-1",
          supplier_id: product?.supplier_id ?? "supplier-1",
          supplier_product_id: supplierProductId,
          import_batch_id: null,
          supplier_sku: null,
          supplier_description: null,
          unit: previous?.unit ?? "ea",
          unit_cost: Number(input.unit_cost),
          currency: String(input.currency),
          is_preferred: product?.is_preferred ?? false,
          is_current: true,
          source: String(input.source),
          effective_from: now,
          effective_to: null,
          created_by: "user-2",
          created_at: now,
          updated_at: now,
        });
        return { data: { supplier_product_id: supplierProductId, price_id: priceId, supersedes_price_id: previous?.id ?? null }, error: null };
      }

      if (name === "set_preferred_supplier_product") {
        const supplierProductId = String(input.supplier_product_id);
        for (const product of supplierProducts) {
          if (product.material_id === String(input.material_id)) product.is_preferred = product.id === supplierProductId;
        }
        for (const price of supplierPrices) {
          if (price.material_id === String(input.material_id) && price.is_current) {
            price.is_preferred = price.supplier_product_id === supplierProductId;
          }
        }
        const preferredPrice = supplierPrices.find((row) => row.supplier_product_id === supplierProductId && row.is_current);
        return { data: { supplier_product_id: supplierProductId, price_id: preferredPrice?.id ?? "price-1", material_id: input.material_id, is_active: true, is_preferred: true, archived_at: null, idempotent_replay: false }, error: null };
      }

      throw new Error(`Unexpected rpc ${name}`);
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

describe("material import Supplier Product approval preflight", () => {
  it("blocks two selected rows resolving to the same existing Supplier Product", () => {
    expect(duplicatePlannedSupplierProductTargetRowIds([
      { rowId: "row-a", targetIdentity: "product:product-1" },
      { rowId: "row-b", targetIdentity: "product:product-1" },
    ])).toEqual(new Set(["row-a", "row-b"]));
  });

  it("allows distinct exact descriptions sharing Material, supplier, and unit", () => {
    const common = {
      materialIdentity: "material:fyreline",
      supplierId: "trade-direct",
      supplierUnit: "m2",
    };
    const standard = buildPlannedSupplierProductIdentity({
      ...common,
      supplierDescription: "GIB Standard 13mm",
    });
    const fyreline = buildPlannedSupplierProductIdentity({
      ...common,
      supplierDescription: "GIB Fyreline 13mm",
    });

    expect(standard).not.toBe(fyreline);
    expect(duplicatePlannedSupplierProductTargetRowIds([
      { rowId: "standard", targetIdentity: standard },
      { rowId: "fyreline", targetIdentity: fyreline },
    ])).toEqual(new Set());
  });

  it("uses exact normalized SKU ahead of description without fuzzy matching", () => {
    const left = buildPlannedSupplierProductIdentity({
      materialIdentity: "material:1",
      supplierId: "supplier:1",
      supplierSku: " GIB-13 ",
      supplierDescription: "Standard",
      supplierUnit: "M2",
    });
    const right = buildPlannedSupplierProductIdentity({
      materialIdentity: "material:1",
      supplierId: "supplier:1",
      supplierSku: "gib-13",
      supplierDescription: "Fyreline",
      supplierUnit: "m2",
    });
    expect(left).toBe(right);
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

describe("material factual persistence", () => {
  it("keeps the material cost type without assigning construction meaning", () => {
    const result = classifyMaterial({
      name: "100 x 50 H1.2 SG8 Timber",
      description: "Structural framing timber",
    });

    expect(result.costType).toBe("MAT");
    expect(result.workType).toBeNull();
    expect(result.costCode).toBeNull();
    expect(result.classificationSource).toBe("rules");
    expect(result.financialRouting.tradesstackCostCode).toBeNull();
  });

  it("does not ask users to classify an ambiguous material", () => {
    const result = classifyMaterial({
      name: "Mystery Builder Widget",
    });

    expect(result.needsReview).toBe(false);
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
        taxEvidenceIntent: "needs_review",
        incompleteTaxReason: "Legacy test source price needs tax review.",
      },
    });

    expect(materials).toHaveLength(1);
    expect(supplierPrices).toHaveLength(1);
    expect(result.material.name).toBe("100 x 50 H1.2 SG8 Timber");
    expect(result.supplierPrice.materialId).toBe(result.material.id);
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
          taxEvidenceIntent: "needs_review",
          incompleteTaxReason: "Legacy test source price needs tax review.",
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
        taxEvidenceIntent: "needs_review",
        incompleteTaxReason: "Legacy test source price needs tax review.",
      },
    });

    expect(result.material.cost_type).toBe("MAT");
    expect(result.material.classification_source).toBe("rules");
    expect(result.material.work_type).toBeNull();
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
        taxEvidenceIntent: "needs_review",
        incompleteTaxReason: "Legacy test source price needs tax review.",
      },
    });

    expect(result.material.needs_review).toBe(false);
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
        taxEvidenceIntent: "needs_review",
        incompleteTaxReason: "Legacy test source price needs tax review.",
      },
    });

    expect(result.supplierPrice.supplierProductId).toBeTruthy();
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
          taxEvidenceIntent: "needs_review",
          incompleteTaxReason: "Legacy test source price needs tax review.",
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
          taxEvidenceIntent: "needs_review",
          incompleteTaxReason: "Legacy test source price needs tax review.",
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
          taxEvidenceIntent: "needs_review",
          incompleteTaxReason: "Legacy test source price needs tax review.",
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
          taxEvidenceIntent: "needs_review",
          incompleteTaxReason: "Legacy test source price needs tax review.",
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
          taxEvidenceIntent: "needs_review",
          incompleteTaxReason: "Legacy test source price needs tax review.",
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
      supplier_product_id: "supplier-product-1",
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
        supplierProductId: "supplier-product-1",
        supplierDescription: "90 x 45 H1.2 SG8",
        unit: "lm",
        unitCost: 4.85,
        currency: "NZD",
        isPreferred: true,
        taxEvidenceIntent: "needs_review",
        incompleteTaxReason: "Legacy test source price needs tax review.",
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
      supplier_product_id: "supplier-product-1",
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
      supplier_product_id: "supplier-product-1",
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
        supplierProductId: "supplier-product-1",
        unit: "ea",
        unitCost: 1.45,
        taxEvidenceIntent: "needs_review",
        incompleteTaxReason: "Legacy test source price needs tax review.",
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
        supplier_product_id: "supplier-product-1",
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
        supplier_product_id: "supplier-product-2",
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
