import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const RETENTION_CAPABILITY_KEY = "retention_management" as const;

export type ProjectRetentionWorkflowMode =
  | "legacy"
  | "observe"
  | "ready"
  | "cutover"
  | "blocked";

export type OrganizationRetentionCapability = {
  organizationId: string;
  capabilityKey: typeof RETENTION_CAPABILITY_KEY;
  enabled: boolean;
  enabledBy: string | null;
  enabledAt: string | null;
  disabledBy: string | null;
  disabledAt: string | null;
  createdAt: string | null;
  updatedAt: string;
};

export type ProjectRetentionWorkflowState = {
  organizationId: string;
  projectId: string;
  mode: ProjectRetentionWorkflowMode;
  changedBy: string | null;
  changedAt: string | null;
  createdAt: string | null;
  updatedAt: string;
};

export type RetentionCapabilityEvent = {
  id: string;
  organizationId: string;
  projectId: string | null;
  eventType:
    | "organization_capability_enabled"
    | "organization_capability_disabled"
    | "project_mode_changed"
    | "project_mode_transition_rejected"
    | "management_permission_denied";
  previousState: string | null;
  newState: string | null;
  actorUserId: string | null;
  reason: string;
  correlationId: string | null;
  metadata: Json;
  occurredAt: string;
};

export type RetentionCapabilityMutationResult = {
  succeeded: boolean;
  errorCode: string | null;
  changed: boolean;
  capability: OrganizationRetentionCapability | null;
};

export type ProjectRetentionTransitionResult = {
  succeeded: boolean;
  errorCode: string | null;
  changed: boolean;
  previousMode: ProjectRetentionWorkflowMode | null;
  state: ProjectRetentionWorkflowState | null;
};

function normalizeCapability(
  row: {
    organization_id: string;
    capability_key: string;
    enabled: boolean;
    enabled_by: string | null;
    enabled_at: string | null;
    disabled_by: string | null;
    disabled_at: string | null;
    created_at?: string;
    updated_at: string;
  },
): OrganizationRetentionCapability {
  return {
    organizationId: row.organization_id,
    capabilityKey: RETENTION_CAPABILITY_KEY,
    enabled: row.enabled,
    enabledBy: row.enabled_by,
    enabledAt: row.enabled_at,
    disabledBy: row.disabled_by,
    disabledAt: row.disabled_at,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at,
  };
}

export async function getOrganizationRetentionCapability() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_organization_retention_capability");

  if (error) {
    throw new Error(`Unable to read Retention capability: ${error.message}`);
  }

  const row = data?.[0];
  return row ? normalizeCapability(row) : null;
}

export async function setOrganizationRetentionCapability(input: {
  enabled: boolean;
  reason: string;
  correlationId?: string | null;
}): Promise<RetentionCapabilityMutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_organization_retention_capability", {
    p_enabled: input.enabled,
    p_reason: input.reason,
    p_correlation_id: input.correlationId ?? undefined,
  });

  if (error) {
    throw new Error(`Unable to manage Retention capability: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    throw new Error("Retention capability mutation returned no result.");
  }

  return {
    succeeded: row.succeeded,
    errorCode: row.error_code,
    changed: row.changed,
    capability: row.organization_id
      ? normalizeCapability(row)
      : null,
  };
}

export async function getProjectRetentionWorkflowState(
  projectId: string,
): Promise<ProjectRetentionWorkflowState | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_project_retention_workflow_state", {
    p_project_id: projectId,
  });

  if (error) {
    throw new Error(`Unable to read project Retention workflow state: ${error.message}`);
  }

  const row = data?.[0];
  return row
    ? {
        organizationId: row.organization_id,
        projectId: row.project_id,
        mode: row.mode as ProjectRetentionWorkflowMode,
        changedBy: row.changed_by,
        changedAt: row.changed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

export async function transitionProjectRetentionWorkflowMode(input: {
  projectId: string;
  newMode: ProjectRetentionWorkflowMode;
  reason: string;
  correlationId?: string | null;
}): Promise<ProjectRetentionTransitionResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("transition_project_retention_workflow_mode", {
    p_project_id: input.projectId,
    p_new_mode: input.newMode,
    p_reason: input.reason,
    p_correlation_id: input.correlationId ?? undefined,
  });

  if (error) {
    throw new Error(`Unable to transition project Retention workflow state: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    throw new Error("Project Retention workflow transition returned no result.");
  }

  return {
    succeeded: row.succeeded,
    errorCode: row.error_code,
    changed: row.changed,
    previousMode: row.previous_mode as ProjectRetentionWorkflowMode | null,
    state: row.organization_id && row.project_id && row.mode
      ? {
          organizationId: row.organization_id,
          projectId: row.project_id,
          mode: row.mode as ProjectRetentionWorkflowMode,
          changedBy: row.changed_by,
          changedAt: row.changed_at,
          createdAt: null,
          updatedAt: row.updated_at,
        }
      : null,
  };
}

export async function getRetentionCapabilityEvents(input: {
  projectId?: string | null;
  limit?: number;
} = {}): Promise<RetentionCapabilityEvent[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_retention_capability_events", {
    p_project_id: input.projectId ?? undefined,
    p_limit: input.limit,
  });

  if (error) {
    throw new Error(`Unable to read Retention capability events: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    eventType: row.event_type as RetentionCapabilityEvent["eventType"],
    previousState: row.previous_state,
    newState: row.new_state,
    actorUserId: row.actor_user_id,
    reason: row.reason,
    correlationId: row.correlation_id,
    metadata: row.metadata,
    occurredAt: row.occurred_at,
  }));
}
