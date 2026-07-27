import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { requirePlatformAdmin } from "@/lib/permissions-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import type { CostConstructionIntelligenceSnapshot } from "@/lib/cost-construction-intelligence";

export type ConstructionMemoryEvidencePoolMaturityStatus =
  | "emerging"
  | "ready_for_synthesis"
  | "reinforced"
  | "durable"
  | "contested";

export type ConstructionMemoryEvidenceEvent = {
  id: string;
  organizationId: string;
  projectId: string | null;
  supplierNameSnapshot: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  documentContext: Record<string, Json | null>;
  classificationStatus: string;
  processedAt: string | null;
  createdAt: string;
  aiConstructionIntelligence: CostConstructionIntelligenceSnapshot | null;
};

export type ConstructionMemoryEvidencePoolEventLink = {
  organizationId: string;
  sourceEventId: string;
  evidenceRole: "supporting" | "contradictory" | "ignored";
  eventConfidence: number | null;
  occurredAt: string;
};

export type ConstructionMemoryEvidencePool = {
  persistedPoolId?: string | null;
  organizationId: string;
  poolSignature: string;
  scopeSignature: string;
  targetSignature: string;
  semanticSeedSignature: string | null;
  poolKind: string;
  scopeContext: Record<string, Json | null>;
  targetContext: Record<string, Json | null>;
  evidenceCount: number;
  eventCount: number;
  projectCount: number;
  supplierCount: number;
  supportCount: number;
  contradictionCount: number;
  averageConfidence: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  supportingEventIds: string[];
  poolRevisionHash: string;
  maturityStatus: ConstructionMemoryEvidencePoolMaturityStatus;
  linkedEvents: ConstructionMemoryEvidencePoolEventLink[];
};

export type RunConstructionMemoryEvidencePoolWorkerInput = {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
  eventLimit?: number;
};

export type RunConstructionMemoryEvidencePoolWorkerOutput = {
  claimedJobCount: number;
  completedJobCount: number;
  retriedJobCount: number;
  deadLetteredJobCount: number;
  rebuiltOrganizationCount: number;
  fetchedEventCount: number;
  persistedPoolCount: number;
  persistedLinkCount: number;
  semanticQueueInsertCount: number;
  durationMs: number;
};

type ConstructionMemoryEvidencePoolQueueRow = {
  id: string;
  organizationId: string;
  sourceEventId: string;
  queueState: string;
  attemptCount: number;
  maxAttempts: number;
  claimToken: string | null;
};

const DEFAULT_LIMIT = 25;
const DEFAULT_EVENT_LIMIT = 1000;
const DEFAULT_LEASE_SECONDS = 10 * 60;
const DEFAULT_WORKER_ID = "construction-memory-evidence-pool-runner";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function roundNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10_000) / 10_000;
}

function normalizeToken(value: unknown) {
  const text = toNullableString(value);
  if (!text) {
    return null;
  }
  return text.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isWeakDimension(value: string | null) {
  if (!value) {
    return true;
  }
  if (value.length < 2) {
    return true;
  }
  if (/^[^a-z0-9]+$/i.test(value)) {
    return true;
  }
  return ["unknown", "unspecified", "generic", "other", "misc", "miscellaneous", "n/a", "na"].includes(value);
}

function chooseStableDecisionValue(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = normalizeToken(value);
    if (!isWeakDimension(normalized)) {
      return normalized;
    }
  }
  return null;
}

function compactContext(entries: Record<string, string | number | boolean | null>) {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== null),
  ) as Record<string, Json | null>;
}

function buildScopeSignaturePayload(params: {
  kind: string;
  trade: string | null;
  system: string | null;
  assembly: string | null;
  activity: string | null;
  installMethod: string | null;
  projectType: string | null;
}) {
  switch (params.kind) {
    case "supplier_preference":
    case "procurement_preference":
      return compactContext({
        trade: params.trade,
        system: params.system,
      });
    case "product_preference":
      return compactContext({
        trade: params.trade,
        system: params.system,
      });
    case "trade_product":
      return compactContext({
        trade: params.trade,
        system: params.system,
      });
    case "product_system":
      return compactContext({
        system: params.system,
        assembly: params.assembly,
      });
    case "assembly_pattern":
      return compactContext({
        trade: params.trade,
        system: params.system,
        assembly: params.assembly,
      });
    case "install_method":
      return compactContext({
        trade: params.trade,
        system: params.system,
        activity: params.activity,
      });
    case "project_type":
      return compactContext({
        trade: params.trade,
        system: params.system,
        projectType: params.projectType,
      });
    case "pricing":
    case "productivity":
      return compactContext({
        trade: params.trade,
        system: params.system,
        activity: params.activity,
      });
    default:
      return {};
  }
}

