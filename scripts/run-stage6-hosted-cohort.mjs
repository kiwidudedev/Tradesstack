import { requireHostedTestCredentials } from "./hosted-test-credentials.mjs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const acknowledgement = process.env.STAGE6_HOSTED_MUTATION_ACK?.trim();
const cohort = process.argv[2]?.trim();
const requestedCount = process.argv[3] ? Number(process.argv[3]) : null;

const EXPECTED_PROJECT_REFERENCE = "mvxyxvrxaorzglppxzzz";
const ORGANIZATION_ID = "92791137-1e95-4aec-a86e-b6e25f7dbc3c";
const ORGANIZATION_NAME = "Supplier Invoice E2E Org";
const OWNER_ID = "95c0497d-7275-40ae-bdb0-8048a1e451a7";
const { email: OWNER_EMAIL, password: OWNER_PASSWORD } = requireHostedTestCredentials("owner");
const { email: COHORT2_EMAIL, password: COHORT2_PASSWORD } = cohort === "cohort2"
  ? requireHostedTestCredentials("manager")
  : {};
const REQUIRED_ACK = "I_ACKNOWLEDGE_STAGE6_HOSTED_DEVELOPMENT_MUTATIONS";

if (!url || !anonKey || !serviceKey || !["cohort1", "cohort2"].includes(cohort ?? "")) {
  throw new Error("Usage: node scripts/run-stage6-hosted-cohort.mjs <cohort1|cohort2> [count]");
}
if (requestedCount !== null && (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 10)) {
  throw new Error("Cohort count must be an integer from 1 to 10.");
}
if (acknowledgement !== REQUIRED_ACK) {
  throw new Error("Missing exact Stage 6 hosted-development mutation acknowledgement.");
}

