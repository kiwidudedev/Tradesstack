import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type CandidateStatus = "active" | "contested" | "stale" | "retired";
type CandidateStrength = "weak" | "reinforced" | "durable";
type CandidateEvidenceRole = "supporting" | "contradictory" | "ignored";

export type WorksheetPricingPatternCandidateListItem = {
  id: string;
  organizationId: string;
  candidateStatus: CandidateStatus;
  patternFamily: string | null;
  patternType: string | null;
  currentStrength: CandidateStrength | null;
  confidence: number | null;
  supportCount: number;
  contradictionCount: number;
  ignoredCount: number;
  lastReinforcedAt: string | null;
  lastContradictedAt: string | null;
  updatedAt: string | null;
};

export type WorksheetPricingPatternCandidateDetail = WorksheetPricingPatternCandidateListItem & {
  title: string | null;
  summary: string | null;
  retrievalGuidance: string | null;
  scope: Record<string, Json | null>;
  patternValue: Record<string, Json | null>;
  supportDiversity: Record<string, Json | null>;
  contradictionDiversity: Record<string, Json | null> | null;
  staleAfter: string | null;
  createdByRunId: string | null;
  lastUpdatedByRunId: string | null;
  createdAt: string | null;
};

export type WorksheetPricingPatternCandidateEvidenceItem = {
  sourceEventId: string;
  evidenceRole: CandidateEvidenceRole;
  linkedByRunId: string | null;
  eventType: string | null;
  occurredAt: string | null;
  projectId: string | null;
  opportunityId: string | null;
  metadata: Record<string, Json | null>;
  diffData: Record<string, Json | null>;
  classification: {
    overallConfidence: number | null;
    reasoningSummary: string | null;
    semanticFields: Record<string, Json | null>;
    interpretationPayload: Record<string, Json | null>;
    classifiedAt: string | null;
  } | null;
};

export type WorksheetPricingPatternCandidateMetrics = {
  organizationId: string;
  candidateStatusCounts: Record<string, number>;
  familyDistribution: Record<string, number>;
  strengthDistribution: Record<string, number>;
  averageConfidence: number | null;
  averageSupportCount: number | null;
  highContradictionCount: number;
};

export type WorksheetPricingPatternCandidateDuplicateGroup = {
  organizationId: string;
  candidateSignature: string;
  count: number;
  candidateIds: string[];
};

export type ListWorksheetPricingPatternCandidatesInput = {
  organizationId: string;
  status?: string | null;
  family?: string | null;
  strength?: string | null;
  limit?: number;
};

function isJsonRecord(value: unknown): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : null;
}

function compactJsonValue(value: Json | undefined): Json | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 24).map((entry) => compactJsonValue(entry as Json | undefined)) as Json;
  }

  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).slice(0, 48).map(([key, entry]) => [key, compactJsonValue(entry)]),
    ) as Json;
  }

  return null;
}

function compactJsonRecord(value: unknown, maxKeys = 48) {
  if (!isJsonRecord(value)) {
    return {} as Record<string, Json | null>;
  }

  return Object.fromEntries(
    Object.entries(value).slice(0, maxKeys).map(([key, entry]) => [key, compactJsonValue(entry)]),
  ) as Record<string, Json | null>;
}

