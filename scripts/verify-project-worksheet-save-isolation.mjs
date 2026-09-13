import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.PROJECT_QUOTE_VERIFY_BASE_URL ?? "http://127.0.0.1:3000";
const organizationId = process.env.PROJECT_QUOTE_VERIFY_ORGANIZATION_ID;
const projectId = process.env.PROJECT_QUOTE_VERIFY_PROJECT_ID;
const projectSlug = process.env.PROJECT_QUOTE_VERIFY_PROJECT_SLUG;
const quoteId = process.env.PROJECT_QUOTE_VERIFY_QUOTE_ID;
const opportunityId = process.env.PROJECT_QUOTE_VERIFY_OPPORTUNITY_ID;
const email = process.env.PROJECT_QUOTE_VERIFY_EMAIL;
const password = process.env.PROJECT_QUOTE_VERIFY_PASSWORD;
const actorId = process.env.PROJECT_QUOTE_VERIFY_ACTOR_ID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (![organizationId, projectId, projectSlug, quoteId, opportunityId, email, password, actorId, supabaseUrl, serviceRoleKey].every(Boolean)) {
  throw new Error("Project worksheet save verification environment is incomplete.");
}
const supabaseHost = new URL(supabaseUrl).hostname;
if (supabaseHost !== "127.0.0.1" && supabaseHost !== "localhost") {
  throw new Error(`Disposable worksheet save verification is local-only; refused Supabase host ${supabaseHost}.`);
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function sourceSnapshot() {
  const [{ data: workbooks, error: workbookError }, { data: sheets, error: sheetError }] = await Promise.all([
    admin.from("opportunity_pricing_worksheets")
      .select("id,worksheet_data,pricing_summary,extracted_pricing_data,version,updated_at")
      .eq("organization_id", organizationId)
      .eq("opportunity_id", opportunityId)
      .is("project_id", null)
      .is("quote_id", null)
      .is("variation_id", null)
      .is("archived_at", null)
      .order("id"),
    admin.from("opportunity_pricing_workbook_sheets")
      .select("id,workbook_id,worksheet_data,pricing_summary,extracted_pricing_data,version,updated_at")
      .eq("organization_id", organizationId)
      .eq("opportunity_id", opportunityId)
      .order("id"),
  ]);
  if (workbookError || sheetError) throw workbookError ?? sheetError;
  const sourceIds = new Set((workbooks ?? []).map((row) => row.id));
  return hash({ workbooks, sheets: (sheets ?? []).filter((row) => sourceIds.has(row.workbook_id)) });
}

const sourceBefore = await sourceSnapshot();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  storageState: process.env.PROJECT_QUOTE_VERIFY_AUTH_STATE ?? ".tmp/playwright/auth/supplier-invoice-user.json",
  locale: "en-NZ",
  timezoneId: "Pacific/Auckland",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
let createdWorkbookId = null;

try {
  const registerUrl = `${baseUrl}/app/projects/${projectSlug}/preconstruction/quote/${quoteId}/pricing-worksheet`;
  await page.goto(registerUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (page.url().includes("/login")) {
    await page.getByLabel("Work email*").fill(email);
    await page.getByLabel("Password*").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/app/"), { timeout: 30_000 });
    await page.goto(registerUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  }

  const createButton = page.getByRole("button", { name: "New Worksheet", exact: true });
  if (await createButton.count() !== 1) throw new Error("Expected one New Worksheet button.");
  await createButton.click();

  const disposableRow = page.getByRole("row").filter({ hasText: "New Worksheet" });
  await disposableRow.waitFor({ state: "visible", timeout: 30_000 });
  if (await disposableRow.count() !== 1) throw new Error("Expected one newly created disposable worksheet row.");
  await disposableRow.click();
  await page.waitForURL((url) => /\/pricing-worksheet\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 30_000 });
  createdWorkbookId = new URL(page.url()).pathname.split("/").at(-1);

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  const formulaInput = dialog.getByPlaceholder("Enter a value or formula", { exact: true });
  await formulaInput.fill("=1+2");
  const saveButton = dialog.getByRole("button", { name: "Save", exact: true });
  if (await saveButton.count() !== 1) throw new Error("Expected one worksheet Save button.");
  await saveButton.click();
  await dialog.getByText("Last saved", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  const reloadedDialog = page.getByRole("dialog");
  await reloadedDialog.waitFor({ state: "visible", timeout: 30_000 });
  const reloadedFormula = await reloadedDialog.getByPlaceholder("Enter a value or formula", { exact: true }).getAttribute("value");

  const { data: workbook, error: workbookError } = await admin
    .from("opportunity_pricing_worksheets")
    .select("id,organization_id,opportunity_id,project_id,quote_id,variation_id,worksheet_data")
    .eq("organization_id", organizationId)
    .eq("id", createdWorkbookId)
    .single();
  if (workbookError) throw workbookError;
  const sourceAfter = await sourceSnapshot();

  console.log(JSON.stringify({
    workbookId: createdWorkbookId,
    persistedFormula: reloadedFormula,
    databaseContainsFormula: JSON.stringify(workbook.worksheet_data).includes("=1+2"),
    ownership: {
      organizationId: workbook.organization_id,
      opportunityId: workbook.opportunity_id,
      projectId: workbook.project_id,
      quoteId: workbook.quote_id,
      variationId: workbook.variation_id,
    },
    opportunitySourceHashBefore: sourceBefore,
    opportunitySourceHashAfter: sourceAfter,
    opportunitySourceUnchanged: sourceBefore === sourceAfter,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  if (createdWorkbookId) {
    const { error } = await admin.from("opportunity_pricing_worksheets")
      .update({ archived_at: new Date().toISOString(), updated_by: actorId })
      .eq("organization_id", organizationId)
      .eq("opportunity_id", opportunityId)
      .eq("project_id", projectId)
      .eq("id", createdWorkbookId);
    if (error) console.error(`Disposable worksheet cleanup failed: ${error.message}`);
  }
}
