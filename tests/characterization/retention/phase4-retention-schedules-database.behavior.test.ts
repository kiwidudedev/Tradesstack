import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.RETENTION_PHASE4_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER = "f4000000-0000-4000-8000-000000000001";
const ORG = "f4000000-0000-4000-8000-000000000010";
const PROJECT = "f4000000-0000-4000-8000-000000000100";
const NO_SCHEDULE_PROJECT = "f4000000-0000-4000-8000-000000000101";
const SCALE_PROJECT = "f4000000-0000-4000-8000-000000000102";
const ORIGIN_A = "f4000000-0000-4000-8000-000000001001";
const ORIGIN_B = "f4000000-0000-4000-8000-000000001002";
const ORIGIN_NONE = "f4000000-0000-4000-8000-000000001003";

type Result = {
  succeeded: boolean;
  errorCode: string | null;
  schedule?: Record<string, unknown>;
  origin?: Record<string, unknown>;
  origins?: Array<Record<string, unknown>>;
  eligibility?: { eligibilityStateHash: string; positionStateHash: string; origins: Array<Record<string, unknown>> };
  claim?: { id: string; draftRevision: number; lastPositionStateHash: string };
  allocationId?: string;
  eligibilityStateHash?: string;
  positionStateHash?: string;
  reminders?: Array<Record<string, unknown>>;
  reminder?: Record<string, unknown>;
  recurrence?: Record<string, unknown> | null;
  claimToken?: string;
  valid?: boolean;
};