function mapCandidateRow(row: Record<string, unknown>): WorksheetPricingPatternCandidateListItem {
  return {
    id: toNullableString(row.id) ?? "",
    organizationId: toNullableString(row.organization_id) ?? "",
    candidateStatus: (toNullableString(row.candidate_status) as CandidateStatus) ?? "active",
    patternFamily: toNullableString(row.pattern_family),
    patternType: toNullableString(row.pattern_type),
    currentStrength: (toNullableString(row.current_strength) as CandidateStrength | null) ?? null,
    confidence: toNullableNumber(row.confidence),
    supportCount: toNullableNumber(row.support_count) ?? 0,
    contradictionCount: toNullableNumber(row.contradiction_count) ?? 0,
    ignoredCount: toNullableNumber(row.ignored_count) ?? 0,
    lastReinforcedAt: toNullableString(row.last_reinforced_at),
    lastContradictedAt: toNullableString(row.last_contradicted_at),
    updatedAt: toNullableString(row.updated_at),
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function listWorksheetPricingPatternCandidates(input: ListWorksheetPricingPatternCandidatesInput) {
  const admin = createAdminSupabaseClient();
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 100), 500));
  let query = admin
    .from("worksheet_pricing_pattern_shadow_candidates" as never)
    .select("*")
    .eq("organization_id", input.organizationId as never)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (input.status) {
    query = query.eq("candidate_status", input.status as never);
  }
  if (input.family) {
    query = query.eq("pattern_family", input.family as never);
  }
  if (input.strength) {
    query = query.eq("current_strength", input.strength as never);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const candidates = Array.isArray(data)
    ? data.map((row) => mapCandidateRow((row ?? {}) as Record<string, unknown>))
    : [];

  return {
    organizationId: input.organizationId,
    count: candidates.length,
    candidates,
  };
}

export async function getWorksheetPricingPatternCandidateDetail(candidateId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_pricing_pattern_shadow_candidates" as never)
    .select("*")
    .eq("id", candidateId as never)
    .eq("organization_id", organizationId as never)
    .single();

  if (error) {
    if ("code" in error && error.code === "PGRST116") {
      return null;
    }
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ...mapCandidateRow(row),
    title: toNullableString(row.title),
    summary: toNullableString(row.summary),
    retrievalGuidance: toNullableString(row.retrieval_guidance),
    scope: compactJsonRecord(row.scope),
    patternValue: compactJsonRecord(row.pattern_value),
    supportDiversity: compactJsonRecord(row.support_diversity),
    contradictionDiversity: row.contradiction_diversity === null ? null : compactJsonRecord(row.contradiction_diversity),
    staleAfter: toNullableString(row.stale_after),
    createdByRunId: toNullableString(row.created_by_run_id),
    lastUpdatedByRunId: toNullableString(row.last_updated_by_run_id),
    createdAt: toNullableString(row.created_at),
  } satisfies WorksheetPricingPatternCandidateDetail;
}

export async function getWorksheetPricingPatternCandidateEvidence(candidateId: string, organizationId: string) {
  const candidate = await getWorksheetPricingPatternCandidateDetail(candidateId, organizationId);
  if (!candidate) {
    return null;
  }

  const admin = createAdminSupabaseClient();
  const { data: links, error: linksError } = await admin
    .from("worksheet_pricing_pattern_shadow_candidate_evidence" as never)
    .select("*")
    .eq("candidate_id", candidateId as never);

  if (linksError) {
    throw new Error(linksError.message);
  }

  const evidenceLinks = Array.isArray(links)
    ? links.map((row) => ({
      sourceEventId: toNullableString((row as Record<string, unknown>).source_event_id) ?? "",
      evidenceRole: (toNullableString((row as Record<string, unknown>).evidence_role) as CandidateEvidenceRole) ?? "ignored",
      linkedByRunId: toNullableString((row as Record<string, unknown>).linked_by_run_id),
      createdAt: toNullableString((row as Record<string, unknown>).created_at),
    }))
    : [];

  if (evidenceLinks.length === 0) {
    return {
      candidateId,
      evidence: [] as WorksheetPricingPatternCandidateEvidenceItem[],
    };
  }

  const eventIds = evidenceLinks.map((link) => link.sourceEventId);
  const { data: events, error: eventsError } = await admin
    .from("intelligence_events" as never)
    .select("id, organization_id, event_type, occurred_at, project_id, opportunity_id, metadata, diff_data")
    .in("id", eventIds as never)
    .eq("organization_id", organizationId as never);

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const eventRows = Array.isArray(events) ? events as Array<Record<string, unknown>> : [];
  const eventMap = new Map(eventRows.map((row) => [toNullableString(row.id) ?? "", row]));

  const { data: classifications, error: classificationsError } = await admin
    .from("worksheet_event_classifications" as never)
    .select("source_event_id, organization_id, classification_status, classification_version, attempt_number, overall_confidence, reasoning_summary, semantic_fields, interpretation_payload, classified_at")
    .in("source_event_id", eventIds as never)
    .eq("organization_id", organizationId as never)
    .eq("classification_status", "classified" as never)
    .order("classified_at", { ascending: false });

  if (classificationsError) {
    throw new Error(classificationsError.message);
  }

  const latestClassificationByEventId = new Map<string, Record<string, unknown>>();
  if (Array.isArray(classifications)) {
    for (const row of classifications as Array<Record<string, unknown>>) {
      const sourceEventId = toNullableString(row.source_event_id);
      if (!sourceEventId || latestClassificationByEventId.has(sourceEventId)) {
        continue;
      }
      latestClassificationByEventId.set(sourceEventId, row);
    }
  }

  const evidence = evidenceLinks
    .filter((link) => eventMap.has(link.sourceEventId))
    .map((link) => {
      const event = eventMap.get(link.sourceEventId) ?? {};
      const classification = latestClassificationByEventId.get(link.sourceEventId) ?? null;
      return {
        sourceEventId: link.sourceEventId,
        evidenceRole: link.evidenceRole,
        linkedByRunId: link.linkedByRunId,
        eventType: toNullableString(event.event_type),
        occurredAt: toNullableString(event.occurred_at),
        projectId: toNullableString(event.project_id),
        opportunityId: toNullableString(event.opportunity_id),
        metadata: compactJsonRecord(event.metadata),
        diffData: compactJsonRecord(event.diff_data),
        classification: classification
          ? {
            overallConfidence: toNullableNumber(classification.overall_confidence),
            reasoningSummary: toNullableString(classification.reasoning_summary),
            semanticFields: compactJsonRecord(classification.semantic_fields),
            interpretationPayload: compactJsonRecord(classification.interpretation_payload),
            classifiedAt: toNullableString(classification.classified_at),
          }
          : null,
      } satisfies WorksheetPricingPatternCandidateEvidenceItem;
    });

  return {
    candidateId,
    evidence,
  };
}