const projectReference = new URL(url).hostname.split(".")[0];
if (projectReference !== EXPECTED_PROJECT_REFERENCE) {
  throw new Error(`Refusing unexpected Supabase project: ${projectReference}`);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const actor = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function resultData(result, operation) {
  if (result.error) {
    throw new Error(`${operation}: ${result.error.code ?? "error"} ${result.error.message}`);
  }
  return result.data;
}

async function insert(table, value) {
  resultData(await admin.from(table).insert(value), `insert ${table}`);
}

async function verifyTarget() {
  const organization = resultData(
    await admin.from("organizations").select("id,name").eq("id", ORGANIZATION_ID).single(),
    "load organization",
  );
  if (organization.name !== ORGANIZATION_NAME) throw new Error("Exact organization mismatch.");

  const membership = resultData(
    await admin
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("user_id", OWNER_ID)
      .single(),
    "load owner membership",
  );
  if (!['owner', 'admin'].includes(membership.role)) throw new Error("Stage 6 actor is not an administrator.");

  const control = resultData(
    await admin
      .from("opportunity_lifecycle_rollout_controls")
      .select("allowed_strategy,creation_enabled,promotion_enabled,pilot_scope,pilot_environment")
      .eq("organization_id", ORGANIZATION_ID)
      .single(),
    "load rollout control",
  );
  const expected = control.allowed_strategy === "promote_workspace_v1"
    && control.creation_enabled === true
    && control.promotion_enabled === true
    && control.pilot_scope === "hosted_development_allowlist"
    && control.pilot_environment === "hosted_development";
  if (!expected) throw new Error("Exact hosted-development allowlist is not enabled.");

  const login = await actor.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  if (login.error || login.data.user?.id !== OWNER_ID) {
    throw new Error(`Hosted test-user login failed: ${login.error?.message ?? "identity mismatch"}`);
  }
}

async function setControl(mode) {
  const hosted = mode === "hosted";
  resultData(await admin.from("opportunity_lifecycle_rollout_controls").upsert({
    organization_id: ORGANIZATION_ID,
    allowed_strategy: hosted ? "promote_workspace_v1" : "legacy_two_project_v1",
    creation_enabled: true,
    promotion_enabled: hosted,
    pilot_scope: hosted ? "hosted_development_allowlist" : "disabled",
    pilot_environment: hosted ? "hosted_development" : "disabled",
    updated_by: OWNER_ID,
    updated_at: new Date().toISOString(),
  }), `set ${mode} control`);
}

async function ensureCohort2Actor() {
  let user = null;
  for (let page = 1; page <= 5 && !user; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    user = listed.data.users.find((candidate) => candidate.email?.toLowerCase() === COHORT2_EMAIL) ?? null;
    if (listed.data.users.length < 200) break;
  }
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: COHORT2_EMAIL,
      password: COHORT2_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Stage 6 Cohort 2 Project Manager" },
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("Cohort 2 user creation failed.");
    user = created.data.user;
  }

  const memberships = resultData(
    await admin.from("organization_members").select("organization_id").eq("user_id", user.id),
    "load Cohort 2 memberships",
  );
  for (const membership of memberships) {
    if (membership.organization_id === ORGANIZATION_ID) continue;
    const automaticOrg = resultData(
      await admin.from("organizations").select("id,name,created_by").eq("id", membership.organization_id).maybeSingle(),
      "load automatic Cohort 2 organization",
    );
    if (automaticOrg?.created_by !== user.id || !/stage\s*6[-\s]cohort\s*2/i.test(automaticOrg.name)) {
      throw new Error("Cohort 2 user has a non-fixture organization; refusing reassignment.");
    }
    const [memberCount, opportunityCount, projectCount] = await Promise.all([
      admin.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", automaticOrg.id),
      admin.from("organization_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", automaticOrg.id),
      admin.from("organization_projects").select("id", { count: "exact", head: true }).eq("organization_id", automaticOrg.id),
    ]);
    if (memberCount.error || opportunityCount.error || projectCount.error) {
      throw memberCount.error ?? opportunityCount.error ?? projectCount.error;
    }
    if (memberCount.count !== 1 || opportunityCount.count !== 0 || projectCount.count !== 0) {
      throw new Error("Cohort 2 signup organization is not empty; refusing removal.");
    }
    resultData(
      await admin.from("organizations").delete().eq("id", automaticOrg.id).eq("created_by", user.id),
      "remove exact empty Cohort 2 signup organization",
    );
  }

  resultData(await admin.from("organization_members").upsert({
    organization_id: ORGANIZATION_ID,
    user_id: user.id,
    role: "project_manager",
    display_name: "Stage 6 Cohort 2 Project Manager",
  }, { onConflict: "user_id" }), "attach Cohort 2 project manager");

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const login = await client.auth.signInWithPassword({
    email: COHORT2_EMAIL,
    password: COHORT2_PASSWORD,
  });
  if (login.error || login.data.user?.id !== user.id) {
    throw new Error(`Cohort 2 login failed: ${login.error?.message ?? "identity mismatch"}`);
  }
  return { client, userId: user.id, role: "project_manager" };
}

async function createOpportunity(actorClient, actorUserId, index, existingClientId, prefix) {
  const requestId = randomUUID();
  const name = `${prefix} Opportunity ${String(index).padStart(2, "0")}`;
  const rpc = await actorClient.rpc("create_opportunity_workspace_controlled_v1", {
    p_organization_id: ORGANIZATION_ID,
    p_creation_request_id: requestId,
    p_name: name,
    p_client_id: index === 2 ? null : existingClientId,
    p_new_client: index === 2
      ? { name: `${prefix} Client`, company_name: `${prefix} Client Limited` }
      : null,
    p_owner_user_id: actorUserId,
    p_location: "Stage 6 Hosted Development",
    p_due_date: null,
    p_estimated_value: 1150 + index,
    p_notes: "Stage 6 hosted-development fixture",
  });
  const row = resultData(rpc, `create ${name}`)?.[0];
  if (!row?.opportunity_id || !row.workspace_project_id) throw new Error(`Creation returned no O/W for ${name}`);

  const retry = resultData(await actorClient.rpc("create_opportunity_workspace_controlled_v1", {
    p_organization_id: ORGANIZATION_ID,
    p_creation_request_id: requestId,
    p_name: name,
    p_client_id: index === 2 ? null : existingClientId,
    p_new_client: index === 2
      ? { name: `${prefix} Client`, company_name: `${prefix} Client Limited` }
      : null,
    p_owner_user_id: actorUserId,
    p_location: "Stage 6 Hosted Development",
    p_due_date: null,
    p_estimated_value: 1150 + index,
    p_notes: "Stage 6 hosted-development fixture",
  }), `retry ${name}`)?.[0];
  if (retry.opportunity_id !== row.opportunity_id || retry.records_created !== false) {
    throw new Error(`Creation retry was not idempotent for ${name}`);
  }

  const project = resultData(
    await admin
      .from("organization_projects")
      .select("id,slug,project_code,source_opportunity_id")
      .eq("id", row.workspace_project_id)
      .single(),
    "load workspace project",
  );
  return {
    name,
    requestId,
    opportunityId: row.opportunity_id,
    opportunitySlug: row.opportunity_slug,
    workspaceProjectId: row.workspace_project_id,
    workspaceSlug: project.slug,
    workspaceCode: project.project_code,
  };
}

