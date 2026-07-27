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
import type { UniversalLearningRunSelection } from "@/lib/universal-learning/types";

export type UniversalLearningPendingReview = {
  selection: UniversalLearningRunSelection;
  reviewIntent?: string;
  maxLearnings?: number;
  modelInvoker?: UniversalLearningModelInvoker;
};

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

  return `Monthly construction review for ${selection.containerType}.`;
}

export async function prepareUniversalLearningReview(input: UniversalLearningPendingReview) {
  const previousCursor = await getUniversalLearningCursor(input.selection);
  const builderResult = await buildUniversalLearningContainerRecords({
    containerType: input.selection.containerType,
    context: {
      organizationId: input.selection.organizationId,
      cursor: previousCursor,
      reviewMonth: input.selection.reviewMonth,
    },
  });

  const profile = await loadUniversalLearningConstructionProfile(input.selection.organizationId);
  const firstRecord = builderResult.records[0] ?? null;
  const primaryReasoningDomain = getUniversalLearningPrimaryReasoningDomain(input.selection.containerType);
  const memoryPack = await buildUniversalLearningMemoryPack({
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
  const prepared = await prepareUniversalLearningReview(input);
  const reviewRun = await createUniversalLearningReviewRun({
    ...input.selection,
    promptHash: prepared.promptHash,
    promptVersion: UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION,
    previousCursor: prepared.previousCursor,
  });

  prepared.promptPacket.reviewMeta.reviewId = reviewRun.id;
  const prompt = buildUniversalConstructionLearningPrompt(prepared.promptPacket);

  await updateUniversalLearningReviewRunStatus({
    reviewRunId: reviewRun.id,
    runStatus: "building",
    startedAt: new Date().toISOString(),
    selectedRecordCount: prepared.builderResult.records.length,
    memoryPackCount: prepared.memoryPack.length,
    candidateNextCursor: prepared.builderResult.nextCursorCandidate,
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
    };
  }

  const modelInvoker = input.modelInvoker ?? callUniversalConstructionLearningAnthropic;
  await updateUniversalLearningReviewRunStatus({
    reviewRunId: reviewRun.id,
    runStatus: "prompted",
  });

  try {
    const modelResult = await modelInvoker(prompt);
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

    return {
      reviewRunId: reviewRun.id,
      appliedCount: applyResult.appliedCount,
      skipped: false,
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
