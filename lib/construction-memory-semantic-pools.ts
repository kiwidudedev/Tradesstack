import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { requirePlatformAdmin } from "@/lib/permissions-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import type { ConstructionMemoryEvidencePool, ConstructionMemoryEvidencePoolMaturityStatus } from "@/lib/construction-memory-evidence-pools";

export type ConstructionMemorySemanticPool = {
  organizationId: string;
  semanticSignature: string;
  semanticFamily: string | null;
  semanticType: string | null;
  poolStatus: "active" | "contested" | "stale" | "superseded" | "rejected";
  maturityStatus: ConstructionMemoryEvidencePoolMaturityStatus;
  title: string | null;
  summary: string | null;
  retrievalGuidance: string | null;
  scopePayload: Record<string, Json | null>;
  poolValuePayload: Record<string, Json | null>;
  evidenceSummary: Record<string, Json | null>;
  contradictionSummary: Record<string, Json | null>;
  supportCount: number;
  contradictionCount: number;
  ignoredCount: number;
  eventCount: number;
  projectCount: number;
  supplierCount: number;
  averageConfidence: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceRevisionHash: string;
  sourceEventIds: string[];
};

export type RunConstructionMemorySemanticPoolWorkerInput = {
  limit?: number;
  organizationId?: string | null;
  workerId?: string | null;
  leaseSeconds?: number;
};

export type RunConstructionMemorySemanticPoolWorkerOutput = {
  runId: string;
  claimedJobCount: number;
  completedJobCount: number;
  retriedJobCount: number;
  deadLetteredJobCount: number;
  semanticPoolCount: number;
  candidateEventCount: number;
  synthesisQueueInsertCount: number;
  durationMs: number;
};

type SemanticQueueRow = {
  id: string;
  organizationId: string;
  seedPoolId: string;
  seedPoolRevisionHash: string;
  queueState: string;
  attemptCount: number;
  maxAttempts: number;
  claimToken: string | null;
  availableAt: string | null;
  retryAfter: string | null;
  claimExpiresAt: string | null;
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

function roundNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10_000) / 10_000;
}

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildSemanticSignature(pool: ConstructionMemoryEvidencePool) {
  const target = pool.targetContext;
  const scope = pool.scopeContext;
  const product = toNullableString(target.product) ?? toNullableString(target.productSignature);
  const productSignature = toNullableString(target.productSignature) ?? product;
  const supplier = toNullableString(target.supplier);
  const system = toNullableString(target.system) ?? toNullableString(scope.system);
  const trade = toNullableString(target.trade) ?? toNullableString(scope.trade);
  const assembly = toNullableString(target.assembly) ?? toNullableString(scope.assembly);
  const activity = toNullableString(target.activity) ?? toNullableString(scope.activity);
  const installMethod = toNullableString(target.installMethod);
  const projectType = toNullableString(target.projectType) ?? toNullableString(scope.projectType) ?? toNullableString(scope.projectContext);
  const unit = toNullableString(target.unit);

  switch (pool.poolKind) {
    case "supplier_preference":
    case "procurement_preference":
      return hashPayload({
        poolKind: pool.poolKind,
        supplier,
        productSignature,
        trade,
        system,
      });
    case "product_preference":
      return hashPayload({
        poolKind: pool.poolKind,
        productSignature,
        trade,
        system,
      });
    case "trade_product":
      return hashPayload({
        poolKind: pool.poolKind,
        trade,
        system,
        productSignature,
      });
    case "product_system":
      return hashPayload({
        poolKind: pool.poolKind,
        system,
        assembly,
        productSignature,
      });
    case "assembly_pattern":
      return hashPayload({
        poolKind: pool.poolKind,
        trade,
        system,
        assembly,
        productSignature,
      });
    case "install_method":
      return hashPayload({
        poolKind: pool.poolKind,
        installMethod,
        activity,
        system,
        productSignature,
      });
    case "project_type":
      return hashPayload({
        poolKind: pool.poolKind,
        projectType,
        trade,
        system,
        productSignature,
      });
    case "pricing":
    case "productivity":
      return hashPayload({
        poolKind: pool.poolKind,
        unit,
        trade,
        system,
        activity,
        productSignature,
      });
    default:
      return hashPayload({
        poolKind: pool.poolKind,
        productSignature,
        trade,
        system,
      });
  }
}

