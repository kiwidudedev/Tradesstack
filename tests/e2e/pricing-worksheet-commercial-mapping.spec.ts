import { expect, test, type Page } from "@playwright/test";
import { createE2EAdminClient, ensureSupplierInvoiceE2EContext, ensureSupplierInvoiceLoggedIn } from "./supplier-invoice-e2e-helpers";
import { createDefaultWorksheetData, type WorksheetCell } from "../../lib/opportunity-pricing-worksheet-defaults";

async function seedReportedWorksheet(options: { converted?: boolean } = {}) {
  const converted = options.converted ?? false;
  const { organizationId, userId } = await ensureSupplierInvoiceE2EContext();
  const admin = createE2EAdminClient();
  const suffix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const opportunityId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const workspaceProjectId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const workbookId = crypto.randomUUID();
  const sheetId = crypto.randomUUID();
  const slug = `commercial-mapping-e2e-${suffix}`;
  const fixture: Record<string, string | number> = {
    A5: "92mm 0.75BMT Stud", B5: 100, D5: 3.6, E5: 0.6, G5: "Fixings", H5: "L/m",
    F5: 500, I5: 4.88, J5: 3220.8, K5: 6.82, L5: "Fixings", M5: 7720.8, C5: 0,
  };
  const fixtureCells = Object.fromEntries(Object.entries(fixture).map(([key, value]) => [key, {
    type: typeof value === "number" ? "number" : "text",
    value,
    formula: null,
    computedValue: value,
    displayValue: String(value),
    metadata: {},
  } satisfies WorksheetCell])) as Record<string, WorksheetCell>;
  const seededSheetData = createDefaultWorksheetData({ sheetName: "Commercial Mapping E2E", rowCount: 20, columnCount: 13 });
  seededSheetData.cells = { ...seededSheetData.cells, ...fixtureCells };

  const client = await admin.from("organization_clients").insert({
    id: clientId,
    organization_id: organizationId,
    created_by: userId,
    name: `Commercial Mapping Client ${suffix}`,
    company_name: `Commercial Mapping Client ${suffix}`,
  });
  if (client.error) throw client.error;
  const opportunity = await admin.from("organization_opportunities").insert({
    id: opportunityId, organization_id: organizationId, created_by: userId, owner_user_id: userId,
    client_id: clientId,
    name: `Commercial Mapping E2E ${suffix}`, opportunity_code: `CME-${suffix}`, slug,
    location: "Auckland", stage: converted ? "Won" : "Pricing", estimated_value: 10000,
  });
  if (opportunity.error) throw opportunity.error;
  const primaryTenderClient = await admin.from("opportunity_tender_clients").insert({
    organization_id: organizationId,
    opportunity_id: opportunityId,
    client_id: clientId,
    created_by: userId,
    is_primary: true,
  });
  if (primaryTenderClient.error) throw primaryTenderClient.error;
  const workspaceProject = await admin.from("organization_projects").insert({
    id: workspaceProjectId, organization_id: organizationId, created_by: userId,
    name: `Commercial Mapping Tender ${suffix}`, project_code: `CME-T-${suffix}`,
    slug: `${slug}-tender`, location: "Auckland", stage: "Pricing", source_opportunity_id: opportunityId,
  });
  if (workspaceProject.error) throw workspaceProject.error;
  const project = await admin.from("organization_projects").insert({
    id: projectId, organization_id: organizationId, created_by: userId,
    name: `Commercial Mapping E2E ${suffix}`, project_code: `CME-${suffix}`,
    slug: `${slug}-project`, location: "Auckland", stage: "Construction", source_opportunity_id: opportunityId,
  });
  if (project.error) throw project.error;
  const convertOpportunity = await admin.from("organization_opportunities")
    .update({
      workspace_project_id: workspaceProjectId,
      converted_project_id: converted ? projectId : null,
      converted_at: converted ? new Date().toISOString() : null,
    })
    .eq("organization_id", organizationId).eq("id", opportunityId);
  if (convertOpportunity.error) throw convertOpportunity.error;
  if (converted) {
    const finalProject = await admin.from("opportunity_final_projects").insert({
      organization_id: organizationId, opportunity_id: opportunityId, project_id: projectId, created_by: userId,
    });
    if (finalProject.error) throw finalProject.error;
  }
  const workbook = await admin.from("opportunity_pricing_worksheets").insert({
    id: workbookId, organization_id: organizationId, opportunity_id: opportunityId, project_id: null,
    created_by: userId, updated_by: userId, name: "Commercial Mapping E2E", worksheet_data: seededSheetData,
  });
  if (workbook.error) throw workbook.error;
  const sheet = await admin.from("opportunity_pricing_workbook_sheets").insert({
    id: sheetId, organization_id: organizationId, opportunity_id: opportunityId, workbook_id: workbookId,
    created_by: userId, updated_by: userId, name: "Commercial Mapping E2E", is_default: true,
    worksheet_data: seededSheetData,
  });
  if (sheet.error) throw sheet.error;
  const activateSheet = await admin.from("opportunity_pricing_worksheets").update({ last_active_sheet_id: sheetId })
    .eq("organization_id", organizationId).eq("id", workbookId);
  if (activateSheet.error) throw activateSheet.error;
  return {
    url: `/app/leads-clients/opportunities/${slug}/pricing-worksheet/${workbookId}?sheetId=${sheetId}`,
    admin,
    organizationId,
    opportunityId,
    projectId,
    projectSlug: `${slug}-project`,
    workbookId,
    sheetId,
    supplierId: (await ensureSupplierInvoiceE2EContext()).supplierId,
    restore: async () => {
      const commercialItems = await admin.from("commercial_items").select("id")
        .eq("organization_id", organizationId).eq("source_workbook_id", workbookId);
      const commercialItemIds = (commercialItems.data ?? []).map((item) => item.id);
      if (commercialItemIds.length > 0) {
        await admin.from("commercial_item_document_links").delete().eq("organization_id", organizationId).in("commercial_item_id", commercialItemIds);
      }
      await admin.from("project_quote_line_items").delete().eq("organization_id", organizationId).eq("project_id", projectId);
      await admin.from("project_quotes").delete().eq("organization_id", organizationId).eq("originating_opportunity_id", opportunityId);
      await admin.from("project_purchase_order_line_items").delete().eq("organization_id", organizationId).eq("project_id", projectId);
      await admin.from("project_purchase_orders").delete().eq("organization_id", organizationId).eq("project_id", projectId);
      await admin.from("project_variations").delete().eq("organization_id", organizationId).eq("project_id", projectId);
      if (commercialItemIds.length > 0) {
        await admin.from("commercial_items").delete().eq("organization_id", organizationId).in("id", commercialItemIds);
      }
      await admin.from("opportunity_pricing_worksheets").delete().eq("organization_id", organizationId).eq("id", workbookId);
      await admin.from("opportunity_final_projects").delete().eq("organization_id", organizationId).eq("opportunity_id", opportunityId);
      await admin.from("organization_opportunities").update({ workspace_project_id: null, converted_project_id: null, converted_at: null })
        .eq("organization_id", organizationId).eq("id", opportunityId);
      await admin.from("organization_projects").delete().eq("organization_id", organizationId).eq("id", projectId);
      await admin.from("organization_projects").delete().eq("organization_id", organizationId).eq("id", workspaceProjectId);
      await admin.from("organization_opportunities").delete().eq("organization_id", organizationId).eq("id", opportunityId);
      await admin.from("organization_clients").delete().eq("organization_id", organizationId).eq("id", clientId);
    },
  };
}

