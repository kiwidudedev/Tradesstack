import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { acceptedCommercialVarianceKeysFromApproval } from "@/lib/procurement-commercial-server";

describe("persisted commercial variance acceptance", () => {
  it("retains accepted warning keys from the active commercial approval", () => {
    const keys = acceptedCommercialVarianceKeysFromApproval([
      {
        key: "quantity_variance:line-1",
        type: "quantity_variance",
        note: "Reviewed and accepted.",
        purchaseOrderLineItemId: "line-1",
        expectedValue: 1,
        actualValue: 0.7,
        varianceAmount: -0.3,
      },
    ]);

    expect(keys.has("quantity_variance:line-1")).toBe(true);
  });

  it("does not accept malformed or unexplained stored entries", () => {
    const keys = acceptedCommercialVarianceKeysFromApproval([
      { key: "quantity_variance:line-1", type: "quantity_variance", note: "" },
      { key: "quantity_variance:line-2" },
    ]);

    expect(keys.size).toBe(0);
  });
});
