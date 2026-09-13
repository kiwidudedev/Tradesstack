import { expect, test, type Page } from "@playwright/test";

import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

async function getOpportunityWorksheetFixture() {
  const { organizationId } = await ensureSupplierInvoiceE2EContext();
  const admin = createE2EAdminClient();
  const workbookResult = await admin
    .from("opportunity_pricing_worksheets")
    .select("id,opportunity_id,name")
    .eq("organization_id", organizationId)
    .is("project_id", null)
    .is("quote_id", null)
    .is("variation_id", null)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (workbookResult.error) throw workbookResult.error;

  const opportunityResult = await admin
    .from("organization_opportunities")
    .select("slug")
    .eq("organization_id", organizationId)
    .eq("id", workbookResult.data.opportunity_id)
    .single();
  if (opportunityResult.error) throw opportunityResult.error;

  const registerPath = `/app/leads-clients/opportunities/${opportunityResult.data.slug}/pricing-worksheet`;
  return {
    registerPath,
    storageKey: `pricing-worksheet-overlay:opportunity:${workbookResult.data.opportunity_id}`,
    workbookId: workbookResult.data.id,
    workbookName: workbookResult.data.name,
  };
}

async function openWorksheetFromRegister(page: Page, fixture: Awaited<ReturnType<typeof getOpportunityWorksheetFixture>>) {
  await page.goto(fixture.registerPath);
  const worksheetRow = page.getByRole("row").filter({ hasText: fixture.workbookName });
  await expect(worksheetRow).toHaveCount(1);
  await worksheetRow.getByRole("button", { name: "Edit worksheet" }).click();
  const worksheetDialog = page.getByRole("dialog", { name: "Pricing worksheet editor" });
  await expect(worksheetDialog).toBeVisible();
  await expect(page.getByText("Loading worksheet...", { exact: true })).toHaveCount(0);
  return worksheetDialog;
}

async function armWorksheetLoadingObserver(page: Page) {
  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & {
      __worksheetLoadingSeen?: boolean;
      __worksheetLoadingObserver?: MutationObserver;
    };
    const inspect = () => {
      if (Array.from(document.querySelectorAll("div")).some((node) => node.textContent === "Loading worksheet...")) {
        runtimeWindow.__worksheetLoadingSeen = true;
      }
    };
    runtimeWindow.__worksheetLoadingSeen = false;
    runtimeWindow.__worksheetLoadingObserver = new MutationObserver(inspect);
    runtimeWindow.__worksheetLoadingObserver.observe(document.documentElement, { childList: true, subtree: true });
    inspect();
  });
}

async function readAndStopWorksheetLoadingObserver(page: Page) {
  return page.evaluate(() => {
    const runtimeWindow = window as typeof window & {
      __worksheetLoadingSeen?: boolean;
      __worksheetLoadingObserver?: MutationObserver;
    };
    runtimeWindow.__worksheetLoadingObserver?.disconnect();
    return runtimeWindow.__worksheetLoadingSeen === true;
  });
}

test("Opportunity worksheet closes on the first click without loading or reopening", async ({ page }, testInfo) => {
  await ensureSupplierInvoiceLoggedIn(page, String(testInfo.project.use.baseURL));
  const fixture = await getOpportunityWorksheetFixture();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const worksheetDialog = await openWorksheetFromRegister(page, fixture);
    await armWorksheetLoadingObserver(page);

    await worksheetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(fixture.registerPath);
    await expect(worksheetDialog).toHaveCount(0);
    await page.waitForTimeout(2000);
    expect(await readAndStopWorksheetLoadingObserver(page)).toBe(false);
    await expect(page).toHaveURL(fixture.registerPath);
    await expect(worksheetDialog).toHaveCount(0);
  }
});

test("Opportunity worksheet Close does not start a register RSC navigation", async ({ page }, testInfo) => {
  await ensureSupplierInvoiceLoggedIn(page, String(testInfo.project.use.baseURL));
  const fixture = await getOpportunityWorksheetFixture();
  let registerRequestCount = 0;
  const worksheetDialog = await openWorksheetFromRegister(page, fixture);

  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === fixture.registerPath && requestUrl.searchParams.has("_rsc")) registerRequestCount += 1;
    await route.continue();
  });

  await worksheetDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(fixture.registerPath);
  await expect(worksheetDialog).toHaveCount(0);
  expect(registerRequestCount).toBe(0);
});

test("canonical register pathname rejects stale history and session restoration", async ({ page }, testInfo) => {
  await ensureSupplierInvoiceLoggedIn(page, String(testInfo.project.use.baseURL));
  const fixture = await getOpportunityWorksheetFixture();
  await page.goto(fixture.registerPath);

  await page.evaluate(({ storageKey, workbookId, registerPath }) => {
    window.sessionStorage.setItem(storageKey, workbookId);
    window.history.replaceState(
      { ...(window.history.state ?? {}), pricingWorksheetOverlay: true, worksheetId: workbookId },
      "",
      registerPath,
    );
  }, fixture);
  await page.reload();

  await expect(page).toHaveURL(fixture.registerPath);
  await expect(page.getByRole("dialog", { name: "Pricing worksheet editor" })).toHaveCount(0);
  await expect(page.getByText("Loading worksheet...", { exact: true })).toHaveCount(0);
  expect(await page.evaluate((storageKey) => window.sessionStorage.getItem(storageKey), fixture.storageKey)).toBeNull();
});

test("browser Back closes a worksheet opened from the register", async ({ page }, testInfo) => {
  await ensureSupplierInvoiceLoggedIn(page, String(testInfo.project.use.baseURL));
  const fixture = await getOpportunityWorksheetFixture();
  const worksheetDialog = await openWorksheetFromRegister(page, fixture);

  await page.goBack();
  await expect(page).toHaveURL(fixture.registerPath);
  await expect(worksheetDialog).toHaveCount(0);
});