async function addFeatureData(fixture, index, prefix) {
  const quoteId = randomUUID();
  const quoteLineId = randomUUID();
  await insert("project_quotes", {
    id: quoteId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    created_by: OWNER_ID,
    quote_title: `${prefix} Contract ${index}`,
    quote_number: `${prefix}-Q-${index}`,
    status: "Accepted",
    originating_opportunity_id: fixture.opportunityId,
    source_opportunity_id: fixture.opportunityId,
    quote_date: new Date().toISOString().slice(0, 10),
    subtotal: 1000,
    gst_percent: 15,
    gst_amount: 150,
    total_quote_price: 1150,
    retention_percent_default: 10,
  });
  await insert("project_quote_line_items", {
    id: quoteLineId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    quote_id: quoteId,
    section: "Labour",
    description: `${prefix} baseline`,
    quantity: 10,
    unit: "hour",
    rate: 100,
    total: 1000,
    sort_order: 0,
  });

  const drawingId = randomUUID();
  const drawingPath = `${ORGANIZATION_ID}/${fixture.workspaceProjectId}/${prefix.toLowerCase()}-${index}.pdf`;
  await insert("project_drawing_sets", {
    id: drawingId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    uploaded_by: OWNER_ID,
    file_name: `${prefix}-${index}.pdf`,
    storage_path: drawingPath,
    file_size_bytes: 100,
    mime_type: "application/pdf",
  });
  await insert("trade_packs", {
    id: drawingId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    trade_id: "carpentry",
    trade_label: "Carpentry",
    pdf_url: drawingPath,
    page_index_json: [],
    created_by: OWNER_ID,
  });
  const scopeRunId = randomUUID();
  await insert("scope_runs", {
    id: scopeRunId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    trade_pack_id: drawingId,
    created_by: OWNER_ID,
    status: "complete",
    result_json: {},
  });

  const pageId = randomUUID();
  await insert("takeoff_pages", {
    id: pageId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    opportunity_id: fixture.opportunityId,
    drawing_set_id: drawingId,
    page_number: 1,
    page_width_pts: 595,
    page_height_pts: 842,
    created_by: OWNER_ID,
  });
  const calibrationId = randomUUID();
  await insert("takeoff_calibrations", {
    id: calibrationId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    opportunity_id: fixture.opportunityId,
    page_id: pageId,
    name: `${prefix} scale`,
    scale_ratio: 100,
    unit_system: "metric",
    base_unit: "mm",
    display_unit: "m",
    reference_length_input: 1,
    reference_length_base: 1000,
    point_a_x: 0.1,
    point_a_y: 0.1,
    point_b_x: 0.2,
    point_b_y: 0.1,
    is_active: true,
    created_by: OWNER_ID,
  });
  const measurementId = randomUUID();
  await insert("takeoff_measurements", {
    id: measurementId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    opportunity_id: fixture.opportunityId,
    drawing_set_id: drawingId,
    page_id: pageId,
    calibration_id: calibrationId,
    measurement_kind: "line",
    quantity: 2,
    measured_length_base: 2000,
    display_value: 2,
    display_unit: "m",
    created_by: OWNER_ID,
  });
  await insert("takeoff_measurement_points", [
    { organization_id: ORGANIZATION_ID, measurement_id: measurementId, point_order: 0, x: 0.1, y: 0.1 },
    { organization_id: ORGANIZATION_ID, measurement_id: measurementId, point_order: 1, x: 0.2, y: 0.1 },
  ]);
  await insert("takeoff_measurement_events", {
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    opportunity_id: fixture.opportunityId,
    measurement_id: measurementId,
    event_type: "created",
    version: 1,
    actor_user_id: OWNER_ID,
    snapshot: {},
  });

  const taskId = randomUUID();
  await insert("project_job_todos", {
    id: taskId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    opportunity_id: fixture.opportunityId,
    created_by: OWNER_ID,
    title: `${prefix} task ${index}`,
    assigned_user_id: OWNER_ID,
  });

  const workbookId = randomUUID();
  const sheetId = randomUUID();
  await insert("opportunity_pricing_worksheets", {
    id: workbookId,
    organization_id: ORGANIZATION_ID,
    opportunity_id: fixture.opportunityId,
    project_id: fixture.workspaceProjectId,
    name: `${prefix} workbook ${index}`,
    created_by: OWNER_ID,
    updated_by: OWNER_ID,
  });
  await insert("opportunity_pricing_workbook_sheets", {
    id: sheetId,
    workbook_id: workbookId,
    organization_id: ORGANIZATION_ID,
    opportunity_id: fixture.opportunityId,
    name: "Pricing",
    is_default: true,
    created_by: OWNER_ID,
    updated_by: OWNER_ID,
  });
  await insert("commercial_items", {
    id: randomUUID(),
    organization_id: ORGANIZATION_ID,
    opportunity_id: fixture.opportunityId,
    project_id: fixture.workspaceProjectId,
    created_by: OWNER_ID,
    updated_by: OWNER_ID,
    source_workbook_id: workbookId,
    source_worksheet_id: workbookId,
    source_sheet_id: sheetId,
    source_range: "A1",
    source_signature: `${prefix}-${index}`,
    quantity: 1,
    rate: 1000,
    total: 1000,
    snapshot_json: { version: 1, sheetName: "Pricing", rangeLabel: "A1", rowCount: 0, columnCount: 0, cellCount: 0, nonEmptyCellCount: 0, columns: [], rows: [], cells: [] },
    source_link_json: { version: 1, sourceType: "worksheet_selection", ownerType: "opportunity", opportunityId: fixture.opportunityId, opportunitySlug: fixture.opportunitySlug, projectId: fixture.workspaceProjectId, projectSlug: fixture.workspaceSlug, quoteId: null, variationId: null, worksheetId: workbookId, workbookId, sheetId, worksheetName: "Pricing", sheetName: "Pricing", range: "A1", rowCount: 0, columnCount: 0, cellCount: 0, worksheetVersion: 1, capturedAt: new Date().toISOString() },
    locked_metadata_json: { version: 1, worksheetVersion: 1, sheetName: "Pricing", rangeLabel: "A1", worksheetMetadata: {}, cells: [] },
  });
  await insert("cost_items", {
    id: randomUUID(),
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    source_document_kind: "project_quote",
    source_document_id: quoteId,
    linked_quote_line_item_id: quoteLineId,
    source_line_id: quoteLineId,
    source_line_table: "project_quote_line_items",
    quantity: 10,
    unit_rate: 100,
    line_total: 1000,
    source_fingerprint: `${prefix}-${index}`,
    source_revision_key: "v1",
  });

  const documentWorkspaceId = randomUUID();
  const documentNodeId = randomUUID();
  const documentVersionId = randomUUID();
  const storageKey = `${ORGANIZATION_ID}/${documentWorkspaceId}/${documentNodeId}/${documentVersionId}.pdf`;
  await insert("document_workspaces", { id: documentWorkspaceId, organization_id: ORGANIZATION_ID, created_by: OWNER_ID });
  await insert("document_workspace_entities", { organization_id: ORGANIZATION_ID, workspace_id: documentWorkspaceId, opportunity_id: fixture.opportunityId, linked_by: OWNER_ID });
  await insert("document_nodes", { id: documentNodeId, organization_id: ORGANIZATION_ID, workspace_id: documentWorkspaceId, kind: "file", display_name: `${prefix} document ${index}.pdf`, created_by: OWNER_ID, updated_by: OWNER_ID });
  await insert("document_versions", { id: documentVersionId, organization_id: ORGANIZATION_ID, workspace_id: documentWorkspaceId, node_id: documentNodeId, version_number: 1, storage_key: storageKey, upload_state: "pending", uploaded_by: OWNER_ID, claimed_mime_type: "application/pdf", byte_size: 100 });

  return { ...fixture, quoteId, quoteLineId, taskId, drawingId, scopeRunId, pageId, calibrationId, measurementId, workbookId, documentWorkspaceId, documentNodeId, documentVersionId, storageKey };
}

