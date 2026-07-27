import { NextResponse } from "next/server";
/**
 * @deprecated
 * This route supported the legacy full-worksheet scaffold flow.
 * The active pricing worksheet Ask AI experience now uses
 * `/api/ai/pricing-worksheets/edit-assistant`.
 * Keep this route only until all dependent tooling is safely removed.
 */
import {
  buildAiRequestContextSummary,
  createAiLifecycleInteraction,
  recordAiInteractionValidation,
  requireOrganizationMemberForAi,
  retrieveOrganizationMemoryForAi,
  summarizeAiValidationStatus,
  transitionAiLifecycleInteraction,
  validateOpportunityForOrganization,
} from "@/lib/ai-lifecycle-server";
import {
  buildPricingWorksheetScaffoldPreviewWithModel,
  getPricingWorksheetModelConfig,
} from "@/lib/ai-pricing-worksheet-model-generator";
import { buildOrganizationAiContext } from "@/lib/organization-ai-context";

export const runtime = "nodejs";

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
  worksheetName?: string | null;
  tradePackage?: string | null;
  prompt?: string | null;
  currentWorksheetSummary?: CurrentWorksheetSummary | null;
};

function getValidationTypeForWarning(ruleKey: string) {
  if (
    ruleKey.includes("structure") ||
    ruleKey.includes("formula") ||
    ruleKey.includes("cell_") ||
    ruleKey.includes("identifier") ||
    ruleKey.includes("reference") ||
    ruleKey.includes("json")
  ) {
    return "schema" as const;
  }

  if (ruleKey.includes("permission")) {
    return "permission_check" as const;
  }

  if (ruleKey.includes("preview_ready")) {
    return "workflow_gate" as const;
  }

  return "ai_confidence" as const;
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
  const worksheetName = typeof body.worksheetName === "string" && body.worksheetName.trim() ? body.worksheetName.trim() : "AI Worksheet Scaffold";
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
            typeof body.currentWorksheetSummary.columnCount === "number" && Number.isFinite(body.currentWorksheetSummary.columnCount)
              ? body.currentWorksheetSummary.columnCount
              : 0,
          formulaCount:
            typeof body.currentWorksheetSummary.formulaCount === "number" && Number.isFinite(body.currentWorksheetSummary.formulaCount)
              ? body.currentWorksheetSummary.formulaCount
              : 0,
          populatedCellCount:
            typeof body.currentWorksheetSummary.populatedCellCount === "number" && Number.isFinite(body.currentWorksheetSummary.populatedCellCount)
              ? body.currentWorksheetSummary.populatedCellCount
              : 0,
          hasExistingContent: body.currentWorksheetSummary.hasExistingContent === true,
        }
      : null;

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  try {
    const { supabase } = await requireOrganizationMemberForAi(organizationId, {
      requireCommercialWrite: true,
    });

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
      workbookId: null,
      sheetId: null,
      memoryCategories: ["worksheet_structure", "pricing_structure"],
      memoryTypes: ["pricing_worksheet_layout"],
      minimumConfidence: 0.35,
      limit: 12,
    });

    const matchedMemoryIds = memoryItems.map((item) => item.id);
    const organizationAiContext = await buildOrganizationAiContext({ organizationId });
    const inputContextSummary = buildAiRequestContextSummary({
      organizationId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      module: "pricing_worksheets",
      workflowKey: "pricing_worksheet_scaffold_preview",
      workbookId: null,
      worksheetId: null,
      sheetId: null,
      sheetName: worksheetName,
      worksheetName,
      tradePackage,
      relatedCounts: {
        constructionProfileLength: organizationAiContext.constructionProfile?.length ?? 0,
        existingWorksheetCount: existingWorksheetsResult.count ?? 0,
        hasConstructionProfile: organizationAiContext.constructionProfile ? 1 : 0,
        matchedMemoryCount: memoryItems.length,
        promptLength: prompt.length,
        currentWorksheetRowCount: currentWorksheetSummary?.rowCount ?? 0,
        currentWorksheetFormulaCount: currentWorksheetSummary?.formulaCount ?? 0,
        currentWorksheetHasContent: currentWorksheetSummary?.hasExistingContent ?? false,
      },
      matchedMemoryIds,
    });
    const modelConfig = getPricingWorksheetModelConfig();

    const aiInteractionId = await createAiLifecycleInteraction(supabase, {
      organizationId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      module: "pricing_worksheets",
      interactionType: "generation",
      subjectEntityType: "pricing_worksheet_scaffold",
      provider: modelConfig.provider,
      model: modelConfig.model,
      modelVersion: "2026-05-20",
      promptTemplateKey: "pricing_worksheet_scaffold_preview_v3",
      promptText: prompt.length > 0
        ? prompt
        : `Generate a preview-only worksheet scaffold for "${worksheetName}"${tradePackage ? ` in trade package "${tradePackage}"` : ""}.`,
      inputContextSummary,
      inputRefs: matchedMemoryIds.map((memoryId) => ({ type: "organization_memory_item", id: memoryId })),
      privacyClassification: "financial_sensitive",
    });

    const { preview, generationMeta } = await buildPricingWorksheetScaffoldPreviewWithModel({
      prompt,
      worksheetName,
      tradePackage,
      memoryItems,
      currentWorksheetSummary,
      organizationConstructionContext: organizationAiContext.organizationConstructionContext,
    });

    await transitionAiLifecycleInteraction(supabase, {
      organizationId,
      aiInteractionId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      lifecycleState: "generated",
      runStatus: "completed",
      confidence: preview.compactOutput.confidence,
      outputStructured: {
        ...preview.compactOutput,
        workbookId: null,
        worksheetId: null,
        sheetId: null,
        sheetName: worksheetName,
        legacySinglePageFlow: true,
        generationMeta,
      },
      outputRefs: preview.matchedMemory
        ? [{ type: "organization_memory_item", id: preview.matchedMemory.id }]
        : [],
    });

    if (preview.validationWarnings.length === 0) {
      await recordAiInteractionValidation(supabase, {
        organizationId,
        aiInteractionId,
        projectId: opportunity?.workspace_project_id ?? null,
        opportunityId,
        module: "pricing_worksheets",
        scopeEntityType: "pricing_worksheet_scaffold",
        ruleKey: "ai_pricing_worksheet_preview_ready",
        validationType: "workflow_gate",
        severity: "info",
        result: "passed",
        details: {
          suggestionSource: preview.compactOutput.suggestionSource,
          generationProvider: generationMeta.provider,
          generationModel: generationMeta.model,
        },
        validationStatus: "passed",
      });
    } else {
      for (const warning of preview.validationWarnings) {
        await recordAiInteractionValidation(supabase, {
          organizationId,
          aiInteractionId,
          projectId: opportunity?.workspace_project_id ?? null,
          opportunityId,
          module: "pricing_worksheets",
          scopeEntityType: "pricing_worksheet_scaffold",
          ruleKey: warning.ruleKey,
          validationType: getValidationTypeForWarning(warning.ruleKey),
          severity: warning.severity,
          result: warning.result,
          expectedValue: warning.expectedValue ?? null,
          observedValue: warning.observedValue ?? null,
          details: {
            message: warning.message,
            generationProvider: generationMeta.provider,
            generationModel: generationMeta.model,
            ...(warning.details ?? {}),
          },
          validationStatus: summarizeAiValidationStatus(preview.validationWarnings),
        });
      }
    }

    const validationStatus = summarizeAiValidationStatus(preview.validationWarnings);

    await transitionAiLifecycleInteraction(supabase, {
      organizationId,
      aiInteractionId,
      projectId: opportunity?.workspace_project_id ?? null,
      opportunityId,
      lifecycleState: "previewed",
      runStatus: "completed",
      validationStatus,
      confidence: preview.compactOutput.confidence,
      outputStructured: {
        ...preview.compactOutput,
        workbookId: null,
        worksheetId: null,
        sheetId: null,
        sheetName: worksheetName,
        legacySinglePageFlow: true,
        generationMeta,
      },
      outputRefs: preview.matchedMemory
        ? [{ type: "organization_memory_item", id: preview.matchedMemory.id }]
        : [],
    });

    return NextResponse.json({
      aiInteractionId,
      workbookId: null,
      worksheetId: null,
      sheetId: null,
      sheetName: worksheetName,
      legacySinglePageFlow: true,
      lifecycleState: "previewed",
      validationStatus,
      preview: {
        worksheet: preview.worksheet,
        compactOutput: preview.compactOutput,
        contextSummary: {
          existingWorksheetCount: existingWorksheetsResult.count ?? 0,
          matchedMemoryCount: memoryItems.length,
        },
        generationMeta,
        matchedMemory: preview.matchedMemory
          ? {
              id: preview.matchedMemory.id,
              memoryCategory: preview.matchedMemory.memoryCategory,
              memoryType: preview.matchedMemory.memoryType,
              title: preview.matchedMemory.title,
              confidenceScore: preview.matchedMemory.confidenceScore,
            }
          : null,
        validationWarnings: preview.validationWarnings,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate worksheet scaffold preview.";
    const status =
      message === "Unauthorized." || message === "Not authorized for this organization."
        ? 401
        : message === "You do not have permission to use this AI workflow."
          ? 403
          : message === "Opportunity not found."
            ? 404
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