function labelFromPool(pool: ConstructionMemoryEvidencePool) {
  const target = pool.targetContext;
  const supplier = toNullableString(target.supplier);
  const product = toNullableString(target.product) ?? toNullableString(target.productSignature);
  const system = toNullableString(target.system);
  const assembly = toNullableString(target.assembly);
  const installMethod = toNullableString(target.installMethod);
  const projectType = toNullableString(target.projectType);
  const constructionSignature = toNullableString(target.constructionSignature);

  if (supplier && product) {
    return `${product} from ${supplier}`;
  }
  if (product && system) {
    return `${product} for ${system}`;
  }
  if (assembly && product) {
    return `${assembly} with ${product}`;
  }
  if (installMethod && product) {
    return `${installMethod} ${product}`;
  }
  return product ?? supplier ?? system ?? assembly ?? projectType ?? constructionSignature ?? pool.poolKind;
}

export function buildConstructionMemorySemanticPools(
  evidencePools: ConstructionMemoryEvidencePool[],
): ConstructionMemorySemanticPool[] {
  const grouped = new Map<string, {
    semanticSignature: string;
    pools: ConstructionMemoryEvidencePool[];
  }>();

  for (const pool of evidencePools) {
    const semanticSignature = buildSemanticSignature(pool);
    const current = grouped.get(semanticSignature) ?? {
      semanticSignature,
      pools: [],
    };
    current.pools.push(pool);
    grouped.set(semanticSignature, current);
  }

  return Array.from(grouped.values()).map(({ semanticSignature, pools }) => {
    const first = pools[0];
    const eventIds = Array.from(new Set(pools.flatMap((pool) => pool.supportingEventIds)));
    const supportCount = pools.reduce((sum, pool) => sum + pool.supportCount, 0);
    const contradictionCount = pools.reduce((sum, pool) => sum + pool.contradictionCount, 0);
    const eventCount = eventIds.length;
    const projectCount = Math.max(...pools.map((pool) => pool.projectCount), 0);
    const supplierCount = Math.max(...pools.map((pool) => pool.supplierCount), 0);
    const confidenceValues = pools.map((pool) => pool.averageConfidence).filter((value): value is number => value !== null);
    const averageConfidence = confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : null;
    const maturityOrder = ["emerging", "ready_for_synthesis", "reinforced", "durable", "contested"];
    const maturityStatus = pools
      .map((pool) => pool.maturityStatus)
      .sort((left, right) => maturityOrder.indexOf(right) - maturityOrder.indexOf(left))[0] ?? "emerging";
    const firstSeenAt = [...pools].sort((left, right) => left.firstSeenAt.localeCompare(right.firstSeenAt))[0]?.firstSeenAt ?? new Date(0).toISOString();
    const lastSeenAt = [...pools].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))[0]?.lastSeenAt ?? firstSeenAt;
    const target = first.targetContext;
    const semanticType = first.poolKind;
    const title = labelFromPool(first);

    return {
      organizationId: first.organizationId,
      semanticSignature,
      semanticFamily: toNullableString(target.productSignature)
        ?? toNullableString(target.constructionSignature)
        ?? first.poolKind,
      semanticType,
      poolStatus: contradictionCount > supportCount ? "contested" : "active",
      maturityStatus,
      title,
      summary: `${title} appears in ${eventCount} construction intelligence events.`,
      retrievalGuidance: `Prioritize when trade=${toNullableString(first.scopeContext.trade) ?? "any"} and system=${toNullableString(first.scopeContext.system) ?? "any"}.`,
      scopePayload: first.scopeContext,
      poolValuePayload: {
        ...target,
        poolKind: first.poolKind,
      },
      evidenceSummary: {
        evidencePoolIds: pools.map((pool) => pool.persistedPoolId ?? pool.poolSignature),
        supportingEventIds: eventIds,
        eventCount,
        projectCount,
        supplierCount,
      },
      contradictionSummary: {
        contradictionCount,
      },
      supportCount,
      contradictionCount,
      ignoredCount: 0,
      eventCount,
      projectCount,
      supplierCount,
      averageConfidence: roundNumber(averageConfidence),
      firstSeenAt,
      lastSeenAt,
      sourceRevisionHash: hashPayload({
        semanticSignature,
        supportCount,
        contradictionCount,
        eventIds,
      }),
      sourceEventIds: eventIds,
    } satisfies ConstructionMemorySemanticPool;
  });
}

