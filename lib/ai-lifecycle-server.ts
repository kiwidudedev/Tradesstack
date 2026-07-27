import "server-only";

import { canManageCommercialData, type AppRole } from "@/lib/role-permissions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type OrganizationMemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type OrganizationMemoryItemQueryRow = {
  id: string;
  memory_category: string;
  memory_type: string;
  title: string;
  summary: string;
  confidence_score: number | null;
  derived_from_total_count: number | null;
  memory_value: Json | null;
  evidence_summary: Json | null;
  source_memory_pool_type?: string | null;
  source_memory_pool_id?: string | null;
  updated_at: string;
};
type OrganizationMemoryItemsQueryBuilder = {
  eq: (column: string, value: string | boolean) => OrganizationMemoryItemsQueryBuilder;
  gte: (column: string, value: number) => OrganizationMemoryItemsQueryBuilder;
  order: (column: string, options: { ascending: boolean }) => OrganizationMemoryItemsQueryBuilder;
  limit: (value: number) => Promise<{
    data: OrganizationMemoryItemQueryRow[] | null;
    error: { message: string } | null;
  }>;
  in: (column: string, values: string[]) => OrganizationMemoryItemsQueryBuilder;
};
type OrganizationMemoryItemsQuery = {
  from: (table: "organization_memory_items") => {
    select: (columns: string) => OrganizationMemoryItemsQueryBuilder;
  };
};

export type AiLifecycleState =
  | "requested"
  | "generated"
  | "validated"
  | "previewed"
  | "accepted"
  | "edited"
  | "rejected"
  | "superseded";

export type AiValidationStatus = "pending" | "passed" | "warning" | "failed" | "overridden";

export type AiMemoryItem = {
  id: string;
  memoryCategory: string;
  memoryType: string;
  title: string;
  summary: string;
  confidenceScore: number;
  derivedFromTotalCount: number;
  memoryValue: Record<string, Json | undefined>;
  evidenceSummary: Record<string, Json | undefined>;
  updatedAt: string;
  projectId: string | null;
  opportunityId: string | null;
  workbookId?: string | null;
  sheetId?: string | null;
};

export type AiValidationWarning = {
  ruleKey: string;
  severity: "info" | "warning" | "error" | "critical";
  result: "passed" | "failed" | "warning" | "overridden";
  message: string;
  expectedValue?: Json | null;
  observedValue?: Json | null;
  details?: Record<string, Json>;
};

export type AiRequestContextSummary = {
  organizationId: string;
  projectId: string | null;
  opportunityId: string | null;
  module: string;
  workflowKey: string;
  workbookId?: string | null;
  worksheetId?: string | null;
  sheetId?: string | null;
  sheetName?: string | null;
  worksheetName?: string | null;
  tradePackage?: string | null;
  relatedCounts?: Record<string, Json>;
  matchedMemoryIds?: string[];
};

function toJsonRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Json | undefined>;
}

function normalizeLookupValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function tokenizeLookupValue(value: string | null | undefined) {
  const normalized = normalizeLookupValue(value);
  return normalized ? normalized.split(" ").filter((token) => token.length > 1) : [];
}

function scoreContextMatch(memoryValue: Record<string, Json | undefined>, params: {
  trade?: string | null;
  system?: string | null;
  product?: string | null;
  supplier?: string | null;
  projectType?: string | null;
  activity?: string | null;
}) {
  const fieldPairs = [
    { key: "trade", query: params.trade, weight: 0.22 },
    { key: "system", query: params.system, weight: 0.2 },
    { key: "product", query: params.product, weight: 0.24 },
    { key: "productSignature", query: params.product, weight: 0.16 },
    { key: "supplier", query: params.supplier, weight: 0.18 },
    { key: "projectType", query: params.projectType, weight: 0.16 },
    { key: "activity", query: params.activity, weight: 0.12 },
    { key: "installMethod", query: params.activity, weight: 0.08 },
  ];

  let score = 0;
  for (const pair of fieldPairs) {
    const memoryText = normalizeLookupValue(typeof memoryValue[pair.key] === "string" ? String(memoryValue[pair.key]) : null);
    const queryText = normalizeLookupValue(pair.query ?? null);
    if (!memoryText || !queryText) {
      continue;
    }
    if (memoryText === queryText) {
      score += pair.weight;
      continue;
    }
    const memoryTokens = new Set(tokenizeLookupValue(memoryText));
    const queryTokens = tokenizeLookupValue(queryText);
    if (queryTokens.length === 0) {
      continue;
    }
    const overlapCount = queryTokens.filter((token) => memoryTokens.has(token)).length;
    if (overlapCount === 0) {
      continue;
    }
    score += pair.weight * (overlapCount / queryTokens.length) * 0.8;
  }

  return score;
}

