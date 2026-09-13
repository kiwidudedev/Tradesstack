import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const admin = createE2EAdminClient();
const suffix = randomUUID().slice(0, 8);
const opportunityId = randomUUID();
const projectId = randomUUID();
const workspaceProjectId = randomUUID();
const acceptedQuoteId = randomUUID();
const manifestId = randomUUID();
const legacyOpportunityId = randomUUID();
const legacyProjectId = randomUUID();
const legacyWorkspaceProjectId = randomUUID();
const legacyAcceptedQuoteId = randomUUID();
const legacyManifestId = randomUUID();

function deterministicAutomaticDraftId(id: string) {
  const hex = createHash("md5").update(`${id}:working-quote`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const legacyDraftId = deterministicAutomaticDraftId(legacyManifestId);
let organizationId = "";
let userId = "";

test.beforeAll(async () => {
  const context = await ensureSupplierInvoiceE2EContext();
  organizationId = context.organizationId;
  userId = context.userId;
  const now = new Date().toISOString();

  const { error: opportunityError } = await admin.from("organization_opportunities").insert([
    {
      id: opportunityId, organization_id: organizationId, created_by: userId, owner_user_id: userId,
      name: `Explicit Revision ${suffix}`, slug: `explicit-revision-${suffix}`,
      opportunity_code: `ER-${suffix}`, stage: "Won",
    },
    {
      id: legacyOpportunityId, organization_id: organizationId, created_by: userId, owner_user_id: userId,
      name: `Legacy Auto Draft ${suffix}`, slug: `legacy-auto-draft-${suffix}`,
      opportunity_code: `LA-${suffix}`, stage: "Won",
    },
  ]);
  if (opportunityError) throw opportunityError;

  const { error: projectError } = await admin.from("organization_projects").insert([
    {
      id: workspaceProjectId, organization_id: organizationId, created_by: userId,
      name: `Explicit Workspace ${suffix}`, slug: `explicit-workspace-${suffix}`,
      project_code: `ERW${suffix}`, source_opportunity_id: opportunityId,
    },
    {
      id: projectId, organization_id: organizationId, created_by: userId,
      name: `Explicit Revision ${suffix}`, slug: `explicit-revision-${suffix}`,
      project_code: `ER${suffix}`, source_opportunity_id: opportunityId,
    },
    {
      id: legacyWorkspaceProjectId, organization_id: organizationId, created_by: userId,
      name: `Legacy Workspace ${suffix}`, slug: `legacy-workspace-${suffix}`,
      project_code: `LAW${suffix}`, source_opportunity_id: legacyOpportunityId,
    },
    {
      id: legacyProjectId, organization_id: organizationId, created_by: userId,
      name: `Legacy Auto Draft ${suffix}`, slug: `legacy-auto-draft-${suffix}`,
      project_code: `LA${suffix}`, source_opportunity_id: legacyOpportunityId,
    },
  ]);
  if (projectError) throw projectError;
  const { error: opportunityLineageError } = await admin.from("organization_opportunities").upsert([
    {
      id: opportunityId, organization_id: organizationId, created_by: userId, owner_user_id: userId,
      name: `Explicit Revision ${suffix}`, slug: `explicit-revision-${suffix}`,
      opportunity_code: `ER-${suffix}`, stage: "Won", workspace_project_id: workspaceProjectId,
      converted_project_id: projectId,
    },
    {
      id: legacyOpportunityId, organization_id: organizationId, created_by: userId, owner_user_id: userId,
      name: `Legacy Auto Draft ${suffix}`, slug: `legacy-auto-draft-${suffix}`,
      opportunity_code: `LA-${suffix}`, stage: "Won", workspace_project_id: legacyWorkspaceProjectId,
      converted_project_id: legacyProjectId,
    },
  ]);
  if (opportunityLineageError) throw opportunityLineageError;

  const quoteBase = {
    organization_id: organizationId,
    created_by: userId,
    quote_title: "Accepted Commercial Record",
    status: "Accepted",
    revision_kind: "tender",
    revision_number: 1,
    revision_created_at: now,
    revision_created_by: userId,
    award_locked_at: now,
    award_locked_reason: "opportunity_award",
    created_at: now,
    updated_at: now,
  };
  const { error: quoteError } = await admin.from("project_quotes").insert([
    {
      ...quoteBase, id: acceptedQuoteId, project_id: projectId,
      originating_opportunity_id: opportunityId, source_opportunity_id: opportunityId,
      quote_number: `Q-ER-${suffix}`,
    },
    {
      ...quoteBase, id: legacyAcceptedQuoteId, project_id: legacyProjectId,
      originating_opportunity_id: legacyOpportunityId, source_opportunity_id: legacyOpportunityId,
      quote_number: `Q-LA-${suffix}`,
    },
    {
      ...quoteBase, id: legacyDraftId, project_id: legacyProjectId,
      originating_opportunity_id: legacyOpportunityId, source_opportunity_id: legacyOpportunityId,
      quote_number: `Q-LA-${suffix}-P1`, status: "Draft", revision_kind: "project_working",
      revision_number: 2, predecessor_quote_id: legacyAcceptedQuoteId,
      award_locked_at: null, award_locked_reason: null, created_at: now, updated_at: now,
    },
  ]);
  if (quoteError) throw quoteError;

  const { error: mappingError } = await admin.from("opportunity_final_projects").insert([
    {
      opportunity_id: opportunityId, organization_id: organizationId, project_id: projectId,
      accepted_quote_id: acceptedQuoteId, created_by: userId,
    },
    {
      opportunity_id: legacyOpportunityId, organization_id: organizationId, project_id: legacyProjectId,
      accepted_quote_id: legacyAcceptedQuoteId, created_by: userId,
    },
  ]);
  if (mappingError) throw mappingError;

  const { error: manifestError } = await admin.from("opportunity_award_pricing_manifests").insert([
    {
      id: manifestId, organization_id: organizationId, opportunity_id: opportunityId,
      project_id: projectId, accepted_quote_id: acceptedQuoteId, working_quote_id: null,
      classification: "NO_WORKSHEET", source_workbook_count: 0, worksheet_line_count: 0,
      manual_line_count: 0, quote_subtotal_snapshot: 0, quote_gst_snapshot: 0,
      quote_total_snapshot: 0, created_by: userId, created_at: now,
    },
    {
      id: legacyManifestId, organization_id: organizationId, opportunity_id: legacyOpportunityId,
      project_id: legacyProjectId, accepted_quote_id: legacyAcceptedQuoteId, working_quote_id: legacyDraftId,
      classification: "NO_WORKSHEET", source_workbook_count: 0, worksheet_line_count: 0,
      manual_line_count: 0, quote_subtotal_snapshot: 0, quote_gst_snapshot: 0,
      quote_total_snapshot: 0, created_by: userId, created_at: now,
    },
  ]);
  if (manifestError) throw manifestError;
});

test.afterAll(async () => {
  await admin.from("opportunity_award_pricing_manifests").delete().in("id", [manifestId, legacyManifestId]);
  await admin.from("opportunity_final_projects").delete().in("opportunity_id", [opportunityId, legacyOpportunityId]);
  await admin.from("project_quotes").delete().eq("organization_id", organizationId).in("project_id", [projectId, legacyProjectId]);
  await admin.from("organization_opportunities").delete().eq("organization_id", organizationId).in("id", [opportunityId, legacyOpportunityId]);
  await admin.from("organization_projects").delete().eq("organization_id", organizationId)
    .in("id", [projectId, legacyProjectId, workspaceProjectId, legacyWorkspaceProjectId]);
});

test.beforeEach(async ({ page }, testInfo) => {
  await ensureSupplierInvoiceLoggedIn(page, String(testInfo.project.use.baseURL));
});

test("accepted Project stays canonical until Create Revision is clicked", async ({ page }) => {
  await page.goto(`/app/projects/explicit-revision-${suffix}/preconstruction/quote`);
  await page.waitForURL(new RegExp(`/quote/${acceptedQuoteId}$`));
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();

  const createRevision = page.getByRole("button", { name: "Create Revision" });
  await expect(createRevision).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Quote" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();
  await createRevision.click();
  await page.waitForURL(new RegExp(`/quote/(?!${acceptedQuoteId})[0-9a-f-]+/pricing-worksheet$`));
  await expect(page.getByRole("heading", { name: "Pricing Worksheets", exact: true })).toBeVisible();

  const created = await admin.from("project_quotes")
    .select("id,quote_number,status,predecessor_quote_id")
    .eq("organization_id", organizationId)
    .eq("predecessor_quote_id", acceptedQuoteId)
    .single();
  if (created.error) throw created.error;
  expect(created.data).toMatchObject({
    quote_number: `Q-ER-${suffix}-P1`,
    status: "Draft",
    predecessor_quote_id: acceptedQuoteId,
  });

  await page.goto(`/app/projects/explicit-revision-${suffix}/preconstruction/quote/${acceptedQuoteId}`);
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  const openWorkingRevision = page.getByRole("button", { name: "Open Quote" });
  await expect(openWorkingRevision).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Revision" })).toHaveCount(0);
  await openWorkingRevision.click();
  await page.waitForURL(new RegExp(`/quote/${created.data.id}$`));
  await expect(page.getByRole("heading", { name: `${created.data.quote_number} Draft`, exact: true })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Quote" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();

  await page.goBack();
  await page.waitForURL(new RegExp(`/quote/${acceptedQuoteId}$`));
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
});

test("untouched legacy automatic Draft remains historical when Create Revision produces P2", async ({ page }) => {
  await page.goto(`/app/projects/legacy-auto-draft-${suffix}/preconstruction/quote`);
  await page.waitForURL(new RegExp(`/quote/${legacyAcceptedQuoteId}$`));
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();

  const createRevision = page.getByRole("button", { name: "Create Revision" });
  await expect(createRevision).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Quote" })).toHaveCount(0);
  await createRevision.click();
  await page.waitForURL(new RegExp(`/quote/(?!${legacyAcceptedQuoteId})[0-9a-f-]+/pricing-worksheet$`));
  await expect(page.getByRole("heading", { name: "Pricing Worksheets", exact: true })).toBeVisible();

  const created = await admin.from("project_quotes")
    .select("quote_number,status,revision_number,predecessor_quote_id")
    .eq("organization_id", organizationId)
    .eq("predecessor_quote_id", legacyDraftId)
    .single();
  if (created.error) throw created.error;
  expect(created.data).toMatchObject({
    quote_number: `Q-LA-${suffix}-P2`,
    status: "Draft",
    revision_number: 3,
    predecessor_quote_id: legacyDraftId,
  });
});
