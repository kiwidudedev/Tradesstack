import { requireHostedTestCredentials } from "./hosted-test-credentials.mjs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const acknowledgement = process.env.STAGE6_HOSTED_MUTATION_ACK?.trim();
const EXPECTED_PROJECT_REFERENCE = "mvxyxvrxaorzglppxzzz";
const ORGANIZATION_ID = "92791137-1e95-4aec-a86e-b6e25f7dbc3c";
const OWNER_ID = "95c0497d-7275-40ae-bdb0-8048a1e451a7";
const { email: OWNER_EMAIL, password: OWNER_PASSWORD } = requireHostedTestCredentials("owner");
const REQUIRED_ACK = "I_ACKNOWLEDGE_STAGE6_HOSTED_DEVELOPMENT_MUTATIONS";

if (!url || !anonKey || !serviceKey || acknowledgement !== REQUIRED_ACK) {
  throw new Error("Missing Stage 6 hosted-development environment or acknowledgement.");
}
if (new URL(url).hostname.split(".")[0] !== EXPECTED_PROJECT_REFERENCE) {
  throw new Error("Refusing unexpected Supabase project.");
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const actor = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

function data(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.code ?? "error"} ${result.error.message}`);
  return result.data;
}

const login = await actor.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
if (login.error || login.data.user?.id !== OWNER_ID) throw new Error("Exact Stage 6 actor login failed.");

const initialControl = data(await admin.from("opportunity_lifecycle_rollout_controls")
  .select("allowed_strategy,creation_enabled,promotion_enabled,pilot_scope,pilot_environment")
  .eq("organization_id", ORGANIZATION_ID).single(), "load control");
if (initialControl.allowed_strategy !== "promote_workspace_v1"
  || initialControl.creation_enabled !== true || initialControl.promotion_enabled !== true
  || initialControl.pilot_scope !== "hosted_development_allowlist"
  || initialControl.pilot_environment !== "hosted_development") {
  throw new Error("Exact hosted-development allowlist is not enabled before rollback.");
}

const existingClient = data(await admin.from("organization_clients").select("id")
  .eq("organization_id", ORGANIZATION_ID).limit(1).single(), "load client");
const beforeDirect = data(await admin.from("organization_projects")
  .select("id,slug,project_code,stage")
  .eq("organization_id", ORGANIZATION_ID).is("source_opportunity_id", null), "snapshot direct Projects");
const beforeMappings = data(await admin.from("opportunity_final_projects")
  .select("opportunity_id,project_id,accepted_quote_id")
  .eq("organization_id", ORGANIZATION_ID), "snapshot mappings");
const beforePromotions = data(await admin.from("opportunity_promotion_events")
  .select("opportunity_id,project_id,evidence_hash")
  .eq("organization_id", ORGANIZATION_ID), "snapshot promotion events");

async function createControlled(name) {
  const result = await actor.rpc("create_opportunity_workspace_controlled_v1", {
    p_organization_id: ORGANIZATION_ID,
    p_creation_request_id: randomUUID(),
    p_name: name,
    p_client_id: existingClient.id,
    p_new_client: null,
    p_owner_user_id: OWNER_ID,
    p_location: "Stage 6 Hosted Development Rollback",
    p_due_date: null,
    p_estimated_value: 1150,
    p_notes: "Stage 6 rollback fixture",
  });
  return data(result, `create ${name}`)?.[0];
}

async function addAcceptedQuote(fixture, prefix) {
  const quoteId = randomUUID();
  const lineId = randomUUID();
  data(await admin.from("project_quotes").insert({
    id: quoteId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspace_project_id,
    created_by: OWNER_ID,
    quote_title: `${prefix} Contract`,
    quote_number: `${prefix}-Q-1`,
    status: "Accepted",
    originating_opportunity_id: fixture.opportunity_id,
    source_opportunity_id: fixture.opportunity_id,
    quote_date: new Date().toISOString().slice(0, 10),
    subtotal: 1000,
    gst_percent: 15,
    gst_amount: 150,
    total_quote_price: 1150,
    retention_percent_default: 10,
  }), "insert accepted quote");
  data(await admin.from("project_quote_line_items").insert({
    id: lineId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspace_project_id,
    quote_id: quoteId,
    section: "Labour",
    description: `${prefix} baseline`,
    quantity: 10,
    unit: "hour",
    rate: 100,
    total: 1000,
    sort_order: 0,
  }), "insert accepted quote line");
  return quoteId;
}

const stamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
const paused = await createControlled(`S6-ROLLBACK-${stamp} Paused Promotion`);
const pausedQuoteId = await addAcceptedQuote(paused, `S6-RB-${stamp}-PAUSED`);
const pausedLifecycleBefore = data(await admin.from("opportunity_lifecycles")
  .select("strategy,original_workspace_project_id").eq("opportunity_id", paused.opportunity_id).single(), "load paused lifecycle");
if (pausedLifecycleBefore.strategy !== "promote_workspace_v1"
  || pausedLifecycleBefore.original_workspace_project_id !== paused.workspace_project_id) {
  throw new Error("Pre-disable fixture did not receive immutable promotion strategy.");
}

data(await admin.from("opportunity_lifecycle_rollout_controls").upsert({
  organization_id: ORGANIZATION_ID,
  allowed_strategy: "legacy_two_project_v1",
  creation_enabled: true,
  promotion_enabled: false,
  pilot_scope: "disabled",
  pilot_environment: "disabled",
  updated_by: OWNER_ID,
  updated_at: new Date().toISOString(),
}), "disable hosted promotion control");

const pausedAward = await actor.rpc("award_opportunity_by_lifecycle_v1", {
  p_organization_id: ORGANIZATION_ID,
  p_opportunity_id: paused.opportunity_id,
  p_accepted_quote_id: pausedQuoteId,
  p_correlation_id: randomUUID(),
});
if (!pausedAward.error || pausedAward.error.code !== "TS409") {
  throw new Error("Disabled promotion Opportunity did not fail closed with TS409.");
}

const [pausedOpportunity, pausedLifecycleAfter, pausedMapping, pausedEvents, pausedProjects] = await Promise.all([
  admin.from("organization_opportunities").select("workspace_project_id,converted_project_id").eq("id", paused.opportunity_id).single(),
  admin.from("opportunity_lifecycles").select("strategy,original_workspace_project_id").eq("opportunity_id", paused.opportunity_id).single(),
  admin.from("opportunity_final_projects").select("project_id", { count: "exact" }).eq("opportunity_id", paused.opportunity_id),
  admin.from("opportunity_promotion_events").select("id", { count: "exact" }).eq("opportunity_id", paused.opportunity_id),
  admin.from("organization_projects").select("id", { count: "exact" }).eq("source_opportunity_id", paused.opportunity_id),
]);
for (const result of [pausedOpportunity, pausedLifecycleAfter, pausedMapping, pausedEvents, pausedProjects]) if (result.error) throw result.error;
if (pausedOpportunity.data.workspace_project_id !== paused.workspace_project_id
  || pausedOpportunity.data.converted_project_id !== null
  || pausedLifecycleAfter.data.strategy !== "promote_workspace_v1"
  || pausedMapping.count !== 0 || pausedEvents.count !== 0 || pausedProjects.count !== 1) {
  throw new Error("Disabled promotion left mixed state or changed immutable strategy.");
}

const legacy = await createControlled(`S6-ROLLBACK-${stamp} Legacy After Disable`);
const legacyQuoteId = await addAcceptedQuote(legacy, `S6-RB-${stamp}-LEGACY`);
const legacyLifecycle = data(await admin.from("opportunity_lifecycles")
  .select("strategy,original_workspace_project_id").eq("opportunity_id", legacy.opportunity_id).single(), "load legacy lifecycle");
if (legacyLifecycle.strategy !== "legacy_two_project_v1") {
  throw new Error("New Opportunity received promotion strategy after disablement.");
}
const legacyAward = data(await actor.rpc("award_opportunity_by_lifecycle_v1", {
  p_organization_id: ORGANIZATION_ID,
  p_opportunity_id: legacy.opportunity_id,
  p_accepted_quote_id: legacyQuoteId,
  p_correlation_id: randomUUID(),
}), "award legacy rollback fixture")?.[0];
const [legacyOpportunity, legacyMapping, legacyEvents, legacyProjects] = await Promise.all([
  admin.from("organization_opportunities").select("workspace_project_id,converted_project_id").eq("id", legacy.opportunity_id).single(),
  admin.from("opportunity_final_projects").select("project_id,accepted_quote_id").eq("opportunity_id", legacy.opportunity_id).single(),
  admin.from("opportunity_promotion_events").select("id", { count: "exact" }).eq("opportunity_id", legacy.opportunity_id),
  admin.from("organization_projects").select("id", { count: "exact" }).eq("source_opportunity_id", legacy.opportunity_id),
]);
for (const result of [legacyOpportunity, legacyMapping, legacyEvents, legacyProjects]) if (result.error) throw result.error;
if (!legacyOpportunity.data.converted_project_id
  || legacyOpportunity.data.converted_project_id === legacy.workspace_project_id
  || legacyMapping.data.project_id !== legacyOpportunity.data.converted_project_id
  || legacyMapping.data.accepted_quote_id !== legacyQuoteId
  || legacyEvents.count !== 0 || legacyProjects.count !== 2
  || legacyAward.project_id !== legacyOpportunity.data.converted_project_id) {
  throw new Error("Legacy award path did not preserve the two-Project model after disablement.");
}

const [afterDirect, afterMappings, afterPromotions, finalControl] = await Promise.all([
  admin.from("organization_projects").select("id,slug,project_code,stage")
    .eq("organization_id", ORGANIZATION_ID).is("source_opportunity_id", null),
  admin.from("opportunity_final_projects").select("opportunity_id,project_id,accepted_quote_id")
    .eq("organization_id", ORGANIZATION_ID),
  admin.from("opportunity_promotion_events").select("opportunity_id,project_id,evidence_hash")
    .eq("organization_id", ORGANIZATION_ID),
  admin.from("opportunity_lifecycle_rollout_controls")
    .select("allowed_strategy,creation_enabled,promotion_enabled,pilot_scope,pilot_environment")
    .eq("organization_id", ORGANIZATION_ID).single(),
]);
for (const result of [afterDirect, afterMappings, afterPromotions, finalControl]) if (result.error) throw result.error;
const stable = (rows) => JSON.stringify([...rows].sort((a, b) => a.id?.localeCompare(b.id) ?? a.opportunity_id.localeCompare(b.opportunity_id)));
if (stable(afterDirect.data) !== stable(beforeDirect)) throw new Error("Direct Project snapshot changed during rollback.");
const historicalAfter = afterMappings.data.filter((row) => beforeMappings.some((before) => before.opportunity_id === row.opportunity_id));
if (stable(historicalAfter) !== stable(beforeMappings)) throw new Error("Existing final mappings changed during rollback.");
if (stable(afterPromotions.data.filter((row) => beforePromotions.some((before) => before.opportunity_id === row.opportunity_id))) !== stable(beforePromotions)) {
  throw new Error("Completed promotion events changed during rollback.");
}

console.log(JSON.stringify({
  mode: "stage6_hosted_rollback_exercise",
  projectReference: EXPECTED_PROJECT_REFERENCE,
  organizationId: ORGANIZATION_ID,
  finalControl: finalControl.data,
  completedPromotionsPreserved: beforePromotions.length,
  pausedPromotion: {
    opportunityId: paused.opportunity_id,
    workspaceProjectId: paused.workspace_project_id,
    strategy: pausedLifecycleAfter.data.strategy,
    awardError: pausedAward.error.code,
    mappings: pausedMapping.count,
    promotionEvents: pausedEvents.count,
    projects: pausedProjects.count,
  },
  postDisableLegacy: {
    opportunityId: legacy.opportunity_id,
    workspaceProjectId: legacy.workspace_project_id,
    finalProjectId: legacyOpportunity.data.converted_project_id,
    strategy: legacyLifecycle.strategy,
    projects: legacyProjects.count,
    promotionEvents: legacyEvents.count,
  },
  directProjectsPreserved: beforeDirect.length,
  historicalMappingsPreserved: beforeMappings.length,
}, null, 2));
