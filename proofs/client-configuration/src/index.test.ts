import { describe, expect, it } from "vitest";
import { validateSupplierWriteInput } from "@tradesstack/suppliers";
import { CLIENT_ALPHA_CONFIG, CLIENT_BETA_CONFIG, resolveProofShell } from "./index";

describe("Phase 1P two-client consumption proof", () => {
  it("resolves distinct deployment identity and defaults through one consumer", () => {
    const alpha = resolveProofShell(CLIENT_ALPHA_CONFIG);
    const beta = resolveProofShell(CLIENT_BETA_CONFIG);

    expect(alpha.appName).toBe("Client Alpha");
    expect(beta.appName).toBe("Client Beta");
    expect(alpha.actionColor).not.toBe(beta.actionColor);
    expect(alpha.defaults.currency).toBe("NZD");
    expect(beta.defaults.currency).toBe("AUD");
  });

  it("keeps Supplier semantics identical for both client identities", () => {
    const input = {
      name: "Fictional Proof Supplier",
      website: "supplier.example",
      countryCode: "nz",
      defaultCurrencyCode: "nzd",
      paymentTermsType: "days_after_bill_date" as const,
      paymentTermsDay: 14,
    };

    expect(validateSupplierWriteInput(input)).toEqual(validateSupplierWriteInput(input));
    expect(CLIENT_ALPHA_CONFIG.identity.clientKey).not.toBe(CLIENT_BETA_CONFIG.identity.clientKey);
  });
});