type EvidenceVariant = {
  poolKind: string;
  scopePayload: Record<string, Json | null>;
  targetPayload: Record<string, Json | null>;
  semanticSeedSignature: string | null;
  priority: number;
};

function uniqueTokens(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseSnapshot(value: unknown): CostConstructionIntelligenceSnapshot | null {
  if (!isRecord(value) || !isRecord(value.normalization)) {
    return null;
  }

  return value as CostConstructionIntelligenceSnapshot;
}

function computeMaturityStatus(params: {
  eventCount: number;
  projectCount: number;
  supplierCount: number;
}): ConstructionMemoryEvidencePoolMaturityStatus {
  if (params.eventCount >= 4 && params.projectCount >= 2) {
    return "durable";
  }
  if (params.eventCount >= 3 && params.projectCount >= 2) {
    return "reinforced";
  }
  if (params.eventCount >= 2) {
    return "ready_for_synthesis";
  }
  return "emerging";
}

function hasMeaningfulProductContext(params: {
  trade: string | null;
  system: string | null;
  product: string | null;
  productSignature: string | null;
}) {
  return Boolean(
    params.productSignature
      || (params.product && !isWeakDimension(params.product))
      || (params.system && !isWeakDimension(params.system))
      || (params.trade && !isWeakDimension(params.trade)),
  );
}

function hasExplicitRiskContext(exclusionsOrRisks: string[]) {
  return exclusionsOrRisks.length > 0;
}

function isLikelyPaymentClaimContext(params: {
  activity: string | null;
  description: string;
  projectType: string | null;
  likelyUse: string | null;
}) {
  const haystack = [
    params.activity,
    params.projectType,
    params.likelyUse,
    normalizeToken(params.description),
  ]
    .filter(Boolean)
    .join(" ");
  return /payment claim|progress claim|claim line/.test(haystack);
}

function isMeaningfulInstallContext(params: {
  activity: string | null;
  installMethod: string | null;
  system: string | null;
  productSignature: string | null;
  product: string | null;
}) {
  return Boolean(
    (params.activity && /install|fix|place|apply|frame|line/.test(params.activity))
      || params.installMethod
  ) && hasMeaningfulProductContext({
    trade: null,
    system: params.system,
    product: params.product,
    productSignature: params.productSignature,
  });
}

function isMeaningfulPricingContext(params: {
  rate: number | null;
  unit: string | null;
  trade: string | null;
  system: string | null;
  product: string | null;
  productSignature: string | null;
}) {
  return params.rate !== null
    && Boolean(params.unit)
    && hasMeaningfulProductContext(params);
}

function isMeaningfulProductivityContext(params: {
  quantity: number | null;
  unit: string | null;
  activity: string | null;
  installMethod: string | null;
  trade: string | null;
  system: string | null;
  product: string | null;
  productSignature: string | null;
}) {
  const unit = params.unit ?? "";
  const labourLikeUnit = /hr|hour|m2|lm|lineal|linear|sqm|m\b/.test(unit);
  return params.quantity !== null
    && labourLikeUnit
    && isMeaningfulInstallContext({
      activity: params.activity,
      installMethod: params.installMethod,
      system: params.system,
      product: params.product,
      productSignature: params.productSignature,
    })
    && hasMeaningfulProductContext(params);
}

function pushVariant(
  variants: EvidenceVariant[],
  candidate: EvidenceVariant | null,
) {
  if (!candidate) {
    return;
  }
  variants.push(candidate);
}

function selectTopDecisionCandidates(variants: EvidenceVariant[]) {
  const byKind = new Map<string, EvidenceVariant>();
  for (const variant of variants) {
    const existing = byKind.get(variant.poolKind);
    if (!existing || variant.priority > existing.priority) {
      byKind.set(variant.poolKind, variant);
    }
  }

  return Array.from(byKind.values())
    .sort((left, right) => right.priority - left.priority || left.poolKind.localeCompare(right.poolKind))
    .slice(0, 3);
}

function buildEvidenceVariants(event: ConstructionMemoryEvidenceEvent) {
  const snapshot = event.aiConstructionIntelligence;
  if (!snapshot) {
    return [] as Array<{
      poolKind: string;
      scopePayload: Record<string, Json | null>;
      targetPayload: Record<string, Json | null>;
      semanticSeedSignature: string | null;
    }>;
  }

  const confidence = snapshot.confidence ?? null;
  if (confidence !== null && confidence < 0.45) {
    return [];
  }

  const projectType = chooseStableDecisionValue(
    snapshot.project_context,
    event.documentContext.projectType,
    event.documentContext.project_type,
  );
  const supplier = chooseStableDecisionValue(snapshot.supplier, event.supplierNameSnapshot);
  const productSignature = chooseStableDecisionValue(snapshot.normalization?.productSignature);
  const constructionSignature = chooseStableDecisionValue(snapshot.normalization?.constructionSignature);
  const trade = chooseStableDecisionValue(snapshot.trade, snapshot.subtrade);
  const system = chooseStableDecisionValue(snapshot.system, snapshot.work_package);
  const assembly = chooseStableDecisionValue(snapshot.assembly);
  const activity = chooseStableDecisionValue(snapshot.activity);
  const installMethod = chooseStableDecisionValue(snapshot.install_method);
  const product = chooseStableDecisionValue(snapshot.product, snapshot.product_family, snapshot.component, snapshot.brand);
  const manufacturer = chooseStableDecisionValue(snapshot.manufacturer);
  const brand = chooseStableDecisionValue(snapshot.brand);
  const productFamily = chooseStableDecisionValue(snapshot.product_family);
  const likelyUse = chooseStableDecisionValue(snapshot.likely_use);
  const unit = chooseStableDecisionValue(event.unit);
  const signalKey = productSignature ?? product ?? constructionSignature;
  const exclusionsOrRisks = snapshot.exclusions_or_risks
    .map((entry) => normalizeToken(entry))
    .filter((entry): entry is string => !isWeakDimension(entry));
  const meaningfulProductContext = hasMeaningfulProductContext({
    trade,
    system,
    product,
    productSignature,
  });
  const paymentClaimContext = isLikelyPaymentClaimContext({
    activity,
    description: event.description,
    projectType,
    likelyUse,
  });

  if (!meaningfulProductContext && !hasExplicitRiskContext(exclusionsOrRisks)) {
    return [];
  }
  if (paymentClaimContext && !meaningfulProductContext) {
    return [];
  }

  const decisionContext = compactContext({
    trade,
    system,
    assembly,
    activity,
    installMethod,
    projectContext: projectType,
  });

  const variants: EvidenceVariant[] = [];

  pushVariant(variants, signalKey && system
    ? {
        poolKind: "product_system",
        scopePayload: buildScopeSignaturePayload({
          kind: "product_system",
          trade,
          system,
          assembly,
          activity,
          installMethod,
          projectType,
        }),
        targetPayload: {
          productSignature,
          product,
          system,
          trade,
          decisionContext,
        },
        semanticSeedSignature: hashPayload({ system, trade, productSignature: signalKey }),
        priority: 100,
      }
    : null);

  pushVariant(variants, signalKey && trade
    ? {
        poolKind: "trade_product",
        scopePayload: buildScopeSignaturePayload({
          kind: "trade_product",
          trade,
          system,
          assembly,
          activity,
          installMethod,
          projectType,
        }),
        targetPayload: {
          trade,
          system,
          productSignature,
          product,
          decisionContext,
        },
        semanticSeedSignature: hashPayload({ trade, system, productSignature: signalKey }),
        priority: system ? 90 : 80,
      }
    : null);

  pushVariant(variants, supplier && (signalKey || system)
    ? {
        poolKind: "supplier_preference",
        scopePayload: buildScopeSignaturePayload({
          kind: "supplier_preference",
          trade,
          system,
          assembly,
          activity,
          installMethod,
          projectType,
        }),
        targetPayload: {
          supplier,
          productSignature,
          product,
          system,
          trade,
          decisionContext,
        },
        semanticSeedSignature: hashPayload({ supplier, trade, system, productSignature: signalKey ?? system }),
        priority: 95,
      }
    : null);

  pushVariant(variants, supplier && activity && (signalKey || system)
    ? {
        poolKind: "procurement_preference",
        scopePayload: buildScopeSignaturePayload({
          kind: "procurement_preference",
          trade,
          system,
          assembly,
          activity,
          installMethod,
          projectType,
        }),
        targetPayload: {
          supplier,
          activity,
          likelyUse,
          productSignature,
          product,
          system,
          trade,
          decisionContext,
        },
        semanticSeedSignature: hashPayload({
          supplier,
          activity,
          trade,
          system,
          productSignature: signalKey ?? system,
        }),
        priority: /supply|procure|purchase|order/.test(activity) ? 92 : 70,
      }
    : null);

  pushVariant(variants, isMeaningfulInstallContext({
    activity,
    installMethod,
    system,
    product,
    productSignature,
  })
    ? {
        poolKind: "install_method",
        scopePayload: buildScopeSignaturePayload({
          kind: "install_method",
          trade,
          system,
          assembly,
          activity,
          installMethod,
          projectType,
        }),
        targetPayload: {
          installMethod,
          productSignature,
          product,
          activity,
          system,
          trade,
          decisionContext,
        },
        semanticSeedSignature: hashPayload({ installMethod, activity, system, productSignature: signalKey ?? system }),
        priority: 88,
      }
    : null);

  pushVariant(variants, isMeaningfulPricingContext({
    rate: event.rate,
    unit,
    trade,
    system,
    product,
    productSignature,
  })
    ? {
        poolKind: "pricing",
        scopePayload: buildScopeSignaturePayload({
          kind: "pricing",
          trade,
          system,
          assembly,
          activity,
          installMethod,
          projectType,
        }),
        targetPayload: {
          unit,
          rate: event.rate,
          productSignature,
          product,
          system,
          trade,
          decisionContext,
        },
        semanticSeedSignature: hashPayload({
          kind: "pricing",
          unit,
          trade,
          system,
          productSignature: signalKey ?? system,
        }),
        priority: supplier ? 60 : 55,
      }
    : null);

  pushVariant(variants, isMeaningfulProductivityContext({
    quantity: event.quantity,
    unit,
    activity,
    installMethod,
    trade,
    system,
    product,
    productSignature,
  })
    ? {
        poolKind: "productivity",
        scopePayload: buildScopeSignaturePayload({
          kind: "productivity",
          trade,
          system,
          assembly,
          activity,
          installMethod,
          projectType,
        }),
        targetPayload: {
          quantity: event.quantity,
          unit,
          productSignature,
          product,
          system,
          trade,
          activity,
          decisionContext,
        },
        semanticSeedSignature: hashPayload({
          kind: "productivity",
          unit,
          activity,
          trade,
          system,
          productSignature: signalKey ?? system,
        }),
        priority: 58,
      }
    : null);

  pushVariant(variants, hasExplicitRiskContext(exclusionsOrRisks) && (signalKey || system || trade)
    ? {
        poolKind: "risk_exclusion",
        scopePayload: buildScopeSignaturePayload({
          kind: "install_method",
          trade,
          system,
          assembly,
          activity,
          installMethod,
          projectType,
        }),
        targetPayload: {
          productSignature,
          product,
          system,
          trade,
          exclusionsOrRisks,
          decisionContext,
        },
        semanticSeedSignature: hashPayload({
          trade,
          system,
          productSignature: signalKey ?? system,
          exclusionsOrRisks,
        }),
        priority: 85,
      }
    : null);

  return selectTopDecisionCandidates(variants).map(({ priority: _priority, ...variant }) => variant);
}

export function buildConstructionMemoryEvidencePools(
  events: ConstructionMemoryEvidenceEvent[],
): ConstructionMemoryEvidencePool[] {
  const grouped = new Map<string, {
    pool: Omit<ConstructionMemoryEvidencePool, "averageConfidence" | "eventCount" | "projectCount" | "supplierCount" | "firstSeenAt" | "lastSeenAt" | "supportingEventIds" | "poolRevisionHash" | "maturityStatus" | "evidenceCount">;
    confidences: number[];
    projectIds: Set<string>;
    supplierKeys: Set<string>;
  }>();

  for (const event of events) {
    if (event.classificationStatus !== "completed" || !event.aiConstructionIntelligence) {
      continue;
    }

    for (const variant of buildEvidenceVariants(event)) {
      const scopeSignature = hashPayload(variant.scopePayload);
      const targetSignature = hashPayload(variant.targetPayload);
      const poolSignature = hashPayload({
        organizationId: event.organizationId,
        poolKind: variant.poolKind,
        scopeSignature,
        targetSignature,
      });
      const key = `${event.organizationId}:${poolSignature}`;
      const existing = grouped.get(key) ?? {
        pool: {
          organizationId: event.organizationId,
          poolSignature,
          scopeSignature,
          targetSignature,
          semanticSeedSignature: variant.semanticSeedSignature,
          poolKind: variant.poolKind,
          scopeContext: variant.scopePayload,
          targetContext: variant.targetPayload,
          supportCount: 0,
          contradictionCount: 0,
          linkedEvents: [],
        },
        confidences: [],
        projectIds: new Set<string>(),
        supplierKeys: new Set<string>(),
      };

      existing.pool.linkedEvents.push({
        organizationId: event.organizationId,
        sourceEventId: event.id,
        evidenceRole: "supporting",
        eventConfidence: event.aiConstructionIntelligence.confidence ?? null,
        occurredAt: event.processedAt ?? event.createdAt,
      });
      existing.pool.supportCount += 1;
      if (event.aiConstructionIntelligence.confidence !== null) {
        existing.confidences.push(event.aiConstructionIntelligence.confidence);
      }
      if (event.projectId) {
        existing.projectIds.add(event.projectId);
      }
      const supplierKey =
        normalizeToken(event.aiConstructionIntelligence.supplier)
        ?? normalizeToken(event.supplierNameSnapshot);
      if (supplierKey) {
        existing.supplierKeys.add(supplierKey);
      }

      grouped.set(key, existing);
    }
  }

  return Array.from(grouped.values())
    .map(({ pool, confidences, projectIds, supplierKeys }) => {
      const linkedEvents = [...pool.linkedEvents].sort((left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) || left.sourceEventId.localeCompare(right.sourceEventId),
      );
      const eventIds = linkedEvents.map((entry) => entry.sourceEventId);
      const firstSeenAt = linkedEvents[0]?.occurredAt ?? new Date(0).toISOString();
      const lastSeenAt = linkedEvents[linkedEvents.length - 1]?.occurredAt ?? firstSeenAt;
      const averageConfidence = confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : null;
      const eventCount = new Set(eventIds).size;
      const maturityStatus = computeMaturityStatus({
        eventCount,
        projectCount: projectIds.size,
        supplierCount: supplierKeys.size,
      });

      return {
        ...pool,
        evidenceCount: eventCount,
        eventCount,
        projectCount: projectIds.size,
        supplierCount: supplierKeys.size,
        averageConfidence: roundNumber(averageConfidence),
        firstSeenAt,
        lastSeenAt,
        supportingEventIds: eventIds,
        poolRevisionHash: hashPayload({
          poolSignature: pool.poolSignature,
          eventIds,
          maturityStatus,
        }),
        maturityStatus,
      } satisfies ConstructionMemoryEvidencePool;
    })
    .sort((left, right) => right.eventCount - left.eventCount || left.poolSignature.localeCompare(right.poolSignature));
}

function parseEventRow(row: Record<string, unknown>): ConstructionMemoryEvidenceEvent | null {
  const id = toNullableString(row.id);
  const organizationId = toNullableString(row.organization_id);
  const createdAt = toNullableString(row.created_at);
  if (!id || !organizationId || !createdAt) {
    return null;
  }

  return {
    id,
    organizationId,
    projectId: toNullableString(row.project_id),
    supplierNameSnapshot: toNullableString(row.supplier_name_snapshot),
    description: toNullableString(row.description) ?? "",
    quantity: toNullableNumber(row.quantity),
    unit: toNullableString(row.unit),
    rate: toNullableNumber(row.rate),
    amount: toNullableNumber(row.amount),
    documentContext: isRecord(row.document_context) ? row.document_context as Record<string, Json | null> : {},
    classificationStatus: toNullableString(row.classification_status) ?? "pending",
    processedAt: toNullableString(row.processed_at),
    createdAt,
    aiConstructionIntelligence: parseSnapshot(row.ai_construction_intelligence),
  };
}

async function listCompletedConstructionEvents(params: {
  organizationId: string;
  limit: number;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("cost_construction_intelligence_events" as never)
    .select([
      "id",
      "organization_id",
      "project_id",
      "supplier_name_snapshot",
      "description",
      "quantity",
      "unit",
      "rate",
      "amount",
      "document_context",
      "classification_status",
      "processed_at",
      "created_at",
      "ai_construction_intelligence",
    ].join(", "))
    .eq("organization_id", params.organizationId as never)
    .eq("classification_status", "completed" as never)
    .order("processed_at", { ascending: false })
    .limit(Math.max(1, params.limit));

  if (error) {
    throw new Error(error.message);
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => parseEventRow((row ?? {}) as Record<string, unknown>))
    .filter((row): row is ConstructionMemoryEvidenceEvent => Boolean(row));
}

async function replacePoolEvents(poolId: string, organizationId: string, links: ConstructionMemoryEvidencePoolEventLink[]) {
  const admin = createAdminSupabaseClient();
  const deleteResult = await admin
    .from("construction_memory_evidence_pool_events" as never)
    .delete()
    .eq("pool_id", poolId as never)
    .eq("organization_id", organizationId as never);

  if (deleteResult.error) {
    throw new Error(deleteResult.error.message);
  }

  if (links.length === 0) {
    return 0;
  }

  const insertResult = await admin
    .from("construction_memory_evidence_pool_events" as never)
    .insert(links.map((link) => ({
      pool_id: poolId,
      organization_id: organizationId,
      source_event_id: link.sourceEventId,
      evidence_role: link.evidenceRole,
      event_confidence: link.eventConfidence,
      occurred_at: link.occurredAt,
    })) as never);

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }

  return links.length;
}

async function persistConstructionMemoryEvidencePools(pools: ConstructionMemoryEvidencePool[]) {
  const admin = createAdminSupabaseClient();
  let persistedPoolCount = 0;
  let persistedLinkCount = 0;

  for (const pool of pools) {
    const payload = {
      organization_id: pool.organizationId,
      pool_signature: pool.poolSignature,
      scope_signature: pool.scopeSignature,
      target_signature: pool.targetSignature,
      semantic_seed_signature: pool.semanticSeedSignature,
      pool_kind: pool.poolKind,
      scope_context: pool.scopeContext,
      target_context: pool.targetContext,
      evidence_count: pool.evidenceCount,
      event_count: pool.eventCount,
      project_count: pool.projectCount,
      supplier_count: pool.supplierCount,
      support_count: pool.supportCount,
      contradiction_count: pool.contradictionCount,
      average_confidence: pool.averageConfidence,
      first_seen_at: pool.firstSeenAt,
      last_seen_at: pool.lastSeenAt,
      supporting_event_ids: pool.supportingEventIds,
      pool_revision_hash: pool.poolRevisionHash,
      maturity_status: pool.maturityStatus,
      last_built_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("construction_memory_evidence_pools" as never)
      .upsert(payload as never, { onConflict: "organization_id,pool_signature" })
      .select("id")
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    const poolId = Array.isArray(data) ? toNullableString((data[0] as Record<string, unknown>)?.id) : null;
    if (!poolId) {
      continue;
    }
    persistedPoolCount += 1;
    persistedLinkCount += await replacePoolEvents(poolId, pool.organizationId, pool.linkedEvents);
  }

  return {
    poolCount: persistedPoolCount,
    linkCount: persistedLinkCount,
  };
}

async function enqueueConstructionSemanticPools(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("construction_memory_evidence_pools" as never)
    .select("id, pool_signature, pool_revision_hash, maturity_status")
    .eq("organization_id", organizationId as never)
    .in("maturity_status", ["ready_for_synthesis", "reinforced", "durable"] as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  if (rows.length === 0) {
    return 0;
  }

  const inserts = rows.flatMap((row) => {
    const seedPoolId = toNullableString(row.id);
    if (!seedPoolId) {
      return [];
    }
    return [{
      organization_id: organizationId,
      seed_pool_id: seedPoolId,
      seed_pool_signature: toNullableString(row.pool_signature) ?? "",
      seed_pool_revision_hash: toNullableString(row.pool_revision_hash) ?? "",
      seed_maturity_status: toNullableString(row.maturity_status) ?? "emerging",
      priority:
        row.maturity_status === "durable"
          ? 300
          : row.maturity_status === "reinforced"
            ? 200
            : 100,
    }];
  });

  if (inserts.length === 0) {
    return 0;
  }

  const { error: insertError } = await admin
    .from("construction_memory_semantic_pool_queue" as never)
    .upsert(inserts as never, { onConflict: "organization_id,seed_pool_id,seed_pool_revision_hash" });

  if (insertError) {
    throw new Error(insertError.message);
  }

  let reactivatedCount = 0;
  for (const row of inserts) {
    const { data: existingRows, error: existingError } = await admin
      .from("construction_memory_semantic_pool_queue" as never)
      .select("id, queue_state")
      .eq("organization_id", row.organization_id as never)
      .eq("seed_pool_id", row.seed_pool_id as never)
      .eq("seed_pool_revision_hash", row.seed_pool_revision_hash as never)
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingRow = Array.isArray(existingRows) ? existingRows[0] as Record<string, unknown> : null;
    const queueState = toNullableString(existingRow?.queue_state) ?? "pending";
    if (!["completed", "dead_lettered", "retry_scheduled"].includes(queueState)) {
      reactivatedCount += 1;
      continue;
    }

    const { error: reactivateError } = await admin
      .from("construction_memory_semantic_pool_queue" as never)
      .update({
        queue_state: "pending",
        retry_after: null,
        claim_expires_at: null,
        claim_token: null,
        claimed_at: null,
        claimed_by: null,
        last_error_code: "requeued_for_current_revision",
        last_error_message: "Construction evidence pool was re-enqueued for semantic grouping for the current revision.",
      } as never)
      .eq("id", toNullableString(existingRow?.id) as never);

    if (reactivateError) {
      throw new Error(reactivateError.message);
    }

    reactivatedCount += 1;
  }

  return reactivatedCount;
}

async function claimConstructionEvidenceQueue(params: {
  limit: number;
  organizationId?: string | null;
  workerId: string;
  leaseSeconds: number;
}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("construction_memory_evidence_pool_queue" as never)
    .select("id, organization_id, source_event_id, queue_state, attempt_count, max_attempts")
    .in("queue_state", ["pending", "retry_scheduled", "claimed"] as never)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, params.limit));

  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId as never);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (Array.isArray(data) ? data : []).flatMap((row) => {
    const id = toNullableString((row as Record<string, unknown>).id);
    const organizationId = toNullableString((row as Record<string, unknown>).organization_id);
    const sourceEventId = toNullableString((row as Record<string, unknown>).source_event_id);
    if (!id || !organizationId || !sourceEventId) {
      return [];
    }
    return [{
      id,
      organizationId,
      sourceEventId,
      queueState: toNullableString((row as Record<string, unknown>).queue_state) ?? "pending",
      attemptCount: toNullableNumber((row as Record<string, unknown>).attempt_count) ?? 0,
      maxAttempts: toNullableNumber((row as Record<string, unknown>).max_attempts) ?? 5,
      claimToken: randomUUID(),
    } satisfies ConstructionMemoryEvidencePoolQueueRow];
  });

  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + Math.max(params.leaseSeconds, 30) * 1000).toISOString();

  for (const row of rows) {
    const { error: updateError } = await admin
      .from("construction_memory_evidence_pool_queue" as never)
      .update({
        queue_state: "claimed",
        attempt_count: row.attemptCount + 1,
        claimed_at: now.toISOString(),
        claim_expires_at: claimExpiresAt,
        claimed_by: params.workerId,
        claim_token: row.claimToken,
        last_attempt_at: now.toISOString(),
      } as never)
      .eq("id", row.id as never);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return rows;
}

