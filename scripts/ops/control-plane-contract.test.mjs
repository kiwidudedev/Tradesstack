import { describe, expect, it } from "vitest";
import { assembleOperationalContract, validateOperationalContract } from "./control-plane-contract.mjs";

const validSha = "1111111111111111111111111111111111111111";

function minimalContract(overrides = {}) {
  return {
    schemaVersion: 1,
    contract: "tradesstack-owner-operational",
    customers: [{
      customerId: "client-alpha",
      lifecycle: { value: "ACTIVE" },
      repository: { expectedMainSourceSha: { value: validSha }, observedCustomerSha: { value: null }, lastRecordedCustomerSha: { value: null }, historicalCommissionedSha: { value: null } },
      release: { approvedMainSourceSha: { value: validSha } },
      migration: {}, configuration: {}, deployment: {}, providers: {}, differences: { records: [] }, backup: {}, health: {}, upgrade: {},
      ...overrides,
    }],
  };
}

describe("Control Plane operational contract", () => {
  it("assembles Alpha with expected, historical and unknown runtime values separated", () => {
    const contract = assembleOperationalContract();
    const alpha = contract.customers.find((customer) => customer.customerId === "client-alpha");
    expect(validateOperationalContract(contract)).toEqual([]);
    expect(alpha.release.approvedMainRelease.classification).toBe("EXPECTED");
    expect(alpha.deployment.currentProduction.evidence.verification).toBe("NOT_VERIFIED");
    expect(alpha.deployment.historicalCommissioningDeployment.classification).toBe("HISTORICAL");
    expect(alpha.migration.expectedMigrationTarget.classification).toBe("EXPECTED");
    expect(alpha.migration.observedMigrationState.evidence.verification).toBe("NOT_VERIFIED");
  });

  it("rejects malformed, duplicate and unknown customer records", () => {
    const malformed = minimalContract();
    malformed.customers[0].customerId = "Not Safe";
    expect(validateOperationalContract(malformed)).toContain("customers[0].customerId invalid");

    const duplicate = minimalContract();
    duplicate.customers.push(minimalContract().customers[0]);
    expect(validateOperationalContract(duplicate)).toContain("duplicate customerId client-alpha");
  });

  it("rejects malformed release SHAs and invalid evidence states", () => {
    const contract = minimalContract();
    contract.customers[0].repository.expectedMainSourceSha.value = "not-a-sha";
    contract.customers[0].lifecycle.value = "UNKNOWN";
    contract.customers[0].release.approvedMainSourceSha.evidence = { verification: "NOPE", freshness: "NOPE" };
    expect(validateOperationalContract(contract)).toEqual(expect.arrayContaining([
      "customers[0] contains malformed SHA",
      "customers[0].lifecycle invalid",
      "customers[0].release.approvedMainSourceSha.evidence invalid",
    ]));
  });

  it("validates differences, ownership and duplicate difference IDs", () => {
    const contract = minimalContract();
    const difference = { differenceId: "DIFF-001", customerId: "client-alpha", category: "EXTENSION", status: "ACTIVE", kind: "APPROVED_CUSTOMER_EXTENSION" };
    contract.customers[0].differences.records = [difference, { ...difference }];
    expect(validateOperationalContract(contract)).toContain("duplicate differenceId DIFF-001");
    contract.customers[0].differences.records[1] = { ...difference, differenceId: "DIFF-002", customerId: "client-beta" };
    expect(validateOperationalContract(contract)).toContain("customers[0].differences.records[1].customerId does not match customer");
  });

  it("does not accept secret-like values", () => {
    const contract = minimalContract();
    contract.customers[0].repository.secret = "sk-proj-12345678901234567890";
    expect(validateOperationalContract(contract).some((error) => error.includes("secret-like"))).toBe(true);
  });
});
