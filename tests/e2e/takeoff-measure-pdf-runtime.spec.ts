import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const runSuffix = Date.now().toString(36);
const ids = {
  client: crypto.randomUUID(),
  opportunity: crypto.randomUUID(),
  project: crypto.randomUUID(),
  drawingSet: crypto.randomUUID(),
  calibration: crypto.randomUUID(),
  pages: Array.from({ length: 77 }, () => crypto.randomUUID()),
};
const opportunitySlug = `measure-pdf-runtime-${runSuffix}`;
let organizationId = "";
let userId = "";
let storagePath = "";

async function expectCanvasReady(page: Page) {
  const canvas = page.getByTestId("takeoff-pdf-canvas");
  await expect(canvas).toHaveCount(1);
  await expect.poll(async () => canvas.evaluate((element) => ({
    height: (element as HTMLCanvasElement).height,
    opacity: getComputedStyle(element).opacity,
    width: (element as HTMLCanvasElement).width,
  }))).toMatchObject({
    height: expect.any(Number),
    opacity: "1",
    width: expect.any(Number),
  });
  const bitmap = await canvas.evaluate((element) => ({
    height: (element as HTMLCanvasElement).height,
    width: (element as HTMLCanvasElement).width,
  }));
  expect(bitmap.width).toBeGreaterThan(0);
  expect(bitmap.height).toBeGreaterThan(0);
  await expect(page.getByText("Unable to load drawing", { exact: true })).toHaveCount(0);
}

async function expectToolInitializes(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
}

async function dragSetupPanelBy(page: Page, delta: { x: number; y: number }) {
  const handle = page.getByRole("button", { name: "Move setup dialog", exact: true });
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Setup dialog drag handle bounds were unavailable.");
  const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 5 });
  await page.mouse.up();
}

async function expectSetupPanelInsideViewer(page: Page) {
  await expect.poll(async () => {
    const boundaryBox = await page.getByTestId("draggable-takeoff-panel-boundary").boundingBox();
    const panelBox = await page.getByTestId("draggable-takeoff-panel").boundingBox();
    if (!boundaryBox || !panelBox) return false;
    return (
      panelBox.x >= boundaryBox.x + 9
      && panelBox.y >= boundaryBox.y + 9
      && panelBox.x + panelBox.width <= boundaryBox.x + boundaryBox.width - 9
      && panelBox.y + panelBox.height <= boundaryBox.y + boundaryBox.height - 9
    );
  }).toBe(true);
}

