import { buildUniversalLearningContainerRecords } from "@/lib/universal-learning/builders";
import { loadUniversalLearningConstructionProfile } from "@/lib/universal-learning/construction-profile";
import {
  getUniversalLearningDomainPromptLayer,
  getUniversalLearningPrimaryReasoningDomain,
} from "@/lib/universal-learning/domain-intelligence";
import {
  advanceUniversalLearningCursor,
  getUniversalLearningCursor,
} from "@/lib/universal-learning/delta-cursors";
import { buildUniversalLearningMemoryPack } from "@/lib/universal-learning/memory-pack";
import {
  callUniversalConstructionLearningAnthropic,
  type UniversalLearningModelInvoker,
} from "@/lib/universal-learning/model";
import { buildUniversalLearningRunPromptHash } from "@/lib/universal-learning/idempotency";
import {
  buildModelVisiblePromptPacket,
  buildUniversalConstructionLearningPrompt,
  buildUniversalConstructionLearningPromptHash,
  UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION,
} from "@/lib/universal-learning/prompt";
import {
  coerceUniversalConstructionLearningResponseShape,
  normalizeUniversalConstructionLearningResponse,
} from "@/lib/universal-learning/response-normalization";
import { validateUniversalConstructionLearningResponse } from "@/lib/universal-learning/response-schema";
import { createUniversalLearningReviewRun, updateUniversalLearningReviewRunStatus } from "@/lib/universal-learning/review-runs";
import { getUniversalLearningBoundaryContext } from "@/lib/universal-learning/boundary-guards";
import { writeUniversalLearningRunRecords } from "@/lib/universal-learning/review-run-records";
import type {
  UniversalLearningCursor,
  UniversalLearningRunSelection,
} from "@/lib/universal-learning/types";
import {
  selectSupplierBillRecordsForPrompt,
  type SupplierBillPromptSelection,
} from "@/lib/universal-learning/supplier-bill-prompt";
import {
  selectPaymentClaimRecordsForPrompt,
} from "@/lib/universal-learning/payment-claim-prompt";

export type UniversalLearningPendingReview = {
  selection: UniversalLearningRunSelection;
  reviewIntent?: string;
  maxLearnings?: number;
  modelInvoker?: UniversalLearningModelInvoker;
  diagnostic?: boolean;
  supplierBillRecordLimit?: number;
  paymentClaimRecordLimit?: number;
  sourceIds?: string[];
  cursorOverride?: UniversalLearningCursor;
};

function scopeIdentifier(entry: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof entry[key] === "string") return entry[key] as string;
  }
  return null;
}

function constrainReviewScopeToSelectedRecords(
  scope: Awaited<ReturnType<typeof buildUniversalLearningContainerRecords>>["reviewScopeContext"],
  records: Awaited<ReturnType<typeof buildUniversalLearningContainerRecords>>["records"],
) {
  const projectIds = new Set(records.map((record) => record.projectId).filter((id): id is string => Boolean(id)));
  const supplierIds = new Set(records.map((record) => record.supplierId).filter((id): id is string => Boolean(id)));
  const clientIds = new Set(records.map((record) => record.clientId).filter((id): id is string => Boolean(id)));
  const statusMix = new Map<string, number>();
  for (const record of records) {
    for (const [key, value] of Object.entries(record.status)) {
      const status = `${key}:${String(value ?? "unknown")}`;
      statusMix.set(status, (statusMix.get(status) ?? 0) + 1);
    }
  }
  return {
    ...scope,
    recordCount: records.length,
    projectCount: projectIds.size,
    supplierCount: supplierIds.size,
    clientCount: clientIds.size,
    statusMix: Object.fromEntries([...statusMix.entries()].sort(([left], [right]) => left.localeCompare(right))),
    projects: scope.projects.filter((entry) => {
      const id = scopeIdentifier(entry, ["projectId", "id"]);
      return id ? projectIds.has(id) : false;
    }),
    suppliers: scope.suppliers.filter((entry) => {
      const id = scopeIdentifier(entry, ["supplierId", "id"]);
      return id ? supplierIds.has(id) : false;
    }),
    clients: scope.clients.filter((entry) => {
      const id = scopeIdentifier(entry, ["clientId", "id"]);
      return id ? clientIds.has(id) : false;
    }),
  };
}

