import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";
import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";

const interpretStructuredDocument = vi.fn();
vi.mock("@/lib/document-intelligence/structured-interpreter", () => ({ interpretStructuredDocument }));

const source: DocumentSourcePart = {
  id: "source-1",
  kind: "pdf",
  fileName: "prices.pdf",
  mimeType: "application/pdf",
  sizeBytes: 10,
  pageCount: 1,
  content: new Uint8Array([1]),
  metadata: {},
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  interpretStructuredDocument.mockReset();
});

describe("Material supplier pricing paid-call policy", () => {
  it.each([
    ["provider_timeout", true],
    ["provider_billing_error", false],
    ["provider_max_tokens", false],
    ["provider_schema_parse_failed", false],
  ] as const)("uses one provider call for terminal %s", async (code, retryable) => {
    interpretStructuredDocument.mockRejectedValue(new DocumentIntelligenceError({ code, message: code, retryable }));
    const { interpretMaterialSupplierPricing } = await import("@/lib/materials/supplier-pricing-intelligence/interpret");
    await expect(interpretMaterialSupplierPricing({ sourceParts: [source], selectedSupplierName: "Trade Direct" }))
      .rejects.toMatchObject({ code });
    expect(interpretStructuredDocument).toHaveBeenCalledTimes(1);
  });

  it("bounds an eligible transient provider failure to two calls", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    interpretStructuredDocument.mockRejectedValue(new DocumentIntelligenceError({
      code: "provider_server_error",
      message: "temporary provider failure",
      retryable: true,
    }));
    const { interpretMaterialSupplierPricing } = await import("@/lib/materials/supplier-pricing-intelligence/interpret");
    const interpretation = interpretMaterialSupplierPricing({ sourceParts: [source], selectedSupplierName: "Trade Direct" });
    const assertion = expect(interpretation).rejects.toMatchObject({ code: "provider_server_error" });
    await vi.runAllTimersAsync();
    await assertion;
    expect(interpretStructuredDocument).toHaveBeenCalledTimes(2);
  });

  it("does not resend after a contract validation failure", async () => {
    interpretStructuredDocument.mockResolvedValue({
      value: { contractVersion: "wrong-contract" },
      run: {},
    });
    const { interpretMaterialSupplierPricing } = await import("@/lib/materials/supplier-pricing-intelligence/interpret");
    await expect(interpretMaterialSupplierPricing({ sourceParts: [source], selectedSupplierName: "Trade Direct" }))
      .rejects.toThrow();
    expect(interpretStructuredDocument).toHaveBeenCalledTimes(1);
  });
});