test.describe("Takeoff Measure PDF.js browser runtime", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    const context = await ensureSupplierInvoiceE2EContext();
    const admin = createE2EAdminClient();
    organizationId = context.organizationId;
    userId = context.userId;
    storagePath = `${organizationId}/${ids.project}/measure-runtime-${runSuffix}.pdf`;

    const client = await admin.from("organization_clients").insert({
      id: ids.client,
      organization_id: organizationId,
      created_by: userId,
      name: `Measure Runtime Client ${runSuffix}`,
      company_name: `Measure Runtime Client ${runSuffix}`,
    });
    if (client.error) throw client.error;

    const opportunity = await admin.from("organization_opportunities").insert({
      id: ids.opportunity,
      organization_id: organizationId,
      created_by: userId,
      owner_user_id: userId,
      client_id: ids.client,
      name: `Measure Runtime ${runSuffix}`,
      slug: opportunitySlug,
      stage: "Quoted",
    });
    if (opportunity.error) throw opportunity.error;

    const project = await admin.from("organization_projects").insert({
      id: ids.project,
      organization_id: organizationId,
      created_by: userId,
      client_id: ids.client,
      name: `Measure Runtime Workspace ${runSuffix}`,
      slug: `measure-runtime-workspace-${runSuffix}`,
      stage: "Pricing",
      source_opportunity_id: ids.opportunity,
    });
    if (project.error) throw project.error;

    const workspace = await admin
      .from("organization_opportunities")
      .update({ workspace_project_id: ids.project })
      .eq("id", ids.opportunity);
    if (workspace.error) throw workspace.error;

    const fixturePdf = await PDFDocument.create();
    const font = await fixturePdf.embedFont(StandardFonts.Helvetica);
    for (let pageNumber = 1; pageNumber <= 77; pageNumber += 1) {
      const page = fixturePdf.addPage([612, 792]);
      page.drawText(`Measure browser fixture page ${pageNumber}`, {
        x: 72,
        y: 700,
        size: 18,
        font,
        color: rgb(0.1, 0.2, 0.3),
      });
    }
    const pdfBytes = await fixturePdf.save();
    const upload = await admin.storage
      .from("project-drawing-sets")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw upload.error;

    const drawingSet = await admin.from("project_drawing_sets").insert({
      id: ids.drawingSet,
      organization_id: organizationId,
      project_id: ids.project,
      uploaded_by: userId,
      file_name: `measure-runtime-${runSuffix}.pdf`,
      storage_path: storagePath,
      file_size_bytes: pdfBytes.byteLength,
      mime_type: "application/pdf",
    });
    if (drawingSet.error) throw drawingSet.error;

    const pages = await admin.from("takeoff_pages").insert(ids.pages.map((id, index) => ({
      id,
      organization_id: organizationId,
      project_id: ids.project,
      opportunity_id: ids.opportunity,
      drawing_set_id: ids.drawingSet,
      page_number: index + 1,
      page_width_pts: 612,
      page_height_pts: 792,
      created_by: userId,
    })));
    if (pages.error) throw pages.error;

    const calibration = await admin.from("takeoff_calibrations").insert({
      id: ids.calibration,
      organization_id: organizationId,
      project_id: ids.project,
      opportunity_id: ids.opportunity,
      page_id: ids.pages[1],
      created_by: userId,
      name: "Measure runtime scale",
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
  });

  test.afterAll(async () => {
    if (!organizationId) return;
    const admin = createE2EAdminClient();
    await admin.from("takeoff_measurements").delete().eq("drawing_set_id", ids.drawingSet);
    await admin.from("takeoff_calibrations").delete().eq("id", ids.calibration);
    await admin.from("takeoff_calibrations").delete().eq("page_id", ids.pages[1]);
    await admin.from("takeoff_pages").delete().eq("drawing_set_id", ids.drawingSet);
    await admin.from("project_drawing_sets").delete().eq("id", ids.drawingSet);
    if (storagePath) {
      await admin.storage.from("project-drawing-sets").remove([storagePath]);
    }
    await admin
      .from("organization_opportunities")
      .update({ workspace_project_id: null })
      .eq("id", ids.opportunity);
    await admin.from("organization_projects").delete().eq("id", ids.project);
    await admin.from("organization_opportunities").delete().eq("id", ids.opportunity);
    await admin.from("organization_clients").delete().eq("id", ids.client);
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
  });

  test("loads PDF.js through the Next client bundle and renders navigable pages", async ({ page }) => {
    const runtimeErrors: string[] = [];
    const workerResponses: number[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/pdf.worker.min.mjs") {
        workerResponses.push(response.status());
      }
    });

    await page.goto(
      `/app/leads-clients/opportunities/${opportunitySlug}/takeoff/measure?drawingSetId=${ids.drawingSet}&pageId=${ids.pages[0]}`,
    );
    await expectCanvasReady(page);
    await expect(page.getByTestId("measure-bottom-toolbar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Zoom out", exact: true })).toBeEnabled();
    await expectToolInitializes(page, "Calibrate");
    await expectToolInitializes(page, "Count");

    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pageId=${ids.pages[1]}`));
    await expectCanvasReady(page);
    await expectToolInitializes(page, "Distance");
    await expectToolInitializes(page, "Linear");
    await expectToolInitializes(page, "Area");
    await expectToolInitializes(page, "Count");

    await page.goto(
      `/app/leads-clients/opportunities/${opportunitySlug}/takeoff/measure?drawingSetId=${ids.drawingSet}&pageId=${ids.pages[76]}`,
    );
    await expectCanvasReady(page);
    await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();

    expect(workerResponses).toContain(200);
    expect(runtimeErrors.filter((message) => (
      message.includes("Object.defineProperty called on non-object")
      || message.includes("API version does not match the Worker version")
      || message.includes("Setting up fake worker failed")
    ))).toEqual([]);
  });

  test("uses the compact calibration dialog responsively and restores focus on Escape", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1024, height: 720 },
      { width: 768, height: 700 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(
        `/app/leads-clients/opportunities/${opportunitySlug}/takeoff/measure?drawingSetId=${ids.drawingSet}&pageId=${ids.pages[1]}`,
      );
      await expectCanvasReady(page);
      const calibrateButton = page.getByRole("button", { name: "Calibrate", exact: true });
      await calibrateButton.click();

      const manager = page.getByTestId("calibration-manager");
      await expect(manager).toBeVisible();
      await expect(manager.getByRole("heading", { name: "Active calibration" })).toBeVisible();
      await expect(manager.getByRole("heading", { name: "Calibration history" })).toBeVisible();
      await expect(manager.getByRole("button", { name: "Recalibrate", exact: true })).toBeVisible();
      const box = await manager.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(viewport.width - 32);
      expect(box!.height).toBeLessThanOrEqual(viewport.height * 0.9 + 1);

      await page.keyboard.press("Escape");
      await expect(manager).toBeHidden();
      await expect(calibrateButton).toBeFocused();
    }
  });

  test("moves the shared setup panel within the viewer without changing calibration or form behaviour", async ({ page }) => {
    const admin = createE2EAdminClient();
    const calibrationPageId = ids.pages[4];
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      `/app/leads-clients/opportunities/${opportunitySlug}/takeoff/measure?drawingSetId=${ids.drawingSet}&pageId=${calibrationPageId}`,
    );
    await expectCanvasReady(page);
    await page.getByRole("button", { name: "Calibrate", exact: true }).click();

    const panel = page.getByTestId("draggable-takeoff-panel");
    const defaultBox = await panel.boundingBox();
    if (!defaultBox) throw new Error("Default setup dialog bounds were unavailable.");
    await dragSetupPanelBy(page, { x: -130, y: -100 });
    const movedBox = await panel.boundingBox();
    if (!movedBox) throw new Error("Moved setup dialog bounds were unavailable.");
    expect(movedBox.x).toBeLessThan(defaultBox.x - 100);
    expect(movedBox.y).toBeLessThan(defaultBox.y - 70);
    await expectSetupPanelInsideViewer(page);
    await expect(page.locator('[data-testid^="measurement-summary-"]')).toHaveCount(0);

    const positionBeforeInput = await panel.boundingBox();
    await page.getByLabel(/Reference Length/).fill("4.89");
    await page.getByLabel(/Unit/).selectOption("m");
    expect(await panel.boundingBox()).toEqual(positionBeforeInput);

    for (const delta of [
      { x: -2_000, y: 0 },
      { x: 4_000, y: 0 },
      { x: 0, y: -2_000 },
      { x: 0, y: 4_000 },
    ]) {
      await dragSetupPanelBy(page, delta);
      await expectSetupPanelInsideViewer(page);
    }

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Calibrate", exact: true }).click();
    const reopenedBox = await panel.boundingBox();
    if (!reopenedBox) throw new Error("Reopened setup dialog bounds were unavailable.");
    expect(Math.abs(reopenedBox.x - defaultBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(reopenedBox.y - defaultBox.y)).toBeLessThanOrEqual(1);

    await dragSetupPanelBy(page, { x: 100, y: -80 });
    await page.getByLabel(/Reference Length/).fill("4.89");
    await page.getByLabel(/Unit/).selectOption("m");
    await page.getByRole("button", { name: "Measure", exact: true }).click();
    const canvas = page.getByTestId("takeoff-pdf-canvas");
    await canvas.click({ position: { x: 200, y: 260 } });
    await canvas.click({ position: { x: 340, y: 260 } });

    await expect.poll(async () => {
      const result = await admin
        .from("takeoff_calibrations")
        .select("reference_length_input,reference_length_base,display_unit")
        .eq("page_id", calibrationPageId)
        .eq("is_active", true)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    }).toMatchObject({
      reference_length_input: 4.89,
      reference_length_base: 4890,
      display_unit: "m",
    });

    for (const tool of ["Distance", "Linear", "Area", "Count"]) {
      await page.getByRole("button", { name: tool, exact: true }).click();
      const before = await panel.boundingBox();
      if (!before) throw new Error(`${tool} setup dialog bounds were unavailable.`);
      await dragSetupPanelBy(page, { x: -60, y: -40 });
      const after = await panel.boundingBox();
      if (!after) throw new Error(`${tool} moved setup dialog bounds were unavailable.`);
      expect(after.x).toBeLessThan(before.x - 40);
      expect(after.y).toBeLessThan(before.y - 20);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }

    const cleanup = await admin.from("takeoff_calibrations").delete().eq("page_id", calibrationPageId);
    if (cleanup.error) throw cleanup.error;
  });

  test("keeps setup-panel dragging responsive at supported viewer widths", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1024, height: 720 },
      { width: 768, height: 700 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(
        `/app/leads-clients/opportunities/${opportunitySlug}/takeoff/measure?drawingSetId=${ids.drawingSet}&pageId=${ids.pages[1]}`,
      );
      await expectCanvasReady(page);
      await page.getByRole("button", { name: "Count", exact: true }).click();
      await dragSetupPanelBy(page, { x: -40, y: -30 });
      await expectSetupPanelInsideViewer(page);
      if (viewport.width === 1280) {
        await dragSetupPanelBy(page, { x: 2_000, y: 0 });
        await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
        await expectSetupPanelInsideViewer(page);
        await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
        await expectSetupPanelInsideViewer(page);
        await page.setViewportSize({ width: 1024, height: 720 });
        await expectSetupPanelInsideViewer(page);
      }
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  });

  test("keeps an export-hidden persisted area visible and operational through delete rollback and success", async ({ page }) => {
    const admin = createE2EAdminClient();
    const measurementId = crypto.randomUUID();
    const areaShapeId = crypto.randomUUID();
    const normalizedPoints = [
      { x: 0.2, y: 0.2 },
      { x: 0.42, y: 0.2 },
      { x: 0.42, y: 0.38 },
      { x: 0.2, y: 0.38 },
    ];

    const measurement = await admin.from("takeoff_measurements").insert({
      id: measurementId,
      organization_id: organizationId,
      project_id: ids.project,
      opportunity_id: ids.opportunity,
      drawing_set_id: ids.drawingSet,
      page_id: ids.pages[1],
      calibration_id: ids.calibration,
      measurement_kind: "area",
      status: "active",
      source: "manual",
      name: "PB export visibility regression",
      color_hex: "#0F766E",
      quantity: 9.18,
      display_value: 9.18,
      display_unit: "m²",
      measured_area_base: 9_180_000,
      measured_perimeter_base: 12_000,
      page_bbox_min_x: 0.2,
      page_bbox_min_y: 0.2,
      page_bbox_max_x: 0.42,
      page_bbox_max_y: 0.38,
      metadata: { areaShapeRoles: { [areaShapeId]: "include" } },
      created_by: userId,
    });
    if (measurement.error) throw measurement.error;

    const parentPoints = await admin.from("takeoff_measurement_points").insert(
      normalizedPoints.map((point, pointOrder) => ({
        organization_id: organizationId,
        measurement_id: measurementId,
        point_order: pointOrder,
        ...point,
      })),
    );
    if (parentPoints.error) throw parentPoints.error;

    const areaShape = await admin.from("takeoff_measurement_area_shapes").insert({
      id: areaShapeId,
      organization_id: organizationId,
      measurement_id: measurementId,
      shape_order: 0,
      measured_area_base: 9_180_000,
      measured_perimeter_base: 12_000,
      page_bbox_min_x: 0.2,
      page_bbox_min_y: 0.2,
      page_bbox_max_x: 0.42,
      page_bbox_max_y: 0.38,
    });
    if (areaShape.error) throw areaShape.error;

    const shapePoints = await admin.from("takeoff_measurement_area_shape_points").insert(
      normalizedPoints.map((point, pointOrder) => ({
        organization_id: organizationId,
        area_shape_id: areaShapeId,
        point_order: pointOrder,
        ...point,
      })),
    );
    if (shapePoints.error) throw shapePoints.error;

    let heldDeleteOutcome: "failure" | "success" | null = null;
    let releaseHeldDelete: () => void = () => undefined;
    let heldDeleteGate = Promise.resolve();
    let reportHeldDeleteStarted: (() => void) | null = null;
    let heldDeleteStarted = Promise.resolve();

    function holdNextDelete(outcome: "failure" | "success") {
      heldDeleteOutcome = outcome;
      heldDeleteGate = new Promise<void>((resolve) => {
        releaseHeldDelete = resolve;
      });
      heldDeleteStarted = new Promise<void>((resolve) => {
        reportHeldDeleteStarted = resolve;
      });
    }

    await page.route("**/*", async (route) => {
      const request = route.request();
      const requestPath = new URL(request.url()).pathname;
      const postData = request.postData();
      if (
        heldDeleteOutcome &&
        request.method() === "POST" &&
        requestPath.includes(`/opportunities/${opportunitySlug}/takeoff/measure`) &&
        postData?.includes(measurementId)
      ) {
        const outcome = heldDeleteOutcome;
        reportHeldDeleteStarted?.();
        await heldDeleteGate;
        heldDeleteOutcome = null;
        reportHeldDeleteStarted = null;
        if (outcome === "failure") {
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });

    await page.goto(
      `/app/leads-clients/opportunities/${opportunitySlug}/takeoff/measure?drawingSetId=${ids.drawingSet}&pageId=${ids.pages[1]}`,
    );
    await expectCanvasReady(page);

    const summaryRow = page.getByTestId(`measurement-summary-${measurementId}`);
    const liveMeasurement = page.getByTestId(`takeoff-live-measurement-${measurementId}`);
    await expect(summaryRow).toBeVisible();
    await expect(liveMeasurement).toBeVisible();
    await expect(liveMeasurement.locator("polygon")).toHaveCount(1);

    await summaryRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Hide from PDF export", exact: true }).click();
    await expect(summaryRow).toBeVisible();
    await expect(liveMeasurement).toBeVisible();
    await expect(liveMeasurement.locator("polygon")).toBeVisible();

    holdNextDelete("failure");
    await summaryRow.click();
    await page.keyboard.press("Delete");
    await heldDeleteStarted;
    await expect(summaryRow).toHaveCount(0);
    await expect(liveMeasurement).toHaveCount(0);
    releaseHeldDelete();
    await expect(summaryRow).toBeVisible();
    await expect(liveMeasurement).toBeVisible();
    await expect(liveMeasurement.locator("polygon")).toBeVisible();

    holdNextDelete("success");
    await summaryRow.click();
    await page.keyboard.press("Delete");
    await heldDeleteStarted;
    await expect(summaryRow).toHaveCount(0);
    await expect(liveMeasurement).toHaveCount(0);
    releaseHeldDelete();
    await expect.poll(async () => {
      const result = await admin.from("takeoff_measurements").select("status").eq("id", measurementId).single();
      if (result.error) throw result.error;
      return result.data.status;
    }).toBe("deleted");

    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pageId=${ids.pages[2]}`));
    await page.getByRole("button", { name: "Previous page", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pageId=${ids.pages[1]}`));
    await expect(summaryRow).toHaveCount(0);
    await expect(liveMeasurement).toHaveCount(0);

    const cleanup = await admin.from("takeoff_measurements").delete().eq("id", measurementId);
    if (cleanup.error) throw cleanup.error;
  });

  test("keeps pending measurement deletes absent and manages versioned calibration history", async ({ page }) => {
    const admin = createE2EAdminClient();
    await page.goto(
      `/app/leads-clients/opportunities/${opportunitySlug}/takeoff/measure?drawingSetId=${ids.drawingSet}&pageId=${ids.pages[1]}`,
    );
    await expectCanvasReady(page);

    let delayNextCreate = false;
    let replaceNextMutationScope: { from: string; to: string } | null = null;
    await page.route("**/*", async (route) => {
      const request = route.request();
      const requestPath = new URL(request.url()).pathname;
      if (
        replaceNextMutationScope &&
        request.method() === "POST" &&
        requestPath.includes(`/opportunities/${opportunitySlug}/takeoff/measure`)
      ) {
        const replacement = replaceNextMutationScope;
        const postData = request.postData();
        if (postData?.includes(replacement.from)) {
          replaceNextMutationScope = null;
          if (delayNextCreate) {
            delayNextCreate = false;
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
          await route.continue({ postData: postData.replaceAll(replacement.from, replacement.to) });
          return;
        }
      }
      if (
        delayNextCreate &&
        request.method() === "POST" &&
        requestPath.includes(`/opportunities/${opportunitySlug}/takeoff/measure`)
      ) {
        delayNextCreate = false;
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pageId=${ids.pages[2]}`));
    await expectCanvasReady(page);

    await page.getByRole("button", { name: "Count", exact: true }).click();
    await page.getByRole("button", { name: "Measure", exact: true }).click();
    delayNextCreate = true;
    await page.getByTestId("takeoff-pdf-canvas").click({ position: { x: 360, y: 260 } });

    const pendingSuccessfulCount = page.locator('[data-testid^="measurement-summary-temp-"]').filter({ hasText: "Count" });
    await expect(pendingSuccessfulCount).toBeVisible();
    await expect(pendingSuccessfulCount).toContainText("Current page");

    await expect.poll(async () => {
      const result = await admin
        .from("takeoff_measurements")
        .select("id")
        .eq("page_id", ids.pages[2])
        .eq("status", "active")
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    }).not.toBeNull();
    const persistedCount = await admin
      .from("takeoff_measurements")
      .select("id")
      .eq("page_id", ids.pages[2])
      .eq("status", "active")
      .single();
    if (persistedCount.error) throw persistedCount.error;
    const persistedCountSummary = page.getByTestId(`measurement-summary-${persistedCount.data.id}`);
    await expect(persistedCountSummary).toBeVisible();
    await expect(pendingSuccessfulCount).toHaveCount(0);
    await expect(page.locator('[data-testid^="measurement-summary-"]').filter({ hasText: "Count" })).toHaveCount(1);

    await persistedCountSummary.click();
    await page.keyboard.press("Delete");
    await expect(persistedCountSummary).toHaveCount(0);
    await expect.poll(async () => {
      const result = await admin.from("takeoff_measurements").select("status").eq("id", persistedCount.data.id).single();
      if (result.error) throw result.error;
      return result.data.status;
    }).toBe("deleted");

    await page.getByRole("button", { name: "Count", exact: true }).click();
    await page.getByRole("button", { name: "Measure", exact: true }).click();
    delayNextCreate = true;
    replaceNextMutationScope = { from: ids.pages[2], to: crypto.randomUUID() };
    await page.getByTestId("takeoff-pdf-canvas").click({ position: { x: 410, y: 280 } });
    const pendingFailedCount = page.locator('[data-testid^="measurement-summary-temp-"]').filter({ hasText: "Count" });
    await expect(pendingFailedCount).toBeVisible();
    await expect(pendingFailedCount).toHaveCount(0);
    await expect(page.getByText("The selected takeoff page could not be found.").last()).toBeVisible();

    await page.getByRole("button", { name: "Previous page", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pageId=${ids.pages[1]}`));
    await expectCanvasReady(page);

    async function deletePendingMeasurement(params: {
      tool: "Distance" | "Area" | "Count";
      name: string;
      points: Array<{ x: number; y: number }>;
      finishWithEnter?: boolean;
    }) {
      await page.getByRole("button", { name: params.tool, exact: true }).click();
      await page.getByRole("button", { name: "Measure", exact: true }).click();
      delayNextCreate = true;
      const canvas = page.getByTestId("takeoff-pdf-canvas");
      for (const point of params.points) {
        await canvas.click({ position: point });
      }
      if (params.finishWithEnter) {
        await expect(page.getByText(/^Draft •/)).toBeVisible();
        await canvas.click({ position: params.points[0] });
      }

      const summaryItem = page.locator('[data-testid^="measurement-summary-temp-"]').filter({ hasText: params.name });
      await expect(summaryItem).toBeVisible();
      await summaryItem.click();
      await page.keyboard.press("Delete");
      await expect(summaryItem).toHaveCount(0);
      await page.waitForTimeout(1400);
      await expect(page.locator('[data-testid^="measurement-summary-"]').filter({ hasText: params.name })).toHaveCount(0);
    }

    await deletePendingMeasurement({
      tool: "Distance",
      name: "Distance",
      points: [{ x: 180, y: 190 }, { x: 300, y: 190 }],
    });
    await deletePendingMeasurement({
      tool: "Area",
      name: "Area",
      points: [{ x: 190, y: 230 }, { x: 310, y: 230 }, { x: 250, y: 330 }],
      finishWithEnter: true,
    });
    await deletePendingMeasurement({
      tool: "Count",
      name: "Count",
      points: [{ x: 350, y: 260 }],
    });

    await expect.poll(async () => {
      const result = await admin
        .from("takeoff_measurements")
        .select("status")
        .eq("page_id", ids.pages[1]);
      if (result.error) throw result.error;
      return result.data.map((row) => row.status);
    }).toEqual(["deleted", "deleted", "deleted"]);
    const historicMeasurementsBeforeRecalibration = await admin
      .from("takeoff_measurements")
      .select("id,calibration_id,display_value")
      .eq("page_id", ids.pages[1])
      .eq("status", "deleted")
      .order("id");
    if (historicMeasurementsBeforeRecalibration.error) throw historicMeasurementsBeforeRecalibration.error;

    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pageId=${ids.pages[2]}`));
    await page.getByRole("button", { name: "Previous page", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pageId=${ids.pages[1]}`));
    await expect(page.locator('[data-testid^="measurement-summary-"]')).toHaveCount(0);
    await page.reload();
    await expectCanvasReady(page);
    await expect(page.locator('[data-testid^="measurement-summary-"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Calibrate", exact: true }).click();
    await expect(page.getByTestId("calibration-manager")).toBeVisible();
    await page.getByRole("button", { name: "Recalibrate", exact: true }).click();
    await page.getByRole("button", { name: "Measure", exact: true }).click();
    const canvas = page.getByTestId("takeoff-pdf-canvas");
    await canvas.click({ position: { x: 190, y: 380 } });
    await canvas.click({ position: { x: 330, y: 380 } });

    await expect.poll(async () => {
      const result = await admin
        .from("takeoff_calibrations")
        .select("id,is_active")
        .eq("page_id", ids.pages[1]);
      if (result.error) throw result.error;
      return { count: result.data.length, active: result.data.filter((row) => row.is_active).length };
    }).toEqual({ count: 2, active: 1 });

    const replacementCalibration = await admin
      .from("takeoff_calibrations")
      .select("id")
      .eq("page_id", ids.pages[1])
      .eq("is_active", true)
      .single();
    if (replacementCalibration.error) throw replacementCalibration.error;

    await page.getByRole("button", { name: "Distance", exact: true }).click();
    await page.getByRole("button", { name: "Measure", exact: true }).click();
    await canvas.click({ position: { x: 360, y: 420 } });
    await canvas.click({ position: { x: 440, y: 420 } });
    await expect.poll(async () => {
      const result = await admin
        .from("takeoff_measurements")
        .select("calibration_id")
        .eq("page_id", ids.pages[1])
        .eq("status", "active")
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data?.calibration_id ?? null;
    }).toBe(replacementCalibration.data.id);

    const persistedDistance = await admin
      .from("takeoff_measurements")
      .select("id,version")
      .eq("page_id", ids.pages[1])
      .eq("status", "active")
      .single();
    if (persistedDistance.error) throw persistedDistance.error;
    const persistedDistanceSummary = page.getByTestId(`measurement-summary-${persistedDistance.data.id}`);

    replaceNextMutationScope = { from: ids.pages[1], to: ids.pages[2] };
    await persistedDistanceSummary.click();
    await page.keyboard.press("Delete");
    await expect(persistedDistanceSummary).toHaveCount(0);
    await expect(persistedDistanceSummary).toBeVisible();
    await expect(page.getByText("Unable to delete measurement. Please try again.").last()).toBeVisible();

    replaceNextMutationScope = { from: ids.drawingSet, to: crypto.randomUUID() };
    await persistedDistanceSummary.click();
    await page.keyboard.press("Delete");
    await expect(persistedDistanceSummary).toHaveCount(0);
    await expect(persistedDistanceSummary).toBeVisible();
    await expect.poll(async () => {
      const result = await admin
        .from("takeoff_measurements")
        .select("status,version")
        .eq("id", persistedDistance.data.id)
        .single();
      if (result.error) throw result.error;
      return result.data;
    }).toEqual({ status: "active", version: persistedDistance.data.version });

    const measurementsAfterRecalibration = await admin
      .from("takeoff_measurements")
      .select("id,calibration_id,display_value")
      .eq("page_id", ids.pages[1])
      .eq("status", "deleted")
      .order("id");
    if (measurementsAfterRecalibration.error) throw measurementsAfterRecalibration.error;
    expect(measurementsAfterRecalibration.data).toEqual(historicMeasurementsBeforeRecalibration.data);
    expect(new Set(measurementsAfterRecalibration.data.map((row) => row.calibration_id).filter(Boolean))).toEqual(new Set([ids.calibration]));

    await page.getByRole("button", { name: "Calibrate", exact: true }).click();
    const historicCard = page.getByTestId(`calibration-history-${ids.calibration}`);
    await expect(historicCard).toBeVisible();
    await historicCard.getByRole("button", { name: "Actions for Measure runtime scale" }).click();
    await page.getByRole("menuitem", { name: "Make active", exact: true }).click();
    await expect.poll(async () => {
      const result = await admin.from("takeoff_calibrations").select("is_active").eq("id", ids.calibration).single();
      if (result.error) throw result.error;
      return result.data.is_active;
    }).toBe(true);

    await historicCard.getByRole("button", { name: "Actions for Measure runtime scale" }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(page.getByTestId("calibration-manager").getByRole("alert")).toHaveText(
      "This calibration is used by 2 measurements and cannot be deleted.",
    );

    const unusedCalibrationId = crypto.randomUUID();
    const unusedCalibration = await admin.from("takeoff_calibrations").insert({
      id: unusedCalibrationId,
      organization_id: organizationId,
      project_id: ids.project,
      opportunity_id: ids.opportunity,
      page_id: ids.pages[1],
      created_by: userId,
      name: "Unused browser calibration",
      scale_ratio: 75,
      unit_system: "metric",
      base_unit: "mm",
      display_unit: "m",
      reference_length_input: 1,
      reference_length_base: 1000,
      point_a_x: 0.15,
      point_a_y: 0.15,
      point_b_x: 0.3,
      point_b_y: 0.15,
      is_active: false,
    });
    if (unusedCalibration.error) throw unusedCalibration.error;
    await page.locator('button[aria-label="Close"]').click();
    await page.getByRole("button", { name: "Calibrate", exact: true }).click();
    const unusedCard = page.getByTestId(`calibration-history-${unusedCalibrationId}`);
    await expect(unusedCard).toBeVisible();
    await unusedCard.getByRole("button", { name: "Actions for Unused browser calibration" }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete calibration", exact: true }).click();
    await expect.poll(async () => {
      const result = await admin.from("takeoff_calibrations").select("id").eq("id", unusedCalibrationId).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    }).toBeNull();
  });

  test("preserves metre calibration through transform changes, reload, and deletion", async ({ page }) => {
    const admin = createE2EAdminClient();
    await page.goto(
      `/app/leads-clients/opportunities/${opportunitySlug}/takeoff/measure?drawingSetId=${ids.drawingSet}&pageId=${ids.pages[2]}`,
    );
    await expectCanvasReady(page);

    await page.getByRole("button", { name: "Calibrate", exact: true }).click();
    await page.getByLabel(/Reference Length/).fill("4.89");
    await page.getByLabel(/Unit/).selectOption("m");
    await expect(page.getByRole("button", { name: "Measure", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Measure", exact: true }).click();
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const canvas = page.getByTestId("takeoff-pdf-canvas");
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error("Measure canvas bounds were unavailable.");
    await page.keyboard.down("Space");
    await page.mouse.move(canvasBox.x + 300, canvasBox.y + 250);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 340, canvasBox.y + 275, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    await canvas.click({ position: { x: 200, y: 260 } });
    await canvas.click({ position: { x: 340, y: 260 } });

    await expect.poll(async () => {
      const result = await admin
        .from("takeoff_calibrations")
        .select("id,reference_length_input,reference_length_base,display_unit,base_unit,unit_system")
        .eq("page_id", ids.pages[2])
        .eq("is_active", true)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    }).toMatchObject({
      reference_length_input: 4.89,
      reference_length_base: 4890,
      display_unit: "m",
      base_unit: "mm",
      unit_system: "metric",
    });
    const activeCalibration = await admin
      .from("takeoff_calibrations")
      .select("id")
      .eq("page_id", ids.pages[2])
      .eq("is_active", true)
      .single();
    if (activeCalibration.error) throw activeCalibration.error;
    const activeCalibrationId = activeCalibration.data.id;

    await page.reload();
    await expectCanvasReady(page);
    await expect(page.getByText("4.89 m", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Calibrate", exact: true }).click();
    const activeCard = page.getByTestId(`calibration-history-${activeCalibrationId}`);
    await expect(activeCard).toBeVisible();
    await activeCard.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete calibration", exact: true }).click();
    await expect.poll(async () => {
      const result = await admin
        .from("takeoff_calibrations")
        .select("id")
        .eq("page_id", ids.pages[2]);
      if (result.error) throw result.error;
      return result.data;
    }).toEqual([]);

    await page.locator('button[aria-label="Close"]').click();
    await page.getByRole("button", { name: "Calibrate", exact: true }).click();
    await expect(page.getByRole("button", { name: "Measure", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  });
});