async function finalizeConstructionEvidenceQueue(inputs: Array<{
  id: string;
  claimToken: string;
  queueState: "completed" | "retry_scheduled" | "dead_lettered";
  errorCode?: string | null;
  errorMessage?: string | null;
}>) {
  if (inputs.length === 0) {
    return { completedCount: 0, retriedCount: 0, deadLetteredCount: 0 };
  }

  const admin = createAdminSupabaseClient();
  let completedCount = 0;
  let retriedCount = 0;
  let deadLetteredCount = 0;

  for (const input of inputs) {
    const payload = {
      queue_state: input.queueState,
      retry_after: input.queueState === "retry_scheduled" ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null,
      last_error_code: input.errorCode ?? null,
      last_error_message: input.errorMessage ?? null,
      last_completed_at: input.queueState === "completed" ? new Date().toISOString() : null,
      claim_token: null,
      claim_expires_at: null,
    };

    const { error } = await admin
      .from("construction_memory_evidence_pool_queue" as never)
      .update(payload as never)
      .eq("id", input.id as never)
      .eq("claim_token", input.claimToken as never);

    if (error) {
      throw new Error(error.message);
    }

    if (input.queueState === "completed") {
      completedCount += 1;
    } else if (input.queueState === "retry_scheduled") {
      retriedCount += 1;
    } else {
      deadLetteredCount += 1;
    }
  }

  return { completedCount, retriedCount, deadLetteredCount };
}

