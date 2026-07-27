import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_ROLLING_DB_URL
  ?? process.env.RETENTION_PHASE3_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "fa000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "fa000000-0000-4000-8000-000000000010";
const PROJECT_ID = "fa000000-0000-4000-8000-000000000100";
const CONCURRENT_PROJECT_ID = "fa000000-0000-4000-8000-000000000101";
const OTHER_OWNER_ID = randomUUID();
const OTHER_ORGANIZATION_ID = randomUUID();
const OTHER_PROJECT_ID = randomUUID();
const ORIGIN_IDS = [
  "fa000000-0000-4000-8000-000000001001",
  "fa000000-0000-4000-8000-000000001002",
  "fa000000-0000-4000-8000-000000001003",
  "fa000000-0000-4000-8000-000000001004",
  "fa000000-0000-4000-8000-000000001005",
  "fa000000-0000-4000-8000-000000001006",
] as const;
const LATE_ORIGIN_ID = "fa000000-0000-4000-8000-000000001007";

describeDatabase("automatic rolling Retention Claim database behavior", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const first = new pg.Client({ connectionString: dbUrl });
  const second = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await Promise.all([setup.connect(), first.connect(), second.connect()]);
    await cleanup();
    await seed();
    await Promise.all([configure(first), configure(second)]);
  });

  afterAll(async () => {
    await cleanup();
    await Promise.all([setup.end(), first.end(), second.end()]);
  });

  async function configure(client: pg.Client) {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [
      OWNER_ID,
    ]);
    await client.query(
      "select set_config('request.jwt.claim.role', 'authenticated', false)",
    );
    await client.query(
      "select set_config('request.jwt.claim.retention_phase3_internal', 'true', false)",
    );
    await client.query(
      "select set_config('request.jwt.claim.retention_phase4_internal', 'true', false)",
    );
    await client.query(
      "select set_config('request.jwt.claim.retention_phase5_internal', 'true', false)",
    );
    await client.query(
      "select set_config('request.jwt.claim.retention_phase6_internal', 'true', false)",
    );
  }

  async function seed() {
    await setup.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data)
       values (
         $1, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'rolling-retention@example.test', '', now(),
         '{}'::jsonb, '{}'::jsonb
       )`,
      [OWNER_ID],
    );
    await setup.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data)
       values (
         $1, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'other-retention@example.test', '', now(),
         '{}'::jsonb, '{}'::jsonb
       )`,
      [OTHER_OWNER_ID],
    );
    await setup.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[OWNER_ID, OTHER_OWNER_ID]],
    );
    await setup.query(
      `insert into public.organizations (id, name, created_by)
       values ($1, 'Rolling Retention Test', $2)`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_members
        (organization_id, user_id, role, display_name)
       values ($1, $2, 'owner', 'Rolling Owner')`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, project_code)
       values
        ($1, $3, $4, 'Rolling Retention', 'rolling-retention', 'ROLL'),
        ($2, $3, $4, 'Concurrent Rolling Retention', 'concurrent-rolling-retention', 'CONC')`,
      [PROJECT_ID, CONCURRENT_PROJECT_ID, ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.organizations (id, name, created_by)
       values ($1, 'Other Retention Tenant', $2)`,
      [OTHER_ORGANIZATION_ID, OTHER_OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_members
        (organization_id, user_id, role, display_name)
       values ($1, $2, 'owner', 'Other Owner')`,
      [OTHER_ORGANIZATION_ID, OTHER_OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, project_code)
       values ($1, $2, $3, 'Other Retention', 'other-retention', 'OTHER')`,
      [OTHER_PROJECT_ID, OTHER_ORGANIZATION_ID, OTHER_OWNER_ID],
    );
    await setup.query(
      `update public.organization_capabilities
       set enabled = true, enabled_by = $2, enabled_at = now(),
           disabled_by = null, disabled_at = null
       where organization_id = $1
         and capability_key = 'retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `update public.project_retention_workflow_states
       set mode = 'observe', changed_by = $2, changed_at = now()
       where organization_id = $1
         and project_id = any($3::uuid[])`,
      [ORGANIZATION_ID, OWNER_ID, [PROJECT_ID, CONCURRENT_PROJECT_ID]],
    );
    await setup.query(
      `insert into public.project_claims (
        id, organization_id, project_id, created_by, claim_number, claim_title,
        claim_type, status, claim_date, claim_amount, retention_method,
        retention_percent, retention_withheld_amount, retention_released_amount,
        retention_held_to_date, retention_released_to_date, retention_balance,
        net_claim_excl_gst, gst_amount, total_payable, created_at, updated_at
      ) values
        ($1,$7,$8,$9,'ROLL-CL-01','Origin 1','Progress','Draft','2026-01-01',1000,'flat',10,100,0,100,0,100,900,135,1035,'2026-01-01','2026-01-01'),
        ($2,$7,$8,$9,'ROLL-CL-02','Origin 2','Progress','Draft','2026-02-01',600,'flat',10,60,0,160,0,160,540,81,621,'2026-02-01','2026-02-01'),
        ($3,$7,$8,$9,'ROLL-CL-03','Origin 3','Progress','Draft','2026-03-01',500,'flat',10,50,0,210,0,210,450,67.5,517.5,'2026-03-01','2026-03-01'),
        ($4,$7,$8,$9,'ROLL-CL-04','No retention','Progress','Draft','2026-04-01',500,'flat',0,0,0,210,0,210,500,75,575,'2026-04-01','2026-04-01'),
        ($5,$7,$10,$9,'CONC-CL-01','Concurrent 1','Progress','Draft','2026-01-01',400,'flat',10,40,0,40,0,40,360,54,414,'2026-01-01','2026-01-01'),
        ($6,$7,$10,$9,'CONC-CL-02','Concurrent 2','Progress','Draft','2026-02-01',300,'flat',10,30,0,70,0,70,270,40.5,310.5,'2026-02-01','2026-02-01')`,
      [
        ...ORIGIN_IDS,
        ORGANIZATION_ID,
        PROJECT_ID,
        OWNER_ID,
        CONCURRENT_PROJECT_ID,
      ],
    );
    await configure(setup);
  }

  async function cleanup() {
    await setup.query("set session_replication_role = replica");
    await setup.query(
      "delete from public.organization_members where user_id = any($1::uuid[])",
      [[OWNER_ID, OTHER_OWNER_ID]],
    );
    await setup.query(
      "delete from public.organization_accounting_documents where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.organization_xero_connections where organization_id = $1",
      [ORGANIZATION_ID],
    );
    for (const table of [
      "retention_reminder_events",
      "retention_reminders",
      "retention_schedule_events",
      "project_retention_schedule_origins",
      "project_retention_release_schedules",
      "retention_rolling_draft_events",
      "retention_rolling_draft_jobs",
      "retention_rolling_draft_origins",
      "retention_claim_events",
      "retention_claim_allocations",
      "retention_claims",
      "project_retention_claim_counters",
      "project_claims",
      "project_retention_workflow_states",
      "organization_capabilities",
      "organization_projects",
    ]) {
      await setup.query(`delete from public.${table} where organization_id = $1`, [
        ORGANIZATION_ID,
      ]);
    }
    await setup.query(
      `delete from public.organizations
       where id = any($1::uuid[]) or created_by = any($2::uuid[])`,
      [
        [ORGANIZATION_ID, OTHER_ORGANIZATION_ID],
        [OWNER_ID, OTHER_OWNER_ID],
      ],
    );
    await setup.query(
      "delete from auth.users where id = any($1::uuid[])",
      [[OWNER_ID, OTHER_OWNER_ID]],
    );
    await setup.query("set session_replication_role = origin");
  }

  it("creates RC-01 at zero and rolls later confirmed origins into the same Draft idempotently", async () => {
    await setup.query("update public.project_claims set status = 'Submitted' where id = $1", [
      ORIGIN_IDS[0],
    ]);
    await setup.query("update public.project_claims set status = 'Submitted' where id = $1", [
      ORIGIN_IDS[1],
    ]);
    await setup.query("update public.project_claims set updated_at = updated_at where id = $1", [
      ORIGIN_IDS[0],
    ]);

    const claims = await setup.query<{
      id: string;
      claim_number: string;
      subtotal_excl_tax: string;
    }>(
      `select id, claim_number, subtotal_excl_tax::text
       from public.retention_claims
       where project_id = $1 and status = 'draft' and draft_kind = 'automatic_rolling'`,
      [PROJECT_ID],
    );
    expect(claims.rows).toHaveLength(1);
    expect(claims.rows[0]).toMatchObject({
      claim_number: "ROLL-RC-01",
      subtotal_excl_tax: "0.00",
    });

    const origins = await setup.query<{ originating_payment_claim_id: string }>(
      `select originating_payment_claim_id
       from public.retention_rolling_draft_origins
       where retention_claim_id = $1 order by origin_sequence`,
      [claims.rows[0].id],
    );
    expect(origins.rows.map((row) => row.originating_payment_claim_id)).toEqual([
      ORIGIN_IDS[0],
      ORIGIN_IDS[1],
    ]);
    const allocations = await setup.query<{ count: string }>(
      "select count(*)::text as count from public.retention_claim_allocations where retention_claim_id = $1",
      [claims.rows[0].id],
    );
    expect(allocations.rows[0].count).toBe("0");
  });

  it("saves the complete rolling Draft atomically with one revision increment", async () => {
    const createdSchedule = await setup.query<{
      result: {
        succeeded: boolean;
        schedule: { id: string; revision: number };
      };
    }>(
      `select public.create_retention_release_schedule($1::jsonb) as result`,
      [JSON.stringify({
        projectId: PROJECT_ID,
        name: "Whole-document eligible",
        triggerType: "fixed_date",
        entitlementMethod: "percentage",
        percentageBps: 10000,
        scheduledTriggerDate: "2026-01-01",
        confirmationRequired: false,
        scopePolicy: "all_current_origins",
      })],
    );
    expect(createdSchedule.rows[0].result.succeeded).toBe(true);
    const scheduleId = createdSchedule.rows[0].result.schedule.id;
    let scheduleRevision = createdSchedule.rows[0].result.schedule.revision;
    const scheduled = await setup.query<{
      result: { succeeded: boolean; schedule: { revision: number } };
    }>(
      "select public.update_retention_release_schedule_draft($1::jsonb) as result",
      [JSON.stringify({
        scheduleId,
        expectedRevision: scheduleRevision,
        status: "scheduled",
      })],
    );
    scheduleRevision = scheduled.rows[0].result.schedule.revision;
    const activated = await setup.query<{ result: { succeeded: boolean } }>(
      "select public.activate_retention_release_schedule($1::jsonb) as result",
      [JSON.stringify({ scheduleId, expectedRevision: scheduleRevision })],
    );
    expect(activated.rows[0].result.succeeded).toBe(true);

    const draft = await setup.query<{
      id: string;
      draft_revision: string;
    }>(
      `select id, draft_revision::text
       from public.retention_claims
       where project_id = $1 and status = 'draft' and draft_kind = 'automatic_rolling'`,
      [PROJECT_ID],
    );
    const position = await setup.query<{ result: { stateHash: string } }>(
      "select public.get_project_retention_position_summary($1) as result",
      [PROJECT_ID],
    );
    const eligibility = await setup.query<{
      result: { eligibilityStateHash: string };
    }>(
      "select public.get_project_retention_eligibility($1) as result",
      [PROJECT_ID],
    );
    const membership = await setup.query<{
      result: {
        originSetHash: string;
        originStateHashes: Record<string, string>;
      };
    }>(
      "select public.get_retention_claim_draft_origin_set_hash($1) as result",
      [draft.rows[0].id],
    );
    const rolling = await setup.query<{
      result: {
        origins: Array<{
          id: string;
          originatingPaymentClaimId: string;
          originSequence: number;
          latestOriginStateHash: string;
        }>;
      };
    }>(
      "select public.get_retention_rolling_draft_origins($1) as result",
      [draft.rows[0].id],
    );
    const lines = rolling.rows[0].result.origins.map((origin, index) => ({
      originatingPaymentClaimId: origin.originatingPaymentClaimId,
      candidateId: origin.id,
      existingAllocationId: null,
      expectedOriginStateHash:
        membership.rows[0].result.originStateHashes[
          origin.originatingPaymentClaimId
        ],
      sequence: origin.originSequence,
      proposedAmountCents: index === 0 ? 2500 : 1500,
    }));
    const saveArgs = [
      draft.rows[0].id,
      Number(draft.rows[0].draft_revision),
      "Whole document",
      "WD-1",
      "2026-06-01",
      "2026-07-01",
      position.rows[0].result.stateHash,
      eligibility.rows[0].result.eligibilityStateHash,
      membership.rows[0].result.originSetHash,
      JSON.stringify(lines),
      "whole-document-save",
    ] as const;
    const saved = await setup.query<{
      result: {
        succeeded: boolean;
        errorCode?: string;
        details?: unknown;
        changed: boolean;
        draftRevision: number;
        totals: { thisClaimCents: number };
        lines: Array<Record<string, unknown>>;
      };
    }>(
      `select public.save_retention_claim_draft_document(
        $1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10::jsonb,$11
      ) as result`,
      [...saveArgs],
    );
    if (!saved.rows[0].result.succeeded) {
      throw new Error(`Whole-document save rejected: ${JSON.stringify(saved.rows[0].result)}`);
    }
    expect(saved.rows[0].result).toMatchObject({
      succeeded: true,
      changed: true,
      draftRevision: Number(draft.rows[0].draft_revision) + 1,
      totals: { thisClaimCents: 4000 },
    });
    const persisted = await setup.query<{
      title: string;
      draft_revision: string;
      subtotal_excl_tax: string;
      allocations: string;
    }>(
      `select claim.title, claim.draft_revision::text,
        claim.subtotal_excl_tax::text,
        count(allocation.id)::text as allocations
       from public.retention_claims claim
       left join public.retention_claim_allocations allocation
         on allocation.retention_claim_id = claim.id
       where claim.id = $1
       group by claim.id`,
      [draft.rows[0].id],
    );
    expect(persisted.rows[0]).toEqual({
      title: "Whole document",
      draft_revision: String(Number(draft.rows[0].draft_revision) + 1),
      subtotal_excl_tax: "0.00",
      allocations: "2",
    });
    const repeated = await setup.query<{
      result: {
        succeeded: boolean;
        changed: boolean;
        draftRevision: number;
      };
    }>(
      `select public.save_retention_claim_draft_document(
        $1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10::jsonb,$11
      ) as result`,
      [
        saveArgs[0],
        saved.rows[0].result.draftRevision,
        ...saveArgs.slice(2, 9),
        JSON.stringify(saved.rows[0].result.lines.map((line) => ({
          originatingPaymentClaimId: line.originatingPaymentClaimId,
          candidateId: line.candidateId,
          existingAllocationId: line.existingAllocationId,
          expectedOriginStateHash: line.expectedOriginStateHash,
          sequence: line.sequence,
          proposedAmountCents: line.proposedAmountCents,
        }))),
        saveArgs[10],
      ],
    );
    expect(repeated.rows[0].result).toMatchObject({
      succeeded: true,
      changed: false,
      draftRevision: saved.rows[0].result.draftRevision,
    });
    const saveEvents = await setup.query<{ count: string }>(
      `select count(*)::text count
       from public.retention_claim_events
       where retention_claim_id=$1 and event_type='draft_document_saved'`,
      [draft.rows[0].id],
    );
    expect(saveEvents.rows[0].count).toBe("1");

    const rejected = await setup.query<{
      result: { succeeded: boolean; errorCode: string };
    }>(
      `select public.save_retention_claim_draft_document(
        $1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10::jsonb,$11
      ) as result`,
      [
        ...saveArgs.slice(0, 2),
        "Stale overwrite",
        ...saveArgs.slice(3),
      ],
    );
    expect(rejected.rows[0].result).toMatchObject({
      succeeded: false,
      errorCode: "concurrent_update",
    });
    const unchanged = await setup.query<{ title: string; subtotal_excl_tax: string }>(
      "select title, subtotal_excl_tax::text from public.retention_claims where id = $1",
      [draft.rows[0].id],
    );
    expect(unchanged.rows[0]).toEqual({
      title: "Whole document",
      subtotal_excl_tax: "0.00",
    });

    const concurrentDraft = await setup.query<{
      draft_revision: string;
    }>(
      "select draft_revision::text from public.retention_claims where id = $1",
      [draft.rows[0].id],
    );
    const currentMembership = await setup.query<{
      result: {
        originSetHash: string;
        originStateHashes: Record<string, string>;
      };
    }>(
      "select public.get_retention_claim_draft_origin_set_hash($1) as result",
      [draft.rows[0].id],
    );
    const currentRolling = await setup.query<{
      result: {
        origins: Array<{
          id: string;
          originatingPaymentClaimId: string;
          originSequence: number;
          allocationId: string;
        }>;
      };
    }>(
      "select public.get_retention_rolling_draft_origins($1) as result",
      [draft.rows[0].id],
    );
    const concurrentLines = currentRolling.rows[0].result.origins.map(
      (origin, index) => ({
        originatingPaymentClaimId: origin.originatingPaymentClaimId,
        candidateId: origin.id,
        existingAllocationId: origin.allocationId,
        expectedOriginStateHash:
          currentMembership.rows[0].result.originStateHashes[
            origin.originatingPaymentClaimId
          ],
        sequence: origin.originSequence,
        proposedAmountCents: index === 0 ? 2600 : 1600,
      }),
    );
    const concurrentArgs = (title: string) => [
      draft.rows[0].id,
      Number(concurrentDraft.rows[0].draft_revision),
      title,
      "WD-CONCURRENT",
      "2026-06-01",
      "2026-07-01",
      position.rows[0].result.stateHash,
      eligibility.rows[0].result.eligibilityStateHash,
      currentMembership.rows[0].result.originSetHash,
      JSON.stringify(concurrentLines),
      `whole-document-${title}`,
    ];
    const statement = `select public.save_retention_claim_draft_document(
      $1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10::jsonb,$11
    ) as result`;
    const concurrentResults = await Promise.all([
      first.query<{ result: { succeeded: boolean; errorCode: string | null } }>(
        statement,
        concurrentArgs("Concurrent A"),
      ),
      second.query<{ result: { succeeded: boolean; errorCode: string | null } }>(
        statement,
        concurrentArgs("Concurrent B"),
      ),
    ]);
    expect(
      concurrentResults.filter((result) => result.rows[0].result.succeeded),
    ).toHaveLength(1);
    expect(
      concurrentResults
        .filter((result) => !result.rows[0].result.succeeded)
        .map((result) => result.rows[0].result.errorCode),
    ).toEqual(["concurrent_update"]);
    const finalRevision = await setup.query<{ draft_revision: string }>(
      "select draft_revision::text from public.retention_claims where id = $1",
      [draft.rows[0].id],
    );
    expect(Number(finalRevision.rows[0].draft_revision)).toBe(
      Number(concurrentDraft.rows[0].draft_revision) + 1,
    );
    const resetLines = concurrentLines.map((line, index) => ({
      ...line,
      proposedAmountCents: index === 0 ? 0 : 1600,
    }));
    const reset = await setup.query<{
      result: { succeeded: boolean; draftRevision: number };
    }>(
      statement,
      [
        draft.rows[0].id,
        Number(finalRevision.rows[0].draft_revision),
        "Reset one line",
        "WD-RESET",
        "2026-06-01",
        "2026-07-01",
        position.rows[0].result.stateHash,
        eligibility.rows[0].result.eligibilityStateHash,
        currentMembership.rows[0].result.originSetHash,
        JSON.stringify(resetLines),
        "whole-document-reset",
      ],
    );
    expect(reset.rows[0].result.succeeded).toBe(true);
    const afterReset = await setup.query<{
      allocations: string;
      candidates: string;
    }>(
      `select
        (select count(*) from public.retention_claim_allocations
          where retention_claim_id=$1)::text allocations,
        (select count(*) from public.retention_rolling_draft_origins
          where retention_claim_id=$1)::text candidates`,
      [draft.rows[0].id],
    );
    expect(afterReset.rows[0]).toEqual({
      allocations: "1",
      candidates: "2",
    });
  });

  it("does not create a candidate for a confirmed Payment Claim without retention", async () => {
    await setup.query("update public.project_claims set status = 'Submitted' where id = $1", [
      ORIGIN_IDS[3],
    ]);
    const result = await setup.query<{ count: string }>(
      "select count(*)::text as count from public.retention_rolling_draft_origins where originating_payment_claim_id = $1",
      [ORIGIN_IDS[3]],
    );
    expect(result.rows[0].count).toBe("0");
  });

  it("serializes concurrent confirmations into one automatic Draft", async () => {
    await Promise.all([
      first.query("update public.project_claims set status = 'Submitted' where id = $1", [
        ORIGIN_IDS[4],
      ]),
      second.query("update public.project_claims set status = 'Submitted' where id = $1", [
        ORIGIN_IDS[5],
      ]),
    ]);
    const result = await setup.query<{ drafts: string; origins: string }>(
      `select
        count(distinct claim.id)::text as drafts,
        count(candidate.id)::text as origins
       from public.retention_claims claim
       left join public.retention_rolling_draft_origins candidate
         on candidate.retention_claim_id = claim.id
       where claim.project_id = $1
         and claim.status = 'draft'
         and claim.draft_kind = 'automatic_rolling'`,
      [CONCURRENT_PROJECT_ID],
    );
    expect(result.rows[0]).toEqual({ drafts: "1", origins: "2" });
  });

  it("rejects the entire stale document when a newly confirmed origin joins", async () => {
    const draft = await setup.query<{ id: string; draft_revision: string; title: string }>(
      `select id,draft_revision::text,title
       from public.retention_claims
       where project_id=$1 and status='draft' and draft_kind='automatic_rolling'`,
      [CONCURRENT_PROJECT_ID],
    );
    const membership = await setup.query<{
      result: {
        originSetHash: string;
        originStateHashes: Record<string, string>;
      };
    }>(
      "select public.get_retention_claim_draft_origin_set_hash($1) result",
      [draft.rows[0].id],
    );
    const rolling = await setup.query<{
      result: {
        origins: Array<{
          id: string;
          originatingPaymentClaimId: string;
          originSequence: number;
        }>;
      };
    }>(
      "select public.get_retention_rolling_draft_origins($1) result",
      [draft.rows[0].id],
    );
    const position = await setup.query<{ result: { stateHash: string } }>(
      "select public.get_project_retention_position_summary($1) result",
      [CONCURRENT_PROJECT_ID],
    );
    const eligibility = await setup.query<{
      result: { eligibilityStateHash: string };
    }>(
      "select public.get_project_retention_eligibility($1) result",
      [CONCURRENT_PROJECT_ID],
    );
    await setup.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,
        claim_type,status,claim_date,claim_amount,retention_method,
        retention_percent,retention_withheld_amount,retention_released_amount,
        retention_held_to_date,retention_released_to_date,retention_balance,
        net_claim_excl_gst,gst_amount,total_payable
      ) values(
        $1,$2,$3,$4,'CONC-CL-03','Late origin','Progress','Draft','2026-03-01',
        200,'flat',10,20,0,90,0,90,180,27,207
      )`,
      [LATE_ORIGIN_ID, ORGANIZATION_ID, CONCURRENT_PROJECT_ID, OWNER_ID],
    );
    await setup.query(
      "update public.project_claims set status='Submitted' where id=$1",
      [LATE_ORIGIN_ID],
    );
    const rejected = await setup.query<{
      result: { succeeded: boolean; errorCode: string };
    }>(
      `select public.save_retention_claim_draft_document(
        $1,$2,'Must not persist',null,null,null,$3,$4,$5,$6::jsonb,'late-origin'
      ) result`,
      [
        draft.rows[0].id,
        Number(draft.rows[0].draft_revision),
        position.rows[0].result.stateHash,
        eligibility.rows[0].result.eligibilityStateHash,
        membership.rows[0].result.originSetHash,
        JSON.stringify(rolling.rows[0].result.origins.map((origin) => ({
          originatingPaymentClaimId: origin.originatingPaymentClaimId,
          candidateId: origin.id,
          existingAllocationId: null,
          expectedOriginStateHash:
            membership.rows[0].result.originStateHashes[
              origin.originatingPaymentClaimId
            ],
          sequence: origin.originSequence,
          proposedAmountCents: 0,
        }))),
      ],
    );
    expect(rejected.rows[0].result).toMatchObject({
      succeeded: false,
      errorCode: "concurrent_update",
    });
    const unchanged = await setup.query<{ title: string; allocations: string }>(
      `select claim.title,count(allocation.id)::text allocations
       from public.retention_claims claim
       left join public.retention_claim_allocations allocation
         on allocation.retention_claim_id=claim.id
       where claim.id=$1 group by claim.id`,
      [draft.rows[0].id],
    );
    expect(unchanged.rows[0]).toEqual({
      title: draft.rows[0].title,
      allocations: "0",
    });
  });

  it("keeps cancelled numbering historical and creates RC-02 for the next confirmation", async () => {
    const current = await setup.query<{ id: string; draft_revision: string }>(
      `select id, draft_revision::text
       from public.retention_claims
       where project_id = $1 and status = 'draft' and draft_kind = 'automatic_rolling'`,
      [PROJECT_ID],
    );
    const cancelled = await setup.query<{ result: { succeeded: boolean } }>(
      "select public.cancel_retention_claim_draft($1,$2,'Test cancellation','rolling-cancel') as result",
      [current.rows[0].id, Number(current.rows[0].draft_revision)],
    );
    expect(cancelled.rows[0].result.succeeded).toBe(true);

    await setup.query("update public.project_claims set status = 'Submitted' where id = $1", [
      ORIGIN_IDS[2],
    ]);
    const claims = await setup.query<{ claim_number: string; status: string }>(
      `select claim_number, status from public.retention_claims
       where project_id = $1 order by created_at, id`,
      [PROJECT_ID],
    );
    expect(claims.rows).toEqual([
      { claim_number: "ROLL-RC-01", status: "cancelled_draft" },
      { claim_number: "ROLL-RC-02", status: "draft" },
    ]);
  });

  it("returns deterministic historical origin counts and permission-gated Xero state in one project read", async () => {
    const cancelled = await setup.query<{ id: string }>(
      `select id
       from public.retention_claims
       where project_id = $1 and claim_number = 'ROLL-RC-01'`,
      [PROJECT_ID],
    );
    const connection = await setup.query<{ id: string }>(
      `insert into public.organization_xero_connections(
         organization_id, status, tenant_id, tenant_name, scope,
         connected_by_user_id
       )
       values($1, 'connected', 'retention-register-tenant', 'Register Tenant',
         array['accounting.transactions'], $2)
       returning id`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_accounting_documents(
         organization_id, accounting_connection_id, provider, tenant_id,
         local_document_type, local_document_id, project_claim_id,
         retention_claim_id, export_status
       )
       values($1, $2, 'xero', 'retention-register-tenant',
         'retention_claim', null, null, $3, 'exported')`,
      [ORGANIZATION_ID, connection.rows[0].id, cancelled.rows[0].id],
    );

    const visible = await setup.query<{
      result: {
        succeeded: boolean;
        xeroVisible: boolean;
        claims: Array<{
          claim: { claimNumber: string };
          originCount: number;
          paidAmount: number;
          outstandingAmount: number;
          xeroStatus: string | null;
        }>;
      };
    }>(
      "select public.get_project_retention_claim_history($1) as result",
      [PROJECT_ID],
    );
    expect(visible.rows[0].result).toMatchObject({
      succeeded: true,
      xeroVisible: true,
      claims: [{
        claim: { claimNumber: "ROLL-RC-01" },
        originCount: 2,
        paidAmount: 0,
        outstandingAmount: 0,
        xeroStatus: "exported",
      }],
    });

    await setup.query("begin");
    try {
      await setup.query(
        `update public.role_permissions
         set is_allowed = false
         where role = 'owner'
           and permission_key = 'retention.claims.xero.view'`,
      );
      const hidden = await setup.query<{
        result: {
          xeroVisible: boolean;
          claims: Array<{ xeroStatus: string | null }>;
        };
      }>(
        "select public.get_project_retention_claim_history($1) as result",
        [PROJECT_ID],
      );
      expect(hidden.rows[0].result.xeroVisible).toBe(false);
      expect(hidden.rows[0].result.claims[0].xeroStatus).toBeNull();
    } finally {
      await setup.query("rollback");
    }

    const crossTenant = await setup.query<{
      result: { succeeded: boolean; claims: unknown[] };
    }>(
      "select public.get_project_retention_claim_history($1) as result",
      [OTHER_PROJECT_ID],
    );
    expect(crossTenant.rows[0].result.succeeded).toBe(false);
    expect(crossTenant.rows[0].result.claims).toEqual([]);
  });

  it("does not create draft accounting, document, Xero or payment evidence", async () => {
    const result = await setup.query<{
      accounting: string;
      documents: string;
      payments: string;
    }>(
      `select
        (select count(*) from public.retention_claim_accounting_snapshots where organization_id = $1)::text as accounting,
        (select count(*) from public.retention_claim_documents where organization_id = $1)::text as documents,
        (select count(*) from public.retention_claim_payment_reconciliations where organization_id = $1)::text as payments`,
      [ORGANIZATION_ID],
    );
    expect(result.rows[0]).toEqual({
      accounting: "0",
      documents: "0",
      payments: "0",
    });
  });

  it("creates one empty-allocation successor release cycle after automatic submission", async () => {
    const draft = await setup.query<{ id: string; draft_revision: string }>(
      `select id,draft_revision::text
       from public.retention_claims
       where project_id=$1 and claim_number='ROLL-RC-02' and status='draft'`,
      [PROJECT_ID],
    );
    const membership = await setup.query<{
      result: {
        originSetHash: string;
        originStateHashes: Record<string, string>;
      };
    }>(
      "select public.get_retention_claim_draft_origin_set_hash($1) result",
      [draft.rows[0].id],
    );
    const rolling = await setup.query<{
      result: {
        origins: Array<{
          id: string;
          originatingPaymentClaimId: string;
          originSequence: number;
        }>;
      };
    }>(
      "select public.get_retention_rolling_draft_origins($1) result",
      [draft.rows[0].id],
    );
    const position = await setup.query<{ result: { stateHash: string } }>(
      "select public.get_project_retention_position_summary($1) result",
      [PROJECT_ID],
    );
    const eligibility = await setup.query<{
      result: { eligibilityStateHash: string };
    }>(
      "select public.get_project_retention_eligibility($1) result",
      [PROJECT_ID],
    );
    const lines = rolling.rows[0].result.origins.map((origin) => ({
      originatingPaymentClaimId: origin.originatingPaymentClaimId,
      candidateId: origin.id,
      existingAllocationId: null,
      expectedOriginStateHash:
        membership.rows[0].result.originStateHashes[
          origin.originatingPaymentClaimId
        ],
      sequence: origin.originSequence,
      proposedAmountCents: 1000,
    }));
    const saved = await setup.query<{
      result: {
        succeeded: boolean;
        draftRevision: number;
        positionStateHash: string;
        eligibilityStateHash: string;
      };
    }>(
      `select public.save_retention_claim_draft_document(
        $1,$2,'Release cycle',null,null,null,$3,$4,$5,$6::jsonb,'successor-save'
      ) result`,
      [
        draft.rows[0].id,
        Number(draft.rows[0].draft_revision),
        position.rows[0].result.stateHash,
        eligibility.rows[0].result.eligibilityStateHash,
        membership.rows[0].result.originSetHash,
        JSON.stringify(lines),
      ],
    );
    expect(saved.rows[0].result.succeeded).toBe(true);
    type SubmitResult = {
      succeeded: boolean;
      errorCode?: string;
      successorDraft?: {
        created: boolean;
        retentionClaimId: string;
        originCount: number;
      };
    };
    const race = await Promise.all([
      first.query<{ result: { succeeded: boolean; errorCode?: string } }>(
        `select public.save_retention_claim_draft_document(
          $1,$2,'Race edit',null,null,null,$3,$4,$5,$6::jsonb,'save-submit-race'
        ) result`,
        [
          draft.rows[0].id,
          saved.rows[0].result.draftRevision,
          saved.rows[0].result.positionStateHash,
          saved.rows[0].result.eligibilityStateHash,
          membership.rows[0].result.originSetHash,
          JSON.stringify(lines),
        ],
      ),
      second.query<{ result: SubmitResult }>(
        "select public.submit_retention_claim($1,$2,$3,'successor-submit-race',$4) result",
        [
          draft.rows[0].id,
          saved.rows[0].result.draftRevision,
          saved.rows[0].result.positionStateHash,
          saved.rows[0].result.eligibilityStateHash,
        ],
      ),
    ]);
    expect(
      Number(race[0].rows[0].result.succeeded) +
        Number(race[1].rows[0].result.succeeded),
    ).toBe(1);
    let submission = race[1].rows[0].result;
    if (!submission.succeeded) {
      expect(["concurrent_update", "claim_not_draft"]).toContain(
        submission.errorCode,
      );
      const refreshed = await setup.query<{
        draft_revision: string;
        last_position_state_hash: string;
        last_eligibility_state_hash: string;
      }>(
        `select draft_revision::text,last_position_state_hash,
          last_eligibility_state_hash
         from public.retention_claims where id=$1`,
        [draft.rows[0].id],
      );
      const submitted = await setup.query<{ result: SubmitResult }>(
        "select public.submit_retention_claim($1,$2,$3,'successor-submit',$4) result",
        [
          draft.rows[0].id,
          Number(refreshed.rows[0].draft_revision),
          refreshed.rows[0].last_position_state_hash,
          refreshed.rows[0].last_eligibility_state_hash,
        ],
      );
      submission = submitted.rows[0].result;
    }
    expect(submission).toMatchObject({
      succeeded: true,
      successorDraft: { created: true, originCount: 3 },
    });
    const successor = await setup.query<{
      claim_number: string;
      status: string;
      allocations: string;
      origins: string;
    }>(
      `select claim.claim_number,claim.status,
        count(distinct allocation.id)::text allocations,
        count(distinct candidate.id)::text origins
       from public.retention_claims claim
       left join public.retention_claim_allocations allocation
         on allocation.retention_claim_id=claim.id
       left join public.retention_rolling_draft_origins candidate
         on candidate.retention_claim_id=claim.id
       where claim.id=$1
       group by claim.id`,
      [submission.successorDraft?.retentionClaimId],
    );
    expect(successor.rows[0]).toEqual({
      claim_number: "ROLL-RC-03",
      status: "draft",
      allocations: "0",
      origins: "3",
    });
  });
});
