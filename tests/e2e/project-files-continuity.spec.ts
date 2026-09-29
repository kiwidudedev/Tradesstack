import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const creationRequestId = crypto.randomUUID();
let opportunityId = "";
let e2eOrganizationId = "";
let acceptedQuoteId = "";
const directProjectId = crypto.randomUUID();
const runSuffix = Date.now().toString(36);
let opportunitySlug = "";
const directProjectSlug = `phase-4-direct-${runSuffix}`;
const sharedFolder = `Shared Plans ${runSuffix}`;
const nestedFolder = `Issued ${runSuffix}`;
const opportunityFile = `Opportunity Contract ${runSuffix}.pdf`;
const projectFile = `Project Addition ${runSuffix}.pdf`;
const renamedProjectFile = `Project Addition Renamed ${runSuffix}.pdf`;

async function waitForFilesWorkspaceHydration(page: Page) {
  await page.waitForFunction(() => Boolean(
    document.querySelector('button[aria-label^="Actions for"]'),
  ));
  await page.waitForTimeout(2000);
}

async function workspaceIdsForEntities() {
  const admin = createE2EAdminClient();
  const { data } = await admin
    .from("document_workspace_entities")
    .select("workspace_id")
    .or(`opportunity_id.eq.${opportunityId},project_id.eq.${directProjectId}`);
  return [...new Set((data ?? []).map((row) => row.workspace_id))];
}