async function loadEligibleEvidencePools(organizationId: string, seedPoolIds: string[]) {
  if (seedPoolIds.length === 0) {
    return [] as ConstructionMemoryEvidencePool[];
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("construction_memory_evidence_pools" as never)
    .select("*")
    .eq("organization_id", organizationId as never)
    .in("id", seedPoolIds as never)
    .in("maturity_status", ["ready_for_synthesis", "reinforced", "durable"] as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  return rows.map((row) => ({
    persistedPoolId: toNullableString(row.id),
    organizationId: toNullableString(row.organization_id) ?? "",
    poolSignature: toNullableString(row.pool_signature) ?? "",
    scopeSignature: toNullableString(row.scope_signature) ?? "",
    targetSignature: toNullableString(row.target_signature) ?? "",
    semanticSeedSignature: toNullableString(row.semantic_seed_signature),
    poolKind: toNullableString(row.pool_kind) ?? "",
    scopeContext: isRecord(row.scope_context) ? row.scope_context as Record<string, Json | null> : {},
    targetContext: isRecord(row.target_context) ? row.target_context as Record<string, Json | null> : {},
    evidenceCount: toNullableNumber(row.evidence_count) ?? 0,
    eventCount: toNullableNumber(row.event_count) ?? 0,
    projectCount: toNullableNumber(row.project_count) ?? 0,
    supplierCount: toNullableNumber(row.supplier_count) ?? 0,
    supportCount: toNullableNumber(row.support_count) ?? 0,
    contradictionCount: toNullableNumber(row.contradiction_count) ?? 0,
    averageConfidence: toNullableNumber(row.average_confidence),
    firstSeenAt: toNullableString(row.first_seen_at) ?? new Date(0).toISOString(),
    lastSeenAt: toNullableString(row.last_seen_at) ?? new Date(0).toISOString(),
    supportingEventIds: Array.isArray(row.supporting_event_ids)
      ? row.supporting_event_ids.flatMap((entry) => typeof entry === "string" ? [entry] : [])
      : [],
    poolRevisionHash: toNullableString(row.pool_revision_hash) ?? "",
    maturityStatus: (toNullableString(row.maturity_status) ?? "emerging") as ConstructionMemoryEvidencePoolMaturityStatus,
    linkedEvents: [],
  }));
}

async function replaceSemanticPoolEvents(semanticPoolId: string, organizationId: string, eventIds: string[], runId: string) {
  const admin = createAdminSupabaseClient();
  const deleteResult = await admin
    .from("construction_memory_semantic_pool_events" as never)
    .delete()
    .eq("semantic_pool_id", semanticPoolId as never)
    .eq("organization_id", organizationId as never);

  if (deleteResult.error) {
    throw new Error(deleteResult.error.message);
  }

  if (eventIds.length === 0) {
    return 0;
  }

  const { error } = await admin
    .from("construction_memory_semantic_pool_events" as never)
    .insert(eventIds.map((eventId) => ({
      semantic_pool_id: semanticPoolId,
      organization_id: organizationId,
      source_event_id: eventId,
      evidence_role: "supporting",
      linked_by_run_id: runId,
    })) as never);

  if (error) {
    throw new Error(error.message);
  }

  return eventIds.length;
}

async function persistSemanticPools(params: {
  runId: string;
  pools: ConstructionMemorySemanticPool[];
}) {
  const admin = createAdminSupabaseClient();
  let persistedCount = 0;

  for (const pool of params.pools) {
    const { data, error } = await admin
      .from("construction_memory_semantic_pools" as never)
      .upsert({
        organization_id: pool.organizationId,
        semantic_signature: pool.semanticSignature,
        semantic_family: pool.semanticFamily,
        semantic_type: pool.semanticType,
        pool_status: pool.poolStatus,
        maturity_status: pool.maturityStatus,
        title: pool.title,
        summary: pool.summary,
        retrieval_guidance: pool.retrievalGuidance,
        scope_payload: pool.scopePayload,
        pool_value_payload: pool.poolValuePayload,
        evidence_summary: pool.evidenceSummary,
        contradiction_summary: pool.contradictionSummary,
        support_count: pool.supportCount,
        contradiction_count: pool.contradictionCount,
        ignored_count: pool.ignoredCount,
        event_count: pool.eventCount,
        project_count: pool.projectCount,
        supplier_count: pool.supplierCount,
        average_confidence: pool.averageConfidence,
        first_seen_at: pool.firstSeenAt,
        last_seen_at: pool.lastSeenAt,
        source_revision_hash: pool.sourceRevisionHash,
        last_grouped_at: new Date().toISOString(),
        created_by_run_id: params.runId,
        last_updated_by_run_id: params.runId,
      } as never, { onConflict: "organization_id,semantic_signature" })
      .select("id")
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    const semanticPoolId = Array.isArray(data) ? toNullableString((data[0] as Record<string, unknown>)?.id) : null;
    if (!semanticPoolId) {
      continue;
    }
    await replaceSemanticPoolEvents(semanticPoolId, pool.organizationId, pool.sourceEventIds, params.runId);
    persistedCount += 1;
  }

  return persistedCount;
}

async function enqueueConstructionSynthesisQueue(pools: ConstructionMemorySemanticPool[]) {
  if (pools.length === 0) {
    return 0;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("construction_memory_semantic_pools" as never)
    .select("id, organization_id, semantic_signature, source_revision_hash, maturity_status")
    .in("organization_id", Array.from(new Set(pools.map((pool) => pool.organizationId))) as never);

  if (error) {
    throw new Error(error.message);
  }

  const bySignature = new Map<string, { id: string; organizationId: string; sourceRevisionHash: string; maturityStatus: string }>();
  for (const row of Array.isArray(data) ? data as Array<Record<string, unknown>> : []) {
    const id = toNullableString(row.id);
    const organizationId = toNullableString(row.organization_id);
    const signature = toNullableString(row.semantic_signature);
    if (!id || !organizationId || !signature) {
      continue;
    }
    bySignature.set(`${organizationId}:${signature}`, {
      id,
      organizationId,
      sourceRevisionHash: toNullableString(row.source_revision_hash) ?? "",
      maturityStatus: toNullableString(row.maturity_status) ?? "emerging",
    });
  }

  const inserts = pools.flatMap((pool) => {
    const persisted = bySignature.get(`${pool.organizationId}:${pool.semanticSignature}`);
    if (!persisted || !["ready_for_synthesis", "reinforced", "durable"].includes(pool.maturityStatus)) {
      return [];
    }
    return [{
      organization_id: persisted.organizationId,
      semantic_pool_id: persisted.id,
      source_revision_hash: persisted.sourceRevisionHash,
      priority: pool.maturityStatus === "durable" ? 300 : pool.maturityStatus === "reinforced" ? 200 : 100,
    }];
  });

  if (inserts.length === 0) {
    return 0;
  }

  const { error: insertError } = await admin
    .from("construction_memory_synthesis_queue" as never)
    .upsert(inserts as never, { onConflict: "organization_id,semantic_pool_id,source_revision_hash" });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const queueKeys = inserts.map((row) => ({
    organization_id: row.organization_id,
    semantic_pool_id: row.semantic_pool_id,
    source_revision_hash: row.source_revision_hash,
  }));

  let reactivatedCount = 0;
  for (const key of queueKeys) {
    const { data: existingRows, error: existingError } = await admin
      .from("construction_memory_synthesis_queue" as never)
      .select("id, queue_state")
      .eq("organization_id", key.organization_id as never)
      .eq("semantic_pool_id", key.semantic_pool_id as never)
      .eq("source_revision_hash", key.source_revision_hash as never)
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
      .from("construction_memory_synthesis_queue" as never)
      .update({
        queue_state: "pending",
        retry_after: null,
        claim_expires_at: null,
        claim_token: null,
        claimed_at: null,
        claimed_by: null,
        last_error_code: "requeued_for_current_revision",
        last_error_message: "Construction semantic pool was re-enqueued for synthesis for the current revision.",
      } as never)
      .eq("id", toNullableString(existingRow?.id) as never);

    if (reactivateError) {
      throw new Error(reactivateError.message);
    }
    reactivatedCount += 1;
  }

  return reactivatedCount;
}

function isQueueRowCurrentlyClaimable(
  row: Pick<SemanticQueueRow, "queueState" | "availableAt" | "retryAfter" | "claimExpiresAt">,
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

async function claimSemanticQueue(params: {
  limit: number;
  organizationId?: string | null;
  workerId: string;
  leaseSeconds: number;
}) {
  const admin = createAdminSupabaseClient();
  let query = admin
    .from("construction_memory_semantic_pool_queue" as never)
    .select("id, organization_id, seed_pool_id, seed_pool_revision_hash, queue_state, attempt_count, max_attempts, available_at, retry_after, claim_expires_at")
    .in("queue_state", ["pending", "retry_scheduled", "claimed"] as never)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, params.limit) * 4);

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
    const seedPoolId = toNullableString((row as Record<string, unknown>).seed_pool_id);
    const seedPoolRevisionHash = toNullableString((row as Record<string, unknown>).seed_pool_revision_hash);
    if (!id || !organizationId || !seedPoolId || !seedPoolRevisionHash) {
      return [];
    }
    const candidate = {
      id,
      organizationId,
      seedPoolId,
      seedPoolRevisionHash,
      queueState: toNullableString((row as Record<string, unknown>).queue_state) ?? "pending",
      attemptCount: toNullableNumber((row as Record<string, unknown>).attempt_count) ?? 0,
      maxAttempts: toNullableNumber((row as Record<string, unknown>).max_attempts) ?? 5,
      claimToken: randomUUID(),
      availableAt: toNullableString((row as Record<string, unknown>).available_at),
      retryAfter: toNullableString((row as Record<string, unknown>).retry_after),
      claimExpiresAt: toNullableString((row as Record<string, unknown>).claim_expires_at),
    } satisfies SemanticQueueRow;
    return isQueueRowCurrentlyClaimable(candidate) ? [candidate] : [];
  }).slice(0, Math.max(1, params.limit));

  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + Math.max(params.leaseSeconds, 30) * 1000).toISOString();
  for (const row of rows) {
    const { error: updateError } = await admin
      .from("construction_memory_semantic_pool_queue" as never)
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

async function finalizeSemanticQueue(inputs: Array<{
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
      .from("construction_memory_semantic_pool_queue" as never)
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

export async function runConstructionMemorySemanticPoolWorker(
  input: RunConstructionMemorySemanticPoolWorkerInput = {},
): Promise<RunConstructionMemorySemanticPoolWorkerOutput> {
  await requirePlatformAdmin("admin");

  const startedAt = Date.now();
  const runId = randomUUID();
  const admin = createAdminSupabaseClient();
  await admin.from("construction_memory_semantic_pool_runs" as never).insert({
    id: runId,
    requested_organization_id: input.organizationId ?? null,
  } as never);

  const claimedRows = await claimSemanticQueue({
    limit: input.limit ?? 25,
    organizationId: input.organizationId ?? null,
    workerId: input.workerId ?? "construction-memory-semantic-pool-runner",
    leaseSeconds: input.leaseSeconds ?? 10 * 60,
  });

  const finalizeInputs: Array<{
    id: string;
    claimToken: string;
    queueState: "completed" | "retry_scheduled" | "dead_lettered";
    errorCode?: string | null;
    errorMessage?: string | null;
  }> = [];
  let semanticPoolCount = 0;
  let candidateEventCount = 0;
  let synthesisQueueInsertCount = 0;

  const byOrganization = new Map<string, string[]>();
  for (const row of claimedRows) {
    const current = byOrganization.get(row.organizationId) ?? [];
    current.push(row.seedPoolId);
    byOrganization.set(row.organizationId, current);
  }

  for (const [organizationId, seedPoolIds] of byOrganization.entries()) {
    try {
      const evidencePools = await loadEligibleEvidencePools(organizationId, seedPoolIds);
      const eligibleSeedIds = new Set(evidencePools.flatMap((pool) => pool.persistedPoolId ? [pool.persistedPoolId] : []));
      const semanticPools = buildConstructionMemorySemanticPools(evidencePools);
      semanticPoolCount += semanticPools.length;
      candidateEventCount += semanticPools.reduce((sum, pool) => sum + pool.eventCount, 0);
      await persistSemanticPools({ runId, pools: semanticPools });
      synthesisQueueInsertCount += await enqueueConstructionSynthesisQueue(semanticPools);

      for (const row of claimedRows.filter((entry) => entry.organizationId === organizationId)) {
        if (!row.claimToken) {
          continue;
        }
        if (!eligibleSeedIds.has(row.seedPoolId)) {
          finalizeInputs.push({
            id: row.id,
            claimToken: row.claimToken,
            queueState: "completed",
            errorCode: "skipped_ineligible_seed_pool",
            errorMessage: "Construction evidence pool was not eligible for semantic grouping for the current revision.",
          });
          continue;
        }
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: "completed",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to build construction semantic pools.";
      for (const row of claimedRows.filter((entry) => entry.organizationId === organizationId)) {
        if (!row.claimToken) {
          continue;
        }
        finalizeInputs.push({
          id: row.id,
          claimToken: row.claimToken,
          queueState: row.attemptCount + 1 >= row.maxAttempts ? "dead_lettered" : "retry_scheduled",
          errorCode: "construction_stage7_failed",
          errorMessage: message,
        });
      }
    }
  }

  const finalized = await finalizeSemanticQueue(finalizeInputs);
  await admin
    .from("construction_memory_semantic_pool_runs" as never)
    .update({
      claimed_job_count: claimedRows.length,
      completed_job_count: finalized.completedCount,
      retried_job_count: finalized.retriedCount,
      dead_lettered_job_count: finalized.deadLetteredCount,
      semantic_pool_count: semanticPoolCount,
      candidate_event_count: candidateEventCount,
      duration_ms: Date.now() - startedAt,
    } as never)
    .eq("id", runId as never);

  return {
    runId,
    claimedJobCount: claimedRows.length,
    completedJobCount: finalized.completedCount,
    retriedJobCount: finalized.retriedCount,
    deadLetteredJobCount: finalized.deadLetteredCount,
    semanticPoolCount,
    candidateEventCount,
    synthesisQueueInsertCount,
    durationMs: Date.now() - startedAt,
  };
}
