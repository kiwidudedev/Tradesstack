import { createClient } from "@supabase/supabase-js";

const [operation = "status", organizationId, actorUserId, expectedOrganizationName] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key || !organizationId) {
  throw new Error(
    "Usage: node scripts/manage-opportunity-promotion-rollout.mjs <status|enable-hosted|disable> <organization-id> [actor-user-id] [exact-organization-name]",
  );
}

if (!['status', 'enable-hosted', 'disable'].includes(operation)) {
  throw new Error(`Unsupported operation: ${operation}`);
}

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function projectReference() {
  try {
    return new URL(url).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function findUser(userId) {
  for (let page = 1; page <= 5; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (result.error) throw result.error;
    const user = result.data.users.find((candidate) => candidate.id === userId);
    if (user) return user;
    if (result.data.users.length < 200) break;
  }
  return null;
}

const organizationResult = await client
  .from("organizations")
  .select("id,name")
  .eq("id", organizationId)
  .maybeSingle();
if (organizationResult.error) throw organizationResult.error;
if (!organizationResult.data) throw new Error("Organization not found.");

const controlResult = await client
  .from("opportunity_lifecycle_rollout_controls")
  .select("organization_id,allowed_strategy,creation_enabled,promotion_enabled,pilot_scope,pilot_environment,override_enabled,updated_by,updated_at")
  .eq("organization_id", organizationId)
  .maybeSingle();
if (controlResult.error) throw controlResult.error;

if (operation === "status") {
  console.log(JSON.stringify({
    projectReference: projectReference(),
    organization: organizationResult.data,
    control: controlResult.data,
  }, null, 2));
  process.exit(0);
}

if (!actorUserId || !expectedOrganizationName) {
  throw new Error("Mutating operations require actor-user-id and the exact organization name.");
}
if (organizationResult.data.name !== expectedOrganizationName) {
  throw new Error("Exact organization-name confirmation failed.");
}

const actor = await findUser(actorUserId);
if (!actor?.email) throw new Error("Administrative actor was not found.");
const actorDomain = actor.email.split("@")[1]?.toLowerCase();
if (!actorDomain || !["tradesstack.local", "example.com"].includes(actorDomain)) {
  throw new Error("Actor does not use an approved hosted-development email domain.");
}

const membershipResult = await client
  .from("organization_members")
  .select("role")
  .eq("organization_id", organizationId)
  .eq("user_id", actorUserId)
  .maybeSingle();
if (membershipResult.error) throw membershipResult.error;
if (!membershipResult.data || !["owner", "admin"].includes(membershipResult.data.role)) {
  throw new Error("Actor is not an owner or administrator of the exact organization.");
}

const nextControl = operation === "enable-hosted"
  ? {
      organization_id: organizationId,
      allowed_strategy: "promote_workspace_v1",
      creation_enabled: true,
      promotion_enabled: true,
      pilot_scope: "hosted_development_allowlist",
      pilot_environment: "hosted_development",
      override_enabled: true,
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
    }
  : {
      organization_id: organizationId,
      allowed_strategy: "legacy_two_project_v1",
      creation_enabled: true,
      promotion_enabled: false,
      pilot_scope: "disabled",
      pilot_environment: "disabled",
      override_enabled: false,
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
    };

const writeResult = await client
  .from("opportunity_lifecycle_rollout_controls")
  .upsert(nextControl, { onConflict: "organization_id" })
  .select("organization_id,allowed_strategy,creation_enabled,promotion_enabled,pilot_scope,pilot_environment,override_enabled,updated_by,updated_at")
  .single();
if (writeResult.error) throw writeResult.error;

console.log(JSON.stringify({
  projectReference: projectReference(),
  organization: organizationResult.data,
  operation,
  actor: { id: actor.id, emailDomain: actorDomain },
  previousControl: controlResult.data,
  nextControl: writeResult.data,
}, null, 2));
