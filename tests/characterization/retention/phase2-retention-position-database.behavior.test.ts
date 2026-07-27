import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE2_DB_URL
  ?? process.env.RETENTION_PHASE1_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "e2000000-0000-4000-8000-000000000001";
const WORKER_ID = "e2000000-0000-4000-8000-000000000002";
const OTHER_OWNER_ID = "e2000000-0000-4000-8000-000000000003";
const ORGANIZATION_ID = "e2000000-0000-4000-8000-000000000010";
const OTHER_ORGANIZATION_ID = "e2000000-0000-4000-8000-000000000011";
const PROJECT_ID = "e2000000-0000-4000-8000-000000000100";
const PAGINATION_PROJECT_ID = "e2000000-0000-4000-8000-000000000101";
const DISABLED_PROJECT_ID = "e2000000-0000-4000-8000-000000000102";
const OTHER_PROJECT_ID = "e2000000-0000-4000-8000-000000000103";

type Summary = {
  accessState: string;
  observationEligible: boolean;
  capabilityEnabled?: boolean;
  workflowMode?: string;
  paymentClaimCount?: number;
  retentionOriginCount?: number;
  legacyReleaseClaimCount?: number;
  negativeRetentionBalanceClaimCount?: number;
  cancelledClaimCount?: number;
  totalRetentionWithheld?: number;
  totalLegacyRetentionReleased?: number;
  movementDerivedRetentionBalance?: number;
  latestPersistedCumulativeRetentionBalance?: number;
  legacyReconciliationRequired?: boolean;
  legacyReleaseOrigins?: Array<{
    paymentClaimId: string;
    retentionReleasedAmount: number;
  }>;
  diagnostics?: Array<{ code: string; severity: string }>;
  stateHash?: string;
};

type Page = {
  accessState: string;
  pageSize?: number;
  hasMore: boolean;
  nextCursor?: {
    claimDate: string | null;
    createdAt: string;
    paymentClaimId: string;
  } | null;
  origins: Array<{
    paymentClaimId: string;
    claimNumber: string;
    claimDate: string | null;
    status: string;
    chronologicalSequence: number;
    retentionMethod: string;
    retentionRate: number;
    retentionScaleBands: unknown;
    retentionWithheldAmount: number;
    retentionReleasedAmount: number;
    retentionBalance: number;
    grossClaimAmount: number;
    originatedPositiveRetention: boolean;
    originatedRetentionAmount: number;
    containsLegacyRelease: boolean;
    cancelled: boolean;
    internallyInconsistent: boolean;
    eligibleForFutureRetentionAnalysis: boolean;
    diagnostics: Array<{ code: string; severity: string }>;
  }>;
};

