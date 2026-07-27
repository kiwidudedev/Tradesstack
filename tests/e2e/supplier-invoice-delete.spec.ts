import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSupplierInvoiceDocumentStoragePath,
  SUPPLIER_INVOICE_DOCUMENTS_BUCKET,
} from "../../lib/supplier-invoices";
import type { Database } from "../../lib/supabase/types";
import {
  countSupplierInvoiceStorageObjects,
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const fixturePdfPath = join(
  process.cwd(),
  "tests/fixtures/supplier-invoices/TradeSupplier_Invoice_OCR_Test.pdf",
);

type AdminClient = ReturnType<typeof createE2EAdminClient>;

type SupplierInvoiceFixture = {
  invoiceId: string;
  invoiceNumber: string;
  documentId: string;
  storagePath: string;
  lineId: string;
};

const envCache = new Map<string, string>();

function loadEnvValue(key: string) {
  if (envCache.has(key)) {
    return envCache.get(key)!;
  }

  const envPath = join(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const candidateKey = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    envCache.set(candidateKey, value);
  }

  const value = envCache.get(key);
  if (!value) {
    throw new Error(`Missing ${key} in .env.local`);
  }
  return value;
}

async function createAuthenticatedSupplierInvoiceClient() {
  const url = loadEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = loadEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const context = await ensureSupplierInvoiceE2EContext();
  const client = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email: context.email,
    password: context.password,
  });
  if (error) {
    throw error;
  }

  return client;
}

async function resetDeletionVerificationState(admin: AdminClient, organizationId: string) {
  const { data: documents, error: documentsError } = await admin
    .from("supplier_invoice_documents")
    .select("file_path")
    .eq("organization_id", organizationId);
  if (documentsError) {
    throw documentsError;
  }

  const storagePaths = (documents ?? [])
    .map((document) => document.file_path)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (storagePaths.length > 0) {
    const { error: storageError } = await admin
      .storage
      .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
      .remove(storagePaths);
    if (storageError) {
      throw storageError;
    }
  }

  for (const table of [
    "organization_accounting_documents",
    "project_actual_cost_events",
    "supplier_invoice_document_extractions",
    "supplier_invoice_activity_events",
    "supplier_invoice_purchase_order_matches",
    "supplier_invoice_line_allocations",
    "supplier_invoice_site_review_decisions",
    "supplier_invoice_accounts_approvals",
    "supplier_invoice_site_review_submissions",
    "supplier_invoice_commercial_variances",
    "supplier_invoice_commercial_line_snapshots",
    "supplier_invoice_commercial_approvals",
    "supplier_invoice_approval_steps",
    "supplier_invoice_documents",
    "supplier_invoice_lines",
    "supplier_invoices",
    "organization_xero_connections",
    "organization_projects",
  ] as const) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("organization_id", organizationId);
    if (error) {
      throw error;
    }
  }
}

async function ensureProject(admin: AdminClient, organizationId: string, userId: string) {
  const existing = await admin
    .from("organization_projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", "supplier-invoice-delete-e2e")
    .maybeSingle();
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data?.id) {
    return existing.data.id;
  }

  const inserted = await admin
    .from("organization_projects")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      name: "Supplier Invoice Delete E2E Project",
      slug: "supplier-invoice-delete-e2e",
      project_code: "SIDEL-E2E",
      stage: "Planning",
      location: "Auckland",
    })
    .select("id")
    .single();
  if (inserted.error) {
    throw inserted.error;
  }
  return inserted.data.id;
}

async function ensureXeroConnection(admin: AdminClient, organizationId: string, userId: string) {
  const existing = await admin
    .from("organization_xero_connections")
    .select("id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data?.id) {
    return existing.data.id;
  }

  const inserted = await admin
    .from("organization_xero_connections")
    .insert({
      organization_id: organizationId,
      connected_by_user_id: userId,
      status: "connected",
      tenant_id: `tenant-${organizationId}`,
      tenant_name: "Delete Verification Tenant",
      tenant_type: "ORGANISATION",
      tenant_connection_id: `tenant-connection-${organizationId}`,
      xero_user_id: `xero-user-${userId}`,
      scope: ["accounting.transactions"],
      available_tenants_json: [],
      last_health_status: "healthy",
    })
    .select("id")
    .single();
  if (inserted.error) {
    throw inserted.error;
  }
  return inserted.data.id;
}

