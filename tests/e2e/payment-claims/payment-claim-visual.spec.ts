import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
} from "../supplier-invoice-e2e-helpers";

const PROJECT_ID = randomUUID();
const QUOTE_ID = randomUUID();
const QUOTE_LINE_ID = randomUUID();
const DRAFT_CLAIM_ID = randomUUID();
const SUBMITTED_CLAIM_ID = randomUUID();
const PAID_CLAIM_ID = randomUUID();
const PROJECT_SLUG = `phase-0-payment-claim-visual-${process.pid}`;
const E2E_EMAIL = "supplier-invoice-e2e@tradesstack.local";
const E2E_PASSWORD = "TradesstackE2E!234";

async function setRetentionFixtureState({
  enabled,
  organizationId,
  userId,
}: {
  enabled: boolean;
  organizationId: string;
  userId: string;
}) {
  const admin = createE2EAdminClient();
  // Retention tables are ahead of the currently generated Supabase client types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const now = new Date().toISOString();
  const capability = await db
    .from("organization_capabilities")
    .update({
      enabled,
      enabled_by: enabled ? userId : null,
      enabled_at: enabled ? now : null,
      disabled_by: enabled ? null : userId,
      disabled_at: enabled ? null : now,
    })
    .eq("organization_id", organizationId)
    .eq("capability_key", "retention_management");
  if (capability.error) throw capability.error;

  const workflow = await db
    .from("project_retention_workflow_states")
    .update({
      mode: enabled ? "observe" : "legacy",
      changed_by: userId,
      changed_at: now,
    })
    .eq("project_id", PROJECT_ID)
    .eq("organization_id", organizationId);
  if (workflow.error) throw workflow.error;

  if (enabled) {
    const resetConfirmedClaims = await db
      .from("project_claims")
      .update({ status: "Draft" })
      .eq("organization_id", organizationId)
      .eq("project_id", PROJECT_ID)
      .in("id", [SUBMITTED_CLAIM_ID, PAID_CLAIM_ID]);
    if (resetConfirmedClaims.error) throw resetConfirmedClaims.error;

    const confirmSubmittedClaim = await db
      .from("project_claims")
      .update({ status: "Submitted" })
      .eq("organization_id", organizationId)
      .eq("project_id", PROJECT_ID)
      .eq("id", SUBMITTED_CLAIM_ID);
    if (confirmSubmittedClaim.error) throw confirmSubmittedClaim.error;

    const confirmPaidClaim = await db
      .from("project_claims")
      .update({ status: "Paid" })
      .eq("organization_id", organizationId)
      .eq("project_id", PROJECT_ID)
      .eq("id", PAID_CLAIM_ID);
    if (confirmPaidClaim.error) throw confirmPaidClaim.error;
  }
}