async function seedVariationWorksheet() {
  const fixture = await seedReportedWorksheet({ converted: true });
  const variationId = crypto.randomUUID();
  const variation = await fixture.admin.from("project_variations").insert({
    id: variationId,
    organization_id: fixture.organizationId,
    project_id: fixture.projectId,
    created_by: (await ensureSupplierInvoiceE2EContext()).userId,
    variation_title: "Commercial mapping Variation",
    variation_number: "V1",
    status: "Draft",
    origin: "Client Request",
  });
  if (variation.error) throw variation.error;
  const ownWorkbook = await fixture.admin.from("opportunity_pricing_worksheets").update({
    project_id: fixture.projectId,
    variation_id: variationId,
  })
    .eq("organization_id", fixture.organizationId).eq("id", fixture.workbookId);
  if (ownWorkbook.error) throw ownWorkbook.error;
  return {
    ...fixture,
    variationId,
    url: `/app/projects/${fixture.projectSlug}/preconstruction/variations/${variationId}/pricing-worksheet/${fixture.workbookId}?sheetId=${fixture.sheetId}`,
  };
}

async function openQuoteMapping(page: Page) {
  await expect(page.getByRole("button", { name: "Edit worksheet name" })).toHaveText("Commercial Mapping E2E");
  await page.locator('[data-worksheet-cell="A5"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to Quote..." }).click();
  await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toBeVisible();
  const appendExisting = page.getByRole("radio", { name: "Append existing draft" });
  if (await appendExisting.isDisabled()) {
    await page.getByRole("radio", { name: "Create new draft Quote" }).click();
  }
}

async function openPurchaseOrderMapping(page: Page) {
  await expect(page.getByRole("button", { name: "Edit worksheet name" })).toHaveText("Commercial Mapping E2E");
  await page.locator('[data-worksheet-cell="A5"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to Purchase Order..." }).click();
  await expect(page.getByRole("complementary", { name: "Purchase Order commercial mapping" })).toBeVisible();
}

async function mapField(page: Page, field: "description" | "quantity" | "unit" | "rate" | "total", cellKey: string) {
  const mappingField = page.getByTestId(`commercial-mapping-field-${field}`);
  await mappingField.locator('button[aria-pressed]').click();
  await page.locator(`[data-worksheet-cell="${cellKey}"]`).click();
  await expect(page.getByTestId(`commercial-mapping-field-${field}`)).toContainText(cellKey);
}

async function mapVariationField(page: Page, lineIndex: number, field: "description" | "quantity" | "unit" | "rate" | "total", cellKey: string) {
  const drawer = page.getByRole("complementary", { name: "Variation commercial mapping" });
  const line = drawer.locator('section[data-testid^="variation-mapping-line-"]').nth(lineIndex);
  const mappingField = line.locator(`[data-testid$="-field-${field}"]`);
  await mappingField.locator('button[aria-pressed]').click();
  await page.locator(`[data-worksheet-cell="${cellKey}"]`).click();
  await expect(mappingField).toContainText(cellKey);
}

async function enterManualDescription(page: Page, value: string, commit: "Enter" | "blur" = "Enter") {
  await page.getByRole("button", { name: "Edit description" }).click();
  const input = page.getByTestId("commercial-mapping-description-input");
  await expect(input).toBeFocused();
  await input.fill(value);
  if (commit === "Enter") await input.press("Enter");
  else await page.getByTestId("commercial-mapping-preview").click();
  await expect(input).toHaveCount(0);
  if (value.trim()) {
    await expect(page.getByTestId("commercial-mapping-field-description")).toContainText(value.trim());
    await expect(page.getByTestId("commercial-mapping-field-description")).toContainText("Manual entry");
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  await ensureSupplierInvoiceLoggedIn(page, baseURL!);
});

test("Variation Commercial Mapping Mode publishes multiple exact-cell lines with independent sections and totals", async ({ page }) => {
  const fixture = await seedVariationWorksheet();
  try {
    await page.goto(fixture.url);
    await expect(page.getByRole("button", { name: "Edit worksheet name" })).toHaveText("Commercial Mapping E2E");
    await page.locator('[data-worksheet-cell="A5"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add to Variation..." }).click();
    const drawer = page.getByRole("complementary", { name: "Variation commercial mapping" });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Add to Variation" })).toHaveCount(0);
    await expect(page.getByText("Variation Mapping Mode.", { exact: false })).toHaveCount(0);
    await expect(drawer).toContainText("V1");

    await mapVariationField(page, 0, "description", "A5");
    await mapVariationField(page, 0, "quantity", "B5");
    await mapVariationField(page, 0, "unit", "H5");
    await mapVariationField(page, 0, "rate", "I5");
    await mapVariationField(page, 0, "total", "M5");
    await drawer.getByLabel("Variation section for commercial line 1").selectOption("Materials");
    await expect(drawer.locator('[data-testid$="-preview"]').nth(0)).toContainText("NZ$7,720.80");

    await drawer.getByRole("button", { name: "Add Another" }).click();
    await mapVariationField(page, 1, "description", "L5");
    await mapVariationField(page, 1, "total", "K5");
    await drawer.getByLabel("Variation section for commercial line 2").selectOption("Labour");
    await drawer.getByTestId("variation-commercial-mapping-publish").click();
    await expect(drawer).toHaveCount(0);

    const lines = await fixture.admin.from("project_variation_line_items")
      .select("id,description,quantity,unit,rate,total,section,sort_order")
      .eq("organization_id", fixture.organizationId).eq("variation_id", fixture.variationId)
      .order("sort_order", { ascending: true });
    expect(lines.error).toBeNull();
    expect(lines.data).toHaveLength(2);
    expect(lines.data?.[0]).toMatchObject({ description: "92mm 0.75BMT Stud", quantity: 100, unit: "L/m", rate: 4.88, total: 7720.8, section: "Materials" });
    expect(lines.data?.[1]).toMatchObject({ description: "Fixings", quantity: null, unit: null, rate: null, total: 6.82, section: "Labour" });

    const items = await fixture.admin.from("commercial_items")
      .select("id,description,total,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId)
      .order("created_at", { ascending: true });
    expect(items.data).toHaveLength(2);
    expect((items.data?.[0]?.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ description: ["A5"], quantity: ["B5"], unit: ["H5"], rate: ["I5"], total: ["M5"] });
    expect((items.data?.[1]?.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ description: ["L5"], total: ["K5"] });
    const links = await fixture.admin.from("commercial_item_document_links").select("document_line_id,commercial_item_id")
      .eq("organization_id", fixture.organizationId).eq("document_kind", "variation_line").eq("document_id", fixture.variationId);
    expect(links.data).toHaveLength(2);
    expect(new Set(links.data?.map((link) => link.document_line_id))).toEqual(new Set(lines.data?.map((line) => line.id)));

    const worksheetDialog = page.getByRole("dialog", { name: "Pricing worksheet editor" });
    await worksheetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/app/projects/${fixture.projectSlug}/preconstruction/variations/${fixture.variationId}/?$`));
    await expect(page.getByRole("heading", { name: "Variation Details", exact: true })).toBeVisible();
    await expect(worksheetDialog).toHaveCount(0);
  } finally {
    await fixture.restore();
  }
});

test("Variation worksheet Close stays covered until the detail route commits", async ({ page }) => {
  const fixture = await seedVariationWorksheet();
  const detailPath = `/app/projects/${fixture.projectSlug}/preconstruction/variations/${fixture.variationId}`;
  let releaseDetailRequest: () => void = () => {};
  const detailRequestReleased = new Promise<void>((resolve) => {
    releaseDetailRequest = resolve;
  });
  let markDetailRequestObserved: () => void = () => {};
  const detailRequestObserved = new Promise<void>((resolve) => {
    markDetailRequestObserved = resolve;
  });
  let hasBlockedDetailRequest = false;

  try {
    await page.goto(detailPath);
    await expect(page.getByRole("heading", { name: "Variation Details", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Variation record navigation" })
      .getByRole("link", { name: "Pricing Worksheet", exact: true })
      .click();

    const worksheetDialog = page.getByRole("dialog", { name: "Pricing worksheet editor" });
    await expect(worksheetDialog).toBeVisible();

    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (
        !hasBlockedDetailRequest
        && requestUrl.pathname === detailPath
        && requestUrl.searchParams.has("_rsc")
      ) {
        hasBlockedDetailRequest = true;
        markDetailRequestObserved();
        await detailRequestReleased;
      }
      await route.continue();
    });

    await worksheetDialog.getByRole("button", { name: "Close", exact: true })
      .click({ noWaitAfter: true });
    await detailRequestObserved;
    await page.waitForTimeout(250);

    await expect(worksheetDialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Pricing Worksheet", exact: true })).toHaveCount(0);
    await expect(page.getByText("Loading variations...", { exact: true })).toHaveCount(0);

    releaseDetailRequest();
    await expect(page).toHaveURL(new RegExp(`${detailPath}/?$`));
    await expect(page.getByRole("heading", { name: "Variation Details", exact: true })).toBeVisible();
    await expect(worksheetDialog).toHaveCount(0);
  } finally {
    releaseDetailRequest();
    await fixture.restore();
  }
});

test("Variation worksheet dirty save failure stays open and a successful retry closes", async ({ page }) => {
  const fixture = await seedVariationWorksheet();
  const detailPath = `/app/projects/${fixture.projectSlug}/preconstruction/variations/${fixture.variationId}`;
  let markFailedSaveObserved: () => void = () => {};
  const failedSaveObserved = new Promise<void>((resolve) => {
    markFailedSaveObserved = resolve;
  });

  try {
    await page.goto(fixture.url);
    const worksheetDialog = page.getByRole("dialog", { name: "Pricing worksheet editor" });
    await expect(worksheetDialog).toBeVisible();

    const editedCell = page.locator('[data-worksheet-cell="A5"]');
    await editedCell.dblclick();
    await editedCell.locator("input").fill("Dirty close retry");
    await editedCell.locator("input").press("Enter");
    await expect(editedCell).toContainText("Dirty close retry");

    const saveRpcPattern = "**/rest/v1/rpc/save_pricing_workbook_active_sheet";
    await page.route(saveRpcPattern, async (route) => {
      markFailedSaveObserved();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Forced worksheet save failure" }),
      });
    });

    await worksheetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await failedSaveObserved;
    await expect(worksheetDialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${detailPath}/pricing-worksheet/${fixture.workbookId}`));
    await expect(page.getByText("Forced worksheet save failure", { exact: false })).toBeVisible();

    await page.unroute(saveRpcPattern);
    await worksheetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${detailPath}/?$`));
    await expect(page.getByRole("heading", { name: "Variation Details", exact: true })).toBeVisible();
    await expect(worksheetDialog).toHaveCount(0);
  } finally {
    await fixture.restore();
  }
});

test("Variation worksheet direct reload, new tab, and browser history stay coherent on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await seedVariationWorksheet();
  const detailPath = `/app/projects/${fixture.projectSlug}/preconstruction/variations/${fixture.variationId}`;
  const worksheetDialog = page.getByRole("dialog", { name: "Pricing worksheet editor" });

  try {
    await page.goto(fixture.url);
    await expect(worksheetDialog).toBeVisible();
    await page.reload();
    await expect(worksheetDialog).toBeVisible();

    await worksheetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${detailPath}/?$`));
    await expect(page.getByRole("heading", { name: "Variation Details", exact: true })).toBeVisible();
    await expect(worksheetDialog).toHaveCount(0);
    await expect(page.getByText("Loading variations...", { exact: true })).toHaveCount(0);

    await page.getByRole("navigation", { name: "Variation record navigation" })
      .getByRole("link", { name: "Pricing Worksheet", exact: true })
      .click();
    await expect(worksheetDialog).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${detailPath}/?$`));
    await expect(worksheetDialog).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${detailPath}/pricing-worksheet/${fixture.workbookId}`));
    await expect(worksheetDialog).toBeVisible();

    const newTab = await page.context().newPage();
    await newTab.goto(fixture.url);
    const newTabWorksheetDialog = newTab.getByRole("dialog", { name: "Pricing worksheet editor" });
    await expect(newTabWorksheetDialog).toBeVisible();
    await newTabWorksheetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(newTab).toHaveURL(new RegExp(`${detailPath}/?$`));
    await expect(newTab.getByRole("heading", { name: "Variation Details", exact: true })).toBeVisible();
    await expect(newTabWorksheetDialog).toHaveCount(0);
    await newTab.close();
  } finally {
    await fixture.restore();
  }
});