async function award(actorClient, fixture, correlation = randomUUID()) {
  const result = await actorClient.rpc("award_opportunity_by_lifecycle_v1", {
    p_organization_id: ORGANIZATION_ID,
    p_opportunity_id: fixture.opportunityId,
    p_accepted_quote_id: fixture.quoteId,
    p_correlation_id: correlation,
  });
  return resultData(result, `award ${fixture.name}`)?.[0];
}

async function addDeliveryProof(fixture, prefix) {
  await insert("project_variations", { id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, created_by: OWNER_ID, variation_number: `${prefix}-V-1`, variation_title: `${prefix} variation`, status: "Approved", subtotal: 100, gst_total: 15, total_variation_price: 115 });
  await insert("project_purchase_orders", { id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, created_by: OWNER_ID, purchase_order_number: `${prefix}-PO-1`, purchase_order_title: `${prefix} PO`, status: "Approved", origin: "General Purchase", subtotal: 200, gst_total: 30, total_purchase_order_price: 230 });
  await insert("project_claims", { id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, created_by: OWNER_ID, claim_number: `${prefix}-PC-1`, claim_title: `${prefix} claim`, status: "Draft", linked_quote_value: 1000, linked_approved_variations: 100, revised_contract_value: 1100, claim_amount: 500, retention_percent: 10, retention_withheld_amount: 50, total_payable: 450 });
  const invoiceId = randomUUID();
  await insert("supplier_invoices", { id: invoiceId, organization_id: ORGANIZATION_ID, created_by: OWNER_ID, invoice_number: `${prefix}-SI-1`, status: "Captured", subtotal: 200, tax_total: 30, total: 230 });
  await insert("supplier_invoice_lines", { id: randomUUID(), organization_id: ORGANIZATION_ID, supplier_invoice_id: invoiceId, project_id: fixture.workspaceProjectId, line_uid: randomUUID(), description: `${prefix} supplier cost`, quantity: 1, unit_price: 200, line_total: 200, tax_amount: 30 });
  await insert("project_actual_cost_events", { id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, created_by_user_id: OWNER_ID, event_type: "posting", amount: 200, total_amount: 200, event_date: new Date().toISOString().slice(0, 10), source_type: "manual_adjustment", posting_source: "manual_adjustment", source_reference: `${prefix}-actual-cost` });
}