describeDatabase("Retention Position Phase 2 database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await seedIdentityAndProjects();
    await seedCanonicalClaims();
    await seedPaginationClaims();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function asUser(userId: string | null) {
    await client.query(
      "select set_config('request.jwt.claim.sub', $1, true)",
      [userId ?? ""],
    );
    await client.query(
      "select set_config('request.jwt.claim.role', $1, true)",
      [userId ? "authenticated" : ""],
    );
  }

  async function readSummary(projectId = PROJECT_ID) {
    const result = await client.query<{ result: Summary }>(
      "select public.get_project_retention_position_summary($1) as result",
      [projectId],
    );
    return result.rows[0].result;
  }

  async function readPage(input: {
    projectId?: string;
    pageSize?: number;
    after?: Page["nextCursor"];
    statuses?: string[];
    positiveRetention?: boolean;
    legacyRelease?: boolean;
    diagnosticCodes?: string[];
  } = {}) {
    const result = await client.query<{ result: Page }>(
      `select public.get_project_retention_position_page(
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) as result`,
      [
        input.projectId ?? PROJECT_ID,
        input.pageSize ?? 50,
        input.after?.claimDate ?? null,
        input.after?.createdAt ?? null,
        input.after?.paymentClaimId ?? null,
        input.statuses ?? null,
        input.positiveRetention ?? null,
        input.legacyRelease ?? null,
        input.diagnosticCodes ?? null,
      ],
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
         'authenticated', 'retention-phase2-owner@example.test', '', now(),
         '{}'::jsonb, '{}'::jsonb),
        ($2, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'retention-phase2-worker@example.test', '', now(),
         '{}'::jsonb, '{}'::jsonb),
        ($3, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'retention-phase2-other@example.test', '', now(),
         '{}'::jsonb, '{}'::jsonb)`,
      [OWNER_ID, WORKER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[OWNER_ID, WORKER_ID, OTHER_OWNER_ID]],
    );
    await client.query(
      `insert into public.organizations (id, name, created_by)
       values
        ($1, 'Retention Phase 2', $3),
        ($2, 'Retention Phase 2 Other', $4)`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_members
        (organization_id, user_id, role, display_name)
       values
        ($1, $3, 'owner', 'Retention Owner'),
        ($1, $4, 'worker', 'Retention Worker'),
        ($2, $5, 'owner', 'Other Retention Owner')`,
      [
        ORGANIZATION_ID,
        OTHER_ORGANIZATION_ID,
        OWNER_ID,
        WORKER_ID,
        OTHER_OWNER_ID,
      ],
    );
    await client.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, project_code)
       values
        ($1, $5, $7, 'Canonical Retention Position', 'retention-position', 'RET-P2'),
        ($2, $5, $7, 'Paginated Retention Position', 'retention-position-pages', 'RET-P2-P'),
        ($3, $5, $7, 'Disabled Retention Position', 'retention-position-disabled', 'RET-P2-D'),
        ($4, $6, $8, 'Other Retention Position', 'retention-position-other', 'RET-P2-O')`,
      [
        PROJECT_ID,
        PAGINATION_PROJECT_ID,
        DISABLED_PROJECT_ID,
        OTHER_PROJECT_ID,
        ORGANIZATION_ID,
        OTHER_ORGANIZATION_ID,
        OWNER_ID,
        OTHER_OWNER_ID,
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
      [ORGANIZATION_ID, OWNER_ID, [PROJECT_ID, PAGINATION_PROJECT_ID]],
    );
    await asUser(OWNER_ID);
  }

  async function seedCanonicalClaims() {
    await client.query(
      `insert into public.project_claims (
        id, organization_id, project_id, created_by, claim_number, claim_title,
        claim_type, status, claim_date, due_date, claim_amount,
        linked_approved_variations, retention_method, retention_percent,
        retention_scale_bands, retention_withheld_amount,
        retention_released_amount, retention_held_to_date,
        retention_released_to_date, retention_balance, net_claim_excl_gst,
        gst_amount, total_payable, created_at, updated_at
      ) values
        ('e2000000-0000-4000-8000-000000001001', $1, $2, $3,
         'PC-001', 'Flat retention', 'Progress', 'Submitted',
         '2026-01-10', '2026-02-10', 1000, 0, 'flat', 10, null,
         100, 0, 100, 0, 100, 900, 135, 1035,
         '2026-01-10T01:00:00Z', '2026-01-10T02:00:00Z'),
        ('e2000000-0000-4000-8000-000000001002', $1, $2, $3,
         'PC-002', 'Sliding retention with approved variation', 'Progress', 'Paid',
         '2026-02-10', '2026-03-10', 700, 200, 'sliding_scale', 7.5,
         '[{"upTo":1000,"rate":10},{"above":1000,"rate":5}]'::jsonb,
         50, 20, 150, 20, 130, 670, 100.50, 770.50,
         '2026-02-10T01:00:00Z', '2026-02-10T02:00:00Z'),
        ('e2000000-0000-4000-8000-000000001003', $1, $2, $3,
         'PC-003', 'Cancelled retained snapshot', 'Progress', 'Cancelled',
         '2026-03-10', '2026-04-10', 999, 0, 'flat', 10, null,
         999, 1, 150, 20, 130, 1, 0.15, 1.15,
         '2026-03-10T01:00:00Z', '2026-03-10T02:00:00Z'),
        ('e2000000-0000-4000-8000-000000001004', $1, $2, $3,
         'PC-004', 'Legacy retention release', 'Final', 'Unpaid',
         '2026-04-10', '2026-05-10', 0, 0, 'flat', 0, null,
         0, 200, 150, 220, -70, 200, 30, 230,
         '2026-04-10T01:00:00Z', '2026-04-10T02:00:00Z'),
        ('e2000000-0000-4000-8000-000000001005', $1, $2, $3,
         'PC-005', 'Persisted mismatch', 'Final', 'Submitted',
         null, null, 0, 0, 'flat', 0, null,
         0, 0, 150, 220, -69, 0, 0, 0,
         '2026-05-10T01:00:00Z', '2026-05-10T02:00:00Z')`,
      [ORGANIZATION_ID, PROJECT_ID, OWNER_ID],
    );
  }

  async function seedPaginationClaims() {
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
        'PAGE-' || lpad(series::text, 3, '0'),
        'Pagination claim ' || series,
        'Progress', 'Submitted', date '2025-01-01' + (series - 1),
        10, 'flat', 10, 1, 0, series, 0, series,
        9, 1.35, 10.35,
        timestamptz '2025-01-01T00:00:00Z' + ((series - 1) || ' days')::interval,
        timestamptz '2025-01-01T01:00:00Z' + ((series - 1) || ' days')::interval
      from generate_series(1, 205) series`,
      [ORGANIZATION_ID, PAGINATION_PROJECT_ID, OWNER_ID],
    );
  }

  it("returns the complete persisted project position and stable diagnostics", async () => {
    const summary = await readSummary();
    expect(summary).toMatchObject({
      accessState: "available",
      observationEligible: true,
      capabilityEnabled: true,
      workflowMode: "observe",
      paymentClaimCount: 5,
      retentionOriginCount: 2,
      legacyReleaseClaimCount: 2,
      negativeRetentionBalanceClaimCount: 2,
      cancelledClaimCount: 1,
      totalRetentionWithheld: 150,
      totalLegacyRetentionReleased: 220,
      movementDerivedRetentionBalance: -70,
      latestPersistedCumulativeRetentionBalance: -69,
      legacyReconciliationRequired: true,
    });
    expect(summary.legacyReleaseOrigins).toEqual([
      {
        paymentClaimId: "e2000000-0000-4000-8000-000000001002",
        retentionReleasedAmount: 20,
        claimNumber: "PC-002",
        claimDate: "2026-02-10",
        effectiveDate: "2026-02-10",
        chronologicalSequence: 2,
      },
      {
        paymentClaimId: "e2000000-0000-4000-8000-000000001004",
        retentionReleasedAmount: 200,
        claimNumber: "PC-004",
        claimDate: "2026-04-10",
        effectiveDate: "2026-04-10",
        chronologicalSequence: 4,
      },
    ]);
    expect(summary.diagnostics?.map((item) => [item.code, item.severity]))
      .toEqual(expect.arrayContaining([
        ["cancelled_claim_has_retention_movement", "warning"],
        ["cumulative_snapshot_mismatch", "blocking_for_future_cutover"],
        ["latest_cumulative_snapshot_mismatch", "blocking_for_future_cutover"],
        ["legacy_reconciliation_required", "warning"],
        ["legacy_releases_exceed_held", "blocking_for_future_cutover"],
        ["missing_claim_date", "info"],
        ["negative_project_retention_balance", "blocking_for_future_cutover"],
      ]));
    expect(summary.stateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns persisted flat/sliding values and classifications without allocating releases", async () => {
    const page = await readPage();
    expect(page.origins.map((origin) => origin.claimNumber)).toEqual([
      "PC-001",
      "PC-002",
      "PC-003",
      "PC-004",
      "PC-005",
    ]);
    expect(page.origins[0]).toMatchObject({
      chronologicalSequence: 1,
      retentionMethod: "flat",
      retentionRate: 10,
      retentionWithheldAmount: 100,
      originatedPositiveRetention: true,
      originatedRetentionAmount: 100,
      grossClaimAmount: 1000,
    });
    expect(page.origins[1]).toMatchObject({
      retentionMethod: "sliding_scale",
      retentionWithheldAmount: 50,
      retentionReleasedAmount: 20,
      containsLegacyRelease: true,
      grossClaimAmount: 700,
    });
    expect(page.origins[1].retentionScaleBands).toEqual([
      { rate: 10, upTo: 1000 },
      { above: 1000, rate: 5 },
    ]);
    expect(page.origins[2]).toMatchObject({
      cancelled: true,
      eligibleForFutureRetentionAnalysis: false,
    });
    expect(page.origins[3].diagnostics).toEqual(expect.arrayContaining([
      {
        code: "legacy_release_exceeds_held_at_sequence",
        severity: "blocking_for_future_cutover",
      },
      {
        code: "negative_claim_retention_balance",
        severity: "blocking_for_future_cutover",
      },
    ]));
  });

  it("supports deterministic keyset pagination beyond 200 claims with page-independent totals", async () => {
    const summary = await readSummary(PAGINATION_PROJECT_ID);
    expect(summary).toMatchObject({
      paymentClaimCount: 205,
      retentionOriginCount: 205,
      totalRetentionWithheld: 205,
      movementDerivedRetentionBalance: 205,
    });

    const first = await readPage({
      projectId: PAGINATION_PROJECT_ID,
      pageSize: 200,
    });
    expect(first.origins).toHaveLength(200);
    expect(first.hasMore).toBe(true);
    expect(first.origins[0]).toMatchObject({
      claimNumber: "PAGE-001",
      chronologicalSequence: 1,
    });
    expect(first.origins[199]).toMatchObject({
      claimNumber: "PAGE-200",
      chronologicalSequence: 200,
    });

    const second = await readPage({
      projectId: PAGINATION_PROJECT_ID,
      pageSize: 200,
      after: first.nextCursor,
    });
    expect(second.origins).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(second.origins.map((origin) => origin.claimNumber)).toEqual([
      "PAGE-201",
      "PAGE-202",
      "PAGE-203",
      "PAGE-204",
      "PAGE-205",
    ]);
    expect((await readSummary(PAGINATION_PROJECT_ID)).totalRetentionWithheld)
      .toBe(205);
  });

  it("filters by status, positive retention, legacy release, and diagnostics", async () => {
    expect((await readPage({ statuses: ["Cancelled"] })).origins)
      .toHaveLength(1);
    expect((await readPage({ positiveRetention: true })).origins
      .map((origin) => origin.claimNumber)).toEqual([
        "PC-001",
        "PC-002",
        "PC-003",
      ]);
    expect((await readPage({ legacyRelease: true })).origins
      .map((origin) => origin.claimNumber)).toEqual([
        "PC-002",
        "PC-003",
        "PC-004",
      ]);
    expect((await readPage({
      diagnosticCodes: ["cumulative_snapshot_mismatch"],
    })).origins.map((origin) => origin.claimNumber)).toEqual(["PC-005"]);
  });

  it("gates disabled, legacy, unauthorized, cross-tenant, and missing-project reads", async () => {
    await client.query(
      `update public.project_retention_workflow_states
       set mode = 'observe', changed_by = $2, changed_at = now()
       where project_id = $1`,
      [DISABLED_PROJECT_ID, OWNER_ID],
    );
    await client.query(
      `update public.organization_capabilities
       set enabled = false, enabled_by = null, enabled_at = null,
           disabled_by = $2, disabled_at = now()
       where organization_id = $1
         and capability_key = 'retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    expect(await readSummary(DISABLED_PROJECT_ID)).toMatchObject({
      accessState: "capability_disabled",
      observationEligible: false,
    });

    await client.query(
      `update public.organization_capabilities
       set enabled = true, enabled_by = $2, enabled_at = now(),
           disabled_by = null, disabled_at = null
       where organization_id = $1
         and capability_key = 'retention_management'`,
      [ORGANIZATION_ID, OWNER_ID],
    );
    expect(await readSummary(DISABLED_PROJECT_ID)).toMatchObject({
      accessState: "available",
      workflowMode: "observe",
    });
    await client.query(
      `update public.project_retention_workflow_states
       set mode = 'legacy', changed_by = $2, changed_at = now()
       where project_id = $1`,
      [DISABLED_PROJECT_ID, OWNER_ID],
    );
    expect(await readSummary(DISABLED_PROJECT_ID)).toMatchObject({
      accessState: "legacy_mode",
      observationEligible: false,
    });

    await asUser(WORKER_ID);
    expect(await readSummary(PROJECT_ID)).toMatchObject({
      accessState: "permission_denied",
      observationEligible: false,
    });
    await asUser(OTHER_OWNER_ID);
    expect(await readSummary(PROJECT_ID)).toMatchObject({
      accessState: "not_found_or_denied",
      observationEligible: false,
    });
    await asUser(OWNER_ID);
    expect(await readSummary("e2000000-0000-4000-8000-000000009999"))
      .toMatchObject({
        accessState: "not_found_or_denied",
        observationEligible: false,
      });
    await asUser(null);
    expect(await readSummary(PROJECT_ID)).toMatchObject({
      accessState: "not_found_or_denied",
      observationEligible: false,
    });
    await asUser(OWNER_ID);
  });

  it("produces a deterministic state hash and changes only with relevant read state", async () => {
    const first = await readSummary();
    const identical = await readSummary();
    expect(identical.stateHash).toBe(first.stateHash);

    await client.query(
      `update public.organization_projects
       set name = 'Presentation-only project rename'
       where id = $1`,
      [PROJECT_ID],
    );
    expect((await readSummary()).stateHash).toBe(first.stateHash);

    await client.query(
      `update public.project_claims
       set retention_withheld_amount = retention_withheld_amount + 1,
           retention_held_to_date = retention_held_to_date + 1,
           retention_balance = retention_balance + 1
       where organization_id = $1
         and project_id = $2`,
      [ORGANIZATION_ID, PROJECT_ID],
    );
    const changed = await readSummary();
    expect(changed.stateHash).not.toBe(first.stateHash);
    expect(changed.movementDerivedRetentionBalance).toBe(-66);
  });

  it("does not write Payment Claims or alter existing direct-table grants", async () => {
    const before = await client.query<{
      id: string;
      updated_at: Date;
      retention_withheld_amount: string;
    }>(
      `select id, updated_at, retention_withheld_amount
       from public.project_claims
       where project_id = $1
       order by id`,
      [PAGINATION_PROJECT_ID],
    );
    await readSummary(PAGINATION_PROJECT_ID);
    await readPage({
      projectId: PAGINATION_PROJECT_ID,
      pageSize: 17,
      positiveRetention: true,
    });
    const after = await client.query<{
      id: string;
      updated_at: Date;
      retention_withheld_amount: string;
    }>(
      `select id, updated_at, retention_withheld_amount
       from public.project_claims
       where project_id = $1
       order by id`,
      [PAGINATION_PROJECT_ID],
    );
    expect(after.rows).toEqual(before.rows);

    const grant = await client.query<{ may_update: boolean }>(
      `select has_table_privilege(
        'authenticated', 'public.project_claims', 'UPDATE'
      ) as may_update`,
    );
    expect(grant.rows[0].may_update).toBe(true);
  });
});
