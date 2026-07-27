import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { requirePlatformAdmin } from "@/lib/permissions-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type ConstructionSemanticPoolRow = {
  id: string;
  organizationId: string;
  semanticSignature: string;
  semanticFamily: string | null;
  semanticType: string | null;
  maturityStatus: string;
  title: string | null;
  summary: string | null;
  scopePayload: Record<string, Json | null>;
  poolValuePayload: Record<string, Json | null>;
  evidenceSummary: Record<string, Json | null>;
  supportCount: number;
  contradictionCount: number;
  eventCount: number;
  projectCount: number;
  supplierCount: number;
  averageConfidence: number | null;
  sourceRevisionHash: string;
  sourceEventIds: string[];
};

export type RunConstructionMemorySynthesisWorkerInput = {
  limit?: number;
  organizationId?: string | null;
  semanticPoolId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
};

export type RunConstructionMemorySynthesisWorkerOutput = {
  runId: string;
  claimedJobCount: number;
  completedJobCount: number;
  retriedJobCount: number;
  deadLetteredJobCount: number;
  noMemoryCount: number;
  createdMemoryCount: number;
  updatedMemoryCount: number;
  reusedMemoryCount: number;
  reinforcedMemoryCount: number;
  contradictedMemoryCount: number;
  supersededMemoryCount: number;
  organizationMemoryWriteCount: number;
  provenanceLinkCount: number;
  durationMs: number;
};

type ConstructionSynthesisQueueRow = {
  id: string;
  organizationId: string;
  semanticPoolId: string;
  sourceRevisionHash: string;
  queueState: string;
  attemptCount: number;
  maxAttempts: number;
  claimToken: string | null;
  availableAt: string | null;
  retryAfter: string | null;
  claimExpiresAt: string | null;
};

