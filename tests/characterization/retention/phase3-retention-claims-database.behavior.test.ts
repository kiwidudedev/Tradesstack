import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE3_DB_URL
  ?? process.env.RETENTION_PHASE2_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "f3000000-0000-4000-8000-000000000001";
const QS_ID = "f3000000-0000-4000-8000-000000000002";
const OTHER_OWNER_ID = "f3000000-0000-4000-8000-000000000003";
const ORGANIZATION_ID = "f3000000-0000-4000-8000-000000000010";
const OTHER_ORGANIZATION_ID = "f3000000-0000-4000-8000-000000000011";
const PROJECT_ID = "f3000000-0000-4000-8000-000000000100";
const SAME_ORG_PROJECT_ID = "f3000000-0000-4000-8000-000000000101";
const LEGACY_PROJECT_ID = "f3000000-0000-4000-8000-000000000102";
const OTHER_PROJECT_ID = "f3000000-0000-4000-8000-000000000103";
const SCALE_PROJECT_ID = "f3000000-0000-4000-8000-000000000104";
const ORIGIN_A_ID = "f3000000-0000-4000-8000-000000001001";
const ORIGIN_B_ID = "f3000000-0000-4000-8000-000000001002";
const CANCELLED_ORIGIN_ID = "f3000000-0000-4000-8000-000000001003";
const CROSS_PROJECT_ORIGIN_ID = "f3000000-0000-4000-8000-000000001004";
const LEGACY_ORIGIN_ID = "f3000000-0000-4000-8000-000000001005";

type Header = {
  id: string;
  claimNumber: string;
  status: string;
  draftRevision: number;
  subtotalExclTax: number;
  lastPositionStateHash: string;
  submissionStateHash: string | null;
};

type RpcResult = {
  succeeded: boolean;
  errorCode: string | null;
  claim?: Header;
  allocationId?: string;
  allocations?: Array<Record<string, unknown>>;
  details?: Record<string, unknown>;
  currentDraftRevision?: number;
  events?: Array<Record<string, unknown>>;
};

