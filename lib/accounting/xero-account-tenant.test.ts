import { describe, expect, it } from "vitest";
import {
  formatExternalAccountingCode,
  getXeroAccountTenantId,
  isCostCodeAvailableForAccountingTenant,
} from "@/lib/accounting/xero-account-tenant";

describe("Xero account tenant filtering", () => {
  it("accepts only accounts imported for the connected Xero tenant", () => {
    const costCode = {
      external_provider: "xero",
      metadata: { tenantId: "tenant-current" },
    };

    expect(
      isCostCodeAvailableForAccountingTenant({
        costCode,
        provider: "xero",
        currentXeroTenantId: "tenant-current",
      }),
    ).toBe(true);
    expect(
      isCostCodeAvailableForAccountingTenant({
        costCode,
        provider: "xero",
        currentXeroTenantId: "tenant-old",
      }),
    ).toBe(false);
  });

  it("does not tenant-filter non-Xero providers", () => {
    expect(
      isCostCodeAvailableForAccountingTenant({
        costCode: { external_provider: "manual", metadata: {} },
        provider: "manual",
        currentXeroTenantId: null,
      }),
    ).toBe(true);
  });

  it("uses the provider account code instead of the collision-safe local code", () => {
    expect(
      formatExternalAccountingCode({
        code: "310-2",
        external_code: "310",
        name: "Cost of Goods Sold",
      }),
    ).toBe("310 - Cost of Goods Sold");
    expect(getXeroAccountTenantId({ metadata: { tenantId: "tenant-current" } })).toBe(
      "tenant-current",
    );
  });
});
