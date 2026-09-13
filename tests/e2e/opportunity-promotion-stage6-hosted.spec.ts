import { requireHostedTestCredentials } from "../../scripts/hosted-test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ORGANIZATION_ID = "92791137-1e95-4aec-a86e-b6e25f7dbc3c";
const USER_ID = "95c0497d-7275-40ae-bdb0-8048a1e451a7";
const { email: EMAIL, password: PASSWORD } = requireHostedTestCredentials("owner");
const runId = Date.now().toString(36);
const names = {
  dialog: `S6-UI-${runId} Dialog Opportunity`,
  fullPage: `S6-UI-${runId} Full Page Opportunity`,
  newClient: `S6-UI-${runId} Client Limited`,
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Fixture = {
  opportunityId: string;
  opportunitySlug: string;
  workspaceProjectId: string;
  workspaceSlug: string;
  workspaceCode: string;
  quoteId: string;
  taskId: string;
};

const fixtures: Fixture[] = [];
let existingClientId = "";

async function login(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/app/leads-clients/opportunities`);
  if (!page.url().includes("/login")) return;
  await page.getByLabel("Work email*").fill(EMAIL);
  await page.getByLabel("Password*").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app\//);
  await page.goto(`${baseURL}/app/leads-clients/opportunities`);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function loadAndSeed(name: string): Promise<Fixture> {
  const opportunity = await admin
    .from("organization_opportunities")
    .select("id,slug,workspace_project_id,converted_project_id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("name", name)
    .single();
  if (opportunity.error) throw opportunity.error;
  expect(opportunity.data.converted_project_id).toBeNull();

  const project = await admin
    .from("organization_projects")
    .select("slug,project_code,source_opportunity_id")
    .eq("id", opportunity.data.workspace_project_id!)
    .single();
  if (project.error) throw project.error;
  expect(project.data.source_opportunity_id).toBe(opportunity.data.id);

  const lifecycle = await admin
    .from("opportunity_lifecycles")
    .select("strategy,original_workspace_project_id")
    .eq("opportunity_id", opportunity.data.id)
    .single();
  if (lifecycle.error) throw lifecycle.error;
  expect(lifecycle.data).toEqual({
    strategy: "promote_workspace_v1",
    original_workspace_project_id: opportunity.data.workspace_project_id,
  });

  const quoteId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const quote = await admin.from("project_quotes").insert({
    id: quoteId,
    organization_id: ORGANIZATION_ID,
    project_id: opportunity.data.workspace_project_id,
    created_by: USER_ID,
    quote_title: `${name} Contract`,
    quote_number: `S6-UI-${crypto.randomUUID().slice(0, 8)}`,
    status: "Accepted",
    originating_opportunity_id: opportunity.data.id,
    source_opportunity_id: opportunity.data.id,
    subtotal: 1000,
    gst_amount: 150,
    total_quote_price: 1150,
    quote_date: "2026-08-01",
  });
  if (quote.error) throw quote.error;
  const line = await admin.from("project_quote_line_items").insert({
    organization_id: ORGANIZATION_ID,
    project_id: opportunity.data.workspace_project_id,
    quote_id: quoteId,
    section: "Labour",
    description: "Stage 6 UI baseline",
    quantity: 1,
    unit: "item",
    rate: 1000,
    total: 1000,
    sort_order: 0,
  });
  if (line.error) throw line.error;
  const task = await admin.from("project_job_todos").insert({
    id: taskId,
    organization_id: ORGANIZATION_ID,
    project_id: opportunity.data.workspace_project_id,
    opportunity_id: opportunity.data.id,
    created_by: USER_ID,
    assigned_user_id: USER_ID,
    title: `${name} continuity task`,
  });
  if (task.error) throw task.error;

  return {
    opportunityId: opportunity.data.id,
    opportunitySlug: opportunity.data.slug,
    workspaceProjectId: opportunity.data.workspace_project_id!,
    workspaceSlug: project.data.slug,
    workspaceCode: project.data.project_code,
    quoteId,
    taskId,
  };
}

async function awardAndVerify(page: Page, fixture: Fixture) {
  const response = await page.request.post(
    `/api/leads-clients/opportunities/${fixture.opportunitySlug}/convert`,
    {
      headers: { "x-request-id": crypto.randomUUID() },
      data: { acceptedQuoteId: fixture.quoteId },
    },
  );
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    projectId: fixture.workspaceProjectId,
    projectSlug: fixture.workspaceSlug,
    projectCreated: false,
    fileMigrationStatus: "complete",
  });

  const retry = await page.request.post(
    `/api/leads-clients/opportunities/${fixture.opportunitySlug}/convert`,
    {
      headers: { "x-request-id": crypto.randomUUID() },
      data: { acceptedQuoteId: fixture.quoteId },
    },
  );
  expect(retry.status()).toBe(200);
  expect(await retry.json()).toMatchObject({ projectId: fixture.workspaceProjectId });

  const state = await admin
    .from("organization_opportunities")
    .select("workspace_project_id,converted_project_id,stage")
    .eq("id", fixture.opportunityId)
    .single();
  expect(state.data).toEqual({
    workspace_project_id: fixture.workspaceProjectId,
    converted_project_id: fixture.workspaceProjectId,
    stage: "Won",
  });
  const events = await admin
    .from("opportunity_promotion_events")
    .select("project_id")
    .eq("opportunity_id", fixture.opportunityId);
  expect(events.data).toEqual([{ project_id: fixture.workspaceProjectId }]);
}

test.describe.serial("Stage 6 hosted-development Opportunity promotion UI", () => {
  test.beforeAll(async () => {
    const client = await admin
      .from("organization_clients")
      .select("id")
      .eq("organization_id", ORGANIZATION_ID)
      .limit(1)
      .single();
    if (client.error) throw client.error;
    existingClientId = client.data.id;
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await login(page, baseURL!);
  });

  test("creates through unchanged dialog and full-page UI", async ({ page }, testInfo) => {
    await page.goto("/app/leads-clients/opportunities");
    await page.getByRole("button", { name: "New Opportunity" }).click();
    await page.getByLabel("Tender Name").fill(names.dialog);
    await page.getByLabel("Client").selectOption(existingClientId);
    await page.getByLabel("Project Location").fill("Stage 6 Hosted Development");
    await page.getByLabel("Tender Due Date").fill("2026-09-30");
    await page.getByLabel("Estimated Value (NZD)").fill("1200");
    await capture(page, testInfo, "stage6-hosted-dialog-before-create");
    const dialogResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/leads-clients/opportunities/create"),
    );
    await page.getByRole("button", { name: "Create Tender" }).click();
    const dialogResponse = await dialogResponsePromise;
    if (!dialogResponse.ok()) {
      throw new Error(`Hosted dialog creation failed (${dialogResponse.status()}): ${await dialogResponse.text()}`);
    }
    await expect(page).toHaveURL(/\/app\/leads-clients\/opportunities\/s6-ui-/);
    const dialogFixture = await loadAndSeed(names.dialog);
    fixtures.push(dialogFixture);
    await page.goto("/app/projects");
    await expect(page.getByText(`${names.dialog} Tender Workspace`, { exact: true })).toHaveCount(0);
    await capture(page, testInfo, "stage6-hosted-dialog-project-hidden");

    await page.goto("/app/leads-clients/opportunities/new");
    await page.getByLabel("Tender Name").fill(names.fullPage);
    await page.getByLabel("Client").selectOption("__new_client__");
    await page.getByLabel("Project Location").fill("Stage 6 Hosted Development");
    await page.getByLabel("Contact Name").fill("Stage 6 Test Contact");
    await page.getByLabel("Company Name").fill(names.newClient);
    await page.getByLabel("Email").fill(`stage6-${runId}@tradesstack.local`);
    await page.getByLabel("Phone").fill("021 555 0606");
    await page.getByLabel("Tender Due Date").fill("2026-09-30");
    await page.getByLabel("Estimated Value (NZD)").fill("1200");
    await capture(page, testInfo, "stage6-hosted-full-page-before-create");
    const fullPageResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/leads-clients/opportunities/create"),
    );
    await page.getByRole("button", { name: "Create Tender" }).dblclick();
    const fullPageResponse = await fullPageResponsePromise;
    if (!fullPageResponse.ok()) {
      throw new Error(`Hosted full-page creation failed (${fullPageResponse.status()}): ${await fullPageResponse.text()}`);
    }
    await expect(page).toHaveURL(/\/app\/leads-clients\/opportunities\/s6-ui-/);
    fixtures.push(await loadAndSeed(names.fullPage));
  });

  test("awards through current route and preserves visible W and tasks", async ({ page }, testInfo) => {
    expect(fixtures).toHaveLength(2);
    for (const fixture of fixtures) await awardAndVerify(page, fixture);

    const first = fixtures[0]!;
    await page.goto("/app/projects");
    await expect(page.getByText(`${names.dialog} Tender Workspace`, { exact: true })).toHaveCount(1);
    await capture(page, testInfo, "stage6-hosted-project-visible-once");

    await page.goto(`/app/leads-clients/opportunities/${first.opportunitySlug}`);
    await expect(page.getByText(`${names.dialog} continuity task`, { exact: true })).toBeVisible();
    await capture(page, testInfo, "stage6-hosted-opportunity-task-continuity");

    await page.goto(`/app/projects/${first.workspaceSlug}/job-management/todos`);
    await expect(page.getByText(`${names.dialog} continuity task`, { exact: true })).toBeVisible();
    await capture(page, testInfo, "stage6-hosted-project-task-continuity");

    await page.goto(`/app/projects/${first.workspaceSlug}`);
    await expect(
      page.getByRole("heading", {
        name: `${names.dialog} Tender Workspace`,
        exact: true,
      }),
    ).toBeVisible();
    await capture(page, testInfo, "stage6-hosted-project-overview");
  });
});
