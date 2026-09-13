import { existsSync } from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type PaymentClaimUclDebugOptions = {
  organizationId: string;
  claimId: string | null;
  reviewMonth: string;
  limit: number;
  dryRun: boolean;
  skipAnthropic: boolean;
  skipMemory: boolean;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_RECORDS = 12;
const FORBIDDEN_KEYS = new Set([
  "apikey",
  "authorization",
  "cookie",
  "rawocr",
  "ocrtext",
  "pdfbytes",
  "imagebytes",
  "signedurl",
  "storagepath",
  "storagekey",
  "accesstoken",
  "refreshtoken",
  "bankaccount",
]);
const registerHooks = (nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      nextResolve: (specifier: string, context: unknown) => unknown,
    ) => unknown;
  }) => void;
}).registerHooks;

function optionValue(argument: string, name: string) {
  const value = argument.slice(name.length + 1).trim();
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

export function parsePaymentClaimUclDebugArgs(
  argv: string[],
): PaymentClaimUclDebugOptions {
  let organizationId: string | null = null;
  let claimId: string | null = null;
  let reviewMonth = new Date().toISOString().slice(0, 7);
  let limit = 1;
  let dryRun = false;
  let skipAnthropic = false;
  let skipMemory = false;

  for (const argument of argv) {
    if (argument.startsWith("--organization=")) {
      organizationId = optionValue(argument, "--organization");
    } else if (argument.startsWith("--claim=")) {
      claimId = optionValue(argument, "--claim");
    } else if (argument.startsWith("--review-month=")) {
      reviewMonth = optionValue(argument, "--review-month");
    } else if (argument.startsWith("--limit=")) {
      limit = Number.parseInt(optionValue(argument, "--limit"), 10);
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--skip-anthropic") {
      skipAnthropic = true;
    } else if (argument === "--skip-memory") {
      skipMemory = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!organizationId || !UUID.test(organizationId)) {
    throw new Error("--organization must be a UUID.");
  }
  if (claimId && !UUID.test(claimId)) {
    throw new Error("--claim must be a UUID.");
  }
  if (!MONTH.test(reviewMonth)) {
    throw new Error("--review-month must be in YYYY-MM format.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECORDS) {
    throw new Error(`--limit must be an integer between 1 and ${MAX_RECORDS}.`);
  }
  if (!dryRun) {
    throw new Error(
      "The Payment Claim UCL diagnostic is read-only. Pass --dry-run explicitly.",
    );
  }

  return {
    organizationId,
    claimId,
    reviewMonth,
    limit,
    dryRun,
    skipAnthropic,
    skipMemory,
  };
}

function loadEnv() {
  const loader = (process as typeof process & {
    loadEnvFile?: (file?: string) => void;
  }).loadEnvFile;
  if (!loader) return;
  for (const file of [".env.local", ".env"]) {
    const absolute = path.resolve(process.cwd(), file);
    if (existsSync(absolute)) loader(absolute);
  }
}

function installServerOnlyAlias() {
  const emptyModule = path.resolve(
    process.cwd(),
    "node_modules/next/dist/compiled/server-only/empty.js",
  );
  if (!existsSync(emptyModule)) {
    throw new Error("Next.js server-only shim is unavailable. Run npm install.");
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return { shortCircuit: true, url: pathToFileURL(emptyModule).href };
      }
      return nextResolve(specifier, context);
    },
  });
}

function normalizedKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function assertSafe(value: unknown, pathLabel: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafe(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(normalizedKey(key))) {
      throw new Error(`Refusing to print ${pathLabel}.${key}.`);
    }
    assertSafe(child, `${pathLabel}.${key}`);
  }
}

function printJson(title: string, value: unknown) {
  assertSafe(value, title);
  console.log(`\n${title}`);
  console.log(JSON.stringify(value, null, 2));
}

function byteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Payment Claim UCL debug runner is disabled in production.");
  }
  loadEnv();
  installServerOnlyAlias();
  const options = parsePaymentClaimUclDebugArgs(process.argv.slice(2));
  const startedAt = Date.now();

  const [
    { prepareUniversalLearningReview },
    { buildUniversalConstructionLearningPrompt, buildModelVisiblePromptPacket },
    { callUniversalConstructionLearningAnthropic },
    { coerceUniversalConstructionLearningResponseShape, normalizeUniversalConstructionLearningResponse },
    { validateUniversalConstructionLearningResponse },
  ] = await Promise.all([
    import("@/lib/universal-learning/runner"),
    import("@/lib/universal-learning/prompt"),
    import("@/lib/universal-learning/model"),
    import("@/lib/universal-learning/response-normalization"),
    import("@/lib/universal-learning/response-schema"),
  ]);

  const prepared = await prepareUniversalLearningReview({
    selection: {
      organizationId: options.organizationId,
      containerType: "project_claim",
      reviewMonth: options.reviewMonth,
      runType: "manual",
      scopeKey: options.claimId ? `claim:${options.claimId}` : "monthly-debug",
    },
    sourceIds: options.claimId ? [options.claimId] : undefined,
    cursorOverride: options.claimId ? { updatedAt: null, id: null } : undefined,
    paymentClaimRecordLimit: options.limit,
  });
  if (options.skipMemory) {
    prepared.memoryPack.splice(0, prepared.memoryPack.length);
    prepared.promptPacket.existingRelevantMemories = [];
  }

  const prompt = buildUniversalConstructionLearningPrompt(prepared.promptPacket);
  const modelVisible = buildModelVisiblePromptPacket(
    prepared.promptPacket,
  ) as { newBusinessActivity?: unknown[] } | undefined;
  const projectedRecords = Array.isArray(modelVisible?.newBusinessActivity)
    ? modelVisible.newBusinessActivity
    : [];
  const selected = prepared.builderResult.records[0] ?? null;
  const evidence = selected?.payload.sourceEvidence as Record<string, unknown> | undefined;

  console.log("connectionStatus: connected");
  console.log(`organization: ${options.organizationId}`);
  console.log(`selectedClaim: ${selected?.source.sourceId ?? "none"}`);
  console.log(`project: ${JSON.stringify(evidence?.project ?? null)}`);
  console.log(`client: ${JSON.stringify(evidence?.client ?? null)}`);
  console.log(`schemaVersion: ${String(selected?.payload.schemaVersion ?? "none")}`);
  console.log(`effectiveCursor: ${JSON.stringify(prepared.builderResult.nextCursorCandidate)}`);
  console.log(`canonicalBytes: ${byteLength(selected)}`);
  console.log(`promptBytes: ${byteLength(projectedRecords[0] ?? null)}`);
  console.log(`estimatedTokens: ${Math.ceil(byteLength(projectedRecords[0] ?? null) / 4)}`);
  printJson("canonicalPayload", selected);
  printJson("promptProjection", projectedRecords);

  let anthropicCalls = 0;
  let normalizedResponse: unknown = null;
  if (!options.skipAnthropic && selected) {
    anthropicCalls += 1;
    const modelResult = await callUniversalConstructionLearningAnthropic(prompt, {
      captureDiagnostic: true,
    });
    const coerced = coerceUniversalConstructionLearningResponseShape(modelResult.parsedJson);
    const validation = validateUniversalConstructionLearningResponse(coerced);
    if (!validation.success) throw new Error(validation.error);
    normalizedResponse = normalizeUniversalConstructionLearningResponse(validation.data);
    printJson("anthropicRequestMetadata", modelResult.diagnostic?.request ?? null);
    printJson("rawAnthropicResponse", modelResult.rawText);
    printJson("normalizedResponse", normalizedResponse);
  }

  const memoryActions = normalizedResponse
    && typeof normalizedResponse === "object"
    && "memoryActions" in normalizedResponse
      ? (normalizedResponse as { memoryActions: unknown }).memoryActions
      : null;
  printJson("proposedMemoryActions", memoryActions);
  console.log("appliedMemoryActionCount: 0");
  console.log("databaseWriteState: no_writes");
  console.log(`anthropicCallCount: ${anthropicCalls}`);
  console.log(`elapsedMs: ${Date.now() - startedAt}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
