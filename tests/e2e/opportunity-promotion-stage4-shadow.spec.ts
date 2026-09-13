import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const runSuffix = Date.now().toString(36);
const creationRequestId = crypto.randomUUID();
const acceptedQuoteId = crypto.randomUUID();
const drawingSetId = crypto.randomUUID();
const takeoffPageId = crypto.randomUUID();
const calibrationId = crypto.randomUUID();
let opportunityId = "";
let opportunitySlug = "";
let workspaceProjectId = "";

test.describe("Stage 4 shadow promotion validation", () => {
  test.beforeAll(async () => {
    const context = await ensureSupplierInvoiceE2EContext();
    const admin = createE2EAdminClient();
    const lifecycleControl = await admin
      .from("opportunity_lifecycle_rollout_controls")
      .upsert({
        organization_id: context.organizationId,
        allowed_strategy: "legacy_two_project_v1",
        creation_enabled: true,
        promotion_enabled: false,
        updated_by: context.userId,
      });
    if (lifecycleControl.error) throw lifecycleControl.error;
    const shadowControl = await admin
      .from("opportunity_promotion_shadow_controls")
      .upsert({
        organization_id: context.organizationId,
        shadow_enabled: true,
        comparison_enabled: true,
        evaluator_version: "shadow-v2",
        updated_by: context.userId,
      });
    if (shadowControl.error) throw shadowControl.error;

    const authenticated = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signIn = await authenticated.auth.signInWithPassword({
      email: context.email,
      password: context.password,
    });
    if (signIn.error) throw signIn.error;
    const creation = await (authenticated.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>)(
      "create_opportunity_workspace_v1",
      {
        p_organization_id: context.organizationId,
        p_creation_request_id: creationRequestId,
        p_strategy: "legacy_two_project_v1",
        p_name: `Stage 4 Shadow ${runSuffix}`,
        p_new_client: {
          name: "Stage 4 Contact",
          company_name: `Stage 4 Client ${runSuffix}`,
        },
        p_owner_user_id: context.userId,
        p_location: "Auckland",
        p_estimated_value: 115,
        p_notes: "",
      },
    );
    if (creation.error) throw creation.error;
    const row = creation.data?.[0];
    if (!row) throw new Error("Stage 4 Opportunity creation returned no row.");
    opportunityId = String(row.opportunity_id);
    opportunitySlug = String(row.opportunity_slug);
    workspaceProjectId = String(row.workspace_project_id);

    const quote = await admin.from("project_quotes").insert({
      id: acceptedQuoteId,
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      created_by: context.userId,
      originating_opportunity_id: opportunityId,
      source_opportunity_id: opportunityId,
      quote_title: "Stage 4 accepted baseline",
      quote_number: `S4-${runSuffix}`,
      status: "Accepted",
      subtotal: 100,
      gst_percent: 15,
      gst_amount: 15,
      total_quote_price: 115,
      quote_date: "2026-08-01",
    });
    if (quote.error) throw quote.error;
    const line = await admin.from("project_quote_line_items").insert({
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      quote_id: acceptedQuoteId,
      section: "Labour",
      description: "Stage 4 fixture",
      quantity: 1,
      unit: "item",
      rate: 100,
      total: 100,
      sort_order: 0,
    });
    if (line.error) throw line.error;

    const drawingStoragePath = `${context.organizationId}/${workspaceProjectId}/stage4-${runSuffix}.pdf`;
    const upload = await admin.storage.from("project-drawing-sets").upload(
      drawingStoragePath,
      Buffer.from("%PDF-1.7\nStage 4 shadow fixture\n"),
      { contentType: "application/pdf", upsert: false },
    );
    if (upload.error) throw upload.error;
    const drawing = await admin.from("project_drawing_sets").insert({
      id: drawingSetId,
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      uploaded_by: context.userId,
      file_name: `stage4-${runSuffix}.pdf`,
      storage_path: drawingStoragePath,
      file_size_bytes: 34,
      mime_type: "application/pdf",
    });
    if (drawing.error) throw drawing.error;
    const tradePack = await admin.from("trade_packs").insert({
      id: drawingSetId,
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      trade_id: "carpentry",
      trade_label: "Carpentry",
      pdf_url: drawingStoragePath,
      page_index_json: [],
      created_by: context.userId,
    });
    if (tradePack.error) throw tradePack.error;
    const scope = await admin.from("scope_runs").insert({
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      trade_pack_id: drawingSetId,
      created_by: context.userId,
      status: "complete",
      result_json: {},
    });
    if (scope.error) throw scope.error;
    const page = await admin.from("takeoff_pages").insert({
      id: takeoffPageId,
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      opportunity_id: opportunityId,
      drawing_set_id: drawingSetId,
      page_number: 1,
      page_width_pts: 595,
      page_height_pts: 842,
      created_by: context.userId,
    });
    if (page.error) throw page.error;
    const calibration = await admin.from("takeoff_calibrations").insert({
      id: calibrationId,
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      opportunity_id: opportunityId,
      page_id: takeoffPageId,
      created_by: context.userId,
      name: "Stage 4 scale",
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
    });
    if (calibration.error) throw calibration.error;
    const measurement = await admin.from("takeoff_measurements").insert({
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      opportunity_id: opportunityId,
      drawing_set_id: drawingSetId,
      page_id: takeoffPageId,
      measurement_kind: "count",
      count_value: 1,
      created_by: context.userId,
    });
    if (measurement.error) throw measurement.error;
    const task = await admin.from("project_job_todos").insert({
      organization_id: context.organizationId,
      project_id: workspaceProjectId,
      opportunity_id: opportunityId,
      created_by: context.userId,
      title: "Stage 4 continuity task",
    });
    if (task.error) throw task.error;
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
  });

  test("observes the unchanged legacy award without invoking promotion", async ({ page }) => {
    const admin = createE2EAdminClient();
    await page.goto(`/app/leads-clients/opportunities/${opportunitySlug}/files`);
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

    const result = await page.evaluate(async ({ slug, quoteId, correlation }) => {
      const response = await fetch(`/api/leads-clients/opportunities/${slug}/convert`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": correlation,
        },
        body: JSON.stringify({ acceptedQuoteId: quoteId }),
      });
      return {
        status: response.status,
        body: await response.json() as Record<string, unknown>,
      };
    }, { slug: opportunitySlug, quoteId: acceptedQuoteId, correlation: `stage4-local-${runSuffix}` });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ projectCreated: true, fileMigrationStatus: "complete" });
    const finalProjectId = String(result.body.projectId);
    const finalProjectSlug = String(result.body.projectSlug);
    expect(finalProjectId).not.toBe(workspaceProjectId);

    await page.goto(`/app/projects/${finalProjectSlug}`);
    await expect(page.getByRole("heading", { name: "Project Details" })).toBeVisible();

    const { data: shadow } = await admin
      .from("opportunity_promotion_shadow_runs")
      .select("status,eligibility_result,comparison_result,mismatch_codes,expected_difference_codes,workspace_project_id,final_project_id,evaluator_version")
      .eq("opportunity_id", opportunityId)
      .single();
    expect(shadow).toMatchObject({
      status: "completed",
      eligibility_result: "eligible",
      comparison_result: "expected_difference",
      workspace_project_id: workspaceProjectId,
      final_project_id: finalProjectId,
      evaluator_version: "shadow-v2",
    });
    expect(shadow?.mismatch_codes).toEqual([]);
    expect(shadow?.expected_difference_codes).toEqual(expect.arrayContaining([
      "legacy_final_does_not_own_workspace_tasks",
      "legacy_final_does_not_own_takeoff_pages",
      "legacy_final_does_not_own_takeoff_measurements",
      "promoted_workspace_task_continuity_verified",
      "promoted_workspace_takeoff_continuity_verified",
      "promoted_workspace_measurement_continuity_verified",
    ]));

    const { count: promotionEventCount } = await admin
      .from("opportunity_promotion_events")
      .select("id", { count: "exact", head: true })
      .eq("opportunity_id", opportunityId);
    expect(promotionEventCount).toBe(0);
  });
});
