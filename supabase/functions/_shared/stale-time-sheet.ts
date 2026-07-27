import { createClient } from "npm:@supabase/supabase-js@2";

const AUTO_CLOCK_OUT_LIMIT_HOURS = 10;
const AUTO_CLOCK_OUT_LIMIT_MS = AUTO_CLOCK_OUT_LIMIT_HOURS * 60 * 60 * 1000;
const AUTO_CLOCK_OUT_NOTE = "Auto clock-out applied at 10 hour limit.";

export const FULL_TIME_SHEET_ENTRY_SELECT =
  "id, organization_id, project_id, worker_member_id, worker_user_id, worker_name, purchase_order_id, purchase_order_number, purchase_order_title, client_entry_id, source, created_from_device_id, synced_at, clock_in_at, clock_out_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters, clock_out_latitude, clock_out_longitude, clock_out_accuracy_meters, total_hours, auto_clocked_out, auto_clocked_out_at, warning_8h5_at, notes, created_at, updated_at";

type SupabaseClient = ReturnType<typeof createClient>;

type TimeSheetEntryLike = {
  id: string;
  organization_id: string;
  project_id: string;
  worker_user_id: string;
  worker_name: string;
  purchase_order_number: string;
  clock_in_at: string;
  clock_out_at: string | null;
  notes: string | null;
};

function appendAutoClockOutNote(notes: string | null | undefined) {
  const existing = typeof notes === "string" ? notes.trim() : "";
  if (existing.includes(AUTO_CLOCK_OUT_NOTE)) {
    return existing;
  }

  return existing.length > 0 ? `${existing}\n${AUTO_CLOCK_OUT_NOTE}` : AUTO_CLOCK_OUT_NOTE;
}

export function isPastAutoClockOutLimit(clockInAt: string, now = new Date()) {
  const startedAt = new Date(clockInAt);
  if (Number.isNaN(startedAt.getTime())) {
    return false;
  }

  return now.getTime() - startedAt.getTime() >= AUTO_CLOCK_OUT_LIMIT_MS;
}

function computeTotalHours(clockInAt: string, clockOutAt: string) {
  const startAt = new Date(clockInAt);
  const endAt = new Date(clockOutAt);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return null;
  }

  const elapsedHours = Math.max(0, (endAt.getTime() - startAt.getTime()) / 3_600_000);
  return Math.round(elapsedHours * 100) / 100;
}

function computeAutoClockOutAt(clockInAt: string) {
  const startedAt = new Date(clockInAt);
  if (Number.isNaN(startedAt.getTime())) {
    return null;
  }

  return new Date(startedAt.getTime() + AUTO_CLOCK_OUT_LIMIT_MS).toISOString();
}

async function insertAutoClockOutEvent(
  client: SupabaseClient,
  entry: TimeSheetEntryLike,
  actorUserId: string
) {
  const { error } = await client.from("project_time_sheet_events").insert({
    organization_id: entry.organization_id,
    project_id: entry.project_id,
    entry_id: entry.id,
    actor_user_id: actorUserId,
    worker_name: entry.worker_name,
    event_type: "auto_clock_out",
    message: `Auto clock-out applied - ${entry.worker_name} reached 10 hours`,
  });

  if (error) {
    throw new Error(`Failed to create auto clock-out event: ${error.message}`);
  }
}

export async function autoCloseStaleTimeSheetEntry<T extends TimeSheetEntryLike>(
  client: SupabaseClient,
  entry: T,
  actorUserId: string
): Promise<{ entry: T; didAutoClose: boolean }> {
  if (entry.clock_out_at || !isPastAutoClockOutLimit(entry.clock_in_at)) {
    return { entry, didAutoClose: false };
  }

  const clockOutAt = computeAutoClockOutAt(entry.clock_in_at);
  const totalHours = clockOutAt ? computeTotalHours(entry.clock_in_at, clockOutAt) : null;
  if (!clockOutAt || totalHours === null) {
    throw new Error("Failed to compute auto clock-out values from clock_in_at.");
  }

  const { data: updatedEntry, error: updatedEntryError } = await client
    .from("project_time_sheet_entries")
    .update({
      clock_out_at: clockOutAt,
      total_hours: totalHours,
      synced_at: clockOutAt,
      auto_clocked_out: true,
      auto_clocked_out_at: clockOutAt,
      notes: appendAutoClockOutNote(entry.notes),
    })
    .eq("id", entry.id)
    .eq("organization_id", entry.organization_id)
    .eq("worker_user_id", entry.worker_user_id)
    .is("clock_out_at", null)
    .select(FULL_TIME_SHEET_ENTRY_SELECT)
    .maybeSingle();

  if (updatedEntryError) {
    throw new Error(`Failed to auto-close stale time sheet entry: ${updatedEntryError.message}`);
  }

  if (!updatedEntry) {
    const { data: replayEntries, error: replayEntriesError } = await client
      .from("project_time_sheet_entries")
      .select(FULL_TIME_SHEET_ENTRY_SELECT)
      .eq("id", entry.id)
      .eq("organization_id", entry.organization_id)
      .eq("worker_user_id", entry.worker_user_id)
      .limit(1);

    if (replayEntriesError) {
      throw new Error(`Failed to reload stale time sheet entry: ${replayEntriesError.message}`);
    }

    const replayEntry = ((replayEntries ?? []) as T[])[0] ?? null;
    if (!replayEntry) {
      throw new Error("Time sheet entry not found after stale auto-close attempt.");
    }

    return { entry: replayEntry, didAutoClose: false };
  }

  await insertAutoClockOutEvent(client, updatedEntry as T, actorUserId);
  return { entry: updatedEntry as T, didAutoClose: true };
}

export async function autoCloseStaleTimeSheetEntries<T extends TimeSheetEntryLike>(
  client: SupabaseClient,
  entries: T[],
  actorUserId: string
) {
  const healedEntries: T[] = [];

  for (const entry of entries) {
    const result = await autoCloseStaleTimeSheetEntry(client, entry, actorUserId);
    healedEntries.push(result.entry);
  }

  return healedEntries;
}
