import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { UniversalLearningCursor, UniversalLearningResponse } from "@/lib/universal-learning/types";
import type { SupplierBillUclBusinessRecord } from "@/lib/universal-learning/supplier-bill-schema";

export type SupplierInvoiceUclDebugOptions = {
  organizationId: string;
  invoiceId: string | null;
  reviewMonth: string;
  limit: number;
  dryRun: boolean;
  skipMemory: boolean;
  skipAnthropic: boolean;
};

export type SupplierInvoiceUclDebugExecutionPolicy = {
  callAnthropic: boolean;
  createReviewRun: boolean;
  writeRunRecords: boolean;
  applyMemoryActions: boolean;
  advanceCursor: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_DEBUG_RECORDS = 12;
const DIVIDER = "=".repeat(60);
const FORBIDDEN_OUTPUT_KEYS = new Set([
  "apikey",
  "authorization",
  "cookie",
  "imagedata",
  "ocrtext",
  "pdfbytes",
  "rawocr",
  "refreshtoken",
  "servicerolekey",
  "signedurl",
  "storagekey",
  "storagepath",
]);

function currentReviewMonth() {
  return new Date().toISOString().slice(0, 7);
}

function requireOptionValue(argument: string, name: string) {
  const value = argument.slice(name.length + 1).trim();
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

export function parseSupplierInvoiceUclDebugArgs(
  argv: string[],
): SupplierInvoiceUclDebugOptions {
  let organizationId: string | null = null;
  let invoiceId: string | null = null;
  let reviewMonth = currentReviewMonth();
  let limit = 1;
  let dryRun = false;
  let skipMemory = false;
  let skipAnthropic = false;

  for (const argument of argv) {
    if (argument.startsWith("--organization=")) {
      organizationId = requireOptionValue(argument, "--organization");
    } else if (argument.startsWith("--invoice=")) {
      invoiceId = requireOptionValue(argument, "--invoice");
    } else if (argument.startsWith("--review-month=")) {
      reviewMonth = requireOptionValue(argument, "--review-month");
    } else if (argument.startsWith("--limit=")) {
      const parsed = Number.parseInt(requireOptionValue(argument, "--limit"), 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DEBUG_RECORDS) {
        throw new Error(`--limit must be an integer between 1 and ${MAX_DEBUG_RECORDS}.`);
      }
      limit = parsed;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--skip-memory") {
      skipMemory = true;
    } else if (argument === "--skip-anthropic") {
      skipAnthropic = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!organizationId) {
    throw new Error("--organization is required.");
  }
  if (!UUID_PATTERN.test(organizationId)) {
    throw new Error("--organization must be a UUID.");
  }
  if (invoiceId && !UUID_PATTERN.test(invoiceId)) {
    throw new Error("--invoice must be a UUID.");
  }
  if (!REVIEW_MONTH_PATTERN.test(reviewMonth)) {
    throw new Error("--review-month must be in YYYY-MM format.");
  }

  return {
    organizationId,
    invoiceId,
    reviewMonth,
    limit,
    dryRun,
    skipMemory,
    skipAnthropic,
  };
}

export function resolveSupplierInvoiceUclDebugExecutionPolicy(
  options: Pick<
    SupplierInvoiceUclDebugOptions,
    "dryRun" | "skipMemory" | "skipAnthropic"
  >,
): SupplierInvoiceUclDebugExecutionPolicy {
  const persistReview = !options.dryRun && !options.skipAnthropic;
  return {
    callAnthropic: !options.skipAnthropic,
    createReviewRun: persistReview,
    writeRunRecords: persistReview,
    applyMemoryActions: persistReview && !options.skipMemory,
    advanceCursor: persistReview,
  };
}

export function selectRequestedSupplierInvoiceDebugRecords(
  records: SupplierBillUclBusinessRecord[],
  invoiceId: string | null,
) {
  if (!invoiceId) return records;
  return records.filter((record) => record.source.sourceId === invoiceId);
}

export function getSupplierInvoiceUclDebugSupplier(
  record: SupplierBillUclBusinessRecord,
) {
  return { ...record.supplier };
}

function loadLocalEnvFiles() {
  const loadEnvFile = (process as typeof process & {
    loadEnvFile?: (file?: string) => void;
  }).loadEnvFile;
  if (!loadEnvFile) return;

  for (const filename of [".env.local", ".env"]) {
    const absolutePath = path.resolve(process.cwd(), filename);
    if (existsSync(absolutePath)) loadEnvFile(absolutePath);
  }
}

function installServerOnlyDevelopmentAlias() {
  const emptyServerOnlyModule = path.resolve(
    process.cwd(),
    "node_modules/next/dist/compiled/server-only/empty.js",
  );
  if (!existsSync(emptyServerOnlyModule)) {
    throw new Error(
      "Next.js server-only runtime shim is unavailable. Run npm install before using this script.",
    );
  }

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return {
          shortCircuit: true,
          url: pathToFileURL(emptyServerOnlyModule).href,
        };
      }
      return nextResolve(specifier, context);
    },
  });
}