test("desktop Quote Commercial Mapping Mode maps explicit cells and restores editing after cancel", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await mapField(page, "description", "A5");
    await mapField(page, "quantity", "B5");
    await mapField(page, "unit", "H5");
    await mapField(page, "rate", "I5");
    await mapField(page, "total", "M5");

    await expect(page.getByTestId("commercial-mapping-description-row")).toBeVisible();
    await expect(page.getByTestId("commercial-mapping-quantity-unit-row")).toBeVisible();
    await expect(page.getByTestId("commercial-mapping-rate-total-row")).toBeVisible();
    await expect(page.getByLabel("Source cell A5")).toBeVisible();
    const preview = page.getByTestId("commercial-mapping-preview");
    await expect(preview).toContainText("92mm 0.75BMT Stud");
    await expect(preview).toContainText("100 L/m × $4.88");
    await expect(page.getByTestId("commercial-mapping-field-total")).toContainText("NZ$7,720.80");
    await expect(preview).toContainText("Persisted totalNZ$488.00");
    await expect(page.getByText(/Mapped Total \(7720.8\) differs from Quantity × Rate/)).toBeVisible();
    await expect(preview).not.toContainText("3.6");
    await expect(preview).not.toContainText("0.6");

    await page.getByTestId("commercial-mapping-field-rate").hover();
    await expect(page.locator('[data-worksheet-cell="I5"] [data-commercial-mapping-highlight="true"]')).toBeVisible();
    await page.locator('[data-worksheet-cell="I5"]').dblclick();
    await expect(page.locator('[data-worksheet-cell="I5"] input')).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);
    await page.locator('[data-worksheet-cell="I5"]').dblclick();
    await expect(page.locator('[data-worksheet-cell="I5"] input')).toBeVisible();
  } finally {
    await fixture.restore();
  }
});