function hasNormalizedMatch(
  value: Json | undefined,
  query: string | null | undefined,
) {
  const memoryText = normalizeLookupValue(typeof value === "string" ? value : null);
  const queryText = normalizeLookupValue(query ?? null);
  if (!memoryText || !queryText) {
    return 0;
  }
  if (memoryText === queryText) {
    return 1;
  }
  const memoryTokens = new Set(tokenizeLookupValue(memoryText));
  const queryTokens = tokenizeLookupValue(queryText);
  if (queryTokens.length === 0) {
    return 0;
  }
  const overlapCount = queryTokens.filter((token) => memoryTokens.has(token)).length;
  return overlapCount / queryTokens.length;
}

function scoreConstructionMemoryRelevance(params: {
  memoryType: string;
  title: string;
  memoryValue: Record<string, Json | undefined>;
  query: {
    trade?: string | null;
    system?: string | null;
    product?: string | null;
    supplier?: string | null;
    projectType?: string | null;
    activity?: string | null;
  };
}) {
  const { memoryType, memoryValue, query } = params;
  let score = 0;

  const productMatch = Math.max(
    hasNormalizedMatch(memoryValue.product, query.product),
    hasNormalizedMatch(memoryValue.productSignature, query.product),
  );
  const systemMatch = hasNormalizedMatch(memoryValue.system, query.system);
  const tradeMatch = hasNormalizedMatch(memoryValue.trade, query.trade);
  const supplierMatch = hasNormalizedMatch(memoryValue.supplier, query.supplier);
  const activityMatch = Math.max(
    hasNormalizedMatch(memoryValue.activity, query.activity),
    hasNormalizedMatch(memoryValue.installMethod, query.activity),
  );

  const hasProductQuery = Boolean(normalizeLookupValue(query.product ?? null));
  const hasSupplierQuery = Boolean(normalizeLookupValue(query.supplier ?? null));
  const hasTradeOrSystemQuery = Boolean(normalizeLookupValue(query.trade ?? null) || normalizeLookupValue(query.system ?? null));
  const hasActivityQuery = Boolean(normalizeLookupValue(query.activity ?? null));
  const hasProductDimension = Boolean(
    normalizeLookupValue(typeof memoryValue.product === "string" ? memoryValue.product : null)
    || normalizeLookupValue(typeof memoryValue.productSignature === "string" ? memoryValue.productSignature : null),
  );
  const hasTradeOrSystemDimension = Boolean(
    normalizeLookupValue(typeof memoryValue.trade === "string" ? memoryValue.trade : null)
    || normalizeLookupValue(typeof memoryValue.system === "string" ? memoryValue.system : null),
  );
  const hasSupplierDimension = Boolean(
    normalizeLookupValue(typeof memoryValue.supplier === "string" ? memoryValue.supplier : null),
  );
  const hasActivityDimension = Boolean(
    normalizeLookupValue(typeof memoryValue.activity === "string" ? memoryValue.activity : null)
    || normalizeLookupValue(typeof memoryValue.installMethod === "string" ? memoryValue.installMethod : null),
  );

  if (hasProductQuery) {
    score += productMatch * 0.55;
    score += systemMatch * 0.16;
    score += tradeMatch * 0.08;
    if (["product_system_pattern", "trade_product_pattern", "assembly_pattern", "product_preference_pattern"].includes(memoryType)) {
      score += 0.14;
    }
    if (!memoryValue.product && !memoryValue.productSignature) {
      score -= 0.42;
    }
    if (["supplier_preference_pattern", "procurement_preference_pattern"].includes(memoryType) && productMatch < 0.35) {
      score -= 0.3;
    }
    if (["pricing_pattern", "project_type_pattern"].includes(memoryType) && productMatch < 0.35 && systemMatch < 0.35) {
      score -= 0.44;
    }
    if (!hasSupplierQuery && !hasProductDimension && !hasTradeOrSystemDimension) {
      score -= 0.7;
    } else if (!hasSupplierQuery && productMatch < 0.35 && systemMatch < 0.35 && tradeMatch < 0.35) {
      score -= 0.44;
    }
  }

  if (hasSupplierQuery) {
    score += supplierMatch * 0.45;
    if (["supplier_preference_pattern", "procurement_preference_pattern"].includes(memoryType)) {
      score += 0.12;
    }
    if (!memoryValue.supplier) {
      score -= 0.2;
    }
  } else if (hasProductQuery || hasTradeOrSystemQuery) {
    if (["supplier_preference_pattern", "procurement_preference_pattern"].includes(memoryType) && supplierMatch === 0) {
      score -= 0.12;
    }
  }

  if (hasTradeOrSystemQuery) {
    score += tradeMatch * 0.18;
    score += systemMatch * 0.24;
    if (["product_system_pattern", "trade_product_pattern", "assembly_pattern"].includes(memoryType)) {
      score += 0.14;
    }
    if (["supplier_preference_pattern"].includes(memoryType) && tradeMatch === 0 && systemMatch === 0) {
      score -= 0.24;
    }
    if (!hasTradeOrSystemDimension && !hasProductDimension && !hasSupplierQuery) {
      score -= 0.48;
    }
  }

  if (hasActivityQuery) {
    score += activityMatch * 0.28;
    if (["install_method_pattern", "procurement_preference_pattern", "productivity_pattern"].includes(memoryType)) {
      score += 0.12;
    }
    if (!memoryValue.activity && !memoryValue.installMethod) {
      score -= 0.18;
    }
    if (!hasActivityDimension && !hasProductDimension && !hasTradeOrSystemDimension) {
      score -= 0.32;
    }
  }

  const normalizedTitle = normalizeLookupValue(params.title);
  if (hasProductQuery && normalizedTitle && normalizedTitle === normalizeLookupValue(typeof memoryValue.supplier === "string" ? memoryValue.supplier : null)) {
    score -= 0.34;
  }
  if (
    hasProductQuery
    && !hasSupplierQuery
    && hasSupplierDimension
    && !hasProductDimension
    && !hasTradeOrSystemDimension
    && normalizedTitle
    && normalizedTitle === normalizeLookupValue(typeof memoryValue.supplier === "string" ? memoryValue.supplier : null)
  ) {
    score -= 0.4;
  }

  return score;
}

