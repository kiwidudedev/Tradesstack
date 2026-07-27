import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const page = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
);
const draftEditor = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/RetentionClaimDraftEditor.tsx",
);
const resolver = read("lib/xero/retention-claim-immutable-panel.ts");
const sharedPanel = read("components/app/AccountingSyncPanel.tsx");
const retentionPanel = read("components/app/RetentionClaimXeroPanel.tsx");

describe("Retention Claim accounting panel rendering boundaries", () => {
  it("loads immutable panel state for Draft and Submitted claims", () => {
    const stateLoad = page.indexOf("getRetentionClaimImmutableXeroPanel(claim.id)");
    const submittedLoad = page.indexOf(
      "isSubmitted ? getMasterRetentionSource(claim.id) : null",
    );

    expect(stateLoad).toBeGreaterThan(-1);
    expect(submittedLoad).toBeGreaterThan(-1);
    expect(stateLoad).toBeLessThan(submittedLoad);
    expect(page).toContain("{immutableXeroPanel.visible ? (");
    expect(page).not.toContain(
      "{isSubmitted && immutableXeroPanel?.visible ? (",
    );
    expect(page).toContain("immutableXeroPanel={immutableXeroPanel}");
    expect(draftEditor).toContain("{immutableXeroPanel.visible ? (");
  });

  it("renders only the immutable cumulative accounting branch", () => {
    expect(page).not.toContain("xeroPanel?.visible");
    expect(page).not.toContain("Create Xero Sales Invoice");
    expect(page.match(/<RetentionClaimXeroPanel/g)).toHaveLength(1);
    expect(draftEditor.match(/<RetentionClaimXeroPanel/g)).toHaveLength(1);
    expect(resolver).toContain(
      "isRetentionClaimImmutableXeroEnabled(member.organization_id)",
    );
    expect(resolver).toContain("if (!featureEnabled)");
    expect(resolver).toContain("visible: true");
  });

  it("represents Draft as informationally blocked without enabling mutation", () => {
    expect(resolver).toContain(
      'claim.status === "draft"',
    );
    expect(resolver).toContain(
      '"Save the Retention Claim and resolve any invalid lines before pushing it to Xero."',
    );
    expect(resolver).toContain(
      'actionLabel: decision.canPush ? "Push to Xero" : null',
    );
    expect(resolver).toContain(
      "canRefresh: Boolean(invoiceId) && decision.canRefresh",
    );
  });

  it("does not render an error alert for an already-synced authorised invoice", () => {
    expect(resolver).toContain(
      'decision.blockers[0]?.code === "already_exported"',
    );
  });

  it("uses saved Draft validity to expose one Push action without requiring Submit", () => {
    expect(draftEditor).toContain("draftCanPush={canSubmit}");
    expect(draftEditor).toContain("!immutableXeroPanel.visible ? (");
    expect(retentionPanel).toContain(
      'props.draftCanPush ? "Push to Xero" : null',
    );
    expect(retentionPanel).toContain("pushRetentionClaimToXeroAction");
    expect(retentionPanel).not.toContain("proposalToken");
    expect(retentionPanel).not.toContain("<Dialog");
    expect(retentionPanel).toContain(
      "Save the Retention Claim and resolve any invalid lines before pushing it to Xero.",
    );
  });

  it("centralizes all approved Payment Claim presentation primitives", () => {
    for (const heading of [
      "Invoice #",
      "Sync Status",
      "Payment Status",
      "Last Sync",
      "Paid",
      "Outstanding",
      "Paid Date",
      "Action",
    ]) {
      expect(sharedPanel).toContain(`"${heading}"`);
    }
    expect(sharedPanel).toContain("ACCOUNTING_SYNC_BADGE_CLASSES");
    expect(sharedPanel).toContain("ACCOUNTING_PAYMENT_BADGE_CLASSES");
    expect(sharedPanel).toContain("AccountingSyncXeroInvoiceLink");
    expect(sharedPanel).toContain("rounded-[14px]");
    expect(sharedPanel).toContain("min-w-[960px]");
    expect(sharedPanel).toContain("md:hidden");
  });
});