test("narrow Commercial Mapping Mode uses the sequential worksheet picker and preserves mappings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await enterManualDescription(page, "Narrow manual description");
    await expect(page.getByText("Back to mappings")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add to Quote", exact: true })).toBeVisible();
    const descriptionField = page.getByTestId("commercial-mapping-field-description");
    await descriptionField.locator('button[aria-pressed]').click();
    await expect(page.getByText("Back to mappings")).toBeVisible();
    await page.locator('[data-worksheet-cell="A5"]').click();
    await expect(page.getByTestId("commercial-mapping-field-description")).toContainText("A5");
    await page.getByTestId("commercial-mapping-field-quantity").locator('button[aria-pressed]').click();
    await page.locator('[data-worksheet-cell="B5"]').click();
    await expect(page.getByTestId("commercial-mapping-field-quantity")).toContainText("B5");
    await page.getByTestId("commercial-mapping-field-unit").locator('button[aria-pressed]').press("Escape");
    await expect(page.getByTestId("commercial-mapping-field-unit").locator('button[aria-pressed]')).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("commercial-mapping-field-unit").locator('button[aria-pressed]').press("Escape");
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);
  } finally {
    await fixture.restore();
  }
});

test("Description editor preserves the Escape hierarchy and switches atomically between manual and worksheet sources", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);

    const rateButton = page.getByTestId("commercial-mapping-field-rate").locator('button[aria-pressed]');
    await rateButton.click();
    await expect(rateButton).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Edit description" }).click();
    await expect(rateButton).toHaveAttribute("aria-pressed", "false");
    const input = page.getByTestId("commercial-mapping-description-input");
    await expect(input).toBeFocused();
    await input.fill("Uncommitted draft");
    await input.evaluate((element) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("application/x-tradesstack-worksheet-cell", "A5");
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    });
    await expect(input).toHaveValue("Uncommitted draft");
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toBeVisible();
    await expect(page.getByTestId("commercial-mapping-field-description")).toContainText("Select worksheet cell");

    await mapField(page, "description", "A5");
    await page.getByRole("button", { name: "Edit description" }).click();
    await page.getByTestId("commercial-mapping-description-input").fill("  92mm 0.75BMT Stud  ");
    await page.getByTestId("commercial-mapping-description-input").press("Enter");
    await expect(page.getByLabel("Source cell A5")).toBeVisible();

    await enterManualDescription(page, "Plasterboard Linings", "blur");
    await expect(page.getByLabel("Source cell A5")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Clear Description mapping" })).toHaveCount(0);
    await page.getByTestId("commercial-mapping-field-description").hover();
    await expect(page.locator('[data-commercial-mapping-highlight="true"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Drag worksheet cell A5 to a commercial mapping field" }).dragTo(page.getByTestId("commercial-mapping-field-description"));
    await expect(page.getByLabel("Source cell A5")).toBeVisible();
    await enterManualDescription(page, "Manual source selected again");
    await page.getByTestId("commercial-mapping-field-description").locator('button[aria-pressed]').click();
    await page.locator('[data-worksheet-cell="A5"]').click();
    await expect(page.getByLabel("Source cell A5")).toBeVisible();
    await expect(page.getByTestId("commercial-mapping-field-description")).not.toContainText("Manual entry");

    await page.getByTestId("commercial-mapping-field-description").locator('button[aria-pressed]').press("Escape");
    await expect(page.getByTestId("commercial-mapping-field-description").locator('button[aria-pressed]')).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("commercial-mapping-field-description").locator('button[aria-pressed]').press("Escape");
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);
  } finally {
    await fixture.restore();
  }
});

