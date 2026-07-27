import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { derivePaymentClaimRegisterMetrics } from "../../../lib/payment-claim-register-summary";

const routePath = "app/app/(workspace)/projects/[projectId]/preconstruction/claims/page.tsx";
const clientPath =
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/PaymentClaimsRegisterClient.tsx";
const routeSource = readFileSync(routePath, "utf8");
const source = readFileSync(clientPath, "utf8");

function orderedPositions(values: string[]) {
  return values.map((value) => {
    const position = source.indexOf(value);
    expect(position, `Expected ${JSON.stringify(value)} in ${clientPath}`).toBeGreaterThan(-1);
    return position;
  });
}

describe("Payment Claims Register protected UI contract", () => {
  it("keeps the current route, module header, loading, error, and empty states", () => {
    expect(routePath).toBe("app/app/(workspace)/projects/[projectId]/preconstruction/claims/page.tsx");
    expect(source).toContain('title="Financials"');
    expect(source).toContain('description="Create, track, submit, and reconcile payment claims for this job"');
    expect(source).toContain("Loading claims register...");
    expect(source).toContain('title="No claims yet for this project."');
    expect(source).toContain('"Create First Claim"');
    expect(source).toContain("<OperationalAlert variant=\"error\">");
  });

  it("composes server-snapshotted Payment Claims before the embedded Retention workspace", () => {
    const paymentClaimsPosition = routeSource.indexOf(
      "<PaymentClaimsRegisterClient",
    );
    const retentionPosition = routeSource.indexOf(
      "<RetentionWorkspaceBoundary>",
    );

    expect(paymentClaimsPosition).toBeGreaterThan(-1);
    expect(retentionPosition).toBeGreaterThan(paymentClaimsPosition);
    expect(routeSource).toContain(
      "loadFinancialsRegisterPageData(projectSlug)",
    );
    expect(routeSource).toContain(
      "initialSnapshot={registerData.payment.snapshot}",
    );
    expect(routeSource).not.toContain("<Suspense fallback={null}>");
    expect(routeSource).toContain('id="retention"');
  });

  it("locks the exact desktop KPI order and labels", () => {
    const labels = ["Project Total", "Submitted", "Paid", "Outstanding", "Retention"];
    const positions = orderedPositions(labels.map((label) => `label="${label}"`));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(source).toContain('className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"');
    expect(source).not.toContain("incl. approved variations");
    expect(source).not.toContain("awaiting payment`}");
    expect(source).not.toContain("received`}");
    expect(source).not.toContain("unpaid${");
    expect(source).not.toContain("currently held on this project");
  });

  it("locks the exact register column order", () => {
    const columns = [
      "Claim #",
      "Title",
      "Date",
      "Status",
      "Gross",
    ];
    const positions = orderedPositions(columns.map((label) => `>${label}</OperationalTableHead>`));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(columns).toMatchInlineSnapshot(`
      [
        "Claim #",
        "Title",
        "Date",
        "Status",
        "Gross",
      ]
    `);
  });

  it("keeps Retention presentation out of the Payment Claims register", () => {
    expect(source).toContain("const balance = Math.max(0, claimAmount - paidAmount);");
    expect(source).toContain("{toMoney(balance > 0 ? balance : claimAmount || paidAmount)}");
    expect(source).not.toContain(">Retention Withheld</OperationalTableHead>");
    expect(source).not.toContain(">Released to Date</OperationalTableHead>");
    expect(source).not.toContain(">Retention Balance</OperationalTableHead>");
    expect(source).toContain("return sum + (balance > 0 ? balance : claimAmount || paidAmount);");
  });

  it("captures current KPI status inclusion and exact pre-GST claim basis", () => {
    const metrics = derivePaymentClaimRegisterMetrics([
      { status: "Draft", claim_amount: 100, paid_amount: 25 },
      { status: "Submitted", claim_amount: 200, paid_amount: 50 },
      { status: "Unpaid", claim_amount: 300, paid_amount: 100 },
      { status: "Paid", claim_amount: 400, paid_amount: 400 },
      { status: "Overdue", claim_amount: 500, paid_amount: 125 },
      { status: "Cancelled", claim_amount: 600, paid_amount: 600 },
    ]);
    expect(metrics).toEqual({
      receivedToDate: 700,
      outstanding: 725,
      paidValue: 400,
      dueValue: 500,
      overdueValue: 500,
      paidClaimsCount: 1,
      dueClaimsCount: 2,
      overdueClaimsCount: 1,
      unpaidClaimsCount: 3,
    });
  });

  it("keeps create, edit, and all six direct status actions", () => {
    expect(source).toContain('.rpc("create_project_claim_draft"');
    expect(source).toContain('.rpc("update_project_claim_status"');
    expect(source).toContain("router.push(`/app/projects/${routeProjectSlug}/preconstruction/claims/${claim.id}`)");
    expect(source).toContain('["Draft", "Submitted", "Unpaid", "Paid", "Overdue", "Cancelled"]');
  });

  it("captures the current narrow-screen behavior as a horizontally constrained table, not a separate card read model", () => {
    expect(source).toContain("<OperationalTable>");
    expect(source).not.toContain("mobileClaims");
    expect(source).not.toContain("md:hidden");
    expect(source).not.toContain("sm:hidden");
  });
});
