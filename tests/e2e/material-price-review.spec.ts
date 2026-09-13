import { expect, test } from "@playwright/test";
import { createE2EAdminClient, ensureSupplierInvoiceE2EContext } from "./supplier-invoice-e2e-helpers";

test("authenticated Opportunity worksheet exposes the integrated Material price Updates mode", async ({ page }) => {
  const pickerRequests: string[] = [];
  let releaseStalePickerResponse: (() => void) | undefined;
  await page.route("**/api/pricing-worksheets/materials?*", async (route) => {
    pickerRequests.push(route.request().url());
    if (new URL(route.request().url()).searchParams.get("search") === "stud") {
      await new Promise<void>((resolve) => {
        releaseStalePickerResponse = resolve;
      });
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [{
          materialId: "11111111-1111-4111-8111-111111111111",
          materialName: "GIB Standard Plasterboard",
          materialDescription: "Standard plasterboard sheet",
          category: "Linings",
          defaultUnit: "sheet",
          supplierId: "22222222-2222-4222-8222-222222222222",
          supplierName: "Test Supplier",
          supplierProductId: "33333333-3333-4333-8333-333333333333",
          supplierProductDescription: `GIB result page ${new URL(route.request().url()).searchParams.get("page") ?? "1"}`,
          supplierSku: "GIB-13",
          supplierUnit: "sheet",
          isPreferred: true,
          price: null,
        }],
        page: Number(new URL(route.request().url()).searchParams.get("page") ?? "1"),
        pageSize: 20,
        total: 21,
        hasMore: new URL(route.request().url()).searchParams.get("page") !== "2",
        evaluatedAt: "2026-08-16T00:00:00.000Z",
      }),
    }).catch(() => undefined);
  });
  const { organizationId } = await ensureSupplierInvoiceE2EContext();
  const admin = createE2EAdminClient();
  const workbookResult = await admin
    .from("opportunity_pricing_worksheets")
    .select("id,opportunity_id")
    .eq("organization_id", organizationId)
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

  await page.goto(`/app/leads-clients/opportunities/${opportunityResult.data.slug}/pricing-worksheet/${workbookResult.data.id}`);
  await expect(page.getByRole("button", { name: "Open Material Library" })).toBeVisible();
  await page.getByRole("button", { name: "Open Material Library" }).click();
  await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Library" })).toBeVisible();
  await expect(page.getByText("Search the Material Library")).toBeVisible();
  await page.waitForTimeout(350);
  expect(pickerRequests).toHaveLength(0);

  const search = page.getByRole("textbox", { name: "Search Material Library" });
  await search.fill("g");
  await expect(page.getByText("Type at least 2 characters to search.")).toBeVisible();
  await page.waitForTimeout(350);
  expect(pickerRequests).toHaveLength(0);

  await search.fill("gib");
  await expect(page.getByText("GIB Standard Plasterboard")).toBeVisible();
  expect(pickerRequests).toHaveLength(1);
  await page.getByRole("button", { name: "Next materials page" }).click();
  await expect.poll(() => pickerRequests.length).toBe(2);
  expect(new URL(pickerRequests[1]).searchParams.get("page")).toBe("2");
  await expect(page.getByText("GIB result page 2")).toBeVisible();
  await page.getByRole("button", { name: "Updates" }).click();
  await expect(page.getByText(/price updates$/)).toBeVisible();
  await expect(page.getByText(/need manual review$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh Material price updates" })).toBeVisible();
  await page.getByRole("button", { name: "Library" }).click();
  await expect(search).toHaveValue("gib");
  await expect(page.getByText("GIB Standard Plasterboard")).toBeVisible();
  await page.waitForTimeout(350);
  expect(pickerRequests).toHaveLength(2);

  await search.fill("stud");
  await expect.poll(() => Boolean(releaseStalePickerResponse)).toBe(true);
  expect(new URL(pickerRequests[2]).searchParams.get("page")).toBe("1");
  await page.getByRole("button", { name: "Clear Material Library search" }).click();
  releaseStalePickerResponse?.();
  await expect(page.getByText("Search the Material Library")).toBeVisible();
  await expect(page.getByText("GIB Standard Plasterboard")).not.toBeVisible();
  await page.waitForTimeout(350);
  expect(pickerRequests).toHaveLength(3);
});
