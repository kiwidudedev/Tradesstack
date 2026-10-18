import { readFileSync, readdirSync } from "node:fs";
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

  it("exposes the Worker App binding, compatibility and capability surface", () => {
    const contract = assembleOperationalContract();
    const alpha = contract.customers.find((customer) => customer.customerId === "client-alpha");
    expect(validateOperationalContract(contract)).toEqual([]);
    const registry = JSON.parse(readFileSync(new URL("../../ops/clients.json", import.meta.url), "utf8"));
    const expectedRelease = registry.clients.find((client) => client.clientId === "client-alpha").worker.targetWorkerRelease;
    expect(alpha.worker.release.value).toBe(expectedRelease);
    expect(alpha.worker.compatibility.value).toBe("COMPATIBLE");
    expect(alpha.worker.compatibilityReasons.value).toEqual([]);
    expect(alpha.worker.distributionChannel.value).toBe("internal");
    expect(alpha.worker.profileFingerprintRecorded.value).toBe(true);
    expect(alpha.worker.enabledCustomisations.value.modules).toEqual(
      expect.arrayContaining(["dashboard", "time_clock", "tasks", "purchase_orders", "variations"]),
    );
    expect(alpha.worker.enabledCustomisations.value.extensions).toEqual(["home-notice"]);
    expect(alpha.worker.upgradeRecord.value).toMatch(/ops\/worker\/upgrades\/client-alpha\//);
    expect(alpha.worker.storePublishState.value).toBe("NOT_APPROVED_BY_THIS_CONTRACT");
    const expectedReleases = readdirSync(new URL("../../ops/worker/releases", import.meta.url))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, ""))
      .sort((left, right) => {
        const a = left.split(".").map(Number);
        const b = right.split(".").map(Number);
        for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return b[index] - a[index];
        return 0;
      });
    expect(contract.main.workerReleases.map((release) => release.releaseId)).toEqual(expectedReleases);
  });

  it("rejects a malformed Worker binding record", () => {
    const contract = minimalContract();
    contract.customers[0].worker = {
      compatibility: { value: "NOT_A_STATE" },
      release: { value: "not-semver" },
      releaseFingerprint: { value: "short" },
    };
    const errors = validateOperationalContract(contract);
    expect(errors).toEqual(expect.arrayContaining([
      "customers[0].worker.compatibility invalid",
      "customers[0].worker.release invalid",
      "customers[0].worker.releaseFingerprint invalid",
    ]));
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
