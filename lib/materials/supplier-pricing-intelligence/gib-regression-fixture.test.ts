import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPdfSourceParts } from "@/lib/document-intelligence/sources/pdf";
import { interpretMaterialSupplierPricing } from "@/lib/materials/supplier-pricing-intelligence/interpret";
import { mapMaterialSupplierPricingToImportRows } from "@/lib/materials/supplier-pricing-intelligence/import-row-mapper";
import {
  TRADE_DIRECT_GIB_2026_EXPECTED,
  TRADE_DIRECT_GIB_2026_SHA256,
  tradeDirectGib2026StructuredResponse,
} from "@/tests/fixtures/materials/supplier-pricing/trade-direct-gib-2026";

const fixturePath = "tests/fixtures/materials/supplier-pricing/trade-direct-gib-2026.pdf";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("real Metro GIB supplier-price regression fixture", () => {
  it("pins the exact unmodified three-page source PDF", async () => {
    const bytes = await readFile(fixturePath);
    expect(bytes).toHaveLength(99_364);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(TRADE_DIRECT_GIB_2026_SHA256);
    const parts = await createPdfSourceParts({ fileName: "trade-direct-gib-2026.pdf", bytes });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ pageCount: 3, sizeBytes: 99_364, id: "source-1" });
  });

  it("validates and maps a mocked Anthropic response tied to the real PDF", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-test-key");
    const bytes = await readFile(fixturePath);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { messages: Array<{ content: Array<Record<string, unknown>> }> };
      const content = request.messages[0]!.content;
      expect(content).toHaveLength(2);
      expect(content.filter((block) => block.type === "document")).toHaveLength(1);
      return new Response(JSON.stringify({
        id: "fixture-request-1",
        structured_output: tradeDirectGib2026StructuredResponse(),
        usage: { input_tokens: 2_000, output_tokens: 4_000 },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const sourceParts = await createPdfSourceParts({ fileName: "trade-direct-gib-2026.pdf", bytes });
    const interpreted = await interpretMaterialSupplierPricing({ sourceParts, selectedSupplierName: "Trade Direct" });
    const mapped = mapMaterialSupplierPricingToImportRows({ canonical: interpreted.result, runs: interpreted.runs });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(interpreted.runs.map((run) => run.attemptNumber)).toEqual([1]);
    expect(interpreted.result.rows).toHaveLength(TRADE_DIRECT_GIB_2026_EXPECTED.length);
    expect(mapped).toHaveLength(TRADE_DIRECT_GIB_2026_EXPECTED.length);
    for (const expected of TRADE_DIRECT_GIB_2026_EXPECTED) {
      const row = interpreted.result.rows.find((candidate) => candidate.proposedMaterialName.value === expected.name);
      expect(row?.supplierUnit.value).toBe(expected.unit);
      expect(Object.fromEntries(row?.prices.map((candidate) => [candidate.label.value?.replace(/\s+price$/i, "").toUpperCase(), candidate.amount.value]) ?? []))
        .toEqual({ FIS: expected.fis, DTS1: expected.dts1, DTS2: expected.dts2 });
      const review = mapped.find((candidate) => candidate.extractedName === expected.name);
      expect(review?.extractedUnit).toBe("m2");
      expect(review?.extractedUnitCost).toBe(expected.fis);
      expect(review?.sourcePayload).toMatchObject({
        selectedPriceKey: null,
        recommendedPriceKey: `source-1:fis`,
      });
    }
    expect(mapped.some((row) => /^\d+(?:\.\d+)?\s*(?:\$|m2?)?$/i.test(row.extractedName))).toBe(false);
  });
});