test("publishes a manual-only Description to Quote without Description provenance", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await enterManualDescription(page, "  Plasterboard Linings  ");
    await expect(page.getByTestId("commercial-mapping-empty-helper")).toHaveCount(0);
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);

    const quote = await fixture.admin.from("project_quotes").select("id")
      .eq("organization_id", fixture.organizationId).eq("originating_opportunity_id", fixture.opportunityId).single();
    const lines = await fixture.admin.from("project_quote_line_items")
      .select("description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id);
    expect(lines.data).toEqual([{ description: "Plasterboard Linings", quantity: 1, unit: "Item", rate: 0, total: 0 }]);
    const item = await fixture.admin.from("commercial_items").select("description,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).single();
    expect(item.data?.description).toBe("Plasterboard Linings");
    expect((item.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({});
  } finally {
    await fixture.restore();
  }
});

test("publishes manual Description with Quantity and Total to Quote using numeric-only provenance", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await enterManualDescription(page, "Supply and install plasterboard wall linings");
    await mapField(page, "quantity", "B5");
    await mapField(page, "total", "F5");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("100 Item × $5.00");
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);

    const quote = await fixture.admin.from("project_quotes").select("id")
      .eq("organization_id", fixture.organizationId).eq("originating_opportunity_id", fixture.opportunityId).single();
    const line = await fixture.admin.from("project_quote_line_items")
      .select("description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id).single();
    expect(line.data).toEqual({ description: "Supply and install plasterboard wall linings", quantity: 100, unit: "Item", rate: 5, total: 500 });
    const item = await fixture.admin.from("commercial_items").select("description,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).single();
    expect(item.data?.description).toBe("Supply and install plasterboard wall linings");
    expect((item.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ quantity: ["B5"], total: ["F5"] });
  } finally {
    await fixture.restore();
  }
});

test("publishes changed mapped Description as manual and retains an unchanged mapped Description anchor", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await mapField(page, "description", "A5");
    await enterManualDescription(page, "Plasterboard Linings");
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);

    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await mapField(page, "description", "A5");
    await page.getByRole("button", { name: "Edit description" }).click();
    await page.getByTestId("commercial-mapping-description-input").fill("  92mm 0.75BMT Stud  ");
    await page.getByTestId("commercial-mapping-description-input").press("Enter");
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);

    const quote = await fixture.admin.from("project_quotes")
      .select("id,subtotal,total_quote_price")
      .eq("organization_id", fixture.organizationId)
      .eq("originating_opportunity_id", fixture.opportunityId)
      .single();
    expect(quote.data).toMatchObject({ subtotal: 0, total_quote_price: 0 });
    const lines = await fixture.admin.from("project_quote_line_items")
      .select("description,pricing_source_kind")
      .eq("organization_id", fixture.organizationId)
      .eq("quote_id", quote.data!.id)
      .order("sort_order", { ascending: true });
    expect(lines.data).toEqual([
      { description: "Plasterboard Linings", pricing_source_kind: "worksheet" },
      { description: "92mm 0.75BMT Stud", pricing_source_kind: "worksheet" },
    ]);
    const items = await fixture.admin.from("commercial_items").select("description,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).order("created_at", { ascending: true });
    expect(items.data).toHaveLength(2);
    expect(items.data![0]!.description).toBe("Plasterboard Linings");
    expect((items.data![0]!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({});
    expect(items.data![1]!.description).toBe("92mm 0.75BMT Stud");
    expect((items.data![1]!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ description: ["A5"] });
  } finally {
    await fixture.restore();
  }
});

