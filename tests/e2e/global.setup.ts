import { chromium, type FullConfig } from "@playwright/test";
import { Client } from "pg";
import {
  buildSupplierInvoiceAuthState,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";
import {
  announceLocalE2ETarget,
  assertRequiredCommercialE2EMigrations,
} from "./test-target-guard";

async function assertLocalMigrationState() {
  const client = new Client({
    host: "127.0.0.1",
    port: 54322,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });
  await client.connect();
  try {
    const result = await client.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations",
    );
    assertRequiredCommercialE2EMigrations(result.rows.map((row) => row.version));
  } finally {
    await client.end();
  }
}

async function globalSetup(config: FullConfig) {
  announceLocalE2ETarget();
  await assertLocalMigrationState();
  const authState = await buildSupplierInvoiceAuthState(config);
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const page = await browser.newPage();

  try {
    await ensureSupplierInvoiceLoggedIn(page, authState.baseURL);
    await page.context().storageState({
      path: authState.storageStatePath,
    });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
