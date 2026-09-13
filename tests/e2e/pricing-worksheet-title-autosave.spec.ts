import { expect, test } from "@playwright/test";
import { createE2EAdminClient, ensureSupplierInvoiceE2EContext } from "./supplier-invoice-e2e-helpers";

test("the shared worksheet title input remains controlled by its local draft while autosaving", async ({ page }) => {
  const { organizationId } = await ensureSupplierInvoiceE2EContext();
  const admin = createE2EAdminClient();
  const workbookResult = await admin
    .from("opportunity_pricing_worksheets")
    .select("id,opportunity_id,last_active_sheet_id,name,worksheet_data")
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

  const sheetResult = await admin
    .from("opportunity_pricing_workbook_sheets")
    .select("id,name,worksheet_data,is_default")
    .eq("organization_id", organizationId)
    .eq("workbook_id", workbookResult.data.id)
    .eq("id", workbookResult.data.last_active_sheet_id)
    .single();
  if (sheetResult.error) throw sheetResult.error;

  const originalTitle = sheetResult.data.name;
  const testTitle = `Title input ${Date.now()}`;
  const url = `/app/leads-clients/opportunities/${opportunityResult.data.slug}/pricing-worksheet/${workbookResult.data.id}?sheetId=${sheetResult.data.id}`;

  try {
    await page.goto(url);
    const editButton = page.getByRole("button", { name: "Edit worksheet name" });
    await expect(editButton).toBeVisible();
    await editButton.click();

    const input = page.getByLabel("Worksheet name");
    await expect(input).toBeFocused();
    await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    let typedTitle = "";
    for (const character of testTitle) {
      await input.press(character === " " ? "Space" : character);
      typedTitle += character;
      await expect(input).toHaveValue(typedTitle);
    }

    await expect(input).toHaveValue(testTitle);
    await page.setViewportSize({ width: 1360, height: 820 });
    await expect(input).toHaveValue(testTitle);
    await input.press("Enter");

    await expect.poll(async () => {
      const persisted = await admin
        .from("opportunity_pricing_workbook_sheets")
        .select("name")
        .eq("organization_id", organizationId)
        .eq("workbook_id", workbookResult.data.id)
        .eq("id", sheetResult.data.id)
        .single();
      return persisted.data?.name;
    }).toBe(testTitle);

    await page.reload();
    await expect(page.getByRole("button", { name: "Edit worksheet name" })).toHaveText(testTitle);

    await page.getByRole("button", { name: "Edit worksheet name" }).click();
    const laterInput = page.getByLabel("Worksheet name");
    await laterInput.press("End");
    await laterInput.type(" discarded");
    await expect(laterInput).toHaveValue(`${testTitle} discarded`);
    await laterInput.press("Escape");
    await expect(page.getByRole("button", { name: "Edit worksheet name" })).toHaveText(testTitle);
  } finally {
    await admin
      .from("opportunity_pricing_workbook_sheets")
      .update({
        name: originalTitle,
        worksheet_data: {
          ...(sheetResult.data.worksheet_data as Record<string, unknown>),
          sheetName: originalTitle,
        },
      })
      .eq("organization_id", organizationId)
      .eq("workbook_id", workbookResult.data.id)
      .eq("id", sheetResult.data.id);
    if (sheetResult.data.is_default) {
      await admin
        .from("opportunity_pricing_worksheets")
        .update({
          name: workbookResult.data.name,
          worksheet_data: workbookResult.data.worksheet_data,
        })
        .eq("organization_id", organizationId)
        .eq("id", workbookResult.data.id);
    }
  }
});
