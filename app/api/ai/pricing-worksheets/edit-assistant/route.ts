import { NextResponse } from "next/server";
import {
  buildAiRequestContextSummary,
  createAiLifecycleInteraction,
  recordAiInteractionValidation,
  requireOrganizationMemberForAi,
  retrieveOrganizationMemoryForAi,
  transitionAiLifecycleInteraction,
  validateOpportunityForOrganization,
} from "@/lib/ai-lifecycle-server";
import {
  buildPricingWorksheetEditAssistantPreview,
  getPricingWorksheetEditAssistantModelConfig,
  type PricingWorksheetAiFollowUpContext,
} from "@/lib/ai-pricing-worksheet-edit-assistant";
import { classifyPricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import { retrievePricingWorksheetOrganizationGuidance } from "@/lib/pricing-worksheet-organization-guidance";
import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { PricingWorksheetAiCompactContext } from "@/lib/pricing-worksheet-ai-context";
import { canManageCommercialData, type AppRole } from "@/lib/role-permissions";

export const runtime = "nodejs";

function logRouteDebug(action: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[pricing-worksheet-edit-assistant-route]", {
    action,
    ...payload,
  });
}

type CurrentWorksheetSummary = {
  rowCount?: number;
  columnCount?: number;
  formulaCount?: number;
  populatedCellCount?: number;
  hasExistingContent?: boolean;
};

type RequestBody = {
  organizationId?: string;
  opportunityId?: string | null;
  worksheetId?: string | null;
  worksheetName?: string | null;
  tradePackage?: string | null;
  prompt?: string | null;
  currentWorksheetSummary?: CurrentWorksheetSummary | null;
  worksheetData?: WorksheetData | null;
  worksheetContext?: PricingWorksheetAiCompactContext | null;
  followUpContext?: PricingWorksheetAiFollowUpContext | null;
};

function getValidationTypeForIssue(code: string) {
  if (code.includes("formula") || code.includes("ref") || code.includes("cell") || code.includes("column")) {
    return "schema" as const;
  }

  if (code.includes("mode") || code.includes("operation")) {
    return "workflow_gate" as const;
  }

  return "ai_confidence" as const;
}

function confidenceToScore(value: "high" | "medium" | "low") {
  if (value === "high") {
    return 0.9;
  }

  if (value === "low") {
    return 0.35;
  }

  return 0.65;
}

function hasWorksheetShape(value: unknown): value is WorksheetData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as WorksheetData).rows) &&
    Array.isArray((value as WorksheetData).columns)
  );
}

