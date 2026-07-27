import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE8_DB_URL
  ?? process.env.RETENTION_PHASE7_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "a8000000-0000-4000-8000-000000000001";
const OTHER_OWNER_ID = "a8000000-0000-4000-8000-000000000002";
const ORGANIZATION_ID = "a8000000-0000-4000-8000-000000000010";
const OTHER_ORGANIZATION_ID = "a8000000-0000-4000-8000-000000000011";
const PROJECT_ID = "a8000000-0000-4000-8000-000000000100";
const OTHER_PROJECT_ID = "a8000000-0000-4000-8000-000000000101";
const ORIGIN_ID = "a8000000-0000-4000-8000-000000001001";
const CLAIM_ID = "a8000000-0000-4000-8000-000000002001";
const ALLOCATION_ID = "a8000000-0000-4000-8000-000000003001";
const STATE_HASH = "a".repeat(64);
const ELIGIBILITY_HASH = "b".repeat(64);
const PDF_HASH = "c".repeat(64);

type Result = {
  succeeded: boolean;
  errorCode: string | null;
  sourceEvidenceHash?: string;
  source?: {
    schemaVersion: number;
    claim: Record<string, unknown>;
    allocations: Array<Record<string, unknown>>;
  };
  created?: boolean;
  reused?: boolean;
  document?: Record<string, unknown> | null;
};