describeDatabase("Retention Claim Phase 3 database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  let submittedClaimId = "";
  let submittedStateHash = "";

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await seedIdentityAndProjects();
    await seedPaymentClaimOrigins();
    await asUser(OWNER_ID, true);
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function asUser(userId: string | null, internalGate: boolean) {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    await client.query(
      "select set_config('request.jwt.claim.role', $1, true)",
      [userId ? "authenticated" : ""],
    );
    await client.query(
      "select set_config('request.jwt.claim.retention_phase3_internal', $1, true)",
      [internalGate ? "true" : "false"],
    );
  }

  async function expectDatabaseError(
    action: () => Promise<unknown>,
    message: string,
  ) {
    await client.query("savepoint phase3_expected_error");
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    await client.query("rollback to savepoint phase3_expected_error");
    await client.query("release savepoint phase3_expected_error");
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(message);
  }

  async function createDraft(
    projectId = PROJECT_ID,
    title = "Retention Claim Draft",
  ) {
    const result = await client.query<{ result: RpcResult }>(
      `select public.create_retention_claim_draft(
        $1, $2, 'RC reference', '2026-06-01', '2026-06-30', 'phase3-create'
      ) as result`,
      [projectId, title],
    );
    return result.rows[0].result;
  }

  async function addAllocation(
    claim: Header,
    originId: string,
    amount: number,
    sequence: number | null = null,
  ) {
    const result = await client.query<{ result: RpcResult }>(
      `select public.add_retention_claim_allocation(
        $1, $2, $3, $4, $5, 'phase3-add'
      ) as result`,
      [claim.id, claim.draftRevision, originId, amount, sequence],
    );
    return result.rows[0].result;
  }

  async function submitClaim(claim: Header, stateHash = claim.lastPositionStateHash) {
    const result = await client.query<{ result: RpcResult }>(
      `select public.submit_retention_claim(
        $1, $2, $3, 'phase3-submit'
      ) as result`,
      [claim.id, claim.draftRevision, stateHash],
    );
    return result.rows[0].result;
  }

  async function readClaim(claimId: string) {
    const result = await client.query<{ result: RpcResult }>(
      "select public.get_retention_claim($1) as result",
      [claimId],
    );
    return result.rows[0].result;
  }

  async function seedIdentityAndProjects() {
    await client.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data)
       values
        ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'retention-phase3-owner@example.test', '', now(),
         '{}'::jsonb, '{}'::jsonb),
        ($2, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'retention-phase3-qs@example.test', '', now(),
         '{}'::jsonb, '{}'::jsonb),
        ($3, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'retention-phase3-other@example.test', '', now(),
         '{}'::jsonb, '{}'::jsonb)`,
      [OWNER_ID, QS_ID, OTHER_OWNER_ID],
    );
    await client.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[OWNER_ID, QS_ID, OTHER_OWNER_ID]],
    );
    await client.query(
      `insert into public.organizations (id, name, created_by)
       values
        ($1, 'Retention Phase 3', $3),
        ($2, 'Retention Phase 3 Other', $4)`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_members
        (organization_id, user_id, role, display_name)
       values
        ($1, $3, 'owner', 'Retention Owner'),
        ($1, $4, 'qs', 'Retention QS'),
        ($2, $5, 'owner', 'Other Retention Owner')`,
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
        (id, organization_id, created_by, name, slug, project_code)
       values
        ($1, $5, $7, 'Retention Claim Project', 'retention-claim', 'P3'),
        ($2, $5, $7, 'Same Organization Project', 'same-org-retention', 'P3-B'),
        ($3, $5, $7, 'Legacy Release Project', 'legacy-retention', 'P3-L'),
        ($4, $6, $8, 'Other Retention Project', 'other-retention', 'P3-O'),
        ($9, $5, $7, 'Scale Retention Project', 'scale-retention', 'P3-S')`,
      [
        PROJECT_ID,
        SAME_ORG_PROJECT_ID,
        LEGACY_PROJECT_ID,
        OTHER_PROJECT_ID,
        ORGANIZATION_ID,
        OTHER_ORGANIZATION_ID,
        OWNER_ID,
        OTHER_OWNER_ID,
        SCALE_PROJECT_ID,
      ],
    );
    await client.query(
      `update public.organization_capabilities
       set enabled = true, enabled_by = $2, enabled_at = now(),
           disabled_by = null, disabled_at = null
       where organization_id = $1
         and capability_key = 'retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    await client.query(
      `update public.project_retention_workflow_states
       set mode = 'observe', changed_by = $2, changed_at = now()
       where organization_id = $1
         and project_id = any($3::uuid[])`,
      [
        ORGANIZATION_ID,
        OWNER_ID,
        [PROJECT_ID, SAME_ORG_PROJECT_ID, LEGACY_PROJECT_ID, SCALE_PROJECT_ID],
      ],
    );
  }

  async function seedPaymentClaimOrigins() {
    await client.query(
      `insert into public.project_claims (
        id, organization_id, project_id, created_by, claim_number, claim_title,
        claim_type, status, claim_date, due_date, claim_amount,
        retention_method, retention_percent, retention_scale_bands,
        retention_withheld_amount, retention_released_amount,
        retention_held_to_date, retention_released_to_date, retention_balance,
        net_claim_excl_gst, gst_amount, total_payable, created_at, updated_at
      ) values
        ($1, $6, $7, $8, 'P3-CL-01', 'Origin A', 'Progress', 'Submitted',
         '2026-01-01', '2026-02-01', 1000, 'flat', 10, null,
         100, 0, 100, 0, 100, 900, 135, 1035,
         '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'),
        ($2, $6, $7, $8, 'P3-CL-02', 'Origin B', 'Progress', 'Paid',
         '2026-02-01', '2026-03-01', 600, 'sliding_scale', 10,
         '[{"upTo":600,"rate":10}]'::jsonb,
         60, 0, 160, 0, 160, 540, 81, 621,
         '2026-02-01T00:00:00Z', '2026-02-01T01:00:00Z'),
        ($3, $6, $7, $8, 'P3-CL-03', 'Cancelled Origin', 'Progress', 'Cancelled',
         '2026-03-01', '2026-04-01', 500, 'flat', 10, null,
         50, 0, 160, 0, 160, 450, 67.50, 517.50,
         '2026-03-01T00:00:00Z', '2026-03-01T01:00:00Z'),
        ($4, $6, $9, $8, 'P3B-CL-01', 'Cross Project Origin', 'Progress', 'Submitted',
         '2026-01-01', '2026-02-01', 500, 'flat', 10, null,
         50, 0, 50, 0, 50, 450, 67.50, 517.50,
         '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'),
        ($5, $6, $10, $8, 'P3L-CL-01', 'Legacy Origin', 'Progress', 'Submitted',
         '2026-01-01', '2026-02-01', 1000, 'flat', 10, null,
         100, 10, 100, 10, 90, 910, 136.50, 1046.50,
         '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z')`,
      [
        ORIGIN_A_ID,
        ORIGIN_B_ID,
        CANCELLED_ORIGIN_ID,
        CROSS_PROJECT_ORIGIN_ID,
        LEGACY_ORIGIN_ID,
        ORGANIZATION_ID,
        PROJECT_ID,
        OWNER_ID,
        SAME_ORG_PROJECT_ID,
        LEGACY_PROJECT_ID,
      ],
    );
    await client.query(
      `insert into public.project_claims (
        organization_id, project_id, created_by, claim_number, claim_title,
        claim_type, status, claim_date, claim_amount, retention_method,
        retention_percent, retention_withheld_amount, retention_released_amount,
        retention_held_to_date, retention_released_to_date, retention_balance,
        net_claim_excl_gst, gst_amount, total_payable, created_at, updated_at
      )
      select
        $1, $2, $3,
        'P3S-CL-' || lpad(series::text, 3, '0'),
        'Scale Origin ' || series,
        'Progress', 'Submitted', date '2025-01-01' + (series - 1),
        10, 'flat', 10, 1, 0, series, 0, series,
        9, 1.35, 10.35,
        timestamptz '2025-01-01T00:00:00Z' + ((series - 1) || ' days')::interval,
        timestamptz '2025-01-01T01:00:00Z' + ((series - 1) || ' days')::interval
      from generate_series(1, 220) series`,
      [ORGANIZATION_ID, SCALE_PROJECT_ID, OWNER_ID],
    );
  }

  it("creates independently numbered Drafts, never reuses cancelled numbers, and supports optimistic edits", async () => {
    const first = await createDraft(PROJECT_ID, "First Retention Claim");
    expect(first).toMatchObject({
      succeeded: true,
      claim: {
        claimNumber: "P3-RC-01",
        status: "draft",
        draftRevision: 1,
        subtotalExclTax: 0,
      },
    });
    expect(first.claim?.lastPositionStateHash).toMatch(/^[a-f0-9]{64}$/);

    const second = await createDraft(PROJECT_ID, "Cancelled Number");
    expect(second.claim?.claimNumber).toBe("P3-RC-02");
    const cancelled = await client.query<{ result: RpcResult }>(
      `select public.cancel_retention_claim_draft(
        $1, $2, 'Not required', 'phase3-cancel'
      ) as result`,
      [second.claim?.id, second.claim?.draftRevision],
    );
    expect(cancelled.rows[0].result.claim?.status).toBe("cancelled_draft");

    const third = await createDraft(PROJECT_ID, "Number After Cancellation");
    expect(third.claim?.claimNumber).toBe("P3-RC-03");

    const updated = await client.query<{ result: RpcResult }>(
      `select public.update_retention_claim_draft(
        $1, $2, 'Updated Retention Claim', 'Updated reference',
        '2026-06-02', '2026-07-02', false, 'phase3-update'
      ) as result`,
      [first.claim?.id, first.claim?.draftRevision],
    );
    expect(updated.rows[0].result).toMatchObject({
      succeeded: true,
      claim: { title: "Updated Retention Claim", draftRevision: 2 },
    });

    const staleEdit = await client.query<{ result: RpcResult }>(
      `select public.update_retention_claim_draft(
        $1, 1, 'Stale edit', null, null, null, false, 'phase3-stale-edit'
      ) as result`,
      [first.claim?.id],
    );
    expect(staleEdit.rows[0].result).toMatchObject({
      succeeded: false,
      errorCode: "concurrent_update",
      currentDraftRevision: 2,
    });
  });

  it("adds, updates, removes, and reorders advisory Draft allocations without consuming retention", async () => {
    const created = await createDraft(PROJECT_ID, "Allocation Editing");
    let claim = created.claim!;

    const first = await addAllocation(claim, ORIGIN_A_ID, 25);
    expect(first.succeeded).toBe(true);
    claim = first.claim!;

    const duplicate = await addAllocation(claim, ORIGIN_A_ID, 5);
    expect(duplicate.errorCode).toBe("duplicate_origin");

    const crossProject = await addAllocation(
      claim,
      CROSS_PROJECT_ORIGIN_ID,
      5,
    );
    expect(crossProject.errorCode).toBe("cross_project_origin");

    const cancelled = await addAllocation(claim, CANCELLED_ORIGIN_ID, 5);
    expect(cancelled.errorCode).toBe("origin_cancelled");

    const second = await addAllocation(claim, ORIGIN_B_ID, 20);
    claim = second.claim!;
    const firstAllocationId = first.allocationId!;
    const secondAllocationId = second.allocationId!;

    const reordered = await client.query<{ result: RpcResult }>(
      `select public.reorder_retention_claim_allocations(
        $1, $2, $3, 'phase3-reorder'
      ) as result`,
      [claim.id, claim.draftRevision, [secondAllocationId, firstAllocationId]],
    );
    expect(reordered.rows[0].result.allocations?.map(
      (row) => row.originatingPaymentClaimId,
    )).toEqual([ORIGIN_B_ID, ORIGIN_A_ID]);
    claim = reordered.rows[0].result.claim!;

    const updated = await client.query<{ result: RpcResult }>(
      `select public.update_retention_claim_allocation(
        $1, $2, 30, 'phase3-update-allocation'
      ) as result`,
      [firstAllocationId, claim.draftRevision],
    );
    expect(updated.rows[0].result.succeeded).toBe(true);
    claim = updated.rows[0].result.claim!;

    const removed = await client.query<{ result: RpcResult }>(
      `select public.remove_retention_claim_allocation(
        $1, $2, 'phase3-remove-allocation'
      ) as result`,
      [secondAllocationId, claim.draftRevision],
    );
    expect(removed.rows[0].result.succeeded).toBe(true);

    const committed = await client.query<{ total: string }>(
      `select coalesce(sum(allocation.allocation_amount), 0)::text as total
       from public.retention_claim_allocations allocation
       join public.retention_claims claim
         on claim.id = allocation.retention_claim_id
       where allocation.originating_payment_claim_id = $1
         and claim.status = 'submitted'`,
      [ORIGIN_A_ID],
    );
    expect(committed.rows[0].total).toBe("0");
  });

  it("submits a multi-origin claim atomically with exact subtotal and immutable snapshots", async () => {
    const beforeOrigins = await client.query(
      `select id, status, retention_withheld_amount, retention_released_amount,
              retention_balance, paid_amount, updated_at
       from public.project_claims
       where id = any($1::uuid[])
       order by id`,
      [[ORIGIN_A_ID, ORIGIN_B_ID]],
    );

    const created = await createDraft(PROJECT_ID, "Submitted Retention Claim");
    let claim = created.claim!;
    const first = await addAllocation(claim, ORIGIN_A_ID, 40);
    claim = first.claim!;
    const second = await addAllocation(claim, ORIGIN_B_ID, 20);
    claim = second.claim!;
    const submitted = await submitClaim(claim);

    expect(submitted).toMatchObject({
      succeeded: true,
      claim: {
        status: "submitted",
        subtotalExclTax: 60,
      },
    });
    expect(submitted.claim?.submissionStateHash)
      .toBe(claim.lastPositionStateHash);
    expect(submitted.allocations).toHaveLength(2);
    expect(submitted.allocations?.[0]).toMatchObject({
      originatingPaymentClaimId: ORIGIN_A_ID,
      existingSubmittedAllocationBefore: 0,
      remainingAfterAllocation: 60,
      originClaimNumberSnapshot: "P3-CL-01",
      retentionWithheldSnapshot: 100,
      grossClaimAmountSnapshot: 1000,
    });
    submittedClaimId = submitted.claim!.id;
    submittedStateHash = submitted.claim!.submissionStateHash!;

    const afterOrigins = await client.query(
      `select id, status, retention_withheld_amount, retention_released_amount,
              retention_balance, paid_amount, updated_at
       from public.project_claims
       where id = any($1::uuid[])
       order by id`,
      [[ORIGIN_A_ID, ORIGIN_B_ID]],
    );
    expect(afterOrigins.rows).toEqual(beforeOrigins.rows);

    await expectDatabaseError(
      () => client.query(
        "update public.retention_claims set title = 'Changed' where id = $1",
        [submittedClaimId],
      ),
      "immutable",
    );
    await expectDatabaseError(
      () => client.query(
        `update public.retention_claim_allocations
         set allocation_amount = 1
         where retention_claim_id = $1`,
        [submittedClaimId],
      ),
      "immutable",
    );
    await expectDatabaseError(
      () => client.query(
        "delete from public.retention_claims where id = $1",
        [submittedClaimId],
      ),
      "cannot be hard-deleted",
    );
  });

  it("submits a large deterministic allocation set without a 200-origin ceiling", async () => {
    const created = await createDraft(SCALE_PROJECT_ID, "Scale Submission");
    const claim = created.claim!;

    await client.query(
      `insert into public.retention_claim_allocations (
        organization_id, project_id, retention_claim_id,
        originating_payment_claim_id, allocation_sequence, allocation_amount,
        draft_origin_state_hash, draft_origin_updated_at,
        draft_origin_retention_owned, created_by
      )
      select
        origin.organization_id,
        origin.project_id,
        $1,
        origin.id,
        row_number() over (
          order by origin.claim_date, origin.created_at, origin.id
        )::integer,
        1,
        private.retention_claim_origin_state_hash(origin.id),
        origin.updated_at,
        origin.retention_withheld_amount,
        $2
      from public.project_claims origin
      where origin.project_id = $3
      order by origin.claim_date, origin.created_at, origin.id`,
      [claim.id, OWNER_ID, SCALE_PROJECT_ID],
    );

    const submitted = await submitClaim(claim);
    expect(submitted).toMatchObject({
      succeeded: true,
      claim: {
        status: "submitted",
        subtotalExclTax: 220,
      },
    });
    expect(submitted.allocations).toHaveLength(220);
  });

  it("consumes only submitted allocations and prevents over-allocation", async () => {
    const secondDraft = await createDraft(PROJECT_ID, "Final A Availability");
    let secondClaim = secondDraft.claim!;
    const exact = await addAllocation(secondClaim, ORIGIN_A_ID, 60);
    secondClaim = exact.claim!;
    const submitted = await submitClaim(secondClaim);
    expect(submitted.succeeded).toBe(true);
    expect(submitted.allocations?.[0]).toMatchObject({
      existingSubmittedAllocationBefore: 40,
      remainingAfterAllocation: 0,
    });

    const overDraft = await createDraft(PROJECT_ID, "Overallocated A");
    let overClaim = overDraft.claim!;
    const proposed = await addAllocation(overClaim, ORIGIN_A_ID, 1);
    overClaim = proposed.claim!;
    const rejected = await submitClaim(overClaim);
    expect(rejected).toMatchObject({
      succeeded: false,
      errorCode: "retention_overallocated",
    });

    const read = await readClaim(overClaim.id);
    expect(read.allocations?.[0]).toMatchObject({
      currentSubmittedAllocationTotalFromOtherClaims: 100,
      currentCommittedRetentionTotal: 100,
      currentAvailableBeforeSchedules: 0,
    });
  });

  it("rejects stale state, refreshes explicitly, and preserves earlier submitted evidence", async () => {
    const created = await createDraft(PROJECT_ID, "Stale Position");
    let claim = created.claim!;
    const added = await addAllocation(claim, ORIGIN_B_ID, 10);
    claim = added.claim!;

    const submittedSnapshotBefore = await client.query<{
      origin_claim_updated_at_snapshot: Date;
      origin_state_hash_snapshot: string;
    }>(
      `select origin_claim_updated_at_snapshot, origin_state_hash_snapshot
       from public.retention_claim_allocations
       where retention_claim_id = $1
         and originating_payment_claim_id = $2`,
      [submittedClaimId, ORIGIN_B_ID],
    );

    await client.query(
      `update public.project_claims
       set notes = 'Existing workflow persisted a later correction'
       where id = $1`,
      [ORIGIN_B_ID],
    );

    const stale = await submitClaim(claim);
    expect(stale).toMatchObject({
      succeeded: false,
      errorCode: "stale_draft",
    });
    expect(stale.details?.currentPositionStateHash).not.toBe(
      claim.lastPositionStateHash,
    );

    const refreshed = await client.query<{ result: RpcResult }>(
      `select public.update_retention_claim_draft(
        $1, $2, $3, 'stale-ref', '2026-06-01', '2026-06-30',
        true, 'phase3-refresh'
      ) as result`,
      [claim.id, claim.draftRevision, "Stale Position Refreshed"],
    );
    claim = refreshed.rows[0].result.claim!;
    expect(claim.lastPositionStateHash).not.toBe(created.claim?.lastPositionStateHash);

    const submitted = await submitClaim(claim);
    expect(submitted.succeeded).toBe(true);

    const submittedSnapshotAfter = await client.query<{
      origin_claim_updated_at_snapshot: Date;
      origin_state_hash_snapshot: string;
    }>(
      `select origin_claim_updated_at_snapshot, origin_state_hash_snapshot
       from public.retention_claim_allocations
       where retention_claim_id = $1
         and originating_payment_claim_id = $2`,
      [submittedClaimId, ORIGIN_B_ID],
    );
    expect(submittedSnapshotAfter.rows)
      .toEqual(submittedSnapshotBefore.rows);
  });

  it("blocks unresolved legacy releases while retaining an editable Draft", async () => {
    const created = await createDraft(LEGACY_PROJECT_ID, "Legacy Block");
    let claim = created.claim!;
    const added = await addAllocation(claim, LEGACY_ORIGIN_ID, 10);
    claim = added.claim!;
    const rejected = await submitClaim(claim);
    expect(rejected).toMatchObject({
      succeeded: false,
      errorCode: "unresolved_legacy_release",
    });
    expect((await readClaim(claim.id)).claim?.status).toBe("draft");
  });

  it("enforces capability, mode, internal gate, permission, and tenant isolation", async () => {
    await asUser(OWNER_ID, false);
    expect(await createDraft()).toMatchObject({
      succeeded: false,
      errorCode: "project_mode_not_supported",
    });

    await asUser(QS_ID, true);
    expect(await createDraft()).toMatchObject({
      succeeded: false,
      errorCode: "permission_denied",
    });

    await asUser(OTHER_OWNER_ID, true);
    expect(await readClaim(submittedClaimId)).toMatchObject({
      succeeded: false,
      errorCode: "claim_not_found",
    });

    await asUser(OWNER_ID, true);
    await client.query(
      `update public.organization_capabilities
       set enabled = false, enabled_by = null, enabled_at = null,
           disabled_by = $2, disabled_at = now()
       where organization_id = $1
         and capability_key = 'retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    expect(await createDraft()).toMatchObject({
      succeeded: false,
      errorCode: "capability_disabled",
    });
    await client.query(
      `update public.organization_capabilities
       set enabled = true, enabled_by = $2, enabled_at = now(),
           disabled_by = null, disabled_at = null
       where organization_id = $1
         and capability_key = 'retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
  });

  it("cancellation removes advisory allocations and releases their origin FK", async () => {
    const created = await createDraft(PROJECT_ID, "Cancellation Cleanup");
    let claim = created.claim!;
    const added = await addAllocation(claim, ORIGIN_B_ID, 1);
    claim = added.claim!;

    const cancelled = await client.query<{ result: RpcResult }>(
      `select public.cancel_retention_claim_draft(
        $1, $2, 'Cancelled safely', 'phase3-cancel-cleanup'
      ) as result`,
      [claim.id, claim.draftRevision],
    );
    expect(cancelled.rows[0].result.claim?.status).toBe("cancelled_draft");
    const allocations = await client.query<{ count: string }>(
      `select count(*)::text as count
       from public.retention_claim_allocations
       where retention_claim_id = $1`,
      [claim.id],
    );
    expect(allocations.rows[0].count).toBe("0");
  });

  it("denies direct table writes, keeps events append-only, and preserves submitted origin history", async () => {
    await asUser(OWNER_ID, true);
    await client.query("set local role authenticated");
    await expectDatabaseError(
      () => client.query(
        `insert into public.retention_claims (
          organization_id, project_id, claim_number, title, created_by
        ) values ($1, $2, 'DIRECT-RC-01', 'Direct', $3)`,
        [ORGANIZATION_ID, PROJECT_ID, OWNER_ID],
      ),
      "permission denied",
    );
    await client.query("reset role");

    await expectDatabaseError(
      () => client.query(
        `update public.retention_claim_events
         set reason = 'Changed'
         where retention_claim_id = $1`,
        [submittedClaimId],
      ),
      "append-only",
    );
    await expectDatabaseError(
      () => client.query(
        "delete from public.project_claims where id = $1",
        [ORIGIN_A_ID],
      ),
      "violates foreign key constraint",
    );

    const events = await client.query<{ result: RpcResult }>(
      "select public.get_retention_claim_events($1, 200) as result",
      [submittedClaimId],
    );
    expect(events.rows[0].result.events?.map((event) => event.eventType))
      .toEqual(expect.arrayContaining([
        "claim_created",
        "allocation_added",
        "claim_submitted",
      ]));
    expect(
      (await readClaim(submittedClaimId)).claim?.submissionStateHash,
    ).toBe(submittedStateHash);
  });
});
