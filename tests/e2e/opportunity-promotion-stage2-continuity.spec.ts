import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const runId = Date.now().toString(36);
const ids = {
  client: crypto.randomUUID(),
  directProject: crypto.randomUUID(),
  historicalOpportunity: crypto.randomUUID(),
  historicalWorkspace: crypto.randomUUID(),
  historicalFinal: crypto.randomUUID(),
  historicalQuote: crypto.randomUUID(),
  unawardedOpportunity: crypto.randomUUID(),
  unawardedWorkspace: crypto.randomUUID(),
  unawardedLifecycle: crypto.randomUUID(),
  promotedOpportunity: crypto.randomUUID(),
  promotedWorkspace: crypto.randomUUID(),
  promotedLifecycle: crypto.randomUUID(),
  promotedQuote: crypto.randomUUID(),
  promotionEvent: crypto.randomUUID(),
  promotedTask: crypto.randomUUID(),
  promotedDrawing: crypto.randomUUID(),
  promotedTakeoffPage: crypto.randomUUID(),
  promotedCalibration: crypto.randomUUID(),
  promotedMeasurement: crypto.randomUUID(),
  retentionClaim: crypto.randomUUID(),
};

const slugs = {
  directProject: `stage2-direct-${runId}`,
  historicalOpportunity: `stage2-historical-opportunity-${runId}`,
  historicalWorkspace: `stage2-historical-tender-${runId}`,
  historicalFinal: `stage2-historical-final-${runId}`,
  unawardedOpportunity: `stage2-unawarded-opportunity-${runId}`,
  unawardedWorkspace: `stage2-unawarded-tender-${runId}`,
  promotedOpportunity: `stage2-promoted-opportunity-${runId}`,
  promotedWorkspace: `stage2-promoted-project-${runId}`,
};

const names = {
  directProject: `Stage 2 Direct Project ${runId}`,
  historicalOpportunity: `Stage 2 Historical Opportunity ${runId}`,
  historicalWorkspace: `Stage 2 Historical Tender ${runId}`,
  historicalFinal: `Stage 2 Historical Final ${runId}`,
  unawardedOpportunity: `Stage 2 Unawarded Opportunity ${runId}`,
  unawardedWorkspace: `Stage 2 Unawarded Tender ${runId}`,
  promotedOpportunity: `Stage 2 Promoted Opportunity ${runId}`,
  promotedWorkspace: `Stage 2 Promoted Project ${runId}`,
  promotedTask: `Stage 2 Promoted Task ${runId}`,
  retentionClaimNumber: `S2-${runId}-RC-01`,
};

let organizationId = "";
let userId = "";

async function insertOpportunity(
  opportunityId: string,
  opportunitySlug: string,
  opportunityName: string,
  workspaceId: string,
  workspaceSlug: string,
  workspaceName: string,
) {
  const admin = createE2EAdminClient();
  const opportunity = await admin.from("organization_opportunities").insert({
    id: opportunityId,
    organization_id: organizationId,
    created_by: userId,
    owner_user_id: userId,
    client_id: ids.client,
    name: opportunityName,
    slug: opportunitySlug,
    stage: "Quoted",
  });
  if (opportunity.error) throw opportunity.error;

  const project = await admin.from("organization_projects").insert({
    id: workspaceId,
    organization_id: organizationId,
    created_by: userId,
    client_id: ids.client,
    name: workspaceName,
    slug: workspaceSlug,
    stage: "Pricing",
    source_opportunity_id: opportunityId,
  });
  if (project.error) throw project.error;

  const workspace = await admin
    .from("organization_opportunities")
    .update({ workspace_project_id: workspaceId })
    .eq("id", opportunityId);
  if (workspace.error) throw workspace.error;
}