describeDatabase("Phase 8 Retention Claim document database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });
  let sourceHash = "";
  let storagePath = "";

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await seed();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function asUser(userId: string | null, phase8Gate: boolean) {
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId ?? "",
    ]);
    await client.query("select set_config('request.jwt.claim.role',$1,true)", [
      userId ? "authenticated" : "",
    ]);
    await client.query(
      "select set_config('request.jwt.claim.retention_phase8_internal',$1,true)",
      [phase8Gate ? "true" : "false"],
    );
  }

  async function asService() {
    await client.query("select set_config('request.jwt.claim.sub','',true)");
    await client.query(
      "select set_config('request.jwt.claim.role','service_role',true)",
    );
  }

  async function rpc(sql: string, params: unknown[] = []) {
    const result = await client.query<{ result: Result }>(sql, params);
    return result.rows[0].result;
  }

  async function expectDatabaseError(
    action: () => Promise<unknown>,
    message: string,
  ) {
    await client.query("savepoint phase8_expected_error");
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    await client.query("rollback to savepoint phase8_expected_error");
    await client.query("release savepoint phase8_expected_error");
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
         'authenticated','phase8-owner@example.test','',now(),'{}','{}'),
        ($2,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','phase8-other@example.test','',now(),'{}','{}')`,
      [OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      "delete from public.organizations where created_by=any($1::uuid[])",
      [[OWNER_ID, OTHER_OWNER_ID]],
    );
    await client.query(
      `insert into public.organizations(id,name,created_by)
       values ($1,'Phase 8',$3),($2,'Phase 8 Other',$4)`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_members
        (organization_id,user_id,role,display_name)
       values ($1,$3,'owner','Owner'),($2,$4,'owner','Other')`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_projects
        (id,organization_id,created_by,name,slug,project_code)
       values
        ($1,$3,$5,'Documents','phase8-documents','P8'),
        ($2,$4,$6,'Other','phase8-other','P8-O')`,
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
        ($1,$2,$3,$4,'P8-PC-01','Retention origin','Progress','Submitted',
         '2026-01-15','2026-02-15',1000,'flat',10,100,0,100,0,100,
         900,135,1035,'2026-01-15T00:00:00Z','2026-01-15T01:00:00Z')`,
      [ORIGIN_ID, ORGANIZATION_ID, PROJECT_ID, OWNER_ID],
    );
    await client.query(
      `insert into public.retention_claims(
        id,organization_id,project_id,claim_number,title,status,
        subtotal_excl_tax,draft_revision,last_position_state_hash,
        created_by,created_at,updated_at
      ) values (
        $1,$2,$3,'RC-P8-001','Submitted retention','draft',
        0,2,$4,$5,'2026-07-20T00:00:00Z','2026-07-20T00:00:00Z'
      )`,
      [CLAIM_ID, ORGANIZATION_ID, PROJECT_ID, STATE_HASH, OWNER_ID],
    );
    await client.query(
      `insert into public.retention_claim_allocations(
        id,organization_id,project_id,retention_claim_id,
        originating_payment_claim_id,allocation_sequence,allocation_amount,
        draft_origin_state_hash,draft_origin_updated_at,
        draft_origin_retention_owned,origin_claim_number_snapshot,
        origin_claim_date_snapshot,origin_claim_status_snapshot,
        origin_claim_created_at_snapshot,origin_claim_updated_at_snapshot,
        retention_method_snapshot,retention_rate_snapshot,
        retention_withheld_snapshot,retention_released_snapshot,
        retention_held_to_date_snapshot,retention_released_to_date_snapshot,
        retention_balance_snapshot,existing_submitted_allocation_before,
        remaining_after_allocation,gross_claim_amount_snapshot,
        net_claim_excl_gst_snapshot,gst_amount_snapshot,total_payable_snapshot,
        project_state_hash_snapshot,origin_state_hash_snapshot,
        eligibility_state_hash_snapshot,eligibility_schedule_ids_snapshot,
        submitted_by,submitted_at,created_by,created_at,updated_at
      ) values (
        $1,$2,$3,$4,$5,1,40,$6,'2026-01-15T01:00:00Z',
        100,'P8-PC-01','2026-01-15','Submitted',
        '2026-01-15T00:00:00Z','2026-01-15T01:00:00Z',
        'flat',10,100,0,100,0,100,0,60,1000,900,135,1035,
        $6,$6,$7,'{}'::uuid[],$8,'2026-07-21T02:30:00Z',$8,
        '2026-07-20T00:00:00Z','2026-07-21T02:30:00Z'
      )`,
      [
        ALLOCATION_ID,
        ORGANIZATION_ID,
        PROJECT_ID,
        CLAIM_ID,
        ORIGIN_ID,
        STATE_HASH,
        ELIGIBILITY_HASH,
        OWNER_ID,
      ],
    );
    await client.query(
      "select set_config('app.retention_phase4_submission_write','true',true)",
    );
    await client.query(
      `update public.retention_claims set
        status='submitted',subtotal_excl_tax=40,
        submission_state_hash=$2,
        submission_eligibility_state_hash=$3,
        submitted_by=$4,submitted_at='2026-07-21T02:30:00Z'
       where id=$1`,
      [CLAIM_ID, STATE_HASH, ELIGIBILITY_HASH, OWNER_ID],
    );
    await client.query(
      "select set_config('app.retention_phase4_submission_write','false',true)",
    );
  }

  it("keeps generation closed without the Phase 8 internal gate", async () => {
    await asUser(OWNER_ID, false);
    expect(
      await rpc(
        "select public.get_retention_claim_document_source($1) result",
        [CLAIM_ID],
      ),
    ).toMatchObject({
      succeeded: false,
      errorCode: "project_mode_not_supported",
    });
  });

  it("returns deterministic canonical submitted evidence", async () => {
    await asUser(OWNER_ID, true);
    const first = await rpc(
      "select public.get_retention_claim_document_source($1) result",
      [CLAIM_ID],
    );
    const second = await rpc(
      "select public.get_retention_claim_document_source($1) result",
      [CLAIM_ID],
    );
    expect(first).toEqual(second);
    expect(first.sourceEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.source).toMatchObject({
      schemaVersion: 1,
      claim: {
        id: CLAIM_ID,
        claimNumber: "RC-P8-001",
        status: "submitted",
        subtotalExclTax: 40,
        submissionStateHash: STATE_HASH,
      },
      allocations: [
        {
          id: ALLOCATION_ID,
          originatingPaymentClaimId: ORIGIN_ID,
          allocationAmount: 40,
          originClaimNumberSnapshot: "P8-PC-01",
          originRetentionOwnedSnapshot: 100,
          remainingAfterAllocation: 60,
        },
      ],
    });
    sourceHash = first.sourceEvidenceHash!;
    storagePath =
      `${ORGANIZATION_ID}/${PROJECT_ID}/${CLAIM_ID}/${sourceHash}.pdf`;
  });

  it("rejects direct authenticated document evidence writes", async () => {
    await asUser(OWNER_ID, true);
    expect(
      await rpc(
        "select public.record_retention_claim_document($1,$2,$3,$4,$5,$6,$7,$8) result",
        [
          CLAIM_ID,
          sourceHash,
          PDF_HASH,
          "Retention-Claim-RC-P8-001.pdf",
          storagePath,
          1234,
          { schemaVersion: 1 },
          OWNER_ID,
        ],
      ),
    ).toMatchObject({ succeeded: false, errorCode: "permission_denied" });
  });

  it("records one idempotent immutable document and one event", async () => {
    await asService();
    const params = [
      CLAIM_ID,
      sourceHash,
      PDF_HASH,
      "Retention-Claim-RC-P8-001.pdf",
      storagePath,
      1234,
      { schemaVersion: 1, claimNumber: "RC-P8-001" },
      OWNER_ID,
    ];
    const created = await rpc(
      "select public.record_retention_claim_document($1,$2,$3,$4,$5,$6,$7,$8) result",
      params,
    );
    expect(created).toMatchObject({
      succeeded: true,
      created: true,
      reused: false,
      document: {
        retention_claim_id: CLAIM_ID,
        source_evidence_hash: sourceHash,
        pdf_sha256: PDF_HASH,
        storage_path: storagePath,
        byte_length: 1234,
      },
    });
    const replay = await rpc(
      "select public.record_retention_claim_document($1,$2,$3,$4,$5,$6,$7,$8) result",
      params,
    );
    expect(replay).toMatchObject({
      succeeded: true,
      created: false,
      reused: true,
    });
    const counts = await client.query<{
      documents: string;
      events: string;
    }>(
      `select
        (select count(*) from public.retention_claim_documents
          where retention_claim_id=$1) documents,
        (select count(*) from public.retention_claim_document_events
          where retention_claim_id=$1) events`,
      [CLAIM_ID],
    );
    expect(counts.rows[0]).toEqual({ documents: "1", events: "1" });
  });

  it("rejects stale sources, conflicting bytes and invalid paths", async () => {
    await asService();
    expect(
      await rpc(
        "select public.record_retention_claim_document($1,$2,$3,$4,$5,$6,$7,$8) result",
        [
          CLAIM_ID,
          "d".repeat(64),
          PDF_HASH,
          "Retention.pdf",
          storagePath,
          1234,
          {},
          OWNER_ID,
        ],
      ),
    ).toMatchObject({
      succeeded: false,
      errorCode: "stale_document_source",
    });
    expect(
      await rpc(
        "select public.record_retention_claim_document($1,$2,$3,$4,$5,$6,$7,$8) result",
        [
          CLAIM_ID,
          sourceHash,
          "e".repeat(64),
          "Retention-Claim-RC-P8-001.pdf",
          storagePath,
          1234,
          {},
          OWNER_ID,
        ],
      ),
    ).toMatchObject({
      succeeded: false,
      errorCode: "document_conflict",
    });
    expect(
      await rpc(
        "select public.record_retention_claim_document($1,$2,$3,$4,$5,$6,$7,$8) result",
        [
          CLAIM_ID,
          sourceHash,
          PDF_HASH,
          "Retention.pdf",
          "wrong/path.pdf",
          1234,
          {},
          OWNER_ID,
        ],
      ),
    ).toMatchObject({
      succeeded: false,
      errorCode: "invalid_document_evidence",
    });
  });

  it("allows permissioned reads without the generation gate and denies other tenants", async () => {
    await asUser(OWNER_ID, false);
    expect(
      await rpc(
        "select public.get_retention_claim_document($1) result",
        [CLAIM_ID],
      ),
    ).toMatchObject({
      succeeded: true,
      document: {
        retention_claim_id: CLAIM_ID,
        pdf_sha256: PDF_HASH,
      },
    });
    await asUser(OTHER_OWNER_ID, true);
    expect(
      await rpc(
        "select public.get_retention_claim_document($1) result",
        [CLAIM_ID],
      ),
    ).toMatchObject({
      succeeded: false,
      errorCode: "document_not_found",
    });
  });

  it("enforces append-only document and event evidence", async () => {
    await asUser(OWNER_ID, true);
    await expectDatabaseError(
      () =>
        client.query(
          "update public.retention_claim_documents set file_name='changed.pdf' where retention_claim_id=$1",
          [CLAIM_ID],
        ),
      "Retention Claim document evidence is append-only.",
    );
    await expectDatabaseError(
      () =>
        client.query(
          "delete from public.retention_claim_document_events where retention_claim_id=$1",
          [CLAIM_ID],
        ),
      "Retention Claim document events are append-only.",
    );
  });

  it("does not modify Payment Claim or submitted Retention Claim evidence", async () => {
    const result = await client.query<{
      retention_withheld_amount: string;
      retention_released_amount: string;
      retention_balance: string;
      claim_status: string;
      subtotal_excl_tax: string;
    }>(
      `select p.retention_withheld_amount,p.retention_released_amount,
        p.retention_balance,c.status claim_status,c.subtotal_excl_tax
       from public.project_claims p
       join public.retention_claims c on c.id=$2
       where p.id=$1`,
      [ORIGIN_ID, CLAIM_ID],
    );
    expect(result.rows[0]).toEqual({
      retention_withheld_amount: "100.00",
      retention_released_amount: "0.00",
      retention_balance: "100.00",
      claim_status: "submitted",
      subtotal_excl_tax: "40.00",
    });
  });
});
