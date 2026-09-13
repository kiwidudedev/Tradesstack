import { chromium } from "@playwright/test";

const baseUrl = process.env.JACKSON_VERIFY_BASE_URL ?? "http://127.0.0.1:3001";
const authState = process.env.JACKSON_VERIFY_AUTH_STATE ?? ".tmp/playwright/auth/supplier-invoice-user.json";
const persistentProfile = process.env.JACKSON_VERIFY_PROFILE ?? null;
const acceptedId = "5d4e1db4-5294-41f9-95fa-3aab762146d3";
const legacyP1Id = "effe5574-0d5c-4000-4251-165d55fbb724";
const rootPath = "/app/projects/jackson-russell/preconstruction/quote";

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
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  if (page.url().includes("/login")) throw new Error("Browser verification authentication expired.");
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const result = {};
try {
  await goto(rootPath);
  result.root = {
    url: page.url(),
    acceptedNumberCount: await page.getByText("Q-26020-4", { exact: true }).count(),
    acceptedStatusCount: await page.getByText("Accepted", { exact: true }).count(),
    legacyNumberCount: await page.getByText("Q-26020-4-P1", { exact: true }).count(),
  };
  requireCondition(new URL(result.root.url).pathname.endsWith(`/quote/${acceptedId}`), "Root quote did not resolve to the accepted quote ID.");
  requireCondition(result.root.acceptedNumberCount >= 1, "Accepted quote number is not rendered.");
  requireCondition(result.root.acceptedStatusCount >= 1, "Accepted status is not rendered.");
  requireCondition(result.root.legacyNumberCount === 0, "Legacy P1 is rendered on the canonical accepted route.");

  const quotationTrigger = page.getByRole("button", { name: "Quotation", exact: true });
  requireCondition(await quotationTrigger.count() === 1, "Quotation dropdown trigger is unavailable.");
  await quotationTrigger.click();
  const pricingLink = page.getByRole("menuitem", { name: "Pricing Worksheet", exact: true });
  requireCondition(await pricingLink.count() === 1, "Pricing Worksheet dropdown item is unavailable.");
  await pricingLink.click();
  await page.waitForURL(`${baseUrl}${rootPath}/${acceptedId}/pricing-worksheet`, { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  result.pricingWorksheet = {
    url: page.url(),
    headingCount: await page.getByRole("heading", { name: "Pricing Worksheets", exact: true }).count(),
    newWorksheetCount: await page.getByRole("button", { name: "New Worksheet", exact: true }).count(),
    registerRows: await page.locator("tbody tr").count(),
  };
  requireCondition(result.pricingWorksheet.headingCount === 1, "Project pricing worksheet register did not open.");
  requireCondition(result.pricingWorksheet.newWorksheetCount === 1, "Project pricing worksheet register is not editable.");

  await goto(rootPath);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  result.hardRefresh = { url: page.url(), accepted: await page.getByText("Accepted", { exact: true }).count() };
  requireCondition(new URL(result.hardRefresh.url).pathname.endsWith(`/quote/${acceptedId}`), "Hard refresh changed the canonical quote.");

  await goto("/app/projects/jackson-russell/dashboard");
  await goto(rootPath);
  result.navigateAwayAndBack = { url: page.url(), accepted: await page.getByText("Accepted", { exact: true }).count() };
  requireCondition(new URL(result.navigateAwayAndBack.url).pathname.endsWith(`/quote/${acceptedId}`), "Returning to Quotation changed the canonical quote.");

  await goto(`${rootPath}/${legacyP1Id}`);
  result.directLegacyP1 = {
    url: page.url(),
    legacyNumberCount: await page.getByText("Q-26020-4-P1", { exact: true }).count(),
    draftStatusCount: await page.getByText("Draft", { exact: true }).count(),
  };
  requireCondition(result.directLegacyP1.legacyNumberCount >= 1, "Direct legacy P1 route no longer renders P1.");
  requireCondition(result.directLegacyP1.draftStatusCount >= 1, "Direct legacy P1 route no longer renders Draft status.");

  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser?.close();
}
