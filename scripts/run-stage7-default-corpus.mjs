import { requireHostedTestCredentials } from "./hosted-test-credentials.mjs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const acknowledgement = process.env.STAGE7_HOSTED_MUTATION_ACK?.trim();
const resumePrefix = process.env.STAGE7_CORPUS_PREFIX?.trim();
const phase = process.env.STAGE7_CORPUS_PHASE?.trim() ?? "all";
const requestedCount = Number(process.argv[2] ?? "20");
const REQUIRED_ACK = "I_ACKNOWLEDGE_STAGE7_HOSTED_DEVELOPMENT_MUTATIONS";
const EXPECTED_REFERENCE = "mvxyxvrxaorzglppxzzz";
const ORGANIZATION_ID = "92791137-1e95-4aec-a86e-b6e25f7dbc3c";
const ORGANIZATION_NAME = "Supplier Invoice E2E Org";
const OWNER_ID = "95c0497d-7275-40ae-bdb0-8048a1e451a7";
const { email: OWNER_EMAIL, password: OWNER_PASSWORD } = requireHostedTestCredentials("owner");
const MANAGER_ID = "1b01aeac-fb01-4231-a425-3bb2bdb8ae44";
const { email: MANAGER_EMAIL, password: MANAGER_PASSWORD } = requireHostedTestCredentials("manager");