async function createSupplierInvoiceFixture(params: {
  admin: AdminClient;
  organizationId: string;
  supplierId: string;
  userId: string;
  invoiceNumber: string;
  includeExtraction?: boolean;
  status?: string;
}) {
  const invoiceId = randomUUID();
  const documentId = randomUUID();
  const lineId = randomUUID();
  const storagePath = buildSupplierInvoiceDocumentStoragePath({
    organizationId: params.organizationId,
    supplierInvoiceId: invoiceId,
    documentId,
    fileName: "TradeSupplier_Invoice_OCR_Test.pdf",
  });

  const pdfBytes = readFileSync(fixturePdfPath);
  const { error: uploadError } = await params.admin
    .storage
    .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    throw uploadError;
  }

  const invoiceInsert = await params.admin
    .from("supplier_invoices")
    .insert({
      id: invoiceId,
      organization_id: params.organizationId,
      created_by: params.userId,
      supplier_id: params.supplierId,
      invoice_number: params.invoiceNumber,
      supplier_po_reference: "26028-PO-09",
      supplier_po_reference_normalized: "26028PO09",
      invoice_date: "2026-07-19",
      due_date: "2026-08-20",
      currency: "NZD",
      subtotal: 1593.9,
      tax_total: 239.09,
      total: 1832.99,
      source: "upload",
      status: params.status ?? "Needs Review",
      notes: "Delete verification fixture",
      document_file_path: storagePath,
      document_file_name: "TradeSupplier_Invoice_OCR_Test.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: pdfBytes.byteLength,
    })
    .select("id")
    .single();
  if (invoiceInsert.error) {
    throw invoiceInsert.error;
  }

  const lineInsert = await params.admin
    .from("supplier_invoice_lines")
    .insert({
      id: lineId,
      organization_id: params.organizationId,
      supplier_invoice_id: invoiceId,
      description: "92mm 1.15 DHT Track 3000mm",
      quantity: 110,
      unit_price: 8.99,
      line_total: 988.9,
      tax_amount: 0,
      sort_order: 1,
      supplier_item_code: "TRK92115",
      supplier_description: "92mm 1.15 DHT Track 3000mm",
      import_source: "e2e-delete-fixture",
    })
    .select("id")
    .single();
  if (lineInsert.error) {
    throw lineInsert.error;
  }

  const documentInsert = await params.admin
    .from("supplier_invoice_documents")
    .insert({
      id: documentId,
      organization_id: params.organizationId,
      supplier_invoice_id: invoiceId,
      file_path: storagePath,
      file_name: "TradeSupplier_Invoice_OCR_Test.pdf",
      mime_type: "application/pdf",
      size_bytes: pdfBytes.byteLength,
      document_type: "invoice",
      uploaded_by: params.userId,
      is_current: true,
    })
    .select("id")
    .single();
  if (documentInsert.error) {
    throw documentInsert.error;
  }

  const activityInsert = await params.admin
    .from("supplier_invoice_activity_events")
    .insert({
      organization_id: params.organizationId,
      supplier_invoice_id: invoiceId,
      event_type: "created",
      message: `Supplier Invoice ${params.invoiceNumber} created for delete verification.`,
      metadata: {},
      created_by: params.userId,
    });
  if (activityInsert.error) {
    throw activityInsert.error;
  }

  if (params.includeExtraction ?? true) {
    const extractionInsert = await params.admin
      .from("supplier_invoice_document_extractions")
      .insert({
        organization_id: params.organizationId,
        supplier_invoice_id: invoiceId,
        supplier_invoice_document_id: documentId,
        status: "completed",
        requested_by: params.userId,
        schema_version: "supplier-invoice-extraction-v1",
        idempotency_key: `delete-fixture-${invoiceId}`,
        provider: "openai",
        model: "gpt-5.5-mini",
        attempt_number: 1,
        extracted_payload_json: {
          header: {
            invoiceNumber: params.invoiceNumber,
          },
        },
        warnings_json: [],
      });
    if (extractionInsert.error) {
      throw extractionInsert.error;
    }
  }

  return {
    invoiceId,
    invoiceNumber: params.invoiceNumber,
    documentId,
    storagePath,
    lineId,
  } satisfies SupplierInvoiceFixture;
}

async function getDeleteDependencyCounts(admin: AdminClient, invoiceId: string) {
  const count = async (table: string) => {
    const result = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("supplier_invoice_id", invoiceId);
    if (result.error) {
      throw result.error;
    }
    return result.count ?? 0;
  };

  return {
    invoices: await count("supplier_invoices"),
    lines: await count("supplier_invoice_lines"),
    documents: await count("supplier_invoice_documents"),
    extractions: await count("supplier_invoice_document_extractions"),
    activityEvents: await count("supplier_invoice_activity_events"),
    matches: await count("supplier_invoice_purchase_order_matches"),
    allocations: await count("supplier_invoice_line_allocations"),
    approvalSteps: await count("supplier_invoice_approval_steps"),
    accountsApprovals: await count("supplier_invoice_accounts_approvals"),
    siteReviewSubmissions: await count("supplier_invoice_site_review_submissions"),
    commercialApprovals: await count("supplier_invoice_commercial_approvals"),
    commercialLineSnapshots: await count("supplier_invoice_commercial_line_snapshots"),
    commercialVariances: await count("supplier_invoice_commercial_variances"),
  };
}

