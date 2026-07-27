import { chromium, type FullConfig } from "@playwright/test";
import {
  buildSupplierInvoiceAuthState,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

async function globalSetup(config: FullConfig) {
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
