import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const claimsRoute = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/page.tsx",
);
const paymentClaimsClient = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/PaymentClaimsRegisterClient.tsx",
);
const retentionSection = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/RetentionWorkspaceSection.tsx",
);
const retentionBoundary = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/RetentionWorkspaceBoundary.tsx",
);
const projectLayout = read(
  "app/app/(workspace)/projects/[projectId]/layout.tsx",
);
const projectShell = read("components/app/ProjectLayoutShell.tsx");
const projectNavigation = read("components/app/ProjectSecondaryNav.tsx");
const compatibilityRoute = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/page.tsx",
);
const retentionDetail = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
);

describe("embedded Retention workspace UI contract", () => {
  it("renders server-snapshotted Payment Claims first and isolates Retention locally", () => {
    const paymentClaimPosition = claimsRoute.indexOf(
      "<PaymentClaimsRegisterClient",
    );
    const retentionPosition = claimsRoute.indexOf(
      "<RetentionWorkspaceBoundary>",
    );

    expect(paymentClaimPosition).toBeGreaterThan(-1);
    expect(retentionPosition).toBeGreaterThan(paymentClaimPosition);
    expect(claimsRoute).toContain(
      "initialSnapshot={registerData.retention.snapshot}",
    );
    expect(claimsRoute).not.toContain("<Suspense fallback={null}>");
    expect(claimsRoute).toContain('id="retention"');
    expect(retentionBoundary).toContain("componentDidCatch");
    expect(retentionBoundary).toContain("return null");
  });

  it("keeps the Payment Claim client query and mutation path self-contained", () => {
    expect(paymentClaimsClient).toContain("createBrowserSupabaseClient");
    expect(paymentClaimsClient).toContain('.rpc("create_project_claim_draft"');
    expect(paymentClaimsClient).toContain('.rpc("update_project_claim_status"');
    expect(claimsRoute).not.toContain("createBrowserSupabaseClient");
    expect(retentionSection).not.toContain("createBrowserSupabaseClient");
  });

  it("uses server initial state and retains one legacy Retention fallback read", () => {
    expect(retentionSection.match(/getRetentionWorkspace\(project\.id\)/g)).toHaveLength(1);
    expect(retentionSection).toContain(
      "if (initialSnapshot === undefined)",
    );
    expect(retentionSection).toContain(
      "if (workspace && !workspace.register.succeeded) return null",
    );
    expect(retentionSection).toContain("if (!project) return null");
    expect(retentionSection).toContain("catch (error)");
    expect(retentionSection).toContain("return null");
    expect(retentionSection).not.toContain("getOrganizationRetentionCapability");
    expect(retentionSection).not.toContain("getProjectRetentionWorkflowState");
  });

  it("renders one unified Retention Claims table without technical position details", () => {
    const tablePosition = retentionSection.indexOf(
      '<OperationalPanel contentClassName="p-0">',
    );

    expect(tablePosition).toBeGreaterThan(-1);
    expect(retentionSection).toContain("claimRows.map");
    expect(retentionSection).not.toContain("Automatic draft");
    expect(retentionSection).not.toContain("Retention position details");
    expect(retentionSection).not.toContain("<details");
    expect(retentionSection).not.toContain('title="Current Retention Claim"');
    expect(retentionSection).not.toContain('title="Previous Retention Claims"');
    expect(retentionSection).not.toContain('title="Create Retention Claim"');
    expect(retentionSection).not.toContain("Open Retention Claim");
    expect(retentionSection).toContain('className="h-8 w-8 rounded-full"');
  });

  it("removes Retention-navigation-only reads and props while retaining detail breadcrumbs", () => {
    expect(projectNavigation).toContain('label: "Payment Claim"');
    expect(projectNavigation).not.toContain('label: "Retention"');
    expect(projectNavigation).not.toContain("showRetentionNavigation");
    expect(projectLayout).not.toContain("showRetentionNavigation");
    expect(projectLayout).not.toContain("getOrganizationRetentionCapability");
    expect(projectLayout).not.toContain("getProjectRetentionWorkflowState");
    expect(projectShell).not.toContain("showRetentionNavigation");
    expect(projectShell).toContain(
      "preconstruction/claims#retention",
    );
  });

  it("keeps the detail route and canonicalizes register navigation", () => {
    expect(compatibilityRoute).toContain("redirect(");
    expect(compatibilityRoute).toContain(
      "preconstruction/claims#retention",
    );
    expect(retentionDetail).toContain(
      "preconstruction/claims#retention",
    );
    expect(retentionDetail).toContain("RetentionClaimDetailPage");
  });
});
