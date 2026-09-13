import type { DocumentSourcePart } from "@/lib/document-intelligence/contracts";
import { isDocumentIntelligenceError } from "@/lib/document-intelligence/errors";
import { interpretStructuredDocument } from "@/lib/document-intelligence/structured-interpreter";
import {
  MATERIAL_SUPPLIER_PRICING_CONTRACT_VERSION,
  MATERIAL_SUPPLIER_PRICING_PROMPT_VERSION,
  type MaterialSupplierPricingInterpretation,
  type MaterialSupplierPricingV1,
} from "@/lib/materials/supplier-pricing-intelligence/contract";
import { buildMaterialSupplierPricingInstructions } from "@/lib/materials/supplier-pricing-intelligence/prompt";
import { MATERIAL_SUPPLIER_PRICING_JSON_SCHEMA } from "@/lib/materials/supplier-pricing-intelligence/schema";
import { validateMaterialSupplierPricingV1 } from "@/lib/materials/supplier-pricing-intelligence/validate";

const MAX_TRANSIENT_PROVIDER_CALLS = 2;
const AUTOMATIC_RETRY_CODES = new Set([
  "provider_rate_limited",
  "provider_server_error",
  "provider_unknown_error",
]);

async function interpretPart(part: DocumentSourcePart, selectedSupplierName: string) {
  const prompt = buildMaterialSupplierPricingInstructions({ selectedSupplierName, sourcePartIds: [part.id] });
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_TRANSIENT_PROVIDER_CALLS; attempt += 1) {
    try {
      const response = await interpretStructuredDocument("anthropic", {
        ...prompt,
        schema: MATERIAL_SUPPLIER_PRICING_JSON_SCHEMA,
        sourceParts: [part],
        contractVersion: MATERIAL_SUPPLIER_PRICING_CONTRACT_VERSION,
        promptVersion: MATERIAL_SUPPLIER_PRICING_PROMPT_VERSION,
        attemptNumber: attempt,
      });
      return { result: validateMaterialSupplierPricingV1(response.value, [part]), run: response.run };
    } catch (error) {
      lastError = error;
      if (
        !isDocumentIntelligenceError(error)
        || !error.retryable
        || !AUTOMATIC_RETRY_CODES.has(error.code)
        || attempt === MAX_TRANSIENT_PROVIDER_CALLS
      ) break;
      const hintedDelay = typeof error.safeMetadata.retryAfterMs === "number" ? error.safeMetadata.retryAfterMs : 0;
      const backoff = Math.min(30_000, Math.max(hintedDelay, 500 * (2 ** (attempt - 1))));
      await new Promise((resolve) => setTimeout(resolve, backoff + Math.floor(Math.random() * 250)));
    }
  }
  throw lastError;
}

export async function interpretMaterialSupplierPricing(input: {
  sourceParts: DocumentSourcePart[];
  selectedSupplierName: string;
}): Promise<MaterialSupplierPricingInterpretation> {
  const successes: Array<Awaited<ReturnType<typeof interpretPart>> & { sourcePartId: string }> = [];
  const failedSourceParts: MaterialSupplierPricingInterpretation["failedSourceParts"] = [];
  const failures: unknown[] = [];
  for (const part of input.sourceParts) {
    try { successes.push({ ...(await interpretPart(part, input.selectedSupplierName)), sourcePartId: part.id }); }
    catch (error) {
      failures.push(error);
      failedSourceParts.push({ sourcePartId: part.id, errorCode: isDocumentIntelligenceError(error) ? error.code : "provider_unknown_error", retryable: isDocumentIntelligenceError(error) && error.retryable });
    }
  }
  if (successes.length === 0) throw failures[0] ?? new Error(`Could not interpret document (${failedSourceParts[0]?.errorCode ?? "provider_unknown_error"}).`);

  const first = successes[0]!.result;
  const rows = successes.flatMap(({ result, sourcePartId }) => result.rows.map((row) => {
    const prefix = sourcePartId;
    const priceMap = new Map(row.prices.map((price) => [price.priceKey, `${prefix}:${price.priceKey}`]));
    return { ...row, rowKey: `${prefix}:${row.rowKey}`, prices: row.prices.map((price) => ({ ...price, priceKey: priceMap.get(price.priceKey)! })), priceRecommendation: { ...row.priceRecommendation, priceKey: row.priceRecommendation.priceKey ? priceMap.get(row.priceRecommendation.priceKey) ?? null : null } };
  }));
  const result: MaterialSupplierPricingV1 = {
    ...first,
    rows,
    warnings: [
      ...successes.flatMap((entry) => entry.result.warnings),
      ...failedSourceParts.map((failure) => ({ code: "source_part_failed", severity: "warning" as const, message: `Source part ${failure.sourcePartId} could not be interpreted (${failure.errorCode}).` })),
    ],
    extractionMeta: { ...first.extractionMeta, sourcePartCount: input.sourceParts.length, rowCount: rows.length, partial: failedSourceParts.length > 0 || successes.some((entry) => entry.result.extractionMeta.partial) },
  };
  return { result, runs: successes.map((entry) => entry.run), failedSourceParts };
}
