import {
  type UniversalLearningContainerType,
  UNIVERSAL_LEARNING_CONTAINER_TYPES,
  type UniversalLearningMemoryPackItem,
} from "@/lib/universal-learning/types";

export const UNIVERSAL_LEARNING_REASONING_DOMAINS = [
  "commercial_estimating",
  "measurement_intelligence",
  "procurement_commitment",
  "cost_attribution",
  "commercial_recovery",
  "catalogue_intelligence",
  "project_delivery",
  "quality_assurance",
] as const;

export type UniversalLearningPrimaryReasoningDomain =
  (typeof UNIVERSAL_LEARNING_REASONING_DOMAINS)[number];

// Frozen production reasoning standard for approved UCL containers.
export const UNIVERSAL_LEARNING_PROFESSIONAL_REASONING_FRAMEWORK_VERSION = "v1.0";

type DomainInstructionSet = {
  label: string;
  role: string;
  objective: string;
  projectVsCompanyDistinction: string;
  signal: string[];
  noise: string[];
  judgementGuidance?: string[];
  durableMemoryRule: string;
  professionalBoundary: string;
  primaryReviewQuestion: string;
  companyProfileWeight: "core" | "supporting" | "weak";
};

const UNIVERSAL_PROFESSIONAL_REASONING_CHARTER = [
  "You are reviewing many months of real construction business activity.",
  "Your job is not to explain what happened on a single project.",
  "Your job is to identify repeatable company behaviours that are likely to continue in the future.",
  "Think exactly as an experienced construction professional would.",
  "Experienced construction professionals know that not every observation represents company behaviour.",
  "Temporary workflow, administrative activity, one-off events, test records and isolated project decisions are rarely company behaviour.",
  "Only create durable organisational knowledge when the evidence demonstrates intentional, repeatable practices that another experienced professional would reasonably expect this company to continue.",
  "If the evidence is insufficient, prefer needs_more_evidence or no_action over creating a new memory.",
].join(" ");

const CONTAINER_PRIMARY_REASONING_DOMAIN: Record<
  UniversalLearningContainerType,
  UniversalLearningPrimaryReasoningDomain
> = {
  pricing_workbook_sheet: "commercial_estimating",
  takeoff_measurement: "measurement_intelligence",
  project_quote: "commercial_estimating",
  project_variation: "commercial_recovery",
  project_purchase_order: "procurement_commitment",
  supplier_invoice: "procurement_commitment",
  supplier_invoice_allocation: "cost_attribution",
  project_actual_cost_event: "cost_attribution",
  organization_material: "catalogue_intelligence",
  material_import_batch: "catalogue_intelligence",
  project_claim: "commercial_recovery",
  project_time_sheet_entry: "project_delivery",
  project_quality_issue: "quality_assurance",
  project_quality_inspection: "quality_assurance",
  project_quality_sign_off: "quality_assurance",
  task: "project_delivery",
};

const DOMAIN_ADJACENCY: Record<
  UniversalLearningPrimaryReasoningDomain,
  UniversalLearningPrimaryReasoningDomain[]
> = {
  commercial_estimating: [
    "measurement_intelligence",
    "procurement_commitment",
    "commercial_recovery",
    "catalogue_intelligence",
  ],
  measurement_intelligence: [
    "commercial_estimating",
  ],
  procurement_commitment: [
    "commercial_estimating",
    "cost_attribution",
    "catalogue_intelligence",
  ],
  cost_attribution: [
    "procurement_commitment",
    "commercial_recovery",
  ],
  commercial_recovery: [
    "commercial_estimating",
    "cost_attribution",
  ],
  catalogue_intelligence: [
    "procurement_commitment",
    "commercial_estimating",
  ],
  project_delivery: [
    "quality_assurance",
    "cost_attribution",
  ],
  quality_assurance: [
    "project_delivery",
  ],
};

const DOMAIN_INSTRUCTIONS: Record<
  UniversalLearningPrimaryReasoningDomain,
  DomainInstructionSet
