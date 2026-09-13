import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaterialsSupabaseClient } from "@/lib/materials/types";
import type { OrganizationTaxPolicy, PriceTaxSnapshot, SourceTaxBasis } from "@/lib/tax/types";

type PolicyRow = {
  id: string;
  organization_id: string;
  jurisdiction_code: string;
  tax_name: string;
  registration_status: "registered" | "unregistered" | "unknown";
  comparison_basis: "exclusive" | "inclusive";
  standard_rate: number;
  supports_inclusive_exclusive: boolean;
  effective_from: string;
  effective_to: string | null;
  policy_source: string;
};

export function mapOrganizationTaxPolicy(row: PolicyRow): OrganizationTaxPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    jurisdictionCode: row.jurisdiction_code,
    taxName: row.tax_name,
    registrationStatus: row.registration_status,
    comparisonBasis: row.comparison_basis,
    standardRate: Number(row.standard_rate),
    supportsInclusiveExclusive: row.supports_inclusive_exclusive,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    policySource: row.policy_source,
  };
}

export async function resolveOrganizationTaxPolicyAt(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  effectiveAt?: string | null;
}): Promise<OrganizationTaxPolicy | null> {
  const at = params.effectiveAt ?? new Date().toISOString();
  const { data, error } = await (params.supabase as unknown as SupabaseClient)
    .from("organization_tax_policies")
    .select("id,organization_id,jurisdiction_code,tax_name,registration_status,comparison_basis,standard_rate,supports_inclusive_exclusive,effective_from,effective_to,policy_source")
    .eq("organization_id", params.organizationId)
    .lte("effective_from", at)
    .or(`effective_to.is.null,effective_to.gt.${at}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapOrganizationTaxPolicy(data as PolicyRow) : null;
}

export async function resolveUniqueOrganizationTaxPolicyAt(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  effectiveAt: string;
}): Promise<{ status: "resolved"; policy: OrganizationTaxPolicy & { id: string } } | { status: "missing" | "ambiguous"; policy: null }> {
  const { data, error } = await (params.supabase as unknown as SupabaseClient)
    .from("organization_tax_policies")
    .select("id,organization_id,jurisdiction_code,tax_name,registration_status,comparison_basis,standard_rate,supports_inclusive_exclusive,effective_from,effective_to,policy_source")
    .eq("organization_id", params.organizationId)
    .lte("effective_from", params.effectiveAt)
    .or(`effective_to.is.null,effective_to.gt.${params.effectiveAt}`)
    .order("effective_from", { ascending: false })
    .limit(2);
  if (error) throw new Error(error.message);
  if (!data?.length) return { status: "missing", policy: null };
  if (data.length !== 1) return { status: "ambiguous", policy: null };
  return {
    status: "resolved",
    policy: mapOrganizationTaxPolicy(data[0] as PolicyRow) as OrganizationTaxPolicy & { id: string },
  };
}

export function buildPriceTaxSnapshot(params: {
  sourceTaxBasis: SourceTaxBasis;
  explicitSourceTaxRate?: number | null;
  policy: OrganizationTaxPolicy | null;
  evidence?: Record<string, unknown> | null;
  confirmation?: { source: "document_extracted" | "user_confirmed" | "manual_default"; actorUserId?: string | null; confirmedAt?: string | null };
}): PriceTaxSnapshot {
  const applicableRate = params.sourceTaxBasis === "zero_rated" || params.sourceTaxBasis === "no_tax"
    ? 0
    : params.explicitSourceTaxRate ?? null;
  return {
    sourceTaxBasis: params.sourceTaxBasis,
    sourceTaxRate: applicableRate,
    taxJurisdictionCode: params.policy?.jurisdictionCode ?? null,
    comparisonTaxBasis: params.policy?.comparisonBasis ?? null,
    comparisonTaxRate: params.policy?.standardRate ?? null,
    taxPolicySnapshot: params.policy ? {
      policyId: params.policy.id,
      jurisdictionCode: params.policy.jurisdictionCode,
      taxName: params.policy.taxName,
      registrationStatus: params.policy.registrationStatus,
      comparisonBasis: params.policy.comparisonBasis,
      standardRate: params.policy.standardRate,
      supportsInclusiveExclusive: params.policy.supportsInclusiveExclusive,
      effectiveFrom: params.policy.effectiveFrom,
      effectiveTo: params.policy.effectiveTo,
      policySource: params.policy.policySource,
    } : { resolutionStatus: "missing_policy" },
    taxEvidence: {
      ...(params.evidence ?? {}),
      confirmationSource: params.confirmation?.source ?? "manual_default",
      actorUserId: params.confirmation?.actorUserId ?? null,
      confirmedAt: params.confirmation?.confirmedAt ?? null,
    },
  };
}