function hasContextShape(value: unknown): value is PricingWorksheetAiCompactContext {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PricingWorksheetAiCompactContext).worksheetName === "string" &&
    Array.isArray((value as PricingWorksheetAiCompactContext).headers) &&
    Array.isArray((value as PricingWorksheetAiCompactContext).rows)
  );
}

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const opportunityId = typeof body.opportunityId === "string" && body.opportunityId.trim() ? body.opportunityId.trim() : null;
  const worksheetId = typeof body.worksheetId === "string" && body.worksheetId.trim() ? body.worksheetId.trim() : null;
  const worksheetName =
    typeof body.worksheetName === "string" && body.worksheetName.trim() ? body.worksheetName.trim() : "Pricing Worksheet";
  const tradePackage = typeof body.tradePackage === "string" && body.tradePackage.trim() ? body.tradePackage.trim() : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const currentWorksheetSummary =
    body.currentWorksheetSummary && typeof body.currentWorksheetSummary === "object"
      ? {
          rowCount:
            typeof body.currentWorksheetSummary.rowCount === "number" && Number.isFinite(body.currentWorksheetSummary.rowCount)
              ? body.currentWorksheetSummary.rowCount
              : 0,
          columnCount:
            typeof body.currentWorksheetSummary.columnCount === "number" &&
            Number.isFinite(body.currentWorksheetSummary.columnCount)
              ? body.currentWorksheetSummary.columnCount
              : 0,
          formulaCount:
            typeof body.currentWorksheetSummary.formulaCount === "number" &&
            Number.isFinite(body.currentWorksheetSummary.formulaCount)
              ? body.currentWorksheetSummary.formulaCount
              : 0,
          populatedCellCount:
            typeof body.currentWorksheetSummary.populatedCellCount === "number" &&
            Number.isFinite(body.currentWorksheetSummary.populatedCellCount)
              ? body.currentWorksheetSummary.populatedCellCount
              : 0,
          hasExistingContent: body.currentWorksheetSummary.hasExistingContent === true,
        }
      : null;

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  if (!hasWorksheetShape(body.worksheetData)) {
    return NextResponse.json({ error: "worksheetData is required." }, { status: 400 });
  }

  if (!hasContextShape(body.worksheetContext)) {
    return NextResponse.json({ error: "worksheetContext is required." }, { status: 400 });
  }

  try {
    logRouteDebug("edit_assistant_request_received", {
      worksheetId,
      worksheetName,
      promptLength: prompt.length,
      hasWorksheetData: hasWorksheetShape(body.worksheetData),
      hasWorksheetContext: hasContextShape(body.worksheetContext),
    });
    // Full WorksheetData is posted only to our backend so we can validate and simulate
    // edits locally. The compact worksheet context is the only payload sent upstream.
    const { supabase, member } = await requireOrganizationMemberForAi(organizationId);
    const canMutateWorksheet = canManageCommercialData(member.role as AppRole);

    const opportunity = opportunityId
      ? await validateOpportunityForOrganization(organizationId, opportunityId)
      : null;

    const existingWorksheetsResult = opportunityId
      ? await supabase
          .from("opportunity_pricing_worksheets")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("opportunity_id", opportunityId)
          .is("archived_at", null)
      : { count: 0, error: null };

    if (existingWorksheetsResult.error) {
      throw new Error(existingWorksheetsResult.error.message);
    }

    const memoryItems = await retrieveOrganizationMemoryForAi({
      organizationId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      memoryCategories: ["worksheet_structure", "pricing_structure"],
      memoryTypes: ["pricing_worksheet_layout"],
      minimumConfidence: 0.35,
      limit: 12,
    });

    const matchedMemoryIds = memoryItems.map((item) => item.id);
    const inputContextSummary = buildAiRequestContextSummary({
      organizationId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      module: "pricing_worksheets",
      workflowKey: "pricing_worksheet_edit_assistant",
      worksheetName,
      tradePackage,
      relatedCounts: {
        existingWorksheetCount: existingWorksheetsResult.count ?? 0,
        matchedMemoryCount: memoryItems.length,
        promptLength: prompt.length,
        currentWorksheetRowCount: currentWorksheetSummary?.rowCount ?? body.worksheetData.rows.length ?? 0,
        currentWorksheetFormulaCount: currentWorksheetSummary?.formulaCount ?? 0,
        currentWorksheetHasContent: currentWorksheetSummary?.hasExistingContent ?? true,
      },
      matchedMemoryIds,
    });

    const modelConfig = getPricingWorksheetEditAssistantModelConfig();
    const classification = classifyPricingWorksheetConstructionIntent({
      userPrompt: prompt,
      worksheetTradePackage: tradePackage,
      worksheetName,
      worksheetContext: body.worksheetContext,
      selection: body.worksheetContext.visibleSelection,
    });
    let organizationGuidance = null;
    try {
      organizationGuidance = await retrievePricingWorksheetOrganizationGuidance({
        organizationId,
        projectId: opportunity?.workspace_project_id ?? null,
        opportunityId,
        prompt,
        worksheetContext: body.worksheetContext,
        classification,
        memoryItems,
      });
    } catch (guidanceError) {
      logRouteDebug("organization_guidance_retrieval_failed", {
        worksheetId,
        error: guidanceError instanceof Error ? guidanceError.message : String(guidanceError),
      });
    }
    const aiInteractionId = await createAiLifecycleInteraction(supabase, {
      organizationId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      module: "pricing_worksheets",
      interactionType: "reasoning",
      subjectEntityType: "pricing_worksheet_edit_plan",
      provider: modelConfig.provider,
      model: modelConfig.model,
      modelVersion: "2026-05-21",
      promptTemplateKey: "pricing_worksheet_edit_assistant_v1",
      promptText: prompt.length > 0 ? prompt : `Help with worksheet "${worksheetName}".`,
      inputContextSummary: {
        ...inputContextSummary,
        worksheetId,
        worksheetContext: {
          headerCount: body.worksheetContext.headers.length,
          sectionCount: body.worksheetContext.sections.length,
          nearbyRowCount: body.worksheetContext.nearbyRows.length,
          selection: body.worksheetContext.visibleSelection,
        },
        constructionIntent: classification,
        organizationGuidanceSummary: organizationGuidance?.summary ?? null,
        organizationGuidanceCount: organizationGuidance?.items.length ?? 0,
      },
      inputRefs: matchedMemoryIds.map((memoryId) => ({ type: "organization_memory_item", id: memoryId })),
      privacyClassification: "financial_sensitive",
    });

    const { preview, generationMeta } = await buildPricingWorksheetEditAssistantPreview({
      prompt,
      worksheet: body.worksheetData,
      worksheetContext: body.worksheetContext,
      memoryItems,
      classification,
      organizationGuidance,
      followUpContext:
        body.followUpContext && typeof body.followUpContext === "object"
          ? body.followUpContext
          : null,
    });
    logRouteDebug("provider_response_received", {
      provider: generationMeta.provider,
      model: generationMeta.model,
      fallbackUsed: generationMeta.fallbackUsed,
      responseMode: preview.mode,
      operationCount: preview.operations.length,
      classification,
    });

    const hasMutatingOperations = preview.operations.some((operation) => operation.type !== "explain_formula");
    if (!canMutateWorksheet && hasMutatingOperations) {
      preview.validationIssues.push({
        code: "permission_mutation_requires_write",
        message: "You can review this AI suggestion, but worksheet edits require write permission to apply.",
        severity: "warning",
      });
      preview.validationWarnings.push({
        ruleKey: "permission_mutation_requires_write",
        severity: "warning",
        result: "warning",
        message: "You can review this AI suggestion, but worksheet edits require write permission to apply.",
      });
    }

    await transitionAiLifecycleInteraction(supabase, {
      organizationId,
      aiInteractionId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      lifecycleState: "generated",
      runStatus: "completed",
      validationStatus: preview.validationIssues.some((issue) => issue.severity === "error")
        ? "failed"
        : preview.validationIssues.length > 0 || generationMeta.fallbackUsed
          ? "warning"
          : "passed",
      confidence: confidenceToScore(preview.compactOutput.confidence),
      outputStructured: {
        ...preview.storageSummary,
        proposalName: preview.proposalName,
        answer: preview.answer,
        summary: preview.summary,
        confidence: preview.confidence,
        operationCount: preview.operations.length,
        operationTypes: preview.operations.map((operation) => operation.type),
        diffSummary: preview.diffSummary,
        validationWarnings: preview.validationWarnings.map((warning) => ({
          ruleKey: warning.ruleKey,
          severity: warning.severity,
          result: warning.result,
          message: warning.message,
        })),
        worksheetId,
        worksheetName,
        tradePackage,
        canMutateWorksheet,
        webSearchEnabled: true,
        requiresRetrieval: classification.requiresRetrieval,
        recommendedPromptPath: classification.recommendedPromptPath,
        retrievalReasons: classification.retrievalReasons ?? [],
        constructionIntent: classification,
        generationMeta,
        reviewFindings: preview.reviewFindings,
        reviewSummary: preview.reviewSummary,
        evidenceSources: preview.evidenceSources,
        suggestedEditGroups: preview.suggestedEditGroups.map((group) => ({
          id: group.id,
          title: group.title,
          purpose: group.purpose,
          confidence: group.confidence,
          relatedFindingIds: group.relatedFindingIds,
          operationTypes: group.operations.map((operation) => operation.type),
        })),
      },
      outputRefs: preview.matchedMemory
        ? [{ type: "organization_memory_item", id: preview.matchedMemory.id }]
        : [],
    });

    if (preview.validationIssues.length === 0) {
      await recordAiInteractionValidation(supabase, {
        organizationId,
        aiInteractionId,
        projectId: opportunity?.workspace_project_id ?? null,
        opportunityId,
        module: "pricing_worksheets",
        scopeEntityType: "pricing_worksheet_edit_plan",
        ruleKey: "ai_pricing_worksheet_edit_preview_ready",
        validationType: "workflow_gate",
        severity: "info",
        result: "passed",
        details: {
          responseMode: preview.mode,
          changedCellCount: preview.diffSummary.changedCells.length,
          insertedRowCount: preview.diffSummary.insertedRows.length,
          fallbackUsed: generationMeta.fallbackUsed,
        },
        validationStatus: "passed",
      });
    } else {
      for (const issue of preview.validationIssues) {
        await recordAiInteractionValidation(supabase, {
          organizationId,
          aiInteractionId,
          projectId: opportunity?.workspace_project_id ?? null,
          opportunityId,
          module: "pricing_worksheets",
          scopeEntityType: "pricing_worksheet_edit_plan",
          ruleKey: issue.code,
          validationType: getValidationTypeForIssue(issue.code),
          severity: issue.severity === "error" ? "error" : "warning",
          result: issue.severity === "error" ? "failed" : "warning",
          observedValue: issue.message,
          details: {
            message: issue.message,
          },
          validationStatus: issue.severity === "error" ? "failed" : "warning",
        });
      }
    }

    await transitionAiLifecycleInteraction(supabase, {
      organizationId,
      aiInteractionId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      lifecycleState: "previewed",
      runStatus: "completed",
      validationStatus: preview.validationIssues.some((issue) => issue.severity === "error")
        ? "failed"
        : preview.validationIssues.length > 0 || generationMeta.fallbackUsed
          ? "warning"
          : "passed",
      confidence: confidenceToScore(preview.compactOutput.confidence),
    });

    return NextResponse.json({
      aiInteractionId,
      preview: {
        worksheet: preview.worksheet,
        compactOutput: preview.compactOutput,
        matchedMemory: preview.matchedMemory,
        validationWarnings: preview.validationWarnings,
        contextSummary: preview.contextSummary,
        classification: preview.classification,
        generationMeta,
        assistant: {
          mode: preview.mode,
          proposalName: preview.proposalName,
          answer: preview.answer,
          summary: preview.summary,
          confidence: preview.confidence,
          operations: preview.operations.map((operation) => ({
            type: operation.type,
            rationale: operation.rationale ?? "",
          })),
          assumptions: preview.assumptions,
          warnings: preview.warnings,
          evidenceSources: preview.evidenceSources,
          reviewFindings: preview.reviewFindings,
          reviewSummary: preview.reviewSummary,
          suggestedEditGroups: preview.suggestedEditGroups,
          diffSummary: preview.diffSummary,
          diffPreview: preview.diffPreview,
        },
      },
      generationMeta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
