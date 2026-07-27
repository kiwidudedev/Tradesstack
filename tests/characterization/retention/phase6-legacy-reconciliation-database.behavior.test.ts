import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE6_DB_URL
  ?? process.env.RETENTION_PHASE5_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "a6000000-0000-4000-8000-000000000001";
const QS_ID = "a6000000-0000-4000-8000-000000000002";
const OTHER_OWNER_ID = "a6000000-0000-4000-8000-000000000003";
const ORGANIZATION_ID = "a6000000-0000-4000-8000-000000000010";
const OTHER_ORGANIZATION_ID = "a6000000-0000-4000-8000-000000000011";
const PROJECT_ID = "a6000000-0000-4000-8000-000000000100";
const OTHER_PROJECT_ID = "a6000000-0000-4000-8000-000000000101";
const ORIGIN_A_ID = "a6000000-0000-4000-8000-000000001001";
const ORIGIN_B_ID = "a6000000-0000-4000-8000-000000001002";
const RELEASE_ID = "a6000000-0000-4000-8000-000000001003";

type RpcResult = {
  succeeded: boolean;
  errorCode: string | null;
  created?: boolean;
  allocationId?: string;
  claim?: unknown;
  eligibilityStateHash?: string;
  case?: {
    id: string;
    status: string;
    revision: number;
    total_legacy_released: number;
    total_allocated: number;
    sources: Array<{
      id: string;
      source_payment_claim_id: string;
      retention_released_amount_snapshot: number;
      allocatedAmount: number;
      allocations: Array<Record<string, unknown>>;
    }>;
  };
  retentionPosition?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
};