function buildDefaultUniversalLearningReviewIntent(selection: UniversalLearningRunSelection) {
  if (selection.containerType === "project_quote") {
    return "Monthly estimating review for project quotes. Learn how this company prices work, applies margin and contingency, structures inclusions and exclusions, packages labour and materials, and adapts quotes by client and project context.";
  }

  if (selection.containerType === "pricing_workbook_sheet") {
    return "Monthly estimating review for pricing worksheets. Learn how this company structures retained worksheets, formulas, rates, build-ups, markups, margins, wastage, trade packaging, and saved commercial assumptions from retained worksheet state only.";
  }

  if (selection.containerType === "takeoff_measurement") {
    return "Monthly measurement-intelligence review for takeoff activity. Learn how this company calibrates drawings, builds quantities, applies deductions, reviews measurements, and structures measurement discipline without widening into downstream commercial conclusions.";
  }

  if (selection.containerType === "organization_material") {
    return "Monthly catalogue-intelligence review for organization materials. Learn catalogue quality, supplier-price evolution, review discipline, and confirmed material curation without inferring downstream project usage.";
  }

  if (selection.containerType === "material_import_batch") {
    return "Monthly catalogue-intelligence review for material imports. Learn supplier catalogue evolution, import review quality, create-vs-match discipline, and price update behaviour without inferring downstream project execution.";
  }
  if (selection.containerType === "project_claim") {
    return "Monthly commercial-administration review for Payment Claims. Learn how this company values completed work, structures claims, includes variations, handles retention and evidence, manages certification, and follows through to payment without recommending changes.";
  }

  return `Monthly construction review for ${selection.containerType}.`;
}

export async function prepareUniversalLearningReview(input: UniversalLearningPendingReview) {
  const previousCursor = input.cursorOverride ?? await getUniversalLearningCursor(input.selection);
  const sourceBuilderResult = await buildUniversalLearningContainerRecords({
    containerType: input.selection.containerType,
    context: {
      organizationId: input.selection.organizationId,
      cursor: previousCursor,
      reviewMonth: input.selection.reviewMonth,
    },
    sourceIds: input.sourceIds,
  });
  const supplierBillSelection: SupplierBillPromptSelection | null =
    input.selection.containerType === "supplier_invoice"
      ? selectSupplierBillRecordsForPrompt({
        records: sourceBuilderResult.records,
        previousCursor,
        sourceNextCursorCandidate: sourceBuilderResult.nextCursorCandidate,
        maxRecords: input.supplierBillRecordLimit,
      })
      : null;
  const paymentClaimSelection =
    input.selection.containerType === "project_claim"
      ? selectPaymentClaimRecordsForPrompt({
        records: sourceBuilderResult.records,
        previousCursor,
        sourceNextCursorCandidate: sourceBuilderResult.nextCursorCandidate,
        maxRecords: input.paymentClaimRecordLimit,
      })
      : null;
  const boundedSelection = supplierBillSelection ?? paymentClaimSelection;
  const builderResult = boundedSelection
    ? {
      ...sourceBuilderResult,
      records: boundedSelection.records,
      nextCursorCandidate: boundedSelection.nextCursorCandidate,
      reviewScopeContext: constrainReviewScopeToSelectedRecords(
        sourceBuilderResult.reviewScopeContext,
        boundedSelection.records,
      ),
    }
    : sourceBuilderResult;

  const profile = await loadUniversalLearningConstructionProfile(input.selection.organizationId);
  const firstRecord = builderResult.records[0] ?? null;
  const primaryReasoningDomain = getUniversalLearningPrimaryReasoningDomain(input.selection.containerType);
  const loadedMemoryPack = await buildUniversalLearningMemoryPack({
    organizationId: input.selection.organizationId,
    currentContainerType: input.selection.containerType,
    primaryReasoningDomain,
    projectId:
      builderResult.records.length > 0 && builderResult.records.every((record) => record.projectId === firstRecord?.projectId)
        ? firstRecord?.projectId ?? null
        : null,
    opportunityId:
      builderResult.records.length > 0 && builderResult.records.every((record) => record.opportunityId === firstRecord?.opportunityId)
        ? firstRecord?.opportunityId ?? null
        : null,
    supplier:
      builderResult.records.length > 0 && builderResult.records.every((record) => record.supplierId === firstRecord?.supplierId)
        ? firstRecord?.supplierId ?? null
        : null,
    limit: 24,
  });
  const memoryPack = input.selection.containerType === "project_claim"
    ? loadedMemoryPack.filter((memory) =>
      memory.memoryType === "project_claim_learning"
      || memory.memoryType === "project_variation_learning")
    : loadedMemoryPack;

  const reviewPeriodStart = `${input.selection.reviewMonth}-01T00:00:00.000Z`;
  const periodEndDate = new Date(`${input.selection.reviewMonth}-01T00:00:00.000Z`);
  periodEndDate.setUTCMonth(periodEndDate.getUTCMonth() + 1);

  const promptPacket = {
    reviewMeta: {
      reviewId: "",
      organizationId: input.selection.organizationId,
      containerType: input.selection.containerType,
      reviewMonth: input.selection.reviewMonth,
      reviewPeriodStart,
      reviewPeriodEnd: periodEndDate.toISOString(),
      runType: input.selection.runType,
      previousReviewCursor: previousCursor,
      nextReviewCursorCandidate: builderResult.nextCursorCandidate,
      reviewIntent:
        input.reviewIntent
        ?? buildDefaultUniversalLearningReviewIntent(input.selection),
      maxLearnings: input.maxLearnings ?? 12,
    },
    companyConstructionProfile: profile,
    existingRelevantMemories: memoryPack,
    reviewScopeContext: builderResult.reviewScopeContext,
    newBusinessActivity: builderResult.records,
    boundaryContext: getUniversalLearningBoundaryContext(),
  };

  const promptHash = buildUniversalConstructionLearningPromptHash(promptPacket);

  return {
    previousCursor,
    builderResult,
    sourceNextCursorCandidate: sourceBuilderResult.nextCursorCandidate,
    supplierBillPromptSelection: supplierBillSelection,
    paymentClaimPromptSelection: paymentClaimSelection,
    profile,
    primaryReasoningDomain,
    domainPromptLayer: getUniversalLearningDomainPromptLayer(input.selection.containerType),
    memoryPack,
    promptPacket,
    promptHash,
  };
}

