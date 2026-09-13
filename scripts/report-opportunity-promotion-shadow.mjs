import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const filename of [".env.test.local", ".env.local", ".env"]) {
  const path = resolve(process.cwd(), filename);
  if (existsSync(path)) process.loadEnvFile(path);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const organizationId = process.argv[2]?.trim();
if (!url || !key || !organizationId) {
  throw new Error("Usage: npm run report:opportunity-shadow -- <organization-id>");
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const [{ data: summary, error: summaryError }, { data: runs, error: runsError }] = await Promise.all([
  client.rpc("get_opportunity_promotion_shadow_summary_v1", {
    p_organization_id: organizationId,
  }),
  client
    .from("opportunity_promotion_shadow_runs")
    .select("id,opportunity_id,workspace_project_id,final_project_id,evaluator_version,status,eligibility_result,eligibility_failure_codes,comparison_result,mismatch_codes,expected_difference_codes,pre_observed_at,compared_at")
    .eq("organization_id", organizationId)
    .order("pre_observed_at", { ascending: true }),
]);
if (summaryError) throw summaryError;
if (runsError) throw runsError;

function distribution(field) {
  const counts = {};
  for (const run of runs ?? []) {
    for (const code of run[field] ?? []) counts[code] = (counts[code] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

console.log(JSON.stringify({
  mode: "read_only_content_minimized_shadow_report",
  organizationId,
  summary: summary?.[0] ?? null,
  failureCodeDistribution: distribution("eligibility_failure_codes"),
  mismatchCodeDistribution: distribution("mismatch_codes"),
  expectedDifferenceCodeDistribution: distribution("expected_difference_codes"),
  runs: runs ?? [],
}, null, 2));
