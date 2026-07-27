import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.RETENTION_PHASE5_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER = "f5000000-0000-4000-8000-000000000001";
const WORKER = "f5000000-0000-4000-8000-000000000002";
const OUTSIDER = "f5000000-0000-4000-8000-000000000003";
const ORG = "f5000000-0000-4000-8000-000000000010";
const PROJECT = "f5000000-0000-4000-8000-000000000100";
const ORIGIN = "f5000000-0000-4000-8000-000000001001";
const SCHEDULE = "f5000000-0000-4000-8000-000000002001";
const CLAIM = "f5000000-0000-4000-8000-000000003001";
const ALLOCATION = "f5000000-0000-4000-8000-000000004001";
const HASH = "a".repeat(64);

type Result = {
  succeeded: boolean;
  errorCode: string | null;
  action?: string;
  blocking?: boolean;
  availabilityRestored?: boolean;
  variance?: Record<string, unknown>;
  claim?: Record<string, unknown>;
  variances?: Array<Record<string, unknown>>;
  origins?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
  details?: Record<string, unknown>;
  eligibilityStateHash?: string;
};

describeDatabase("Phase 5 retention variance database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  let varianceId = "";

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      `insert into auth.users
       (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'phase5@example.test','',now(),'{}','{}')`,
      [USER],
    );
    await client.query("delete from public.organizations where created_by=$1", [USER]);
    for (const [id, email] of [
      [WORKER, "phase5-worker@example.test"],
      [OUTSIDER, "phase5-outsider@example.test"],
    ]) {
      await client.query(
        `insert into auth.users
         (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
         values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         $2,'',now(),'{}','{}')`,
        [id, email],
      );
      await client.query("delete from public.organizations where created_by=$1", [id]);
    }
    await client.query(
      "insert into public.organizations(id,name,created_by,timezone) values($1,'Phase 5',$2,'Pacific/Auckland')",
      [ORG, USER],
    );
    await client.query(
      `insert into public.organization_members(organization_id,user_id,role,display_name)
       values($1,$2,'owner','Phase 5 Owner'),($1,$3,'worker','Phase 5 Worker')`,
      [ORG, USER, WORKER],
    );
    await client.query(
      `insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code)
       values($1,$2,$3,'Phase 5','phase-5','P5')`,
      [PROJECT, ORG, USER],
    );
    await client.query(
      `update public.organization_capabilities set enabled=true,enabled_by=$2,enabled_at=now()
       where organization_id=$1 and capability_key='retention_management'`,
      [ORG, USER],
    );
    await client.query(
      `update public.project_retention_workflow_states
       set mode='observe',changed_by=$2,changed_at=now()
       where organization_id=$1 and project_id=$3`,
      [ORG, USER, PROJECT],
    );
    await client.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,claim_type,status,
        claim_date,due_date,claim_amount,retention_method,retention_percent,
        retention_withheld_amount,retention_released_amount,retention_held_to_date,
        retention_released_to_date,retention_balance,net_claim_excl_gst,gst_amount,total_payable
       ) values(
        $1,$2,$3,$4,'P5-CL-01','Origin','Progress','Submitted',
        '2026-01-01','2026-02-01',1000,'flat',10,100,0,100,0,100,900,135,1035
       )`,
      [ORIGIN, ORG, PROJECT, USER],
    );
    await client.query(
      `insert into public.project_retention_release_schedules(
        id,organization_id,project_id,name,schedule_sequence,status,trigger_type,
        entitlement_method,percentage_bps,scope_policy,scheduled_trigger_date,
        confirmation_required,created_by
       ) values($1,$2,$3,'Full release',1,'draft','fixed_date','percentage',
         10000,'explicit','2026-01-01',false,$4)`,
      [SCHEDULE, ORG, PROJECT, USER],
    );
    await client.query(
      `insert into public.project_retention_schedule_origins(
        organization_id,project_id,schedule_id,originating_payment_claim_id,
        origin_sequence,activated_entitlement_amount,activation_origin_state_hash,
        activation_position_state_hash,activation_evidence,activated_at,created_by
       ) values($1,$2,$3,$4,1,100,$5,$5,'{}',now(),$6)`,
      [ORG, PROJECT, SCHEDULE, ORIGIN, HASH, USER],
    );
    await client.query("select set_config('app.retention_phase4_internal_write','true',true)");
    await client.query(
      `update public.project_retention_release_schedules set
        status='activated',eligibility_date='2026-01-01',activated_at=now(),
        activated_by=$2,activation_position_state_hash=$3,
        activation_eligibility_state_hash=$3,activation_evidence='{}',revision=2
       where id=$1`,
      [SCHEDULE, USER, HASH],
    );
    await client.query(
      `insert into public.retention_claims(
        id,organization_id,project_id,claim_number,title,status,subtotal_excl_tax,
        draft_revision,last_position_state_hash,submission_state_hash,
        last_eligibility_state_hash,submission_eligibility_state_hash,
        submitted_by,submitted_at,created_by
       ) values($1,$2,$3,'RC-001','Retention Claim','submitted',80,2,$5,$5,$5,$5,$4,now(),$4)`,
      [CLAIM, ORG, PROJECT, USER, HASH],
    );
    await client.query("select set_config('app.retention_phase4_submission_write','true',true)");
    await client.query(
      `insert into public.retention_claim_allocations(
        id,organization_id,project_id,retention_claim_id,originating_payment_claim_id,
        allocation_sequence,allocation_amount,draft_origin_state_hash,draft_origin_updated_at,
        draft_origin_retention_owned,origin_claim_number_snapshot,origin_claim_date_snapshot,
        origin_claim_status_snapshot,origin_claim_created_at_snapshot,origin_claim_updated_at_snapshot,
        retention_method_snapshot,retention_rate_snapshot,retention_withheld_snapshot,
        retention_released_snapshot,retention_held_to_date_snapshot,
        retention_released_to_date_snapshot,retention_balance_snapshot,
        existing_submitted_allocation_before,remaining_after_allocation,
        gross_claim_amount_snapshot,net_claim_excl_gst_snapshot,gst_amount_snapshot,
        total_payable_snapshot,project_state_hash_snapshot,origin_state_hash_snapshot,
        eligibility_state_hash_snapshot,eligibility_schedule_ids_snapshot,
        submitted_by,submitted_at,created_by
       ) values(
        $1,$2,$3,$4,$5,1,80,$7,now(),120,'P5-CL-01','2026-01-01','Submitted',
        now(),now(),'flat',10,120,0,120,0,120,0,40,1000,900,135,1035,$7,$7,$7,
        array[$6]::uuid[],$8,now(),$8
       )`,
      [ALLOCATION, ORG, PROJECT, CLAIM, ORIGIN, SCHEDULE, HASH, USER],
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
    await client.query("select set_config('request.jwt.claim.retention_phase5_internal','true',true)");
  }

  async function rpc(sql: string, values: unknown[] = []) {
    const response = await client.query<{ result: Result }>(sql, values);
    return response.rows[0].result;
  }

  it("detects a non-blocking ownership change without duplicating the origin record", async () => {
    let result = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'warning') result",
      [PROJECT, ORIGIN],
    );
    expect(result.succeeded).toBe(true);
    expect(result.blocking).toBe(false);
    expect(result.results?.[0].state).toBe("warning");
    expect(result.results?.[0].primaryType).toBe("ownership_reduced");

    result = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'repeat') result",
      [PROJECT, ORIGIN],
    );
    const rows = await client.query(
      "select * from public.retention_variances where originating_payment_claim_id=$1",
      [ORIGIN],
    );
    expect(rows.rowCount).toBe(1);
    varianceId = rows.rows[0].id;
    expect(Number(rows.rows[0].ownership_variance)).toBe(20);
  });

  it("requires explicit variance permission and denies cross-tenant reads", async () => {
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [WORKER]);
    const membershipOnly = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'worker') result",
      [PROJECT, ORIGIN],
    );
    expect(membershipOnly.errorCode).toBe("permission_denied");

    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [OUTSIDER]);
    const crossTenant = await rpc(
      "select public.get_retention_variance($1) result",
      [varianceId],
    );
    expect(crossTenant.errorCode).toBe("project_not_found");
    await asUser();
  });

  it("auto-clears a warning when the live state again matches submitted evidence", async () => {
    await client.query(
      "update public.project_claims set retention_withheld_amount=120,retention_balance=120 where id=$1",
      [ORIGIN],
    );
    await client.query("select set_config('app.retention_phase4_internal_write','true',true)");
    await client.query(
      "update public.project_retention_release_schedules set status='draft' where id=$1",
      [SCHEDULE],
    );
    await client.query(
      "update public.project_retention_schedule_origins set activated_entitlement_amount=120 where schedule_id=$1",
      [SCHEDULE],
    );
    await client.query(
      "update public.project_retention_release_schedules set status='activated' where id=$1",
      [SCHEDULE],
    );
    const result = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'auto-clear') result",
      [PROJECT, ORIGIN],
    );
    expect(result.results?.[0].action).toBe("auto_cleared");
    const row = await client.query(
      "select state,is_blocking from public.retention_variances where id=$1",
      [varianceId],
    );
    expect(row.rows[0]).toMatchObject({ state: "resolved", is_blocking: false });
  });

  it("classifies ownership over-allocation as critical and blocking", async () => {
    await client.query(
      "update public.project_claims set retention_withheld_amount=70,retention_balance=70 where id=$1",
      [ORIGIN],
    );
    const result = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'over') result",
      [PROJECT, ORIGIN],
    );
    expect(result.blocking).toBe(true);
    expect(result.results?.[0].state).toBe("over_allocated");
    expect(result.results?.[0].severity).toBe("critical");
    expect(Number(result.results?.[0].ownershipVariance)).toBe(-10);
    expect(Number(result.results?.[0].allocatableAvailability)).toBe(0);
  });

  it("blocks schedule cancellation and invalid financial resolution", async () => {
    const cancellation = await rpc(
      "select public.cancel_retention_release_schedule($1::jsonb) result",
      [JSON.stringify({ scheduleId: SCHEDULE, expectedRevision: 2, reason: "test" })],
    );
    expect(cancellation.errorCode).toBe("variance_blocking");
    const row = await client.query(
      "select status from public.project_retention_release_schedules where id=$1",
      [SCHEDULE],
    );
    expect(row.rows[0].status).toBe("activated");

    const variance = await client.query(
      "select revision from public.retention_variances where id=$1",
      [varianceId],
    );
    const resolution = await rpc(
      "select public.resolve_retention_variance($1::jsonb) result",
      [JSON.stringify({
        varianceId,
        expectedRevision: Number(variance.rows[0].revision),
        reason: "Not actually corrected",
      })],
    );
    expect(resolution.errorCode).toBe("live_position_still_invalid");
  });

  it("records evidence as pending without restoring availability", async () => {
    const variance = await client.query(
      "select revision from public.retention_variances where id=$1",
      [varianceId],
    );
    const result = await rpc(
      "select public.record_retention_variance_corrective_evidence($1::jsonb) result",
      [JSON.stringify({
        varianceId,
        expectedRevision: Number(variance.rows[0].revision),
        externalReferenceId: "EXT-CN-1",
        evidenceNote: "External correction proposed",
        correctiveAmountProposed: 10,
      })],
    );
    expect(result.succeeded).toBe(true);
    expect(result.availabilityRestored).toBe(false);
    expect(result.variance?.state).toBe("resolution_pending");
    expect(result.variance?.is_blocking).toBe(true);
  });

  it("accepts an authorized contractual override without creating availability", async () => {
    const variance = await client.query(
      "select revision from public.retention_variances where id=$1",
      [varianceId],
    );
    const result = await rpc(
      "select public.accept_retention_variance_contractual_override($1::jsonb) result",
      [JSON.stringify({
        varianceId,
        expectedRevision: Number(variance.rows[0].revision),
        reason: "Contractually accepted historic discrepancy",
        evidence: { approval: "signed-minute-1" },
        approvedDiscrepancyAmount: 10,
      })],
    );
    expect(result.succeeded).toBe(true);
    expect(result.availabilityRestored).toBe(false);
    expect(result.variance?.state).toBe("accepted_contractual_override");
    const eligibility = await rpc(
      "select public.get_project_retention_eligibility($1) result",
      [PROJECT],
    );
    const origin = eligibility.origins?.[0] as Record<string, unknown>;
    expect(Number(origin.availableRetention)).toBe(0);
  });

  it("reopens an override after a later material regression", async () => {
    await client.query(
      "update public.project_claims set retention_withheld_amount=60,retention_balance=60 where id=$1",
      [ORIGIN],
    );
    const result = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'regression') result",
      [PROJECT, ORIGIN],
    );
    expect(result.results?.[0].action).toBe("reopened");
    const row = await client.query(
      "select state,is_blocking from public.retention_variances where id=$1",
      [varianceId],
    );
    expect(row.rows[0]).toMatchObject({ state: "over_allocated", is_blocking: true });
  });

  it("resolves only after the live financial condition reconciles", async () => {
    await client.query(
      "update public.project_claims set retention_withheld_amount=100,retention_balance=100 where id=$1",
      [ORIGIN],
    );
    await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'corrected') result",
      [PROJECT, ORIGIN],
    );
    const variance = await client.query(
      "select revision from public.retention_variances where id=$1",
      [varianceId],
    );
    const result = await rpc(
      "select public.resolve_retention_variance($1::jsonb) result",
      [JSON.stringify({
        varianceId,
        expectedRevision: Number(variance.rows[0].revision),
        reason: "Live position reviewed and reconciled",
      })],
    );
    expect(result.succeeded).toBe(true);
    expect(result.availabilityRestored).toBe(false);
    expect(result.variance?.state).toBe("resolved");
  });

  it("does not let schedule changes block an otherwise valid claim", async () => {
    await client.query("select set_config('app.retention_phase4_internal_write','true',true)");
    await client.query(
      "update public.project_retention_release_schedules set status='draft' where id=$1",
      [SCHEDULE],
    );
    await client.query(
      "update public.project_retention_schedule_origins set activated_entitlement_amount=50 where schedule_id=$1",
      [SCHEDULE],
    );
    await client.query(
      "update public.project_retention_release_schedules set status='activated' where id=$1",
      [SCHEDULE],
    );
    let result = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'eligibility-reduced') result",
      [PROJECT, ORIGIN],
    );
    expect(result.results?.[0].primaryType).not.toBe("eligibility_reduced");
    expect(result.results?.[0].primaryType).not.toBe("schedule_changed");
    expect(result.results?.[0].isBlocking).toBe(false);

    let draft = await rpc(
      "select public.create_retention_claim_draft($1,'Blocked draft',null,null,null,'phase5-block') result",
      [PROJECT],
    );
    expect(draft.succeeded).toBe(true);
    const draftId = String(draft.claim?.id);
    draft = await rpc(
      "select public.add_retention_claim_allocation($1,$2,$3,10,1,'phase5-block') result",
      [draftId, Number(draft.claim?.draftRevision), ORIGIN],
    );
    draft = await rpc(
      "select public.refresh_retention_claim_eligibility_state($1,$2,'phase5-block') result",
      [draftId, Number(draft.claim?.draftRevision)],
    );
    const blockedSubmission = await rpc(
      "select public.submit_retention_claim($1,$2,$3,$4,$5) result",
      [
        draftId,
        Number(draft.claim?.draftRevision),
        String(draft.claim?.lastPositionStateHash),
        "phase5-block",
        String(draft.eligibilityStateHash),
      ],
    );
    expect(blockedSubmission).toMatchObject({ succeeded: true });
    const stillDraft = await client.query(
      "select status from public.retention_claims where id=$1",
      [draftId],
    );
    expect(stillDraft.rows[0].status).toBe("submitted");

    await client.query(
      "update public.project_retention_release_schedules set status='cancelled',cancelled_at=now(),cancelled_by=$2,cancellation_reason='test' where id=$1",
      [SCHEDULE, USER],
    );
    result = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'schedule-cancelled') result",
      [PROJECT, ORIGIN],
    );
    expect(result.results?.[0].primaryType).not.toBe("schedule_cancelled");
    expect(result.results?.[0].isBlocking).toBe(false);
  });

  it("gives a cancelled originating Payment Claim highest classification precedence", async () => {
    await client.query("update public.project_claims set status='Cancelled' where id=$1", [ORIGIN]);
    const result = await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'origin-cancelled') result",
      [PROJECT, ORIGIN],
    );
    expect(result.results?.[0].primaryType).toBe("origin_payment_claim_cancelled");
    expect(result.results?.[0].isBlocking).toBe(true);
  });

  it("keeps events append-only and financial source records unchanged by evaluation", async () => {
    const before = await client.query(
      `select
        (select row_to_json(c) from public.retention_claims c where c.id=$1) claim,
        (select row_to_json(a) from public.retention_claim_allocations a where a.id=$2) allocation,
        (select row_to_json(p) from public.project_claims p where p.id=$3) origin`,
      [CLAIM, ALLOCATION, ORIGIN],
    );
    await rpc(
      "select public.evaluate_retention_variances($1,array[$2]::uuid[],'immutability') result",
      [PROJECT, ORIGIN],
    );
    const after = await client.query(
      `select
        (select row_to_json(c) from public.retention_claims c where c.id=$1) claim,
        (select row_to_json(a) from public.retention_claim_allocations a where a.id=$2) allocation,
        (select row_to_json(p) from public.project_claims p where p.id=$3) origin`,
      [CLAIM, ALLOCATION, ORIGIN],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);

    await client.query("savepoint immutable_event");
    await expect(
      client.query(
        "update public.retention_variance_events set reason='changed' where variance_id=$1",
        [varianceId],
      ),
    ).rejects.toThrow("append-only");
    await client.query("rollback to savepoint immutable_event");
    await client.query("release savepoint immutable_event");
  });
});