function heading(title: string) {
  console.log(`\n${DIVIDER}\n${title}\n${DIVIDER}`);
}

function normalizeOutputKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function assertNoForbiddenOutput(value: unknown, pathLabel: string) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoForbiddenOutput(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_OUTPUT_KEYS.has(normalizeOutputKey(key))) {
      throw new Error(`Refusing to print forbidden field ${pathLabel}.${key}.`);
    }
    assertNoForbiddenOutput(child, `${pathLabel}.${key}`);
  }
}

function assertNoConfiguredSecrets(value: unknown, pathLabel: string) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const configuredSecrets = [
    process.env.ANTHROPIC_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.XERO_CLIENT_SECRET,
    process.env.XERO_TOKEN_ENCRYPTION_KEY,
  ].filter((secret): secret is string => typeof secret === "string" && secret.length >= 8);

  for (const secret of configuredSecrets) {
    if (serialized.includes(secret)) {
      throw new Error(`Refusing to print a configured secret from ${pathLabel}.`);
    }
  }
}

function assertNoForbiddenRawContent(value: string, pathLabel: string) {
  const forbiddenPatterns = [
    /\braw[_\s-]?ocr\b/i,
    /\bsigned[_\s-]?url\b/i,
    /\bstorage[_\s-]?(?:key|path)\b/i,
    /\bx-amz-signature\b/i,
    /\brefresh[_\s-]?token\b/i,
  ];
  if (forbiddenPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(`Refusing to print forbidden raw content from ${pathLabel}.`);
  }
}

function printSafeJson(value: unknown, pathLabel: string) {
  assertNoForbiddenOutput(value, pathLabel);
  assertNoConfiguredSecrets(value, pathLabel);
  console.log(JSON.stringify(value, null, 2));
}

function byteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function countMemoryActions(response: UniversalLearningResponse | null) {
  if (!response) {
    return {
      create: 0,
      reinforce: 0,
      update: 0,
      retire: 0,
      noAction: 0,
      total: 0,
    };
  }
  const result = {
    create: response.memoryActions.create.length,
    reinforce: response.memoryActions.reinforce.length,
    update: response.memoryActions.update.length,
    retire: response.memoryActions.retireOrDeactivate.length,
    noAction: response.memoryActions.noAction.length,
    total: 0,
  };
  result.total =
    result.create + result.reinforce + result.update + result.retire + result.noAction;
  return result;
}

function buildSelection(options: SupplierInvoiceUclDebugOptions) {
  return {
    organizationId: options.organizationId,
    containerType: "supplier_invoice" as const,
    reviewMonth: options.reviewMonth,
    runType: "monthly" as const,
    scopeKey: options.invoiceId
      ? `debug_supplier_invoice:${options.invoiceId}`
      : "organization",
  };
}

function nullCursor(): UniversalLearningCursor {
  return { updatedAt: null, id: null };
}