test("publishes explicit mappings to a persisted Quote with linkage and provenance", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    let capturedPublication: {
      url: string;
      headers: Record<string, string>;
      payload: { p_input: Record<string, unknown> };
    } | null = null;
    page.on("request", (request) => {
      if (request.url().endsWith("/rest/v1/rpc/publish_worksheet_commercial_quote_v1")) {
        capturedPublication = {
          url: request.url(),
          headers: request.headers(),
          payload: request.postDataJSON() as { p_input: Record<string, unknown> },
        };
      }
    });
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await mapField(page, "description", "A5");
    await mapField(page, "quantity", "B5");
    await mapField(page, "unit", "H5");
    await mapField(page, "rate", "I5");
    await mapField(page, "total", "M5");
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);

    const quote = await fixture.admin.from("project_quotes")
      .select("id,status,updated_at,subtotal,gst_amount,total_quote_price")
      .eq("organization_id", fixture.organizationId).eq("originating_opportunity_id", fixture.opportunityId).single();
    expect(quote.error).toBeNull();
    expect(quote.data).toMatchObject({
      status: "Draft",
      subtotal: 488,
      gst_amount: 73.2,
      total_quote_price: 561.2,
    });
    const lines = await fixture.admin.from("project_quote_line_items")
      .select("id,description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id);
    expect(lines.error).toBeNull();
    expect(lines.data).toHaveLength(1);
    expect(lines.data![0]).toMatchObject({ description: "92mm 0.75BMT Stud", quantity: 100, unit: "L/m", rate: 4.88, total: 488 });

    const item = await fixture.admin.from("commercial_items")
      .select("id,description,quantity,unit,rate,total,source_workbook_id,source_sheet_id,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).single();
    expect(item.error).toBeNull();
    expect(item.data).toMatchObject({ description: "92mm 0.75BMT Stud", quantity: 100, unit: "L/m", rate: 4.88, total: 7720.8, source_workbook_id: fixture.workbookId, source_sheet_id: fixture.sheetId });
    expect((item.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ description: ["A5"], quantity: ["B5"], unit: ["H5"], rate: ["I5"], total: ["M5"] });
    const links = await fixture.admin.from("commercial_item_document_links").select("document_id,document_line_id,document_kind")
      .eq("organization_id", fixture.organizationId).eq("commercial_item_id", item.data!.id);
    expect(links.data).toEqual([{ document_id: quote.data!.id, document_line_id: lines.data![0]!.id, document_kind: "quote_line" }]);

    expect(capturedPublication).not.toBeNull();
    const captured = capturedPublication!;
    const rpcHeaders = Object.fromEntries(
      ["apikey", "authorization", "content-profile", "content-type"]
        .flatMap((name) => captured.headers[name] ? [[name, captured.headers[name]]] : []),
    );
    const replay = await page.request.post(captured.url, {
      headers: rpcHeaders,
      data: captured.payload,
    });
    expect(replay.ok()).toBe(true);
    const linesAfterReplay = await fixture.admin.from("project_quote_line_items")
      .select("id").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id);
    expect(linesAfterReplay.data).toHaveLength(1);
    const successfulRequestKey = String(captured.payload.p_input.requestKey);
    const successfulLedger = await fixture.admin.from("worksheet_quote_publication_requests")
      .select("request_key", { count: "exact" })
      .eq("organization_id", fixture.organizationId).eq("request_key", successfulRequestKey);
    expect(successfulLedger.count).toBe(1);

    const originalLines = captured.payload.p_input.lineItems as Array<Record<string, unknown>>;
    const originalLinks = captured.payload.p_input.commercialItemLinks as Array<Record<string, unknown>>;
    const rollbackLineId = crypto.randomUUID();
    const rollbackRequestKey = `${successfulRequestKey}:rollback-check`;
    const rollbackPayload = {
      p_input: {
        ...captured.payload.p_input,
        requestKey: rollbackRequestKey,
        expectedUpdatedAt: quote.data!.updated_at,
        lineItems: [
          ...originalLines,
          { ...originalLines[0], id: rollbackLineId, unit: "Item" },
        ],
        commercialItemLinks: [
          { ...originalLinks[0], quoteLineId: rollbackLineId },
        ],
      },
    };
    const rejected = await page.request.post(captured.url, {
      headers: rpcHeaders,
      data: rollbackPayload,
    });
    expect(rejected.status()).toBe(400);
    expect(await rejected.text()).toContain("Quote publication totals do not reconcile with persisted quote lines");
    const linesAfterRollback = await fixture.admin.from("project_quote_line_items")
      .select("id").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id);
    expect(linesAfterRollback.data).toHaveLength(1);
    const headerAfterRollback = await fixture.admin.from("project_quotes")
      .select("subtotal,gst_amount,total_quote_price")
      .eq("organization_id", fixture.organizationId).eq("id", quote.data!.id).single();
    expect(headerAfterRollback.data).toEqual({ subtotal: 488, gst_amount: 73.2, total_quote_price: 561.2 });
    const failedLedger = await fixture.admin.from("worksheet_quote_publication_requests")
      .select("request_key", { count: "exact", head: true })
      .eq("organization_id", fixture.organizationId).eq("request_key", rollbackRequestKey);
    expect(failedLedger.count).toBe(0);
  } finally {
    await fixture.restore();
  }
});