async function buildConstructionMemoryEvidencePoolsForOrganization(organizationId: string, limit: number) {
  const events = await listCompletedConstructionEvents({
    organizationId,
    limit,
  });
  const pools = buildConstructionMemoryEvidencePools(events);
  const persisted = await persistConstructionMemoryEvidencePools(pools);

  return {
    fetchedCount: events.length,
    poolCount: pools.length,
    persistedPoolCount: persisted.poolCount,
    persistedLinkCount: persisted.linkCount,
  };
}

export async function enqueueConstructionMemoryEvidenceEvent(input: {
  organizationId: string;
  sourceEventId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("construction_memory_evidence_pool_queue" as never)
    .upsert({
      organization_id: input.organizationId,
      source_event_id: input.sourceEventId,
      queue_state: "pending",
      attempt_count: 0,
      retry_after: null,
      last_error_code: null,
      last_error_message: null,
    } as never, { onConflict: "source_event_id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function runConstructionMemoryEvidencePoolWorker(
  input: RunConstructionMemoryEvidencePoolWorkerInput = {},
): Promise<RunConstructionMemoryEvidencePoolWorkerOutput> {
  await requirePlatformAdmin("admin");

  const startedAt = Date.now();
  const claimedRows = await claimConstructionEvidenceQueue({
    limit: input.limit ?? DEFAULT_LIMIT,
    organizationId: input.organizationId ?? null,
    workerId: input.workerId ?? DEFAULT_WORKER_ID,
    leaseSeconds: input.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
  });

  if (claimedRows.length === 0) {
    return {
      claimedJobCount: 0,
      completedJobCount: 0,
      retriedJobCount: 0,
      deadLetteredJobCount: 0,
      rebuiltOrganizationCount: 0,
      fetchedEventCount: 0,
      persistedPoolCount: 0,
      persistedLinkCount: 0,
      semanticQueueInsertCount: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const queueByOrganization = new Map<string, ConstructionMemoryEvidencePoolQueueRow[]>();
  for (const row of claimedRows) {
    const current = queueByOrganization.get(row.organizationId) ?? [];
    current.push(row);
    queueByOrganization.set(row.organizationId, current);
  }

  const finalizeInputs: Array<{
    id: string;
    claimToken: string;
    queueState: "completed" | "retry_scheduled" | "dead_lettered";
    errorCode?: string | null;
    errorMessage?: string | null;
  }> = [];
  let rebuiltOrganizationCount = 0;
  let fetchedEventCount = 0;
  let persistedPoolCount = 0;
  let persistedLinkCount = 0;
  let semanticQueueInsertCount = 0;

  for (const [organizationId, rows] of queueByOrganization.entries()) {
    try {
      const result = await buildConstructionMemoryEvidencePoolsForOrganization(
        organizationId,
        input.eventLimit ?? DEFAULT_EVENT_LIMIT,
      );
      rebuiltOrganizationCount += 1;
      fetchedEventCount += result.fetchedCount;
      persistedPoolCount += result.persistedPoolCount;
      persistedLinkCount += result.persistedLinkCount;
      semanticQueueInsertCount += await enqueueConstructionSemanticPools(organizationId);

      for (const row of rows) {
        if (!row.claimToken) {
          continue;
        }
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: "completed",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to build construction evidence pools.";
      for (const row of rows) {
        if (!row.claimToken) {
          continue;
        }
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: row.attemptCount + 1 >= row.maxAttempts ? "dead_lettered" : "retry_scheduled",
          errorCode: "construction_stage6_failed",
          errorMessage: message,
        });
      }
    }
  }

  const finalized = await finalizeConstructionEvidenceQueue(finalizeInputs);
  return {
    claimedJobCount: claimedRows.length,
    completedJobCount: finalized.completedCount,
    retriedJobCount: finalized.retriedCount,
    deadLetteredJobCount: finalized.deadLetteredCount,
    rebuiltOrganizationCount,
    fetchedEventCount,
    persistedPoolCount,
    persistedLinkCount,
    semanticQueueInsertCount,
    durationMs: Date.now() - startedAt,
  };
}