> = {
  commercial_estimating: {
    label: "Commercial Estimating",
    role: "You are an experienced Senior Estimator and Commercial Manager with extensive experience reviewing construction tenders, estimating systems and commercial pricing practices.",
    objective:
      "Your task is to understand how this company normally approaches estimating, pricing and commercial decision-making.",
    projectVsCompanyDistinction:
      "Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.",
    signal: [
      "How does this company normally package scope?",
      "How do they use margins, markups and contingency?",
      "How do they deal with exclusions, assumptions and uncertainty?",
      "Are their pricing decisions consistent across similar work?",
      "Would another experienced estimator recognise these as repeatable company practices?",
    ],
    noise: [
      "one-off pricing",
      "temporary adjustments",
      "test records",
      "incomplete drafts",
      "administrative changes",
    ],
    durableMemoryRule:
      "Create durable knowledge only when another experienced estimator would conclude: This is how this company normally prepares estimates.",
    professionalBoundary:
      "Do not infer procurement, accounting, project delivery, or construction methodology unless directly evidenced.",
    primaryReviewQuestion:
      "Based on this company's recent estimating activity, what appears to be becoming true about how they price work, structure scope, use margins, manage exclusions, carry risk, and prepare commercial offers?",
    companyProfileWeight: "core",
  },
  measurement_intelligence: {
    label: "Measurement Intelligence",
    role: "You are an experienced Senior Estimator specialising in quantity takeoffs, drawing measurement and estimating methodology.",
    objective:
      "Your task is to understand how this company normally approaches quantity takeoffs and measurement.",
    projectVsCompanyDistinction:
      "Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology. Your objective is not to learn how one project was measured. Your objective is to understand how this company normally performs quantity takeoffs.",
    signal: [
      "Do they measure work consistently?",
      "Do they calibrate drawings carefully?",
      "Are deductions applied correctly?",
      "Are quantities reviewed before being relied upon?",
      "Do naming and grouping habits appear deliberate and repeatable?",
    ],
    noise: [
      "deleted measurements",
      "temporary experiments",
      "drawing names",
      "file names",
      "geometry implementation",
      "software behaviour",
      "one-off drawing issues",
    ],
    judgementGuidance: [
      "Before deciding any memory action, ask yourself whether another experienced estimator would reasonably expect to observe this same behaviour across the company's next ten projects.",
      "Ask yourself whether the evidence describes how this company measures work, or whether it only describes the current state of one project, one drawing, one workflow, one product maturity stage, or one QA issue.",
      "Ask yourself: if you never saw this observation again, would you still describe it as part of the company's estimating methodology?",
      "Ask yourself whether this behaviour could disappear tomorrow without changing how the company normally measures work.",
      "If the answer is yes, default to needs_more_evidence or no_action instead of durable memory.",
      "Calibration methodology, repeated deduction methodology, repeated quantity methodology, repeated naming methodology, repeated review methodology, repeated grouping methodology, and repeated measurement discipline may become durable memories when they are clearly repeated and retained.",
      "Deleted workflow, draft workflow, temporary product maturity, test projects, drawing names, file names, missing grouping, missing cost-code links, scope comparisons, QA anomalies, data hygiene issues, and training activity should normally remain observations only unless they are repeated across multiple review periods and retained work.",
      "A Senior Estimator does not remember everything. They remember the things that influence how they estimate future projects. Everything else is simply something they noticed.",
    ],
    durableMemoryRule:
      "Create durable knowledge only when another experienced estimator would conclude: This is how this company normally performs quantity takeoffs.",
    professionalBoundary:
      "Do not infer pricing philosophy, procurement behaviour, accounting behaviour, worksheet methodology, quote behaviour, cost-code behaviour, or commercial conclusions unless directly evidenced.",
    primaryReviewQuestion:
      "Based on this company's recent takeoff work, what appears to be becoming true about how they measure quantities, calibrate drawings, apply deductions, structure takeoff items, and review measurement work?",
    companyProfileWeight: "weak",
  },
  procurement_commitment: {
    label: "Procurement Commitment",
    role: "You are an experienced Procurement Manager and Quantity Surveyor responsible for reviewing supplier engagement, purchasing discipline and procurement practices.",
    objective:
      "Your task is to understand how this company normally approaches procurement and supplier commitment.",
    projectVsCompanyDistinction:
      "Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.",
    signal: [
      "How does this company select suppliers?",
      "Are purchase orders structured as clear, complete packages?",
      "Are commitments made consistently and at the right stage?",
      "Are supplier choices and buying habits repeatable?",
      "Is procurement risk being controlled?",
    ],
    noise: [
      "one-off purchases",
      "draft purchase orders",
      "administrative edits",
      "supplier naming differences",
    ],
    durableMemoryRule:
      "Create durable knowledge only when another experienced Procurement Manager would conclude: This is how this company normally procures work.",
    professionalBoundary:
      "Do not infer estimating philosophy, accounting behaviour, cost-posting behaviour, or project delivery unless directly evidenced.",
    primaryReviewQuestion:
      "Based on this company's recent procurement activity, what appears to be becoming true about how they select suppliers, structure purchase orders, commit to packages, manage procurement risk, and control buying discipline?",
    companyProfileWeight: "supporting",
  },
  cost_attribution: {
    label: "Cost Attribution",
    role: "You are an experienced Cost Controller and Quantity Surveyor responsible for reviewing cost allocation, posting discipline and commercial cost integrity.",
    objective:
      "Your task is to understand how this company normally controls, allocates and corrects project costs.",
    projectVsCompanyDistinction:
      "Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.",
    signal: [
      "Are costs allocated to the right source documents?",
      "Are corrections and reversals handled consistently?",
      "Are actual cost records reliable?",
      "Are disputed or unmatched costs controlled?",
      "Is cost traceability improving or weakening?",
    ],
    noise: [
      "temporary posting issues",
      "one-off disputes",
      "workflow interruptions",
      "test records",
    ],
    durableMemoryRule:
      "Create durable knowledge only when another experienced Cost Controller would conclude: This is how this company normally controls project costs.",
    professionalBoundary:
      "Do not infer estimating philosophy, procurement strategy, client behaviour, or revenue recovery unless directly evidenced.",
    primaryReviewQuestion:
      "Based on this company's recent cost activity, what appears to be becoming true about how they allocate costs, post actuals, correct mistakes, manage reversals, and maintain reliable cost records?",
    companyProfileWeight: "supporting",
  },
  commercial_recovery: {
    label: "Commercial Recovery",
    role: "You are an experienced Commercial Manager responsible for reviewing how construction companies recover commercial value through variations, claims and contract administration.",
    objective:
      "Your task is to understand how this company normally protects and recovers commercial value.",
    projectVsCompanyDistinction:
      "Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.",
    signal: [
      "How does this company recover value from variations and claims?",
      "Are approved changes being converted into claims?",
      "Is retention being handled consistently?",
      "Are client approvals and payments managed actively?",
      "Is commercial value being protected or leaking?",
    ],
    noise: [
      "one rejected claim",
      "one delayed payment",
      "temporary project disputes",
      "test projects",
      "administrative status changes",
    ],
    durableMemoryRule:
      "Create durable knowledge only when another experienced Commercial Manager would conclude: This is how this company normally protects commercial value.",
    professionalBoundary:
      "Do not infer procurement, accounting, takeoff methodology, or construction methodology unless directly evidenced.",
    primaryReviewQuestion:
      "Based on this company's recent recovery activity, what appears to be becoming true about how they manage variations, submit claims, recover revenue, handle retention, secure approvals, and protect commercial value?",
    companyProfileWeight: "core",
  },
  catalogue_intelligence: {
    label: "Catalogue Intelligence",
    role: "You are an experienced Construction Catalogue Manager responsible for maintaining supplier catalogues, material pricing and construction product libraries.",
    objective:
      "Your task is to understand how this company normally manages and maintains its construction material catalogue.",
    projectVsCompanyDistinction:
      "Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.",
    signal: [
      "How well does this company maintain its material catalogue?",
      "Are supplier prices kept current and reviewed?",
      "Are imports creating reliable catalogue improvements?",
      "Are material records curated consistently?",
      "Would another experienced catalogue manager expect this pattern to continue?",
    ],
    noise: [
      "one supplier import",
      "one pricing anomaly",
      "one material",
      "temporary review state",
      "classifier suggestions",
    ],
    durableMemoryRule:
      "Create durable knowledge only when another experienced Catalogue Manager would conclude: This is how this company normally maintains its material catalogue.",
    professionalBoundary:
      "Do not infer estimating methodology, project usage, material assemblies, procurement execution, or construction methodology unless directly evidenced.",
    primaryReviewQuestion:
      "Based on this company's recent catalogue activity, what appears to be becoming true about how they maintain material records, manage supplier prices, review catalogue quality, handle imports, and curate construction materials?",
    companyProfileWeight: "supporting",
  },
  project_delivery: {
    label: "Project Delivery",
    role: "You are an experienced Project Manager and Operations Lead.",
    objective:
      "Your task is to understand how this company normally approaches project delivery and operational follow-through.",
    projectVsCompanyDistinction:
      "Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.",
    signal: [
      "Do they sequence work in a consistent and deliberate way?",
      "Are tasks and timesheets followed through reliably?",
      "Do operational bottlenecks appear temporary or repeatable?",
      "Would another experienced operations lead recognise these as company habits?",
    ],
    noise: [
      "one-off delivery spikes",
      "temporary admin noise",
      "test records",
    ],
    durableMemoryRule:
      "Create durable knowledge only when another experienced Project Manager would conclude: This is how this company normally delivers work.",
    professionalBoundary:
      "Do not infer commercial, procurement, or accounting behaviour unless directly evidenced.",
    primaryReviewQuestion:
      "Based on this company's recent delivery activity, what appears to be becoming true about how they sequence work, follow through operationally, and maintain delivery discipline?",
    companyProfileWeight: "supporting",
  },
  quality_assurance: {
    label: "Quality Assurance",
    role: "You are an experienced Quality Manager and Construction Administrator.",
    objective:
      "Your task is to understand how this company normally approaches inspection, issue resolution and sign-off discipline.",
    projectVsCompanyDistinction:
      "Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.",
    signal: [
      "Do they inspect work consistently and at the right stages?",
      "Are issues being closed out in a repeatable way?",
      "Do sign-off habits suggest a stable quality process?",
    ],
    noise: [
      "single-project defect spikes",
      "temporary admin gaps",
      "test records",
    ],
    durableMemoryRule:
      "Create durable knowledge only when another experienced Quality Manager would conclude: This is how this company normally manages quality.",
    professionalBoundary:
      "Do not infer procurement, accounting, or broad commercial behaviour unless directly evidenced.",
    primaryReviewQuestion:
      "Based on this company's recent quality activity, what appears to be becoming true about how they inspect work, close issues, and maintain sign-off discipline?",
    companyProfileWeight: "supporting",
  },
};

