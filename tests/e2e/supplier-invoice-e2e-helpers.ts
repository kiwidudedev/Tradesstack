import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FullConfig, Page } from "@playwright/test";
import { SUPPLIER_INVOICE_DOCUMENTS_BUCKET } from "../../lib/supplier-invoices";
import type { Database } from "../../lib/supabase/types";

type AdminClient = SupabaseClient<Database>;

type E2EContext = {
  organizationId: string;
  supplierId: string;
  userId: string;
  email: string;
  password: string;
};

const E2E_EMAIL = "supplier-invoice-e2e@tradesstack.local";
const E2E_PASSWORD = "TradesstackE2E!234";
const E2E_ORG_NAME = "Supplier Invoice E2E Org";
const E2E_DISPLAY_NAME = "Supplier Invoice E2E";
const MATCHED_SUPPLIER_NAME = "TRADE BUILD SUPPLY";
const MATCHED_SUPPLIER_TAX_NUMBER = "98-765-432";

let envLoaded = false;
let cachedContext: E2EContext | null = null;

function loadLocalEnv() {
  if (envLoaded) {
    return;
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

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  envLoaded = true;
}

function createAdminClient() {
  loadLocalEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment for Playwright Supplier Invoice tests.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createE2EAdminClient() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function listSupplierInvoiceStoragePaths(
  organizationId: string,
  invoiceId?: string,
) {
  const admin = createE2EAdminClient();
  const bucket = admin.storage.from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET);

  if (invoiceId) {
    const folderPath = `${organizationId}/supplier-invoices/${invoiceId}`;
    const { data, error } = await bucket.list(folderPath, { limit: 100 });
    if (error) {
      throw error;
    }

    return (data ?? [])
      .filter((item) => !item.id?.endsWith("/") && item.name)
      .map((item) => `${folderPath}/${item.name}`);
  }

  const orgRoot = `${organizationId}/supplier-invoices`;
  const { data: folders, error: folderError } = await bucket.list(orgRoot, { limit: 100 });
  if (folderError) {
    throw folderError;
  }

  const allPaths: string[] = [];
  for (const folder of folders ?? []) {
    if (!folder.name) {
      continue;
    }

    const invoiceFolder = `${orgRoot}/${folder.name}`;
    const { data: files, error: filesError } = await bucket.list(invoiceFolder, { limit: 100 });
    if (filesError) {
      throw filesError;
    }

    for (const file of files ?? []) {
      if (!file.name) {
        continue;
      }
      allPaths.push(`${invoiceFolder}/${file.name}`);
    }
  }

  return allPaths;
}

async function findUserByEmail(admin: AdminClient, email: string) {
  let page = 1;
  const target = email.toLowerCase();

  while (page <= 5) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw error;
    }

    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === target);
    if (match) {
      return match;
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

async function waitForMembership(admin: AdminClient, userId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await admin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.organization_id) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}

async function ensureSupplier(admin: AdminClient, organizationId: string, userId: string) {
  const existing = await admin
    .from("organization_suppliers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("company_name", MATCHED_SUPPLIER_NAME)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data?.id) {
    const { error } = await admin
      .from("organization_suppliers")
      .update({
        name: MATCHED_SUPPLIER_NAME,
        company_name: MATCHED_SUPPLIER_NAME,
        tax_number: MATCHED_SUPPLIER_TAX_NUMBER,
        is_active: true,
      })
      .eq("id", existing.data.id);

    if (error) {
      throw error;
    }

    return existing.data.id;
  }

  const inserted = await admin
    .from("organization_suppliers")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      name: MATCHED_SUPPLIER_NAME,
      company_name: MATCHED_SUPPLIER_NAME,
      tax_number: MATCHED_SUPPLIER_TAX_NUMBER,
      is_active: true,
    })
    .select("id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  return inserted.data.id;
}

export async function countSupplierInvoiceStorageObjects(
  organizationId: string,
  invoiceId?: string,
) {
  const paths = await listSupplierInvoiceStoragePaths(organizationId, invoiceId);
  return paths.length;
}

export async function resetSupplierInvoiceOrgState(organizationId: string) {
  const admin = createE2EAdminClient();
  const storagePaths = await listSupplierInvoiceStoragePaths(organizationId);
  if (storagePaths.length > 0) {
    const { error } = await admin.storage
      .from(SUPPLIER_INVOICE_DOCUMENTS_BUCKET)
      .remove(storagePaths);
    if (error) {
      throw error;
    }
  }

  const { error: deleteInvoicesError } = await admin
    .from("supplier_invoices")
    .delete()
    .eq("organization_id", organizationId);

  if (deleteInvoicesError) {
    throw deleteInvoicesError;
  }
}

export async function ensureSupplierInvoiceE2EContext(): Promise<E2EContext> {
  if (cachedContext) {
    return cachedContext;
  }

  const admin = createAdminClient();
  let user = await findUserByEmail(admin, E2E_EMAIL);

  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: E2E_DISPLAY_NAME,
        organization_name: E2E_ORG_NAME,
      },
    });

    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Unable to create Supplier Invoice E2E user.");
    }

    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: E2E_DISPLAY_NAME,
        organization_name: E2E_ORG_NAME,
      },
    });
    if (updated.error) {
      throw updated.error;
    }
  }

  let member = await waitForMembership(admin, user.id);
  let organizationId = member?.organization_id ?? null;

  if (!organizationId) {
    const createdOrganization = await admin
      .from("organizations")
      .insert({
        name: E2E_ORG_NAME,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (createdOrganization.error) {
      throw createdOrganization.error;
    }

    organizationId = createdOrganization.data.id;

    const insertedMember = await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: user.id,
      role: "admin",
      display_name: E2E_DISPLAY_NAME,
    });

    if (insertedMember.error) {
      throw insertedMember.error;
    }

    member = { organization_id: organizationId, role: "admin" };
  }

  const { error: memberUpdateError } = await admin
    .from("organization_members")
    .update({
      role: "admin",
      display_name: E2E_DISPLAY_NAME,
    })
    .eq("organization_id", organizationId)
    .eq("user_id", user.id);

  if (memberUpdateError) {
    throw memberUpdateError;
  }

  const supplierId = await ensureSupplier(admin, organizationId, user.id);
  await resetSupplierInvoiceOrgState(organizationId);

  cachedContext = {
    organizationId,
    supplierId,
    userId: user.id,
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  };

  return cachedContext;
}

export async function ensureSupplierInvoiceLoggedIn(page: Page, baseURL: string) {
  const context = await ensureSupplierInvoiceE2EContext();
  await page.goto(`${baseURL}/app/company/supplier-invoices`);

  if (!page.url().includes("/login")) {
    return context;
  }

  await page.getByLabel("Work email*").fill(context.email);
  await page.getByLabel("Password*").fill(context.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app\//);

  if (!page.url().includes("/app/company/supplier-invoices")) {
    await page.goto(`${baseURL}/app/company/supplier-invoices`);
  }

  return context;
}

export async function buildSupplierInvoiceAuthState(config: FullConfig) {
  const context = await ensureSupplierInvoiceE2EContext();
  const authDir = join(process.cwd(), ".tmp/playwright/auth");
  mkdirSync(authDir, { recursive: true });
  const storageStatePath = join(authDir, "supplier-invoice-user.json");
  const baseURL = config.projects[0]?.use?.baseURL;

  if (typeof baseURL !== "string" || !baseURL) {
    throw new Error("Missing Playwright baseURL for Supplier Invoice auth setup.");
  }

  return {
    ...context,
    baseURL,
    storageStatePath,
  };
}