if (!url || !anonKey || !serviceKey || acknowledgement !== REQUIRED_ACK) {
  throw new Error("Missing exact Stage 7 hosted-development environment or acknowledgement.");
}
if (new URL(url).hostname.split(".")[0] !== EXPECTED_REFERENCE) {
  throw new Error("Refusing unexpected Supabase project.");
}
if (!Number.isInteger(requestedCount) || requestedCount !== 20) {
  throw new Error("The Stage 7 observation corpus must create exactly twenty fixtures.");
}
if (!["all", "setup", "award-first", "award-second", "reconcile"].includes(phase)) {
  throw new Error("Invalid Stage 7 corpus phase.");
}
if (phase !== "all" && !resumePrefix?.match(/^S7-DEFAULT-[0-9]{14}$/)) {
  throw new Error("Resumable Stage 7 phases require the exact guarded corpus prefix.");
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function client() {
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function resultData(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.code ?? "error"} ${result.error.message}`);
  return result.data;
}

async function upsert(table, value) {
  resultData(await admin.from(table).upsert(value, { onConflict: "id" }), `upsert ${table}`);
}

async function login(email, password, expectedId) {
  const actor = client();
  const result = await actor.auth.signInWithPassword({ email, password });
  if (result.error || result.data.user?.id !== expectedId) {
    throw new Error(`Exact Stage 7 actor login failed: ${email}`);
  }
  return actor;
}

const [owner, manager] = await Promise.all([
  login(OWNER_EMAIL, OWNER_PASSWORD, OWNER_ID),
  login(MANAGER_EMAIL, MANAGER_PASSWORD, MANAGER_ID),
]);

const [organization, policy, control, memberships, existingClient] = await Promise.all([
  admin.from("organizations").select("id,name").eq("id", ORGANIZATION_ID).single(),
  admin.from("opportunity_lifecycle_default_policy").select("environment,default_strategy,creation_enabled,promotion_enabled,effective_from").eq("singleton", true).single(),
  admin.from("opportunity_lifecycle_rollout_controls").select("override_enabled").eq("organization_id", ORGANIZATION_ID).maybeSingle(),
  admin.from("organization_members").select("user_id,role").eq("organization_id", ORGANIZATION_ID).in("user_id", [OWNER_ID, MANAGER_ID]),
  admin.from("organization_clients").select("id").eq("organization_id", ORGANIZATION_ID).limit(1).single(),
]);
for (const result of [organization, policy, control, memberships, existingClient]) resultData(result, "verify Stage 7 target");
if (organization.data.name !== ORGANIZATION_NAME) throw new Error("Exact development organization mismatch.");
if (policy.data.environment !== "hosted_development"
  || policy.data.default_strategy !== "promote_workspace_v1"
  || (phase !== "reconcile" && policy.data.creation_enabled !== true)
  || (phase !== "reconcile" && policy.data.promotion_enabled !== true)
  || Date.parse(policy.data.effective_from) > Date.now()) {
  throw new Error("Stage 7 promotion default is not active.");
}
if (control.data?.override_enabled === true) throw new Error("Default corpus organization has an active override.");
const roles = new Map(memberships.data.map((row) => [row.user_id, row.role]));
if (!["owner", "admin"].includes(roles.get(OWNER_ID)) || roles.get(MANAGER_ID) !== "project_manager") {
  throw new Error("Expected Stage 7 admin and project-manager roles are unavailable.");
}

const anonymous = client();
const anonymousCreation = await anonymous.rpc("create_opportunity_workspace_controlled_v1", {
  p_organization_id: ORGANIZATION_ID,
  p_creation_request_id: randomUUID(),
  p_name: "S7 unauthorized creation",
});
if (!anonymousCreation.error) throw new Error("Anonymous creation unexpectedly succeeded.");
const invalidCreation = await owner.rpc("create_opportunity_workspace_controlled_v1", {
  p_organization_id: ORGANIZATION_ID,
  p_creation_request_id: randomUUID(),
  p_name: " ",
});
if (!invalidCreation.error) throw new Error("Invalid creation unexpectedly succeeded.");
const crossOrganization = await owner.rpc("create_opportunity_workspace_controlled_v1", {
  p_organization_id: "5c5de347-9f21-48fa-aac9-ba87e91fe92a",
  p_creation_request_id: randomUUID(),
  p_name: "S7 cross organization",
});
if (!crossOrganization.error) throw new Error("Cross-organization creation unexpectedly succeeded.");

const runId = new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
const prefix = resumePrefix ?? `S7-DEFAULT-${runId}`;
const actors = [
  { client: owner, userId: OWNER_ID, role: roles.get(OWNER_ID) },
  { client: manager, userId: MANAGER_ID, role: roles.get(MANAGER_ID) },
];

async function createFixture(index) {
  const actor = actors[(index - 1) % actors.length];
  const requestId = randomUUID();
  const name = `${prefix} Opportunity ${String(index).padStart(2, "0")}`;
  const args = {
    p_organization_id: ORGANIZATION_ID,
    p_creation_request_id: requestId,
    p_name: name,
    p_client_id: index === 2 ? null : existingClient.data.id,
    p_new_client: index === 2
      ? { name: `${prefix} Client`, company_name: `${prefix} Client Limited` }
      : null,
    p_owner_user_id: actor.userId,
    p_location: "Stage 7 Hosted Development",
    p_due_date: null,
    p_estimated_value: 2300 + index,
    p_notes: "Stage 7 default-lifecycle fixture",
  };
  const first = resultData(await actor.client.rpc("create_opportunity_workspace_controlled_v1", args), `create ${name}`)?.[0];
  const retry = resultData(await actor.client.rpc("create_opportunity_workspace_controlled_v1", args), `retry ${name}`)?.[0];
  if (!first?.opportunity_id || !first.workspace_project_id || retry.opportunity_id !== first.opportunity_id || retry.records_created !== false) {
    throw new Error(`Creation idempotency failed: ${name}`);
  }
  const [project, lifecycle, resolution] = await Promise.all([
    admin.from("organization_projects").select("id,slug,project_code,source_opportunity_id").eq("id", first.workspace_project_id).single(),
    admin.from("opportunity_lifecycles").select("strategy,original_workspace_project_id").eq("opportunity_id", first.opportunity_id).single(),
    admin.rpc("resolve_project_lifecycle_v1", { p_organization_id: ORGANIZATION_ID, p_project_id: first.workspace_project_id }),
  ]);
  for (const result of [project, lifecycle, resolution]) resultData(result, `verify ${name}`);
  if (lifecycle.data.strategy !== "promote_workspace_v1"
    || lifecycle.data.original_workspace_project_id !== first.workspace_project_id
    || project.data.source_opportunity_id !== first.opportunity_id
    || resolution.data?.[0]?.is_visible !== false
    || resolution.data?.[0]?.is_delivery_eligible !== false) {
    throw new Error(`Pre-award lifecycle mismatch: ${name}`);
  }
  return {
    index,
    name,
    actor,
    opportunityId: first.opportunity_id,
    opportunitySlug: first.opportunity_slug,
    workspaceProjectId: first.workspace_project_id,
    workspaceSlug: project.data.slug,
    workspaceCode: project.data.project_code,
  };
}

async function addQuote(fixture) {
  const quoteId = randomUUID();
  const lines = fixture.index === 1 ? 3 : 1;
  await upsert("project_quotes", {
    id: quoteId,
    organization_id: ORGANIZATION_ID,
    project_id: fixture.workspaceProjectId,
    created_by: OWNER_ID,
    quote_title: `${fixture.name} Contract`,
    quote_number: `${prefix}-Q-${fixture.index}`,
    status: "Accepted",
    originating_opportunity_id: fixture.opportunityId,
    source_opportunity_id: fixture.opportunityId,
    quote_date: new Date().toISOString().slice(0, 10),
    subtotal: 2000,
    gst_percent: 15,
    gst_amount: 300,
    total_quote_price: 2300,
    retention_percent_default: 10,
  });
  const lineIds = [];
  for (let lineIndex = 1; lineIndex <= lines; lineIndex += 1) {
    const lineId = randomUUID();
    lineIds.push(lineId);
    await upsert("project_quote_line_items", {
      id: lineId,
      organization_id: ORGANIZATION_ID,
      project_id: fixture.workspaceProjectId,
      quote_id: quoteId,
      section: lineIndex === 1 ? "Labour" : "Materials",
      description: `${prefix} baseline ${lineIndex}`,
      quantity: 1,
      unit: "item",
      rate: lineIndex === 1 ? 1000 : 500,
      total: lineIndex === 1 ? 1000 : 500,
      sort_order: lineIndex - 1,
    });
  }
  return { ...fixture, quoteId, quoteLineIds: lineIds };
}

async function addDenseContinuity(fixture) {
  const drawingId = randomUUID();
  const storagePath = `${ORGANIZATION_ID}/${fixture.workspaceProjectId}/${prefix.toLowerCase()}-${fixture.index}.pdf`;
  await upsert("project_drawing_sets", {
    id: drawingId, organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId,
    uploaded_by: OWNER_ID, file_name: `${prefix}-${fixture.index}.pdf`, storage_path: storagePath,
    file_size_bytes: 100, mime_type: "application/pdf",
  });
  await upsert("trade_packs", {
    id: drawingId, organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId,
    trade_id: "carpentry", trade_label: "Carpentry", pdf_url: storagePath, page_index_json: [], created_by: OWNER_ID,
  });
  await upsert("scope_runs", {
    id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId,
    trade_pack_id: drawingId, created_by: OWNER_ID, status: "complete", result_json: {},
  });

  const takeoffIds = [];
  const pageCount = fixture.index === 1 ? 2 : 1;
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const pageId = randomUUID();
    takeoffIds.push(pageId);
    await upsert("takeoff_pages", {
      id: pageId, organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId,
      opportunity_id: fixture.opportunityId, drawing_set_id: drawingId, page_number: pageNumber,
      page_width_pts: 595, page_height_pts: 842, created_by: OWNER_ID,
    });
  }
  const calibrationId = randomUUID();
  await upsert("takeoff_calibrations", {
    id: calibrationId, organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId,
    opportunity_id: fixture.opportunityId, page_id: takeoffIds[0], name: `${prefix} scale`, scale_ratio: 100,
    unit_system: "metric", base_unit: "mm", display_unit: "m", reference_length_input: 1,
    reference_length_base: 1000, point_a_x: 0.1, point_a_y: 0.1, point_b_x: 0.2, point_b_y: 0.1,
    is_active: true, created_by: OWNER_ID,
  });
  const measurementId = randomUUID();
  await upsert("takeoff_measurements", {
    id: measurementId, organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId,
    opportunity_id: fixture.opportunityId, drawing_set_id: drawingId, page_id: takeoffIds[0],
    calibration_id: calibrationId, measurement_kind: "line", quantity: 2, measured_length_base: 2000,
    display_value: 2, display_unit: "m", created_by: OWNER_ID,
  });
  resultData(await admin.from("takeoff_measurement_points").insert([
    { organization_id: ORGANIZATION_ID, measurement_id: measurementId, point_order: 0, x: 0.1, y: 0.1 },
    { organization_id: ORGANIZATION_ID, measurement_id: measurementId, point_order: 1, x: 0.2, y: 0.1 },
  ]), "insert measurement points");
  resultData(await admin.from("takeoff_measurement_events").insert({
    organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, opportunity_id: fixture.opportunityId,
    measurement_id: measurementId, event_type: "created", version: 1, actor_user_id: OWNER_ID, snapshot: {},
  }), "insert measurement event");

  const taskId = randomUUID();
  await upsert("project_job_todos", {
    id: taskId, organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId,
    opportunity_id: fixture.opportunityId, created_by: OWNER_ID, assigned_user_id: fixture.actor.userId,
    title: `${prefix} task ${fixture.index}`,
  });
  const workbookId = randomUUID();
  const sheetId = randomUUID();
  await upsert("opportunity_pricing_worksheets", {
    id: workbookId, organization_id: ORGANIZATION_ID, opportunity_id: fixture.opportunityId,
    project_id: fixture.workspaceProjectId, name: `${prefix} workbook ${fixture.index}`,
    created_by: OWNER_ID, updated_by: OWNER_ID,
  });
  await upsert("opportunity_pricing_workbook_sheets", {
    id: sheetId, workbook_id: workbookId, organization_id: ORGANIZATION_ID,
    opportunity_id: fixture.opportunityId, name: "Pricing", is_default: true,
    created_by: OWNER_ID, updated_by: OWNER_ID,
  });
  await upsert("commercial_items", {
    id: randomUUID(), organization_id: ORGANIZATION_ID, opportunity_id: fixture.opportunityId,
    project_id: fixture.workspaceProjectId, created_by: OWNER_ID, updated_by: OWNER_ID,
    source_workbook_id: workbookId, source_worksheet_id: workbookId, source_sheet_id: sheetId,
    source_range: "A1", source_signature: `${prefix}-${fixture.index}`, quantity: 1, rate: 2000, total: 2000,
    snapshot_json: { version: 1, sheetName: "Pricing", rangeLabel: "A1", rowCount: 0, columnCount: 0, cellCount: 0, nonEmptyCellCount: 0, columns: [], rows: [], cells: [] },
    source_link_json: { version: 1, sourceType: "worksheet_selection", ownerType: "opportunity", opportunityId: fixture.opportunityId, opportunitySlug: fixture.opportunitySlug, projectId: fixture.workspaceProjectId, projectSlug: fixture.workspaceSlug, quoteId: null, variationId: null, worksheetId: workbookId, workbookId, sheetId, worksheetName: "Pricing", sheetName: "Pricing", range: "A1", rowCount: 0, columnCount: 0, cellCount: 0, worksheetVersion: 1, capturedAt: new Date().toISOString() },
    locked_metadata_json: { version: 1, worksheetVersion: 1, sheetName: "Pricing", rangeLabel: "A1", worksheetMetadata: {}, cells: [] },
  });
  await upsert("cost_items", {
    id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId,
    source_document_kind: "project_quote", source_document_id: fixture.quoteId,
    linked_quote_line_item_id: fixture.quoteLineIds[0], source_line_id: fixture.quoteLineIds[0],
    source_line_table: "project_quote_line_items", quantity: 1, unit_rate: 1000, line_total: 1000,
    source_fingerprint: `${prefix}-${fixture.index}`, source_revision_key: "v1",
  });
  const documentWorkspaceId = randomUUID();
  const documentNodeId = randomUUID();
  const documentVersionId = randomUUID();
  const storageKey = `${ORGANIZATION_ID}/${documentWorkspaceId}/${documentNodeId}/${documentVersionId}.pdf`;
  await upsert("document_workspaces", { id: documentWorkspaceId, organization_id: ORGANIZATION_ID, created_by: OWNER_ID });
  resultData(await admin.from("document_workspace_entities").insert({ organization_id: ORGANIZATION_ID, workspace_id: documentWorkspaceId, opportunity_id: fixture.opportunityId, linked_by: OWNER_ID }), "link document workspace");
  await upsert("document_nodes", { id: documentNodeId, organization_id: ORGANIZATION_ID, workspace_id: documentWorkspaceId, kind: "file", display_name: `${prefix} document ${fixture.index}.pdf`, created_by: OWNER_ID, updated_by: OWNER_ID });
  await upsert("document_versions", { id: documentVersionId, organization_id: ORGANIZATION_ID, workspace_id: documentWorkspaceId, node_id: documentNodeId, version_number: 1, storage_key: storageKey, upload_state: "pending", uploaded_by: OWNER_ID, claimed_mime_type: "application/pdf", byte_size: 100 });
  return { ...fixture, drawingId, takeoffIds, calibrationId, measurementId, taskId, workbookId, documentWorkspaceId, documentNodeId, documentVersionId, storageKey };
}

async function addDelivery(fixture) {
  await upsert("project_variations", { id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, created_by: OWNER_ID, variation_number: `${prefix}-V-${fixture.index}`, variation_title: `${prefix} variation`, status: "Approved", subtotal: 100, gst_total: 15, total_variation_price: 115 });
  await upsert("project_purchase_orders", { id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, created_by: OWNER_ID, purchase_order_number: `${prefix}-PO-${fixture.index}`, purchase_order_title: `${prefix} PO`, status: "Approved", origin: "General Purchase", subtotal: 200, gst_total: 30, total_purchase_order_price: 230 });
  await upsert("project_claims", { id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, created_by: OWNER_ID, claim_number: `${prefix}-PC-${fixture.index}`, claim_title: `${prefix} claim`, status: "Draft", linked_quote_value: 2000, linked_approved_variations: 100, revised_contract_value: 2100, claim_amount: 500, retention_percent: 10, retention_withheld_amount: 50, total_payable: 450 });
  const invoiceId = randomUUID();
  await upsert("supplier_invoices", { id: invoiceId, organization_id: ORGANIZATION_ID, created_by: OWNER_ID, invoice_number: `${prefix}-SI-${fixture.index}`, status: "Captured", subtotal: 200, tax_total: 30, total: 230 });
  await upsert("supplier_invoice_lines", { id: randomUUID(), organization_id: ORGANIZATION_ID, supplier_invoice_id: invoiceId, project_id: fixture.workspaceProjectId, line_uid: randomUUID(), description: `${prefix} supplier cost`, quantity: 1, unit_price: 200, line_total: 200, tax_amount: 30 });
  await upsert("project_actual_cost_events", { id: randomUUID(), organization_id: ORGANIZATION_ID, project_id: fixture.workspaceProjectId, created_by_user_id: OWNER_ID, event_type: "posting", amount: 200, total_amount: 200, event_date: new Date().toISOString().slice(0, 10), source_type: "manual_adjustment", posting_source: "manual_adjustment", source_reference: `${prefix}-actual-${fixture.index}` });
}

async function loadFixtures() {
  const opportunities = resultData(await admin
    .from("organization_opportunities")
    .select("id,name,slug,workspace_project_id")
    .eq("organization_id", ORGANIZATION_ID)
    .like("name", `${prefix} Opportunity %`)
    .order("name"), "load corpus Opportunities");
  if (!opportunities.length) return [];
  const opportunityIds = opportunities.map((row) => row.id);
  const projectIds = opportunities.map((row) => row.workspace_project_id);
  const [projects, lifecycles, quotes, quoteLines] = await Promise.all([
    admin.from("organization_projects").select("id,slug,project_code,source_opportunity_id").in("id", projectIds),
    admin.from("opportunity_lifecycles").select("opportunity_id,strategy,original_workspace_project_id").in("opportunity_id", opportunityIds),
    admin.from("project_quotes").select("id,originating_opportunity_id,status,quote_title").in("originating_opportunity_id", opportunityIds),
    admin.from("project_quote_line_items").select("id,quote_id").in("project_id", projectIds).order("sort_order"),
  ]);
  for (const result of [projects, lifecycles, quotes, quoteLines]) resultData(result, "load corpus dependencies");
  return opportunities.map((opportunity, offset) => {
    const index = Number(opportunity.name.slice(-2));
    const project = projects.data.find((row) => row.id === opportunity.workspace_project_id);
    const lifecycle = lifecycles.data.find((row) => row.opportunity_id === opportunity.id);
    const quote = quotes.data.find((row) => row.originating_opportunity_id === opportunity.id && row.quote_title === `${opportunity.name} Contract`);
    const lines = quoteLines.data.filter((row) => row.quote_id === quote?.id).map((row) => row.id);
    if (index !== offset + 1 || !project || lifecycle?.strategy !== "promote_workspace_v1"
      || lifecycle.original_workspace_project_id !== project.id || !quote || !lines.length) {
      throw new Error(`Existing Stage 7 corpus fixture is incomplete: ${opportunity.id}`);
    }
    return {
      index,
      name: opportunity.name,
      actor: actors[(index - 1) % actors.length],
      opportunityId: opportunity.id,
      opportunitySlug: opportunity.slug,
      workspaceProjectId: project.id,
      workspaceSlug: project.slug,
      workspaceCode: project.project_code,
      quoteId: quote.id,
      quoteLineIds: lines,
    };
  });
}

async function setupCorpus() {
  const fixtures = await loadFixtures();
  if (phase === "all" && fixtures.length) {
    throw new Error("Refusing to reuse an existing corpus without an explicit resumable phase.");
  }
  for (let index = fixtures.length + 1; index <= requestedCount; index += 1) {
    let fixture = await createFixture(index);
    fixture = await addQuote(fixture);
    if (index <= 5) fixture = await addDenseContinuity(fixture);
    fixtures.push(fixture);
  }
  return fixtures;
}

async function runNegativeEvidence(fixtures) {
  const preAwardWrite = await owner.from("project_variations").insert({
    organization_id: ORGANIZATION_ID, project_id: fixtures[0].workspaceProjectId,
    created_by: OWNER_ID, variation_number: `${prefix}-PRE`, variation_title: "Must fail before award",
    status: "Draft", subtotal: 1, gst_total: 0.15, total_variation_price: 1.15,
  });
  if (!preAwardWrite.error) throw new Error("Delivery write unexpectedly succeeded before award.");

  const extraQuoteId = randomUUID();
  await upsert("project_quotes", {
    id: extraQuoteId, organization_id: ORGANIZATION_ID, project_id: fixtures[1].workspaceProjectId,
    created_by: OWNER_ID, quote_title: `${prefix} conflicting accepted quote`, quote_number: `${prefix}-Q-CONFLICT`,
    status: "Accepted", originating_opportunity_id: fixtures[1].opportunityId,
    source_opportunity_id: fixtures[1].opportunityId, quote_date: new Date().toISOString().slice(0, 10),
    subtotal: 1, gst_amount: 0.15, total_quote_price: 1.15,
  });
  const multipleAccepted = await fixtures[1].actor.client.rpc("award_opportunity_by_lifecycle_v1", {
    p_organization_id: ORGANIZATION_ID, p_opportunity_id: fixtures[1].opportunityId,
    p_accepted_quote_id: fixtures[1].quoteId, p_correlation_id: randomUUID(),
  });
  if (!multipleAccepted.error) throw new Error("Multiple accepted quote award unexpectedly succeeded.");
  resultData(await admin.from("project_quotes").update({ status: "Draft" }).eq("id", extraQuoteId), "resolve deliberate quote conflict");
  const unrelatedAward = await fixtures[0].actor.client.rpc("award_opportunity_by_lifecycle_v1", {
    p_organization_id: ORGANIZATION_ID, p_opportunity_id: fixtures[0].opportunityId,
    p_accepted_quote_id: fixtures[1].quoteId, p_correlation_id: randomUUID(),
  });
  if (!unrelatedAward.error) throw new Error("Unrelated quote award unexpectedly succeeded.");
  return {
    preAwardDeliveryCode: preAwardWrite.error.code,
    multipleAcceptedCode: multipleAccepted.error.code,
    unrelatedQuoteCode: unrelatedAward.error.code,
  };
}

async function awardRange(fixtures, start, end) {
  const selected = fixtures.slice(start, end);
  const ids = selected.map((fixture) => fixture.opportunityId);
  const existing = resultData(await admin.from("opportunity_final_projects").select("opportunity_id").in("opportunity_id", ids), "guard award batch");
  if (existing.length) throw new Error("Refusing to rerun an already-started Stage 7 award batch.");
  for (let index = start; index < end; index += 1) {
    const fixture = fixtures[index];
    const args = {
      p_organization_id: ORGANIZATION_ID,
      p_opportunity_id: fixture.opportunityId,
      p_accepted_quote_id: fixture.quoteId,
      p_correlation_id: randomUUID(),
    };
    let award;
    if (index === fixtures.length - 1) {
      const concurrent = await Promise.all([
        fixture.actor.client.rpc("award_opportunity_by_lifecycle_v1", args),
        fixture.actor.client.rpc("award_opportunity_by_lifecycle_v1", { ...args, p_correlation_id: randomUUID() }),
      ]);
      for (const result of concurrent) resultData(result, "concurrent Stage 7 award");
      award = concurrent[0].data?.[0];
    } else {
      award = resultData(await fixture.actor.client.rpc("award_opportunity_by_lifecycle_v1", args), `award ${fixture.name}`)?.[0];
    }
    const retry = resultData(await fixture.actor.client.rpc("award_opportunity_by_lifecycle_v1", { ...args, p_correlation_id: randomUUID() }), `retry award ${fixture.name}`)?.[0];
    if (award?.project_id !== fixture.workspaceProjectId || retry?.project_id !== fixture.workspaceProjectId) {
      throw new Error(`Award returned a Project other than W: ${fixture.name}`);
    }
    if (index < 3) await addDelivery(fixture);
  }
}

async function reconcile(fixtures) {
  const opportunityIds = fixtures.map((fixture) => fixture.opportunityId);
  const [opportunities, mappings, events, projects] = await Promise.all([
    admin.from("organization_opportunities").select("id,workspace_project_id,converted_project_id,stage").in("id", opportunityIds),
    admin.from("opportunity_final_projects").select("opportunity_id,project_id,accepted_quote_id").in("opportunity_id", opportunityIds),
    admin.from("opportunity_promotion_events").select("opportunity_id,project_id,accepted_quote_id,evidence_hash").in("opportunity_id", opportunityIds),
    admin.from("organization_projects").select("id,source_opportunity_id,slug,project_code").in("source_opportunity_id", opportunityIds),
  ]);
  for (const result of [opportunities, mappings, events, projects]) resultData(result, "reconcile Stage 7 corpus");
  const contradictions = [];
  for (const fixture of fixtures) {
    const opportunity = opportunities.data.find((row) => row.id === fixture.opportunityId);
    const mapping = mappings.data.find((row) => row.opportunity_id === fixture.opportunityId);
    const eventRows = events.data.filter((row) => row.opportunity_id === fixture.opportunityId);
    const projectRows = projects.data.filter((row) => row.source_opportunity_id === fixture.opportunityId);
    if (!opportunity || opportunity.workspace_project_id !== fixture.workspaceProjectId || opportunity.converted_project_id !== fixture.workspaceProjectId) contradictions.push(`${fixture.opportunityId}:opportunity`);
    if (!mapping || mapping.project_id !== fixture.workspaceProjectId || mapping.accepted_quote_id !== fixture.quoteId) contradictions.push(`${fixture.opportunityId}:mapping`);
    if (eventRows.length !== 1 || eventRows[0].project_id !== fixture.workspaceProjectId || !eventRows[0].evidence_hash) contradictions.push(`${fixture.opportunityId}:event`);
    if (projectRows.length !== 1 || projectRows[0].id !== fixture.workspaceProjectId || projectRows[0].slug !== fixture.workspaceSlug || projectRows[0].project_code !== fixture.workspaceCode) contradictions.push(`${fixture.opportunityId}:project`);
    const baseline = await admin.rpc("resolve_project_contractual_baseline_v1", { p_organization_id: ORGANIZATION_ID, p_project_id: fixture.workspaceProjectId });
    if (baseline.error || !baseline.data?.[0]?.is_valid || baseline.data[0].quote_id !== fixture.quoteId) contradictions.push(`${fixture.opportunityId}:baseline`);
  }
  if (contradictions.length) throw new Error(`Stage 7 corpus contradictions: ${contradictions.join(",")}`);
  return { mappings, events, projects, contradictions };
}

let fixtures;
let negativeEvidence = null;
if (["all", "setup"].includes(phase)) fixtures = await setupCorpus();
else fixtures = await loadFixtures();
if (fixtures.length !== requestedCount) {
  throw new Error(`Stage 7 corpus setup is incomplete: ${fixtures.length}/${requestedCount}`);
}
if (["all", "award-first"].includes(phase)) {
  negativeEvidence = await runNegativeEvidence(fixtures);
  await awardRange(fixtures, 0, 10);
}
if (["all", "award-second"].includes(phase)) await awardRange(fixtures, 10, 20);
const reconciliation = ["all", "reconcile"].includes(phase) ? await reconcile(fixtures) : null;

console.log(JSON.stringify({
  mode: "stage7_default_hosted_development_corpus",
  phase,
  projectReference: EXPECTED_REFERENCE,
  organization: { id: ORGANIZATION_ID, name: ORGANIZATION_NAME },
  prefix,
  actors: actors.map(({ userId, role }) => ({ userId, role })),
  negativeEvidence: negativeEvidence ? {
    unauthorizedCreationCode: anonymousCreation.error.code,
    validationErrorCode: invalidCreation.error.code,
    crossOrganizationCode: crossOrganization.error.code,
    ...negativeEvidence,
  } : null,
  summary: {
    opportunitiesCreated: fixtures.length,
    promotionStrategies: fixtures.length,
    successfulPromotions: reconciliation?.mappings.data.length ?? null,
    retries: phase === "award-first" || phase === "award-second" ? 10 : phase === "all" ? 20 : 0,
    concurrentAwards: phase === "award-second" || phase === "all" ? 1 : 0,
    featureDenseFixtures: 5,
    completeDeliveryFixtures: phase === "award-first" || phase === "all" || phase === "reconcile" ? 3 : null,
    secondProjectsCreated: reconciliation ? reconciliation.projects.data.length - fixtures.length : null,
    promotionEvents: reconciliation?.events.data.length ?? null,
    criticalMismatches: reconciliation?.contradictions.length ?? null,
  },
  fixtureIds: fixtures.map((fixture) => ({
    opportunityId: fixture.opportunityId,
    workspaceProjectId: fixture.workspaceProjectId,
    quoteId: fixture.quoteId,
  })),
}, null, 2));