await verifyTarget();
const anonymous = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const negativeEvidence = {};
const anonymousCreation = await anonymous.rpc("create_opportunity_workspace_controlled_v1", {
  p_organization_id: ORGANIZATION_ID,
  p_creation_request_id: randomUUID(),
  p_name: "S6 unauthorized creation",
});
if (!anonymousCreation.error) throw new Error("Anonymous Opportunity creation unexpectedly succeeded.");
negativeEvidence.unauthorizedCreationCode = anonymousCreation.error.code;

const invalidCreation = await actor.rpc("create_opportunity_workspace_controlled_v1", {
  p_organization_id: ORGANIZATION_ID,
  p_creation_request_id: randomUUID(),
  p_name: " ",
});
if (!invalidCreation.error) throw new Error("Invalid Opportunity creation unexpectedly succeeded.");
negativeEvidence.validationErrorCode = invalidCreation.error.code;

const crossOrganizationCreation = await actor.rpc("create_opportunity_workspace_controlled_v1", {
  p_organization_id: "5c5de347-9f21-48fa-aac9-ba87e91fe92a",
  p_creation_request_id: randomUUID(),
  p_name: "S6 cross-organization creation",
});
if (!crossOrganizationCreation.error) throw new Error("Cross-organization Opportunity creation unexpectedly succeeded.");
negativeEvidence.crossOrganizationCode = crossOrganizationCreation.error.code;

