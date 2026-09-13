import { createClient } from "@supabase/supabase-js";

const [operation = "status", environment = "hosted_development", actorUserId, actorOrganizationId, expectedOrganizationName] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const allowedOperations = ["status", "activate-promotion", "set-legacy", "disable"];
const allowedEnvironments = ["local_development", "hosted_development"];

if (!url || !key || !allowedOperations.includes(operation) || !allowedEnvironments.includes(environment)) {
  throw new Error(
    "Usage: node scripts/manage-opportunity-lifecycle-default.mjs <status|activate-promotion|set-legacy|disable> <local_development|hosted_development> [actor-user-id] [actor-organization-id] [exact-organization-name]",
  );
}

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const projectReference = new URL(url).hostname.split(".")[0];

const policyResult = await client
  .from("opportunity_lifecycle_default_policy")
  .select("environment,default_strategy,creation_enabled,promotion_enabled,effective_from,configured_by,configured_at")
  .eq("singleton", true)
  .maybeSingle();
if (policyResult.error) throw policyResult.error;

if (operation === "status") {
  const events = await client
    .from("opportunity_lifecycle_default_policy_events")
    .select("id,operation,environment,changed_by,changed_at", { count: "exact" })
    .order("changed_at", { ascending: false })
    .limit(5);
  if (events.error) throw events.error;
  console.log(JSON.stringify({
    projectReference,
    policy: policyResult.data,
    auditEventCount: events.count ?? 0,
    latestAuditEvents: events.data,
  }, null, 2));
  process.exit(0);
}

if (!actorUserId || !actorOrganizationId || !expectedOrganizationName) {
  throw new Error("Mutating operations require actor, actor organization, and exact organization name.");
}
if (environment === "hosted_development" && projectReference !== "mvxyxvrxaorzglppxzzz") {
  throw new Error(`Refusing unexpected hosted-development project: ${projectReference}`);
}

const [organization, membership, actor] = await Promise.all([
  client.from("organizations").select("id,name").eq("id", actorOrganizationId).maybeSingle(),
  client.from("organization_members").select("role").eq("organization_id", actorOrganizationId).eq("user_id", actorUserId).maybeSingle(),
  client.auth.admin.getUserById(actorUserId),
]);
if (organization.error || membership.error || actor.error) {
  throw organization.error ?? membership.error ?? actor.error;
}
if (!organization.data || organization.data.name !== expectedOrganizationName) {
  throw new Error("Exact actor organization-name confirmation failed.");
}
if (!membership.data || !["owner", "admin"].includes(membership.data.role)) {
  throw new Error("Default-policy actor must be an organization owner or administrator.");
}
const actorEmail = actor.data.user?.email?.toLowerCase() ?? "";
if (!actorEmail.endsWith("@tradesstack.local")) {
  throw new Error("Default-policy actor must use the approved development fixture domain.");
}

const next = operation === "activate-promotion"
  ? { default_strategy: "promote_workspace_v1", creation_enabled: true, promotion_enabled: true }
  : operation === "set-legacy"
    ? { default_strategy: "legacy_two_project_v1", creation_enabled: true, promotion_enabled: false }
    : { default_strategy: "promote_workspace_v1", creation_enabled: false, promotion_enabled: false };

const effectiveFrom = new Date().toISOString();
const write = await client.from("opportunity_lifecycle_default_policy").upsert({
  singleton: true,
  environment,
  ...next,
  effective_from: effectiveFrom,
  configured_by: actorUserId,
  configured_at: effectiveFrom,
}, { onConflict: "singleton" }).select("environment,default_strategy,creation_enabled,promotion_enabled,effective_from,configured_by,configured_at").single();
if (write.error) throw write.error;

console.log(JSON.stringify({
  projectReference,
  operation,
  policy: write.data,
}, null, 2));