test("publishes Description-only mapping to Quote without forcing optional fields", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await expect(page.getByTestId("commercial-mapping-empty-helper")).toHaveText("Add a Description or map at least one worksheet cell.");
    await mapField(page, "description", "A5");
    await expect(page.getByTestId("commercial-mapping-empty-helper")).toHaveCount(0);
    await expect(page.getByTestId("commercial-mapping-field-quantity")).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("commercial-mapping-field-unit")).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("commercial-mapping-field-rate")).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("commercial-mapping-field-total")).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("92mm 0.75BMT Stud");
    await expect(page.getByTestId("commercial-mapping-preview")).not.toContainText("×");
    await expect(page.getByRole("button", { name: "Add to Quote", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);

    const quote = await fixture.admin.from("project_quotes").select("id")
      .eq("organization_id", fixture.organizationId).eq("originating_opportunity_id", fixture.opportunityId).single();
    const lines = await fixture.admin.from("project_quote_line_items")
      .select("description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id);
    expect(lines.data).toEqual([{ description: "92mm 0.75BMT Stud", quantity: 1, unit: "Item", rate: 0, total: 0 }]);
    const item = await fixture.admin.from("commercial_items").select("description,quantity,unit,rate,total,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).single();
    expect(item.data).toMatchObject({ description: "92mm 0.75BMT Stud", quantity: null, unit: null, rate: null, total: null });
    expect((item.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ description: ["A5"] });
  } finally {
    await fixture.restore();
  }
});

test("publishes Description and Total mapping to Quote with derived destination values", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await mapField(page, "description", "A5");
    await mapField(page, "total", "E5");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("1 Item × $0.60");
    await expect(page.getByRole("button", { name: "Add to Quote", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);

    const quote = await fixture.admin.from("project_quotes").select("id")
      .eq("organization_id", fixture.organizationId).eq("originating_opportunity_id", fixture.opportunityId).single();
    const lines = await fixture.admin.from("project_quote_line_items")
      .select("description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id);
    expect(lines.data).toEqual([{ description: "92mm 0.75BMT Stud", quantity: 1, unit: "Item", rate: 0.6, total: 0.6 }]);
    const item = await fixture.admin.from("commercial_items").select("locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).single();
    expect((item.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ description: ["A5"], total: ["E5"] });

    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await mapField(page, "total", "E5");
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);
    const sparseLines = await fixture.admin.from("project_quote_line_items")
      .select("description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id).order("sort_order", { ascending: true });
    expect(sparseLines.data).toEqual([
      { description: "92mm 0.75BMT Stud", quantity: 1, unit: "Item", rate: 0.6, total: 0.6 },
      { description: "", quantity: 1, unit: "Item", rate: 0.6, total: 0.6 },
    ]);
    const totalOnlyItem = await fixture.admin.from("commercial_items").select("description,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).eq("description", "").single();
    expect((totalOnlyItem.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ total: ["E5"] });
  } finally {
    await fixture.restore();
  }
});

test("publishes Quantity-only mapping to Quote with blank Description and exact provenance", async ({ page }) => {
  const fixture = await seedReportedWorksheet();
  try {
    await page.goto(fixture.url);
    await openQuoteMapping(page);
    await mapField(page, "quantity", "B5");
    await expect(page.getByRole("button", { name: "Add to Quote", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Add to Quote", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Quote commercial mapping" })).toHaveCount(0);

    const quote = await fixture.admin.from("project_quotes").select("id")
      .eq("organization_id", fixture.organizationId).eq("originating_opportunity_id", fixture.opportunityId).single();
    const lines = await fixture.admin.from("project_quote_line_items")
      .select("description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("quote_id", quote.data!.id);
    expect(lines.data).toEqual([{ description: "", quantity: 100, unit: "Item", rate: 0, total: 0 }]);
    const item = await fixture.admin.from("commercial_items").select("description,quantity,unit,rate,total,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).single();
    expect(item.data).toMatchObject({ description: "", quantity: 100, unit: null, rate: null, total: null });
    expect((item.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ quantity: ["B5"] });
  } finally {
    await fixture.restore();
  }
});

test("verifies PO Total derivation and zero-quantity rejection in the browser", async ({ page }) => {
  const fixture = await seedReportedWorksheet({ converted: true });
  try {
    await page.goto(fixture.url);
    await openPurchaseOrderMapping(page);
    await mapField(page, "description", "A5");
    await mapField(page, "quantity", "B5");
    await mapField(page, "unit", "H5");
    await mapField(page, "total", "M5");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("100 L/m × $77.21");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("Rate derived from Total ÷ Quantity.");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.goto(fixture.url);
    await openPurchaseOrderMapping(page);
    await mapField(page, "description", "A5");
    await mapField(page, "unit", "H5");
    await mapField(page, "total", "M5");
    const totalOnlyPreview = page.getByTestId("commercial-mapping-preview");
    await expect(totalOnlyPreview).toContainText("1 L/m × $7,720.80");
    await expect(totalOnlyPreview).toContainText("Quantity defaults to 1 for this total-only mapping.");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.goto(fixture.url);
    await openPurchaseOrderMapping(page);
    await mapField(page, "description", "A5");
    await mapField(page, "quantity", "C5");
    await mapField(page, "unit", "H5");
    await mapField(page, "total", "M5");
    await expect(page.getByText("Rate cannot be derived from Total when Quantity is zero.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to Purchase Order", exact: true })).toBeDisabled();
  } finally {
    await fixture.restore();
  }
});

test("publishes PO derived-rate and total-only mappings and rejects zero-quantity derivation", async ({ page }) => {
  const fixture = await seedReportedWorksheet({ converted: true });
  try {
    await page.goto(fixture.url);
    await openPurchaseOrderMapping(page);
    await mapField(page, "description", "A5");
    await mapField(page, "quantity", "B5");
    await mapField(page, "unit", "H5");
    await mapField(page, "total", "M5");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("100 L/m × $77.21");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("Rate derived from Total ÷ Quantity.");
    await page.getByLabel("Supplier", { exact: true }).selectOption(fixture.supplierId);
    await page.getByLabel("Procurement section").selectOption("Materials");
    await page.getByRole("button", { name: "Add to Purchase Order", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Purchase Order commercial mapping" })).toHaveCount(0);

    const firstOrder = await fixture.admin.from("project_purchase_orders").select("id,supplier_id,status")
      .eq("organization_id", fixture.organizationId).eq("project_id", fixture.projectId).single();
    expect(firstOrder.error).toBeNull();
    expect(firstOrder.data).toMatchObject({ supplier_id: fixture.supplierId, status: "Draft" });
    const firstLines = await fixture.admin.from("project_purchase_order_line_items")
      .select("id,description,quantity,unit,rate,total,section").eq("organization_id", fixture.organizationId).eq("purchase_order_id", firstOrder.data!.id);
    expect(firstLines.data).toHaveLength(1);
    expect(firstLines.data![0]).toMatchObject({ description: "92mm 0.75BMT Stud", quantity: 100, unit: "L/m", rate: 77.21, total: 7720.8, section: "Materials" });

    const firstItem = await fixture.admin.from("commercial_items")
      .select("id,description,quantity,unit,rate,total,source_workbook_id,source_sheet_id,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).single();
    expect(firstItem.error).toBeNull();
    expect(firstItem.data).toMatchObject({ description: "92mm 0.75BMT Stud", quantity: 100, unit: "L/m", rate: null, total: 7720.8, source_workbook_id: fixture.workbookId, source_sheet_id: fixture.sheetId });
    expect((firstItem.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ description: ["A5"], quantity: ["B5"], unit: ["H5"], total: ["M5"] });
    const firstLinks = await fixture.admin.from("commercial_item_document_links")
      .select("document_id,document_line_id,document_kind")
      .eq("organization_id", fixture.organizationId).eq("commercial_item_id", firstItem.data!.id);
    expect(firstLinks.data).toEqual([{ document_id: firstOrder.data!.id, document_line_id: firstLines.data![0]!.id, document_kind: "purchase_order_line" }]);

    await page.goto(fixture.url);
    await openPurchaseOrderMapping(page);
    await mapField(page, "total", "E5");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("1 Item × $0.60");
    await expect(page.getByTestId("commercial-mapping-preview")).toContainText("Quantity defaults to 1 for this total-only mapping.");
    await page.getByLabel("Supplier", { exact: true }).selectOption(fixture.supplierId);
    await page.getByLabel("Procurement section").selectOption("Materials");
    await page.getByRole("button", { name: "Add to Purchase Order", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Purchase Order commercial mapping" })).toHaveCount(0);

    const orders = await fixture.admin.from("project_purchase_orders").select("id")
      .eq("organization_id", fixture.organizationId).eq("project_id", fixture.projectId).order("created_at", { ascending: true });
    expect(orders.data).toHaveLength(2);
    const totalOnlyLines = await fixture.admin.from("project_purchase_order_line_items")
      .select("description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("purchase_order_id", orders.data![1]!.id);
    expect(totalOnlyLines.data).toEqual([{ description: "", quantity: 1, unit: "", rate: 0.6, total: 0.6 }]);
    const totalOnlyItem = await fixture.admin.from("commercial_items").select("locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).eq("description", "").single();
    expect((totalOnlyItem.data!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual({ total: ["E5"] });

    await page.goto(fixture.url);
    await openPurchaseOrderMapping(page);
    await mapField(page, "description", "A5");
    await mapField(page, "quantity", "C5");
    await mapField(page, "unit", "H5");
    await mapField(page, "total", "M5");
    await expect(page.getByText("Rate cannot be derived from Total when Quantity is zero.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to Purchase Order", exact: true })).toBeDisabled();
  } finally {
    await fixture.restore();
  }
});

test("persists representative manual Description cases to Purchase Orders without fabricated provenance", async ({ page }) => {
  const fixture = await seedReportedWorksheet({ converted: true });
  const cases = [
    { description: "PO manual description", totalCell: null, startMapped: false, line: { quantity: 0, unit: "", rate: 0, total: 0 }, provenance: {} },
    { description: "PO manual plus total", totalCell: "F5", startMapped: false, line: { quantity: 1, unit: "", rate: 500, total: 500 }, provenance: { total: ["F5"] } },
    { description: "PO mapped changed to manual", totalCell: null, startMapped: true, line: { quantity: 0, unit: "", rate: 0, total: 0 }, provenance: {} },
  ] as const;
  try {
    for (const testCase of cases) {
      await page.goto(fixture.url);
      await openPurchaseOrderMapping(page);
      if (testCase.startMapped) await mapField(page, "description", "A5");
      await enterManualDescription(page, testCase.description);
      if (testCase.totalCell) await mapField(page, "total", testCase.totalCell);
      await page.getByLabel("Supplier", { exact: true }).selectOption(fixture.supplierId);
      await page.getByLabel("Procurement section").selectOption("Materials");
      await page.getByRole("button", { name: "Add to Purchase Order", exact: true }).click();
      await expect(page.getByRole("complementary", { name: "Purchase Order commercial mapping" })).toHaveCount(0);
    }

    const orders = await fixture.admin.from("project_purchase_orders").select("id")
      .eq("organization_id", fixture.organizationId).eq("project_id", fixture.projectId).order("created_at", { ascending: true });
    expect(orders.data).toHaveLength(cases.length);
    for (const [index, testCase] of cases.entries()) {
      const line = await fixture.admin.from("project_purchase_order_line_items")
        .select("description,quantity,unit,rate,total").eq("organization_id", fixture.organizationId).eq("purchase_order_id", orders.data![index]!.id).single();
      expect(line.data).toEqual({ description: testCase.description, ...testCase.line });
    }

    const items = await fixture.admin.from("commercial_items").select("description,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).order("created_at", { ascending: true });
    expect(items.data).toHaveLength(cases.length);
    for (const [index, testCase] of cases.entries()) {
      expect(items.data![index]!.description).toBe(testCase.description);
      expect((items.data![index]!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual(testCase.provenance);
    }
  } finally {
    await fixture.restore();
  }
});

test("persists the sparse Purchase Order matrix with blank descriptions and exact provenance", async ({ page }) => {
  const fixture = await seedReportedWorksheet({ converted: true });
  const cases = [
    { mappings: [["description", "A5"]] as const, line: { description: "92mm 0.75BMT Stud", quantity: 0, unit: "", rate: 0, total: 0 }, provenance: { description: ["A5"] } },
    { mappings: [["quantity", "B5"]] as const, line: { description: "", quantity: 100, unit: "", rate: 0, total: 0 }, provenance: { quantity: ["B5"] } },
    { mappings: [["rate", "I5"]] as const, line: { description: "", quantity: 0, unit: "", rate: 4.88, total: 0 }, provenance: { rate: ["I5"] } },
    { mappings: [["description", "A5"], ["total", "F5"]] as const, line: { description: "92mm 0.75BMT Stud", quantity: 1, unit: "", rate: 500, total: 500 }, provenance: { description: ["A5"], total: ["F5"] } },
    { mappings: [["quantity", "B5"], ["total", "F5"]] as const, line: { description: "", quantity: 100, unit: "", rate: 5, total: 500 }, provenance: { quantity: ["B5"], total: ["F5"] } },
    { mappings: [["description", "A5"], ["quantity", "B5"], ["unit", "H5"], ["rate", "I5"], ["total", "F5"]] as const, line: { description: "92mm 0.75BMT Stud", quantity: 100, unit: "L/m", rate: 4.88, total: 488 }, provenance: { description: ["A5"], quantity: ["B5"], unit: ["H5"], rate: ["I5"], total: ["F5"] } },
  ];
  try {
    for (const testCase of cases) {
      await page.goto(fixture.url);
      await openPurchaseOrderMapping(page);
      for (const [field, cellKey] of testCase.mappings) await mapField(page, field, cellKey);
      await page.getByLabel("Supplier", { exact: true }).selectOption(fixture.supplierId);
      await page.getByLabel("Procurement section").selectOption("Materials");
      await page.getByRole("button", { name: "Add to Purchase Order", exact: true }).click();
      await expect(page.getByRole("complementary", { name: "Purchase Order commercial mapping" })).toHaveCount(0);
    }

    const orders = await fixture.admin.from("project_purchase_orders").select("id,supplier_id,status")
      .eq("organization_id", fixture.organizationId).eq("project_id", fixture.projectId).order("created_at", { ascending: true });
    expect(orders.data).toHaveLength(cases.length);
    for (const [index, testCase] of cases.entries()) {
      expect(orders.data![index]).toMatchObject({ supplier_id: fixture.supplierId, status: "Draft" });
      const line = await fixture.admin.from("project_purchase_order_line_items")
        .select("description,quantity,unit,rate,total,section").eq("organization_id", fixture.organizationId).eq("purchase_order_id", orders.data![index]!.id).single();
      expect(line.data).toMatchObject({ ...testCase.line, section: "Materials" });
    }

    const items = await fixture.admin.from("commercial_items").select("description,locked_metadata_json")
      .eq("organization_id", fixture.organizationId).eq("source_workbook_id", fixture.workbookId).order("created_at", { ascending: true });
    expect(items.data).toHaveLength(cases.length);
    for (const [index, testCase] of cases.entries()) {
      expect(items.data![index]!.description).toBe(testCase.line.description);
      expect((items.data![index]!.locked_metadata_json as { worksheetMetadata?: { worksheetPublishV2?: { fieldMappings?: unknown } } }).worksheetMetadata?.worksheetPublishV2?.fieldMappings).toEqual(testCase.provenance);
    }
  } finally {
    await fixture.restore();
  }
});