async function runSupplierInvoiceUclDebug(options: SupplierInvoiceUclDebugOptions) {
  const startedAt = Date.now();
  const policy = resolveSupplierInvoiceUclDebugExecutionPolicy(options);
  loadLocalEnvFiles();
  installServerOnlyDevelopmentAlias();

  const [
    { createDynamicAdminSupabaseClient },
    { prepareUniversalLearningReview, runUniversalConstructionLearningReview },
    { buildUniversalConstructionLearningPrompt },
    { compactSupplierBillBusinessRecordForPrompt },
    { assertValidSupplierBillUclBusinessRecord },
    { callUniversalConstructionLearningAnthropic },
    {
      coerceUniversalConstructionLearningResponseShape,
      normalizeUniversalConstructionLearningResponse,
    },
    { validateUniversalConstructionLearningResponse },
    { applyUniversalLearningMemoryActions },
  ] = await Promise.all([
    import("@/lib/universal-learning/supabase-dynamic-client"),
    import("@/lib/universal-learning/runner"),
    import("@/lib/universal-learning/prompt"),
    import("@/lib/universal-learning/supplier-bill-prompt"),
    import("@/lib/universal-learning/supplier-bill-schema"),
    import("@/lib/universal-learning/model"),
    import("@/lib/universal-learning/response-normalization"),
    import("@/lib/universal-learning/response-schema"),
    import("@/lib/universal-learning/memory-actions"),
  ]);

  const admin = createDynamicAdminSupabaseClient();
  const organizationResult = await admin
    .from<{ id: string; name: string }>("organizations")
    .select("id,name")
    .eq("id", options.organizationId)
    .maybeSingle();
  if (organizationResult.error) throw new Error(organizationResult.error.message);
  if (!organizationResult.data) {
    throw new Error(`Organization ${options.organizationId} was not found.`);
  }

  console.log("Connected.");
  console.log(`Organization: ${organizationResult.data.name} (${organizationResult.data.id})`);
  console.log(`Supplier Invoice: ${options.invoiceId ?? "monthly production selection"}`);
  console.log(`Mode: ${options.dryRun ? "dry run" : "write-enabled debug run"}`);

  const selection = buildSelection(options);
  let prepared: Awaited<ReturnType<typeof prepareUniversalLearningReview>>;
  try {
    prepared = await prepareUniversalLearningReview({
      selection,
      supplierBillRecordLimit: options.limit,
      sourceIds: options.invoiceId ? [options.invoiceId] : undefined,
      cursorOverride: options.invoiceId ? nullCursor() : undefined,
    });
  } catch (error) {
    heading("VALIDATION FAILED");
    console.error(error);
    throw error;
  }
  const selectedRecords = selectRequestedSupplierInvoiceDebugRecords(
    prepared.builderResult.records as SupplierBillUclBusinessRecord[],
    options.invoiceId,
  );
  if (selectedRecords.length === 0) {
    throw new Error(
      options.invoiceId
        ? `Supplier Invoice ${options.invoiceId} was not found in organization ${options.organizationId}.`
        : "The production monthly selection returned no eligible Supplier Invoices.",
    );
  }

  heading("SELECTED INVOICES");
  for (const record of selectedRecords) {
    console.log([
      `Invoice Number: ${record.payload.sourceEvidence.bill.billNumber ?? "(none)"}`,
      `Supplier: ${record.payload.sourceEvidence.supplier.displayName ?? "(none)"}`,
      `Status: ${record.status.canonicalStatus}`,
      `Updated: ${record.updatedAt}`,
      `Source ID: ${record.source.sourceId}`,
    ].join("\n"));
    console.log("-".repeat(40));
  }

  heading("SUPPLIER INVOICE UCL BUILDER COMPLETE");
  for (const record of selectedRecords) {
    console.log(`Source ID: ${record.source.sourceId}`);
    console.log(`Schema version: ${record.payload.schemaVersion}`);
    console.log(`Builder version: ${record.payload.provenance.builderVersion}`);
    console.log(`Payload bytes: ${byteLength(record.payload)}`);
    console.log(`Content hash: ${record.payload.provenance.contentHash ?? "(none)"}`);
    printSafeJson({
      visibility: record.payload.visibility,
      linkedContext: record.linkedContext,
      routingContextSummary: {
        readOnly: record.routingContext.readOnly,
        organizationCostCodeCount: record.routingContext.organizationCostCodeIds.length,
        accountingMappingCount: record.routingContext.accountingMappingIds.length,
        tradesstackCostCodeCount: record.routingContext.tradesstackCostCodes.length,
        xeroAccountCodeCount: record.routingContext.xeroAccountCodes.length,
        xeroTaxTypeCount: record.routingContext.xeroTaxTypes.length,
      },
    }, "builderSummary");
  }

  for (const record of selectedRecords) {
    try {
      assertValidSupplierBillUclBusinessRecord(record);
      console.log(`Validation Passed: ${record.source.sourceId}`);
    } catch (error) {
      console.error(`Validation Failed: ${record.source.sourceId}`);
      console.error(error);
      throw error;
    }
  }

  heading("========== CANONICAL UCL ==========");
  printSafeJson(selectedRecords, "canonicalUcl");

  const projections = selectedRecords.map((record) =>
    compactSupplierBillBusinessRecordForPrompt(record));
  heading("========== PROMPT PROJECTION ==========");
  projections.forEach(({ projection, diagnostics }) => {
    printSafeJson({
      sourceId: diagnostics.sourceId,
      bytes: diagnostics.promptBytes,
      estimatedTokens: diagnostics.estimatedTokens,
      omittedCounts: {
        lines: diagnostics.canonicalLineCount - diagnostics.promptLineCount,
        allocations:
          diagnostics.canonicalAllocationCount - diagnostics.promptAllocationCount,
        matches: diagnostics.canonicalMatchCount - diagnostics.promptMatchCount,
      },
      truncated: diagnostics.canonicalTruncated,
      projected: projection,
    }, "promptProjection");
  });

  if (!policy.callAnthropic) {
    console.log("\n--skip-anthropic supplied; stopping after prompt projection.");
    return;
  }

  let normalizedResponse: UniversalLearningResponse | null = null;
  let anthropicRequest: unknown = null;
  let anthropicRawText = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let appliedCount = 0;
  let reviewRunId: string | null = null;

  if (options.dryRun) {
    prepared.promptPacket.reviewMeta.reviewId = `debug-dry-run-${Date.now()}`;
    const prompt = buildUniversalConstructionLearningPrompt(prepared.promptPacket);
    const modelResult = await callUniversalConstructionLearningAnthropic(prompt, {
      captureDiagnostic: true,
    });
    anthropicRequest = modelResult.diagnostic?.request ?? null;
    anthropicRawText = modelResult.rawText;
    inputTokens = modelResult.inputTokens;
    outputTokens = modelResult.outputTokens;
    const coerced = coerceUniversalConstructionLearningResponseShape(modelResult.parsedJson);
    const validation = validateUniversalConstructionLearningResponse(coerced);
    if (!validation.success) throw new Error(validation.error);
    normalizedResponse = normalizeUniversalConstructionLearningResponse(validation.data);
  } else {
    const modelInvoker = async (
      prompt: Parameters<typeof callUniversalConstructionLearningAnthropic>[0],
    ) => {
      const result = await callUniversalConstructionLearningAnthropic(prompt, {
        captureDiagnostic: true,
      });
      anthropicRequest = result.diagnostic?.request ?? null;
      anthropicRawText = result.rawText;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      return result;
    };

    const runResult = await runUniversalConstructionLearningReview({
      selection,
      preparedReview: prepared,
      diagnostic: true,
      supplierBillRecordLimit: options.limit,
      modelInvoker,
      applyMemoryActions: async (args) => {
        normalizedResponse = args.response;
        if (!policy.applyMemoryActions) return { appliedCount: 0 };
        return applyUniversalLearningMemoryActions({
          reviewRunId: args.reviewRunId,
          selection: args.selection,
          response: args.response,
          records: args.records,
          existingMemories: args.existingMemories,
        });
      },
    });
    reviewRunId = runResult.reviewRunId;
    appliedCount = runResult.appliedCount;
    if ("diagnostic" in runResult && runResult.diagnostic) {
      normalizedResponse =
        runResult.diagnostic.normalizedResponse as UniversalLearningResponse;
    }
  }

  heading("========== ANTHROPIC REQUEST ==========");
  printSafeJson(anthropicRequest, "anthropicRequest");

  heading("========== RAW ANTHROPIC RESPONSE ==========");
  assertNoConfiguredSecrets(anthropicRawText, "anthropicRawText");
  assertNoForbiddenRawContent(anthropicRawText, "anthropicRawText");
  console.log(anthropicRawText);

  heading("========== NORMALIZED RESPONSE ==========");
  printSafeJson(normalizedResponse, "normalizedResponse");

  const actionCounts = countMemoryActions(normalizedResponse);
  heading("========== MEMORY ACTIONS ==========");
  printSafeJson({
    generated: actionCounts,
    createdOrUpdated: appliedCount,
    skipped: options.dryRun || options.skipMemory
      ? actionCounts.total
      : actionCounts.noAction,
    rejected: 0,
    applied: policy.applyMemoryActions,
  }, "memoryActions");

  const firstRecord = selectedRecords[0];
  heading("========== SUMMARY ==========");
  printSafeJson({
    reviewRunId,
    supplierInvoice: firstRecord.payload.sourceEvidence.bill.billNumber,
    supplier: getSupplierInvoiceUclDebugSupplier(firstRecord),
    selectedInvoiceCount: selectedRecords.length,
    canonicalBytes: selectedRecords.reduce((sum, record) => sum + byteLength(record), 0),
    promptBytes: projections.reduce(
      (sum, projection) => sum + projection.diagnostics.promptBytes,
      0,
    ),
    inputTokens,
    outputTokens,
    memoryActions: actionCounts,
    appliedMemoryActions: appliedCount,
    dryRun: options.dryRun,
    elapsedMilliseconds: Date.now() - startedAt,
  }, "summary");
}

async function main() {
  try {
    const options = parseSupplierInvoiceUclDebugArgs(process.argv.slice(2));
    await runSupplierInvoiceUclDebug(options);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  void main();
}
