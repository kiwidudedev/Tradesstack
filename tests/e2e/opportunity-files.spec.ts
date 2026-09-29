import { expect, test } from "@playwright/test";
import {
  createE2EAdminClient,
  ensureSupplierInvoiceE2EContext,
  ensureSupplierInvoiceLoggedIn,
} from "./supplier-invoice-e2e-helpers";

const opportunityId = "e2800000-0000-4000-8000-000000000001";
const opportunitySlug = "phase-3-files-e2e";
const runSuffix = Date.now().toString(36);
const contractsFolder = `Contracts ${runSuffix}`;
const signedFolder = `Signed ${runSuffix}`;
const uploadName = `Phase 3 Contract ${runSuffix}.pdf`;
const renamedUploadName = `Executed Contract ${runSuffix}.pdf`;
const draggedUploadName = `Dragged Contract ${runSuffix}.pdf`;
const backgroundUploadName = `Background Upload ${runSuffix}.pdf`;
let e2eOrganizationId = "";
let e2eUserId = "";

test.describe("Opportunity Files workspace", () => {
  test.beforeAll(async () => {
    const context = await ensureSupplierInvoiceE2EContext();
    e2eOrganizationId = context.organizationId;
    e2eUserId = context.userId;
    const admin = createE2EAdminClient();
    const { data: existingLinks } = await admin
      .from("document_workspace_entities")
      .select("workspace_id")
      .eq("opportunity_id", opportunityId);
    for (const link of existingLinks ?? []) {
      await admin.from("document_workspaces").delete().eq("id", link.workspace_id);
    }
    const { error } = await admin.from("organization_opportunities").upsert({
      id: opportunityId,
      organization_id: context.organizationId,
      created_by: context.userId,
      owner_user_id: context.userId,
      name: "Phase 3 Files E2E",
      slug: opportunitySlug,
    });
    if (error) throw error;
  });

  test.afterAll(async () => {
    const admin = createE2EAdminClient();
    if (e2eOrganizationId && e2eUserId) {
      await admin
        .from("organization_members")
        .update({ role: "admin" })
        .eq("organization_id", e2eOrganizationId)
        .eq("user_id", e2eUserId);
    }
    const { data: links } = await admin
      .from("document_workspace_entities")
      .select("workspace_id")
      .eq("opportunity_id", opportunityId);
    await admin.from("organization_opportunities").delete().eq("id", opportunityId);
    for (const link of links ?? []) {
      await admin.from("document_workspaces").delete().eq("id", link.workspace_id);
    }
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await ensureSupplierInvoiceLoggedIn(page, baseURL!);
    await page.goto(`/app/leads-clients/opportunities/${opportunitySlug}/files`);
    await expect(page.getByRole("heading", { name: "Files", exact: true })).toBeVisible();
  });

  test("creates nested folders, uploads through TUS, searches, renames, moves and soft deletes", async ({ page }) => {
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("New folder").getByRole("textbox").fill(contractsFolder);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("link", { name: contractsFolder, exact: true })).toBeVisible();

    await page.getByRole("link", { name: contractsFolder, exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByText(contractsFolder, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("New folder").getByRole("textbox").fill(signedFolder);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("link", { name: signedFolder, exact: true })).toBeVisible();
    await page.getByRole("link", { name: signedFolder, exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByText(signedFolder, { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Upload files" }).click();
    await expect(page.getByRole("dialog").getByText(`Uploading to ${signedFolder}.`)).toBeVisible();
    await page.getByLabel("Choose files to upload").setInputFiles({
      name: uploadName,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nPhase 3 UI TUS fixture\n"),
    });
    await expect(page.getByText(/^completed ·/)).toBeVisible();
    await expect(page.getByRole("dialog").getByText(uploadName, { exact: true }).first()).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("Choose files to upload").setInputFiles({
      name: uploadName,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nPhase 3 replacement fixture\n"),
    });
    await expect(page.getByText(/^completed ·/)).toHaveCount(2);

    await page.route("**/api/documents/uploads/*/complete", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated completion failure" }),
      }),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("Choose files to upload").setInputFiles({
      name: uploadName,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nPhase 3 failed replacement fixture\n"),
    });
    await expect(page.getByText(/^failed ·/)).toBeVisible();
    await expect(page.getByRole("dialog").getByText(uploadName, { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    const currentVersionDownload = page.waitForEvent("download");
    await page.getByLabel(`Actions for ${uploadName}`).click();
    await page.getByRole("menuitem", { name: "Download" }).click();
    expect((await currentVersionDownload).suggestedFilename()).toBe(uploadName);
    await page.unroute("**/api/documents/uploads/*/complete");

    await page.getByRole("button", { name: "Upload files" }).click();
    const dataTransfer = await page.evaluateHandle((fileName) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(
        ["%PDF-1.7\nPhase 3 drag-drop fixture\n"],
        fileName,
        { type: "application/pdf" },
      ));
      return transfer;
    }, draggedUploadName);
    await page.getByLabel("File drop zone").dispatchEvent("drop", { dataTransfer });
    await expect(page.getByRole("dialog").getByText(draggedUploadName, { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: draggedUploadName, exact: true })).toBeVisible();

    const downloadStarted = page.waitForEvent("download");
    await page.getByLabel(`Actions for ${uploadName}`).click();
    await page.getByRole("menuitem", { name: "Download" }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toBe(uploadName);

    await page.getByLabel(`Actions for ${uploadName}`).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByLabel("Rename item").getByRole("textbox").fill(renamedUploadName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: renamedUploadName, exact: true })).toBeVisible();

    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Files" }).click();
    await page.getByLabel("Search all files").fill(`Executed Contract ${runSuffix}`);
    await page.getByLabel("Search all files").press("Enter");
    await expect(page.getByRole("button", { name: renamedUploadName, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await page.getByLabel(`Actions for ${renamedUploadName}`).click();
    await page.getByRole("menuitem", { name: "Move" }).click();
    await page.getByLabel("Destination folder").selectOption("");
    await page.getByRole("button", { name: "Move" }).click();

    await page.getByLabel("Search all files").fill(`Executed Contract ${runSuffix}`);
    await page.getByLabel("Search all files").press("Enter");
    await page.waitForTimeout(500);
    await page.getByLabel(`Actions for ${renamedUploadName}`).click();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No matching files")).toBeVisible();

    await page.getByRole("button", { name: "Recycle bin" }).click();
    await expect(page.getByRole("heading", { name: "Deleted files" })).toBeVisible();
    await page.waitForTimeout(2000);
    await page.getByLabel(`Actions for deleted ${renamedUploadName}`).click();
    await page.getByRole("menuitem", { name: "Restore batch" }).click();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(
      page.getByLabel(`Actions for deleted ${renamedUploadName}`),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByLabel("Search all files").fill(`Executed Contract ${runSuffix}`);
    await page.getByLabel("Search all files").press("Enter");
    await expect(page.getByRole("button", { name: renamedUploadName, exact: true })).toBeVisible();
    await page.getByLabel(`Actions for ${renamedUploadName}`).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(
      page.getByRole("button", { name: renamedUploadName, exact: true }),
    ).toHaveCount(0);

    const admin = createE2EAdminClient();
    await expect.poll(async () => {
      const { data } = await admin
        .from("document_nodes")
        .select("id")
        .eq("display_name", renamedUploadName)
        .not("deleted_at", "is", null)
        .maybeSingle();
      return data?.id ?? null;
    }).not.toBeNull();
    const { data: deletedNode, error: deletedNodeError } = await admin
      .from("document_nodes")
      .select("id,current_version_id")
      .eq("display_name", renamedUploadName)
      .not("deleted_at", "is", null)
      .single();
    expect(deletedNodeError).toBeNull();
    expect(deletedNode).not.toBeNull();
    const { data: deletedVersion, error: deletedVersionError } = await admin
      .from("document_versions")
      .select("storage_key")
      .eq("id", deletedNode!.current_version_id!)
      .single();
    expect(deletedVersionError).toBeNull();
    expect(deletedVersion).not.toBeNull();

    const { error: ownerPromotionError } = await admin
      .from("organization_members")
      .update({ role: "owner" })
      .eq("organization_id", e2eOrganizationId)
      .eq("user_id", e2eUserId);
    expect(ownerPromotionError).toBeNull();

    await page.reload();
    await page.getByRole("button", { name: "Recycle bin" }).click();
    await expect(page.getByRole("heading", { name: "Deleted files" })).toBeVisible();
    await page.waitForTimeout(2000);
    await page.getByLabel(`Actions for deleted ${renamedUploadName}`).click();
    await page.getByRole("menuitem", { name: "Permanently purge" }).click();
    await page.getByRole("button", { name: "Permanently purge", exact: true }).click();
    await expect(
      page.getByLabel(`Actions for deleted ${renamedUploadName}`),
    ).toHaveCount(0);

    const { data: purgedNode } = await admin
      .from("document_nodes")
      .select("id")
      .eq("id", deletedNode!.id)
      .maybeSingle();
    expect(purgedNode).toBeNull();
    const { data: queuedCleanup } = await admin
      .from("document_storage_cleanup_jobs")
      .select("processing_status,storage_key")
      .eq("storage_key", deletedVersion!.storage_key)
      .neq("processing_status", "completed")
      .single();
    expect(queuedCleanup!.processing_status).toBe("pending");
  });

  test("keeps Files navigation and primary columns usable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("link", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload files" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Recycle bin" })).toBeVisible();
    await expect(page.getByLabel("Search all files")).toBeVisible();
    await page.getByRole("button", { name: "Upload files" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Upload files" })).toBeVisible();
  });

  test("opens an existing workspace for a files.view-only member", async ({ page }) => {
    const admin = createE2EAdminClient();
    const { data: member, error: memberError } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", e2eOrganizationId)
      .eq("user_id", e2eUserId)
      .single();
    if (memberError) throw memberError;

    // Generated types can lag permission additions in a forward migration.
    const permissionClient = admin as unknown as {
      from: (table: string) => {
        upsert: (values: Array<Record<string, unknown>>, options: { onConflict: string }) => Promise<{ error: Error | null }>;
        delete: () => { eq: (column: string, value: string) => { in: (column: string, values: string[]) => Promise<{ error: Error | null }> } };
      };
    };
    const deniedPermissions = ["files.write", "files.delete", "files.purge"];
    const overrideResult = await permissionClient
      .from("member_permission_overrides")
      .upsert(deniedPermissions.map((permissionKey) => ({
        organization_member_id: member.id,
        permission_key: permissionKey,
        is_allowed: false,
        created_by: e2eUserId,
      })), { onConflict: "organization_member_id,permission_key" });
    if (overrideResult.error) throw overrideResult.error;

    try {
      await page.reload();
      await expect(page.getByRole("heading", { name: "Files", exact: true })).toBeVisible();
      await expect(page.getByLabel("Search all files")).toBeVisible();
      await expect(page.getByRole("button", { name: "Upload files" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "New folder" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Recycle bin" })).toHaveCount(0);
    } finally {
      await permissionClient
        .from("member_permission_overrides")
        .delete()
        .eq("organization_member_id", member.id)
        .in("permission_key", deniedPermissions);
    }
  });

  test("keeps an active upload running when the modal closes and restores the same queue", async ({ page }) => {
    let releaseCompletion: (() => void) | undefined;
    const completionGate = new Promise<void>((resolve) => {
      releaseCompletion = resolve;
    });
    await page.route("**/api/documents/uploads/*/complete", async (route) => {
      await completionGate;
      await route.continue();
    });

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.getByLabel("Choose files to upload").setInputFiles({
      name: backgroundUploadName,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nBackground modal upload fixture\n"),
    });
    await expect(page.getByRole("progressbar", {
      name: `Upload progress for ${backgroundUploadName}`,
    })).toHaveAttribute("aria-valuenow", "100");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Upload files" }).click();
    await expect(page.getByText(backgroundUploadName, { exact: true })).toBeVisible();
    await expect(page.getByText("1 uploading", { exact: true }).first()).toBeVisible();

    releaseCompletion?.();
    await expect(page.getByText("1 completed", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByRole("button", {
      name: backgroundUploadName,
      exact: true,
    })).toBeVisible();
  });
});
