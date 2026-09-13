import type { SupplierPriceTaxEvidenceReview } from "@/lib/materials/tax-evidence-review";
import type { OrganizationTaxPolicy } from "@/lib/tax/types";

export type TaxEvidenceReconciliationDryRunItem = {
  supplierPriceId: string;
  eligible: boolean;
  reason: string;
  proposedPolicyId: string | null;
  proposedEffectiveFrom: string | null;
};

export function buildTaxEvidenceReconciliationDryRun(params: {
  reviews: SupplierPriceTaxEvidenceReview[];
  policies: OrganizationTaxPolicy[];
  allowlist: string[];
}) {
  const allowlist = new Set(params.allowlist);
  const items = params.reviews.filter((review) => review.needsReview).map((review): TaxEvidenceReconciliationDryRunItem => {
    if (!allowlist.has(review.supplierPriceId)) return {
      supplierPriceId: review.supplierPriceId, eligible: false,
      reason: "not_allowlisted", proposedPolicyId: null, proposedEffectiveFrom: null,
    };
    if (review.classification !== "source_proven_comparison_missing") return {
      supplierPriceId: review.supplierPriceId, eligible: false,
      reason: "source_tax_basis_not_proven", proposedPolicyId: null, proposedEffectiveFrom: null,
    };
    const effective = Date.parse(review.effectiveFrom);
    const policy = params.policies.find((candidate) => candidate.organizationId === review.organizationId
      && Date.parse(candidate.effectiveFrom) <= effective
      && (!candidate.effectiveTo || Date.parse(candidate.effectiveTo) > effective));
    if (!policy) return {
      supplierPriceId: review.supplierPriceId, eligible: false,
      reason: "no_immutable_policy_at_effective_time", proposedPolicyId: null, proposedEffectiveFrom: null,
    };
    if (!policy.supportsInclusiveExclusive) return {
      supplierPriceId: review.supplierPriceId, eligible: false,
      reason: "unsupported_tax_jurisdiction", proposedPolicyId: policy.id, proposedEffectiveFrom: review.effectiveFrom,
    };
    return {
      supplierPriceId: review.supplierPriceId, eligible: true,
      reason: "deterministic_evidence_complete", proposedPolicyId: policy.id, proposedEffectiveFrom: review.effectiveFrom,
    };
  });
  return {
    dryRun: true as const,
    candidateCount: items.length,
    eligibleCount: items.filter((item) => item.eligible).length,
    rejectedCount: items.filter((item) => !item.eligible).length,
    items,
  };
}
