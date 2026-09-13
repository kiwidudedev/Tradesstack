import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const register = fs.readFileSync(
  path.join(
    root,
    "app/app/(workspace)/projects/[projectId]/preconstruction/claims/RetentionWorkspaceSection.tsx",
  ),
  "utf8",
);
const compatibilityRoute = fs.readFileSync(
  path.join(
    root,
    "app/app/(workspace)/projects/[projectId]/preconstruction/retention/page.tsx",
  ),
  "utf8",
);
const detail = fs.readFileSync(
  path.join(
    root,
    "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
  ),
  "utf8",
);
const draftEditor = fs.readFileSync(
  path.join(
    root,
    "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/RetentionClaimDraftEditor.tsx",
  ),
  "utf8",
);
const actions = fs.readFileSync(
  path.join(
    root,
    "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
  ),
  "utf8",
);
const navigation = fs.readFileSync(
  path.join(root, "components/app/ProjectSecondaryNav.tsx"),
  "utf8",
);

describe("Phase 7 Retention UI contract", () => {
  it("shows the Retention Claims register without the technical origin register", () => {
    for (const label of [
      "Claim #",
      "Title",
      "Status",
      "Outstanding",
      "Xero",
      "Actions",
      "Totals",
    ]) {
      expect(register).toContain(label);
    }
    expect(register).not.toContain(">Origins<");
    expect(register).not.toContain("Automatic draft");
    expect(register).not.toContain("Retention position details");
    expect(register).not.toContain("Schedule / tranche");
    expect(register).not.toContain(">Variance<");
    expect(register).toContain("workspace.masterAccounting");
    expect(register).toContain('label="Pushed to Xero"');
    expect(register).toContain('label="New Since Last Push"');
    expect(register).not.toContain("New Retention Claim");
    expect(register).toContain("row.automaticDraft");
    expect(register).toContain('<OperationalPanel contentClassName="p-0">');
    expect(register).toContain("text-right [font-variant-numeric:tabular-nums]");
    expect(register).toContain('className="h-8 w-8 rounded-full"');
    expect(register).not.toContain('title="Current Retention Claim"');
    expect(register).not.toContain('title="Previous Retention Claims"');
    expect(register).not.toContain("Open Retention Claim");
  });

  it("shows cumulative submitted Payment Claim evidence", () => {
    for (const label of [
      "Payment Claim",
      "Retention excl. GST",
      "GST",
      "Total incl. GST",
      "Pushed to Xero incl. GST",
      "New Since Last Push incl. GST",
      "Outstanding incl. GST",
    ]) {
      expect(detail).toContain(label);
    }
    expect(detail).toContain("getMasterRetentionSource");
    expect(detail).toContain("allocation.originClaimNumberSnapshot");
    expect(detail).toContain("allocation.originClaimDateSnapshot");
    expect(detail).toContain("Cumulative submitted Payment Claim origins");
  });

  it("shows automatic rolling Draft candidates separately from positive allocations", () => {
    for (const label of [
      "Retention Claim Lines",
      "Retention Held",
      "Previously Claimed",
      "Claim %",
      "This Claim",
      "Claimed to Date",
      "Remaining",
    ]) {
      expect(draftEditor).toContain(label);
    }
    const headerList = draftEditor.slice(
      draftEditor.indexOf('{["Payment Claim"'),
      draftEditor.indexOf("].map((heading, index)"),
    );
    expect(headerList).not.toContain('"Date"');
    expect(headerList).not.toContain('"Eligible"');
    expect(draftEditor).not.toContain("Use available");
    expect(draftEditor).not.toContain(">Reset<");
    expect(draftEditor).toContain("calculateRetentionClaimPercentagePreview");
    expect(detail).toContain("automaticRolling");
    expect(detail).toContain("rollingOrigins");
  });

  it("preserves existing Retention-domain boundaries and keeps Phase 9 writes server-side", () => {
    for (const service of [
      "createRetentionClaimDraft",
      "updateRetentionClaimDraft",
      "addRetentionClaimAllocation",
      "updateRetentionClaimAllocation",
      "removeRetentionClaimAllocation",
      "submitRetentionClaim",
      "cancelRetentionClaimDraft",
    ]) {
      expect(actions).toContain(service);
    }
    expect(actions).not.toContain("createBrowserSupabaseClient");
    expect(actions).not.toContain('.from("project_claims")');
    expect(actions).toContain("loadRetentionClaimPushProposalAction");
    expect(actions).toContain("use_master_retention_push");
    expect(actions).toContain("retention_attachments_retired");
    expect(actions).toContain("assertProjectRoute(projectSlug, projectId)");
    expect(actions).toContain("assertClaimRoute(projectSlug, claimId)");
  });

  it("keeps Payment Claim in project navigation without a separate Retention tab", () => {
    expect(navigation).toContain('label: "Payment Claim"');
    expect(navigation).not.toContain('label: "Retention"');
    expect(navigation).not.toContain("showRetentionNavigation");
  });

  it("redirects the retired standalone register to the embedded section", () => {
    expect(compatibilityRoute).toContain(
      "preconstruction/claims#retention",
    );
    expect(compatibilityRoute).toContain("redirect(");
    expect(detail).toContain("preconstruction/claims#retention");
    expect(actions).toContain('registerHref: `${claimsPath}#retention`');
    expect(actions).toContain(
      "preconstruction/retention/claims",
    );
  });

  it("keeps the register read-only while Phase 10 payment controls remain isolated on submitted claim detail", () => {
    expect(register).not.toMatch(/sync.*xero|generate.*pdf/i);
    expect(register).not.toContain("recordManualRetentionClaimPaymentAction");
    expect(detail).toContain("getRetentionClaimImmutableXeroPanel");
    expect(detail).toContain("getRetentionClaimPaymentState");
    expect(detail).toContain("recordManualRetentionClaimPaymentAction");
    expect(detail).toContain(
      "The previous successful paid",
    );
  });
});
