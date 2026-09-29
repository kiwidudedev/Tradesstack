import { describe, expect, it } from "vitest";
import {
  CORE_CONTRACTS_PACKAGE_VERSION,
  type CoreContractsPackageMarker,
} from "@tradesstack/core-contracts";

describe("@tradesstack/core-contracts foundation", () => {
  it("exposes only the package foundation marker", () => {
    const marker: CoreContractsPackageMarker = CORE_CONTRACTS_PACKAGE_VERSION;

    expect(marker).toBe("0.0.0");
  });
});
