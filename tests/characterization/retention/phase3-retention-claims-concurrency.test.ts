import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE3_DB_URL
  ?? process.env.RETENTION_PHASE2_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "f3100000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "f3100000-0000-4000-8000-000000000010";
const PROJECT_ID = "f3100000-0000-4000-8000-000000000100";
const ORIGIN_ID = "f3100000-0000-4000-8000-000000001001";

type Header = {
  id: string;
  claimNumber: string;
  draftRevision: number;
  lastPositionStateHash: string;
};

type Result = {
  succeeded: boolean;
  errorCode: string | null;
  claim?: Header;
  allocationId?: string;
  eligibilityStateHash?: string;
};

describeDatabase("Retention Claim Phase 3 concurrency", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const first = new pg.Client({ connectionString: dbUrl });
  const second = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await Promise.all([setup.connect(), first.connect(), second.connect()]);
    await seedCommittedFixture();
    await Promise.all([
      configureActor(first),
      configureActor(second),
    ]);
  });

  afterAll(async () => {
    await teardownCommittedFixture();
    await Promise.all([setup.end(), first.end(), second.end()]);
  });

  async function configureActor(client: pg.Client) {
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

  async function createDraft(client: pg.Client, title: string) {
    const result = await client.query<{ result: Result }>(
      `select public.create_retention_claim_draft(
        $1, $2, null, '2026-07-01', '2026-07-31', 'phase3-concurrency'
      ) as result`,
      [PROJECT_ID, title],
    );
    return result.rows[0].result;
  }

  async function addAllocation(client: pg.Client, claim: Header, amount: number) {
    const result = await client.query<{ result: Result }>(
      `select public.add_retention_claim_allocation(
        $1, $2, $3, $4, null, 'phase3-concurrency-add'
      ) as result`,
      [claim.id, claim.draftRevision, ORIGIN_ID, amount],
    );
    return result.rows[0].result;
  }

  async function refresh(client: pg.Client, claim: Header) {
    const result = await client.query<{ result: Result }>(
      `select public.refresh_retention_claim_eligibility_state(
        $1, $2, 'phase3-concurrency-refresh'
      ) as result`,
      [claim.id, claim.draftRevision],
    );
    return result.rows[0].result;
  }

  async function submit(client: pg.Client, refreshed: Result) {
    const result = await client.query<{ result: Result }>(
      `select public.submit_retention_claim(
        $1, $2, $3, 'phase3-concurrency-submit', $4
      ) as result`,
      [
        refreshed.claim!.id,
        refreshed.claim!.draftRevision,
        refreshed.claim!.lastPositionStateHash,
        refreshed.eligibilityStateHash,
      ],
    );
    return result.rows[0].result;
  }

  async function seedCommittedFixture() {
    await setup.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data)
       values (
         $1, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'retention-phase3-concurrency@example.test', '',
         now(), '{}'::jsonb, '{}'::jsonb
       )`,
      [OWNER_ID],
    );
    await setup.query(
      "delete from public.organizations where created_by = $1",
      [OWNER_ID],
    );
    await setup.query(
      `insert into public.organizations (id, name, created_by)
       values ($1, 'Retention Phase 3 Concurrency', $2)`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_members
        (organization_id, user_id, role, display_name)
       values ($1, $2, 'owner', 'Concurrency Owner')`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await setup.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, project_code)
       values (
         $1, $2, $3, 'Retention Concurrency', 'retention-concurrency', 'P3C'
       )`,
      [PROJECT_ID, ORGANIZATION_ID, OWNER_ID],
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
       where organization_id = $1 and project_id = $3`,
      [ORGANIZATION_ID, OWNER_ID, PROJECT_ID],
    );
    await setup.query(
      `insert into public.project_claims (
        id, organization_id, project_id, created_by, claim_number, claim_title,
        claim_type, status, claim_date, claim_amount, retention_method,
        retention_percent, retention_withheld_amount, retention_released_amount,
        retention_held_to_date, retention_released_to_date, retention_balance,
        net_claim_excl_gst, gst_amount, total_payable, created_at, updated_at
      ) values (
        $1, $2, $3, $4, 'P3C-CL-01', 'Concurrent Origin',
        'Progress', 'Submitted', '2026-01-01', 1000, 'flat',
        10, 100, 0, 100, 0, 100, 900, 135, 1035,
        '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'
      )`,
      [ORIGIN_ID, ORGANIZATION_ID, PROJECT_ID, OWNER_ID],
    );
  }

  async function teardownCommittedFixture() {
    await setup.query("set session_replication_role = replica");
    await setup.query(
      "delete from public.retention_claim_events where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.retention_claim_allocations where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.retention_claims where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.project_retention_claim_counters where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.project_claims where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.project_retention_workflow_states where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.organization_capabilities where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.organization_members where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.organization_projects where organization_id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query(
      "delete from public.organizations where id = $1",
      [ORGANIZATION_ID],
    );
    await setup.query("delete from auth.users where id = $1", [OWNER_ID]);
    await setup.query("set session_replication_role = origin");
  }

  it("allocates distinct monotonically increasing numbers under concurrent creation", async () => {
    const [left, right] = await Promise.all([
      createDraft(first, "Concurrent Draft A"),
      createDraft(second, "Concurrent Draft B"),
    ]);
    expect(left.succeeded).toBe(true);
    expect(right.succeeded).toBe(true);
    expect(
      [left.claim?.claimNumber, right.claim?.claimNumber].sort(),
    ).toEqual(["P3C-RC-01", "P3C-RC-02"]);
  });

  it("serializes competing submissions and prevents double allocation", async () => {
    const leftDraft = await createDraft(first, "Competing Submission A");
    const rightDraft = await createDraft(second, "Competing Submission B");
    const leftAdded = await addAllocation(first, leftDraft.claim!, 70);
    const rightAdded = await addAllocation(second, rightDraft.claim!, 70);
    const leftRefreshed = await refresh(first, leftAdded.claim!);
    const rightRefreshed = await refresh(second, rightAdded.claim!);

    const results = await Promise.all([
      submit(first, leftRefreshed),
      submit(second, rightRefreshed),
    ]);
    expect(results.filter((result) => result.succeeded)).toHaveLength(1);
    expect(results.filter(
      (result) => [
        "retention_overallocated",
        "allocation_exceeds_eligibility",
        "stale_eligibility",
      ].includes(result.errorCode ?? ""),
    )).toHaveLength(1);

    const committed = await setup.query<{ total: string }>(
      `select coalesce(sum(allocation.allocation_amount), 0)::text as total
       from public.retention_claim_allocations allocation
       join public.retention_claims claim
         on claim.id = allocation.retention_claim_id
       where allocation.originating_payment_claim_id = $1
         and claim.status = 'submitted'`,
      [ORIGIN_ID],
    );
    expect(committed.rows[0].total).toBe("70.00");
  });
});
