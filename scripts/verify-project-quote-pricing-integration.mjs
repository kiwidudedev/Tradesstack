import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.PROJECT_QUOTE_VERIFY_BASE_URL ?? "http://127.0.0.1:3000";
const authState = process.env.PROJECT_QUOTE_VERIFY_AUTH_STATE ?? ".tmp/playwright/auth/supplier-invoice-user.json";
const persistentProfile = process.env.PROJECT_QUOTE_VERIFY_PROFILE ?? null;
const acceptedQuoteId = process.env.PROJECT_QUOTE_VERIFY_ACCEPTED_QUOTE_ID ?? "5d4e1db4-5294-41f9-95fa-3aab762146d3";
const projectSlug = process.env.PROJECT_QUOTE_VERIFY_PROJECT_SLUG ?? "jackson-russell";
const continuationId = process.env.PROJECT_QUOTE_VERIFY_WORKBOOK_ID ?? "35e078c3-2da9-0e66-aaf2-25343c076c96";
const loginEmail = process.env.PROJECT_QUOTE_VERIFY_EMAIL ?? null;
const loginPassword = process.env.PROJECT_QUOTE_VERIFY_PASSWORD ?? null;
const verificationOrganizationId = process.env.PROJECT_QUOTE_VERIFY_ORGANIZATION_ID ?? null;
const verificationSheetId = process.env.PROJECT_QUOTE_VERIFY_SHEET_ID ?? "sheet-preserved";
const screenshotDir = ".tmp/project-quote-pricing-verification";

await mkdir(screenshotDir, { recursive: true });
const browser = persistentProfile ? null : await chromium.launch({ channel: "chrome", headless: true });
const context = persistentProfile
  ? await chromium.launchPersistentContext(persistentProfile, {
      channel: "chrome",
      headless: true,
      locale: "en-NZ",
      timezoneId: "Pacific/Auckland",
      viewport: { width: 1440, height: 1000 },
      args: ["--profile-directory=Profile 2"],
    })
  : await browser.newContext({
      storageState: authState,
      locale: "en-NZ",
      timezoneId: "Pacific/Auckland",
      viewport: { width: 1440, height: 1000 },
    });
const page = context.pages()[0] ?? await context.newPage();

async function goto(pathname) {
  const targetUrl = `${baseUrl}${pathname}`;
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) throw error;
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  }
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  if (page.url().includes("/login") && loginEmail && loginPassword) {
    await page.getByLabel("Work email*").fill(loginEmail);
    await page.getByLabel("Password*").fill(loginPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/app/"), { timeout: 30_000 });
    if (!persistentProfile) await context.storageState({ path: authState });
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  }
  if (page.url().includes("/login")) throw new Error("Browser verification authentication expired.");
}

async function findNoQuoteProjectSlug() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let projectQuery = client.from("organization_projects")
    .select("id,slug,source_opportunity_id")
    .not("source_opportunity_id", "is", null)
    .limit(500);
  let quoteQuery = client.from("project_quotes").select("project_id").limit(5000);
  if (verificationOrganizationId) {
    projectQuery = projectQuery.eq("organization_id", verificationOrganizationId);
    quoteQuery = quoteQuery.eq("organization_id", verificationOrganizationId);
  }
  const [{ data: projects, error: projectError }, { data: quotes, error: quoteError }] = await Promise.all([
    projectQuery,
    quoteQuery,
  ]);
  if (projectError || quoteError) return null;
  const quotedProjects = new Set((quotes ?? []).map((quote) => quote.project_id));
  for (const project of (projects ?? []).filter((candidate) => !quotedProjects.has(candidate.id))) {
    const { data: compatibility, error } = await client.rpc("resolve_project_lifecycle_v1", {
      p_organization_id: verificationOrganizationId ?? undefined,
      p_project_id: project.id,
    });
    const row = Array.isArray(compatibility) ? compatibility[0] : compatibility;
    if (!error && row?.is_valid === true && row?.is_visible === true) return project.slug;
  }
  return null;
}

const result = {};
try {
  await goto(`/app/projects/${projectSlug}/preconstruction/quote`);
  result.rootResolver = { url: page.url(), usedQuoteIdRoute: /\/quote\/[0-9a-f-]{36}$/.test(new URL(page.url()).pathname) };

  await goto(`/app/projects/${projectSlug}/preconstruction/quote/${acceptedQuoteId}`);
  result.acceptedDetails = {
    quotationPrimaryLinks: await page.getByRole("link", { name: "Quotation", exact: true }).count(),
    standalonePricingPrimaryLinks: await page.getByRole("link", { name: "Pricing Worksheets", exact: true }).count(),
    quoteDetailsTabs: await page.getByRole("link", { name: "Quote Details", exact: true }).count(),
    pricingWorksheetTabs: await page.getByRole("link", { name: "Pricing Worksheet", exact: true }).count(),
    acceptedLockedMessage: await page.getByText("This accepted tender revision is locked as award evidence.", { exact: false }).count(),
  };
  await page.screenshot({ path: `${screenshotDir}/accepted-quote-details.png`, fullPage: true });

  await goto(`/app/projects/${projectSlug}/preconstruction/quote/${acceptedQuoteId}/pricing-worksheet`);
  result.acceptedPricing = {
    newWorksheetButtons: await page.getByRole("button", { name: "New Worksheet", exact: true }).count(),
    worksheetNameHeaders: await page.getByRole("columnheader", { name: "Worksheet name", exact: true }).count(),
    tradeHeaders: await page.getByRole("columnheader", { name: "Trade/package", exact: true }).count(),
    updatedHeaders: await page.getByRole("columnheader", { name: "Last updated", exact: true }).count(),
    actionHeaders: await page.getByRole("columnheader", { name: "Actions", exact: true }).count(),
    registerRows: await page.locator("tbody tr").count(),
  };
  await page.screenshot({ path: `${screenshotDir}/accepted-project-working-pricing.png`, fullPage: true });

  await goto(`/app/projects/${projectSlug}/preconstruction/pricing-worksheet?sheetId=${verificationSheetId}`);
  result.legacyRegisterRedirect = { url: page.url(), preservedSheetId: new URL(page.url()).searchParams.get("sheetId") };

  await goto(`/app/projects/${projectSlug}/preconstruction/pricing-worksheet/${continuationId}?sheetId=${verificationSheetId}`);
  result.legacyDeepRedirect = { url: page.url(), preservedSheetId: new URL(page.url()).searchParams.get("sheetId") };
  result.overlay = { dialogs: await page.getByRole("dialog").count() };

  await page.evaluate(() => window.sessionStorage.clear());
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(`/app/projects/${projectSlug}/preconstruction/quote/${acceptedQuoteId}/pricing-worksheet`);
  result.mobile = {
    quoteDetailsTabVisible: await page.getByRole("link", { name: "Quote Details", exact: true }).isVisible(),
    pricingTabVisible: await page.getByRole("link", { name: "Pricing Worksheet", exact: true }).isVisible(),
    newWorksheetVisible: await page.getByRole("button", { name: "New Worksheet", exact: true }).isVisible(),
  };
  await page.screenshot({ path: `${screenshotDir}/mobile-project-working-pricing.png`, fullPage: true });

  const noQuoteSlug = await findNoQuoteProjectSlug();
  if (noQuoteSlug) {
    await goto(`/app/projects/${noQuoteSlug}/preconstruction/quote`);
    result.noQuote = { slug: noQuoteSlug, url: page.url(), resolvedToNew: page.url().includes("/quote/new") };
  } else {
    result.noQuote = { skipped: "No visible Project fixture with opportunity lineage and zero quotes." };
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser?.close();
}
