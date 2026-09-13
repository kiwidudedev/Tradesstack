import { expect, test } from "@playwright/test";

import { createE2EAdminClient, ensureSupplierInvoiceE2EContext } from "./supplier-invoice-e2e-helpers";

test("formula inspection and editing follow the shared spreadsheet interaction contract", async ({ page }) => {
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

  const sheetQuery = admin
    .from("opportunity_pricing_workbook_sheets")
    .select("id,name,worksheet_data,is_default")
    .eq("organization_id", organizationId)
    .eq("workbook_id", workbookResult.data.id);
  const sheetResult = workbookResult.data.last_active_sheet_id
    ? await sheetQuery.eq("id", workbookResult.data.last_active_sheet_id).single()
    : await sheetQuery.eq("is_default", true).single();
  if (sheetResult.error) throw sheetResult.error;

  const originalSheetData = sheetResult.data.worksheet_data as Record<string, unknown>;
  const originalWorkbookData = workbookResult.data.worksheet_data;
  const seededSheetData = {
    ...originalSheetData,
    cells: {
      ...((originalSheetData.cells as Record<string, unknown> | undefined) ?? {}),
      A1: {
        type: "number",
        value: 2,
        formula: null,
        computedValue: 2,
        displayValue: "2",
        metadata: {},
      },
      B1: {
        type: "number",
        value: 3,
        formula: null,
        computedValue: 3,
        displayValue: "3",
        metadata: {},
      },
      C1: {
        type: "formula",
        value: "=A1+B1",
        formula: "=A1+B1",
        computedValue: 5,
        displayValue: "5",
        metadata: {},
      },
    },
  };
  const updateSheet = await admin
    .from("opportunity_pricing_workbook_sheets")
    .update({ worksheet_data: seededSheetData })
    .eq("organization_id", organizationId)
    .eq("workbook_id", workbookResult.data.id)
    .eq("id", sheetResult.data.id);
  if (updateSheet.error) throw updateSheet.error;
  if (sheetResult.data.is_default) {
    const updateWorkbook = await admin
      .from("opportunity_pricing_worksheets")
      .update({ worksheet_data: seededSheetData })
      .eq("organization_id", organizationId)
      .eq("id", workbookResult.data.id);
    if (updateWorkbook.error) throw updateWorkbook.error;
  }

  try {
    await page.goto(
      `/app/leads-clients/opportunities/${opportunityResult.data.slug}/pricing-worksheet/${workbookResult.data.id}?sheetId=${sheetResult.data.id}`,
    );
    const formulaBar = page.getByTestId("pricing-worksheet-formula-bar");
    const formulaCell = page.locator('[data-worksheet-cell="C1"]');

    await expect(formulaCell).toBeVisible();
    await formulaCell.click();
    await expect(formulaBar).toHaveValue("=A1+B1");
    await expect(page.locator('[data-formula-reference="true"]')).toHaveCount(0);

    await formulaCell.dblclick({ position: { x: 42, y: 15 } });
    await expect(formulaCell).toHaveAttribute("data-editing", "true");
    await expect(page.locator('[data-worksheet-cell="A1"]')).toHaveAttribute("data-formula-reference", "true");
    await expect(page.locator('[data-worksheet-cell="B1"]')).toHaveAttribute("data-formula-reference", "true");

    const inlineEditor = formulaCell.locator("input");
    await inlineEditor.evaluate((input: HTMLInputElement) => input.setSelectionRange(4, 4));
    await page.locator('[data-worksheet-cell="D1"]').click();
    await expect(inlineEditor).toHaveValue("=A1+D1B1");
    await inlineEditor.press("Escape");
    await expect(formulaBar).toHaveValue("=A1+B1");
    await expect(formulaCell).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-formula-reference="true"]')).toHaveCount(0);

    await formulaCell.dblclick();
    await formulaCell.locator("input").press("Enter");
    await expect(page.locator('[data-worksheet-cell="C2"]')).toHaveAttribute("aria-selected", "true");

    await formulaCell.dblclick();
    await formulaCell.locator("input").press("Tab");
    await expect(page.locator('[data-worksheet-cell="D1"]')).toHaveAttribute("aria-selected", "true");
  } finally {
    await admin
      .from("opportunity_pricing_workbook_sheets")
      .update({ worksheet_data: originalSheetData })
      .eq("organization_id", organizationId)
      .eq("workbook_id", workbookResult.data.id)
      .eq("id", sheetResult.data.id);
    if (sheetResult.data.is_default) {
      await admin
        .from("opportunity_pricing_worksheets")
        .update({
          name: workbookResult.data.name,
          worksheet_data: originalWorkbookData,
        })
        .eq("organization_id", organizationId)
        .eq("id", workbookResult.data.id);
    }
  }
});