async function seedFixtures() {
  const context = await ensureSupplierInvoiceE2EContext();
  organizationId = context.organizationId;
  userId = context.userId;
  const admin = createE2EAdminClient();

  const client = await admin.from("organization_clients").insert({
    id: ids.client,
    organization_id: organizationId,
    created_by: userId,
    name: `Stage 2 Client ${runId}`,
    company_name: `Stage 2 Client ${runId}`,
  });
  if (client.error) throw client.error;

  const direct = await admin.from("organization_projects").insert({
    id: ids.directProject,
    organization_id: organizationId,
    created_by: userId,
    client_id: ids.client,
    name: names.directProject,
    slug: slugs.directProject,
    stage: "Construction",
  });
  if (direct.error) throw direct.error;

  await insertOpportunity(
    ids.historicalOpportunity,
    slugs.historicalOpportunity,
    names.historicalOpportunity,
    ids.historicalWorkspace,
    slugs.historicalWorkspace,
    names.historicalWorkspace,
  );
  const historicalFinal = await admin.from("organization_projects").insert({
    id: ids.historicalFinal,
    organization_id: organizationId,
    created_by: userId,
    client_id: ids.client,
    name: names.historicalFinal,
    slug: slugs.historicalFinal,
    stage: "Construction",
    source_opportunity_id: ids.historicalOpportunity,
  });
  if (historicalFinal.error) throw historicalFinal.error;
  const historicalQuote = await admin.from("project_quotes").insert({
    id: ids.historicalQuote,
    organization_id: organizationId,
    project_id: ids.historicalFinal,
    created_by: userId,
    quote_title: "Historical accepted contract",
    status: "Accepted",
    originating_opportunity_id: ids.historicalOpportunity,
    source_opportunity_id: ids.historicalOpportunity,
    subtotal: 1200,
  });
  if (historicalQuote.error) throw historicalQuote.error;
  const historicalAward = await admin
    .from("organization_opportunities")
    .update({
      converted_project_id: ids.historicalFinal,
      stage: "Won",
    })
    .eq("id", ids.historicalOpportunity);
  if (historicalAward.error) throw historicalAward.error;
  const historicalMapping = await admin.from("opportunity_final_projects").insert({
    opportunity_id: ids.historicalOpportunity,
    organization_id: organizationId,
    project_id: ids.historicalFinal,
    accepted_quote_id: ids.historicalQuote,
    created_by: userId,
  });
  if (historicalMapping.error) throw historicalMapping.error;

  await insertOpportunity(
    ids.unawardedOpportunity,
    slugs.unawardedOpportunity,
    names.unawardedOpportunity,
    ids.unawardedWorkspace,
    slugs.unawardedWorkspace,
    names.unawardedWorkspace,
  );
  const unawardedLifecycle = await admin.from("opportunity_lifecycles").insert({
    id: ids.unawardedLifecycle,
    organization_id: organizationId,
    opportunity_id: ids.unawardedOpportunity,
    original_workspace_project_id: ids.unawardedWorkspace,
    strategy: "promote_workspace_v1",
    strategy_version: 1,
    creation_request_id: crypto.randomUUID(),
    created_by: userId,
  });
  if (unawardedLifecycle.error) throw unawardedLifecycle.error;

  await insertOpportunity(
    ids.promotedOpportunity,
    slugs.promotedOpportunity,
    names.promotedOpportunity,
    ids.promotedWorkspace,
    slugs.promotedWorkspace,
    names.promotedWorkspace,
  );
  const promotedLifecycle = await admin.from("opportunity_lifecycles").insert({
    id: ids.promotedLifecycle,
    organization_id: organizationId,
    opportunity_id: ids.promotedOpportunity,
    original_workspace_project_id: ids.promotedWorkspace,
    strategy: "promote_workspace_v1",
    strategy_version: 1,
    creation_request_id: crypto.randomUUID(),
    created_by: userId,
  });
  if (promotedLifecycle.error) throw promotedLifecycle.error;
  const promotedQuote = await admin.from("project_quotes").insert({
    id: ids.promotedQuote,
    organization_id: organizationId,
    project_id: ids.promotedWorkspace,
    created_by: userId,
    quote_title: "Promoted accepted contract",
    status: "Accepted",
    originating_opportunity_id: ids.promotedOpportunity,
    source_opportunity_id: ids.promotedOpportunity,
    subtotal: 2300,
  });
  if (promotedQuote.error) throw promotedQuote.error;
  const promotedAward = await admin
    .from("organization_opportunities")
    .update({
      converted_project_id: ids.promotedWorkspace,
      stage: "Won",
    })
    .eq("id", ids.promotedOpportunity);
  if (promotedAward.error) throw promotedAward.error;
  const promotedMapping = await admin.from("opportunity_final_projects").insert({
    opportunity_id: ids.promotedOpportunity,
    organization_id: organizationId,
    project_id: ids.promotedWorkspace,
    accepted_quote_id: ids.promotedQuote,
    created_by: userId,
  });
  if (promotedMapping.error) throw promotedMapping.error;
  const promotedEvent = await admin.from("opportunity_promotion_events").insert({
    id: ids.promotionEvent,
    organization_id: organizationId,
    lifecycle_id: ids.promotedLifecycle,
    opportunity_id: ids.promotedOpportunity,
    project_id: ids.promotedWorkspace,
    accepted_quote_id: ids.promotedQuote,
    strategy: "promote_workspace_v1",
    strategy_version: 1,
    correlation_id: crypto.randomUUID(),
    completed_by: userId,
  });
  if (promotedEvent.error) throw promotedEvent.error;
  const promotedTask = await admin.from("project_job_todos").insert({
    id: ids.promotedTask,
    organization_id: organizationId,
    project_id: ids.promotedWorkspace,
    opportunity_id: ids.promotedOpportunity,
    created_by: userId,
    assigned_user_id: userId,
    title: names.promotedTask,
  });
  if (promotedTask.error) throw promotedTask.error;
  const promotedDrawing = await admin.from("project_drawing_sets").insert({
    id: ids.promotedDrawing,
    organization_id: organizationId,
    project_id: ids.promotedWorkspace,
    uploaded_by: userId,
    file_name: `stage2-promoted-${runId}.pdf`,
    storage_path: `${organizationId}/${ids.promotedWorkspace}/stage2-promoted-${runId}.pdf`,
    file_size_bytes: 100,
    mime_type: "application/pdf",
  });
  if (promotedDrawing.error) throw promotedDrawing.error;
  const promotedPage = await admin.from("takeoff_pages").insert({
    id: ids.promotedTakeoffPage,
    organization_id: organizationId,
    project_id: ids.promotedWorkspace,
    opportunity_id: ids.promotedOpportunity,
    drawing_set_id: ids.promotedDrawing,
    page_number: 1,
    page_width_pts: 595,
    page_height_pts: 842,
    created_by: userId,
  });
  if (promotedPage.error) throw promotedPage.error;
  const promotedCalibration = await admin.from("takeoff_calibrations").insert({
    id: ids.promotedCalibration,
    organization_id: organizationId,
    project_id: ids.promotedWorkspace,
    opportunity_id: ids.promotedOpportunity,
    page_id: ids.promotedTakeoffPage,
    created_by: userId,
    name: "Stage 2 promoted scale",
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
  });
  if (promotedCalibration.error) throw promotedCalibration.error;
  const promotedMeasurement = await admin.from("takeoff_measurements").insert({
    id: ids.promotedMeasurement,
    organization_id: organizationId,
    project_id: ids.promotedWorkspace,
    opportunity_id: ids.promotedOpportunity,
    drawing_set_id: ids.promotedDrawing,
    page_id: ids.promotedTakeoffPage,
    measurement_kind: "count",
    quantity: 3,
    count_value: 3,
    created_by: userId,
  });
  if (promotedMeasurement.error) throw promotedMeasurement.error;

  const capability = await admin
    .from("organization_capabilities")
    .update({
      enabled: true,
      enabled_by: userId,
      enabled_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("capability_key", "retention_management");
  if (capability.error) throw capability.error;
  const workflow = await admin
    .from("project_retention_workflow_states")
    .update({
      mode: "observe",
      changed_by: userId,
      changed_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("project_id", ids.promotedWorkspace);
  if (workflow.error) throw workflow.error;
  const retentionClaim = await admin.from("retention_claims").insert({
    id: ids.retentionClaim,
    organization_id: organizationId,
    project_id: ids.promotedWorkspace,
    claim_number: names.retentionClaimNumber,
    title: "Stage 2 Retention Claim",
    status: "submitted",
    subtotal_excl_tax: 125,
    submission_state_hash:
      crypto.randomUUID().replaceAll("-", "")
      + crypto.randomUUID().replaceAll("-", ""),
    submitted_by: userId,
    submitted_at: new Date().toISOString(),
    created_by: userId,
    draft_kind: "manual",
    master_role: "master_retention_claim",
  });
  if (retentionClaim.error) throw retentionClaim.error;
}

async function expectRoute(page: Page, path: string) {
  let response;
  try {
    response = await page.goto(path, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) {
      throw error;
    }
    // A few established workspace entry routes perform a client redirect after
    // the initial response. Let that navigation settle, then load the intended
    // canonical route once more.
    await page.waitForLoadState("domcontentloaded");
    response = await page.goto(path, { waitUntil: "domcontentloaded" });
  }
  if (response) {
    expect(response.status(), `${path} response`).toBeLessThan(400);
  }
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
  await expect(page.locator("body")).not.toContainText("Application error");
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.describe.serial("Stage 2 Opportunity promotion continuity", () => {
  test.beforeAll(async () => {
    await seedFixtures();
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
  });

  test("keeps historical, unawarded, promoted, and direct visibility distinct", async ({
    page,
  }, testInfo) => {
    await expectRoute(page, "/app/projects");
    await expect(page.getByText(names.historicalFinal, { exact: true })).toHaveCount(1);
    await expect(page.getByText(names.promotedWorkspace, { exact: true })).toHaveCount(1);
    await expect(page.getByText(names.directProject, { exact: true })).toHaveCount(1);
    await expect(page.getByText(names.historicalWorkspace, { exact: true })).toHaveCount(0);
    await expect(page.getByText(names.unawardedWorkspace, { exact: true })).toHaveCount(0);
    await capture(page, testInfo, "projects-main");

    await expectRoute(page, "/app/leads-clients/clients");
    await capture(page, testInfo, "client-list");
    await expectRoute(page, `/app/leads-clients/clients/${ids.client}`);
    await page.getByText("Jobs", { exact: true }).click();
    await expect(page.getByText(names.historicalFinal, { exact: true })).toHaveCount(1);
    await expect(page.getByText(names.promotedWorkspace, { exact: true })).toHaveCount(1);
    await expect(page.getByText(names.directProject, { exact: true })).toHaveCount(1);
    await expect(page.getByText(names.historicalWorkspace, { exact: true })).toHaveCount(0);
    await expect(page.getByText(names.unawardedWorkspace, { exact: true })).toHaveCount(0);
    await capture(page, testInfo, "client-detail-projects");
  });

  test("loads every active Opportunity workspace route without changing workspace identity", async ({
    page,
  }, testInfo) => {
    const opportunityRoutes = [
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
    const fixtures = [
      [slugs.historicalOpportunity, ids.historicalWorkspace],
      [slugs.unawardedOpportunity, ids.unawardedWorkspace],
      [slugs.promotedOpportunity, ids.promotedWorkspace],
    ] as const;

    for (const [slug, workspaceId] of fixtures) {
      for (const suffix of opportunityRoutes) {
        await expectRoute(
          page,
          `/app/leads-clients/opportunities/${slug}${suffix}`,
        );
      }
      const admin = createE2EAdminClient();
      const { data, error } = await admin
        .from("organization_opportunities")
        .select("workspace_project_id")
        .eq("slug", slug)
        .single();
      expect(error).toBeNull();
      expect(data?.workspace_project_id).toBe(workspaceId);
    }

    await expectRoute(
      page,
      `/app/leads-clients/opportunities/${slugs.promotedOpportunity}`,
    );
    await expect(page.getByText(names.promotedTask, { exact: true })).toBeVisible();
    await capture(page, testInfo, "opportunity-promoted-overview");
    await expectRoute(
      page,
      `/app/leads-clients/opportunities/${slugs.promotedOpportunity}/generate-trade-pack`,
    );
    await capture(page, testInfo, "opportunity-trade-pack-selector");
  });

  test("loads every active delivery workspace route for all visible Project models", async ({
    page,
  }, testInfo) => {
    test.setTimeout(8 * 60_000);
    const projectRoutes = [
      "/dashboard",
      "/files",
      "/drawing-intelligence",
      "/scope-builder",
      "/preconstruction",
      "/preconstruction/quote",
      "/preconstruction/variations",
      "/preconstruction/purchase-orders",
      "/preconstruction/claims",
      "/preconstruction/retention",
      "/financials",
      "/job-management",
      "/job-management/time-sheets",
      "/job-management/todos",
      "/job-management/quality-assurance",
      "/site-safety",
      "/ai-chatbot",
    ];
    for (const slug of [
      slugs.historicalFinal,
      slugs.promotedWorkspace,
      slugs.directProject,
    ]) {
      for (const suffix of projectRoutes) {
        await expectRoute(page, `/app/projects/${slug}${suffix}`);
      }
    }

    await expectRoute(page, `/app/projects/${slugs.promotedWorkspace}/dashboard`);
    await capture(page, testInfo, "project-promoted-overview");
    await expectRoute(page, `/app/projects/${slugs.promotedWorkspace}/job-management/todos`);
    await expect(page.getByText(names.promotedTask, { exact: true })).toBeVisible();
    await expectRoute(page, `/app/projects/${slugs.promotedWorkspace}/financials`);
    await capture(page, testInfo, "project-promoted-financials");
    await expectRoute(
      page,
      `/app/projects/${slugs.promotedWorkspace}/preconstruction/claims`,
    );
    await expect(
      page.getByText(names.retentionClaimNumber, { exact: true }),
    ).toHaveCount(1);
    await capture(page, testInfo, "project-promoted-payment-claims");
    await expectRoute(
      page,
      `/app/projects/${slugs.promotedWorkspace}/preconstruction/retention`,
    );
    await expectRoute(
      page,
      `/app/projects/${slugs.promotedWorkspace}/preconstruction/retention/claims/${ids.retentionClaim}`,
    );
    await expect(page.getByTestId("retention-claim-detail")).toContainText(
      names.retentionClaimNumber,
    );
    await expect(page.getByTestId("retention-claim-detail")).toContainText(
      "Submitted",
    );
    await capture(page, testInfo, "project-promoted-retention-claim-detail");
  });

  test("preserves IDs, baseline totals, and dormant rollout state", async () => {
    const admin = createE2EAdminClient();
    const { data: mappings, error: mappingError } = await admin
      .from("opportunity_final_projects")
      .select("opportunity_id,project_id,accepted_quote_id")
      .in("opportunity_id", [
        ids.historicalOpportunity,
        ids.promotedOpportunity,
      ]);
    expect(mappingError).toBeNull();
    expect(mappings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        opportunity_id: ids.historicalOpportunity,
        project_id: ids.historicalFinal,
        accepted_quote_id: ids.historicalQuote,
      }),
      expect.objectContaining({
        opportunity_id: ids.promotedOpportunity,
        project_id: ids.promotedWorkspace,
        accepted_quote_id: ids.promotedQuote,
      }),
    ]));

    const { data: quotes, error: quoteError } = await admin
      .from("project_quotes")
      .select("id,project_id,subtotal")
      .in("id", [ids.historicalQuote, ids.promotedQuote]);
    expect(quoteError).toBeNull();
    expect(quotes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: ids.historicalQuote,
        project_id: ids.historicalFinal,
        subtotal: 1200,
      }),
      expect.objectContaining({
        id: ids.promotedQuote,
        project_id: ids.promotedWorkspace,
        subtotal: 2300,
      }),
    ]));

    const { count: activePromotionControlCount, error: rolloutError } = await admin
      .from("opportunity_lifecycle_rollout_controls")
      .select("organization_id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("allowed_strategy", "promote_workspace_v1")
      .eq("promotion_enabled", true);
    expect(rolloutError).toBeNull();
    expect(activePromotionControlCount).toBe(0);

    const { data: permanentRows, error: permanentRowsError } = await admin
      .from("takeoff_measurements")
      .select("id,project_id,opportunity_id,page_id,calibration_id,quantity,count_value")
      .eq("id", ids.promotedMeasurement)
      .single();
    expect(permanentRowsError).toBeNull();
    expect(permanentRows).toMatchObject({
      id: ids.promotedMeasurement,
      project_id: ids.promotedWorkspace,
      opportunity_id: ids.promotedOpportunity,
      page_id: ids.promotedTakeoffPage,
      quantity: 3,
      count_value: 3,
    });
  });
});
