import type { Json } from "@/lib/supabase/types";
import type { OrganizationTaxPolicy, PriceTaxSnapshot, SourceTaxBasis } from "@/lib/tax/types";

export type PriceTaxEvidenceIntent = "canonical_ready" | "needs_review";

export type PriceTaxReviewRoute =
  | "simple_forward_confirmation"
  | "advanced_review"
  | "not_correctable"
  | "complete";

export type PriceTaxReviewRouteInput = {
  classification: "complete" | "source_basis_unknown" | "source_proven_comparison_missing" | "unsupported_tax_jurisdiction" | "tax_rate_conflict";
  sourceTaxBasis: SourceTaxBasis;
  sourceTaxRate: number | null;
  amount: number;
  unit: string;
  currency: string;
  isCurrent: boolean;
  supplierProductId: string | null;
  currentPolicy: OrganizationTaxPolicy | null;
  canWrite: boolean;
};

export function routePriceTaxReview(input: PriceTaxReviewRouteInput): PriceTaxReviewRoute {
  if (input.classification === "complete") return "complete";
  if (!input.canWrite) return "not_correctable";
  if (!input.isCurrent || !input.supplierProductId) return "not_correctable";
  if (!Number.isFinite(input.amount) || input.amount < 0 || !input.unit.trim() || !/^[A-Z]{3}$/.test(input.currency)) {
    return "not_correctable";
  }
  if (input.classification === "unsupported_tax_jurisdiction") return "not_correctable";

  const policy = input.currentPolicy;
  const hasKnownBasis = input.sourceTaxBasis !== "unknown";
  const policyCompatible = Boolean(policy?.supportsInclusiveExclusive);
  const rateConflict = Boolean(
    policy
    && (input.sourceTaxBasis === "exclusive" || input.sourceTaxBasis === "inclusive")
    && input.sourceTaxRate !== null
    && Math.abs(input.sourceTaxRate - policy.standardRate) > 0.0001
  );

  if (
    input.classification === "source_proven_comparison_missing"
    && hasKnownBasis
    && policyCompatible
    && !rateConflict
  ) {
    return "simple_forward_confirmation";
  }
  return "advanced_review";
}

export type PriceTaxReviewMetadata = {
  status: "complete" | "needs_review";
  acknowledged: boolean;
  reason: string;
  actorUserId: string;
  reviewedAt: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isCompletePriceTaxSnapshot(snapshot: PriceTaxSnapshot) {
  const policy = record(snapshot.taxPolicySnapshot);
  const supported = policy.supportsInclusiveExclusive === true;
  const policyRate = typeof policy.standardRate === "number"
    ? policy.standardRate
    : Number(policy.standardRate);
  const sourceRateConflict = (
    snapshot.sourceTaxBasis === "exclusive" || snapshot.sourceTaxBasis === "inclusive"
  ) && snapshot.sourceTaxRate !== null
    && Math.abs(snapshot.sourceTaxRate - Number(snapshot.comparisonTaxRate)) > 0.0001;

  return snapshot.sourceTaxBasis !== "unknown"
    && Boolean(snapshot.taxJurisdictionCode)
    && Boolean(snapshot.comparisonTaxBasis)
    && snapshot.comparisonTaxRate !== null
    && typeof policy.policyId === "string"
    && policy.policyId.length > 0
    && policy.jurisdictionCode === snapshot.taxJurisdictionCode
    && policy.comparisonBasis === snapshot.comparisonTaxBasis
    && Number.isFinite(policyRate)
    && Math.abs(policyRate - Number(snapshot.comparisonTaxRate)) <= 0.0001
    && supported
    && !sourceRateConflict;
}

export function buildPriceTaxReviewMetadata(params: {
  snapshot: PriceTaxSnapshot;
  intent: PriceTaxEvidenceIntent;
  incompleteReason?: string | null;
  actorUserId: string;
  reviewedAt?: string;
}): PriceTaxReviewMetadata {
  const complete = isCompletePriceTaxSnapshot(params.snapshot);
  if (params.intent === "canonical_ready" && !complete) {
    throw new Error("Complete tax evidence is required for a canonical estimating rate.");
  }
  if (params.intent === "needs_review" && complete) {
    throw new Error("This price already has complete tax evidence; save it as canonical-ready.");
  }
  const reason = complete
    ? "Canonical Supplier Price tax evidence confirmed."
    : params.incompleteReason?.trim() ?? "";
  if (!complete && reason.length < 8) {
    throw new Error("Explain why this Supplier Price is being saved with incomplete tax evidence.");
  }
  return {
    status: complete ? "complete" : "needs_review",
    acknowledged: true,
    reason,
    actorUserId: params.actorUserId,
    reviewedAt: params.reviewedAt ?? new Date().toISOString(),
  };
}

export function priceObservationMetadata(params: {
  taxSnapshot: PriceTaxSnapshot;
  taxReview: PriceTaxReviewMetadata;
}): Json {
  return {
    tax_snapshot: params.taxSnapshot as unknown as Json,
    tax_review: params.taxReview as unknown as Json,
  };
}
