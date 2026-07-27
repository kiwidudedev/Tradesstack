import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory =
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims";
const read = (file: string) =>
  readFileSync(`${directory}/${file}`, "utf8");

const page = read("page.tsx");
const paymentClient = read("PaymentClaimsRegisterClient.tsx");
const retentionSection = read("RetentionWorkspaceSection.tsx");
const snapshots = read("financials-register-snapshots.ts");

function occurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

describe("Financials register server snapshot performance contract", () => {
  it("resolves one shared member, project, and permission context", () => {
    expect(occurrences(snapshots, "getCurrentOrganizationMember()")).toBe(1);
    expect(occurrences(snapshots, "getOrganizationPermissionsBatch({")).toBe(1);
    expect(snapshots).toContain(
      "const [projectResult, permissions] = await Promise.all([",
    );
    expect(page).toContain(
      "loadFinancialsRegisterPageData(projectSlug)",
    );
  });

  it("starts Payment and Retention snapshot loaders concurrently", () => {
    expect(snapshots).toContain(
      "const [payment, retention] = await Promise.allSettled([",
    );
    expect(snapshots).toContain(
      "loadPaymentClaimRegisterSnapshot(context)",
    );
    expect(snapshots).toContain(
      "loadRetentionRegisterSnapshot(context)",
    );
  });

  it("passes both authoritative server snapshots into their registers", () => {
    expect(page).toContain(
      "initialSnapshot={registerData.payment.snapshot}",
    );
    expect(page).toContain(
      "initialSnapshot={registerData.retention.snapshot}",
    );
    expect(page).toContain(
      "initialError={registerData.payment.error}",
    );
    expect(page).toContain(
      "initialError={registerData.retention.error}",
    );
  });

  it("does not fetch Payment Claims on mount when server state was supplied", () => {
    expect(paymentClient).toContain(
      "if (initialSnapshot !== undefined)",
    );
    expect(paymentClient).not.toContain("useAuth()");
    expect(paymentClient).not.toContain('.from("project_claims")');
    expect(paymentClient).not.toContain('.from("organization_projects")');
    expect(paymentClient).toContain(
      "appliedServerSnapshot.current === initialSnapshot.loadedAt",
    );
  });

  it("deduplicates the Payment fallback request across Strict Mode effects", () => {
    expect(paymentClient).toContain("const fallbackLoad = useRef<{");
    expect(paymentClient).toContain(
      "fallbackLoad.current?.projectSlug !== routeProjectSlug",
    );
    expect(occurrences(
      paymentClient,
      "loadPaymentClaimRegisterSnapshotAction(routeProjectSlug)",
    )).toBe(1);
    expect(paymentClient).toContain(
      "const request = fallbackLoad.current.request",
    );
  });

  it("does not mount-fetch Retention and retains one server-only legacy fallback", () => {
    expect(retentionSection).not.toContain("useEffect");
    expect(retentionSection).not.toContain('"use client"');
    expect(retentionSection).toContain(
      "if (initialSnapshot === undefined)",
    );
    expect(occurrences(
      retentionSection,
      "getRetentionWorkspace(project.id)",
    )).toBe(1);
  });

  it("isolates one register failure without rejecting the whole page", () => {
    expect(snapshots).toContain("Promise.allSettled");
    expect(snapshots).toContain("payment: scopedResult(");
    expect(snapshots).toContain("retention: scopedResult(");
    expect(retentionSection).toContain(
      'scopedError ?? "Unable to load Retention Claims."',
    );
    expect(retentionSection).toContain(
      "if (workspace && !workspace.register.succeeded) return null",
    );
  });

  it("uses bounded set reads instead of per-claim accounting queries", () => {
    expect(snapshots).toContain(
      '.in("project_claim_id", claims.map((claim) => claim.id))',
    );
    expect(snapshots).toContain('.in("id", revisionIds)');
    expect(occurrences(
      snapshots,
      '.from("organization_accounting_documents")',
    )).toBe(2);
  });

  it("keeps detail-only Payment accounting work out of the snapshot", () => {
    for (const forbidden of [
      "payment_claim_pdf",
      "readiness",
      "proposal_hash",
      "account_mapping",
      "tax_mapping",
      "contact_mapping",
      "revision_lines",
    ]) {
      expect(snapshots.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("keeps full Retention proposal construction out of the snapshot", () => {
    for (const forbidden of [
      "getProjectRetentionPosition",
      "listRetentionClaimDrafts",
      "getRetentionClaimDetail",
      "proposalHash",
      "dependencyHash",
      "ownershipEvidence",
    ]) {
      expect(snapshots).not.toContain(forbidden);
    }
  });

  it("does not poll, retry, refresh the router, or call Xero", () => {
    const combined = `${paymentClient}\n${retentionSection}\n${snapshots}`;
    expect(combined).not.toContain("setInterval(");
    expect(combined).not.toContain("setTimeout(");
    expect(combined).not.toContain("router.refresh(");
    expect(combined).not.toContain("revalidatePath(");
    expect(combined).not.toContain("createXero");
    expect(combined).not.toContain("postInvoice");
  });

  it("records all required non-sensitive timing stages", () => {
    for (const stage of [
      "authentication",
      "membership",
      "permission_batch",
      "project_context",
      "payment_snapshot",
      "payment_accounting_state",
      "payment_presentation",
      "payment_total",
      "retention_snapshot",
      "retention_accounting_state",
      "retention_presentation",
      "retention_total",
      "operationDurationMs",
      "actionElapsedMs",
      "parallelGroup",
      "rowsReturned",
      "queryCount",
    ]) {
      expect(snapshots).toContain(stage);
    }
  });
});