const existingClient = resultData(
  await admin.from("organization_clients").select("id").eq("organization_id", ORGANIZATION_ID).limit(1).maybeSingle(),
  "load existing client",
);
if (!existingClient?.id) throw new Error("Hosted E2E organization has no existing client fixture.");

const count = requestedCount ?? (cohort === "cohort1" ? 3 : 10);
if (cohort === "cohort1" && count !== 3) {
  throw new Error("Cohort 1 must contain exactly three promotions.");
}
const runId = new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
const prefix = `S6-${cohort.toUpperCase()}-${runId}`;
const cohort2Actor = cohort === "cohort2" ? await ensureCohort2Actor() : null;
const actors = [
  { client: actor, userId: OWNER_ID, role: "admin" },
  ...(cohort2Actor ? [cohort2Actor] : []),
];
const fixtures = [];
for (let index = 1; index <= count; index += 1) {
  const selectedActor = actors[(index - 1) % actors.length];
  const created = await createOpportunity(
    selectedActor.client,
    selectedActor.userId,
    index,
    existingClient.id,
    prefix,
  );
  fixtures.push({
    ...(await addFeatureData(created, index, prefix)),
    awardActor: selectedActor,
  });
}

let pausedAward = null;
if (cohort === "cohort1") {
  await setControl("legacy");
  const pausedResult = await actor.rpc("award_opportunity_by_lifecycle_v1", {
    p_organization_id: ORGANIZATION_ID,
    p_opportunity_id: fixtures[0].opportunityId,
    p_accepted_quote_id: fixtures[0].quoteId,
    p_correlation_id: "stage6-hosted-disabled-control",
  });
  if (!pausedResult.error) throw new Error("Disabled promotion unexpectedly awarded.");
  const [mappingCount, eventCount, projectCount] = await Promise.all([
    admin.from("opportunity_final_projects").select("opportunity_id", { count: "exact", head: true }).eq("opportunity_id", fixtures[0].opportunityId),
    admin.from("opportunity_promotion_events").select("id", { count: "exact", head: true }).eq("opportunity_id", fixtures[0].opportunityId),
    admin.from("organization_projects").select("id", { count: "exact", head: true }).eq("source_opportunity_id", fixtures[0].opportunityId),
  ]);
  pausedAward = { code: pausedResult.error.code, mappingCount: mappingCount.count, eventCount: eventCount.count, projectCount: projectCount.count };
  if (mappingCount.count !== 0 || eventCount.count !== 0 || projectCount.count !== 1) {
    throw new Error("Disabled award left partial or second-Project state.");
  }
  await setControl("hosted");
}

const awards = [];
for (let index = 0; index < fixtures.length; index += 1) {
  const fixture = fixtures[index];
  let awarded;
  if (index === fixtures.length - 1) {
    const concurrent = await Promise.all([
      award(fixture.awardActor.client, fixture),
      award(fixture.awardActor.client, fixture),
    ]);
    awarded = concurrent[0];
    if (concurrent.some((row) => row.project_id !== fixture.workspaceProjectId)) {
      throw new Error(`Concurrent award returned the wrong Project for ${fixture.name}`);
    }
  } else {
    awarded = await award(fixture.awardActor.client, fixture);
  }
  const retry = await award(fixture.awardActor.client, fixture);
  if (awarded.project_id !== fixture.workspaceProjectId || retry.project_id !== fixture.workspaceProjectId) {
    throw new Error(`Award did not return W for ${fixture.name}`);
  }
  awards.push({ projectId: awarded.project_id, projectCreated: awarded.project_created, retryProjectId: retry.project_id });
}