test.beforeAll(async () => {
  const context = await ensureSupplierInvoiceE2EContext();
  const admin = createE2EAdminClient();
  // Payment Claim tables are ahead of the currently generated Supabase client types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const member = await db
    .from("organization_members")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("user_id", context.userId)
    .single();
  if (member.error || !member.data?.id) {
    throw member.error ?? new Error("Unable to resolve the Payment Claim visual fixture member.");
  }
  const permissionOverride = await db.from("member_permission_overrides").upsert({
    organization_member_id: member.data.id,
    permission_key: "accounting.sales_invoices.view",
    is_allowed: false,
    created_by: context.userId,
  }, {
    onConflict: "organization_member_id,permission_key",
  });
  if (permissionOverride.error) throw permissionOverride.error;

  const project = await db.from("organization_projects").insert({
    id: PROJECT_ID,
    organization_id: context.organizationId,
    created_by: context.userId,
    name: "Phase 0 Payment Claim Visual",
    slug: PROJECT_SLUG,
    project_code: "P0-VIS",
    stage: "Construction",
    location: "Auckland",
  });
  if (project.error) throw project.error;

  const quote = await db.from("project_quotes").insert({
    id: QUOTE_ID,
    organization_id: context.organizationId,
    project_id: PROJECT_ID,
    created_by: context.userId,
    quote_title: "Visual source quote",
    quote_number: "Q-P0-VIS",
    status: "Accepted",
    subtotal: 1000,
    total_quote_price: 1150,
    retention_percent_default: 10,
  });
  if (quote.error) throw quote.error;

  const quoteLine = await db.from("project_quote_line_items").insert({
    id: QUOTE_LINE_ID,
    organization_id: context.organizationId,
    project_id: PROJECT_ID,
    quote_id: QUOTE_ID,
    section: "Labour",
    description: "Framing and installation",
    quantity: 1,
    unit: "item",
    rate: 1000,
    total: 1000,
    sort_order: 0,
  });
  if (quoteLine.error) throw quoteLine.error;

  const claims = await db.from("project_claims").insert([
    {
      id: DRAFT_CLAIM_ID,
      organization_id: context.organizationId,
      project_id: PROJECT_ID,
      created_by: context.userId,
      claim_number: "P0-VIS-CL-01",
      claim_title: "Draft framing claim",
      status: "Draft",
      claim_date: "2026-01-01",
      due_date: "2026-01-08",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      percent_complete: 50,
      claim_amount: 500,
      paid_amount: 0,
      linked_quote_value: 1000,
      linked_approved_variations: 0,
      previous_claims_total: 0,
      revised_contract_value: 1000,
      retention_percent: 10,
      retention_withheld_amount: 50,
      retention_released_amount: 0,
      retention_held_to_date: 50,
      retention_released_to_date: 0,
      retention_balance: 50,
      net_claim_excl_gst: 450,
      gst_amount: 67.5,
      total_payable: 517.5,
    },
    {
      id: SUBMITTED_CLAIM_ID,
      organization_id: context.organizationId,
      project_id: PROJECT_ID,
      created_by: context.userId,
      claim_number: "P0-VIS-CL-02",
      claim_title: "Submitted services claim",
      status: "Submitted",
      claim_date: "2026-02-01",
      due_date: "2026-02-08",
      period_start: "2026-02-01",
      period_end: "2026-02-28",
      percent_complete: 75,
      claim_amount: 250,
      paid_amount: 50,
      linked_quote_value: 1000,
      linked_approved_variations: 0,
      previous_claims_total: 500,
      revised_contract_value: 1000,
      retention_percent: 10,
      retention_withheld_amount: 25,
      retention_released_amount: 0,
      retention_held_to_date: 75,
      retention_released_to_date: 0,
      retention_balance: 75,
      net_claim_excl_gst: 225,
      gst_amount: 33.75,
      total_payable: 258.75,
    },
    {
      id: PAID_CLAIM_ID,
      organization_id: context.organizationId,
      project_id: PROJECT_ID,
      created_by: context.userId,
      claim_number: "P0-VIS-CL-03",
      claim_title: "Paid completion claim",
      status: "Paid",
      claim_date: "2026-03-01",
      due_date: "2026-03-08",
      period_start: "2026-03-01",
      period_end: "2026-03-31",
      percent_complete: 100,
      claim_amount: 250,
      paid_amount: 250,
      linked_quote_value: 1000,
      linked_approved_variations: 0,
      previous_claims_total: 750,
      revised_contract_value: 1000,
      retention_percent: 10,
      retention_withheld_amount: 25,
      retention_released_amount: 0,
      retention_held_to_date: 100,
      retention_released_to_date: 0,
      retention_balance: 100,
      net_claim_excl_gst: 225,
      gst_amount: 33.75,
      total_payable: 258.75,
    },
  ]);
  if (claims.error) throw claims.error;

  await setRetentionFixtureState({
    enabled: false,
    organizationId: context.organizationId,
    userId: context.userId,
  });
});

async function waitForStablePage(page: import("@playwright/test").Page) {
  // Supabase keeps background connections alive, so networkidle is not a
  // stable completion signal for these authenticated application routes.
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts.ready);
  const developmentToolbar = page.getByRole("button", { name: "Collapse toolbar" });
  if (await developmentToolbar.isVisible().catch(() => false)) {
    await developmentToolbar.evaluate((button) => {
      const toolbarRoot = button.parentElement;
      if (toolbarRoot) {
        toolbarRoot.style.display = "none";
      }
    });
  }
}

async function gotoAuthenticated(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForTimeout(500);
  const email = page.getByLabel("Work email*");
  if (await email.isVisible().catch(() => false)) {
    await email.fill(E2E_EMAIL);
    await page.getByLabel("Password*").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/app\//);
    await page.goto(path);
  }
  await waitForStablePage(page);
}