test.describe("Opportunity-to-Project Files continuity", () => {
  test.beforeAll(async () => {
    const context = await ensureSupplierInvoiceE2EContext();
    e2eOrganizationId = context.organizationId;
    const admin = createE2EAdminClient();
    const { error: rolloutError } = await admin
      .from("opportunity_lifecycle_rollout_controls")
      .upsert({
        organization_id: context.organizationId,
        override_enabled: true,
        allowed_strategy: "legacy_two_project_v1",
        creation_enabled: true,
        promotion_enabled: false,
        pilot_scope: "local_admin_pilot",
        pilot_environment: "local_development",
        updated_by: context.userId,
      }, { onConflict: "organization_id" });
    if (rolloutError) throw rolloutError;

    const authenticated = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const signIn = await authenticated.auth.signInWithPassword({
      email: context.email,
      password: context.password,
    });
    if (signIn.error) throw signIn.error;

    const creation = await (authenticated.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: Array<{
        opportunity_id: string;
        opportunity_slug: string;
        workspace_project_id: string;
      }> | null;
      error: { message: string } | null;
    }>)("create_opportunity_workspace_v1", {
      p_organization_id: context.organizationId,
      p_creation_request_id: creationRequestId,
      p_strategy: "legacy_two_project_v1",
      p_name: `Phase 4 Files Continuity ${runSuffix}`,
      p_new_client: {
        name: "Phase 4 Contact",
        company_name: `Phase 4 Client ${runSuffix}`,
      },
      p_owner_user_id: context.userId,
      p_location: "Auckland",
      p_estimated_value: 1,
      p_notes: "",
    });
    if (creation.error) throw creation.error;
    const created = creation.data?.[0];
    if (!created) throw new Error("Atomic Opportunity fixture creation returned no row.");
    opportunityId = created.opportunity_id;
    opportunitySlug = created.opportunity_slug;

    const { data: opportunityClient, error: opportunityClientError } = await admin
      .from("organization_opportunities")
      .select("client_id")
      .eq("organization_id", context.organizationId)
      .eq("id", opportunityId)
      .single();
    if (opportunityClientError) throw opportunityClientError;
    if (!opportunityClient.client_id) throw new Error("Atomic Opportunity fixture has no primary client.");

    const { error: tenderClientError } = await admin
      .from("opportunity_tender_clients")
      .insert({
        organization_id: context.organizationId,
        opportunity_id: opportunityId,
        client_id: opportunityClient.client_id,
        created_by: context.userId,
        is_primary: true,
      });
    if (tenderClientError) throw tenderClientError;

    const initializedQuote = await (authenticated.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: Array<{ revision_id: string }> | null;
      error: { message: string } | null;
    }>) ("initialize_primary_opportunity_quote_v1", {
      p_organization_id: context.organizationId,
      p_opportunity_id: opportunityId,
    });
    if (initializedQuote.error) throw initializedQuote.error;
    acceptedQuoteId = initializedQuote.data?.[0]?.revision_id ?? "";
    if (!acceptedQuoteId) throw new Error("Atomic Quote Series fixture creation returned no revision.");

    const { error: quoteError } = await admin
      .from("project_quotes")
      .update({ status: "Accepted" })
      .eq("id", acceptedQuoteId)
      .eq("organization_id", context.organizationId);
    if (quoteError) throw quoteError;

    const acceptance = await (authenticated.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>) (
      "select_opportunity_accepted_quote_revision_v1",
      {
        p_organization_id: context.organizationId,
        p_opportunity_id: opportunityId,
        p_quote_revision_id: acceptedQuoteId,
      },
    );
    if (acceptance.error) throw acceptance.error;

    const { error: projectError } = await admin
      .from("organization_projects")
      .insert({
        id: directProjectId,
        organization_id: context.organizationId,
        created_by: context.userId,
        name: "Phase 4 Direct Project",
        slug: directProjectSlug,
        stage: "Pricing",
        location: "Auckland",
      });
    if (projectError) throw projectError;
  });

  test.afterAll(async () => {
    const admin = createE2EAdminClient();
    const { data: convertedProjects } = await admin
      .from("organization_projects")
      .select("id")
      .eq("source_opportunity_id", opportunityId)
      .neq("id", directProjectId);
    const workspaceIds = await workspaceIdsForEntities();
    for (const workspaceId of workspaceIds) {
      await admin.from("document_workspaces").delete().eq("id", workspaceId);
    }
    const projectIds = [
      directProjectId,
      ...(convertedProjects ?? []).map((project) => project.id),
    ];
    await admin.from("organization_projects").delete().in("id", projectIds);
    await admin.from("organization_opportunities").delete().eq("id", opportunityId);
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
  });

  test("shares exact document identity through conversion and both Files routes", async ({ page }) => {
    const admin = createE2EAdminClient();
    await page.goto(`/app/leads-clients/opportunities/${opportunitySlug}/files`);
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("New folder").getByRole("textbox").fill(sharedFolder);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("link", { name: sharedFolder, exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
        .getByText(sharedFolder, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("New folder").getByRole("textbox").fill(nestedFolder);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("link", { name: nestedFolder, exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
        .getByText(nestedFolder, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Upload files" }).click();
    await page.getByLabel("Choose files to upload").setInputFiles({
      name: opportunityFile,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nPhase 4 opportunity fixture\n"),
    });
    await expect(page.getByRole("dialog").getByText(opportunityFile, { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", {
      name: opportunityFile,
      exact: true,
    })).toBeVisible();

    const { data: opportunityLinkBefore } = await admin
      .from("document_workspace_entities")
      .select("workspace_id")
      .eq("opportunity_id", opportunityId)
      .single();
    const { data: nodeBefore } = await admin
      .from("document_nodes")
      .select("id,current_version_id,workspace_id,parent_node_id")
      .eq("workspace_id", opportunityLinkBefore!.workspace_id)
      .eq("display_name", opportunityFile)
      .single();
    const { data: versionBefore } = await admin
      .from("document_versions")
      .select("id,storage_key,node_id,workspace_id")
      .eq("id", nodeBefore!.current_version_id!)
      .single();
    const storageFolder = `${e2eOrganizationId}/${opportunityLinkBefore!.workspace_id}`;
    const { data: storageObjectsBefore, error: storageObjectsBeforeError } = await admin.storage
      .from("organization-documents")
      .list(storageFolder, { limit: 100, sortBy: { column: "name", order: "asc" } });
    if (storageObjectsBeforeError) throw storageObjectsBeforeError;

    const conversion = await page.evaluate(async ({ slug, acceptedQuoteId: quoteId }) => {
      const response = await fetch(
        `/api/leads-clients/opportunities/${slug}/convert`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ acceptedQuoteId: quoteId }),
        },
      );
      return {
        status: response.status,
        body: await response.json() as { projectSlug?: string; error?: string },
      };
    }, { slug: opportunitySlug, acceptedQuoteId });
    expect(conversion.status).toBe(200);
    const convertedProjectSlug = conversion.body.projectSlug!;

    const { data: convertedProject } = await admin
      .from("organization_projects")
      .select("id,slug")
      .eq("slug", convertedProjectSlug)
      .single();
    const { data: projectLink } = await admin
      .from("document_workspace_entities")
      .select("workspace_id")
      .eq("project_id", convertedProject!.id)
      .single();
    expect(projectLink!.workspace_id).toBe(opportunityLinkBefore!.workspace_id);

    const { data: nodeAfter } = await admin
      .from("document_nodes")
      .select("id,current_version_id,workspace_id,parent_node_id")
      .eq("workspace_id", projectLink!.workspace_id)
      .eq("display_name", opportunityFile)
      .single();
    const { data: versionAfter } = await admin
      .from("document_versions")
      .select("id,storage_key,node_id,workspace_id")
      .eq("id", nodeAfter!.current_version_id!)
      .single();
    const { data: storageObjectsAfter, error: storageObjectsAfterError } = await admin.storage
      .from("organization-documents")
      .list(storageFolder, { limit: 100, sortBy: { column: "name", order: "asc" } });
    if (storageObjectsAfterError) throw storageObjectsAfterError;
    expect(storageObjectsAfter?.length).toBe(storageObjectsBefore?.length);
    expect(storageObjectsAfter?.map((object) => object.name)).toEqual(
      storageObjectsBefore?.map((object) => object.name),
    );
    expect(nodeAfter).toEqual(nodeBefore);
    expect(versionAfter).toEqual(versionBefore);

    await page.goto(`/app/projects/${convertedProjectSlug}/files`);
    await expect(page.getByRole("link", { name: "Files", exact: true })).toHaveAttribute(
      "href",
      `/app/projects/${convertedProjectSlug}/files`,
    );
    await page.getByRole("link", { name: sharedFolder, exact: true }).click();
    await page.getByRole("link", { name: nestedFolder, exact: true }).click();
    await expect(page.getByRole("button", {
      name: opportunityFile,
      exact: true,
    })).toBeVisible();

    const downloadStarted = page.waitForEvent("download");
    await page.getByLabel(`Actions for ${opportunityFile}`).click();
    await page.getByRole("menuitem", { name: "Download" }).click();
    expect((await downloadStarted).suggestedFilename()).toBe(opportunityFile);

    await page.getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Files" })
      .click();
    await page.waitForURL(`/app/projects/${convertedProjectSlug}/files`);
    await page.getByRole("button", { name: "Upload files" }).click();
    await page.getByLabel("Choose files to upload").setInputFiles({
      name: projectFile,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nPhase 4 Project fixture\n"),
    });
    await expect(page.getByRole("dialog").getByText(projectFile, { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", {
      name: projectFile,
      exact: true,
    })).toBeVisible();

    await page.goto(`/app/leads-clients/opportunities/${opportunitySlug}/files`);
    await expect(page).toHaveURL(`/app/projects/${convertedProjectSlug}/files`);
    await expect(page.getByRole("button", {
      name: projectFile,
      exact: true,
    })).toBeVisible();
    await waitForFilesWorkspaceHydration(page);
    await page.getByLabel(`Actions for ${projectFile}`).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByLabel("Rename item").getByRole("textbox")
      .fill(renamedProjectFile);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`/app/projects/${convertedProjectSlug}/files`);
    await expect(page.getByRole("button", {
      name: renamedProjectFile,
      exact: true,
    })).toBeVisible();
    await waitForFilesWorkspaceHydration(page);
    await page.getByLabel(`Actions for ${renamedProjectFile}`).click();
    await page.getByRole("menuitem", { name: "Move" }).click();
    await page.getByLabel("Destination folder").selectOption({
      label: sharedFolder,
    });
    await page.getByRole("button", { name: "Move" }).click();

    await page.goto(`/app/leads-clients/opportunities/${opportunitySlug}/files`);
    await expect(page).toHaveURL(`/app/projects/${convertedProjectSlug}/files`);
    await page.getByRole("link", { name: sharedFolder, exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
        .getByText(sharedFolder, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", {
      name: renamedProjectFile,
      exact: true,
    })).toBeVisible();

    await page.goto(`/app/projects/${convertedProjectSlug}/files`);
    await page.getByRole("link", { name: sharedFolder, exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
        .getByText(sharedFolder, { exact: true }),
    ).toBeVisible();
    await waitForFilesWorkspaceHydration(page);
    await page.getByLabel(`Actions for ${renamedProjectFile}`).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();

    await page.goto(`/app/leads-clients/opportunities/${opportunitySlug}/files`);
    await expect(page).toHaveURL(`/app/projects/${convertedProjectSlug}/files`);
    await page.getByRole("link", { name: sharedFolder, exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" })
        .getByText(sharedFolder, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", {
      name: renamedProjectFile,
      exact: true,
    })).toHaveCount(0);

    const repeat = await page.evaluate(async ({ slug, acceptedQuoteId: quoteId }) => {
      const response = await fetch(
        `/api/leads-clients/opportunities/${slug}/convert`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ acceptedQuoteId: quoteId }),
        },
      );
      return {
        status: response.status,
        body: await response.json() as { projectSlug?: string; error?: string },
      };
    }, { slug: opportunitySlug, acceptedQuoteId });
    expect(repeat.status).toBe(200);
    expect(repeat.body.projectSlug).toBe(convertedProjectSlug);

    const { count: projectLinkCount } = await admin
      .from("document_workspace_entities")
      .select("id", { count: "exact", head: true })
      .eq("project_id", convertedProject!.id);
    const { count: originalVersionCount } = await admin
      .from("document_versions")
      .select("id", { count: "exact", head: true })
      .eq("id", versionBefore!.id);
    expect(projectLinkCount).toBe(1);
    expect(originalVersionCount).toBe(1);

    const { data: opportunityAfter } = await admin
      .from("organization_opportunities")
      .select("id,stage,converted_project_id")
      .eq("id", opportunityId)
      .single();
    expect(opportunityAfter).toMatchObject({
      id: opportunityId,
      stage: "Won",
      converted_project_id: convertedProject!.id,
    });
  });

  test("creates a direct Project workspace and remains usable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/projects/${directProjectSlug}/files`);
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Files", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload files" })).toBeVisible();
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("New folder").getByRole("textbox")
      .fill(`Direct Plans ${runSuffix}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("link", {
      name: `Direct Plans ${runSuffix}`,
      exact: true,
    })).toBeVisible();

    const admin = createE2EAdminClient();
    const { data: link } = await admin
      .from("document_workspace_entities")
      .select("workspace_id,opportunity_id,project_id")
      .eq("project_id", directProjectId)
      .single();
    expect(link).toMatchObject({
      project_id: directProjectId,
      opportunity_id: null,
    });
  });
});
