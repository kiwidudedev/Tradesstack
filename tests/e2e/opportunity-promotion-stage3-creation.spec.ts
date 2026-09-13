import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const runId = Date.now().toString(36);
const names = {
  dialog: `Stage 3 Dialog ${runId}`,
  fullPage: `Stage 3 Full Page ${runId}`,
  client: `Stage 3 Existing Client ${runId}`,
  newClient: `Stage 3 New Client ${runId}`,
};

let organizationId = "";
let userId = "";
let clientId = "";
let dialogOpportunityId = "";
let dialogWorkspaceId = "";
let dialogSlug = "";

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function assertCreation(name: string) {
  const admin = createE2EAdminClient();
  const opportunity = await admin
    .from("organization_opportunities")
    .select("id,slug,client_id,workspace_project_id,converted_project_id")
    .eq("organization_id", organizationId)
    .eq("name", name);
  expect(opportunity.error).toBeNull();
  expect(opportunity.data).toHaveLength(1);
  const row = opportunity.data![0]!;

  const project = await admin
    .from("organization_projects")
    .select("id,slug,client_id,source_opportunity_id,stage,project_code")
    .eq("id", row.workspace_project_id!)
    .single();
  expect(project.error).toBeNull();
  const lifecycle = await admin
    .from("opportunity_lifecycles")
    .select("id,opportunity_id,original_workspace_project_id,strategy,creation_request_id")
    .eq("opportunity_id", row.id)
    .single();
  expect(lifecycle.error).toBeNull();
  expect(project.data).toMatchObject({
    id: row.workspace_project_id,
    source_opportunity_id: row.id,
    client_id: row.client_id,
    stage: "Pricing",
  });
  expect(project.data!.slug).toContain("-tender");
  expect(project.data!.project_code).toBeTruthy();
  expect(lifecycle.data).toMatchObject({
    opportunity_id: row.id,
    original_workspace_project_id: row.workspace_project_id,
    strategy: "legacy_two_project_v1",
  });
  expect(lifecycle.data!.creation_request_id).toBeTruthy();
  expect(row.converted_project_id).toBeNull();
  return { row, project: project.data!, lifecycle: lifecycle.data! };
}