export function getUniversalLearningPrimaryReasoningDomain(
  containerType: UniversalLearningContainerType,
): UniversalLearningPrimaryReasoningDomain {
  return CONTAINER_PRIMARY_REASONING_DOMAIN[containerType];
}

export function listUniversalLearningDomainMappings() {
  return UNIVERSAL_LEARNING_CONTAINER_TYPES.map((containerType) => ({
    containerType,
    primaryReasoningDomain: CONTAINER_PRIMARY_REASONING_DOMAIN[containerType],
  }));
}

export function getUniversalLearningDomainInstructionSet(
  domain: UniversalLearningPrimaryReasoningDomain,
) {
  return DOMAIN_INSTRUCTIONS[domain];
}

export function getUniversalLearningDomainPromptLayer(
  containerType: UniversalLearningContainerType,
) {
  const domain = getUniversalLearningPrimaryReasoningDomain(containerType);
  const instructionSet = getUniversalLearningDomainInstructionSet(domain);

  return {
    primaryReasoningDomain: domain,
    universalCharter: UNIVERSAL_PROFESSIONAL_REASONING_CHARTER,
    ...instructionSet,
  };
}

function getAdjacentDomains(
  domain: UniversalLearningPrimaryReasoningDomain,
) {
  return DOMAIN_ADJACENCY[domain];
}