describeDatabase("Phase 4 retention schedule database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  let percentageSchedule = "";
  let fixedSchedule = "";

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      `insert into auth.users
       (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'phase4@example.test','',now(),'{}','{}')`, [USER],
    );
    await client.query("delete from public.organizations where created_by=$1", [USER]);
    await client.query(
      `insert into public.organizations(id,name,created_by,timezone)
       values($1,'Phase 4',$2,'Pacific/Auckland')`, [ORG, USER],
    );
    await client.query(
      `insert into public.organization_members(organization_id,user_id,role,display_name)
       values($1,$2,'owner','Phase 4 Owner')`, [ORG, USER],
    );
    await client.query(
      `insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code)
       values($1,$3,$4,'Phase 4','phase-4','P4'),
             ($2,$3,$4,'No Schedule','phase-4-none','P4N'),
             ($5,$3,$4,'Scale Schedule','phase-4-scale','P4S')`,
      [PROJECT, NO_SCHEDULE_PROJECT, ORG, USER, SCALE_PROJECT],
    );
    await client.query(
      `update public.organization_capabilities set enabled=true,enabled_by=$2,enabled_at=now()
       where organization_id=$1 and capability_key='retention_management'`, [ORG, USER],
    );
    await client.query(
      `update public.project_retention_workflow_states set mode='observe',changed_by=$2,changed_at=now()
       where organization_id=$1 and project_id=any($3::uuid[])`,
      [ORG, USER, [PROJECT, NO_SCHEDULE_PROJECT, SCALE_PROJECT]],
    );
    await client.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,claim_type,status,
        claim_date,due_date,claim_amount,retention_method,retention_percent,
        retention_withheld_amount,retention_released_amount,retention_held_to_date,
        retention_released_to_date,retention_balance,net_claim_excl_gst,gst_amount,total_payable
       ) values
       ($1,$4,$5,$6,'P4-CL-01','A','Progress','Submitted','2026-01-01','2026-02-01',
        1000,'flat',10,100,0,100,0,100,900,135,1035),
       ($2,$4,$5,$6,'P4-CL-02','B','Progress','Paid','2026-02-01','2026-03-01',
        600,'flat',10,60,0,160,0,160,540,81,621),
       ($3,$4,$7,$6,'P4N-CL-01','None','Progress','Submitted','2026-01-01','2026-02-01',
        1000,'flat',10,100,0,100,0,100,900,135,1035)`,
      [ORIGIN_A, ORIGIN_B, ORIGIN_NONE, ORG, PROJECT, USER, NO_SCHEDULE_PROJECT],
    );
    await asUser();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function asUser() {
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [USER]);
    await client.query("select set_config('request.jwt.claim.role','authenticated',true)");
    await client.query("select set_config('request.jwt.claim.retention_phase3_internal','true',true)");
    await client.query("select set_config('request.jwt.claim.retention_phase4_internal','true',true)");
  }

  async function rpc(sql: string, values: unknown[] = []) {
    const response = await client.query<{ result: Result }>(sql, values);
    return response.rows[0].result;
  }

  async function expectDbError(action: () => Promise<unknown>, message?: string) {
    await client.query("savepoint phase4_expected_error");
    let caught: unknown;
    try { await action(); } catch (error) { caught = error; }
    await client.query("rollback to savepoint phase4_expected_error");
    await client.query("release savepoint phase4_expected_error");
    expect(caught).toBeInstanceOf(Error);
    if (message) expect((caught as Error).message).toContain(message);
  }

  async function createSchedule(input: Record<string, unknown>) {
    return rpc("select public.create_retention_release_schedule($1::jsonb) result", [
      JSON.stringify({ projectId: PROJECT, ...input }),
    ]);
  }

  async function addOrigin(scheduleId: string, revision: number, originId: string, extra = {}) {
    return rpc("select public.add_retention_schedule_origin($1::jsonb) result", [
      JSON.stringify({ scheduleId, expectedRevision: revision, originatingPaymentClaimId: originId, ...extra }),
    ]);
  }

  async function scheduleIt(scheduleId: string, revision: number) {
    return rpc("select public.update_retention_release_schedule_draft($1::jsonb) result", [
      JSON.stringify({ scheduleId, expectedRevision: revision, status: "scheduled" }),
    ]);
  }

  async function activate(scheduleId: string, revision: number) {
    return rpc("select public.activate_retention_release_schedule($1::jsonb) result", [
      JSON.stringify({ scheduleId, expectedRevision: revision }),
    ]);
  }

  it("activates a percentage schedule and freezes explicit scope", async () => {
    let result = await createSchedule({
      name: "First 50%", triggerType: "fixed_date", entitlementMethod: "percentage",
      percentageBps: 5000, scheduledTriggerDate: "2026-01-01",
      confirmationRequired: false, scopePolicy: "explicit",
    });
    expect(result.succeeded).toBe(true);
    percentageSchedule = String(result.schedule?.id);
    result = await addOrigin(percentageSchedule, Number(result.schedule?.revision), ORIGIN_A);
    result = await addOrigin(percentageSchedule, Number(result.schedule?.revision), ORIGIN_B);
    result = await scheduleIt(percentageSchedule, Number(result.schedule?.revision));
    result = await activate(percentageSchedule, Number(result.schedule?.revision));
    expect(result.succeeded).toBe(true);
    expect(result.schedule?.status).toBe("activated");
    expect(result.origins?.map((x) => Number(x.activated_entitlement_amount))).toEqual([50, 30]);
    const before = await client.query("select * from public.project_claims where id=any($1::uuid[]) order by id", [[ORIGIN_A, ORIGIN_B]]);
    expect(before.rows.map((x) => Number(x.retention_withheld_amount))).toEqual([100, 60]);
  });

  it("aggregates staged overlapping schedules and caps at current ownership", async () => {
    let result = await createSchedule({
      name: "Second 75%", triggerType: "fixed_date", entitlementMethod: "percentage",
      percentageBps: 7500, scheduledTriggerDate: "2026-01-01",
      confirmationRequired: false, scopePolicy: "all_current_origins",
    });
    result = await scheduleIt(String(result.schedule?.id), Number(result.schedule?.revision));
    result = await activate(String(result.schedule?.id), Number(result.schedule?.revision));
    expect(result.succeeded).toBe(true);
    const state = await rpc("select public.get_project_retention_eligibility($1) result", [PROJECT]);
    expect(state.origins?.map((x) => Number(x.currentEligibleRetention))).toEqual([100, 60]);
    expect(state.origins?.every(
      (x) => x.eligibilitySource === "accumulated_retention",
    )).toBe(true);
  });

  it("uses deterministic largest-remainder cents for a fixed pool", async () => {
    let result = await createSchedule({
      name: "Fixed cents", triggerType: "fixed_date", entitlementMethod: "fixed_amount",
      fixedAmount: 10.01, scheduledTriggerDate: "2026-01-01",
      confirmationRequired: false, scopePolicy: "explicit",
    });
    fixedSchedule = String(result.schedule?.id);
    result = await addOrigin(fixedSchedule, Number(result.schedule?.revision), ORIGIN_A);
    result = await addOrigin(fixedSchedule, Number(result.schedule?.revision), ORIGIN_B);
    result = await scheduleIt(fixedSchedule, Number(result.schedule?.revision));
    result = await activate(fixedSchedule, Number(result.schedule?.revision));
    expect(result.origins?.map((x) => Number(x.activated_entitlement_amount))).toEqual([6.26, 3.75]);
  });

  it("enforces schedule/origin caps, duplicate scope, and cross-project isolation", async () => {
    let result = await createSchedule({
      name: "Capped", triggerType: "fixed_date", entitlementMethod: "percentage",
      percentageBps: 10000, capAmount: 7.01, scheduledTriggerDate: "2026-01-01",
      confirmationRequired: false, scopePolicy: "explicit", reminderRules: [],
    });
    const id = String(result.schedule?.id);
    result = await addOrigin(id, Number(result.schedule?.revision), ORIGIN_A, { capAmount: 2 });
    const duplicate = await addOrigin(id, Number(result.schedule?.revision), ORIGIN_A);
    expect(duplicate.errorCode).toBe("duplicate_schedule_origin");
    const crossProject = await addOrigin(
      id, Number(result.schedule?.revision), ORIGIN_NONE,
    );
    expect(crossProject.errorCode).toBe("invalid_schedule_scope");
    result = await addOrigin(id, Number(result.schedule?.revision), ORIGIN_B);
    result = await scheduleIt(id, Number(result.schedule?.revision));
    result = await activate(id, Number(result.schedule?.revision));
    expect(result.succeeded).toBe(true);
    expect(result.origins?.reduce(
      (sum, origin) => sum + Number(origin.activated_entitlement_amount),
      0,
    )).toBeCloseTo(7.01, 2);
    expect(Number(result.origins?.[0].activated_entitlement_amount)).toBeLessThanOrEqual(2);
  });

  it("validates manual triggers and preserves activation evidence", async () => {
    let result = await createSchedule({
      name: "Manual", triggerType: "manual_milestone", entitlementMethod: "percentage",
      percentageBps: 1000, confirmationRequired: true, scopePolicy: "explicit",
    });
    const id = String(result.schedule?.id);
    result = await addOrigin(id, Number(result.schedule?.revision), ORIGIN_A);
    result = await scheduleIt(id, Number(result.schedule?.revision));
    const rejected = await activate(id, Number(result.schedule?.revision));
    expect(rejected.errorCode).toBe("trigger_confirmation_required");
    result = await rpc("select public.confirm_retention_schedule_trigger($1::jsonb) result", [
      JSON.stringify({
        scheduleId: id, expectedRevision: result.schedule?.revision,
        actualTriggerDate: "2026-06-01", reason: "Certificate issued",
        evidence: { certificate: "PC-1" },
      }),
    ]);
    result = await activate(id, Number(result.schedule?.revision));
    expect(result.succeeded).toBe(true);
    expect(result.schedule?.eligibility_date).toBe("2026-06-01");
  });

  it("supports practical completion, defects expiry and custom trigger delays", async () => {
    for (const [triggerType, delayDays] of [
      ["practical_completion", 10],
      ["defects_liability_expiry", 365],
      ["custom", 2],
    ] as const) {
      let result = await createSchedule({
        name: triggerType, triggerType, entitlementMethod: "percentage",
        percentageBps: 100, confirmationRequired: true,
        scopePolicy: "explicit", delayDays,
      });
      const id = String(result.schedule?.id);
      result = await addOrigin(id, Number(result.schedule?.revision), ORIGIN_A);
      result = await scheduleIt(id, Number(result.schedule?.revision));
      result = await rpc("select public.confirm_retention_schedule_trigger($1::jsonb) result", [
        JSON.stringify({
          scheduleId: id, expectedRevision: result.schedule?.revision,
          actualTriggerDate: "2026-01-01", reason: "Confirmed",
          evidence: { reference: `${triggerType}-evidence` },
        }),
      ]);
      result = await activate(id, Number(result.schedule?.revision));
      expect(result.succeeded).toBe(true);
      expect(result.schedule?.eligibility_date).toBe(
        delayDays === 10 ? "2026-01-11" : delayDays === 365 ? "2027-01-01" : "2026-01-03",
      );
    }
  });

  it("freezes more than 200 all-current origins in one activation", async () => {
    await client.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,claim_type,status,
        claim_date,claim_amount,retention_method,retention_percent,
        retention_withheld_amount,retention_released_amount,retention_held_to_date,
        retention_released_to_date,retention_balance,net_claim_excl_gst,gst_amount,total_payable
       )
       select gen_random_uuid(),$1,$2,$3,'P4S-CL-'||lpad(g::text,3,'0'),'Scale '||g,
        'Progress','Submitted','2026-01-01',100,'flat',10,10,0,10,0,10,90,13.5,103.5
       from generate_series(1,205) g`,
      [ORG, SCALE_PROJECT, USER],
    );
    const result = await rpc(
      "select public.create_retention_release_schedule($1::jsonb) result",
      [JSON.stringify({
        projectId: SCALE_PROJECT, name: "Scale", triggerType: "fixed_date",
        entitlementMethod: "percentage", percentageBps: 5000,
        scheduledTriggerDate: "2026-01-01", confirmationRequired: false,
        scopePolicy: "all_current_origins", reminderRules: [],
      })],
    );
    let activated = await scheduleIt(String(result.schedule?.id), Number(result.schedule?.revision));
    activated = await activate(String(result.schedule?.id), Number(activated.schedule?.revision));
    expect(activated.succeeded).toBe(true);
    expect(activated.origins).toHaveLength(205);
  });

  it("allows no-schedule claims and keeps schedules non-authoritative", async () => {
    let draft = await rpc(
      "select public.create_retention_claim_draft($1,'Eligible',null,null,null,'p4') result",
      [PROJECT],
    );
    draft = await rpc(
      "select public.add_retention_claim_allocation($1,$2,$3,10,null,'p4') result",
      [draft.claim?.id, draft.claim?.draftRevision, ORIGIN_A],
    );
    let refreshed = await rpc(
      "select public.refresh_retention_claim_eligibility_state($1,$2,'p4') result",
      [draft.claim?.id, draft.claim?.draftRevision],
    );
    const submitted = await rpc(
      "select public.submit_retention_claim($1,$2,$3,'p4',$4) result",
      [
        refreshed.claim?.id, refreshed.claim?.draftRevision,
        refreshed.claim?.lastPositionStateHash, refreshed.eligibilityStateHash,
      ],
    );
    expect(submitted.succeeded).toBe(true);
    expect(submitted.eligibilityStateHash).toBeTruthy();

    draft = await rpc(
      "select public.create_retention_claim_draft($1,'Not eligible',null,null,null,'p4') result",
      [NO_SCHEDULE_PROJECT],
    );
    draft = await rpc(
      "select public.add_retention_claim_allocation($1,$2,$3,20,null,'p4') result",
      [draft.claim?.id, draft.claim?.draftRevision, ORIGIN_NONE],
    );
    refreshed = await rpc(
      "select public.refresh_retention_claim_eligibility_state($1,$2,'p4') result",
      [draft.claim?.id, draft.claim?.draftRevision],
    );
    const noScheduleSubmitted = await rpc(
      "select public.submit_retention_claim($1,$2,$3,'p4',$4) result",
      [
        refreshed.claim?.id, refreshed.claim?.draftRevision,
        refreshed.claim?.lastPositionStateHash, refreshed.eligibilityStateHash,
      ],
    );
    expect(noScheduleSubmitted.succeeded).toBe(true);
    const beforeSchedule = await rpc(
      "select public.get_project_retention_eligibility($1) result",
      [NO_SCHEDULE_PROJECT],
    );
    expect(Number(beforeSchedule.origins?.[0]?.currentEligibleRetention)).toBe(80);

    let schedule = await rpc(
      "select public.create_retention_release_schedule($1::jsonb) result",
      [JSON.stringify({
        projectId: NO_SCHEDULE_PROJECT, name: "Ten percent",
        triggerType: "fixed_date", entitlementMethod: "percentage",
        percentageBps: 1000, scheduledTriggerDate: "2026-01-01",
        confirmationRequired: false, scopePolicy: "all_current_origins",
        reminderRules: [],
      })],
    );
    schedule = await scheduleIt(String(schedule.schedule?.id), Number(schedule.schedule?.revision));
    schedule = await activate(String(schedule.schedule?.id), Number(schedule.schedule?.revision));
    expect(schedule.succeeded).toBe(true);
    const afterSchedule = await rpc(
      "select public.get_project_retention_eligibility($1) result",
      [NO_SCHEDULE_PROJECT],
    );
    expect(afterSchedule.eligibilityStateHash).toBe(
      beforeSchedule.eligibilityStateHash,
    );
    expect(Number(afterSchedule.origins?.[0]?.currentEligibleRetention)).toBe(80);

    draft = await rpc(
      "select public.create_retention_claim_draft($1,'Overclaim',null,null,null,'p4') result",
      [NO_SCHEDULE_PROJECT],
    );
    draft = await rpc(
      "select public.add_retention_claim_allocation($1,$2,$3,81,null,'p4') result",
      [draft.claim?.id, draft.claim?.draftRevision, ORIGIN_NONE],
    );
    const ownership = await rpc(
      "select public.evaluate_retention_ownership_phase2a($1,$2,'[]'::jsonb) result",
      [ORG, NO_SCHEDULE_PROJECT],
    );
    expect(ownership.valid).toBe(true);
    expect(ownership.origins?.[0]).toMatchObject({
      retentionHeldMinor: 10_000,
      previouslyClaimedMinor: 2_000,
      remainingMinor: 8_000,
      draftCommittedMinor: 8_100,
      eligibilitySource: "accumulated_retention",
    });
    refreshed = await rpc(
      "select public.refresh_retention_claim_eligibility_state($1,$2,'p4') result",
      [draft.claim?.id, draft.claim?.draftRevision],
    );
    const aboveEligibility = await rpc(
      "select public.submit_retention_claim($1,$2,$3,'p4',$4) result",
      [
        refreshed.claim?.id, refreshed.claim?.draftRevision,
        refreshed.claim?.lastPositionStateHash, refreshed.eligibilityStateHash,
      ],
    );
    expect(aboveEligibility.errorCode).toBe("allocation_exceeds_eligibility");
  });

  it("creates, claims, fails, retries and confirms operational reminders without changing eligibility", async () => {
    const before = await rpc("select public.get_project_retention_eligibility($1) result", [PROJECT]);
    const created = await rpc("select public.create_retention_reminder($1::jsonb) result", [
      JSON.stringify({
        scheduleId: percentageSchedule, reminderType: "escalation",
        contractualDueDate: "2026-01-01",
        assignedPermissionKey: "retention.reminders.manage",
        recurrenceType: "daily", escalationAfterDays: 0,
        occurrenceKey: "phase4-recurring-escalation",
      }),
    ]);
    expect(created.succeeded).toBe(true);
    await client.query("select set_config('request.jwt.claim.role','service_role',true)");
    const selected = await rpc(
      "select public.select_due_retention_reminders(100,'phase4-test') result",
    );
    expect(selected.succeeded).toBe(true);
    expect((selected.reminders ?? []).length).toBeGreaterThan(0);
    const reminder = selected.reminders?.find(
      (row) => row.occurrence_key === "phase4-recurring-escalation",
    );
    expect(reminder).toBeTruthy();
    let delivery = await rpc(
      "select public.record_retention_reminder_delivery_result($1::jsonb) result",
      [JSON.stringify({
        reminderId: reminder?.id, claimToken: selected.claimToken,
        delivered: false, failureReason: "adapter unavailable",
      })],
    );
    expect(delivery.reminder?.state).toBe("failed");
    await client.query(
      "update public.retention_reminders set next_delivery_at=now()-interval '1 minute' where id=$1",
      [reminder?.id],
    );
    const retry = await rpc("select public.select_due_retention_reminders(1,'phase4-test') result");
    delivery = await rpc(
      "select public.record_retention_reminder_delivery_result($1::jsonb) result",
      [JSON.stringify({
        reminderId: reminder?.id, claimToken: retry.claimToken,
        delivered: true, adapter: "test",
      })],
    );
    expect(delivery.reminder?.state).toBe("sent");
    expect(delivery.recurrence?.state).toBe("scheduled");
    await asUser();
    const after = await rpc("select public.get_project_retention_eligibility($1) result", [PROJECT]);
    expect(after.eligibilityStateHash).toBe(before.eligibilityStateHash);
  });

  it("supports snooze, completion and cancellation without changing schedules", async () => {
    const create = async (key: string) => rpc(
      "select public.create_retention_reminder($1::jsonb) result",
      [JSON.stringify({
        scheduleId: percentageSchedule, reminderType: "custom",
        contractualDueDate: "2027-01-01",
        assignedPermissionKey: "retention.reminders.manage",
        occurrenceKey: key,
      })],
    );
    let result = await create("phase4-snooze");
    result = await rpc("select public.snooze_retention_reminder($1::jsonb) result", [
      JSON.stringify({
        reminderId: result.reminder?.id, expectedRevision: result.reminder?.revision,
        snoozedUntil: "2027-01-02T00:00:00Z",
      }),
    ]);
    expect(result.reminder?.state).toBe("snoozed");

    result = await create("phase4-complete");
    result = await rpc("select public.complete_retention_reminder($1::jsonb) result", [
      JSON.stringify({
        reminderId: result.reminder?.id, expectedRevision: result.reminder?.revision,
        reason: "Handled",
      }),
    ]);
    expect(result.reminder?.state).toBe("completed");

    result = await create("phase4-cancel");
    result = await rpc("select public.cancel_retention_reminder($1::jsonb) result", [
      JSON.stringify({
        reminderId: result.reminder?.id, expectedRevision: result.reminder?.revision,
        reason: "No longer required",
      }),
    ]);
    expect(result.reminder?.state).toBe("cancelled");
    const schedule = await rpc(
      "select public.get_retention_release_schedule($1) result",
      [percentageSchedule],
    );
    expect(schedule.schedule?.status).toBe("activated");
  });

  it("reduces remaining eligibility when Payment Claim ownership falls below prior claims", async () => {
    await client.query("savepoint phase4_ownership_reduction");
    await client.query(
      "update public.project_claims set retention_withheld_amount=5 where id=$1",
      [ORIGIN_A],
    );
    const state = await rpc("select public.get_project_retention_eligibility($1) result", [PROJECT]);
    const origin = state.origins?.find((x) => x.originatingPaymentClaimId === ORIGIN_A);
    expect(Number(origin?.currentEligibleRetention)).toBe(0);
    const frozen = await client.query(
      `select activation_retention_owned_snapshot from public.project_retention_schedule_origins
       where schedule_id=$1 and originating_payment_claim_id=$2`,
      [percentageSchedule, ORIGIN_A],
    );
    expect(Number(frozen.rows[0].activation_retention_owned_snapshot)).toBe(100);
    await client.query("rollback to savepoint phase4_ownership_reduction");
    await client.query("release savepoint phase4_ownership_reduction");
  });

  it("enforces cancellation, completion, and activated reliance rules", async () => {
    let result = await createSchedule({
      name: "Cancelled draft", triggerType: "fixed_date", entitlementMethod: "percentage",
      percentageBps: 100, scheduledTriggerDate: "2026-01-01",
      confirmationRequired: false, scopePolicy: "explicit",
    });
    result = await rpc("select public.cancel_retention_release_schedule($1::jsonb) result", [
      JSON.stringify({
        scheduleId: result.schedule?.id, expectedRevision: result.schedule?.revision,
        reason: "Contract term removed",
      }),
    ]);
    expect(result.schedule?.status).toBe("cancelled");

    const reliedCancellation = await rpc(
      "select public.cancel_retention_release_schedule($1::jsonb) result",
      [JSON.stringify({
        scheduleId: fixedSchedule,
        expectedRevision: (await rpc(
          "select public.get_retention_release_schedule($1) result",
          [fixedSchedule],
        )).schedule?.revision,
        reason: "Attempted correction",
      })],
    );
    expect(reliedCancellation.succeeded).toBe(true);
    expect(reliedCancellation.schedule?.status).toBe("cancelled");

    result = await createSchedule({
      name: "Completable", triggerType: "fixed_date", entitlementMethod: "percentage",
      percentageBps: 100, scheduledTriggerDate: "2026-01-01",
      confirmationRequired: false, scopePolicy: "all_current_origins", reminderRules: [],
    });
    result = await scheduleIt(String(result.schedule?.id), Number(result.schedule?.revision));
    result = await activate(String(result.schedule?.id), Number(result.schedule?.revision));
    result = await rpc("select public.complete_retention_release_schedule($1::jsonb) result", [
      JSON.stringify({
        scheduleId: result.schedule?.id, expectedRevision: result.schedule?.revision,
        acknowledgeRemaining: true, reason: "Contract administration complete",
      }),
    ]);
    expect(result.schedule?.status).toBe("completed");
    const immutable = await rpc(
      "select public.update_retention_release_schedule_draft($1::jsonb) result",
      [JSON.stringify({
        scheduleId: result.schedule?.id, expectedRevision: result.schedule?.revision,
        name: "Changed",
      })],
    );
    expect(immutable.errorCode).toBe("schedule_immutable");
  });

  it("enforces direct-write denial and append-only events", async () => {
    await client.query("set local role authenticated");
    await expectDbError(() => client.query(
      "update public.project_retention_release_schedules set name='direct' where id=$1",
      [percentageSchedule],
    ));
    await client.query("reset role");
    await expectDbError(() => client.query(
      "update public.retention_schedule_events set reason='changed' where schedule_id=$1",
      [percentageSchedule],
    ), "append-only");
  });
});