export async function getWorksheetPricingPatternCandidateMetrics(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_pricing_pattern_shadow_candidates" as never)
    .select("*")
    .eq("organization_id", organizationId as never);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data)
    ? data.map((row) => mapCandidateRow((row ?? {}) as Record<string, unknown>))
    : [];

  const candidateStatusCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.candidateStatus] = (acc[row.candidateStatus] ?? 0) + 1;
    return acc;
  }, { active: 0, contested: 0, stale: 0, retired: 0 });

  const familyDistribution = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.patternFamily ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const strengthDistribution = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.currentStrength ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    organizationId,
    candidateStatusCounts,
    familyDistribution,
    strengthDistribution,
    averageConfidence: average(rows.map((row) => row.confidence).filter((value): value is number => value !== null)),
    averageSupportCount: average(rows.map((row) => row.supportCount)),
    highContradictionCount: rows.filter((row) => row.contradictionCount > 0).length,
  } satisfies WorksheetPricingPatternCandidateMetrics;
}

export async function listWorksheetPricingPatternCandidateDuplicateGroups(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("worksheet_pricing_pattern_shadow_candidates" as never)
    .select("id, organization_id, candidate_signature, candidate_status")
    .eq("organization_id", organizationId as never)
    .neq("candidate_status", "retired" as never);

  if (error) {
    throw new Error(error.message);
  }

  const groups = new Map<string, WorksheetPricingPatternCandidateDuplicateGroup>();
  for (const row of (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>) {
    const candidateSignature = toNullableString(row.candidate_signature);
    const candidateId = toNullableString(row.id);
    const orgId = toNullableString(row.organization_id) ?? organizationId;
    if (!candidateSignature || !candidateId) {
      continue;
    }

    const existing = groups.get(candidateSignature) ?? {
      organizationId: orgId,
      candidateSignature,
      count: 0,
      candidateIds: [],
    };
    existing.count += 1;
    existing.candidateIds.push(candidateId);
    groups.set(candidateSignature, existing);
  }

  return Array.from(groups.values())
    .filter((group) => group.count > 1)
    .sort((left, right) => right.count - left.count || left.candidateSignature.localeCompare(right.candidateSignature));
}