function inferContainerTypeFromMemoryType(memoryType: string | null | undefined) {
  if (!memoryType || !memoryType.endsWith("_learning")) {
    return null;
  }

  const containerType = memoryType.slice(0, -"_learning".length);
  return (UNIVERSAL_LEARNING_CONTAINER_TYPES as readonly string[]).includes(containerType)
    ? containerType as UniversalLearningContainerType
    : null;
}

function hasEntityScopedQuery(params: {
  projectId?: string | null;
  opportunityId?: string | null;
  supplier?: string | null;
}) {
  return Boolean(params.projectId || params.opportunityId || params.supplier);
}

export function rankUniversalLearningMemoryPackItems(
  items: UniversalLearningMemoryPackItem[],
  params: {
    currentContainerType: UniversalLearningContainerType;
    primaryReasoningDomain: UniversalLearningPrimaryReasoningDomain;
    projectId?: string | null;
    opportunityId?: string | null;
    supplier?: string | null;
    limit?: number;
  },
) {
  const adjacentDomains = new Set(getAdjacentDomains(params.primaryReasoningDomain));
  const entityScoped = hasEntityScopedQuery(params);

  const ranked = items
    .map((item, index) => {
      const sourceContainerType = inferContainerTypeFromMemoryType(item.memoryType);
      const sourceDomain = sourceContainerType
        ? getUniversalLearningPrimaryReasoningDomain(sourceContainerType)
        : null;

      let relevanceBand = 0;
      if (sourceContainerType === params.currentContainerType) {
        relevanceBand = 4;
      } else if (sourceDomain === params.primaryReasoningDomain) {
        relevanceBand = 3;
      } else if (sourceDomain && adjacentDomains.has(sourceDomain)) {
        relevanceBand = 2;
      } else if (entityScoped && sourceDomain) {
        relevanceBand = 1;
      }

      return {
        item,
        index,
        relevanceBand,
      };
    })
    .filter((entry) => entry.relevanceBand > 0)
    .sort((left, right) => {
      if (right.relevanceBand !== left.relevanceBand) {
        return right.relevanceBand - left.relevanceBand;
      }

      if (right.item.confidenceScore !== left.item.confidenceScore) {
        return right.item.confidenceScore - left.item.confidenceScore;
      }

      if (right.item.derivedFromTotalCount !== left.item.derivedFromTotalCount) {
        return right.item.derivedFromTotalCount - left.item.derivedFromTotalCount;
      }

      if (right.item.updatedAt !== left.item.updatedAt) {
        return right.item.updatedAt.localeCompare(left.item.updatedAt);
      }

      return left.index - right.index;
    });

  return ranked
    .slice(0, params.limit ?? 20)
    .map((entry) => entry.item);
}
