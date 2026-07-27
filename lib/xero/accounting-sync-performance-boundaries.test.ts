import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

const paymentActions = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts",
);
const retentionActions = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
);
const paymentPanel = read(
  "lib/xero/payment-claim-sales-invoice-panel.ts",
);
const retentionPanel = read(
  "components/app/RetentionClaimXeroPanel.tsx",
);
const paymentProposal = read(
  "lib/xero/payment-claim-initial-push-proposal.ts",
);
const hotPathIndexes = read(
  "supabase/migrations/20260726410000_add_accounting_sync_hot_path_indexes.sql",
);
const retentionProposal = read(
  "lib/xero/retention-claim-push-proposal.ts",
);
const retentionPanelLoader = read(
  "lib/xero/retention-claim-immutable-panel.ts",
);
const retentionConfirmation = read(
  "lib/xero/retention-claim-push-confirmation.ts",
);
const paymentConfirmation = read(
  "lib/xero/payment-claim-initial-push-confirmation.ts",
);
const paymentPage = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/page.tsx",
);
const paymentPanelComponent = read(
  "components/app/PaymentClaimXeroPanel.tsx",
);

describe("Accounting Sync performance boundaries", () => {
  it("keeps structured timing around Push, Refresh, Reset, and panel loads", () => {
    for (const source of [paymentActions, retentionActions]) {
      expect(source).toContain("createXeroActionTiming");
      expect(source).toContain('"worker_execution"');
      expect(source).toContain('"final_panel_load"');
      expect(source).toContain("timing.complete()");
    }
    expect(retentionActions).toContain('action: "reset"');
  });

  it("loads the full Retention panel only once after Refresh", () => {
    const refresh = retentionActions.slice(
      retentionActions.indexOf(
        "export async function refreshRetentionClaimXeroAction",
      ),
      retentionActions.indexOf(
        "export async function retryRetentionClaimXeroAttachmentPhase2cAction",
      ),
    );
    expect(refresh).toContain("getRetentionClaimRefreshIdentity");
    expect(refresh.match(/getRetentionClaimImmutableXeroPanel/g)).toHaveLength(1);
    expect(refresh).not.toContain(
      '.from("organization_accounting_documents")',
    );
  });

  it("does not refetch a server-supplied Retention initial state on mount", () => {
    expect(retentionPanel).toContain(
      "if (props.initialState && !dateEditing?.version) return;",
    );
    expect(retentionPanel).toContain(
      "props.initialState ?? null",
    );
  });

  it("supplies Payment panel state from the server and skips its mount load", () => {
    expect(paymentPage).toContain(
      "getPaymentClaimXeroPanelState({ claimId })",
    );
    expect(paymentPage).toContain(
      "initialXeroPanelState={initialXeroPanelState}",
    );
    expect(paymentPanelComponent).toContain(
      "const skipInitialLoad = useRef(Boolean(props.initialState))",
    );
    expect(paymentPanelComponent).toContain(
      "if (skipInitialLoad.current)",
    );
  });

  it("scopes Payment durable jobs in the database and bounds history", () => {
    const loader = paymentPanel.slice(
      paymentPanel.indexOf("async function loadJobs"),
      paymentPanel.indexOf(
        "export async function getPaymentClaimXeroPanelState",
      ),
    );
    expect(loader).toContain(
      '.eq("request_payload->>accountingDocumentId", params.documentId)',
    );
    expect(loader).toContain(".limit(50)");
    expect(loader).not.toContain(".filter((job)");
  });

  it("keeps full Payment Push readiness out of standalone panel loading", () => {
    const panelLoader = paymentPanel.slice(
      paymentPanel.indexOf(
        "export async function getPaymentClaimXeroPanelState",
      ),
    );
    expect(panelLoader).not.toContain(
      "resolvePaymentClaimXeroReadinessContext",
    );
    expect(panelLoader).not.toContain("generatePaymentClaimPdfBundleServer");
    expect(panelLoader).not.toContain("evaluate_retention_ownership");
  });

  it("keeps full Retention proposal evidence out of panel loading", () => {
    const panelLoader = retentionPanelLoader.slice(
      retentionPanelLoader.indexOf(
        "export async function getRetentionClaimImmutableXeroPanel",
      ),
      retentionPanelLoader.indexOf(
        "export async function getRetentionClaimRefreshIdentity",
      ),
    );
    expect(panelLoader).not.toContain("loadRetentionClaimXeroResolved");
    expect(panelLoader).not.toContain("evaluate_retention_ownership_phase2a");
    expect(panelLoader).not.toContain("buildRetentionClaimPushProposal");
  });

  it("reuses server-authenticated context through one-click Payment Push", () => {
    const preparation = paymentActions.slice(
      paymentActions.indexOf("async function preparePaymentClaimPushProposal"),
      paymentActions.indexOf(
        "export async function loadPaymentClaimPushProposalAction",
      ),
    );
    expect(preparation.match(/getCurrentOrganizationMember/g)).toHaveLength(1);
    expect(preparation.match(/getOrganizationPermissionsBatch/g)).toHaveLength(1);
    expect(preparation.match(/isPaymentClaimInitialPushEnabled/g)).toHaveLength(1);
    expect(paymentConfirmation).toContain("requestContext");
    expect(paymentConfirmation).toContain(
      "requestContext.permissions[PAYMENT_CLAIM_INITIAL_PUSH_PERMISSION]",
    );
    expect(paymentActions).toContain(
      "refresh.requestContext",
    );
  });

  it("reuses server-authenticated context through Retention Push and Refresh", () => {
    const preparation = retentionActions.slice(
      retentionActions.indexOf("async function prepareRetentionClaimPushProposal"),
      retentionActions.indexOf(
        "export async function loadRetentionClaimPushProposalAction",
      ),
    );
    expect(preparation.match(/getCurrentOrganizationMember/g)).toHaveLength(1);
    expect(preparation.match(/getOrganizationPermissionsBatch/g)).toHaveLength(1);
    expect(preparation.match(/isRetentionClaimImmutableXeroEnabled/g))
      .toHaveLength(1);
    expect(retentionConfirmation).toContain("requestContext");
    expect(retentionActions).toContain(
      "getRetentionClaimImmutableXeroPanel(\n        params.retentionClaimId,\n        timing,\n        requestContext",
    );
  });

  it("reuses prepared Payment PDF bytes during authoritative confirmation", () => {
    expect(paymentActions).toContain("proposal: prepared.proposal");
    expect(paymentActions).toContain("requestContext: prepared.requestContext");
    expect(paymentProposal).toContain(
      "validatePaymentClaimProposalStillCurrent",
    );
    expect(paymentProposal).toContain(
      'Buffer.from(artifact.pdfBase64, "base64")',
    );
    expect(paymentProposal).toContain(
      ": generatePaymentClaimPdfBundleServer(params, timing)",
    );
  });

  it("indexes active document and immutable revision job lookups", () => {
    expect(hotPathIndexes).toContain(
      "org_accounting_sync_jobs_active_document_lookup_idx",
    );
    expect(hotPathIndexes).toContain(
      "(request_payload ->> 'accountingDocumentId')",
    );
    expect(hotPathIndexes).toContain(
      "org_accounting_sync_jobs_revision_lookup_idx",
    );
    expect(hotPathIndexes).toContain(
      "(request_payload ->> 'accountingRevisionId')",
    );
  });

  it("uses one Retention proposal build plus narrow authoritative validation", () => {
    expect(retentionActions).toContain(
      "proposal: prepared.proposal",
    );
    expect(retentionActions).toContain(
      "requestContext: prepared.requestContext",
    );
    expect(retentionConfirmation).toContain(
      "validateRetentionClaimProposalStillCurrent",
    );
    expect(retentionProposal).toContain("loadRetentionClaimXeroResolved");
    expect(retentionProposal).toContain(
      'admin().rpc("evaluate_retention_ownership_phase2a"',
    );
    expect(retentionProposal).toContain(
      "calculateRetentionClaimPushHashes",
    );
    expect(retentionConfirmation).toContain(
      "current = preparedProposal",
    );
  });
});