async function getSiteDecisionCount(admin: AdminClient, invoiceId: string) {
  const result = await admin
    .from("supplier_invoice_site_review_decisions")
    .select("*", { count: "exact", head: true })
    .eq("supplier_invoice_id", invoiceId);
  if (result.error) {
    throw result.error;
  }
  return result.count ?? 0;
}

async function openDeleteDialog(page: Page) {
  await page.getByLabel("Supplier invoice actions").click();
  await page.getByRole("menuitem", { name: "Delete invoice" }).click();
}

test.describe("Supplier Invoice deletion RPC", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const context = await ensureSupplierInvoiceE2EContext();
    const admin = createE2EAdminClient();
    await resetDeletionVerificationState(admin, context.organizationId);
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
  });

  test("deletes an allowed Supplier Invoice and cleans up invoice rows plus storage", async ({
    page,
    baseURL,
  }) => {
    const context = await ensureSupplierInvoiceE2EContext();
    const admin = createE2EAdminClient();
    const fixture = await createSupplierInvoiceFixture({
      admin,
      organizationId: context.organizationId,
      supplierId: context.supplierId,
      userId: context.userId,
      invoiceNumber: "DEL-E2E-ALLOW-001",
    });

    const detailUrl = `${baseURL}/app/company/supplier-invoices/${fixture.invoiceId}`;
    await page.goto(detailUrl);

    await expect(page.getByRole("heading", { name: "Invoice DEL-E2E-ALLOW-001" })).toBeVisible();
    await expect(page.getByLabel("Supplier invoice actions")).toBeVisible();

    await openDeleteDialog(page);
    await expect(page.getByRole("heading", { name: "Delete Supplier Invoice DEL-E2E-ALLOW-001?" })).toBeVisible();
    await expect(page.getByText(/permanently removes its line items, Purchase Order match, uploaded PDF, and review history/i)).toBeVisible();

    await page.getByRole("button", { name: "Delete Invoice" }).click();

    await expect(page).toHaveURL(/\/app\/company\/supplier-invoices$/);
    await expect(page.getByRole("heading", { name: "Supplier Invoices" })).toBeVisible();

    await expect.poll(async () => {
      const { data, error } = await admin
        .from("supplier_invoices")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("id", fixture.invoiceId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    }).toBeNull();

    await expect.poll(async () => getDeleteDependencyCounts(admin, fixture.invoiceId)).toEqual({
      invoices: 0,
      lines: 0,
      documents: 0,
      extractions: 0,
      activityEvents: 0,
      matches: 0,
      allocations: 0,
      approvalSteps: 0,
      accountsApprovals: 0,
      siteReviewSubmissions: 0,
      commercialApprovals: 0,
      commercialLineSnapshots: 0,
      commercialVariances: 0,
    });
    await expect.poll(async () => getSiteDecisionCount(admin, fixture.invoiceId)).toBe(0);
    await expect.poll(async () => countSupplierInvoiceStorageObjects(context.organizationId, fixture.invoiceId)).toBe(0);

    const response = await page.goto(detailUrl);
    expect(response?.status()).toBe(404);
  });

  test("blocks deletion when posted actual costs exist", async ({ page, baseURL }) => {
    const context = await ensureSupplierInvoiceE2EContext();
    const admin = createE2EAdminClient();
    const fixture = await createSupplierInvoiceFixture({
      admin,
      organizationId: context.organizationId,
      supplierId: context.supplierId,
      userId: context.userId,
      invoiceNumber: "DEL-E2E-POSTED-001",
    });
    const projectId = await ensureProject(admin, context.organizationId, context.userId);

    const actualCostInsert = await admin
      .from("project_actual_cost_events")
      .insert({
        organization_id: context.organizationId,
        project_id: projectId,
        event_date: "2026-07-19",
        event_status: "posted",
        event_type: "posting",
        posting_source: "supplier_invoice",
        source_type: "supplier_invoice_allocation",
        source_reference: fixture.invoiceNumber,
        supplier_id: context.supplierId,
        supplier_invoice_id: fixture.invoiceId,
        supplier_invoice_line_id: fixture.lineId,
        amount: 1593.9,
        tax_amount: 239.09,
        total_amount: 1832.99,
      });
    if (actualCostInsert.error) {
      throw actualCostInsert.error;
    }

    await page.goto(`${baseURL}/app/company/supplier-invoices/${fixture.invoiceId}`);
    await expect(page.getByLabel("Supplier invoice actions")).toBeVisible();

    await openDeleteDialog(page);
    await page.getByRole("button", { name: "Delete Invoice" }).click();

    await expect(page.getByText(
      "This invoice cannot be deleted because it has posted actual costs. Reverse those costs before deleting the invoice.",
    )).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${fixture.invoiceId}$`));

    const { data, error } = await admin
      .from("supplier_invoices")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("id", fixture.invoiceId)
      .single();
    if (error) {
      throw error;
    }
    expect(data.id).toBe(fixture.invoiceId);
  });

  test("hides delete for Xero-linked invoices and the RPC still blocks exported and paid Bills", async ({
    page,
    baseURL,
  }) => {
    const context = await ensureSupplierInvoiceE2EContext();
    const admin = createE2EAdminClient();
    const connectionId = await ensureXeroConnection(admin, context.organizationId, context.userId);
    const exportedFixture = await createSupplierInvoiceFixture({
      admin,
      organizationId: context.organizationId,
      supplierId: context.supplierId,
      userId: context.userId,
      invoiceNumber: "DEL-E2E-XERO-EXPORTED-001",
    });
    const paidFixture = await createSupplierInvoiceFixture({
      admin,
      organizationId: context.organizationId,
      supplierId: context.supplierId,
      userId: context.userId,
      invoiceNumber: "DEL-E2E-XERO-PAID-001",
    });

    const exportedDocInsert = await admin
      .from("organization_accounting_documents")
      .insert({
        organization_id: context.organizationId,
        accounting_connection_id: connectionId,
        provider: "xero",
        tenant_id: `tenant-${context.organizationId}`,
        local_document_type: "supplier_invoice",
        local_document_id: exportedFixture.invoiceId,
        export_status: "exported",
        external_document_id: `xero-bill-${exportedFixture.invoiceId}`,
        external_document_number: "XBILL-EXPORTED-001",
        normalized_external_status: "awaiting_payment",
        raw_external_status: "AUTHORISED",
        amount_exported: 1832.99,
        tax_exported: 239.09,
        amount_paid: 0,
        amount_due: 1832.99,
        currency_code: "NZD",
        exported_by: context.userId,
        exported_at: new Date().toISOString(),
      });
    if (exportedDocInsert.error) {
      throw exportedDocInsert.error;
    }

    const paidDocInsert = await admin
      .from("organization_accounting_documents")
      .insert({
        organization_id: context.organizationId,
        accounting_connection_id: connectionId,
        provider: "xero",
        tenant_id: `tenant-${context.organizationId}`,
        local_document_type: "supplier_invoice",
        local_document_id: paidFixture.invoiceId,
        export_status: "exported",
        external_document_id: `xero-bill-${paidFixture.invoiceId}`,
        external_document_number: "XBILL-PAID-001",
        normalized_external_status: "paid",
        raw_external_status: "PAID",
        amount_exported: 1832.99,
        tax_exported: 239.09,
        amount_paid: 1832.99,
        amount_due: 0,
        currency_code: "NZD",
        exported_by: context.userId,
        exported_at: new Date().toISOString(),
        fully_paid_at: new Date().toISOString(),
      });
    if (paidDocInsert.error) {
      throw paidDocInsert.error;
    }

    await page.goto(`${baseURL}/app/company/supplier-invoices/${exportedFixture.invoiceId}`);
    await expect(page.getByLabel("Supplier invoice actions")).toHaveCount(0);

    const authenticatedClient = await createAuthenticatedSupplierInvoiceClient();

    const exportedDelete = await authenticatedClient.rpc("delete_supplier_invoice", {
      p_organization_id: context.organizationId,
      p_supplier_invoice_id: exportedFixture.invoiceId,
    });
    expect(exportedDelete.error?.message).toBe(
      "This Supplier Invoice cannot be deleted because it has already been exported to Xero.",
    );

    const paidDelete = await authenticatedClient.rpc("delete_supplier_invoice", {
      p_organization_id: context.organizationId,
      p_supplier_invoice_id: paidFixture.invoiceId,
    });
    expect(paidDelete.error?.message).toBe(
      "This Supplier Invoice cannot be deleted because a payment has been recorded against its Xero Bill.",
    );
  });
});
