import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const runId = Date.now().toString(36);
const opportunityName = `Stage 5 Pilot ${runId}`;
let organizationId = "";
let userId = "";
let clientId = "";
let opportunityId = "";
let opportunitySlug = "";
let workspaceProjectId = "";
let workspaceProjectSlug = "";
let taskId = "";
let quoteId = "";

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.describe.serial("Stage 5 local administrator same-Project pilot", () => {
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
        name: opportunityName,
        company_name: `${opportunityName} Limited`,
      })
      .select("id")
      .single();
    if (client.error) throw client.error;
    clientId = client.data.id;

    const control = await admin
      .from("opportunity_lifecycle_rollout_controls")
      .upsert({
        organization_id: organizationId,
        allowed_strategy: "promote_workspace_v1",
        creation_enabled: true,
        promotion_enabled: true,
        pilot_scope: "local_admin_pilot",
        pilot_environment: "local_development",
        updated_by: userId,
      });
    if (control.error) throw control.error;
  });

  test.afterAll(async () => {
    if (!organizationId) return;
    const admin = createE2EAdminClient();
    const disabled = await admin
      .from("opportunity_lifecycle_rollout_controls")
      .update({
        creation_enabled: false,
        promotion_enabled: false,
        updated_by: userId,
      })
      .eq("organization_id", organizationId);
    if (disabled.error) throw disabled.error;
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
  });

  test("creates an immutable promotion-strategy O/W through the unchanged dialog", async ({
    page,
  }, testInfo) => {
    await page.goto("/app/leads-clients/opportunities");
    await page.getByRole("button", { name: "New Opportunity" }).click();
    await page.getByLabel("Tender Name").fill(opportunityName);
    await page.getByLabel("Client").selectOption(clientId);
    await page.getByLabel("Project Location").fill("Auckland");
    await page.getByLabel("Tender Due Date").fill("2026-09-30");
    await page.getByLabel("Estimated Value (NZD)").fill("150000");
    await capture(page, testInfo, "stage5-creation-dialog-unchanged");
    await page.getByRole("button", { name: "Create Tender" }).click();
    await expect(page).toHaveURL(/\/app\/leads-clients\/opportunities\/stage-5-pilot-/);

    const admin = createE2EAdminClient();
    const opportunity = await admin
      .from("organization_opportunities")
      .select("id,slug,workspace_project_id,converted_project_id")
      .eq("organization_id", organizationId)
      .eq("name", opportunityName)
      .single();
    if (opportunity.error) throw opportunity.error;
    opportunityId = opportunity.data.id;
    opportunitySlug = opportunity.data.slug;
    workspaceProjectId = opportunity.data.workspace_project_id!;
    expect(opportunity.data.converted_project_id).toBeNull();

    const project = await admin
      .from("organization_projects")
      .select("slug,project_code")
      .eq("id", workspaceProjectId)
      .single();
    if (project.error) throw project.error;
    workspaceProjectSlug = project.data.slug;
    const lifecycle = await admin
      .from("opportunity_lifecycles")
      .select("strategy,original_workspace_project_id")
      .eq("opportunity_id", opportunityId)
      .single();
    expect(lifecycle.data).toEqual({
      strategy: "promote_workspace_v1",
      original_workspace_project_id: workspaceProjectId,
    });

    await capture(page, testInfo, "stage5-pre-award-opportunity");
    await page.goto("/app/projects");
    await expect(page.getByText(`${opportunityName} Tender Workspace`, { exact: true })).toHaveCount(0);
    await capture(page, testInfo, "stage5-pre-award-project-hidden");
  });

  test("awards through the unchanged route and exposes the same W exactly once", async ({
    page,
  }, testInfo) => {
    const admin = createE2EAdminClient();
    quoteId = crypto.randomUUID();
    taskId = crypto.randomUUID();
    const quote = await admin.from("project_quotes").insert({
      id: quoteId,
      organization_id: organizationId,
      project_id: workspaceProjectId,
      created_by: userId,
      quote_title: `Stage 5 accepted quote ${runId}`,
      quote_number: `S5-${runId}`,
      status: "Accepted",
      originating_opportunity_id: opportunityId,
      source_opportunity_id: opportunityId,
      subtotal: 150000,
      gst_amount: 22500,
      total_quote_price: 172500,
      quote_date: "2026-08-01",
    });
    if (quote.error) throw quote.error;
    const line = await admin.from("project_quote_line_items").insert({
      organization_id: organizationId,
      project_id: workspaceProjectId,
      quote_id: quoteId,
      section: "Labour",
      description: "Stage 5 baseline",
      quantity: 1,
      unit: "item",
      rate: 150000,
      total: 150000,
      sort_order: 0,
    });
    if (line.error) throw line.error;
    const task = await admin.from("project_job_todos").insert({
      id: taskId,
      organization_id: organizationId,
      project_id: workspaceProjectId,
      opportunity_id: opportunityId,
      created_by: userId,
      assigned_user_id: userId,
      title: `Stage 5 continuity task ${runId}`,
    });
    if (task.error) throw task.error;

    const response = await page.request.post(
      `/api/leads-clients/opportunities/${opportunitySlug}/convert`,
      {
        headers: { "x-request-id": crypto.randomUUID() },
        data: { acceptedQuoteId: quoteId },
      },
    );
    expect(response.status()).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      projectId: workspaceProjectId,
      projectSlug: workspaceProjectSlug,
      projectCreated: false,
      fileMigrationStatus: "complete",
      warning: null,
    });

    const retry = await page.request.post(
      `/api/leads-clients/opportunities/${opportunitySlug}/convert`,
      { data: { acceptedQuoteId: quoteId } },
    );
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({
      projectId: workspaceProjectId,
      projectCreated: false,
    });

    const state = await admin
      .from("organization_opportunities")
      .select("workspace_project_id,converted_project_id,stage")
      .eq("id", opportunityId)
      .single();
    expect(state.data).toEqual({
      workspace_project_id: workspaceProjectId,
      converted_project_id: workspaceProjectId,
      stage: "Won",
    });
    const mappings = await admin
      .from("opportunity_final_projects")
      .select("project_id,accepted_quote_id")
      .eq("opportunity_id", opportunityId);
    expect(mappings.data).toEqual([{ project_id: workspaceProjectId, accepted_quote_id: quoteId }]);
    const events = await admin
      .from("opportunity_promotion_events")
      .select("project_id,accepted_quote_id,evidence_hash")
      .eq("opportunity_id", opportunityId);
    expect(events.data).toHaveLength(1);
    expect(events.data![0]).toMatchObject({ project_id: workspaceProjectId, accepted_quote_id: quoteId });

    await page.goto("/app/projects");
    await expect(page.getByText(`${opportunityName} Tender Workspace`, { exact: true })).toHaveCount(1);
    await capture(page, testInfo, "stage5-post-award-project-visible");
  });

  test("keeps the same task usable through Opportunity and Project workspaces", async ({
    page,
  }, testInfo) => {
    await page.goto(`/app/leads-clients/opportunities/${opportunitySlug}`);
    await expect(page.getByText(`Stage 5 continuity task ${runId}`, { exact: true })).toBeVisible();
    await capture(page, testInfo, "stage5-post-award-opportunity-task");

    await page.goto(`/app/projects/${workspaceProjectSlug}/job-management/todos`);
    await expect(page.getByText(`Stage 5 continuity task ${runId}`, { exact: true })).toBeVisible();
    await capture(page, testInfo, "stage5-post-award-project-task");

    const admin = createE2EAdminClient();
    const tasks = await admin
      .from("project_job_todos")
      .select("id,project_id,opportunity_id")
      .eq("id", taskId);
    expect(tasks.data).toEqual([{
      id: taskId,
      project_id: workspaceProjectId,
      opportunity_id: opportunityId,
    }]);
  });
});
