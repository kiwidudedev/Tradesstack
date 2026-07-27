import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  countSupplierInvoiceStorageObjects,
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
  resetSupplierInvoiceOrgState,
} from "./supplier-invoice-e2e-helpers";

const realFixturePath = join(
  process.cwd(),
  "tests/fixtures/supplier-invoices/TradeSupplier_Invoice_OCR_Test.pdf",
);
const providerFallbackFixturePath = join(
  process.cwd(),
  "tests/fixtures/supplier-invoices/TradeSupplier_Invoice_OCR_Test_provider_fallback.pdf",
);
const corruptFixturePath = join(
  process.cwd(),
  "tests/fixtures/supplier-invoices/Corrupt_Supplier_Invoice_Test.pdf",
);

async function openNewSupplierInvoiceModal(page: Page) {
  await page.getByRole("button", { name: "New Supplier Invoice" }).click();
  await expect(page.getByRole("heading", { name: "New Supplier Invoice" })).toBeVisible();
}

function formatCookieSnapshot(
  cookies: Awaited<ReturnType<BrowserContext["cookies"]>>,
) {
  return cookies
    .map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      valuePreview: cookie.value.slice(0, 16),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function invoiceCountForNumber(organizationId: string, invoiceNumber: string) {
  const admin = createE2EAdminClient();
  const { data, error } = await admin
    .from("supplier_invoices")
    .select("id, document_file_path, document_file_name, source, invoice_number")
    .eq("organization_id", organizationId)
    .eq("invoice_number", invoiceNumber);
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function getInvoiceDocumentState(organizationId: string, supplierInvoiceId: string) {
  const admin = createE2EAdminClient();

  const [documentsResult, extractionResult, invoiceResult, lineResult] = await Promise.all([
    admin
      .from("supplier_invoice_documents")
      .select("id, file_path, file_name, is_current, supplier_invoice_id")
      .eq("organization_id", organizationId)
      .eq("supplier_invoice_id", supplierInvoiceId),
    admin
      .from("supplier_invoice_document_extractions")
      .select("id, supplier_invoice_id")
      .eq("organization_id", organizationId)
      .eq("supplier_invoice_id", supplierInvoiceId),
    admin
      .from("supplier_invoices")
      .select("id, source, document_file_path, document_file_name, supplier_id, invoice_number, invoice_date, due_date, subtotal, tax_total, total")
      .eq("organization_id", organizationId)
      .eq("id", supplierInvoiceId)
      .single(),
    admin
      .from("supplier_invoice_lines")
      .select("id, description, supplier_item_code, quantity, unit_price, line_total, tax_amount, sort_order")
      .eq("organization_id", organizationId)
      .eq("supplier_invoice_id", supplierInvoiceId)
      .order("sort_order", { ascending: true }),
  ]);

  if (documentsResult.error) {
    throw documentsResult.error;
  }
  if (extractionResult.error) {
    throw extractionResult.error;
  }
  if (invoiceResult.error) {
    throw invoiceResult.error;
  }
  if (lineResult.error) {
    throw lineResult.error;
  }

  return {
    documents: documentsResult.data ?? [],
    extractions: extractionResult.data ?? [],
    invoice: invoiceResult.data,
    lines: lineResult.data ?? [],
  };
}

test.describe("Supplier Invoice modal upload flow", () => {
  test.beforeAll(async () => {
    await ensureSupplierInvoiceE2EContext();
  });

  test.beforeEach(async ({ page, baseURL }) => {
    const context = await ensureSupplierInvoiceE2EContext();
    await resetSupplierInvoiceOrgState(context.organizationId);
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
  });

  test("extracts the readable PDF, keeps values editable, creates once, and persists the document", async ({
    page,
    baseURL,
  }, testInfo) => {
    const context = await ensureSupplierInvoiceE2EContext();
    const navigationTrace: string[] = [];
    const consoleTrace: string[] = [];
    const requestFailureTrace: string[] = [];
    const detailResponses = new Map<string, number>();

    page.on("console", (message) => {
      consoleTrace.push(`${new Date().toISOString()} [${message.type()}] ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      requestFailureTrace.push(
        `${new Date().toISOString()} ${request.method()} ${request.url()} failed: ${request.failure()?.errorText ?? "unknown"}`,
      );
    });
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("/api/supplier-invoices/create")
        || url.includes("/app/company/supplier-invoices")
        || url.includes("/login")
        || url.includes("/app/dashboard")
      ) {
        navigationTrace.push(`${new Date().toISOString()} -> ${request.method()} ${url}`);
      }
    });
    page.on("response", (response) => {
      const url = response.url();
      if (
        url.includes("/api/supplier-invoices/create")
        || url.includes("/app/company/supplier-invoices")
        || url.includes("/login")
        || url.includes("/app/dashboard")
      ) {
        navigationTrace.push(
          `${new Date().toISOString()} <- ${response.status()} ${response.request().method()} ${url}`,
        );
      }
      if (/\/app\/company\/supplier-invoices\/[0-9a-f-]+$/.test(url)) {
        detailResponses.set(url, response.status());
      }
    });

    await openNewSupplierInvoiceModal(page);

    const manualEntry = page.locator("#new-supplier-invoice-manual-entry");
    await expect(manualEntry).toBeHidden();

    const invoiceBeforeCreate = await invoiceCountForNumber(context.organizationId, "INV-26028-091");
    expect(invoiceBeforeCreate).toHaveLength(0);
    await expect.poll(() => countSupplierInvoiceStorageObjects(context.organizationId)).toBe(0);

    const fileInput = page.locator('input[type="file"][accept="application/pdf,.pdf"]');
    await fileInput.setInputFiles(realFixturePath);

    await expect(page.getByText("TradeSupplier_Invoice_OCR_Test.pdf")).toBeVisible();
    await expect(page.locator('iframe[title="TradeSupplier_Invoice_OCR_Test.pdf"]')).toBeVisible();
    await expect(page.getByText(/Uploading invoice|Reading invoice|Invoice details extracted/i)).toBeVisible();
    await expect(manualEntry).toBeVisible();

    await expect(page.locator("#supplier-id")).toHaveValue(context.supplierId);
    await expect(page.locator("#invoice-number")).toHaveValue("INV-26028-091");
    await expect(page.locator("#supplier-po-reference")).toHaveValue("26028-PO-09");
    await expect(page.locator("#invoice-date")).toHaveValue("2026-07-19");
    await expect(page.locator("#due-date")).toHaveValue("2026-08-20");
    await expect(page.locator("#subtotal")).toHaveValue("1593.90");
    await expect(page.locator("#tax-total")).toHaveValue("239.09");
    await expect(page.locator("#invoice-total")).toHaveValue("1832.99");
    await expect(page.getByText("Inferred from the invoice payment terms.")).toBeVisible();
    await expect(page.locator('input[value="92mm 1.15 DHT Track 3000mm"]')).toBeVisible();
    await expect(page.locator('input[value="92mm 0.75 BMT Track 3000mm"]')).toBeVisible();
    await expect(page.locator('input[value="TRK92115"]')).toBeVisible();
    await expect(page.locator('input[value="TRK92075"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "View Source" })).toHaveCount(2);

    await page.locator("#invoice-number").fill("INV-26028-091-EDIT");
    await expect(page.locator("#invoice-number")).toHaveValue("INV-26028-091-EDIT");
    await page.locator("#invoice-number").fill("INV-26028-091");
    await page.locator("#invoice-total").fill("1833.99");
    await expect(page.locator("#invoice-total")).toHaveValue("1833.99");
    await page.locator("#invoice-total").fill("1832.99");
    await page.getByRole("button", { name: "Add Item" }).click();
    await expect(page.getByRole("button", { name: "Remove line 3" })).toBeVisible();
    await page.getByRole("button", { name: "Remove line 3" }).click();

    await expect.poll(() => countSupplierInvoiceStorageObjects(context.organizationId)).toBe(0);

    const cookiesBeforeCreate = formatCookieSnapshot(await page.context().cookies([baseURL!]));
    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/supplier-invoices/create"),
    );
    const createClickTimestamp = new Date().toISOString();
    await page.getByRole("button", { name: "Create Supplier Invoice" }).click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();
    navigationTrace.push(
      `${new Date().toISOString()} create-click=${createClickTimestamp} create-response-status=${createResponse.status()} body=${createResponseBody}`,
    );

    let urlExpectationError: Error | null = null;
    try {
      await expect(page).toHaveURL(/\/app\/company\/supplier-invoices\/[0-9a-f-]+$/);
    } catch (error) {
      urlExpectationError = error as Error;
    }

    const cookiesAfterCreate = formatCookieSnapshot(await page.context().cookies());
    const diagnosticsPath = testInfo.outputPath("post-create-navigation-trace.json");
    writeFileSync(
      diagnosticsPath,
      JSON.stringify(
        {
          baseURL,
          createClickTimestamp,
          createResponseUrl: createResponse.url(),
          createResponseStatus: createResponse.status(),
          createResponseBody,
          finalUrl: page.url(),
          detailResponses: Array.from(detailResponses.entries()).map(([url, status]) => ({ url, status })),
          cookiesBeforeCreate,
          cookiesAfterCreate,
          navigationTrace,
          consoleTrace,
          requestFailureTrace,
        },
        null,
        2,
      ),
    );
    await testInfo.attach("post-create-navigation-trace", {
      path: diagnosticsPath,
      contentType: "application/json",
    });

    if (urlExpectationError) {
      throw urlExpectationError;
    }

    const invoiceUrl = new URL(page.url());
    const supplierInvoiceId = invoiceUrl.pathname.split("/").at(-1)!;

    await page.reload();
    await expect(page.getByRole("heading", { name: "Invoice Capture" })).toBeVisible();
    await expect(page.locator('input[value="INV-26028-091"]')).toHaveCount(1);
    await expect(page.locator('input[value="26028-PO-09"]')).toHaveCount(1);
    await expect(page.locator('input[value="2026-07-19"]')).toHaveCount(1);
    await expect(page.locator('input[value="2026-08-20"]')).toHaveCount(1);
    await expect(page.locator('input[value="1593.90"]')).toHaveCount(1);
    await expect(page.locator('input[value="239.09"]')).toHaveCount(1);
    await expect(page.locator('input[value="1832.99"]')).toHaveCount(1);
    await expect(page.getByText("Source")).toBeVisible();
    await expect(page.getByText("Upload")).toBeVisible();
    await expect(page.getByText("TradeSupplier_Invoice_OCR_Test.pdf")).toBeVisible();

    const invoiceRows = await invoiceCountForNumber(context.organizationId, "INV-26028-091");
    expect(invoiceRows).toHaveLength(1);

    const documentState = await getInvoiceDocumentState(context.organizationId, supplierInvoiceId);
    expect(documentState.documents).toHaveLength(1);
    expect(documentState.documents.filter((document) => document.is_current)).toHaveLength(1);
    expect(documentState.extractions).toHaveLength(0);
    expect(documentState.invoice.source).toBe("upload");
    expect(documentState.invoice.document_file_path).toBe(documentState.documents[0]?.file_path ?? null);
    expect(documentState.invoice.document_file_name).toBe("TradeSupplier_Invoice_OCR_Test.pdf");
    expect(documentState.invoice.supplier_id).toBe(context.supplierId);
    expect(documentState.lines).toHaveLength(2);
    expect(documentState.lines[0]).toMatchObject({
      description: "92mm 1.15 DHT Track 3000mm",
      supplier_item_code: "TRK92115",
      quantity: 110,
      unit_price: 8.99,
      line_total: 1137.24,
      tax_amount: 148.34,
      sort_order: 0,
    });
    expect(documentState.lines[1]).toMatchObject({
      description: "92mm 0.75 BMT Track 3000mm",
      supplier_item_code: "TRK92075",
      quantity: 110,
      unit_price: 5.5,
      line_total: 695.75,
      tax_amount: 90.75,
      sort_order: 1,
    });

    await expect.poll(() => countSupplierInvoiceStorageObjects(context.organizationId, supplierInvoiceId)).toBe(1);

    const screenshotPath = testInfo.outputPath("supplier-invoice-success.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("supplier-invoice-success", {
      path: screenshotPath,
      contentType: "image/png",
    });
  });

  test("preserves readable header values when provider enrichment fails", async ({ page }) => {
    await openNewSupplierInvoiceModal(page);
    await page.locator('input[type="file"][accept="application/pdf,.pdf"]').setInputFiles(providerFallbackFixturePath);

    await expect(page.locator("#new-supplier-invoice-manual-entry")).toBeVisible();
    await expect(page.locator('iframe[title="TradeSupplier_Invoice_OCR_Test_provider_fallback.pdf"]')).toBeVisible();
    await expect(page.locator("#invoice-number")).toHaveValue("INV-26028-091");
    await expect(page.locator("#supplier-po-reference")).toHaveValue("26028-PO-09");
    await expect(page.locator("#invoice-date")).toHaveValue("2026-07-19");
    await expect(page.locator("#due-date")).toHaveValue("2026-08-20");
    await expect(page.locator("#subtotal")).toHaveValue("1593.90");
    await expect(page.locator("#tax-total")).toHaveValue("239.09");
    await expect(page.locator("#invoice-total")).toHaveValue("1832.99");
    await expect(page.getByText("Readable invoice values were preserved, but provider enrichment was unavailable. Review extracted line details carefully.")).toBeVisible();
    await expect(page.getByText("Inferred from the invoice payment terms.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Supplier Invoice" })).toBeEnabled();
  });

  test("fails safely for a corrupt PDF and keeps manual entry usable", async ({ page }) => {
    const context = await ensureSupplierInvoiceE2EContext();
    await openNewSupplierInvoiceModal(page);
    await page.locator('input[type="file"][accept="application/pdf,.pdf"]').setInputFiles(corruptFixturePath);

    await expect(page.locator("#new-supplier-invoice-manual-entry")).toBeVisible();
    await expect(page.getByText("We couldn’t read this invoice automatically.")).toBeVisible();
    await expect(page.getByText("Corrupt_Supplier_Invoice_Test.pdf")).toBeVisible();

    await page.locator("#supplier-id").selectOption(context.supplierId);
    await page.locator("#invoice-number").fill("MANUAL-CORRUPT-001");
    await page.locator("#invoice-date").fill("2026-07-18");
    await page.locator("#due-date").fill("2026-08-18");
    await page.locator("#subtotal").fill("100.00");
    await page.locator("#tax-total").fill("15.00");
    await page.locator("#invoice-total").fill("115.00");
    await expect(page.getByRole("button", { name: "Create Supplier Invoice" })).toBeEnabled();

    const invoiceRows = await invoiceCountForNumber(context.organizationId, "MANUAL-CORRUPT-001");
    expect(invoiceRows).toHaveLength(0);
  });

  test("protects typed values until the user chooses whether to apply extracted values", async ({ page }) => {
    await openNewSupplierInvoiceModal(page);
    await page.getByRole("button", { name: "Enter manually" }).click();
    await expect(page.locator("#new-supplier-invoice-manual-entry")).toBeVisible();

    await page.locator("#invoice-number").fill("MANUAL-KEEP-001");
    await page.locator("#invoice-total").fill("999.99");
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByLabel("Line 1 description").fill("My manual line");
    await page.locator('input[type="file"][accept="application/pdf,.pdf"]').setInputFiles(realFixturePath);

    await expect(page.getByText("Use extracted details?")).toBeVisible();
    await expect(page.locator("#invoice-number")).toHaveValue("MANUAL-KEEP-001");
    await expect(page.locator("#invoice-total")).toHaveValue("999.99");
    await expect(page.getByLabel("Line 1 description")).toHaveValue("My manual line");

    await page.getByRole("button", { name: "Keep my current review" }).click();
    await expect(page.locator("#invoice-number")).toHaveValue("MANUAL-KEEP-001");
    await expect(page.locator("#invoice-total")).toHaveValue("999.99");
    await expect(page.getByLabel("Line 1 description")).toHaveValue("My manual line");

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('input[type="file"][accept="application/pdf,.pdf"]').setInputFiles(realFixturePath);
    await expect(page.getByText("Use extracted details?")).toBeVisible();
    await expect(page.locator("#invoice-number")).toHaveValue("MANUAL-KEEP-001");
    await expect(page.locator("#invoice-total")).toHaveValue("999.99");
    await expect(page.getByLabel("Line 1 description")).toHaveValue("My manual line");

    await page.getByRole("button", { name: "Replace with extracted values" }).click();
    await expect(page.locator("#invoice-number")).toHaveValue("INV-26028-091");
    await expect(page.locator("#invoice-total")).toHaveValue("1832.99");
    await expect(page.locator('input[value="92mm 1.15 DHT Track 3000mm"]')).toBeVisible();
  });
});