type ConstructionMemoryCandidate = {
  memoryCategory: string;
  memoryType: string;
  memoryKey: string;
  memorySignature: string;
  memoryDomainSignature: string;
  title: string;
  summary: string;
  memoryValue: Record<string, Json | null>;
  evidenceSummary: Record<string, Json | null>;
  baseConfidence: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundNumber(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function parseSemanticPool(row: Record<string, unknown>): ConstructionSemanticPoolRow | null {
  const id = toNullableString(row.id);
  const organizationId = toNullableString(row.organization_id);
  const sourceRevisionHash = toNullableString(row.source_revision_hash);
  if (!id || !organizationId || !sourceRevisionHash) {
    return null;
  }

  const evidenceSummary = isRecord(row.evidence_summary) ? row.evidence_summary as Record<string, Json | null> : {};

  return {
    id,
    organizationId,
    semanticSignature: toNullableString(row.semantic_signature) ?? "",
    semanticFamily: toNullableString(row.semantic_family),
    semanticType: toNullableString(row.semantic_type),
    maturityStatus: toNullableString(row.maturity_status) ?? "emerging",
    title: toNullableString(row.title),
    summary: toNullableString(row.summary),
    scopePayload: isRecord(row.scope_payload) ? row.scope_payload as Record<string, Json | null> : {},
    poolValuePayload: isRecord(row.pool_value_payload) ? row.pool_value_payload as Record<string, Json | null> : {},
    evidenceSummary,
    supportCount: toNullableNumber(row.support_count) ?? 0,
    contradictionCount: toNullableNumber(row.contradiction_count) ?? 0,
    eventCount: toNullableNumber(row.event_count) ?? 0,
    projectCount: toNullableNumber(row.project_count) ?? 0,
    supplierCount: toNullableNumber(row.supplier_count) ?? 0,
    averageConfidence: toNullableNumber(row.average_confidence),
    sourceRevisionHash,
    sourceEventIds: Array.isArray(evidenceSummary.supportingEventIds)
      ? evidenceSummary.supportingEventIds.flatMap((entry) => typeof entry === "string" ? [entry] : [])
      : [],
  };
}

function computeConfidence(pool: ConstructionSemanticPoolRow) {
  const base = 0.48;
  const reinforcementBonus = Math.min(pool.eventCount, 6) * 0.05;
  const projectBonus = Math.min(pool.projectCount, 3) * 0.06;
  const diversityBonus = Math.min(pool.supplierCount, 2) * 0.03;
  const contradictionPenalty = Math.min(pool.contradictionCount, 4) * 0.08;
  const signalBonus = pool.averageConfidence ? pool.averageConfidence * 0.1 : 0;

  return roundNumber(clamp(base + reinforcementBonus + projectBonus + diversityBonus + signalBonus - contradictionPenalty, 0.15, 0.92));
}

function buildCandidate(pool: ConstructionSemanticPoolRow): ConstructionMemoryCandidate | null {
  if (!["ready_for_synthesis", "reinforced", "durable"].includes(pool.maturityStatus)) {
    return null;
  }
  if (pool.eventCount < 2 || pool.sourceEventIds.length < 2) {
    return null;
  }

  const scope = pool.scopePayload;
  const value = pool.poolValuePayload;
  const trade = toNullableString(scope.trade);
  const system = toNullableString(scope.system);
  const assembly = toNullableString(value.assembly) ?? toNullableString(scope.assembly);
  const product = toNullableString(value.product) ?? toNullableString(value.productSignature);
  const supplier = toNullableString(value.supplier);
  const installMethod = toNullableString(value.installMethod);
  const projectType = toNullableString(value.projectType) ?? toNullableString(scope.projectContext);
  const activity = toNullableString(value.activity) ?? toNullableString(scope.activity);
  const productSignature = toNullableString(value.productSignature);
  const constructionSignature = toNullableString(value.constructionSignature);
  const exclusionsOrRisks = Array.isArray(value.exclusionsOrRisks)
    ? value.exclusionsOrRisks.flatMap((entry) => typeof entry === "string" ? [entry] : [])
    : [];
  const sourceEvidencePoolSignatures = Array.isArray(pool.evidenceSummary.evidencePoolIds)
    ? pool.evidenceSummary.evidencePoolIds.flatMap((entry) => typeof entry === "string" ? [entry] : [])
    : [];

  const requiresCrossProjectSupport = ["project_type", "pricing", "productivity"].includes(pool.semanticType ?? "");
  if (requiresCrossProjectSupport && pool.projectCount < 2) {
    return null;
  }
  if (!requiresCrossProjectSupport && pool.projectCount < 2 && pool.eventCount < 3) {
    return null;
  }

  let memoryType = "product_preference_pattern";
  let title = pool.title ?? "Construction decision";
  let summary = pool.summary ?? "Repeated construction intelligence decision.";
  let memoryDomainPayload: Record<string, Json | null> = {
    trade,
    system,
    assembly,
    product,
    projectType,
    semanticType: pool.semanticType,
  };
  let memorySignaturePayload: Record<string, Json | null> = {
    ...memoryDomainPayload,
    supplier,
    installMethod,
    exclusionsOrRisks,
  };

  if (supplier && product) {
    memoryType = "supplier_preference_pattern";
    title = `${supplier} for ${product}`;
    summary = `This company commonly buys ${product} from ${supplier}.`;
    memoryDomainPayload = { trade, system, product, projectType, memoryType };
    memorySignaturePayload = { ...memoryDomainPayload, supplier };
  } else if (product && system) {
    memoryType = "product_system_pattern";
    title = `${product} in ${system}`;
    summary = `This company commonly uses ${product} for ${system}.`;
    memoryDomainPayload = { trade, system, projectType, memoryType };
    memorySignaturePayload = { ...memoryDomainPayload, product };
  } else if (trade && product) {
    memoryType = "trade_product_pattern";
    title = `${trade} uses ${product}`;
    summary = `This company commonly uses ${product} in ${trade}.`;
    memoryDomainPayload = { trade, projectType, memoryType };
    memorySignaturePayload = { ...memoryDomainPayload, product };
  } else if (assembly && product) {
    memoryType = "assembly_pattern";
    title = `${assembly} with ${product}`;
    summary = `This company commonly builds ${assembly} with ${product}.`;
    memoryDomainPayload = { trade, system, assembly, projectType, memoryType };
    memorySignaturePayload = { ...memoryDomainPayload, product };
  } else if (installMethod && product) {
    memoryType = "install_method_pattern";
    title = `${installMethod} ${product}`;
    summary = `This company commonly installs ${product} using ${installMethod}.`;
    memoryDomainPayload = { trade, system, product, projectType, memoryType };
    memorySignaturePayload = { ...memoryDomainPayload, installMethod };
  } else if (projectType) {
    memoryType = "project_type_pattern";
    title = `${projectType} pattern`;
    summary = `This company repeats a construction decision pattern for ${projectType} work.`;
    memoryDomainPayload = { projectType, trade, system, memoryType };
    memorySignaturePayload = { ...memoryDomainPayload, product, supplier };
  } else if (exclusionsOrRisks.length > 0) {
    memoryType = "risk_exclusion_pattern";
    title = `${product ?? system ?? trade ?? "Construction"} risks`;
    summary = `This company repeatedly carries the same exclusion or risk pattern.`;
    memoryDomainPayload = { trade, system, product, memoryType };
    memorySignaturePayload = { ...memoryDomainPayload, exclusionsOrRisks: exclusionsOrRisks.join("|") };
  } else if (pool.semanticType === "pricing") {
    memoryType = "pricing_pattern";
    title = `${product ?? system ?? trade ?? "Construction"} pricing`;
    summary = `This company repeats a pricing pattern for ${product ?? system ?? trade ?? "this work"}.`;
  } else if (pool.semanticType === "productivity") {
    memoryType = "productivity_pattern";
    title = `${product ?? system ?? trade ?? "Construction"} productivity`;
    summary = `This company repeats a productivity pattern for ${product ?? system ?? trade ?? "this work"}.`;
  } else if (pool.semanticType === "procurement_preference") {
    memoryType = "procurement_preference_pattern";
    title = `${supplier ?? "Supplier"} procurement preference`;
    summary = `This company repeats the same procurement preference.`;
  } else {
    memoryType = "product_preference_pattern";
    title = product ?? title;
    summary = product
      ? `This company commonly prefers ${product}.`
      : summary;
    memoryDomainPayload = { trade, system, projectType, memoryType };
    memorySignaturePayload = { ...memoryDomainPayload, product };
  }

  const memoryDomainSignature = hashPayload(memoryDomainPayload);
  const memorySignature = hashPayload(memorySignaturePayload);

  return {
    memoryCategory: "construction_decision",
    memoryType,
    memoryKey: `${memoryType}:${memorySignature}`,
    memorySignature,
    memoryDomainSignature,
    title,
    summary,
    memoryValue: {
      trade,
      system,
      assembly,
      product,
      productSignature,
      constructionSignature,
      supplier,
      installMethod,
      projectType,
      activity,
      semanticPoolId: pool.id,
      semanticSignature: pool.semanticSignature,
      semanticType: pool.semanticType,
      sourcePoolType: "construction_memory_semantic_pool",
      sourceEvidencePoolSignatures,
    },
    evidenceSummary: {
      sourceType: "construction_memory_semantic_pool",
      semanticPoolId: pool.id,
      supportingEvidenceEventIds: pool.sourceEventIds,
      eventCount: pool.eventCount,
      projectCount: pool.projectCount,
      supplierCount: pool.supplierCount,
      supportCount: pool.supportCount,
      contradictionCount: pool.contradictionCount,
    },
    baseConfidence: computeConfidence(pool),
  };
}

function isQueueRowCurrentlyClaimable(
  row: Pick<ConstructionSynthesisQueueRow, "queueState" | "availableAt" | "retryAfter" | "claimExpiresAt">,
  now = Date.now(),
) {
  const availableAtMs = row.availableAt ? Date.parse(row.availableAt) : null;
  const retryAfterMs = row.retryAfter ? Date.parse(row.retryAfter) : null;
  const claimExpiresAtMs = row.claimExpiresAt ? Date.parse(row.claimExpiresAt) : null;

  if (row.queueState === "completed" || row.queueState === "dead_lettered") {
    return false;
  }
  if (availableAtMs !== null && Number.isFinite(availableAtMs) && availableAtMs > now) {
    return false;
  }
  if (row.queueState === "retry_scheduled" && retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs > now) {
    return false;
  }
  if (row.queueState === "claimed" && claimExpiresAtMs !== null && Number.isFinite(claimExpiresAtMs) && claimExpiresAtMs > now) {
    return false;
  }

  return true;
}

async function claimSynthesisQueue(params: {
  limit: number;
  organizationId?: string | null;
  semanticPoolId?: string | null;
  workerId: string;
  leaseSeconds: number;
}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("construction_memory_synthesis_queue" as never)
    .select("id, organization_id, semantic_pool_id, source_revision_hash, queue_state, attempt_count, max_attempts, available_at, retry_after, claim_expires_at")
    .in("queue_state", ["pending", "retry_scheduled", "claimed"] as never)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, params.limit) * 4);

  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId as never);
  }
  if (params.semanticPoolId) {
    query = query.eq("semantic_pool_id", params.semanticPoolId as never);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (Array.isArray(data) ? data : []).flatMap((row) => {
    const id = toNullableString((row as Record<string, unknown>).id);
    const organizationId = toNullableString((row as Record<string, unknown>).organization_id);
    const semanticPoolId = toNullableString((row as Record<string, unknown>).semantic_pool_id);
    const sourceRevisionHash = toNullableString((row as Record<string, unknown>).source_revision_hash);
    if (!id || !organizationId || !semanticPoolId || !sourceRevisionHash) {
      return [];
    }
    const candidate = {
      id,
      organizationId,
      semanticPoolId,
      sourceRevisionHash,
      queueState: toNullableString((row as Record<string, unknown>).queue_state) ?? "pending",
      attemptCount: toNullableNumber((row as Record<string, unknown>).attempt_count) ?? 0,
      maxAttempts: toNullableNumber((row as Record<string, unknown>).max_attempts) ?? 5,
      claimToken: randomUUID(),
      availableAt: toNullableString((row as Record<string, unknown>).available_at),
      retryAfter: toNullableString((row as Record<string, unknown>).retry_after),
      claimExpiresAt: toNullableString((row as Record<string, unknown>).claim_expires_at),
    } satisfies ConstructionSynthesisQueueRow;
    return isQueueRowCurrentlyClaimable(candidate) ? [candidate] : [];
  }).slice(0, Math.max(1, params.limit));

  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + Math.max(params.leaseSeconds, 30) * 1000).toISOString();
  for (const row of rows) {
    const { error: updateError } = await admin
      .from("construction_memory_synthesis_queue" as never)
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

async function finalizeSynthesisQueue(inputs: Array<{
  id: string;
  claimToken: string;
  queueState: "completed" | "retry_scheduled" | "dead_lettered";
  errorCode?: string | null;
  errorMessage?: string | null;
}>) {
  const admin = createAdminSupabaseClient();
  let completedCount = 0;
  let retriedCount = 0;
  let deadLetteredCount = 0;

  for (const input of inputs) {
    const completedAt = input.queueState === "completed" ? new Date().toISOString() : null;
    const { error } = await admin
      .from("construction_memory_synthesis_queue" as never)
      .update({
        queue_state: input.queueState,
        retry_after: input.queueState === "retry_scheduled" ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null,
        last_error_code: input.errorCode ?? null,
        last_error_message: input.errorMessage ?? null,
        last_completed_at: completedAt,
        claim_token: null,
        claim_expires_at: null,
        claimed_at: null,
        claimed_by: null,
      } as never)
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

async function loadSemanticPool(poolId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("construction_memory_semantic_pools" as never)
    .select("*")
    .eq("id", poolId as never)
    .eq("organization_id", organizationId as never)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row ? parseSemanticPool(row as Record<string, unknown>) : null;
}

async function listConflictingMemories(params: {
  organizationId: string;
  memoryDomainSignature: string;
  memoryType: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memory_items" as never)
    .select("*")
    .eq("organization_id", params.organizationId as never)
    .eq("memory_category", "construction_decision" as never)
    .eq("memory_type", params.memoryType as never)
    .eq("memory_domain_signature", params.memoryDomainSignature as never)
    .eq("is_active", true as never);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
}

async function insertProvenanceLinks(params: {
  organizationId: string;
  memoryId: string;
  semanticPoolId: string;
  evidencePoolIds?: string[];
  sourceEventIds: string[];
  supersededMemoryId?: string | null;
}) {
  const admin = createAdminSupabaseClient();
  const rows = [
    {
      organization_memory_item_id: params.memoryId,
      organization_id: params.organizationId,
      link_type: "seed",
      source_event_id: null,
      source_entity_type: "construction_memory_semantic_pool",
      source_entity_id: params.semanticPoolId,
      weight: 1,
      confidence_delta: 0,
      note: "Construction semantic pool provenance",
    },
    ...uniqueStrings(params.evidencePoolIds ?? []).map((poolId) => ({
      organization_memory_item_id: params.memoryId,
      organization_id: params.organizationId,
      link_type: "supporting",
      source_event_id: null,
      source_entity_type: "construction_memory_evidence_pool",
      source_entity_id: poolId,
      weight: 1,
      confidence_delta: 0,
      note: "Construction evidence pool provenance",
    })),
    ...params.sourceEventIds.map((eventId) => ({
      organization_memory_item_id: params.memoryId,
      organization_id: params.organizationId,
      link_type: "supporting",
      source_event_id: null,
      source_entity_type: "cost_construction_intelligence_event",
      source_entity_id: eventId,
      weight: 1,
      confidence_delta: 0,
      note: "Construction intelligence event provenance",
    })),
    ...(params.supersededMemoryId ? [{
      organization_memory_item_id: params.memoryId,
      organization_id: params.organizationId,
      link_type: "supersession",
      source_event_id: null,
      source_entity_type: "organization_memory_item",
      source_entity_id: params.supersededMemoryId,
      weight: 1,
      confidence_delta: -0.2,
      note: "Supersedes prior construction memory",
    }] : []),
  ];

  const deduped = new Map<string, Record<string, Json | null>>();
  for (const row of rows) {
    deduped.set(
      [
        String(row.organization_memory_item_id),
        String(row.link_type),
        String(row.source_entity_type),
        String(row.source_entity_id),
      ].join(":"),
      row as Record<string, Json | null>,
    );
  }

  const records = Array.from(deduped.values());
  if (records.length > 0) {
    const { error } = await admin
      .from("organization_memory_links" as never)
      .upsert(records as never, {
        onConflict: "organization_memory_item_id,source_entity_type,source_entity_id,link_type",
      });
    if (error) {
      throw new Error(error.message);
    }
  }

  const desiredEntityKeys = new Set(
    records.map((row) => [
      String(row.link_type),
      String(row.source_entity_type),
      String(row.source_entity_id),
    ].join(":")),
  );
  const desiredSourceEventIds = new Set(
    records
      .filter((row) => toNullableString(row.source_entity_type) === "cost_construction_intelligence_event")
      .map((row) => String(row.source_entity_id)),
  );

  const { data: existingLinks, error: existingLinksError } = await admin
    .from("organization_memory_links" as never)
    .select("id, link_type, source_event_id, source_entity_type, source_entity_id")
    .eq("organization_memory_item_id", params.memoryId as never)
    .eq("organization_id", params.organizationId as never)
    .in("source_entity_type", [
      "construction_memory_semantic_pool",
      "construction_memory_evidence_pool",
      "cost_construction_intelligence_event",
      "organization_memory_item",
    ] as never);

  if (existingLinksError) {
    throw new Error(existingLinksError.message);
  }

  const staleIds = (Array.isArray(existingLinks) ? existingLinks as Array<Record<string, unknown>> : [])
    .flatMap((row) => {
      const sourceEntityType = toNullableString(row.source_entity_type);
      const linkId = toNullableString(row.id);
      if (!linkId || !sourceEntityType) {
        return [];
      }
      if (sourceEntityType === "cost_construction_intelligence_event") {
        const sourceEventId = toNullableString(row.source_event_id) ?? toNullableString(row.source_entity_id);
        return sourceEventId && desiredSourceEventIds.has(sourceEventId) ? [] : [linkId];
      }
      const key = [
        toNullableString(row.link_type) ?? "supporting",
        sourceEntityType,
        toNullableString(row.source_entity_id) ?? "",
      ].join(":");
      return desiredEntityKeys.has(key) ? [] : [linkId];
    });

  if (staleIds.length > 0) {
    const { error: deleteError } = await admin
      .from("organization_memory_links" as never)
      .delete()
      .in("id", staleIds as never);
    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  return records.length;
}

async function persistConstructionMemory(params: {
  runId: string;
  queueRow: ConstructionSynthesisQueueRow;
  pool: ConstructionSemanticPoolRow;
  candidate: ConstructionMemoryCandidate;
}) {
  const admin = createAdminSupabaseClient();
  const existing = await listConflictingMemories({
    organizationId: params.pool.organizationId,
    memoryDomainSignature: params.candidate.memoryDomainSignature,
    memoryType: params.candidate.memoryType,
  });

  const matching = existing.find((row) => toNullableString(row.memory_signature) === params.candidate.memorySignature) ?? null;
  const competing = existing.find((row) => toNullableString(row.memory_signature) !== params.candidate.memorySignature) ?? null;

  let memoryId = toNullableString(matching?.id) ?? null;
  let decision: "no_memory" | "create_memory" | "reinforce_existing_memory" | "supersede_existing_memory" = "create_memory";
  let persistenceOutcome: "none" | "created" | "reused" | "updated" = "created";
  let lifecycleEventType: "memory_created" | "memory_reinforced" | "memory_updated" | "memory_superseded" = "memory_created";
  let confidenceBefore: number | null = null;
  let confidenceAfter = params.candidate.baseConfidence;
  let supersededMemoryId: string | null = null;
  let contradictedMemoryCount = 0;

  if (matching) {
    memoryId = toNullableString(matching.id);
    confidenceBefore = toNullableNumber(matching.confidence_score);
    confidenceAfter = roundNumber(clamp(Math.max(confidenceBefore ?? 0, params.candidate.baseConfidence) + 0.04, 0.15, 0.92));
    decision = "reinforce_existing_memory";
    persistenceOutcome = "updated";
    lifecycleEventType = "memory_reinforced";
  } else if (competing) {
    const competingConfidence = toNullableNumber(competing.confidence_score) ?? 0;
    if (params.candidate.baseConfidence >= competingConfidence + 0.05 || params.pool.projectCount >= 2) {
      supersededMemoryId = toNullableString(competing.id);
      decision = "supersede_existing_memory";
      persistenceOutcome = "created";
      lifecycleEventType = "memory_superseded";
    } else {
      decision = "no_memory";
      persistenceOutcome = "none";
      contradictedMemoryCount = 1;
    }
  }

  if (decision === "no_memory") {
    const { data: historyRows, error: historyError } = await admin
      .from("organization_memory_synthesis_history" as never)
      .insert({
        organization_id: params.pool.organizationId,
        memory_id: null,
        source_semantic_pool_id: null,
        source_revision_hash: params.pool.sourceRevisionHash,
        synthesis_queue_row_id: null,
        synthesis_run_id: null,
        source_memory_pool_type: "construction_memory_semantic_pool",
        source_memory_pool_id: params.pool.id,
        source_queue_type: "construction_memory_synthesis_queue",
        source_queue_id: params.queueRow.id,
        source_run_type: "construction_memory_synthesis_runs",
        source_run_id: params.runId,
        synthesis_decision: "no_memory",
        persistence_outcome: "none",
        prompt_version: "construction-memory-synthesis-v1",
        evidence_snapshot: {
          supportingEventIds: params.pool.sourceEventIds,
          eventCount: params.pool.eventCount,
          contradictionCount: params.pool.contradictionCount + contradictedMemoryCount,
        },
        duplicate_deactivation_snapshot: {},
        reasoning_summary: "Competing active memory remains stronger than the new construction candidate.",
      } as never)
      .select("id")
      .limit(1);

    if (historyError) {
      throw new Error(historyError.message);
    }

    return {
      memoryId: null,
      synthesisHistoryId: toNullableString(Array.isArray(historyRows) ? (historyRows[0] as Record<string, unknown>)?.id : null),
      decision,
      persistenceOutcome,
      lifecycleEventType: null,
      confidenceBefore,
      confidenceAfter: null,
      supersededMemoryId,
      provenanceLinkCount: 0,
    };
  }

  if (supersededMemoryId) {
    const { error: deactivateError } = await admin
      .from("organization_memory_items" as never)
      .update({
        is_active: false,
        superseded_at: new Date().toISOString(),
      } as never)
      .eq("id", supersededMemoryId as never)
      .eq("organization_id", params.pool.organizationId as never);

    if (deactivateError) {
      throw new Error(deactivateError.message);
    }
  }

  const memoryPayload = {
    organization_id: params.pool.organizationId,
    memory_category: params.candidate.memoryCategory,
    memory_type: params.candidate.memoryType,
    memory_key: params.candidate.memoryKey,
    title: params.candidate.title,
    summary: params.candidate.summary,
    memory_value: params.candidate.memoryValue,
    evidence_summary: {
      ...params.candidate.evidenceSummary,
      synthesisQueueRowId: params.queueRow.id,
      synthesisRunId: params.runId,
    },
    confidence_score: confidenceAfter,
    derived_from_event_count: params.pool.eventCount,
    derived_from_total_count: params.pool.eventCount,
    reinforcement_count: matching ? (toNullableNumber(matching.reinforcement_count) ?? 0) + 1 : params.pool.eventCount,
    contradiction_count: matching ? (toNullableNumber(matching.contradiction_count) ?? 0) : params.pool.contradictionCount,
    is_active: true,
    first_derived_at: matching ? matching.first_derived_at : new Date().toISOString(),
    last_derived_at: new Date().toISOString(),
    last_reinforced_at: new Date().toISOString(),
    source_revision_hash: params.pool.sourceRevisionHash,
    memory_signature: params.candidate.memorySignature,
    memory_domain_signature: params.candidate.memoryDomainSignature,
    base_confidence_score: params.candidate.baseConfidence,
    confidence_reason_summary: matching
      ? "Construction reinforcement increased confidence."
      : "Construction synthesis created a new decision memory.",
    source_semantic_pool_id: null,
    source_memory_pool_type: "construction_memory_semantic_pool",
    source_memory_pool_id: params.pool.id,
  };

  const { data: memoryRows, error: memoryError } = await admin
    .from("organization_memory_items" as never)
    .upsert(memoryPayload as never, { onConflict: "organization_id,memory_category,memory_type,memory_key" })
    .select("*")
    .limit(1);

  if (memoryError) {
    throw new Error(memoryError.message);
  }

  const memoryRow = Array.isArray(memoryRows) ? memoryRows[0] as Record<string, unknown> : null;
  memoryId = toNullableString(memoryRow?.id);
  if (!memoryId) {
    throw new Error("Unable to persist construction organization memory item.");
  }

  const { data: synthesisHistoryRows, error: synthesisHistoryError } = await admin
    .from("organization_memory_synthesis_history" as never)
    .insert({
      organization_id: params.pool.organizationId,
      memory_id: memoryId,
      source_semantic_pool_id: null,
      source_revision_hash: params.pool.sourceRevisionHash,
      synthesis_queue_row_id: null,
      synthesis_run_id: null,
      source_memory_pool_type: "construction_memory_semantic_pool",
      source_memory_pool_id: params.pool.id,
      source_queue_type: "construction_memory_synthesis_queue",
      source_queue_id: params.queueRow.id,
      source_run_type: "construction_memory_synthesis_runs",
      source_run_id: params.runId,
      synthesis_decision: decision,
      persistence_outcome: persistenceOutcome,
      prompt_version: "construction-memory-synthesis-v1",
      evidence_snapshot: {
        supportingEventIds: params.pool.sourceEventIds,
        eventCount: params.pool.eventCount,
        projectCount: params.pool.projectCount,
        supplierCount: params.pool.supplierCount,
      },
      before_memory_snapshot: matching ? matching : null,
      after_memory_snapshot: memoryRow,
      duplicate_deactivation_snapshot: {
        supersededMemoryId,
      },
      reasoning_summary: params.candidate.summary,
    } as never)
    .select("id")
    .limit(1);

  if (synthesisHistoryError) {
    throw new Error(synthesisHistoryError.message);
  }

  const synthesisHistoryId = toNullableString(Array.isArray(synthesisHistoryRows) ? (synthesisHistoryRows[0] as Record<string, unknown>)?.id : null);
  if (!synthesisHistoryId) {
    throw new Error("Unable to persist construction synthesis history.");
  }

  const { data: lifecycleRows, error: lifecycleError } = await admin
    .from("organization_memory_lifecycle_history" as never)
    .insert({
      organization_id: params.pool.organizationId,
      memory_id: memoryId,
      lifecycle_event_type: lifecycleEventType,
      event_origin_type: "synthesis",
      created_at: new Date().toISOString(),
      source_semantic_pool_id: null,
      source_revision_hash: params.pool.sourceRevisionHash,
      synthesis_history_id: synthesisHistoryId,
      synthesis_queue_row_id: null,
      synthesis_run_id: null,
      source_memory_pool_type: "construction_memory_semantic_pool",
      source_memory_pool_id: params.pool.id,
      source_queue_type: "construction_memory_synthesis_queue",
      source_queue_id: params.queueRow.id,
      source_run_type: "construction_memory_synthesis_runs",
      source_run_id: params.runId,
      before_memory_snapshot: matching ? matching : null,
      after_memory_snapshot: memoryRow,
      reason_summary: params.candidate.summary,
    } as never)
    .select("id")
    .limit(1);

  if (lifecycleError) {
    throw new Error(lifecycleError.message);
  }

  const lifecycleHistoryId = toNullableString(Array.isArray(lifecycleRows) ? (lifecycleRows[0] as Record<string, unknown>)?.id : null);
  if (!lifecycleHistoryId) {
    throw new Error("Unable to persist construction lifecycle history.");
  }

  const { data: confidenceRows, error: confidenceError } = await admin
    .from("organization_memory_confidence_history" as never)
    .insert({
      organization_id: params.pool.organizationId,
      memory_id: memoryId,
      confidence_before: confidenceBefore,
      confidence_after: confidenceAfter,
      confidence_delta: confidenceBefore === null ? null : roundNumber(confidenceAfter - confidenceBefore),
      reason_type: matching ? "reinforcement" : "memory_created",
      reason_summary: matching
        ? "Construction reinforcement recalculated confidence."
        : "Construction synthesis created a new memory.",
      calculation_version: 1,
      calculation_inputs: {
        eventCount: params.pool.eventCount,
        projectCount: params.pool.projectCount,
        supplierCount: params.pool.supplierCount,
        contradictionCount: params.pool.contradictionCount,
      },
      contributor_snapshot: {
        supportingEventIds: params.pool.sourceEventIds,
      },
      lifecycle_history_id: lifecycleHistoryId,
      synthesis_history_id: synthesisHistoryId,
      source_semantic_pool_id: null,
      source_revision_hash: params.pool.sourceRevisionHash,
      synthesis_queue_row_id: null,
      synthesis_run_id: null,
      source_memory_pool_type: "construction_memory_semantic_pool",
      source_memory_pool_id: params.pool.id,
      source_queue_type: "construction_memory_synthesis_queue",
      source_queue_id: params.queueRow.id,
      source_run_type: "construction_memory_synthesis_runs",
      source_run_id: params.runId,
      is_recalculation: Boolean(matching),
    } as never)
    .select("id")
    .limit(1);

  if (confidenceError) {
    throw new Error(confidenceError.message);
  }

  const confidenceHistoryId = toNullableString(Array.isArray(confidenceRows) ? (confidenceRows[0] as Record<string, unknown>)?.id : null);
  if (!confidenceHistoryId) {
    throw new Error("Unable to persist construction confidence history.");
  }

  await admin
    .from("organization_memory_items" as never)
    .update({
      last_confidence_history_id: confidenceHistoryId,
      last_confidence_calculated_at: new Date().toISOString(),
      superseded_by_memory_id: null,
    } as never)
    .eq("id", memoryId as never)
    .eq("organization_id", params.pool.organizationId as never);

  const provenanceLinkCount = await insertProvenanceLinks({
    organizationId: params.pool.organizationId,
    memoryId,
    semanticPoolId: params.pool.id,
    evidencePoolIds: Array.isArray(params.pool.evidenceSummary.evidencePoolIds)
      ? params.pool.evidenceSummary.evidencePoolIds.flatMap((entry) => typeof entry === "string" ? [entry] : [])
      : [],
    sourceEventIds: params.pool.sourceEventIds,
    supersededMemoryId,
  });

  return {
    memoryId,
    synthesisHistoryId,
    decision,
    persistenceOutcome,
    lifecycleEventType,
    confidenceBefore,
    confidenceAfter,
    supersededMemoryId,
    provenanceLinkCount,
  };
}

export async function runConstructionMemorySynthesisWorker(
  input: RunConstructionMemorySynthesisWorkerInput = {},
): Promise<RunConstructionMemorySynthesisWorkerOutput> {
  await requirePlatformAdmin("admin");

  const startedAt = Date.now();
  const runId = randomUUID();
  const admin = createAdminSupabaseClient();
  await admin.from("construction_memory_synthesis_runs" as never).insert({
    id: runId,
    requested_organization_id: input.organizationId ?? null,
  } as never);

  const summary: RunConstructionMemorySynthesisWorkerOutput = {
    runId,
    claimedJobCount: 0,
    completedJobCount: 0,
    retriedJobCount: 0,
    deadLetteredJobCount: 0,
    noMemoryCount: 0,
    createdMemoryCount: 0,
    updatedMemoryCount: 0,
    reusedMemoryCount: 0,
    reinforcedMemoryCount: 0,
    contradictedMemoryCount: 0,
    supersededMemoryCount: 0,
    organizationMemoryWriteCount: 0,
    provenanceLinkCount: 0,
    durationMs: 0,
  };

  const claimedRows = await claimSynthesisQueue({
    limit: input.limit ?? 25,
    organizationId: input.organizationId ?? null,
    semanticPoolId: input.semanticPoolId ?? null,
    workerId: input.workerId ?? "construction-memory-synthesis-runner",
    leaseSeconds: input.leaseSeconds ?? 10 * 60,
  });
  summary.claimedJobCount = claimedRows.length;

  const finalizeInputs: Array<{
    id: string;
    claimToken: string;
    queueState: "completed" | "retry_scheduled" | "dead_lettered";
    errorCode?: string | null;
    errorMessage?: string | null;
  }> = [];

  for (const row of claimedRows) {
    if (!row.claimToken) {
      continue;
    }

    try {
      const pool = await loadSemanticPool(row.semanticPoolId, row.organizationId);
      if (!pool || pool.sourceRevisionHash !== row.sourceRevisionHash) {
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: "completed",
          errorCode: "skipped_stale_semantic_revision",
          errorMessage: "Construction semantic pool revision is missing or has already been superseded.",
        });
        continue;
      }

      const candidate = buildCandidate(pool);
      if (!candidate) {
        summary.noMemoryCount += 1;
        const { error } = await admin
          .from("organization_memory_synthesis_history" as never)
          .insert({
            organization_id: pool.organizationId,
            memory_id: null,
            source_semantic_pool_id: null,
            source_revision_hash: pool.sourceRevisionHash,
            synthesis_queue_row_id: null,
            synthesis_run_id: null,
            source_memory_pool_type: "construction_memory_semantic_pool",
            source_memory_pool_id: pool.id,
            source_queue_type: "construction_memory_synthesis_queue",
            source_queue_id: row.id,
            source_run_type: "construction_memory_synthesis_runs",
            source_run_id: runId,
            synthesis_decision: "no_memory",
            persistence_outcome: "none",
            prompt_version: "construction-memory-synthesis-v1",
            evidence_snapshot: {
              supportingEventIds: pool.sourceEventIds,
              eventCount: pool.eventCount,
            },
            duplicate_deactivation_snapshot: {},
            reasoning_summary: "Construction pool did not meet minimum synthesis thresholds.",
          } as never);
        if (error) {
          throw new Error(error.message);
        }
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: "completed",
          errorCode: "skipped_below_synthesis_threshold",
          errorMessage: "Construction semantic pool did not meet the minimum synthesis thresholds for a durable memory.",
        });
        continue;
      }

      const persisted = await persistConstructionMemory({
        runId,
        queueRow: row,
        pool,
        candidate,
      });

      if (persisted.decision === "no_memory") {
        summary.noMemoryCount += 1;
      } else {
        summary.organizationMemoryWriteCount += persisted.memoryId ? 1 : 0;
        summary.provenanceLinkCount += persisted.provenanceLinkCount;
        if (persisted.decision === "create_memory") {
          summary.createdMemoryCount += 1;
        } else if (persisted.decision === "reinforce_existing_memory") {
          summary.updatedMemoryCount += 1;
          summary.reinforcedMemoryCount += 1;
        } else if (persisted.decision === "supersede_existing_memory") {
          summary.createdMemoryCount += 1;
          summary.supersededMemoryCount += 1;
        }
      }

      finalizeInputs.push({
        id: row.id,
        claimToken: row.claimToken,
        queueState: "completed",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to synthesize construction memory.";
      finalizeInputs.push({
        id: row.id,
        claimToken: row.claimToken,
        queueState: row.attemptCount + 1 >= row.maxAttempts ? "dead_lettered" : "retry_scheduled",
        errorCode: "construction_stage8_failed",
        errorMessage: message,
      });
    }
  }

  const finalized = await finalizeSynthesisQueue(finalizeInputs);
  summary.completedJobCount = finalized.completedCount;
  summary.retriedJobCount = finalized.retriedCount;
  summary.deadLetteredJobCount = finalized.deadLetteredCount;
  summary.durationMs = Date.now() - startedAt;

  await admin
    .from("construction_memory_synthesis_runs" as never)
    .update({
      claimed_job_count: summary.claimedJobCount,
      completed_job_count: summary.completedJobCount,
      retried_job_count: summary.retriedJobCount,
      dead_lettered_job_count: summary.deadLetteredJobCount,
      no_memory_count: summary.noMemoryCount,
      created_memory_count: summary.createdMemoryCount,
      updated_memory_count: summary.updatedMemoryCount,
      reused_memory_count: summary.reusedMemoryCount,
      reinforced_memory_count: summary.reinforcedMemoryCount,
      contradicted_memory_count: summary.contradictedMemoryCount,
      superseded_memory_count: summary.supersededMemoryCount,
      organization_memory_write_count: summary.organizationMemoryWriteCount,
      provenance_link_count: summary.provenanceLinkCount,
      duration_ms: summary.durationMs,
    } as never)
    .eq("id", runId as never);

  return summary;
}

export const constructionMemorySynthesisTestUtils = {
  buildCandidate,
  computeConfidence,
  insertProvenanceLinks,
};