describeDatabase("Phase 6 legacy reconciliation database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  let caseId = "";
  let sourceId = "";

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await seed();
    await asUser(OWNER_ID, true);
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function asUser(userId: string | null, internalGate: boolean) {
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId ?? "",
    ]);
    await client.query("select set_config('request.jwt.claim.role',$1,true)", [
      userId ? "authenticated" : "",
    ]);
    for (const phase of [3, 4, 5, 6]) {
      await client.query(
        `select set_config('request.jwt.claim.retention_phase${phase}_internal',$1,true)`,
        [internalGate ? "true" : "false"],
      );
    }
  }

  async function rpc(sql: string, params: unknown[] = []) {
    const result = await client.query<{ result: RpcResult }>(sql, params);
    return result.rows[0].result;
  }

  async function expectDatabaseError(
    action: () => Promise<unknown>,
    message: string,
  ) {
    await client.query("savepoint phase6_expected_error");
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    await client.query("rollback to savepoint phase6_expected_error");
    await client.query("release savepoint phase6_expected_error");
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(message);
  }

  async function seed() {
    await client.query(
      `insert into auth.users
        (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
         raw_app_meta_data,raw_user_meta_data)
       values
        ($1,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase6-owner@example.test','',now(),'{}','{}'),
        ($2,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase6-qs@example.test','',now(),'{}','{}'),
        ($3,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase6-other@example.test','',now(),'{}','{}')`,
      [OWNER_ID, QS_ID, OTHER_OWNER_ID],
    );
    await client.query(
      "delete from public.organizations where created_by=any($1::uuid[])",
      [[OWNER_ID, QS_ID, OTHER_OWNER_ID]],
    );
    await client.query(
      `insert into public.organizations(id,name,created_by)
       values ($1,'Phase 6',$3),($2,'Phase 6 Other',$4)`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_members
        (organization_id,user_id,role,display_name)
       values
        ($1,$3,'owner','Owner'),($1,$4,'qs','QS'),($2,$5,'owner','Other')`,
      [
        ORGANIZATION_ID,
        OTHER_ORGANIZATION_ID,
        OWNER_ID,
        QS_ID,
        OTHER_OWNER_ID,
      ],
    );
    await client.query(
      `insert into public.organization_projects
        (id,organization_id,created_by,name,slug,project_code)
       values
        ($1,$3,$5,'Legacy Reconciliation','phase6-reconciliation','P6'),
        ($2,$4,$6,'Other Tenant','phase6-other','P6-O')`,
      [
        PROJECT_ID,
        OTHER_PROJECT_ID,
        ORGANIZATION_ID,
        OTHER_ORGANIZATION_ID,
        OWNER_ID,
        OTHER_OWNER_ID,
      ],
    );
    await client.query(
      `update public.organization_capabilities
       set enabled=true,enabled_by=$2,enabled_at=now()
       where organization_id=$1 and capability_key='retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await client.query(
      `update public.project_retention_workflow_states
       set mode='observe',changed_by=$2,changed_at=now()
       where organization_id=$1 and project_id=$3`,
      [ORGANIZATION_ID, OWNER_ID, PROJECT_ID],
    );
    await client.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,
        claim_type,status,claim_date,due_date,claim_amount,retention_method,
        retention_percent,retention_withheld_amount,retention_released_amount,
        retention_held_to_date,retention_released_to_date,retention_balance,
        net_claim_excl_gst,gst_amount,total_payable,created_at,updated_at
      ) values
        ($1,$4,$5,$6,'P6-PC-01','Origin A','Progress','Submitted',
         '2025-01-01','2025-02-01',1000,'flat',10,100,0,100,0,100,
         900,135,1035,'2025-01-01T00:00:00Z','2025-01-01T01:00:00Z'),
        ($2,$4,$5,$6,'P6-PC-02','Origin B','Progress','Paid',
         '2025-02-01','2025-03-01',600,'flat',10,60,0,160,0,160,
         540,81,621,'2025-02-01T00:00:00Z','2025-02-01T01:00:00Z'),
        ($3,$4,$5,$6,'P6-PC-03','Historical release','Final','Paid',
         '2026-05-01','2026-06-01',0,'flat',0,0,120,160,120,40,
         120,18,138,'2026-05-01T00:00:00Z','2026-05-01T01:00:00Z')`,
      [ORIGIN_A_ID, ORIGIN_B_ID, RELEASE_ID, ORGANIZATION_ID, PROJECT_ID, OWNER_ID],
    );
  }

  it("preserves raw legacy totals and creates a deterministic unallocated case", async () => {
    const summary = await rpc(
      "select public.get_project_retention_position_summary($1) result",
      [PROJECT_ID],
    ) as unknown as Record<string, unknown>;
    expect(summary).toMatchObject({
      totalLegacyRetentionReleased: 120,
      legacyReconciliationRequired: true,
      legacyReconciliationState: "required",
    });

    const created = await rpc(
      "select public.create_retention_legacy_reconciliation_case($1,'create') result",
      [PROJECT_ID],
    );
    expect(created).toMatchObject({
      succeeded: true,
      created: true,
      case: {
        status: "draft",
        revision: 1,
        total_legacy_released: 120,
        total_allocated: 0,
      },
    });
    expect(created.case?.sources).toHaveLength(1);
    expect(created.case?.sources[0]).toMatchObject({
      source_payment_claim_id: RELEASE_ID,
      retention_released_amount_snapshot: 120,
      allocations: [],
    });
    caseId = created.case!.id;
    sourceId = created.case!.sources[0].id;

    const replay = await rpc(
      "select public.create_retention_legacy_reconciliation_case($1,'replay') result",
      [PROJECT_ID],
    );
    expect(replay).toMatchObject({ succeeded: true, created: false });
    expect(replay.case?.id).toBe(caseId);
  });

  it("enforces permissions, revision, tenant, chronology, source, and origin bounds", async () => {
    await asUser(QS_ID, true);
    const denied = await rpc(
      "select public.add_retention_legacy_release_allocation($1::jsonb) result",
      [JSON.stringify({
        caseId,
        sourceId,
        originatingPaymentClaimId: ORIGIN_A_ID,
        allocationAmount: 100,
        expectedRevision: 1,
      })],
    );
    expect(denied).toMatchObject({ succeeded: false, errorCode: "permission_denied" });

    await asUser(OWNER_ID, true);
    const crossTenant = await rpc(
      "select public.add_retention_legacy_release_allocation($1::jsonb) result",
      [JSON.stringify({
        caseId,
        sourceId,
        originatingPaymentClaimId: OTHER_PROJECT_ID,
        allocationAmount: 1,
        expectedRevision: 1,
      })],
    );
    expect(crossTenant.errorCode).toBe("origin_not_found");

    const overSource = await rpc(
      "select public.add_retention_legacy_release_allocation($1::jsonb) result",
      [JSON.stringify({
        caseId,
        sourceId,
        originatingPaymentClaimId: ORIGIN_A_ID,
        allocationAmount: 121,
        expectedRevision: 1,
      })],
    );
    expect(overSource.errorCode).toBe("source_overallocated");

    const first = await rpc(
      "select public.add_retention_legacy_release_allocation($1::jsonb) result",
      [JSON.stringify({
        caseId,
        sourceId,
        originatingPaymentClaimId: ORIGIN_A_ID,
        allocationAmount: 100,
        expectedRevision: 1,
        correlationId: "allocate-a",
      })],
    );
    expect(first).toMatchObject({ succeeded: true });
    expect(first.case?.revision).toBe(2);

    const stale = await rpc(
      "select public.add_retention_legacy_release_allocation($1::jsonb) result",
      [JSON.stringify({
        caseId,
        sourceId,
        originatingPaymentClaimId: ORIGIN_B_ID,
        allocationAmount: 20,
        expectedRevision: 1,
      })],
    );
    expect(stale.errorCode).toBe("concurrent_update");

    const second = await rpc(
      "select public.add_retention_legacy_release_allocation($1::jsonb) result",
      [JSON.stringify({
        caseId,
        sourceId,
        originatingPaymentClaimId: ORIGIN_B_ID,
        allocationAmount: 20,
        expectedRevision: 2,
        correlationId: "allocate-b",
      })],
    );
    expect(second).toMatchObject({
      succeeded: true,
      case: { revision: 3, total_allocated: 120 },
    });
  });

  it("requires evidence and explicit approval, then keeps the evidence immutable", async () => {
    const missingEvidence = await rpc(
      "select public.submit_retention_legacy_reconciliation_case($1::jsonb) result",
      [JSON.stringify({ caseId, expectedRevision: 3 })],
    );
    expect(missingEvidence.errorCode).toBe("reconciliation_evidence_required");

    const submitted = await rpc(
      "select public.submit_retention_legacy_reconciliation_case($1::jsonb) result",
      [JSON.stringify({
        caseId,
        expectedRevision: 3,
        reconciliationNote: "Reconciled against archived final account.",
        evidenceReference: "ARCHIVE-2026-05",
        evidence: { source: "signed-final-account", page: 12 },
        correlationId: "submit",
      })],
    );
    expect(submitted).toMatchObject({
      succeeded: true,
      case: { status: "in_review", revision: 4 },
    });

    await asUser(QS_ID, true);
    const denied = await rpc(
      "select public.approve_retention_legacy_reconciliation_case($1::jsonb) result",
      [JSON.stringify({
        caseId,
        expectedRevision: 4,
        approvalReason: "Approved evidence.",
      })],
    );
    expect(denied.errorCode).toBe("legacy_approval_permission_required");

    await asUser(OWNER_ID, true);
    const beforeDocuments = await client.query<{ count: string }>(
      "select count(*)::text count from public.organization_accounting_documents",
    );
    const approved = await rpc(
      "select public.approve_retention_legacy_reconciliation_case($1::jsonb) result",
      [JSON.stringify({
        caseId,
        expectedRevision: 4,
        approvalReason: "Archived evidence verified.",
        correlationId: "approve",
      })],
    );
    expect(approved).toMatchObject({
      succeeded: true,
      case: { status: "approved", revision: 5 },
      retentionPosition: {
        totalLegacyRetentionReleased: 120,
        legacyReconciliationRequired: false,
        legacyReconciliationState: "approved",
        legacyReconciledAmount: 120,
      },
    });
    const afterDocuments = await client.query<{ count: string }>(
      "select count(*)::text count from public.organization_accounting_documents",
    );
    expect(afterDocuments.rows[0].count).toBe(beforeDocuments.rows[0].count);

    await client.query("set local role authenticated");
    await expectDatabaseError(
      () => client.query(
        "update public.retention_legacy_release_allocations set allocation_amount=1 where reconciliation_case_id=$1",
        [caseId],
      ),
      "permission denied",
    );
    await client.query("reset role");

    const events = await rpc(
      "select public.get_retention_legacy_reconciliation_events($1,100) result",
      [caseId],
    );
    expect(events.events?.map((event) => event.event_type)).toEqual(
      expect.arrayContaining([
        "case_created",
        "allocation_added",
        "submitted_for_approval",
        "reconciliation_approved",
      ]),
    );
  });

  it("consumes migrated allocations without rewriting Payment Claims or restoring availability", async () => {
    const claims = await client.query(
      `select id,retention_withheld_amount,retention_released_amount,
        retention_balance,status from public.project_claims
       where project_id=$1 order by id`,
      [PROJECT_ID],
    );
    expect(claims.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: ORIGIN_A_ID,
        retention_withheld_amount: "100.00",
        retention_released_amount: "0.00",
      }),
      expect.objectContaining({
        id: RELEASE_ID,
        retention_released_amount: "120.00",
      }),
    ]));

    const eligibility = await rpc(
      "select public.get_project_retention_eligibility($1) result",
      [PROJECT_ID],
    ) as unknown as {
      origins: Array<Record<string, unknown>>;
    };
    expect(eligibility.origins).toEqual(expect.arrayContaining([
      expect.objectContaining({
        originatingPaymentClaimId: ORIGIN_A_ID,
        legacyCommittedRetention: 100,
        availableRetention: 0,
      }),
      expect.objectContaining({
        originatingPaymentClaimId: ORIGIN_B_ID,
        legacyCommittedRetention: 20,
        availableRetention: 40,
      }),
    ]));

    let schedule = await rpc(
      "select public.create_retention_release_schedule($1::jsonb) result",
      [JSON.stringify({
        projectId: PROJECT_ID,
        name: "Post-reconciliation release",
        triggerType: "fixed_date",
        entitlementMethod: "percentage",
        percentageBps: 10000,
        scheduledTriggerDate: "2026-06-01",
        confirmationRequired: false,
        scopePolicy: "all_current_origins",
        reminderRules: [],
      })],
    ) as unknown as {
      succeeded: boolean;
      schedule: { id: string; revision: number };
    };
    schedule = await rpc(
      "select public.update_retention_release_schedule_draft($1::jsonb) result",
      [JSON.stringify({
        scheduleId: schedule.schedule.id,
        expectedRevision: schedule.schedule.revision,
        status: "scheduled",
      })],
    ) as unknown as typeof schedule;
    schedule = await rpc(
      "select public.activate_retention_release_schedule($1::jsonb) result",
      [JSON.stringify({
        scheduleId: schedule.schedule.id,
        expectedRevision: schedule.schedule.revision,
      })],
    ) as unknown as typeof schedule;
    expect(schedule.succeeded).toBe(true);

    let native = await rpc(
      `select public.create_retention_claim_draft(
        $1,'Post-reconciliation claim','phase6','2026-06-01','2026-06-30','phase6'
      ) result`,
      [PROJECT_ID],
    );
    let nativeClaim = native.claim as unknown as {
      id: string;
      draftRevision: number;
      lastPositionStateHash: string;
    };
    native = await rpc(
      `select public.add_retention_claim_allocation(
        $1,$2,$3,40,null,'phase6'
      ) result`,
      [nativeClaim.id, nativeClaim.draftRevision, ORIGIN_B_ID],
    );
    nativeClaim = native.claim as unknown as typeof nativeClaim;
    native = await rpc(
      "select public.refresh_retention_claim_eligibility_state($1,$2,'phase6') result",
      [nativeClaim.id, nativeClaim.draftRevision],
    );
    nativeClaim = native.claim as unknown as typeof nativeClaim;
    native = await rpc(
      "select public.submit_retention_claim($1,$2,$3,'phase6',$4) result",
      [
        nativeClaim.id,
        nativeClaim.draftRevision,
        nativeClaim.lastPositionStateHash,
        native.eligibilityStateHash,
      ],
    );
    expect(native.succeeded).toBe(true);
    const frozen = await client.query<{
      existing_submitted_allocation_before: string;
      remaining_after_allocation: string;
    }>(
      `select existing_submitted_allocation_before,remaining_after_allocation
       from public.retention_claim_allocations
       where retention_claim_id=$1 and originating_payment_claim_id=$2`,
      [nativeClaim.id, ORIGIN_B_ID],
    );
    expect(frozen.rows[0]).toEqual({
      existing_submitted_allocation_before: "20.00",
      remaining_after_allocation: "0.00",
    });
  });

  it("marks changed historical source state unresolved and blocks native submission", async () => {
    await client.query(
      `update public.project_claims
       set retention_released_amount=110,retention_released_to_date=110,
           retention_balance=50,updated_at=updated_at+interval '1 second'
       where id=$1`,
      [RELEASE_ID],
    );
    const summary = await rpc(
      "select public.get_project_retention_position_summary($1) result",
      [PROJECT_ID],
    ) as unknown as Record<string, unknown>;
    expect(summary).toMatchObject({
      totalLegacyRetentionReleased: 110,
      legacyReconciliationRequired: true,
      legacyReconciliationState: "stale",
    });

    const draft = await rpc(
      `select public.create_retention_claim_draft(
        $1,'Blocked draft','phase6','2026-07-01','2026-07-31','phase6'
      ) result`,
      [PROJECT_ID],
    );
    expect(draft.succeeded).toBe(true);
    const claim = draft.claim as unknown as {
      id: string;
      draftRevision: number;
      lastPositionStateHash: string;
    };
    const refreshed = await rpc(
      "select public.refresh_retention_claim_eligibility_state($1,$2,'phase6') result",
      [claim.id, claim.draftRevision],
    );
    const refreshedClaim = refreshed.claim as unknown as {
      id: string;
      draftRevision: number;
      lastPositionStateHash: string;
    };
    await client.query(
      `insert into public.retention_claim_allocations(
        organization_id,project_id,retention_claim_id,
        originating_payment_claim_id,allocation_sequence,allocation_amount,
        draft_origin_state_hash,draft_origin_updated_at,
        draft_origin_retention_owned,created_by
      )
      select $1,$2,$3,p.id,1,1,private.retention_claim_origin_state_hash(p.id),
        p.updated_at,greatest(p.retention_withheld_amount,0),$4
      from public.project_claims p where p.id=$5`,
      [ORGANIZATION_ID, PROJECT_ID, refreshedClaim.id, OWNER_ID, ORIGIN_B_ID],
    );
    const submitted = await rpc(
      `select public.submit_retention_claim_phase3_pre_schedule(
        $1,$2,$3,'phase6'
      ) result`,
      [
        refreshedClaim.id,
        refreshedClaim.draftRevision,
        refreshedClaim.lastPositionStateHash,
      ],
    );
    expect(submitted).toMatchObject({
      succeeded: false,
      errorCode: "unresolved_legacy_release",
    });
  });

  it("does not grant browser table mutation privileges", async () => {
    const privileges = await client.query<{ allowed: boolean }>(
      `select has_table_privilege(
        'authenticated',
        'public.retention_legacy_reconciliation_cases',
        'INSERT,UPDATE,DELETE'
      ) allowed`,
    );
    expect(privileges.rows[0].allowed).toBe(false);
  });
});
