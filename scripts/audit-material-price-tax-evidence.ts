import { createClient } from "@supabase/supabase-js";
import { loadSupplierPriceTaxEvidenceReviews } from "../lib/materials/tax-evidence-review";
import { buildTaxEvidenceReconciliationDryRun } from "../lib/materials/tax-evidence-reconciliation";
import type { OrganizationTaxPolicy } from "../lib/tax/types";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const organizationId = argument("--organization-id");
  if (!organizationId) throw new Error("--organization-id is required");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase environment is required");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const reviews = await loadSupplierPriceTaxEvidenceReviews({ supabase, organizationId });
  const { data: policyRows, error } = await supabase
    .from("organization_tax_policies")
    .select("*")
    .eq("organization_id", organizationId)
    .order("effective_from", { ascending: true });
  if (error) throw error;
  const policies = (policyRows ?? []).map((row): OrganizationTaxPolicy => ({
  id: row.id,
  organizationId: row.organization_id,
  jurisdictionCode: row.jurisdiction_code,
  taxName: row.tax_name,
  registrationStatus: row.registration_status as OrganizationTaxPolicy["registrationStatus"],
  comparisonBasis: row.comparison_basis as OrganizationTaxPolicy["comparisonBasis"],
  standardRate: Number(row.standard_rate),
  supportsInclusiveExclusive: row.supports_inclusive_exclusive,
  effectiveFrom: row.effective_from,
  effectiveTo: row.effective_to,
  policySource: row.policy_source,
  }));
  const allowlist = (argument("--allowlist") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const affected = reviews.filter((review) => review.needsReview);
  const dryRun = buildTaxEvidenceReconciliationDryRun({ reviews, policies, allowlist });

  process.stdout.write(`${JSON.stringify({
  organizationId,
  dataClass: reviews[0]?.dataClass ?? "business",
  counts: {
    total: reviews.length,
    affected: affected.length,
    current: affected.filter((review) => review.isCurrent).length,
    historical: affected.filter((review) => !review.isCurrent).length,
    currentSearchable: affected.filter((review) => review.isCurrent && review.productIsSearchable).length,
  },
  dryRun,
  affected,
  }, null, 2)}\n`);
}

void main();
