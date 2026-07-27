import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type RetentionScheduleStatus =
  | "draft"
  | "scheduled"
  | "awaiting_confirmation"
  | "activated"
  | "completed"
  | "cancelled";

export type RetentionScheduleTriggerType =
  | "practical_completion"
  | "defects_liability_expiry"
  | "fixed_date"
  | "manual_milestone"
  | "custom";

export type RetentionEntitlementMethod = "percentage" | "fixed_amount";
export type RetentionReminderState =
  | "scheduled" | "due" | "queued" | "sent" | "snoozed"
  | "completed" | "cancelled" | "failed";

export type RetentionPhase4ErrorCode =
  | "capability_disabled" | "project_mode_not_supported" | "permission_denied"
  | "schedule_not_found" | "schedule_not_draft" | "schedule_not_activatable"
  | "schedule_immutable" | "invalid_trigger" | "trigger_confirmation_required"
  | "invalid_entitlement_method" | "invalid_percentage" | "invalid_fixed_amount"
  | "invalid_cap" | "invalid_schedule_scope" | "duplicate_schedule_origin"
  | "origin_not_found" | "origin_cancelled" | "stale_schedule"
  | "stale_eligibility"
  | "stale_retention_position" | "schedule_overlap_invalid"
  | "retention_not_eligible" | "allocation_exceeds_eligibility"
  | "variance_blocking"
  | "reminder_not_found" | "reminder_immutable" | "invalid_reminder_state"
  | "invalid_reminder_time" | "invalid_assignment" | "delivery_not_confirmed"
  | "concurrent_update";

export type RetentionPhase4Result = {
  succeeded: boolean;
  errorCode: RetentionPhase4ErrorCode | null;
  [key: string]: Json | undefined;
};

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>;
};

function parseResult(data: Json | null, name: string): RetentionPhase4Result {
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throw new Error(`${name} returned an invalid Phase 4 payload.`);
  }
  return data as RetentionPhase4Result;
}

async function invoke(name: string, args: Record<string, unknown> = {}) {
  const client = await createServerSupabaseClient();
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args);
  if (error) throw new Error(`Unable to execute ${name}: ${error.message}`);
  return parseResult(data, name);
}

async function invokeDispatcher(name: string, args: Record<string, unknown> = {}) {
  const client = createAdminSupabaseClient();
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args);
  if (error) throw new Error(`Unable to execute ${name}: ${error.message}`);
  return parseResult(data, name);
}

export const createRetentionReleaseSchedule = (input: Record<string, Json | undefined>) =>
  invoke("create_retention_release_schedule", { p_input: input });

export const updateRetentionReleaseScheduleDraft = (input: Record<string, Json | undefined>) =>
  invoke("update_retention_release_schedule_draft", { p_input: input });

export const addScheduleOrigin = (input: Record<string, Json | undefined>) =>
  invoke("add_retention_schedule_origin", { p_input: input });

export const removeScheduleOrigin = (input: Record<string, Json | undefined>) =>
  invoke("remove_retention_schedule_origin", { p_input: input });

export const reorderScheduleOrigins = (input: Record<string, Json | undefined>) =>
  invoke("reorder_retention_schedule_origins", { p_input: input });

export const confirmScheduleTrigger = (input: Record<string, Json | undefined>) =>
  invoke("confirm_retention_schedule_trigger", { p_input: input });

export const activateRetentionReleaseSchedule = (input: Record<string, Json | undefined>) =>
  invoke("activate_retention_release_schedule", { p_input: input });

export const cancelRetentionReleaseSchedule = (input: Record<string, Json | undefined>) =>
  invoke("cancel_retention_release_schedule", { p_input: input });

export const completeRetentionReleaseSchedule = (input: Record<string, Json | undefined>) =>
  invoke("complete_retention_release_schedule", { p_input: input });

export const getRetentionReleaseSchedule = (scheduleId: string) =>
  invoke("get_retention_release_schedule", { p_schedule_id: scheduleId });

export const listRetentionReleaseSchedules = (input: {
  projectId: string; limit?: number; beforeSequence?: number;
}) => invoke("list_retention_release_schedules", {
  p_project_id: input.projectId,
  p_limit: input.limit,
  p_before_sequence: input.beforeSequence,
});

export const getRetentionScheduleEvents = (scheduleId: string, limit?: number) =>
  invoke("get_retention_schedule_events", { p_schedule_id: scheduleId, p_limit: limit });

export const getProjectRetentionEligibility = (projectId: string) =>
  invoke("get_project_retention_eligibility", { p_project_id: projectId });

export const refreshRetentionClaimEligibility = (
  retentionClaimId: string,
  expectedDraftRevision: number,
  correlationId?: string,
) => invoke("refresh_retention_claim_eligibility_state", {
  p_retention_claim_id: retentionClaimId,
  p_expected_draft_revision: expectedDraftRevision,
  p_correlation_id: correlationId,
});

export const createRetentionReminder = (input: Record<string, Json | undefined>) =>
  invoke("create_retention_reminder", { p_input: input });

export const updateRetentionReminder = (input: Record<string, Json | undefined>) =>
  invoke("update_retention_reminder", { p_input: input });

export const snoozeRetentionReminder = (input: Record<string, Json | undefined>) =>
  invoke("snooze_retention_reminder", { p_input: input });

export const completeRetentionReminder = (input: Record<string, Json | undefined>) =>
  invoke("complete_retention_reminder", { p_input: input });

export const cancelRetentionReminder = (input: Record<string, Json | undefined>) =>
  invoke("cancel_retention_reminder", { p_input: input });

export const listRetentionReminders = (input: {
  projectId: string; limit?: number; state?: RetentionReminderState;
}) => invoke("list_retention_reminders", {
  p_project_id: input.projectId,
  p_limit: input.limit,
  p_state: input.state,
});

export const getRetentionReminderEvents = (reminderId: string, limit?: number) =>
  invoke("get_retention_reminder_events", { p_reminder_id: reminderId, p_limit: limit });

export const selectDueRetentionReminders = (limit?: number, workerId?: string) =>
  invokeDispatcher("select_due_retention_reminders", {
    p_limit: limit,
    p_worker_id: workerId,
  });

export const recordReminderDeliveryResult = (input: Record<string, Json | undefined>) =>
  invokeDispatcher("record_retention_reminder_delivery_result", { p_input: input });