test("Payment Claim Register and detail desktop/narrow visuals", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, `/app/projects/${PROJECT_SLUG}/preconstruction/claims`);
  await expect(page.getByText("P0-VIS-CL-01")).toBeVisible();
  await expect(page).toHaveScreenshot("claims-register-desktop.png", { fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForStablePage(page);
  await expect(page.getByText("P0-VIS-CL-01")).toBeVisible();
  await expect(page).toHaveScreenshot("claims-register-narrow.png", { fullPage: true });

  const detailPath = `/app/projects/${PROJECT_SLUG}/preconstruction/claims/${DRAFT_CLAIM_ID}`;
  const detailActionUrl = `**${detailPath}`;
  let releaseXeroReadiness: () => void = () => {};
  const xeroReadinessGate = new Promise<void>((resolve) => {
    releaseXeroReadiness = resolve;
  });
  await page.route(detailActionUrl, async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await xeroReadinessGate;
    }
    await route.continue();
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoAuthenticated(page, detailPath);
  await expect(page.locator('input[value="P0-VIS-CL-01"]')).toBeVisible({ timeout: 60_000 });
  const xeroReadiness = page.getByText("Checking Xero readiness...", { exact: true });
  await expect(xeroReadiness).toBeVisible();
  await expect(page).toHaveScreenshot("payment-claim-detail-desktop.png", { fullPage: true });

  releaseXeroReadiness();
  await expect(xeroReadiness).toBeHidden();
  await page.unroute(detailActionUrl);

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForStablePage(page);
  await expect(page.locator('input[value="P0-VIS-CL-01"]')).toBeVisible();
  await expect(page).toHaveScreenshot("payment-claim-detail-narrow.png", { fullPage: true });
});

