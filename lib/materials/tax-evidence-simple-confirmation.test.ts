import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  "app/app/(workspace)/company/materials/CompanyMaterialsWorkspace.tsx",
  "utf8",
);
const service = readFileSync("lib/materials/service.ts", "utf8");
const policies = readFileSync("lib/tax/organization-policy-server.ts", "utf8");
const actions = readFileSync("app/app/(workspace)/company/materials/actions.ts", "utf8");

const simpleStart = workspace.indexOf('data-testid="simple-tax-confirmation"');
const simpleUi = workspace.slice(simpleStart, workspace.indexOf(
  ') : supplierPriceModalMode === "confirm_tax_advanced"',
  simpleStart,
));

describe("simple forward tax confirmation", () => {
  it("keeps the compact dialog read-only and decision-focused", () => {
    expect(simpleStart).toBeGreaterThan(0);
    expect(simpleUi).toContain("This supplier price is confirmed as:");
    expect(simpleUi).toContain("from now forward");
    expect(simpleUi).toContain('title="Estimating Rate"');
    expect(simpleUi).not.toContain("price-tax-correction-effective");
    expect(simpleUi).not.toContain("price-tax-correction-reason");
    expect(simpleUi).not.toContain("price-supplier");
    expect(simpleUi).not.toContain("price-cost");
    expect(simpleUi).not.toContain("Set as Preferred Supplier");
    expect(workspace).toContain("Confirm & Use");
  });

  it("submits only organization, operation, and immutable price identity", () => {
    const callStart = workspace.indexOf("confirmMaterialSupplierPriceTaxEvidenceForwardAction({");
    const call = workspace.slice(callStart, workspace.indexOf("})", callStart) + 2);
    expect(call).toContain("organizationId");
    expect(call).toContain("operationId");
    expect(call).toContain("previousSupplierPriceId");
    expect(call).not.toContain("policyId");
    expect(call).not.toContain("effectiveFrom");
    expect(call).not.toContain("reason");
    expect(call).not.toContain("isPreferred");
    expect(workspace).toContain('if (result.error?.includes("no longer current")) router.refresh()');
  });

  it("makes the server resolve one current policy and revalidate the immutable row", () => {
    expect(actions).toContain("requireMaterialsWriteContext(params.organizationId)");
    expect(service).toContain("ensureSupplierPriceAccess({");
    expect(service).toContain("if (!previous.is_current)");
    expect(service).toContain("resolveUniqueOrganizationTaxPolicyAt({");
    expect(service).toContain('route !== "simple_forward_confirmation"');
    expect(service).toContain("sourceTaxBasis: sourceTaxBasis as Exclude<SourceTaxBasis");
    expect(service).toContain("sourceTaxRate: previous.source_tax_rate");
    expect(service).toContain("confirmSupplierPriceTaxEvidenceAtomic({");
    expect(service).toContain("forward_tax_confirmation: Current organization policy applied from confirmation time");
    expect(policies).toContain(".limit(2)");
    expect(policies).toContain('status: "ambiguous"');
  });
});
