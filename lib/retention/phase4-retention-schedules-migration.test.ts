import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260723140000_add_retention_release_schedules_and_reminders.sql"),
  "utf8",
);

describe("Phase 4 retention schedule migration", () => {
  it("creates the isolated schedule, origin, reminder, and event entities", () => {
    for (const table of [
      "project_retention_release_schedules",
      "project_retention_schedule_origins",
      "retention_schedule_events",
      "retention_reminders",
      "retention_reminder_events",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
  });

  it("contains every trigger, method, lifecycle, and reminder state", () => {
    for (const value of [
      "practical_completion", "defects_liability_expiry", "fixed_date",
      "manual_milestone", "custom", "percentage", "fixed_amount",
      "draft", "scheduled", "awaiting_confirmation", "activated", "completed",
      "cancelled", "pre_eligibility", "eligibility_due", "overdue_unclaimed",
      "escalation", "scheduled", "due", "queued", "sent", "snoozed", "failed",
    ]) expect(migration).toContain(`'${value}'`);
  });

  it("uses cents, largest remainder, business timezone, deterministic locks, and skip locked", () => {
    expect(migration).toContain("largest-remainder");
    expect(migration).toContain("round(v_s.fixed_amount*100)");
    expect(migration).toContain("at time zone v_tz");
    expect(migration).toContain("for update of p");
    expect(migration).toContain("for update skip locked");
  });

  it("adds eligibility without writing or recalculating Payment Claims", () => {
    expect(migration).not.toMatch(/update public\.project_claims/i);
    expect(migration).not.toMatch(/insert into public\.project_claims/i);
    expect(migration).not.toContain("recalculate_project_claim");
    expect(migration).toContain("submit_retention_claim_phase3_pre_schedule");
    expect(migration).toContain("allocation_exceeds_eligibility");
    expect(migration).toContain("retention_not_eligible");
  });

  it("keeps events append-only and browser mutations revoked", () => {
    expect(migration).toContain("Retention schedule events are append-only.");
    expect(migration).toContain("Retention reminder events are append-only.");
    expect(migration).toContain(
      "revoke all on public.project_retention_release_schedules from public,anon,authenticated",
    );
    expect(migration).toContain(
      "revoke all on function public.select_due_retention_reminders(integer,text)",
    );
  });
});