if (cohort === "cohort1") await addDeliveryProof(fixtures[0], prefix);

const opportunityIds = fixtures.map((fixture) => fixture.opportunityId);
const [opportunities, mappings, events, projects] = await Promise.all([
  admin.from("organization_opportunities").select("id,workspace_project_id,converted_project_id,stage").in("id", opportunityIds),
  admin.from("opportunity_final_projects").select("opportunity_id,project_id,accepted_quote_id").in("opportunity_id", opportunityIds),
  admin.from("opportunity_promotion_events").select("opportunity_id,project_id,accepted_quote_id,evidence_hash").in("opportunity_id", opportunityIds),
  admin.from("organization_projects").select("id,source_opportunity_id,slug,project_code").in("source_opportunity_id", opportunityIds),
]);
for (const result of [opportunities, mappings, events, projects]) resultData(result, "reconcile cohort");

const contradictions = [];
for (const fixture of fixtures) {
  const opportunity = opportunities.data.find((row) => row.id === fixture.opportunityId);
  const mapping = mappings.data.find((row) => row.opportunity_id === fixture.opportunityId);
  const eventRows = events.data.filter((row) => row.opportunity_id === fixture.opportunityId);
  const projectRows = projects.data.filter((row) => row.source_opportunity_id === fixture.opportunityId);
  if (!opportunity || opportunity.workspace_project_id !== fixture.workspaceProjectId || opportunity.converted_project_id !== fixture.workspaceProjectId) contradictions.push(`${fixture.opportunityId}:opportunity_identity`);
  if (!mapping || mapping.project_id !== fixture.workspaceProjectId || mapping.accepted_quote_id !== fixture.quoteId) contradictions.push(`${fixture.opportunityId}:mapping_identity`);
  if (eventRows.length !== 1 || eventRows[0].project_id !== fixture.workspaceProjectId || !eventRows[0].evidence_hash) contradictions.push(`${fixture.opportunityId}:event_identity`);
  if (projectRows.length !== 1 || projectRows[0].id !== fixture.workspaceProjectId || projectRows[0].slug !== fixture.workspaceSlug || projectRows[0].project_code !== fixture.workspaceCode) contradictions.push(`${fixture.opportunityId}:project_identity`);
}
if (contradictions.length) throw new Error(`Cohort contradictions: ${contradictions.join(",")}`);

console.log(JSON.stringify({
  mode: "stage6_hosted_development_mutation",
  projectReference,
  organization: { id: ORGANIZATION_ID, name: ORGANIZATION_NAME },
  cohort,
  prefix,
  actors: actors.map(({ userId, role }) => ({ userId, role })),
  pausedAward,
  negativeEvidence,
  summary: {
    opportunitiesCreated: fixtures.length,
    successfulPromotions: mappings.data.length,
    retries: fixtures.length,
    concurrentAwards: 1,
    secondProjectsCreated: projects.data.length - fixtures.length,
    promotionEvents: events.data.length,
    criticalMismatches: contradictions.length,
  },
  fixtures: fixtures.map((fixture, index) => ({
    opportunityId: fixture.opportunityId,
    opportunitySlug: fixture.opportunitySlug,
    workspaceProjectId: fixture.workspaceProjectId,
    workspaceSlug: fixture.workspaceSlug,
    workspaceCode: fixture.workspaceCode,
    quoteId: fixture.quoteId,
    taskId: fixture.taskId,
    takeoffPageId: fixture.pageId,
    calibrationId: fixture.calibrationId,
    measurementId: fixture.measurementId,
    documentWorkspaceId: fixture.documentWorkspaceId,
    documentNodeId: fixture.documentNodeId,
    documentVersionId: fixture.documentVersionId,
    storageKey: fixture.storageKey,
    award: awards[index],
  })),
}, null, 2));
