import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { OrganizationMaterialSupplierPriceRow } from "@/lib/materials/types";
import {
  buildSupplierPriceTaxEvidenceReviews,
  classifySupplierPriceTaxEvidence,
} from "@/lib/materials/tax-evidence-review";
import { buildTaxEvidenceReconciliationDryRun } from "@/lib/materials/tax-evidence-reconciliation";
import {
  buildPriceTaxReviewMetadata,
  isCompletePriceTaxSnapshot,
  routePriceTaxReview,
} from "@/lib/tax/price-review-state";
import type { OrganizationTaxPolicy, PriceTaxSnapshot } from "@/lib/tax/types";
import { validateSupplierPriceDraft } from "@/lib/materials/validation";

const migration = readFileSync(
  "supabase/migrations/20260816180000_add_material_price_tax_evidence_remediation.sql",
  "utf8",
);

function snapshot(overrides: Partial<PriceTaxSnapshot> = {}): PriceTaxSnapshot {
  return {
    sourceTaxBasis: "exclusive",
    sourceTaxRate: null,
    taxJurisdictionCode: "NZ",
    comparisonTaxBasis: "exclusive",
    comparisonTaxRate: 15,
    taxPolicySnapshot: {
      policyId: "policy-1",
      jurisdictionCode: "NZ",
      comparisonBasis: "exclusive",
      standardRate: 15,
      supportsInclusiveExclusive: true,
    },
    taxEvidence: {},
    ...overrides,
  };
}

function price(overrides: Partial<OrganizationMaterialSupplierPriceRow> = {}) {
  return {
    id: "price-1", organization_id: "org-1", material_id: "material-1",
    supplier_id: "supplier-1", supplier_product_id: "product-1",
    import_batch_id: null, import_row_id: null, supersedes_price_id: null,
    idempotency_key: "price-1", observation_metadata: null,
    supplier_sku: null, supplier_description: "Product", unit: "m2",
    unit_cost: 12.82, currency: "NZD", is_preferred: false, is_current: true,
    source: "import", effective_from: "2026-03-01T00:00:00.000Z", effective_to: null,
    created_by: "user-1", created_at: "2026-08-15T22:22:29.000Z",
    updated_at: "2026-08-15T22:22:29.000Z", source_tax_basis: "exclusive",
    source_tax_rate: null, tax_jurisdiction_code: null, comparison_tax_basis: null,
    comparison_tax_rate: null, tax_policy_snapshot: { resolutionStatus: "missing_policy" },
    tax_evidence: { documentExcerpt: "All prices exclude GST" },
    ...overrides,
  } as OrganizationMaterialSupplierPriceRow;
}

const policy: OrganizationTaxPolicy = {
  id: "policy-1", organizationId: "org-1", jurisdictionCode: "NZ", taxName: "GST",
  registrationStatus: "registered", comparisonBasis: "exclusive", standardRate: 15,
  supportsInclusiveExclusive: true, effectiveFrom: "2026-08-15T00:00:00.000Z",
  effectiveTo: null, policySource: "organization_settings_cutover",
};