test.describe.serial("Stage 3 authoritative Opportunity creation", () => {
  test.beforeAll(async () => {
    const context = await ensureSupplierInvoiceE2EContext();
    organizationId = context.organizationId;
    userId = context.userId;
    const admin = createE2EAdminClient();
    const client = await admin
      .from("organization_clients")
      .insert({
        organization_id: organizationId,
        created_by: userId,
        name: names.client,
        company_name: names.client,
      })
      .select("id")
      .single();
    if (client.error) throw client.error;
    clientId = client.data.id;

    const control = await admin
      .from("opportunity_lifecycle_rollout_controls")
      .upsert({
        organization_id: organizationId,
        allowed_strategy: "legacy_two_project_v1",
        creation_enabled: true,
        promotion_enabled: false,
        updated_by: userId,
      });
    if (control.error) throw control.error;
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
  });

  test("dialog survives an ambiguous response without duplicate O/W", async ({
    page,
  }, testInfo) => {
    let intercepted = false;
    await page.route("**/api/leads-clients/opportunities/create", async (route) => {
      const response = await route.fetch();
      if (!intercepted) {
        intercepted = true;
        await route.abort("failed");
        return;
      }
      await route.fulfill({ response });
    });

    await page.goto("/app/leads-clients/opportunities");
    await page.getByRole("button", { name: "New Opportunity" }).click();
    await capture(page, testInfo, "new-opportunity-dialog");
    await page.getByLabel("Tender Name").fill(names.dialog);
    await page.getByLabel("Client").selectOption(clientId);
    await page.getByLabel("Project Location").fill("Auckland");
    await page.getByLabel("Tender Due Date").fill("2026-08-31");
    await page.getByLabel("Estimated Value (NZD)").fill("250000");
    await page.getByRole("button", { name: "Create Tender" }).click();
    await expect(page.getByText("Failed to fetch", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Create Tender" }).click();
    await expect(page).toHaveURL(/\/app\/leads-clients\/opportunities\/stage-3-dialog-/);
    const created = await assertCreation(names.dialog);
    dialogOpportunityId = created.row.id;
    dialogWorkspaceId = created.row.workspace_project_id!;
    dialogSlug = created.row.slug;
    expect(created.row.client_id).toBe(clientId);
    await capture(page, testInfo, "stage3-dialog-opportunity-overview");

    await page.goto("/app/projects");
    await expect(page.getByText(`${names.dialog} Tender Workspace`, { exact: true })).toHaveCount(0);
    await capture(page, testInfo, "projects-list-workspace-hidden");
    expect(await page.locator("body").innerText()).not.toContain("Application error");
  });

  test("full-page flow creates client/O/W atomically with unchanged presentation", async ({
    page,
  }, testInfo) => {
    await page.goto("/app/leads-clients/opportunities/new");
    await capture(page, testInfo, "new-opportunity-full-page");
    await page.getByLabel("Tender Name").fill(names.fullPage);
    await page.getByLabel("Client").selectOption("__new_client__");
    await page.getByLabel("Project Location").fill("Wellington");
    await page.getByLabel("Contact Name").fill("Stage Three Contact");
    await page.getByLabel("Company Name").fill(names.newClient);
    await page.getByLabel("Email").fill("stage3@example.test");
    await page.getByLabel("Phone").fill("021 555 0303");
    await page.getByLabel("Tender Due Date").fill("2026-09-30");
    await page.getByLabel("Estimated Value (NZD)").fill("350000");
    await page.getByRole("button", { name: "Create Tender" }).dblclick();
    await expect(page).toHaveURL(/\/app\/leads-clients\/opportunities\/stage-3-full-page-/);
    const created = await assertCreation(names.fullPage);
    const admin = createE2EAdminClient();
    const client = await admin
      .from("organization_clients")
      .select("id,company_name")
      .eq("organization_id", organizationId)
      .eq("company_name", names.newClient);
    expect(client.error).toBeNull();
    expect(client.data).toHaveLength(1);
    expect(created.row.client_id).toBe(client.data![0]!.id);
    await capture(page, testInfo, "stage3-full-page-opportunity-overview");
  });

  test("new Stage 3 workspace remains continuous and legacy award creates F", async ({
    page,
  }) => {
    const workspaceRoutes = [
      "",
      "/files",
      "/drawing-intelligence",
      "/generate-trade-pack",
      "/scope-builder",
      "/build-scope",
      "/takeoff",
      "/takeoff/quantities",
      "/pricing-worksheet",
      "/quote",
    ];
    for (const suffix of workspaceRoutes) {
      const response = await page.goto(
        `/app/leads-clients/opportunities/${dialogSlug}${suffix}`,
        { waitUntil: "domcontentloaded" },
      );
      expect(response?.status() ?? 200).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("body")).not.toContainText("Application error");
    }

    const admin = createE2EAdminClient();
    const quoteId = crypto.randomUUID();
    const quote = await admin.from("project_quotes").insert({
      id: quoteId,
      organization_id: organizationId,
      created_by: userId,
      quote_title: `Stage 3 accepted quote ${runId}`,
      quote_number: `S3-${runId}`,
      status: "Accepted",
      originating_opportunity_id: dialogOpportunityId,
      source_opportunity_id: dialogOpportunityId,
      subtotal: 250000,
      quote_date: "2026-07-31",
    });
    if (quote.error) throw quote.error;

    const conversion = await page.request.post(
      `/api/leads-clients/opportunities/${dialogSlug}/convert`,
      { data: { acceptedQuoteId: quoteId } },
    );
    expect(conversion.status()).toBe(200);
    const converted = await conversion.json() as { projectId: string };
    expect(converted.projectId).not.toBe(dialogWorkspaceId);

    const opportunity = await admin
      .from("organization_opportunities")
      .select("converted_project_id")
      .eq("id", dialogOpportunityId)
      .single();
    const mapping = await admin
      .from("opportunity_final_projects")
      .select("project_id,accepted_quote_id")
      .eq("opportunity_id", dialogOpportunityId)
      .single();
    const events = await admin
      .from("opportunity_promotion_events")
      .select("id", { count: "exact", head: true })
      .eq("opportunity_id", dialogOpportunityId);
    expect(opportunity.data?.converted_project_id).toBe(converted.projectId);
    expect(mapping.data).toMatchObject({
      project_id: converted.projectId,
      accepted_quote_id: quoteId,
    });
    expect(events.count).toBe(0);
  });

  test("control remains trusted legacy-only and promotion remains dormant", async () => {
    const admin = createE2EAdminClient();
    const control = await admin
      .from("opportunity_lifecycle_rollout_controls")
      .select("allowed_strategy,creation_enabled,promotion_enabled")
      .eq("organization_id", organizationId)
      .single();
    expect(control.data).toEqual({
      allowed_strategy: "legacy_two_project_v1",
      creation_enabled: true,
      promotion_enabled: false,
    });
    const events = await admin
      .from("opportunity_promotion_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("strategy", "promote_workspace_v1")
      .in("opportunity_id", [dialogOpportunityId]);
    expect(events.count).toBe(0);
  });
});
