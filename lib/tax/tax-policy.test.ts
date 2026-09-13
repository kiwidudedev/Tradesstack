import { describe, expect, it } from "vitest";
import { resolveTaxJurisdictionCapability } from "@/lib/tax/jurisdiction-policy";
import { normalizePriceTaxBasis } from "@/lib/tax/normalize-price";
import type { OrganizationTaxPolicy } from "@/lib/tax/types";

const policy = (overrides: Partial<OrganizationTaxPolicy> = {}): OrganizationTaxPolicy => ({
  id: "policy-1", organizationId: "org-1", jurisdictionCode: "TEST", taxName: "VAT",
  registrationStatus: "registered", comparisonBasis: "exclusive", standardRate: 20,
  supportsInclusiveExclusive: true, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null,
  policySource: "test", ...overrides,
});

describe("organization tax jurisdiction", () => {
  it("uses country, not currency, as the jurisdiction input", () => {
    expect(resolveTaxJurisdictionCapability("New Zealand")).toMatchObject({ jurisdictionCode: "NZ", taxName: "GST" });
    expect(resolveTaxJurisdictionCapability("United States")).toMatchObject({ supportsInclusiveExclusive: false });
  });
});

describe("configuration-driven tax normalization", () => {
  it("normalizes inclusive and exclusive VAT-style prices", () => {
    expect(normalizePriceTaxBasis({ sourceAmount: 120, sourceTaxBasis: "inclusive", policy: policy() }).normalizedAmount).toBe(100);
    expect(normalizePriceTaxBasis({ sourceAmount: 100, sourceTaxBasis: "exclusive", policy: policy() }).normalizedAmount).toBe(100);
    expect(normalizePriceTaxBasis({ sourceAmount: 100, sourceTaxBasis: "exclusive", policy: policy({ comparisonBasis: "inclusive" }) }).normalizedAmount).toBe(120);
  });

  it.each(["zero_rated", "exempt", "no_tax"] as const)("preserves %s amounts", (sourceTaxBasis) => {
    expect(normalizePriceTaxBasis({ sourceAmount: 100, sourceTaxBasis, policy: policy() }).normalizedAmount).toBe(100);
  });

  it("keeps unknown and unsupported jurisdictions non-comparable", () => {
    expect(normalizePriceTaxBasis({ sourceAmount: 100, sourceTaxBasis: "unknown", policy: policy() }).status).toBe("unknown_tax_basis");
    expect(normalizePriceTaxBasis({ sourceAmount: 100, sourceTaxBasis: "inclusive", policy: policy({ supportsInclusiveExclusive: false }) }).status).toBe("unsupported_tax_jurisdiction");
  });
});