describe("Supplier Price tax evidence remediation", () => {
  it("does not let manual price creation silently default its tax-review outcome", () => {
    const base = { materialId: "material-1", supplierId: "supplier-1", unit: "m2", unitCost: 12.82 };
    expect(() => validateSupplierPriceDraft(base)).toThrow("Choose whether");
    expect(validateSupplierPriceDraft({
      ...base,
      sourceTaxBasis: "unknown",
      taxEvidenceIntent: "needs_review",
      incompleteTaxReason: "Supplier tax basis was not supplied.",
    })).toMatchObject({ taxEvidenceIntent: "needs_review" });
  });

  it("requires an explicit incomplete review acknowledgement", () => {
    const incomplete = snapshot({
      taxJurisdictionCode: null,
      comparisonTaxBasis: null,
      comparisonTaxRate: null,
      taxPolicySnapshot: { resolutionStatus: "missing_policy" },
    });
    expect(isCompletePriceTaxSnapshot(incomplete)).toBe(false);
    expect(() => buildPriceTaxReviewMetadata({
      snapshot: incomplete, intent: "canonical_ready", actorUserId: "user-1",
    })).toThrow("Complete tax evidence");
    expect(buildPriceTaxReviewMetadata({
      snapshot: incomplete, intent: "needs_review", actorUserId: "user-1",
      incompleteReason: "No policy covers the supplier effective date.",
    })).toMatchObject({ status: "needs_review", acknowledged: true });
  });

  it("accepts internally consistent canonical evidence and rejects conflicting intent", () => {
    expect(isCompletePriceTaxSnapshot(snapshot())).toBe(true);
    expect(buildPriceTaxReviewMetadata({
      snapshot: snapshot(), intent: "canonical_ready", actorUserId: "user-1",
    })).toMatchObject({ status: "complete" });
    expect(() => buildPriceTaxReviewMetadata({
      snapshot: snapshot(), intent: "needs_review", actorUserId: "user-1",
      incompleteReason: "Should not be needed.",
    })).toThrow("already has complete tax evidence");
  });

  it("classifies the Trade Direct shape without supplier-specific logic", () => {
    expect(classifySupplierPriceTaxEvidence(price())).toEqual({
      classification: "source_proven_comparison_missing",
      snapshotStatus: "missing_tax_policy",
    });
    expect(classifySupplierPriceTaxEvidence(price({ source_tax_basis: "unknown" }))).toEqual({
      classification: "source_basis_unknown",
      snapshotStatus: "unknown_tax_basis",
    });
  });

  it("routes a proven same-price forward correction to simple confirmation", () => {
    expect(routePriceTaxReview({
      classification: "source_proven_comparison_missing",
      sourceTaxBasis: "exclusive",
      sourceTaxRate: null,
      amount: 12.82,
      unit: "m2",
      currency: "NZD",
      isCurrent: true,
      supplierProductId: "product-1",
      currentPolicy: policy,
      canWrite: true,
    })).toBe("simple_forward_confirmation");
  });

  it.each([
    ["source basis unknown", { classification: "source_basis_unknown", sourceTaxBasis: "unknown" }, "advanced_review"],
    ["current policy missing", { currentPolicy: null }, "advanced_review"],
    ["tax rate conflict", { classification: "tax_rate_conflict", sourceTaxRate: 10 }, "advanced_review"],
    ["unsupported jurisdiction", { classification: "unsupported_tax_jurisdiction" }, "not_correctable"],
    ["historical price", { isCurrent: false }, "not_correctable"],
    ["read-only actor", { canWrite: false }, "not_correctable"],
  ] as const)("routes %s away from simple confirmation", (_label, overrides, expected) => {
    expect(routePriceTaxReview({
      classification: "source_proven_comparison_missing",
      sourceTaxBasis: "exclusive",
      sourceTaxRate: null,
      amount: 12.82,
      unit: "m2",
      currency: "NZD",
      isCurrent: true,
      supplierProductId: "product-1",
      currentPolicy: policy,
      canWrite: true,
      ...overrides,
    })).toBe(expected);
  });

  it("builds one set-oriented review projection including source evidence and binding count", () => {
    const reviews = buildSupplierPriceTaxEvidenceReviews({
      organizationId: "org-1", organizationName: "Tradesstack",
      materials: [{ id: "material-1", name: "GIB Fyreline", is_active: true } as never],
      suppliers: [{ id: "supplier-1", name: "Trade Direct", company_name: null } as never],
      supplierProducts: [{
        id: "product-1", supplier_description: "GIB Fyreline 13mm",
        is_active: true, archived_at: null, is_preferred: false,
      } as never],
      supplierPrices: [price()],
      bindings: [{ supplier_price_id: "price-1", binding_state: "active" }],
    });
    expect(reviews[0]).toMatchObject({
      dataClass: "business", needsReview: true, productIsSearchable: true,
      workbookBindingCount: 1, sourceEvidenceExcerpt: "All prices exclude GST",
    });
  });

  it("keeps automatic correction allowlisted and rejects prices with no policy at their exact date", () => {
    const review = buildSupplierPriceTaxEvidenceReviews({
      organizationId: "org-1", organizationName: "Tradesstack",
      materials: [{ id: "material-1", name: "Material", is_active: true } as never],
      suppliers: [{ id: "supplier-1", name: "Supplier", company_name: null } as never],
      supplierProducts: [{ id: "product-1", is_active: true, archived_at: null } as never],
      supplierPrices: [price()], bindings: [],
    });
    const dryRun = buildTaxEvidenceReconciliationDryRun({
      reviews: review, policies: [policy], allowlist: ["price-1"],
    });
    expect(dryRun).toMatchObject({ dryRun: true, eligibleCount: 0, rejectedCount: 1 });
    expect(dryRun.items[0].reason).toBe("no_immutable_policy_at_effective_time");
  });

  it("hardens every writer and creates an append-only atomic correction event", () => {
    expect(migration).toContain("materials_validate_price_tax_review_state");
    expect(migration).toContain("incomplete_tax_review_acknowledgement_required");
    expect(migration).toContain("create or replace function public.confirm_supplier_price_tax_evidence");
    expect(migration).toContain("stale_supplier_price");
    expect(migration).toContain("stale_tax_policy");
    expect(migration).toContain("tax-correction:");
    expect(migration).toContain("organization_material_price_tax_corrections_append_only");
    expect(migration).toContain("has_org_permission(organization_id, 'materials.view')");
    expect(migration).toContain("materials_phase1f_require_writer(v_org)");
    expect(migration).not.toContain("Trade Direct");
  });
});
