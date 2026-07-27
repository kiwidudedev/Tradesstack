import { describe, expect, it } from "vitest";
import type { XeroAccount } from "@/lib/xero/types";

function readXeroAccountString(account: XeroAccount, ...keys: Array<keyof XeroAccount>) {
  for (const key of keys) {
    const value = account[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeProbe(account: XeroAccount) {
  const externalCode = readXeroAccountString(account, "code", "Code");
  const accountId = readXeroAccountString(account, "accountID", "AccountID");
  const name = readXeroAccountString(account, "name", "Name") ?? "Untitled account";

  return { externalCode, accountId, name };
}

describe("xero account normalization", () => {
  it("accepts PascalCase account payloads returned by live Xero accounts", () => {
    expect(
      normalizeProbe({
        AccountID: "acc-123",
        Code: "4200",
        Name: "Sales",
        Description: "Revenue",
        Type: "REVENUE",
        Status: "ACTIVE",
        TaxType: "OUTPUT2",
      }),
    ).toEqual({
      externalCode: "4200",
      accountId: "acc-123",
      name: "Sales",
    });
  });

  it("still accepts camelCase account payloads", () => {
    expect(
      normalizeProbe({
        accountID: "acc-456",
        code: "4300",
        name: "Consulting",
      }),
    ).toEqual({
      externalCode: "4300",
      accountId: "acc-456",
      name: "Consulting",
    });
  });
});
