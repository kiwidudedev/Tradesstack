import { expect, test } from "@playwright/test";

import { createE2EAdminClient, ensureSupplierInvoiceE2EContext, ensureSupplierInvoiceLoggedIn } from "./supplier-invoice-e2e-helpers";
import { createDefaultWorksheetData, normalizeWorksheetCell, type WorksheetCell } from "../../lib/opportunity-pricing-worksheet-defaults";

async function seedDisposablePricingWorksheet() {
  const { organizationId, userId } = await ensureSupplierInvoiceE2EContext();
  const admin = createE2EAdminClient();
  const suffix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const clientId = crypto.randomUUID();
  const opportunityId = crypto.randomUUID();
  const workbookId = crypto.randomUUID();
  const sheetId = crypto.randomUUID();
  const slug = `worksheet-interaction-e2e-${suffix}`;
  const worksheet = createDefaultWorksheetData({ sheetName: "Interaction E2E", rowCount: 20, columnCount: 13 });
  const fixture: Record<string, string> = {
    A1: "2", B1: "3", C1: "=A1+B1", D1: "=B1*C1", E1: "=B1*$C$1", F1: "=$B1*C$1",
    A2: "4", B2: "5", C2: "=A2+B2", D2: "=B2*C2", E2: "=B2*$C$1", F2: "=$B2*C$1",
  };
  const styledFormat = { text: { bold: true, italic: true, color: "#dc2626" }, fill: { color: "#fff200" }, border: { bottom: { color: "#000000", style: "solid" } } };
  worksheet.cells = Object.fromEntries(Object.entries(fixture).map(([key, value]) => {
    const cell = normalizeWorksheetCell(value);
    return [key, key.startsWith("D") ? { ...cell, metadata: { ...cell.metadata, format: styledFormat } } satisfies WorksheetCell : cell];
  })) as Record<string, WorksheetCell>;

  const client = await admin.from("organization_clients").insert({
    id: clientId, organization_id: organizationId, created_by: userId,
    name: `Worksheet Interaction Client ${suffix}`, company_name: `Worksheet Interaction Client ${suffix}`,
  });
  if (client.error) throw client.error;
  const opportunity = await admin.from("organization_opportunities").insert({
    id: opportunityId, organization_id: organizationId, created_by: userId, owner_user_id: userId,
    client_id: clientId, name: `Worksheet Interaction ${suffix}`, opportunity_code: `WIE-${suffix}`,
    slug, location: "Auckland", stage: "Pricing", estimated_value: 1000,
  });
  if (opportunity.error) throw opportunity.error;
  const tenderClient = await admin.from("opportunity_tender_clients").insert({
    organization_id: organizationId, opportunity_id: opportunityId, client_id: clientId,
    created_by: userId, is_primary: true,
  });
  if (tenderClient.error) throw tenderClient.error;
  const workbook = await admin.from("opportunity_pricing_worksheets").insert({
    id: workbookId, organization_id: organizationId, opportunity_id: opportunityId,
    project_id: null, created_by: userId, updated_by: userId, name: "Interaction E2E", worksheet_data: worksheet,
  });
  if (workbook.error) throw workbook.error;
  const sheet = await admin.from("opportunity_pricing_workbook_sheets").insert({
    id: sheetId, organization_id: organizationId, opportunity_id: opportunityId, workbook_id: workbookId,
    created_by: userId, updated_by: userId, name: "Interaction E2E", is_default: true, worksheet_data: worksheet,
  });
  if (sheet.error) throw sheet.error;
  const activeSheet = await admin.from("opportunity_pricing_worksheets").update({ last_active_sheet_id: sheetId })
    .eq("organization_id", organizationId).eq("id", workbookId);
  if (activeSheet.error) throw activeSheet.error;

  return {
    admin, organizationId, opportunityId, workbookId, sheetId,
    url: `/app/leads-clients/opportunities/${slug}/pricing-worksheet/${workbookId}?sheetId=${sheetId}`,
    cleanup: async () => {
      await admin.from("opportunity_pricing_worksheets").delete().eq("organization_id", organizationId).eq("id", workbookId);
      await admin.from("organization_opportunities").delete().eq("organization_id", organizationId).eq("id", opportunityId);
      await admin.from("organization_clients").delete().eq("organization_id", organizationId).eq("id", clientId);
    },
  };
}