export async function runUniversalConstructionLearningReview(
  input: UniversalLearningPendingReview & {
    preparedReview?: Awaited<ReturnType<typeof prepareUniversalLearningReview>>;
    applyMemoryActions: (args: {
      reviewRunId: string;
      selection: UniversalLearningRunSelection;
      response: ReturnType<typeof normalizeUniversalConstructionLearningResponse>;
      records: Awaited<ReturnType<typeof prepareUniversalLearningReview>>["builderResult"]["records"];
      existingMemories: Awaited<ReturnType<typeof prepareUniversalLearningReview>>["memoryPack"];
      reviewMonth: string;
    }) => Promise<{ appliedCount: number }>;
  },
) {
  if (input.diagnostic && input.selection.containerType !== "supplier_invoice") {
    throw new Error("Universal learning diagnostics are restricted to supplier_invoice.");
  }

  const prepared = input.preparedReview ?? await prepareUniversalLearningReview(input);
  const reviewRun = await createUniversalLearningReviewRun({
    ...input.selection,
    promptHash: prepared.promptHash,
    promptVersion: UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION,
    previousCursor: prepared.previousCursor,
  });

  prepared.promptPacket.reviewMeta.reviewId = reviewRun.id;
  const prompt = buildUniversalConstructionLearningPrompt(prepared.promptPacket);

  if (prepared.supplierBillPromptSelection) {
    console.info("universal_learning_supplier_bill_prompt_budget", {
      organizationId: input.selection.organizationId,
      containerType: input.selection.containerType,
      selectedRecordCount: prepared.builderResult.records.length,
      deferredRecordCount: prepared.supplierBillPromptSelection.deferredRecordCount,
      deferredReason: prepared.supplierBillPromptSelection.deferredReason,
      promptRecordBytes: prepared.supplierBillPromptSelection.packetBytes,
      estimatedPromptRecordTokens: prepared.supplierBillPromptSelection.estimatedTokens,
      records: prepared.supplierBillPromptSelection.diagnostics,
    });
  }

  await updateUniversalLearningReviewRunStatus({
    reviewRunId: reviewRun.id,
    runStatus: "building",
    startedAt: new Date().toISOString(),
    selectedRecordCount: prepared.builderResult.records.length,
    memoryPackCount: prepared.memoryPack.length,
    candidateNextCursor: prepared.sourceNextCursorCandidate,
  });

  await writeUniversalLearningRunRecords({
    reviewRunId: reviewRun.id,
    records: prepared.builderResult.records,
  });

  if (prepared.builderResult.records.length === 0) {
    await updateUniversalLearningReviewRunStatus({
      reviewRunId: reviewRun.id,
      runStatus: "completed",
      finalNextCursor: prepared.previousCursor,
      completedAt: new Date().toISOString(),
      selectedRecordCount: 0,
      memoryPackCount: prepared.memoryPack.length,
    });

    return {
      reviewRunId: reviewRun.id,
      appliedCount: 0,
      skipped: true,
      deferredRecordCount:
        prepared.supplierBillPromptSelection?.deferredRecordCount
        ?? prepared.paymentClaimPromptSelection?.deferredRecordCount
        ?? 0,
    };
  }

  const modelInvoker = input.modelInvoker ?? callUniversalConstructionLearningAnthropic;
  await updateUniversalLearningReviewRunStatus({
    reviewRunId: reviewRun.id,
    runStatus: "prompted",
  });

  try {
    const modelResult = input.diagnostic
      ? await modelInvoker(prompt, { captureDiagnostic: true })
      : await modelInvoker(prompt);
    if (input.diagnostic && !modelResult.diagnostic?.request) {
      throw new Error("The model adapter did not return diagnostic request metadata.");
    }
    const coercedResponse = coerceUniversalConstructionLearningResponseShape(modelResult.parsedJson);
    const validation = validateUniversalConstructionLearningResponse(coercedResponse);
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const normalized = normalizeUniversalConstructionLearningResponse(validation.data);
    await updateUniversalLearningReviewRunStatus({
      reviewRunId: reviewRun.id,
      runStatus: "responded",
      responseHash: buildUniversalLearningRunPromptHash(normalized),
      modelProvider: modelResult.provider,
      modelName: modelResult.model,
      inputTokenCount: modelResult.inputTokens,
      outputTokenCount: modelResult.outputTokens,
      totalTokenCount: modelResult.totalTokens,
    });

    await updateUniversalLearningReviewRunStatus({
      reviewRunId: reviewRun.id,
      runStatus: "applying",
    });

    const applyResult = await input.applyMemoryActions({
      reviewRunId: reviewRun.id,
      selection: input.selection,
      response: normalized,
      records: prepared.builderResult.records,
      existingMemories: prepared.memoryPack,
      reviewMonth: input.selection.reviewMonth,
    });

    await advanceUniversalLearningCursor({
      selection: input.selection,
      reviewRunId: reviewRun.id,
      nextCursor: prepared.builderResult.nextCursorCandidate,
      selectedRecordCount: prepared.builderResult.records.length,
    });

    await updateUniversalLearningReviewRunStatus({
      reviewRunId: reviewRun.id,
      runStatus: "completed",
      finalNextCursor: prepared.builderResult.nextCursorCandidate,
      completedAt: new Date().toISOString(),
    });

    const modelVisiblePacket = input.diagnostic
      ? buildModelVisiblePromptPacket(prepared.promptPacket) as {
        newBusinessActivity?: unknown[];
      }
      : null;
    const promptProjectedRecords = modelVisiblePacket?.newBusinessActivity ?? [];

    return {
      reviewRunId: reviewRun.id,
      appliedCount: applyResult.appliedCount,
      skipped: false,
      deferredRecordCount:
        prepared.supplierBillPromptSelection?.deferredRecordCount
        ?? prepared.paymentClaimPromptSelection?.deferredRecordCount
        ?? 0,
      ...(input.diagnostic
        ? {
          diagnostic: {
            schemaVersion: "supplier_bill.v2" as const,
            sourceRecords: prepared.builderResult.records.map((record, index) => ({
              sourceId: record.source.sourceId,
              canonicalContentHash:
                typeof record.payload?.provenance === "object"
                && record.payload.provenance !== null
                && typeof (record.payload.provenance as Record<string, unknown>).contentHash === "string"
                  ? (record.payload.provenance as Record<string, unknown>).contentHash as string
                  : buildUniversalLearningRunPromptHash(record),
              canonicalBytes: Buffer.byteLength(JSON.stringify(record), "utf8"),
              promptProjectedRecord: promptProjectedRecords[index] ?? null,
            })),
            anthropicRequest: modelResult.diagnostic?.request ?? null,
            anthropicRawText: modelResult.rawText,
            normalizedResponse: normalized,
            memoryActions: normalized.memoryActions,
            tokenUsage: {
              inputTokens: modelResult.inputTokens,
              outputTokens: modelResult.outputTokens,
            },
          },
        }
        : {}),
    };
  } catch (error) {
    await updateUniversalLearningReviewRunStatus({
      reviewRunId: reviewRun.id,
      runStatus: "failed",
      errorCode:
        error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined,
      errorMessage: error instanceof Error ? error.message : "Universal learning review failed.",
      completedAt: new Date().toISOString(),
    });
    throw error;
  }
}
