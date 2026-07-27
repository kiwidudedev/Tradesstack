import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "lib/retention/phase4-retention-schedules.ts"),
  "utf8",
);
const phase3 = fs.readFileSync(
  path.join(process.cwd(), "lib/retention/phase3-retention-claims.ts"),
  "utf8",
);
const generatedTypes = fs.readFileSync(
  path.join(process.cwd(), "lib/supabase/types.ts"),
  "utf8",
);

describe("Phase 4 server contract", () => {
  it("is server-only and exposes all approved schedule operations", () => {
    expect(source).toContain('import "server-only"');
    for (const operation of [
      "createRetentionReleaseSchedule", "getRetentionReleaseSchedule",
      "listRetentionReleaseSchedules", "updateRetentionReleaseScheduleDraft",
      "addScheduleOrigin", "removeScheduleOrigin", "reorderScheduleOrigins",
      "confirmScheduleTrigger", "activateRetentionReleaseSchedule",
      "cancelRetentionReleaseSchedule", "completeRetentionReleaseSchedule",
      "getRetentionScheduleEvents", "getProjectRetentionEligibility",
    ]) expect(source).toContain(`export const ${operation}`);
  });

  it("exposes reminder management and a service-role dispatcher boundary", () => {
    for (const operation of [
      "createRetentionReminder", "listRetentionReminders", "updateRetentionReminder",
      "snoozeRetentionReminder", "completeRetentionReminder", "cancelRetentionReminder",
      "getRetentionReminderEvents", "selectDueRetentionReminders",
      "recordReminderDeliveryResult",
    ]) expect(source).toContain(`export const ${operation}`);
    expect(source).toContain("createAdminSupabaseClient");
  });

  it("changes Phase 3 only by adding the optional eligibility hash argument", () => {
    expect(phase3).toContain("expectedEligibilityStateHash?: string");
    expect(phase3).toContain("p_expected_eligibility_state_hash");
  });

  it("includes generated table, snapshot-column, and RPC declarations", () => {
    for (const name of [
      "project_retention_release_schedules", "project_retention_schedule_origins",
      "retention_schedule_events", "retention_reminders", "retention_reminder_events",
      "get_project_retention_eligibility", "activate_retention_release_schedule",
      "select_due_retention_reminders", "record_retention_reminder_delivery_result",
    ]) expect(generatedTypes).toContain(`${name}:`);
    expect(generatedTypes).toContain("last_eligibility_state_hash: string | null");
    expect(generatedTypes).toContain("eligibility_schedule_ids_snapshot: string[] | null");
    expect(generatedTypes).toContain("p_expected_eligibility_state_hash?: string");
  });
});