test("formula inspection and editing follow the shared spreadsheet interaction contract", async ({ page }) => {
  const fixture = await seedDisposablePricingWorksheet();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await ensureSupplierInvoiceLoggedIn(page, "http://127.0.0.1:3007");

  try {
    await page.goto(fixture.url);
    const formulaBar = page.getByTestId("pricing-worksheet-formula-bar");
    const formulaCell = page.locator('[data-worksheet-cell="C1"]');

    await expect(formulaCell).toBeVisible();
    await page.screenshot({ path: ".tmp/pricing-worksheet-baseline.png", fullPage: true });
    await formulaCell.click();
    await expect(formulaBar).toHaveValue("=A1+B1");
    await expect(page.locator('[data-formula-reference="true"]')).toHaveCount(0);

    await formulaCell.dblclick({ position: { x: 42, y: 15 } });
    await expect(formulaCell).toHaveAttribute("data-editing", "true");
    await expect(page.locator('[data-worksheet-cell="A1"]')).toHaveAttribute("data-formula-reference", "true");
    await expect(page.locator('[data-worksheet-cell="B1"]')).toHaveAttribute("data-formula-reference", "true");

    const inlineEditor = formulaCell.locator("input");
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

    await page.locator('[data-worksheet-cell="D1"]').click();
    await page.locator('[data-worksheet-cell="D1"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
    await expect(page.getByTestId("pricing-worksheet-copy-mode")).toBeVisible();
    await expect(page.locator('[data-worksheet-cell="D1"] [data-worksheet-copy-outline="true"]')).toHaveCount(1);
    await page.locator('[data-worksheet-cell="H3"]').click();
    await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>('[role="grid"][aria-label="Pricing worksheet"]');
      if (!surface) throw new Error("Worksheet surface not found");
      const data = new DataTransfer();
      data.setData("text/plain", "=B1*C1");
      surface.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await expect(page.locator('[data-worksheet-cell="H3"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("pricing-worksheet-copy-mode")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pricing-worksheet-copy-mode")).toHaveCount(0);
    await page.locator('[data-worksheet-cell="H3"]').click();
    await expect(formulaBar).toHaveValue("=F3*G3");

    const d1Box = await page.locator('[data-worksheet-cell="D1"]').boundingBox();
    const f1Box = await page.locator('[data-worksheet-cell="F1"]').boundingBox();
    if (!d1Box || !f1Box) throw new Error("Worksheet fixture cells are not measurable");
    await page.mouse.move(d1Box.x + d1Box.width / 2, d1Box.y + d1Box.height / 2);
    await page.mouse.down();
    await page.mouse.move(f1Box.x + f1Box.width / 2, f1Box.y + f1Box.height / 2);
    await page.mouse.up();
    await expect(page.locator('[data-worksheet-cell="F1"]')).toHaveAttribute("aria-selected", "true");
    await page.locator('[data-worksheet-cell="D1"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
    await page.locator('[data-worksheet-cell="H1"]').click();
    await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>('[role="grid"][aria-label="Pricing worksheet"]');
      if (!surface) throw new Error("Worksheet surface not found");
      const data = new DataTransfer();
      data.setData("text/plain", "=B1*C1\t=B1*$C$1\t=$B1*C$1");
      surface.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await expect(page.locator('[data-worksheet-cell="J1"]')).toHaveAttribute("aria-selected", "true");
    await page.locator('[data-worksheet-cell="H1"]').click();
    await expect(formulaBar).toHaveValue("=F1*G1");
    await page.keyboard.press("Control+z");
    await expect(formulaBar).toHaveValue("");
    await page.keyboard.press("Control+Shift+z");
    await page.locator('[data-worksheet-cell="H1"]').click();
    await expect(formulaBar).toHaveValue("=F1*G1");

    await page.locator('[data-worksheet-cell="D1"]').click();
    await page.locator('[data-worksheet-cell="D1"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
    await page.locator('[data-worksheet-cell="D2"]').click();
    await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>('[role="grid"][aria-label="Pricing worksheet"]');
      if (!surface) throw new Error("Worksheet surface not found");
      const data = new DataTransfer();
      data.setData("text/plain", "=B1*C1");
      surface.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await expect(page.locator('[data-worksheet-cell="D2"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-worksheet-cell="D2"]')).toHaveAttribute("data-editing", "false");
    await expect(page.locator('[data-worksheet-cell="D2"] [data-worksheet-cell-display-text="true"]')).toHaveCSS("font-weight", "700");
    await expect(page.locator('[data-worksheet-cell="D2"] [data-worksheet-cell-display-text="true"]')).toHaveCSS("font-style", "italic");
    await expect(page.locator('[data-worksheet-cell="D2"] [data-worksheet-cell-display-text="true"]')).toHaveCSS("color", "rgb(220, 38, 38)");

    await page.locator('[data-worksheet-cell="C1"]').click();
    await page.keyboard.press("F2");
    await expect(page.locator('[data-worksheet-cell="C1"]')).toHaveAttribute("data-editing", "true");
    await page.locator('[data-worksheet-cell="C1"] input').press("Escape");
    await expect(page.locator('[data-worksheet-cell="C1"]')).toHaveAttribute("data-editing", "false");

    await page.locator('[data-worksheet-cell="D1"]').click();
    await page.locator('[data-worksheet-cell="D1"] button[aria-label="Fill handle"]').dragTo(page.locator('[data-worksheet-cell="D2"]'));
    await expect(page.locator('[data-worksheet-cell="D1"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-worksheet-cell="D2"]')).toHaveAttribute("aria-selected", "true");

    await page.locator('[data-worksheet-cell="D1"]').click();
    await page.locator('[data-worksheet-cell="D1"] button[aria-label="Fill handle"]').dragTo(page.locator('[data-worksheet-cell="E1"]'));
    await page.locator('[data-worksheet-cell="E1"]').click();
    await expect(formulaBar).toHaveValue("=C1*D1");

    await page.locator('[data-worksheet-cell="E2"]').click();
    await page.locator('[data-worksheet-cell="E2"] button[aria-label="Fill handle"]').dragTo(page.locator('[data-worksheet-cell="E1"]'));
    await page.locator('[data-worksheet-cell="E1"]').click();
    await expect(formulaBar).toHaveValue("=B1*$C$1");

    await page.locator('[data-worksheet-cell="E2"]').click();
    await page.locator('[data-worksheet-cell="E2"] button[aria-label="Fill handle"]').dragTo(page.locator('[data-worksheet-cell="D2"]'));
    await page.locator('[data-worksheet-cell="D2"]').click();
    await expect(formulaBar).toHaveValue("=A2*$C$1");
    await page.screenshot({ path: ".tmp/pricing-worksheet-after-interactions.png", fullPage: true });
    await page.keyboard.press("Escape");
    await page.locator('[data-worksheet-cell="A1"]').click();
    await page.screenshot({ path: ".tmp/pricing-worksheet-settled.png", fullPage: true });
  } finally {
    await fixture.cleanup();
  }
});
