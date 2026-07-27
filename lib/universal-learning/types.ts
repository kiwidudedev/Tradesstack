import type { Json } from "@/lib/supabase/types";

export const UNIVERSAL_LEARNING_CONTAINER_TYPES = [
  "pricing_workbook_sheet",
  "takeoff_measurement",
  "project_quote",
  "project_variation",
  "project_purchase_order",
  "supplier_invoice",
  "supplier_invoice_allocation",
  "project_actual_cost_event",
  "organization_material",
  "material_import_batch",
  "project_claim",
  "project_time_sheet_entry",
  "project_quality_issue",
  "project_quality_inspection",
  "project_quality_sign_off",
  "task",
] as const;

export type UniversalLearningContainerType = (typeof UNIVERSAL_LEARNING_CONTAINER_TYPES)[number];

export type UniversalLearningRunType = "monthly" | "milestone" | "threshold" | "manual";
export type UniversalLearningRunStatus =
  | "pending"
  | "building"
  | "prompted"
  | "responded"
  | "applying"
  | "completed"
  | "failed"
  | "dead_lettered";

export type UniversalLearningRecordStrength = "weak" | "normal" | "strong";

export type UniversalLearningCursor = {
  updatedAt: string | null;
  id: string | null;
};

export type UniversalLearningLinkedContext = Record<string, Json | null>;
export type UniversalLearningRoutingContext = Record<string, Json | null>;
export type UniversalLearningPayload = Record<string, Json | null>;

export type UniversalLearningSourceReference = {
  table: string;
  sourceId: string;
  sourceVersion: number;
};

export type UniversalLearningBusinessRecord = {
  containerType: UniversalLearningContainerType;
  source: UniversalLearningSourceReference;
  organizationId: string;
  projectId: string | null;
  opportunityId: string | null;
  supplierId: string | null;
  clientId: string | null;
  actorUserId: string | null;
  updatedAt: string;
  status: Record<string, Json | null>;
  payload: UniversalLearningPayload;
  linkedContext: UniversalLearningLinkedContext;
  routingContext: UniversalLearningRoutingContext;
  signalStrength: UniversalLearningRecordStrength;
};

export type UniversalLearningCompanyConstructionProfile = {
  rawProfile: string | null;
  normalizedProfile: Record<string, Json | null>;
};

export type UniversalLearningMemoryPackItem = {
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
};

export type UniversalLearningReviewScopeContext = {
  module: string;
  workflow: string;
  recordCount: number;
  projectCount: number;
  supplierCount: number;
  clientCount: number;
  statusMix: Record<string, Json | null>;
  projects: Array<Record<string, Json | null>>;
  suppliers: Array<Record<string, Json | null>>;
  clients: Array<Record<string, Json | null>>;
};

export type UniversalLearningBoundaryContext = {
  routingIsImmutable: true;
  lockedFields: string[];
  forbiddenOperationalChanges: string[];
  lockedRoutingCodes: Record<string, string>;
};

export type UniversalLearningPromptPacket = {
  reviewMeta: {
    reviewId: string;
    organizationId: string;
    containerType: UniversalLearningContainerType;
    reviewMonth: string;
    reviewPeriodStart: string;
    reviewPeriodEnd: string;
    runType: UniversalLearningRunType;
    previousReviewCursor: UniversalLearningCursor;
    nextReviewCursorCandidate: UniversalLearningCursor;
    reviewIntent: string;
    maxLearnings: number;
  };
  companyConstructionProfile: UniversalLearningCompanyConstructionProfile;
  existingRelevantMemories: UniversalLearningMemoryPackItem[];
  reviewScopeContext: UniversalLearningReviewScopeContext;
  newBusinessActivity: UniversalLearningBusinessRecord[];
  boundaryContext: UniversalLearningBoundaryContext;
};

export type UniversalLearningPromptBuildResult = {
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
  promptPacket: UniversalLearningPromptPacket;
};

export type UniversalLearningConfidence = {
  score: number;
  label: "low" | "moderate" | "high" | "very_high";
  reasoning: string;
};

export type UniversalLearningEvidenceReference = {
  containerType?: UniversalLearningContainerType;
  sourceId: string;
  sourceScope?: "reviewed_record" | "existing_memory" | "existing_memory_source";
  memoryId?: string | null;
  reason: string;
};

export type UniversalLearningLearningRelationship = {
  status: "new" | "reinforces_existing" | "changes_existing" | "contradicts_existing" | "insufficient";
  memoryId: string | null;
  explanation: string;
};

export type UniversalLearningLearningItem = {
  learningId: string;
  title: string;
  statement: string;
  whyItMatters: string;
  confidence: UniversalLearningConfidence;
  evidence: {
    recordCount: number;
    projectCount?: number;
    supplierCount?: number;
    timeSpan?: string;
    supportingRecords: UniversalLearningEvidenceReference[];
  };
  relationshipToExistingMemory: UniversalLearningLearningRelationship;
  provenance: {
    reviewPeriodStart: string;
    reviewPeriodEnd: string;
    relevantEntities: {
      projectIds: string[];
      supplierIds: string[];
      clientIds: string[];
      materialIds: string[];
    };
  };
};

export type UniversalLearningMemoryAction = {
  action: "create" | "reinforce" | "update" | "retire" | "no_action";
  targetMemoryId: string | null;
  basedOnLearningId: string;
  proposedMemoryTitle: string | null;
  proposedMemorySummary: string;
  confidenceAdjustment: number;
  reason: string;
};

export type UniversalLearningResponse = {
  reviewSummary: {
    overallAssessment: string;
    dominantThemes: string[];
    confidenceNotes: string;
  };
  learnings: {
    observations: UniversalLearningLearningItem[];
    emergingPatterns: UniversalLearningLearningItem[];
    reinforcedPatterns: UniversalLearningLearningItem[];
    durablePatterns: UniversalLearningLearningItem[];
    changingBehaviors: UniversalLearningLearningItem[];
    contradictions: UniversalLearningLearningItem[];
    needsMoreEvidence: UniversalLearningLearningItem[];
  };
  memoryActions: {
    create: UniversalLearningMemoryAction[];
    reinforce: UniversalLearningMemoryAction[];
    update: UniversalLearningMemoryAction[];
    retireOrDeactivate: UniversalLearningMemoryAction[];
    noAction: UniversalLearningMemoryAction[];
  };
};

export type UniversalLearningBuilderContext = {
  organizationId: string;
  cursor: UniversalLearningCursor;
  reviewMonth: string;
};

export type UniversalLearningBuilderResult = {
  records: UniversalLearningBusinessRecord[];
  nextCursorCandidate: UniversalLearningCursor;
  reviewScopeContext: UniversalLearningReviewScopeContext;
};

export type UniversalLearningContainerDefinition = {
  containerType: UniversalLearningContainerType;
  displayName: string;
  primaryReasoningDomain: string;
  sourceTables: string[];
  monthlyCadence: "monthly";
  secondaryTriggers: string[];
  strongEvidenceStatuses: string[];
  workflow: string;
  module: string;
};

export type UniversalLearningRunSelection = {
  organizationId: string;
  containerType: UniversalLearningContainerType;
  reviewMonth: string;
  runType: UniversalLearningRunType;
  scopeKey: string;
};