test("authorized Retention workspace renders beneath the Payment Claims register", async ({
  page,
}) => {
  const context = await ensureSupplierInvoiceE2EContext();

  try {
    await setRetentionFixtureState({
      enabled: true,
      organizationId: context.organizationId,
      userId: context.userId,
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoAuthenticated(
      page,
      `/app/projects/${PROJECT_SLUG}/preconstruction/claims`,
    );

    const paymentClaimsTable = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Claim #", exact: true }),
    });
    const finalPaymentClaimRow = paymentClaimsTable.getByText(
      "P0-VIS-CL-01",
      { exact: true },
    );
    const retention = page.getByTestId("retention-register");
    await expect(finalPaymentClaimRow).toBeVisible();
    await expect(retention).toBeVisible();
    await expect(
      retention.getByRole("heading", { name: "Retention", exact: true }),
    ).toBeVisible();
    await expect(
      retention.getByText("Current Retention", { exact: true }),
    ).toBeVisible();
    const retentionClaimsTable = retention
      .getByRole("columnheader", { name: "Title", exact: true })
      .locator("xpath=ancestor::table");
    await expect(retentionClaimsTable).toBeVisible();
    await expect(
      retentionClaimsTable.getByRole("columnheader", {
        name: "Origins",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      retentionClaimsTable.getByRole("columnheader", {
        name: "Outstanding",
        exact: true,
      }),
    ).toBeVisible();
    await expect(retentionClaimsTable.getByText("Automatic draft")).toHaveCount(0);
    await expect(retentionClaimsTable.getByText("Totals")).toBeVisible();
    await expect(
      retentionClaimsTable.getByRole("button", { name: "Actions" }),
    ).toBeVisible();
    await expect(
      retention.getByText("Current Retention Claim", { exact: true }),
    ).toHaveCount(0);
    await expect(
      retention.getByText("Open Retention Claim", { exact: true }),
    ).toHaveCount(0);
    const positionDetails = retention.locator("details");
    await expect(positionDetails).toHaveCount(0);
    await expect(
      retention.getByText("Retention position details", { exact: true }),
    ).toHaveCount(0);
    await expect(
      retention.getByRole("button", { name: "Create Draft" }),
    ).toHaveCount(0);

    const retentionFollowsPaymentClaims = await finalPaymentClaimRow.evaluate(
      (claimRow) => {
        const section = document.querySelector(
          '[data-testid="retention-register"]',
        );
        if (!section) return false;
        return (
          section.getBoundingClientRect().top >
          claimRow.getBoundingClientRect().bottom
        );
      },
    );
    expect(retentionFollowsPaymentClaims).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(retentionClaimsTable).toBeVisible();
    const retainsHorizontalOverflow = await retentionClaimsTable.evaluate(
      (table) => {
        const overflow = table.parentElement;
        return Boolean(
          overflow
          && overflow.scrollWidth > overflow.clientWidth
          && getComputedStyle(overflow).overflowX !== "visible",
        );
      },
    );
    expect(retainsHorizontalOverflow).toBe(true);

    const retentionClaimHref = await retentionClaimsTable
      .locator('a[href*="/preconstruction/retention/claims/"]')
      .first()
      .getAttribute("href");
    expect(retentionClaimHref).toBeTruthy();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoAuthenticated(page, retentionClaimHref!);
    const retentionDetail = page.getByTestId("retention-claim-detail");
    await expect(retentionDetail).toBeVisible();
    await expect(
      retentionDetail.getByRole("heading", {
        name: "Claim Workspace",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      retentionDetail.getByRole("heading", {
        name: "Claim Period",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      retentionDetail.getByRole("heading", {
        name: "Retention Claim Lines",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      retentionDetail.getByRole("heading", {
        name: "Retention Claim Summary",
        exact: true,
      }),
    ).toBeVisible();
    const detailLineTable = retentionDetail
      .getByRole("columnheader", { name: "This Claim", exact: true })
      .locator("xpath=ancestor::table");
    await expect(detailLineTable).toBeVisible();
    await expect(
      detailLineTable.getByRole("columnheader", {
        name: "Remaining",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      detailLineTable.getByRole("columnheader", {
        name: "Claim %",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      detailLineTable.getByRole("columnheader", {
        name: "Date",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      detailLineTable.getByRole("columnheader", {
        name: "Eligible",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      detailLineTable.getByRole("button", { name: "Use available" }),
    ).toHaveCount(0);
    await expect(
      detailLineTable.getByRole("button", { name: "Reset" }),
    ).toHaveCount(0);
    const percentageInput = detailLineTable.getByRole("spinbutton", {
      name: "Claim % for P0-VIS-CL-02",
      exact: true,
    });
    await expect(percentageInput).toBeVisible();
    await percentageInput.fill("25");
    const retentionLine = detailLineTable.locator("tr").filter({
      hasText: "P0-VIS-CL-02",
    });
    await expect(retentionLine.getByText("$6.25", { exact: true })).toHaveCount(2);
    await expect(retentionLine.getByText("$18.75", { exact: true })).toBeVisible();
    await percentageInput.fill("");
    await expect(
      retentionDetail.getByRole("button", { name: "Save Claim", exact: true }).first(),
    ).toBeDisabled();
    await percentageInput.fill("0");
    await expect(
      retentionDetail.getByRole("button", { name: "Save Claim", exact: true }).first(),
    ).toBeVisible();
    await expect(
      detailLineTable.getByRole("button", { name: "Save", exact: true }),
    ).toHaveCount(0);
    const auditHistory = retentionDetail
      .getByRole("heading", { name: "Audit History", exact: true })
      .locator("xpath=ancestor::details");
    await expect(auditHistory).not.toHaveAttribute("open", "");
    await expect(page).toHaveScreenshot(
      "retention-claim-detail-draft-desktop.png",
      { fullPage: true },
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await waitForStablePage(page);
    await expect(detailLineTable).toBeVisible();
    const detailRetainsHorizontalOverflow = await detailLineTable.evaluate(
      (table) => {
        const overflow = table.parentElement;
        return Boolean(
          overflow
          && overflow.scrollWidth > overflow.clientWidth
          && getComputedStyle(overflow).overflowX !== "visible",
        );
      },
    );
    expect(detailRetainsHorizontalOverflow).toBe(true);
    await expect(page).toHaveScreenshot(
      "retention-claim-detail-draft-narrow.png",
      { fullPage: true },
    );
  } finally {
    await setRetentionFixtureState({
      enabled: false,
      organizationId: context.organizationId,
      userId: context.userId,
    });
  }
});
