import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("supplier browser write regressions", () => {
  it("removes direct supplier writes from the main suppliers workspace", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "app/app/(workspace)/company/suppliers/CompanySuppliersWorkspace.tsx",
      ),
      "utf8",
    );

    expect(source).not.toContain('.from("organization_suppliers")');
    expect(source).toContain("saveSupplierAction");
    expect(source).toContain("setSupplierActiveStateAction");
  });

  it("removes direct inline supplier writes from the purchase order page", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx",
      ),
      "utf8",
    );

    expect(source).not.toContain('.from("organization_suppliers").insert');
    expect(source).toContain("createPurchaseOrderInlineSupplierAction");
  });
});