export async function requireOrganizationMemberForAi(
  organizationId: string,
  options?: { requireCommercialWrite?: boolean }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized.");
  }

  const { data: member, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, display_name, avatar_path, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error || !member) {
    throw new Error("Not authorized for this organization.");
  }

  if (options?.requireCommercialWrite && !canManageCommercialData(member.role as AppRole)) {
    throw new Error("You do not have permission to use this AI workflow.");
  }

  return {
    supabase,
    user,
    member: member as OrganizationMemberRow,
  };
}

export async function validateOpportunityForOrganization(
  organizationId: string,
  opportunityId: string
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_opportunities")
    .select("id, organization_id, workspace_project_id")
    .eq("organization_id", organizationId)
    .eq("id", opportunityId)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Opportunity not found.");
  }

  return data;
}

export async function retrieveOrganizationMemoryForAi(params: {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  workbookId?: string | null;
  sheetId?: string | null;
  trade?: string | null;
  system?: string | null;
  product?: string | null;
  supplier?: string | null;
  projectType?: string | null;
  activity?: string | null;
  memoryCategories?: string[];
  memoryTypes?: string[];
  minimumConfidence?: number;
  limit?: number;
}) {
  const admin = createAdminSupabaseClient();
  const minimumConfidence = params.minimumConfidence ?? 0.35;
  const fetchLimit = Math.max(params.limit ?? 25, 1);

  let query = (admin as unknown as OrganizationMemoryItemsQuery)
    .from("organization_memory_items")
    .select(
      "id, memory_category, memory_type, title, summary, confidence_score, derived_from_total_count, memory_value, evidence_summary, source_memory_pool_type, source_memory_pool_id, updated_at"
    )
    .eq("organization_id", params.organizationId)
    .eq("is_active", true)
    .gte("confidence_score", minimumConfidence)
    .order("confidence_score", { ascending: false })
    .order("updated_at", { ascending: false });

  if (params.memoryCategories && params.memoryCategories.length > 0) {
    query = query.in("memory_category", params.memoryCategories);
  }

  if (params.memoryTypes && params.memoryTypes.length > 0) {
    query = query.in("memory_type", params.memoryTypes);
  }

  const { data, error } = (await query.limit(fetchLimit * 4)) as {
    data: OrganizationMemoryItemQueryRow[] | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(error.message);
  }

  const candidateRows = data ?? [];
  const constructionDecisionIds = candidateRows
    .filter((row) => row.memory_category === "construction_decision")
    .map((row) => row.id);

  const { data: linkRows, error: linkError } = constructionDecisionIds.length > 0
    ? await admin
        .from("organization_memory_links")
        .select("organization_memory_item_id")
        .eq("organization_id", params.organizationId)
        .in("organization_memory_item_id", constructionDecisionIds)
    : { data: [], error: null };

  if (linkError) {
    throw new Error(linkError.message);
  }

  const directLinkCounts = new Map<string, number>();
  for (const link of Array.isArray(linkRows) ? linkRows as Array<Record<string, unknown>> : []) {
    const memoryId = typeof link.organization_memory_item_id === "string" ? link.organization_memory_item_id : null;
    if (!memoryId) {
      continue;
    }
    directLinkCounts.set(memoryId, (directLinkCounts.get(memoryId) ?? 0) + 1);
  }

  const scored = candidateRows
    .map((row) => {
      const memoryValue = toJsonRecord(row.memory_value as Json);
      const evidenceSummary = toJsonRecord(row.evidence_summary as Json);
      const projectId =
        typeof memoryValue.projectId === "string" && memoryValue.projectId.length > 0
          ? memoryValue.projectId
          : null;
      const opportunityId =
        typeof memoryValue.opportunityId === "string" && memoryValue.opportunityId.length > 0
          ? memoryValue.opportunityId
          : null;
      const workbookId =
        typeof memoryValue.workbookId === "string" && memoryValue.workbookId.length > 0
          ? memoryValue.workbookId
          : null;
      const sheetId =
        typeof memoryValue.sheetId === "string" && memoryValue.sheetId.length > 0
          ? memoryValue.sheetId
          : null;

      let score = Number(row.confidence_score ?? 0);
      if (sheetId && sheetId === (params.sheetId ?? null)) {
        score += 0.3;
      } else if (sheetId && params.sheetId) {
        score -= 0.35;
      }
      if (workbookId && workbookId === (params.workbookId ?? null)) {
        score += 0.18;
      }
      if (projectId && projectId === (params.projectId ?? null)) {
        score += 0.12;
      }
      if (opportunityId && opportunityId === (params.opportunityId ?? null)) {
        score += 0.1;
      }
      const trade = typeof memoryValue.trade === "string" ? memoryValue.trade.toLowerCase() : null;
      const system = typeof memoryValue.system === "string" ? memoryValue.system.toLowerCase() : null;
      const product = typeof memoryValue.product === "string" ? memoryValue.product.toLowerCase() : null;
      const supplier = typeof memoryValue.supplier === "string" ? memoryValue.supplier.toLowerCase() : null;
      const projectType = typeof memoryValue.projectType === "string" ? memoryValue.projectType.toLowerCase() : null;
      const activity = typeof memoryValue.activity === "string" ? memoryValue.activity.toLowerCase() : null;
      const directLinkCount = directLinkCounts.get(row.id) ?? 0;
      const productMatch = Math.max(
        hasNormalizedMatch(memoryValue.product, params.product),
        hasNormalizedMatch(memoryValue.productSignature, params.product),
      );
      const systemMatch = hasNormalizedMatch(memoryValue.system, params.system);
      const tradeMatch = hasNormalizedMatch(memoryValue.trade, params.trade);
      const supplierMatch = hasNormalizedMatch(memoryValue.supplier, params.supplier);
      const activityMatch = Math.max(
        hasNormalizedMatch(memoryValue.activity, params.activity),
        hasNormalizedMatch(memoryValue.installMethod, params.activity),
      );
      const hasProductQuery = Boolean(normalizeLookupValue(params.product ?? null));
      const hasSupplierQuery = Boolean(normalizeLookupValue(params.supplier ?? null));
      const hasTradeOrSystemQuery = Boolean(normalizeLookupValue(params.trade ?? null) || normalizeLookupValue(params.system ?? null));
      const hasActivityQuery = Boolean(normalizeLookupValue(params.activity ?? null));

      if (
        row.memory_category === "construction_decision"
        && directLinkCount === 0
      ) {
        return null;
      }
      if (
        row.memory_category === "construction_decision"
        && hasProductQuery
        && !hasSupplierQuery
        && Math.max(productMatch, systemMatch, tradeMatch, activityMatch) < 0.35
      ) {
        return null;
      }
      if (
        row.memory_category === "construction_decision"
        && hasTradeOrSystemQuery
        && !hasSupplierQuery
        && Math.max(systemMatch, tradeMatch, productMatch, activityMatch) < 0.35
      ) {
        return null;
      }
      if (
        row.memory_category === "construction_decision"
        && hasActivityQuery
        && !hasSupplierQuery
        && Math.max(activityMatch, productMatch, systemMatch, tradeMatch) < 0.35
      ) {
        return null;
      }

      score += scoreContextMatch(memoryValue, {
        trade: params.trade,
        system: params.system,
        product: params.product,
        supplier: params.supplier,
        projectType: params.projectType,
        activity: params.activity,
      });
      if (row.memory_category === "construction_decision") {
        score += scoreConstructionMemoryRelevance({
          memoryType: row.memory_type,
          title: row.title,
          memoryValue,
          query: {
            trade: params.trade,
            system: params.system,
            product: params.product,
            supplier: params.supplier,
            projectType: params.projectType,
            activity: params.activity,
          },
        });
      }

      const searchableText = normalizeLookupValue([
        row.title,
        row.summary,
        trade,
        system,
        product,
        supplier,
        projectType,
        activity,
        typeof memoryValue.productSignature === "string" ? memoryValue.productSignature : null,
      ].filter(Boolean).join(" "));
      for (const queryValue of [params.product, params.supplier, params.system, params.trade, params.projectType, params.activity]) {
        const queryText = normalizeLookupValue(queryValue ?? null);
        if (!searchableText || !queryText) {
          continue;
        }
        if (searchableText.includes(queryText)) {
          score += 0.06;
        }
      }

      return {
        id: row.id,
        memoryCategory: row.memory_category,
        memoryType: row.memory_type,
        title: row.title,
        summary: row.summary,
        confidenceScore: Number(row.confidence_score ?? 0),
        derivedFromTotalCount: Number(row.derived_from_total_count ?? 0),
        memoryValue,
        evidenceSummary,
        updatedAt: row.updated_at,
        projectId,
        opportunityId,
        workbookId,
        sheetId,
        directLinkCount,
        productMatch,
        systemMatch,
        tradeMatch,
        supplierMatch,
        activityMatch,
        score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => right.score - left.score || right.confidenceScore - left.confidenceScore)
    .slice(0, fetchLimit);

  return scored as AiMemoryItem[];
}

export async function createAiLifecycleInteraction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    projectId?: string | null;
    opportunityId?: string | null;
    module: string;
    interactionType:
      | "chat"
      | "classification"
      | "extraction"
      | "generation"
      | "matching"
      | "recommendation"
      | "change_detection"
      | "reasoning"
      | "autocomplete";
    subjectEntityType: string;
    subjectEntityId?: string | null;
    provider: string;
    model: string;
    modelVersion?: string | null;
    promptTemplateKey?: string | null;
    promptText?: string | null;
    inputContextSummary: Record<string, Json>;
    inputRefs?: Json[];
    privacyClassification?: string;
  }
) {
  const { data, error } = await supabase.rpc("create_ai_interaction" as never, {
    p_input: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      module: input.module,
      interactionType: input.interactionType,
      subjectEntityType: input.subjectEntityType,
      subjectEntityId: input.subjectEntityId ?? null,
      provider: input.provider,
      model: input.model,
      modelVersion: input.modelVersion ?? null,
      promptTemplateKey: input.promptTemplateKey ?? null,
      promptText: input.promptText ?? null,
      inputContextSummary: input.inputContextSummary,
      inputRefs: input.inputRefs ?? [],
      runStatus: "queued",
      lifecycleState: "requested",
      validationStatus: "pending",
      privacyClassification: input.privacyClassification ?? "financial_sensitive",
      visibilityScope: "organization",
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function transitionAiLifecycleInteraction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    aiInteractionId: string;
    projectId?: string | null;
    opportunityId?: string | null;
    lifecycleState: AiLifecycleState;
    runStatus?: "queued" | "running" | "completed" | "failed" | "cancelled";
    validationStatus?: AiValidationStatus;
    confidence?: number | null;
    outputStructured?: Json | null;
    outputText?: string | null;
    outputRefs?: Json[];
    usageInputTokens?: number | null;
    usageOutputTokens?: number | null;
    usageTotalTokens?: number | null;
    latencyMs?: number | null;
    provider?: string | null;
    model?: string | null;
    humanDisposition?: "accepted" | "rejected" | "edited" | "partially_accepted" | "ignored" | null;
    humanFeedbackSummary?: string | null;
    editedOutput?: Json | null;
    supersededByInteractionId?: string | null;
  }
) {
  const { data, error } = await supabase.rpc("transition_ai_interaction_lifecycle" as never, {
    p_input: {
      organizationId: input.organizationId,
      aiInteractionId: input.aiInteractionId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      lifecycleState: input.lifecycleState,
      runStatus: input.runStatus ?? null,
      validationStatus: input.validationStatus ?? null,
      confidence: input.confidence ?? null,
      outputStructured: input.outputStructured ?? null,
      outputText: input.outputText ?? null,
      outputRefs: input.outputRefs ?? [],
      usageInputTokens: input.usageInputTokens ?? null,
      usageOutputTokens: input.usageOutputTokens ?? null,
      usageTotalTokens: input.usageTotalTokens ?? null,
      latencyMs: input.latencyMs ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      humanDisposition: input.humanDisposition ?? null,
      humanFeedbackSummary: input.humanFeedbackSummary ?? null,
      editedOutput: input.editedOutput ?? null,
      supersededByInteractionId: input.supersededByInteractionId ?? null,
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function recordAiInteractionValidation(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    aiInteractionId: string;
    projectId?: string | null;
    opportunityId?: string | null;
    module: string;
    scopeEntityType: string;
    scopeEntityId?: string | null;
    ruleKey: string;
    ruleVersion?: string;
    validationType:
      | "schema"
      | "business_rule"
      | "workflow_gate"
      | "financial_check"
      | "ai_confidence"
      | "duplicate_detection"
      | "permission_check"
      | "consistency_check";
    severity: "info" | "warning" | "error" | "critical";
    result: "passed" | "failed" | "warning" | "overridden";
    expectedValue?: Json | null;
    observedValue?: Json | null;
    details?: Record<string, Json>;
    requiresApproval?: boolean;
    approvalStatus?: "not_required" | "pending" | "approved" | "rejected";
    approvalNote?: string | null;
    privacyClassification?: string;
    validationStatus?: AiValidationStatus;
  }
) {
  const { data, error } = await supabase.rpc("record_ai_interaction_validation" as never, {
    p_input: {
      organizationId: input.organizationId,
      aiInteractionId: input.aiInteractionId,
      projectId: input.projectId ?? null,
      opportunityId: input.opportunityId ?? null,
      module: input.module,
      scopeEntityType: input.scopeEntityType,
      scopeEntityId: input.scopeEntityId ?? null,
      ruleKey: input.ruleKey,
      ruleVersion: input.ruleVersion ?? "v1",
      validationType: input.validationType,
      severity: input.severity,
      result: input.result,
      expectedValue: input.expectedValue ?? null,
      observedValue: input.observedValue ?? null,
      details: input.details ?? {},
      requiresApproval: input.requiresApproval ?? false,
      approvalStatus: input.approvalStatus ?? "not_required",
      approvalNote: input.approvalNote ?? null,
      privacyClassification: input.privacyClassification ?? "commercial_sensitive",
      visibilityScope: "organization",
      validationStatus: input.validationStatus ?? (input.result === "passed" ? "passed" : "warning"),
    },
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

export async function reviewAiInteraction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  input: {
    organizationId: string;
    aiInteractionId: string;
    lifecycleState: "accepted" | "edited" | "rejected" | "superseded";
    humanDisposition?: "accepted" | "edited" | "rejected";
    humanFeedbackSummary?: string | null;
    editedOutput?: Json | null;
    supersededByInteractionId?: string | null;
    module?: string;
    correctionTargetEntityType?: string | null;
  }
) {
  await transitionAiLifecycleInteraction(supabase, {
    organizationId: input.organizationId,
    aiInteractionId: input.aiInteractionId,
    lifecycleState: input.lifecycleState,
    runStatus: "completed",
    humanDisposition:
      input.lifecycleState === "superseded" ? null : input.humanDisposition ?? input.lifecycleState,
    humanFeedbackSummary: input.humanFeedbackSummary ?? null,
    editedOutput: input.editedOutput ?? null,
    supersededByInteractionId: input.supersededByInteractionId ?? null,
  });

  if (input.lifecycleState === "edited" && input.editedOutput) {
    const { error } = await supabase.rpc("write_correction_event" as never, {
      p_input: {
        organizationId: input.organizationId,
        module: input.module ?? "ai_workflows",
        correctionType: "ai_output_edit",
        targetEntityType: input.correctionTargetEntityType ?? "ai_output_preview",
        targetEntityId: input.aiInteractionId,
        linkedAiInteractionId: input.aiInteractionId,
        correctedFieldName: "output_structured",
        incorrectValue: null,
        correctedValue: input.editedOutput,
        correctionReason:
          input.humanFeedbackSummary ?? "User edited an AI-generated preview before approval.",
        feedbackLabel: "ai_output_edited",
        isTrainingEligible: true,
        privacyClassification: "financial_sensitive",
        visibilityScope: "organization",
      },
    } as never);

    if (error) {
      throw new Error(error.message);
    }
  }

  return input.aiInteractionId;
}

export function summarizeAiValidationStatus(warnings: AiValidationWarning[]): AiValidationStatus {
  if (warnings.some((warning) => warning.result === "failed" || warning.severity === "critical")) {
    return "failed";
  }

  if (warnings.some((warning) => warning.result === "warning")) {
    return "warning";
  }

  return "passed";
}

export function buildAiRequestContextSummary(input: AiRequestContextSummary) {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    opportunityId: input.opportunityId ?? null,
    module: input.module,
    workflowKey: input.workflowKey,
    workbookId: input.workbookId ?? input.worksheetId ?? null,
    worksheetId: input.worksheetId ?? input.workbookId ?? null,
    sheetId: input.sheetId ?? null,
    sheetName: input.sheetName ?? input.worksheetName ?? null,
    worksheetName: input.worksheetName ?? null,
    tradePackage: input.tradePackage ?? null,
    relatedCounts: input.relatedCounts ?? {},
    matchedMemoryIds: input.matchedMemoryIds ?? [],
  } satisfies Record<string, Json>;
}
