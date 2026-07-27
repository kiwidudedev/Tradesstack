import { describe, expect, it } from "vitest";
import {
  getXeroInvoiceScopeStatus,
  hasXeroInvoiceScope,
  XERO_INVOICE_SCOPE_RECONNECT_MESSAGE,
} from "@/lib/xero/scopes";

describe("Xero granular invoice scope", () => {
  it("allows Bill readiness when accounting.invoices is granted", () => {
    expect(
      hasXeroInvoiceScope([
        "openid",
        "profile",
        "email",
        "accounting.settings",
        "accounting.contacts",
        "accounting.invoices",
        "offline_access",
      ]),
    ).toBe(true);
  });

  it("blocks Bill readiness when accounting.invoices is missing", () => {
    expect(
      hasXeroInvoiceScope([
        "openid",
        "profile",
        "email",
        "accounting.settings",
        "accounting.contacts",
        "offline_access",
      ]),
    ).toBe(false);
  });

  it("does not treat accounting.settings and accounting.contacts as Bill access", () => {
    expect(
      hasXeroInvoiceScope(["accounting.settings", "accounting.contacts"]),
    ).toBe(false);
  });

  it("does not require or accept the legacy broad transaction scope", () => {
    expect(hasXeroInvoiceScope(["accounting.transactions"])).toBe(false);
    expect(hasXeroInvoiceScope(["accounting.invoices"])).toBe(true);
  });

  it("uses provider-neutral reconnect wording in active UI and readiness messages", () => {
    expect(getXeroInvoiceScopeStatus(["accounting.contacts"])).toBe(
      "Reconnect Xero to grant invoice and Bill access.",
    );
    expect(getXeroInvoiceScopeStatus(["accounting.invoices"])).toBe(
      "accounting.invoices granted",
    );
    expect(XERO_INVOICE_SCOPE_RECONNECT_MESSAGE).toBe(
      "Reconnect Xero to grant invoice and Bill access.",
    );
  });
});
